const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

test('opening license management does not discard an active upload queue', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('.nav .logo')).toBeVisible();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Uploading' } })).json();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    await expect(page.locator('.album-page .title')).toHaveText('Uploading');
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      entered();
      await held;
      await route.continue();
    });
    const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#1d5f80' } }).png().toBuffer();
    await page.locator('.album-page input[type=file]').setInputFiles({ name: 'upload.png', mimeType: 'image/png', buffer: png });
    await started;
    await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('license').click());
    await page.waitForFunction(() => location.hash === '#/license' || !!document.querySelector('.toast:not([hidden])'));
    await expect(page.locator('.album-page')).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/a/${album.id}`);
    release();
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
  } finally { release(); await fixture.close(); }
});
