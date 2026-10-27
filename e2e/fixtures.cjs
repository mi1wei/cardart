const { _electron } = require('playwright');
const { generateKeyPairSync, sign } = require('node:crypto');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function desktopFixture({ license = 'active' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'folio-desktop-e2e-'));
  const profile = join(root, 'profile');
  const library = join(root, 'library');
  const keyFile = join(root, 'public.pem');
  const licenseFile = join(root, 'activation.json');
  await mkdir(profile);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  await writeFile(keyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  const bytes = Buffer.from(JSON.stringify({
    license_id: 'lic_e2e', plan: 'trial', device_id: null,
    expires_at: new Date(Date.now() + (license === 'expired' ? -3600000 : 3600000)).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    features: ['album_write'], license_version: 1,
  }));
  const envelope = { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') };
  await writeFile(licenseFile, JSON.stringify(envelope));
  if (license !== 'missing') await writeFile(join(profile, 'license.json'), JSON.stringify(envelope));
  let desktop;
  return {
    root, profile, library, keyFile, licenseFile, envelope,
    async launch() {
      desktop = await _electron.launch({
        args: [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${profile}`],
        env: { ...process.env, ALBUM_LIBRARY: library, FOLIO_E2E_KEY_FILE: keyFile },
        chromiumSandbox: true, bypassCSP: false,
      });
      return { desktop, page: await desktop.firstWindow() };
    },
    async close() {
      try { await desktop?.close(); }
      finally { desktop = null; await rm(root, { recursive: true, force: true }); }
    },
  };
}
module.exports = { desktopFixture };
