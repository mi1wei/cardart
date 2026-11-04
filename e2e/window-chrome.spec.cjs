const { test, expect } = require('@playwright/test');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');
const { openSettings, seed } = require('./ui-helpers.cjs');

const mainWindow = (desktop, read) => desktop.evaluate(({ BrowserWindow }, read) => {
  const window = BrowserWindow.getAllWindows()[0];
  return read === 'bounds' ? window.getBounds() : read === 'normal' ? window.getNormalBounds() : window.isMaximized();
}, read);

test('the window comes back where it was left, maximized too, and to the default when that place is gone', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  const file = join(fixture.profile, 'desktop.json');
  const saved = async () => JSON.parse(await readFile(file, 'utf8')).window;
  try {
    let { desktop } = await fixture.launch();
    const place = { x: 60, y: 80, width: 800, height: 560 };
    await desktop.evaluate(({ BrowserWindow }, place) => BrowserWindow.getAllWindows()[0].setBounds(place), place);
    await expect.poll(saved).toEqual({ ...place, maximized: false });
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    expect(await mainWindow(desktop, 'bounds')).toEqual(place);
    // Maximized at quit: maximized again, with the earlier size underneath.
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await expect.poll(async () => (await saved()).maximized).toBe(true);
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    await expect.poll(() => mainWindow(desktop, 'maximized')).toBe(true);
    expect(await mainWindow(desktop, 'normal')).toEqual(place);
    await fixture.stop();
    // A place on a display that is no longer there: on screen again.
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), window: { x: -30000, y: -30000, width: 900, height: 600, maximized: false } }));
    ({ desktop } = await fixture.launch());
    const shown = await desktop.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      return bounds.x + bounds.width > area.x && bounds.x < area.x + area.width && bounds.y + bounds.height > area.y && bounds.y < area.y + area.height;
    });
    expect(shown).toBe(true);
  } finally { await fixture.close(); }
});

test('Settings shows the library and the version in the desktop app, and its buttons reach the app', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'One', 2);
    await page.reload();
    expect(await page.evaluate(() => typeof window.folioDesktop === 'object' && Object.isFrozen(window.folioDesktop))).toBe(true);
    await desktop.evaluate(({ shell, dialog }) => {
      shell.openPath = async (path) => { global.folioTestOpened = path; return ''; };
      dialog.showOpenDialog = async () => { global.folioTestChose = true; return { canceled: true, filePaths: [] }; };
      dialog.showMessageBox = async (...args) => { global.folioTestUpdateDialog = args.at(-1); return { response: 0 }; };
    });
    const settings = await openSettings(page);
    const rows = await settings.locator('.set-row .set-k').allTextContents();
    expect(rows.filter((text) => ['Library', 'License', 'Version'].includes(text))).toEqual(['Library', 'License', 'Version']);
    const library = settings.locator('.set-library');
    await expect(library.locator('.set-library-path')).toHaveText(/相册库 with spaces$/);
    await expect(library.locator('.set-library-count')).toHaveText('1 album · 2 photos');
    await expect(library.locator('[data-act=reveal-library]')).toHaveText(process.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder');
    await library.locator('[data-act=reveal-library]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestOpened || '')).toMatch(/相册库 with spaces$/);
    await library.locator('[data-act=choose-library]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestChose === true)).toBe(true);
    const { version } = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf8'));
    await expect(settings.locator('.set-version-name')).toHaveText(`Folio ${version}`);
    const update = settings.locator('[data-act=update]');
    if (process.platform === 'darwin') await expect(update).toBeHidden();
    else {
      await expect(update).toHaveText('Check for Updates');
      await update.click();
      await expect.poll(() => desktop.evaluate(() => global.folioTestUpdateDialog?.message || '')).toBe('Online updates are disabled in development');
    }
  } finally { await fixture.close(); }
});

const appRegion = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const style = getComputedStyle(el);
  return style.getPropertyValue('-webkit-app-region') || style.getPropertyValue('app-region');
});

test('the top bar is the title bar in the desktop app, and full screen closes the traffic-light gap', async () => {
  const platform = { darwin: 'mac', win32: 'win' }[process.platform];
  test.skip(!platform, 'Linux keeps the system title bar');
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('html')).toHaveAttribute('data-desktop', platform);
    expect(await appRegion(page, '.nav')).toBe('drag');
    expect(await appRegion(page, '.nav .logo')).toBe('no-drag');
    expect(await appRegion(page, '.nav [data-act=settings]')).toBe('no-drag');
    const left = () => page.locator('.nav').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    if (platform === 'mac') {
      expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition())).toEqual({ x: 20, y: 20 });
      expect(await left()).toBeGreaterThanOrEqual(78);
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', '', { timeout: 10_000 });
      expect(await left()).toBeLessThan(78);
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
      await expect(page.locator('html')).not.toHaveAttribute('data-fullscreen', '', { timeout: 10_000 });
    } else {
      // The system buttons sit over the right end of the bar.
      expect(await page.locator('.nav').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight))).toBeGreaterThan(100);
    }
    // A phone-width view keeps the page as it was: no gap, no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await left()).toBeLessThan(78);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await fixture.close(); }
});

test('the appearance chosen in Settings sets the native theme and the window colour, also on the next launch', async () => {
  const fixture = await desktopFixture();
  try {
    let { desktop, page } = await fixture.launch();
    await (await openSettings(page)).locator('[data-theme-mode=dark]').click();
    await expect.poll(() => desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await fixture.stop();
    ({ desktop, page } = await fixture.launch());
    expect((await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())).toLowerCase()).toBe('#121417');
    expect(await desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await (await openSettings(page)).locator('[data-theme-mode=auto]').click();
    await expect.poll(() => desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
  } finally { await fixture.close(); }
});
