const { _electron } = require('playwright');
const { expect } = require('@playwright/test');
const { generateKeyPairSync, sign } = require('node:crypto');
const { constants } = require('node:fs');
const { cp, mkdtemp, mkdir, realpath, symlink, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join, resolve, sep } = require('node:path');

async function desktopFixture({ license = 'active', softwareGL = false } = {}) {
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
  let executablePath;
  async function stop() {
    if (desktop?.context().pages().length) {
      // Playwright closes its Node inspector immediately after app.quit(), before an async drain finishes.
      try { await desktop.evaluate(async () => { await global.folioTestDesktop?.stop(); }); }
      catch (error) { if (desktop.context().pages().length) throw error; }
    }
    await desktop?.close();
    desktop = null;
  }
  return {
    root, profile, library, keyFile, licenseFile, envelope, issueLicense, stop,
    async launch({ args = [], waitForReady = true } = {}) {
      if (softwareGL && !executablePath) {
        if (process.platform !== 'darwin') throw new Error('The software WebGL fixture requires macOS');
        // ANGLE expects a Vulkan loader name; alias the bundled ICD only in an owned copy.
        const bundle = join(root, 'Software Electron.app');
        await cp(resolve(dirname(require('electron')), '../..'), bundle, {
          recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE,
        });
        const libraries = await realpath(join(bundle, 'Contents/Frameworks/Electron Framework.framework/Libraries'));
        if (!libraries.startsWith(await realpath(bundle) + sep)) throw new Error('The copied runtime escaped its owned bundle');
        await symlink('libvk_swiftshader.dylib', join(libraries, 'libvulkan.dylib'));
        executablePath = join(bundle, 'Contents/MacOS/Electron');
      }
      const graphics = softwareGL
        ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1'] : [];
      desktop = await _electron.launch({
        executablePath,
        args: [join(__dirname, 'desktop-entry.cjs'), `--user-data-dir=${profile}`, ...graphics, ...args],
        env: { ...process.env, ALBUM_LIBRARY: library, FOLIO_E2E_KEY_FILE: keyFile },
        chromiumSandbox: true, bypassCSP: false,
      });
      if (!waitForReady) return { desktop };
      await expect.poll(() => desktop.evaluate(() => !!global.folioTestDesktop), { timeout: 30000 }).toBe(true);
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
