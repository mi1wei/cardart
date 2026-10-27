const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

test('tray close keeps HTTP alive, reopens the same window and never hides without a usable tray', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('.nav .logo')).toBeVisible();
    const origin = new URL(page.url()).origin;
    await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    expect(await desktop.evaluate(() => !!global.folioTestDesktop.tray)).toBe(true);
    await desktop.evaluate(() => global.folioTestDesktop.window.close());
    expect(await desktop.evaluate(() => global.folioTestDesktop.window.isVisible())).toBe(false);
    expect((await page.request.get(`${origin}/api/albums`)).status()).toBe(200);
    await desktop.evaluate(() => global.folioTestDesktop.tray.emit('click'));
    expect(await desktop.evaluate(() => global.folioTestDesktop.window.isVisible())).toBe(true);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await desktop.evaluate(() => { global.folioTestDesktop.tray.destroy(); global.folioTestDesktop.window.close(); });
    expect(await desktop.evaluate(() => global.folioTestDesktop.window.isVisible())).toBe(true);
  } finally { await fixture.close(); }
});

test('explicit quit waits for the entire local upload queue before releasing the port and library', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('.nav .logo')).toBeVisible();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Saving' } })).json();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .title')).toHaveText('Saving');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    let uploads = 0;
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (++uploads === 1) { entered(); await held; }
      await route.continue();
    });
    const files = await Promise.all(['#d32f2f', '#1d5f80'].map(async (background, index) => ({
      name: `save-${index}.png`, mimeType: 'image/png',
      buffer: await sharp({ create: { width: 8, height: 6, channels: 3, background } }).png().toBuffer(),
    })));
    await page.locator('.album-page input[type=file]').setInputFiles(files);
    await started;
    await desktop.evaluate(({ app }) => { app.quit(); });
    await expect.poll(async () => JSON.parse(await readFile(join(fixture.profile, 'runtime.json'), 'utf8')).origin).toBe(origin);
    expect((await page.request.get(`${origin}/api/albums`)).status()).toBe(200);
    const closed = desktop.waitForEvent('close');
    release();
    await closed;
    await expect.poll(async () => fetch(`${origin}/api/albums`).then(() => false, () => true)).toBe(true);
    const { openLibrary } = await import('../server/library.js');
    const reopened = await openLibrary(fixture.library);
    try { expect(reopened.get(album.id).photos).toHaveLength(2); }
    finally { await reopened.close(); }
  } finally { release(); await fixture.close(); }
});
