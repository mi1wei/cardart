const { test, expect } = require('@playwright/test');
const { readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, seedBook, openWall } = require('./ui-helpers.cjs');

const item = (page, id) => page.locator(`.context-menu [data-context="${id}"]`);

test('photo context menus support keyboard focus, cover changes and viewport edge placement', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Context', 2);
    await page.goto(`${origin}/#/a/${album.id}`);
    const photo = page.locator('.tile').nth(1);
    await photo.click({ button: 'right' });
    await expect(item(page, 'open')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item(page, 'delete')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(photo).toBeFocused();
    await expect(page.locator('.album-page')).not.toHaveClass(/selecting/);
    await page.keyboard.press('Shift+F10');
    await expect(item(page, 'open')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, '3d')).toBeFocused();
    await page.keyboard.press('Escape');
    const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await photo.evaluate((element, size) => element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: size.width - 1, clientY: size.height - 1, button: 2,
    })), size);
    await expect(page.locator('.context-menu')).toBeVisible();
    const box = await page.locator('.context-menu').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    await item(page, 'cover').click();
    await expect(photo.locator('.badge')).toBeVisible();
  } finally { await fixture.close(); }
});

test('photo context actions open the selected photo in 3D and focus the existing note editor', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await page.setViewportSize({ width: 1024, height: 600 });
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Start here', 6, 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.tile').nth(3).click({ button: 'right' });
    await item(page, '3d').click();
    await expect(page.locator('.ab-count')).toHaveText('3 / 4', { timeout: 15000 });
    await page.locator('.ab [data-act=close]').click();
    await expect(page.locator('.ab')).toHaveCount(0);
    await page.locator('.tile').nth(3).click({ button: 'right' });
    await item(page, 'note').click();
    await expect(page.locator('.note-input')).toBeFocused();
    await expect(page).toHaveURL(/\/p\/p004$/);
  } finally { await fixture.close(); }
});

test('scrolling outside an open context menu closes it when its photo moves', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await page.setViewportSize({ width: 1024, height: 600 });
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Scroll context', 6);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.tile').first().click({ button: 'right' });
    await expect(item(page, 'open')).toBeFocused();
    await page.evaluate(() => window.scrollBy(0, 80));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(page.locator('.context-menu')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('a selected photo context menu downloads and copies the whole selection, not another photo', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Source', 3);
    const target = await seed(page, origin, 'Target', 0);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.tile').nth(0).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    await page.locator('.tile').nth(1).click();
    await page.locator('.tile').nth(0).click({ button: 'right' });
    await expect(page.locator('.context-menu [role=menuitem]')).toHaveCount(4);
    await expect(item(page, 'download')).toContainText('2');
    const destination = join(fixture.root, 'selection.zip');
    await desktop.evaluate(({ session }, destination) => {
      global.folioDownload = null;
      session.defaultSession.once('will-download', (_event, download) => {
        download.setSavePath(destination);
        download.once('done', (_event, state) => {
          global.folioDownload = { state, name: download.getFilename() };
        });
      });
    }, destination);
    await item(page, 'download').click();
    await expect.poll(() => desktop.evaluate(() => global.folioDownload?.state)).toBe('completed');
    expect(await desktop.evaluate(() => global.folioDownload.name)).toBe('Source.zip');
    const bytes = await readFile(destination);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes(Buffer.from('p0.jpg'))).toBe(true);
    expect(bytes.includes(Buffer.from('p1.jpg'))).toBe(true);
    expect(bytes.includes(Buffer.from('p2.jpg'))).toBe(false);
    await page.locator('.tile').nth(0).click({ button: 'right' });
    await item(page, 'copy').click();
    await page.locator(`.album-picker [data-target="${target.id}"]`).click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${target.id}`)).json()).photos.length).toBe(2);
    await page.locator('.tile').nth(2).click({ button: 'right' });
    await item(page, 'delete').click();
    await expect(page.locator('dialog .dlg-text')).toContainText('1');
    await page.locator('dialog [value=ok]').click();
    await expect(page.locator('.tile')).toHaveCount(2);
  } finally { await fixture.close(); }
});

test('album and trash context menus reuse rename, PDF, restore and permanent-delete actions', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Before', 1);
    await openWall(page, origin);
    await page.locator('.folder').click({ button: 'right' });
    await item(page, 'rename').click();
    await page.locator('dialog .dlg-input').fill('After');
    await page.locator('dialog [value=ok]').click();
    await expect(page.locator('.folder')).toContainText('After');
    await page.locator('.folder').click({ button: 'right' });
    await item(page, 'pdf').click();
    await expect(page.locator('dialog.pdf-export')).toBeVisible();
    await page.locator('.pdf-export [data-act=cancel]').click();
    await page.request.delete(`${origin}/api/albums/${album.id}`);
    await page.goto(`${origin}/#/trash`);
    await page.locator('.trash-item').click({ button: 'right' });
    await item(page, 'restore').click();
    await expect(page.locator('.trash-item')).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums`)).json()).length).toBe(1);
    await page.request.delete(`${origin}/api/albums/${album.id}`);
    await page.reload();
    await page.locator('.trash-item').click({ button: 'right' });
    await item(page, 'purge').click();
    await expect(page.locator('dialog .dlg-text')).toBeVisible();
    await page.locator('dialog [value=ok]').click();
    await expect(page.locator('.trash-item')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('readonly context menus disable writes while keeping viewing and downloading available', async () => {
  const fixture = await desktopFixture();
  try {
    let { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Read only', 1);
    await fixture.stop();
    await rm(join(fixture.profile, 'license.json'));
    ({ page } = await fixture.launch());
    await page.goto(`${new URL(page.url()).origin}/#/a/${album.id}`);
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await page.locator('.tile').click({ button: 'right' });
    for (const id of ['cover', 'note', 'copy', 'move', 'delete']) await expect(item(page, id)).toBeDisabled();
    await expect(item(page, 'download')).toBeEnabled();
    await expect(item(page, 'open')).toBeEnabled();
    await item(page, 'open').click();
    await expect(page.locator('.lb')).toBeVisible();
  } finally { await fixture.close(); }
});

test('context actions recheck busy state and disappear when a modal changes the context', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, desktop } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Context changes', 2);
    await page.goto(`${origin}/#/a/${album.id}`);
    const photo = page.locator('.tile').nth(1);
    await photo.click({ button: 'right' });
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    try {
      await item(page, 'cover').click();
      await expect(page.locator('.context-menu')).toHaveCount(0);
      await expect(photo.locator('.badge')).toHaveCount(0);
    } finally { await page.evaluate(() => document.documentElement.removeAttribute('data-busy')); }
    await photo.click({ button: 'right' });
    await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('settings').click());
    await expect(page.locator('dialog.settings')).toBeVisible();
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.settings')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('context keyboard input cannot delete or select photos behind the current target', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Keyboard target', 3);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.tile').nth(0).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    await page.locator('.tile').nth(1).click();
    await page.locator('.tile').nth(2).click({ button: 'right' });
    for (const key of ['Delete', 'Backspace', process.platform === 'darwin' ? 'Meta+a' : 'Control+a']) {
      await page.keyboard.press(key);
      await expect(page.locator('dialog')).toHaveCount(0);
      await expect(page.locator('.context-menu')).toBeVisible();
      await expect(page.locator('.tile.sel')).toHaveCount(2);
    }
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog .dlg-text')).toContainText('1');
    await page.locator('dialog [data-act=cancel]').click();
    await expect(page.locator('.tile')).toHaveCount(3);
  } finally { await fixture.close(); }
});
