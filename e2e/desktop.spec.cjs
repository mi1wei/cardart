const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');

test('isolated desktop uses the real utility backend and a sandboxed renderer', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('.nav .logo')).toBeVisible();
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    const origin = new URL(page.url()).origin;
    const html = await page.request.get(origin);
    expect(html.headers()['content-security-policy']).toContain("script-src 'self'");
    const port = new URL(origin).port;
    await page.route('**/api/phone', (route) => route.fulfill({ json: {
      enabled: true, key: 'owned-test-key', port: Number(port), ip: '192.168.50.10',
      addresses: [{ address: '192.168.50.10', name: 'Wi-Fi' }, { address: '10.9.0.1', name: 'VPN' }],
    } }));
    await page.locator('.nav [data-act=phone]').click();
    const network = page.locator('.phone select');
    await expect(network).toHaveCount(1);
    await network.selectOption('10.9.0.1');
    await expect(page.locator('.phone code')).toHaveText(`http://10.9.0.1:${port}/?key=owned-test-key`);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true, value: async (value) => { window.folioTestCopiedLink = value; },
      });
    });
    await page.locator('.phone [data-act=copy]').click();
    expect(await page.evaluate(() => window.folioTestCopiedLink)).toBe(`http://10.9.0.1:${port}/?key=owned-test-key`);
    await page.evaluate(() => { delete navigator.clipboard.writeText; });
    await page.locator('.phone [data-act=close]').click();
    await page.unroute('**/api/phone');
    const created = await page.request.post(`${origin}/api/albums`, { data: { title: 'Utility test' } });
    expect(created.ok()).toBe(true);
    const album = await created.json();
    const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#1d5f80' } }).png().toBuffer();
    const uploaded = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=owned.png`, {
      headers: { 'X-Album-Upload': '1', 'Content-Type': 'application/octet-stream' }, data: png,
    });
    const result = await uploaded.json();
    expect(result.photo).toMatchObject({ w: 12, h: 8 });
    const heic = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=owned.heic`, {
      headers: { 'X-Album-Upload': '1', 'Content-Type': 'application/octet-stream' },
      data: await readFile(join(__dirname, '../tests/fixtures/photos/multi.heic')),
    });
    const primary = (await heic.json()).photo;
    expect(primary).toMatchObject({ w: 64, h: 48 });
    const preview = await page.request.get(`${origin}/media/${album.id}/${primary.id}/600`);
    const { data: pixels, info } = await sharp(await preview.body()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = (12 * info.width + 16) * info.channels;
    expect(pixels[corner]).toBeGreaterThan(180);
    expect(pixels[corner + 1]).toBeLessThan(60);
    await page.goto(`${origin}/#/a/${album.id}/p/${result.photo.id}`);
    await expect(page.locator('.lb')).toBeVisible();
    const opened = desktop.waitForEvent('window', { timeout: 3000 });
    await page.locator('.lb [data-act=original]').click();
    const original = await opened;
    await expect(original.locator('img')).toBeVisible();
    expect(await original.evaluate(() => typeof window.require)).toBe('undefined');
    await original.close();
    await fixture.close();
    await expect(async () => { await fetch(origin); }).rejects.toThrow();
  } finally {
    await fixture.close();
  }
});

test('read-only desktop imports a JSON license without exposing or deleting existing albums', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  const { openLibrary } = await import('../server/library.js');
  const lib = await openLibrary(fixture.library);
  await lib.create('Existing');
  await lib.close();
  try {
    const { page } = await fixture.launch();
    await expect(page.locator('.nav .logo')).toBeVisible();
    const origin = new URL(page.url()).origin;
    expect((await page.request.post(`${origin}/api/albums`, { data: { title: 'Denied' } })).status()).toBe(403);
    await expect(page.locator('.license-bar')).toBeVisible();
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(page.locator('[data-act=new]').first()).toHaveAttribute('aria-disabled', 'true');
    await page.goto(`${origin}/#/license`);
    await expect(page.locator('#license-json')).toBeHidden();
    await page.locator('.license-json-details summary').click();
    await expect(page.locator('#license-json')).toBeVisible();
    await page.locator('#license-json').fill('{"payload":"bad","signature":"bad"}');
    await page.locator('[data-act=activate-license]').click();
    await expect(page.locator('.license-result')).toHaveAttribute('data-result', 'error');
    expect((await (await page.request.get(`${origin}/api/license`)).json()).state).toBe('missing');
    await page.locator('#license-json').fill(' '.repeat(8192) + JSON.stringify(fixture.envelope));
    await page.locator('[data-act=activate-license]').click();
    expect((await (await page.request.get(`${origin}/api/license`)).json()).state).toBe('missing');
    await page.evaluate(() => {
      const original = File.prototype.text;
      window.restoreFixtureFileRead = () => { File.prototype.text = original; };
      File.prototype.text = function () {
        return original.call(this).then((text) => new Promise((resolve) => {
          window.completeFixtureFileRead = () => resolve(text);
        }));
      };
    });

    await page.locator('#license-file').setInputFiles(fixture.licenseFile);
    await expect(page.locator('[data-act=activate-license]')).toBeDisabled();
    await page.waitForFunction(() => typeof window.completeFixtureFileRead === 'function');
    await page.evaluate(() => { window.completeFixtureFileRead(); window.restoreFixtureFileRead(); });
    await expect(page.locator('[data-act=activate-license]')).toBeEnabled();
    await page.locator('[data-act=activate-license]').click();
    await expect(page.locator('.license-result')).toHaveAttribute('data-result', 'success');
    await page.goto(`${origin}/#/albums`);
    await page.locator('[data-act=new]').first().click();
    await page.locator('dialog .dlg-input').fill('Activated album');
    await page.locator('dialog button[value=ok]').click();
    await expect(page.locator('.album-page .title')).toHaveText('Activated album');
    const albums = await (await page.request.get(`${origin}/api/albums`)).json();
    expect(albums.map((album) => album.title)).toContain('Existing');
  } finally { await fixture.close(); }
});
