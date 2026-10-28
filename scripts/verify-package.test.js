import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import asar from '@electron/asar';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { verifyPackage, validateSourceInputs } from './verify-package.mjs';
const require = createRequire(import.meta.url);

// These tiny Mach-O/PE headers and fuse wires are structural fixtures, not runnable applications.
function binary(platform, arch, fuses = false) {
  const header = Buffer.alloc(128);
  if (platform === 'darwin') {
    header.writeUInt32LE(0xfeedfacf);
    header.writeUInt32LE(arch === 'arm64' ? 0x100000c : 0x1000007, 4);
  } else {
    header.writeUInt16LE(0x5a4d);
    header.writeUInt32LE(64, 60);
    header.write('PE\0\0', 64);
    header.writeUInt16LE(0x8664, 68);
  }
  return fuses ? Buffer.concat([header, Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1, 8]), Buffer.from('01001100')]) : header;
}

async function fixture(t, { platform = 'darwin', arch = 'arm64', extra = {}, addonArch = arch, relocateDependency = false, relocatedVersion = '7.8.5' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'folio-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'payload');
  const appDir = join(root, platform === 'darwin' ? 'Folio.app' : 'win-unpacked');
  const resources = platform === 'darwin' ? join(appDir, 'Contents/Resources') : join(appDir, 'resources');
  async function file(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, typeof data === 'object' && !Buffer.isBuffer(data) ? JSON.stringify(data) : data);
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const native = `${platform}-${arch}`;
  const packages = [
    { name: 'sharp', version: '0.35.5', location: 'node_modules/sharp' },
    { name: `@img/sharp-${native}`, version: '0.35.5', location: `node_modules/@img/sharp-${native}` },
    ...(platform === 'darwin' ? [{ name: `@img/sharp-libvips-${native}`, version: '1.3.4', location: `node_modules/@img/sharp-libvips-${native}` }] : []),
    { name: 'libheif-js', version: '1.23.5', location: 'node_modules/libheif-js' },
  ];
  if (relocateDependency) packages.push({ name: 'semver', version: '7.8.5', location: 'node_modules/semver' });
  const metadata = { name: 'folio', version: '0.1.0-beta.1', type: 'module', main: 'desktop/main.cjs', dependencies: { sharp: '0.35.5', 'libheif-js': '1.23.5' } };
  await file(join(root, 'package.json'), metadata);
  await file(join(source, 'package.json'), metadata);
  await file(join(root, 'desktop/license-public.pem'), pem);
  await file(join(source, 'desktop/license-public.pem'), pem);
  for (const path of ['desktop/main.cjs', 'desktop/service.cjs', 'server/app.js', 'server/heic-worker.cjs', 'server/license.js', 'server/license-store.js', 'node_modules/sharp/dist/index.cjs', 'node_modules/sharp/dist/index.mjs', 'node_modules/libheif-js/wasm-bundle.js', 'node_modules/libheif-js/libheif-wasm/libheif-bundle.js']) {
    await file(join(source, path), '/* structural fixture */');
  }
  for (const pkg of packages) {
    const relocated = relocateDependency && pkg.name === 'semver';
    await file(join(source, relocated ? 'node_modules/sharp/node_modules/semver' : pkg.location, 'package.json'), {
      name: pkg.name, version: relocated ? relocatedVersion : pkg.version,
      ...(pkg.name === 'sharp' ? { main: './dist/index.cjs', exports: { '.': { import: { default: './dist/index.mjs' }, require: { default: './dist/index.cjs' } } } } : {}),
    });
  }
  const addon = `${packages[1].location}/lib/sharp-${native}-${packages[1].version}.node`;
  const vipsRoot = `node_modules/@img/${platform === 'darwin' ? 'sharp-libvips' : 'sharp'}-${native}`;
  const vips = `${vipsRoot}/lib/${platform === 'darwin' ? 'libvips-cpp.8.18.7.dylib' : 'libvips-42.dll'}`;
  await file(join(source, addon), binary(platform, addonArch));
  await file(join(source, vips), binary(platform, arch));
  if (platform === 'win32') {
    await file(join(source, vipsRoot, 'versions.json'), { vips: '8.18.7' });
    await file(join(source, vipsRoot, 'lib/libvips-cpp-8.18.7.dll'), binary(platform, arch));
  }
  for (const [path, data] of Object.entries(extra)) await file(join(source, path), data);
  const web = {
    'index.html': '<!doctype html><title>Folio</title>',
    'favicon.ico': 'owned icon fixture',
    'icons/trayTemplate.png': 'owned template fixture',
    'icons/trayTemplate@2x.png': 'owned retina fixture',
  };
  for (const [path, data] of Object.entries(web)) {
    await file(join(root, 'dist', path), data);
    await file(join(resources, 'web', path), data);
  }
  const inventory = { version: metadata.version, target: native, packages, readyForDistribution: false };
  for (const [path, data] of Object.entries({ 'THIRD_PARTY_NOTICES.txt': 'Folio fixture - NOT CLEARED FOR DISTRIBUTION', 'inventory.json': JSON.stringify(inventory) })) {
    await file(join(root, 'release/legal', path), data);
    await file(join(resources, 'legal', path), data);
  }
  for (const [name, data] of [['LICENSE', 'Electron fixture notice'], ['LICENSES.chromium.html', '<p>Chromium fixture notice</p>']]) {
    await file(join(root, 'node_modules/electron/dist', name), data);
    await file(join(platform === 'darwin' ? resources : appDir, name === 'LICENSE' ? 'LICENSE.electron.txt' : name), data);
  }
  if (platform === 'darwin') {
    await file(join(root, 'public/icons/folio.icns'), 'owned application icon fixture');
    await file(join(resources, 'icon.icns'), 'owned application icon fixture');
    await mkdir(join(root, 'node_modules/electron/dist/Electron.app/Contents/Resources/en.lproj'), { recursive: true });
    await mkdir(join(resources, 'en.lproj'));
  }
  await mkdir(resources, { recursive: true });
  await asar.createPackageWithOptions(source, join(resources, 'app.asar'), {
    dot: true, unpack: '{**/node_modules/sharp/**,**/node_modules/@img/**,**/node_modules/libheif-js/**}',
  });
  const executable = platform === 'darwin' ? join(appDir, 'Contents/MacOS/Folio') : join(appDir, 'Folio.exe');
  const fuseFile = platform === 'darwin' ? join(appDir, 'Contents/Frameworks/Electron Framework.framework/Electron Framework') : executable;
  await file(executable, binary(platform, arch, platform === 'win32'));
  if (platform === 'darwin') await file(fuseFile, binary(platform, arch, true));
  if (platform === 'win32') {
    await file(join(resources, 'app-update.yml'), 'provider: github\nowner: mi1wei\nrepo: cardart\nchannel: beta\n');
    await file(join(resources, 'elevate.exe'), binary(platform, arch));
  }
  return { root, source, appDir, resources, fuseFile, privateKey, addon, platform, arch, file };
}

test('package verification accepts the supported thin target layouts without treating fixtures as runtime acceptance', async (t) => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64']]) {
    const f = await fixture(t, { platform, arch });
    const result = await verifyPackage(f);
    assert.equal(result.version, '0.1.0-beta.1');
    assert.equal(result.target, `${platform}-${arch}`);
  }
});

test('Intel macOS packages and source builds are explicitly unsupported while support is deferred', async (t) => {
  const f = await fixture(t, { platform: 'darwin', arch: 'x64' });
  await assert.rejects(verifyPackage(f), /unsupported package target/i);
  await assert.rejects(validateSourceInputs(f), /unsupported installer target/i);
});

test('host-native ASAR list separators do not change the canonical archive contents', async (t) => {
  const f = await fixture(t);
  const list = asar.listPackage;
  asar.listPackage = (...args) => list(...args).map((name) => name.replaceAll('/', '\\'));
  try { await verifyPackage(f); }
  finally { asar.listPackage = list; }
});

test('Windows native verification requires both libvips DLLs from the Sharp package itself', async (t) => {
  for (const name of ['libvips-42.dll', 'libvips-cpp-8.18.7.dll']) {
    const f = await fixture(t, { platform: 'win32', arch: 'x64' });
    await verifyPackage(f);
    await rm(join(f.source, 'node_modules/@img/sharp-win32-x64/lib', name));
    await rm(join(f.resources, 'app.asar.unpacked'), { recursive: true, force: true });
    await asar.createPackageWithOptions(f.source, join(f.resources, 'app.asar'), {
      dot: true, unpack: '{**/node_modules/sharp/**,**/node_modules/@img/**,**/node_modules/libheif-js/**}',
    });
    await assert.rejects(verifyPackage(f), /missing app payload.*libvips/i);
  }
});

test('a collector-relocated dependency must retain an approved identity and version', async (t) => {
  const valid = await fixture(t, { relocateDependency: true });
  await verifyPackage(valid);
  const changed = await fixture(t, { relocateDependency: true, relocatedVersion: '999.0.0' });
  await assert.rejects(verifyPackage(changed), /unlisted|dependency|version/i);
});

test('an unlisted package cannot pretend to be an approved package by changing only package.json', async (t) => {
  const f = await fixture(t, { extra: { 'node_modules/not-shipped/package.json': { name: 'sharp', version: '0.35.5' } } });
  await assert.rejects(verifyPackage(f), /unlisted|package|unexpected/i);
});

test('missing web content and missing unpacked native binaries fail verification', async (t) => {
  const f = await fixture(t);
  await rm(join(f.resources, 'web/index.html'));
  await assert.rejects(verifyPackage(f), /web.*index\.html/i);
  await f.file(join(f.resources, 'web/index.html'), '<!doctype html><title>Folio</title>');
  await rm(join(f.resources, 'app.asar.unpacked', f.addon));
  await assert.rejects(verifyPackage(f), /native|unpacked|sharp.*node/i);
});

test('macOS retains upstream locale directories without admitting injected files or invented locales', async (t) => {
  const f = await fixture(t);
  await verifyPackage(f);
  await f.file(join(f.resources, 'en.lproj/extra.txt'), 'unexpected resource');
  await assert.rejects(verifyPackage(f), /resource/i);
  await rm(join(f.resources, 'en.lproj/extra.txt'));
  await mkdir(join(f.resources, 'invented.lproj'));
  await assert.rejects(verifyPackage(f), /unexpected.*resource/i);
});

test('user data, private key filenames, test entry points and unlisted dependencies are never valid app payload', async (t) => {
  for (const path of ['library.json', 'desktop/license-private.pem', 'e2e/desktop-entry.cjs', 'scripts/license-issuer.mjs', 'node_modules/playwright/package.json']) {
    const f = await fixture(t, { extra: { [path]: 'owned forbidden fixture' } });
    await assert.rejects(verifyPackage(f), /unexpected|forbidden|unlisted/i, path);
  }
});

test('a wrong-architecture native addon is rejected even when its filename claims the right target', async (t) => {
  const f = await fixture(t, { addonArch: 'x64' });
  await assert.rejects(verifyPackage(f), /architecture/i);
});

test('distribution fuses reject RunAsNode and inspector while the explicit internal profile permits only inspector', async (t) => {
  const f = await fixture(t);
  await flipFuses(f.appDir, { version: FuseVersion.V1, [FuseV1Options.EnableNodeCliInspectArguments]: true });
  await assert.rejects(verifyPackage(f), /fuse.*inspect/i);
  await verifyPackage({ ...f, internalTest: true });
  await flipFuses(f.appDir, { version: FuseVersion.V1, [FuseV1Options.RunAsNode]: true });
  await assert.rejects(verifyPackage({ ...f, internalTest: true }), /fuse.*RunAsNode/i);
});

test('Windows updater metadata cannot change the fixed public beta feed or carry credentials', async (t) => {
  const f = await fixture(t, { platform: 'win32', arch: 'x64' });
  await f.file(join(f.resources, 'app-update.yml'), 'provider: generic\nurl: https://example.test/updates\n');
  await assert.rejects(verifyPackage(f), /update.*feed/i);
  await f.file(join(f.resources, 'app-update.yml'), 'provider: github\nowner: mi1wei\nrepo: cardart\ntoken: owned-test-token\n');
  await assert.rejects(verifyPackage(f), /update.*credential/i);
});

test('a standalone ia32 elevation helper is compatible with an otherwise x64 Windows application', async (t) => {
  const f = await fixture(t, { platform: 'win32', arch: 'x64' });
  const file = join(f.resources, 'elevate.exe');
  const bytes = await readFile(file);
  bytes.writeUInt16LE(0x14c, bytes.readUInt32LE(60) + 4);
  await writeFile(file, bytes);
  await verifyPackage(f);
});

test('packaging never creates a missing public key or accepts a private key in its place', async (t) => {
  const f = await fixture(t, { platform: process.platform, arch: process.arch });
  await rm(join(f.root, 'desktop/license-public.pem'));
  await assert.rejects(validateSourceInputs(f), /maintainer.*public key|license-public\.pem/i);
  await f.file(join(f.root, 'desktop/license-public.pem'), f.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await assert.rejects(validateSourceInputs(f), /public.key/i);
  await assert.rejects(readFile(join(f.root, 'desktop/license-private.pem')), { code: 'ENOENT' });
});

test('an ASAR symlink cannot pull an otherwise valid payload from outside the application bundle', async (t) => {
  const f = await fixture(t);
  const external = join(f.root, 'outside-bundle.asar');
  await rename(join(f.resources, 'app.asar'), external);
  try { await symlink(external, join(f.resources, 'app.asar'), 'file'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows file symlink privilege is unavailable'); return; }
    throw error;
  }
  await assert.rejects(verifyPackage(f), /symlink/i);
});

test('the builder hook enforces the real source-key gate before generating or packaging resources', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-build-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = require('../electron-builder.cjs');
  const { Arch } = require('electron-builder');
  await assert.rejects(config.beforePack({
    electronPlatformName: process.platform, arch: Arch[process.arch], packager: { projectDir: root },
  }), /maintainer.*public key|license-public\.pem/i);
  await assert.rejects(readFile(join(root, 'desktop/license-public.pem')), { code: 'ENOENT' });
});

test('unsigned Windows artifacts are still verified when the builder skips afterSign', async (t) => {
  const f = await fixture(t, { platform: 'win32', arch: 'x64' });
  const config = require('../electron-builder.cjs');
  const { Arch } = require('electron-builder');
  await config.afterPack?.({
    electronPlatformName: 'win32', arch: Arch.x64, appOutDir: f.appDir,
    packager: { projectDir: f.root }, targets: [{ name: 'nsis' }],
  });
  await flipFuses(join(f.appDir, 'Folio.exe'), { version: FuseVersion.V1, [FuseV1Options.RunAsNode]: true });
  await assert.rejects(config.afterAllArtifactBuild(), /fuse.*RunAsNode/i);
});
