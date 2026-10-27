const { test, expect } = require('@playwright/test');
const { _electron } = require('playwright');
const { generateKeyPairSync, sign } = require('node:crypto');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require('sharp');

test('isolated desktop uses the real utility backend and a sandboxed renderer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'folio-desktop-e2e-'));
  const profile = join(root, 'profile');
  const library = join(root, 'library');
  const keyFile = join(root, 'public.pem');
  await mkdir(profile);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  await writeFile(keyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  const bytes = Buffer.from(JSON.stringify({
    license_id: 'lic_e2e', plan: 'trial', device_id: null,
    expires_at: new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    features: ['album_write'], license_version: 1,
  }));
  await writeFile(join(profile, 'license.json'), JSON.stringify({
    payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url'),
  }));
  let desktop;
  try {
    desktop = await _electron.launch({
      args: [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${profile}`],
      env: { ...process.env, ALBUM_LIBRARY: library, FOLIO_E2E_KEY_FILE: keyFile },
      chromiumSandbox: true,
      bypassCSP: false,
    });
    const page = await desktop.firstWindow();
    await expect(page.locator('.nav .logo')).toBeVisible();
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    const origin = new URL(page.url()).origin;
    const html = await page.request.get(origin);
    expect(html.headers()['content-security-policy']).toContain("script-src 'self'");
    const created = await page.request.post(`${origin}/api/albums`, { data: { title: 'Utility test' } });
    expect(created.ok()).toBe(true);
    const album = await created.json();
    const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#1d5f80' } }).png().toBuffer();
    const uploaded = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=owned.png`, {
      headers: { 'X-Album-Upload': '1', 'Content-Type': 'application/octet-stream' }, data: png,
    });
    const result = await uploaded.json();
    expect(result.photo).toMatchObject({ w: 12, h: 8 });
    await desktop.close();
    desktop = null;
    await expect(async () => { await fetch(origin); }).rejects.toThrow();
  } finally {
    await desktop?.close();
    await rm(root, { recursive: true, force: true });
  }
});
