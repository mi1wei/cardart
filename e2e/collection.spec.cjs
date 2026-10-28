const { test, expect } = require('@playwright/test');
const { readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

test('background JPG and HEIC imports support dedup, pointer reorder, 3D, fullscreen and cache reconstruction', async () => {
  const softwareGL = process.env.FOLIO_E2E_SOFTWARE_GL === '1';
  if (softwareGL) test.setTimeout(180000);
  const fixture = await desktopFixture({ softwareGL });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let desktop;
  let page;
  let origin;
  let album;
  try {
    ({ desktop, page } = await fixture.launch());
    origin = new URL(page.url()).origin;
    album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Owned collection' } })).json();
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
    const rendererErrors = [];
    page.on('pageerror', (error) => { if (rendererErrors.length < 5) rendererErrors.push(error.message.slice(0, 1000)); });
    await page.locator('.album-page .acts.normal [data-act="3d"]').click();
    console.log('Owned collection phase: opening 3D');
    try { await expect(page.locator('.ab canvas')).toBeVisible({ timeout: softwareGL ? 30000 : undefined }); }
    catch (error) {
      const viewer = await page.evaluate(() => ({
        present: !!document.querySelector('.ab'),
        webglError: document.querySelector('.ab')?.hasAttribute('data-error'),
        message: document.querySelector('.ab-message')?.textContent,
      }));
      const gpu = await desktop.evaluate(({ app }) => app.getGPUFeatureStatus());
      console.log('Owned 3D fixture diagnostics:', JSON.stringify({ viewer, gpu, rendererErrors }));
      throw error;
    }
    await expect(page.locator('.ab')).not.toHaveAttribute('data-error', '');
    if (softwareGL) {
      const renderer = await page.locator('.ab canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      });
      expect(renderer).toMatch(/SwiftShader/i);
    }
    console.log('Owned collection phase: 3D ready');
    await page.locator('.ab select').selectOption('1');
    // Rendering can outlive an idle keepalive; retry a reset once on this read only.
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`, { maxRetries: 1 })).json()).perPage).toBe(1);
    const initial = await page.locator('.ab-count').textContent();
    await page.locator('.ab [data-act=next]').click();
    await expect(page.locator('.ab-count')).not.toHaveText(initial);
    console.log('Owned collection phase: entering fullscreen');
    await desktop.evaluate(() => {
      global.folioTestFullscreen = { entered: false, left: false };
      global.folioTestDesktop.window.once('enter-full-screen', () => { global.folioTestFullscreen.entered = true; });
      global.folioTestDesktop.window.once('leave-full-screen', () => { global.folioTestFullscreen.left = true; });
    });
    await page.locator('.ab [data-act=fullscreen]').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect.poll(() => desktop.evaluate(() => global.folioTestFullscreen.entered)).toBe(true);
    console.log('Owned collection phase: leaving fullscreen');
    await page.locator('.ab [data-act=fullscreen]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestFullscreen.left)).toBe(true);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    console.log('Owned collection phase: fullscreen complete');
    await page.locator('.ab-bar [data-act=close]').click();
    await expect(page.locator('.ab')).toHaveCount(0);
    console.log('Owned collection phase: stopping first app');
    await fixture.stop();
    console.log('Owned collection phase: first app stopped');
    for (const size of [600, 1600]) await rm(join(fixture.library, 'albums', album.id, 'cache', `${primary.id}_${size}.webp`));
    ({ desktop, page } = await fixture.launch());
    console.log('Owned collection phase: restarted');
    origin = new URL(page.url()).origin;
    const rebuilt = await page.request.get(`${origin}/media/${album.id}/${primary.id}/600`);
    expect(rebuilt.ok()).toBe(true);
    const metadata = await sharp(await rebuilt.body()).metadata();
    expect([metadata.width, metadata.height]).toEqual([64, 48]);
    expect(await (await page.request.get(`${origin}/media/${album.id}/${primary.id}/original`)).body()).toEqual(heic);
    const restored = await (await page.request.get(`${origin}/api/albums/${album.id}`)).json();
    expect(restored.perPage).toBe(1);
    expect(restored.photos.map((photo) => photo.id)).toEqual([ids[1], ids[0], ids[2]]);
  } catch (error) {
    const log = await readFile(join(fixture.profile, 'logs/desktop.log'), 'utf8').catch(() => '');
    console.log('Owned collection runtime tail:', log.slice(-3000));
    if (origin && album) {
      try {
        const response = await fetch(`${origin}/api/albums/${album.id}`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(2000) });
        const current = response.ok ? await response.json() : null;
        console.log('Owned collection fresh HTTP probe:', JSON.stringify({ status: response.status, perPage: current?.perPage, photos: current?.photos?.length }));
      } catch (probeError) {
        console.log('Owned collection fresh HTTP probe failed:', probeError.cause?.code || probeError.name);
      }
    }
    throw error;
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
