const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, openSettings } = require('./ui-helpers.cjs');

async function menuItem(desktop, id, click = false) {
  return desktop.evaluate(({ Menu }, { id, click }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!item) return null;
    if (click) item.click();
    return { enabled: item.enabled, checked: item.checked };
  }, { id, click });
}

test('native New album creates an album and updates album-only menu commands', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    expect(await menuItem(desktop, 'add-photos')).toMatchObject({ enabled: false });
    await menuItem(desktop, 'new-album', true);
    await expect(page.locator('dialog.dlg .dlg-input')).toBeVisible();
    await page.locator('.dlg-input').fill('From the menu');
    await page.locator('dialog [value=ok]').click();
    await expect(page.locator('.album-page .title')).toHaveText('From the menu');
    await expect.poll(() => menuItem(desktop, 'add-photos')).toMatchObject({ enabled: true });
    await menuItem(desktop, 'export-pdf', true);
    await expect(page.locator('dialog.pdf-export')).toBeVisible();
  } finally { await fixture.close(); }
});

test('native appearance, thumbnail size and Settings commands use the page preferences', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Preferences', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect.poll(() => menuItem(desktop, 'density-l')).toMatchObject({ enabled: true });
    await menuItem(desktop, 'density-l', true);
    await expect(page.locator('.album-page')).toHaveAttribute('data-density', 'l');
    await menuItem(desktop, 'appearance-dark', true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => menuItem(desktop, 'appearance-dark')).toMatchObject({ checked: true });
    await page.reload();
    await expect(page.locator('.album-page')).toHaveAttribute('data-density', 'l');
    await menuItem(desktop, 'settings', true);
    await expect(page.locator('dialog.settings')).toBeVisible();
    await menuItem(desktop, 'appearance-light', true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.settings [data-theme-mode=light]')).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.close(); }
});

test('keyboard help is reachable from question mark, Settings and the native help menu', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    await page.keyboard.press('?');
    await expect(page.locator('dialog.shortcuts')).toBeVisible();
    await expect(page.locator('#shortcuts-title')).toBeInViewport();
    await expect(page.locator('.shortcuts h4')).toHaveText(['Global', 'Album', 'Selection', 'Photo viewer', '3D']);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.shortcuts')).toHaveCount(0);
    const settings = await openSettings(page);
    await settings.locator('[data-act=shortcuts]').click();
    await expect(page.locator('dialog.shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.shortcuts')).toHaveCount(0);
    await menuItem(desktop, 'shortcuts', true);
    await expect(page.locator('dialog.shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.shortcuts')).toHaveCount(0);
    await page.locator('.nav [data-act=settings]').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
    });
    await page.keyboard.press('?');
    await expect(page.locator('dialog.shortcuts')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('native file commands work after user activation expires, including navigation to the folder picker', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Picker', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.waitForTimeout(6000); // The menu must supply activation, not borrow Playwright's last action.
    let chooser = page.waitForEvent('filechooser', { timeout: 5000 });
    await menuItem(desktop, 'add-photos', true);
    await (await chooser).setFiles([]);
    chooser = page.waitForEvent('filechooser', { timeout: 5000 });
    await menuItem(desktop, 'import-folder', true);
    expect(await (await chooser).element().getAttribute('webkitdirectory')).toBe('');
    await expect(page).toHaveURL(/#\/albums$/);
  } finally { await fixture.close(); }
});

test('busy and readonly contexts reject library commands and unknown renderer commands do nothing', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  let page;
  try {
    const launched = await fixture.launch();
    const desktop = launched.desktop;
    page = launched.page;
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await expect.poll(() => menuItem(desktop, 'new-album')).toMatchObject({ enabled: false });
    await desktop.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('folio:command', 'run-shell');
      BrowserWindow.getAllWindows()[0].webContents.send('folio:command', 'new-album');
    });
    await menuItem(desktop, 'settings', true);
    await expect(page.locator('dialog.settings')).toBeVisible();
    await expect(page.locator('dialog.dlg .dlg-input')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    await expect.poll(() => menuItem(desktop, 'license')).toMatchObject({ enabled: false });
  } finally {
    await page?.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    await fixture.close();
  }
});

test('New album and License commands cannot discard an unsaved photo note', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Draft', 1);
    await page.goto(`${origin}/#/a/${album.id}/p/p001`);
    await expect(page.locator('.lb')).toBeVisible();
    await page.locator('.lb [data-act=details]').click();
    await page.locator('[data-note-edit]').click();
    await page.locator('.note-input').fill('Keep this draft');
    const confirmations = [];
    page.on('dialog', (dialog) => { confirmations.push(dialog.message()); return dialog.dismiss(); });
    await menuItem(desktop, 'new-album', true);
    await expect.poll(() => confirmations.length).toBe(1);
    await expect(page.locator('.note-input')).toHaveValue('Keep this draft');
    await menuItem(desktop, 'license', true);
    await expect.poll(() => confirmations.length).toBe(2);
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.note-input')).toHaveValue('Keep this draft');
  } finally { await fixture.close(); }
});

test('a pending native New album command keeps navigation locked until its response settles', async () => {
  const fixture = await desktopFixture();
  let release;
  let posted;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Stay here', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.route('**/api/albums', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    await menuItem(desktop, 'new-album', true);
    await page.locator('dialog .dlg-input').fill('Created when ready');
    const request = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith('/api/albums'));
    posted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/albums'));
    await page.locator('dialog [value=ok]').click();
    await request;
    await expect(page.locator('html')).toHaveAttribute('data-busy', '');
    await expect.poll(() => menuItem(desktop, 'license')).toMatchObject({ enabled: false });
    await page.evaluate(() => { location.hash = '#/license'; });
    await expect(page).toHaveURL(new RegExp(`/a/${album.id}$`));
    await page.evaluate(() => { location.hash = '#/albums'; });
    await expect(page).toHaveURL(new RegExp(`/a/${album.id}$`));
    release();
    await posted;
    await expect(page.locator('.album-page .title')).toHaveText('Created when ready');
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
  } finally {
    release();
    await posted;
    await fixture.close();
  }
});
