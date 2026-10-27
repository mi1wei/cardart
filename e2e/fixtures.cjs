const { _electron } = require('playwright');
const { expect } = require('@playwright/test');
const { generateKeyPairSync, sign } = require('node:crypto');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function desktopFixture({ license = 'active' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'folio-desktop-e2e-'));
  const profile = join(root, 'Profile with spaces');
  const library = join(root, '\u76f8\u518c\u5e93 with spaces');
  const keyFile = join(root, 'public.pem');
  const licenseFile = join(root, 'activation.json');
  await mkdir(profile);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  await writeFile(keyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  const payload = {
    license_id: 'lic_e2e', plan: 'trial', device_id: null,
    expires_at: new Date(Date.now() + (license === 'expired' ? -3600000 : 3600000)).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    features: ['album_write'], license_version: 1,
  };
  function issueLicense(expiresAt = payload.expires_at) {
    const bytes = Buffer.from(JSON.stringify({ ...payload, expires_at: expiresAt }));
    return { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') };
  }
  const envelope = issueLicense();
  await writeFile(licenseFile, JSON.stringify(envelope));
  if (license !== 'missing') await writeFile(join(profile, 'license.json'), JSON.stringify(envelope));
  let desktop;
  async function stop() {
    await desktop?.close();
    desktop = null;
  }
  return {
    root, profile, library, keyFile, licenseFile, envelope, issueLicense, stop,
    async launch() {
      desktop = await _electron.launch({
        args: [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${profile}`],
        env: { ...process.env, ALBUM_LIBRARY: library, FOLIO_E2E_KEY_FILE: keyFile },
        chromiumSandbox: true, bypassCSP: false,
      });
      await expect.poll(() => desktop.evaluate(() => !!global.folioTestDesktop)).toBe(true);
      const page = await desktop.firstWindow();
      const session = await desktop.context().newCDPSession(page);
      // Playwright's focus emulation masks real window hide/show events.
      await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      return { desktop, page };
    },
    async close() {
      await stop();
      await rm(root, { recursive: true, force: true });
    },
  };
}
module.exports = { desktopFixture };
