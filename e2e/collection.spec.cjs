const { test, expect } = require('@playwright/test');
const { readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

test('background JPG and HEIC imports support dedup, pointer reorder, 3D, fullscreen and cache reconstruction', async () => {
  const fixture = await desktopFixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  try {
    let { desktop, page } = await fixture.launch();
    let origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Owned collection' } })).json();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .title')).toHaveText('Owned collection');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    const jpeg = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#a32f2f' } }).jpeg().toBuffer();
    const heic = await readFile(join(__dirname, '../tests/fixtures/photos/multi.heic'));
    let first = true;
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (first) { first = false; entered(); await held; }
      await route.continue();
    });
    await page.locator('.album-page input[type=file]').setInputFiles([
      { name: 'red.jpg', mimeType: 'image/jpeg', buffer: jpeg },
      { name: 'primary.heic', mimeType: 'image/heic', buffer: heic },
      { name: 'blue.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 12, height: 8, channels: 3, background: '#1d5f80' } }).jpeg().toBuffer() },
    ]);
    await started;
    await desktop.evaluate(() => global.folioTestDesktop.window.close());
    release();
    await expect(page.locator('.tile')).toHaveCount(3);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    expect(await desktop.evaluate(() => global.folioTestDesktop.window.isVisible())).toBe(false);
    await desktop.evaluate(() => global.folioTestDesktop.tray.emit('click'));
    const duplicate = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=again.jpg`, {
      headers: { 'X-Album-Upload': '1' }, data: jpeg,
    });
    expect(duplicate.ok()).toBe(true);
    const current = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(current.photos).toHaveLength(3);
    const primary = current.photos.find((photo) => photo.name === 'primary.heic');
    const ids = await page.locator('.tile').evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
    const a = await page.locator('.tile').nth(0).boundingBox();
    const b = await page.locator('.tile').nth(1).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos.map((photo) => photo.id)).toEqual([ids[1], ids[0], ids[2]]);
    await page.locator('.album-page .acts.normal [data-act="3d"]').click();
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect(page.locator('.ab')).not.toHaveAttribute('data-error', '');
    await page.locator('.ab select').selectOption('1');
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).perPage).toBe(1);
    const initial = await page.locator('.ab-count').textContent();
    await page.locator('.ab [data-act=next]').click();
    await expect(page.locator('.ab-count')).not.toHaveText(initial);
    await desktop.evaluate(() => {
      global.folioTestFullscreen = { entered: false, left: false };
      global.folioTestDesktop.window.once('enter-full-screen', () => { global.folioTestFullscreen.entered = true; });
      global.folioTestDesktop.window.once('leave-full-screen', () => { global.folioTestFullscreen.left = true; });
    });
    await page.locator('.ab [data-act=fullscreen]').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect.poll(() => desktop.evaluate(() => global.folioTestFullscreen.entered)).toBe(true);
    await page.locator('.ab [data-act=fullscreen]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestFullscreen.left)).toBe(true);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.locator('.ab-bar [data-act=close]').click();
    await expect(page.locator('.ab')).toHaveCount(0);
    await fixture.stop();
    for (const size of [600, 1600]) await rm(join(fixture.library, 'albums', album.id, 'cache', `${primary.id}_${size}.webp`));
    ({ desktop, page } = await fixture.launch());
    origin = new URL(page.url()).origin;
    const rebuilt = await page.request.get(`${origin}/media/${album.id}/${primary.id}/600`);
    expect(rebuilt.ok()).toBe(true);
    const metadata = await sharp(await rebuilt.body()).metadata();
    expect([metadata.width, metadata.height]).toEqual([64, 48]);
    expect(await (await page.request.get(`${origin}/media/${album.id}/${primary.id}/original`)).body()).toEqual(heic);
    const restored = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(restored.perPage).toBe(1);
    expect(restored.photos.map((photo) => photo.id)).toEqual([ids[1], ids[0], ids[2]]);
  } finally { release(); await fixture.close(); }
});

test('a license expiring while hidden becomes read-only on restore without removing photos', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Retained' } })).json();
    const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#1d5f80' } }).png().toBuffer();
    const uploaded = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=retained.png`, {
      headers: { 'X-Album-Upload': '1' }, data: png,
    });
    const { photo } = await uploaded.json();
    const expiry = new Date(Math.ceil(Date.now() / 1000) * 1000 + 3000).toISOString().replace('.000Z', 'Z');
    const activated = await page.request.post(`${origin}/api/license`, { data: fixture.issueLicense(expiry) });
    expect((await activated.json()).canWrite).toBe(true);
    await desktop.evaluate(() => global.folioTestDesktop.window.close());
    await expect.poll(() => Date.now() >= Date.parse(expiry), { timeout: 6000 }).toBe(true);
    expect((await page.request.post(`${origin}/api/albums`, { data: { title: 'Denied' } })).status()).toBe(403);
    expect(await (await page.request.get(`${origin}/media/${album.id}/${photo.id}/original`)).body()).toEqual(png);
    await desktop.evaluate(() => global.folioTestDesktop.tray.emit('click'));
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await expect(page.locator('.license-bar')).toBeVisible();
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('[data-act=upload]').first()).toHaveAttribute('aria-disabled', 'true');
    expect((await (await page.request.get(`${origin}/api/license`)).json()).state).toBe('expired');
  } finally { await fixture.close(); }
});
