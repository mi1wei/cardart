import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import asar from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';
import yaml from 'js-yaml';
import { parseLicensePublicKey } from '../server/license.js';
import { readBuildIdentity } from './release-identity.cjs';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const targets = new Set(['darwin-arm64', 'win32-x64']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function publicKey(root) {
  let bytes;
  try { bytes = await readFile(join(root, 'desktop/license-public.pem')); }
  catch { throw new Error('Maintainer must supply desktop/license-public.pem before packaging; no default public key is generated'); }
  try { parseLicensePublicKey(bytes); }
  catch { throw new Error('The license public key must be an Ed25519 SPKI PUBLIC KEY, never a private key'); }
  return bytes;
}

export async function validateSourceInputs({ root = project, platform = process.platform, arch = process.arch } = {}) {
  if (!targets.has(`${platform}-${arch}`)) throw new Error(`Unsupported installer target: ${platform}-${arch}`);
  if (platform !== process.platform || arch !== process.arch) throw new Error('Native installer builds must use the matching host platform and architecture');
  await publicKey(root);
  for (const file of ['dist/index.html', 'public/favicon.ico', 'public/icons/folio.icns', 'public/icons/trayTemplate.png', 'public/icons/trayTemplate@2x.png']) {
    if (!(await readFile(join(root, file))).length) throw new Error(`Missing build resource: ${file}`);
  }
}

async function filesIn(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected resource symlink: ${relative(root, file)}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(relative(root, file).split(sep).join('/'));
      else throw new Error(`Unexpected resource type: ${entry.name}`);
    }
  }
  await visit(root);
  return files.sort();
}

async function sameTree(source, destination, label) {
  const expected = await filesIn(source);
  const actual = await filesIn(destination);
  if (expected.length !== actual.length || expected.some((name, i) => name !== actual[i])) {
    const changed = expected.find((name) => !actual.includes(name)) || actual.find((name) => !expected.includes(name));
    throw new Error(`${label}/${changed}: missing or unexpected resource differs from the build whitelist`);
  }
  for (const name of expected) {
    if (hash(await readFile(join(source, name))) !== hash(await readFile(join(destination, name)))) throw new Error(`${label}/${name}: resource hash differs from the build input`);
  }
  return actual;
}

function architecture(bytes, platform, arch, name, allowIa32 = false) {
  let valid = false;
  if (platform === 'darwin' && bytes.length >= 8 && bytes.readUInt32LE(0) === 0xfeedfacf) {
    valid = bytes.readUInt32LE(4) === (arch === 'arm64' ? 0x100000c : 0x1000007);
  } else if (platform === 'win32' && bytes.length >= 64 && bytes.readUInt16LE(0) === 0x5a4d) {
    const pe = bytes.readUInt32LE(60);
    valid = pe <= bytes.length - 6 && bytes.toString('ascii', pe, pe + 4) === 'PE\0\0' &&
      (bytes.readUInt16LE(pe + 4) === 0x8664 || (allowIa32 && bytes.readUInt16LE(pe + 4) === 0x14c));
  }
  if (!valid) throw new Error(`${name}: architecture is not the expected thin ${platform}-${arch} binary`);
}

function ownerOf(path) {
  let end = 0;
  for (const match of path.matchAll(/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+/g)) end = match.index + match[0].length;
  return path.slice(0, end);
}

function permittedWeb(file) {
  return /^(index\.html|favicon\.(svg|ico)|apple-touch-icon\.png|geist-OFL\.txt)$/.test(file) ||
    /^icons\/(folio-1024\.png|folio\.icns|trayTemplate(?:@2x)?\.png)$/.test(file) ||
    /^assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(file) ||
    /^assets\/geist-[A-Za-z0-9_.-]+\.woff2$/.test(file) ||
    /^assets\/home-book-[A-Za-z0-9_-]+\.(jpg|mp4)$/.test(file);
}

function* archiveFiles(files, prefix = '') {
  for (const [part, info] of Object.entries(files)) {
    if (!part || part === '.' || part === '..' || /[\\/]/.test(part)) throw new Error(`Forbidden archive path component: ${part}`);
    const name = prefix ? `${prefix}/${part}` : part;
    if (Object.hasOwn(info, 'link')) throw new Error(`Unexpected archive link: ${name}`);
    if (info.files) yield* archiveFiles(info.files, name);
    else yield [name, info];
  }
}

export async function verifyPackage({ appDir, root = project, platform = process.platform, arch = process.arch, internalTest = false, requireInstallerResources = true, buildEnv = process.env } = {}) {
  if (!targets.has(`${platform}-${arch}`)) throw new Error(`Unsupported package target: ${platform}-${arch}`);
  if (!appDir) throw new Error('An explicit packaged application directory is required');
  appDir = resolve(appDir);
  const resources = platform === 'darwin' ? join(appDir, 'Contents/Resources') : join(appDir, 'resources');
  const archive = join(resources, 'app.asar');
  const expected = readBuildIdentity({ root, env: buildEnv });
  const key = await publicKey(root);
  const allowedTop = new Set(['app.asar', 'app.asar.unpacked', 'web', 'legal', ...(platform === 'darwin' ? ['icon.icns', 'LICENSE.electron.txt', 'LICENSES.chromium.html'] : ['app-update.yml', 'elevate.exe'])]);
  const electronResources = join(root, 'node_modules/electron/dist/Electron.app/Contents/Resources');
  const locales = platform === 'darwin' ? new Set((await readdir(electronResources, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.lproj')).map((entry) => entry.name)) : new Set();
  if ((await lstat(resources)).isSymbolicLink()) throw new Error('Unexpected resources directory symlink');
  for (const entry of await readdir(resources, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected application resource symlink: ${entry.name}`);
    if (entry.isDirectory() && locales.has(entry.name)) {
      await sameTree(join(electronResources, entry.name), join(resources, entry.name), `resource ${entry.name}`);
      continue;
    }
    if (!allowedTop.has(entry.name)) throw new Error(`Unexpected application resource: ${entry.name}`);
  }
  const inventory = await json(join(resources, 'legal/inventory.json'));
  if (inventory.version !== expected.version || inventory.target !== `${platform}-${arch}` || !Array.isArray(inventory.packages)) throw new Error('Legal inventory version/target differs from the package');
  const allowedPackages = new Map(inventory.packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
  asar.uncache(archive);
  const entries = [...archiveFiles(asar.getRawHeader(archive).header.files)];
  const payload = entries.map(([name]) => name);
  const unpacked = new Set(entries.filter(([, info]) => info.unpacked).map(([name]) => name));
  const physical = await filesIn(join(resources, 'app.asar.unpacked'));
  if (physical.join('\n') !== [...unpacked].sort().join('\n')) throw new Error('Unpacked resource whitelist differs from the ASAR header');
  function content(name) {
    if (!payload.includes(name)) throw new Error(`Missing app payload: ${name}`);
    try { return asar.extractFile(archive, name.split('/').join(sep), false); }
    catch (cause) { throw new Error(`Missing native/unpacked app file: ${name}`, { cause }); }
  }
  const packaged = new Map();
  for (const name of payload.filter((name) => name.startsWith('node_modules/') && name.endsWith('/package.json'))) {
    const owner = ownerOf(name);
    if (name !== `${owner}/package.json`) continue;
    let metadata;
    try { metadata = JSON.parse(content(name)); }
    catch (cause) { throw new Error(`Unexpected/unlisted package metadata: ${name}`, { cause }); }
    const id = `${metadata.name}@${metadata.version}`;
    const approved = allowedPackages.get(id);
    const expectedName = owner.slice(owner.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!approved || metadata.name !== expectedName || (approved.license && metadata.license !== approved.license)) throw new Error(`Unexpected/unlisted dependency identity/version: ${name}`);
    packaged.set(owner, { ...metadata, id });
  }
  for (const [name, info] of entries) {
    if (name !== 'desktop/license-public.pem' && (
      /\.(pem|p12|pfx|key|crt|cer)$/i.test(name) ||
      /(?:^|\/)(?:\.env(?:\..*)?|library\.json|album\.json|license\.json|runtime\.json|desktop\.json)$/.test(name) ||
      /\.test\.(js|cjs|mjs)$/.test(name)
    )) throw new Error(`Forbidden app payload: ${name}`);
    const nodeModule = name.startsWith('node_modules/');
    const dependency = packaged.get(ownerOf(name));
    if (nodeModule ? !dependency : !(
      name === 'package.json' || name === 'desktop/license-public.pem' || name === 'shared/media.js' ||
      /^desktop\/[A-Za-z0-9-]+\.cjs$/.test(name) || /^server\/[A-Za-z0-9-]+\.(js|cjs)$/.test(name)
    )) throw new Error(`Unexpected/unlisted app payload: ${name}`);
    const nativeModule = dependency && (['sharp', 'libheif-js'].includes(dependency.name) || dependency.name.startsWith('@img/'));
    if (nativeModule && !info.unpacked) throw new Error(`Native/WASM package must be unpacked: ${name}`);
  }
  const metadata = JSON.parse(content('package.json'));
  if (metadata.version !== expected.version || metadata.main !== 'desktop/main.cjs' || metadata.type !== 'module') throw new Error('Packaged entry point/version is invalid');
  if (expected.tag && (metadata.folioBuild?.tag !== expected.tag || metadata.folioBuild.sourceCommit !== expected.sourceCommit)) throw new Error('Packaged build tag/source identity is invalid');
  for (const name of ['desktop/main.cjs', 'desktop/service.cjs', 'server/app.js', 'server/heic-worker.cjs', 'server/license.js', 'server/license-store.js', 'server/video-container.js', 'server/video-importer.js', 'server/video-metadata.js', 'shared/media.js']) content(name);
  const packedKey = content('desktop/license-public.pem');
  parseLicensePublicKey(packedKey);
  if (hash(packedKey) !== hash(key)) throw new Error('Packaged license public key differs from the maintainer source key');
  for (const pkg of inventory.packages) {
    if (![...packaged.values()].some((actual) => actual.id === `${pkg.name}@${pkg.version}`)) throw new Error(`Packaged dependency differs from legal inventory: ${pkg.name}@${pkg.version}`);
  }
  const native = `${platform}-${arch}`;
  const nativePackage = JSON.parse(content(`node_modules/@img/sharp-${native}/package.json`));
  const addon = `node_modules/@img/sharp-${native}/lib/sharp-${native}-${nativePackage.version}.node`;
  architecture(content(addon), platform, arch, addon);
  const vipsRoot = `node_modules/@img/${platform === 'win32' ? 'sharp' : 'sharp-libvips'}-${native}`;
  const vips = platform === 'win32'
    ? [
      `${vipsRoot}/lib/libvips-42.dll`,
      `${vipsRoot}/lib/libvips-cpp-${JSON.parse(content(`${vipsRoot}/versions.json`)).vips}.dll`,
    ]
    : payload.filter((name) => name.startsWith(`${vipsRoot}/lib/`) && /\.dylib$/.test(name));
  if (!vips.length) throw new Error('Missing unpacked native libvips binary');
  for (const name of vips) content(name);
  for (const name of payload.filter((name) => /\.(node|dll|dylib)$/.test(name))) architecture(content(name), platform, arch, name);
  const sharpPackage = JSON.parse(content('node_modules/sharp/package.json'));
  const sharpEntries = [sharpPackage.main, sharpPackage.exports?.['.']?.import?.default, sharpPackage.exports?.['.']?.require?.default];
  if (!sharpEntries[0]) throw new Error('Missing sharp package entry point');
  for (const entry of sharpEntries.filter(Boolean)) content(`node_modules/sharp/${entry.replace(/^\.\//, '')}`);
  for (const name of ['node_modules/libheif-js/wasm-bundle.js', 'node_modules/libheif-js/libheif-wasm/libheif-bundle.js']) content(name);
  const web = await sameTree(join(root, 'dist'), join(resources, 'web'), 'web');
  if (!web.includes('index.html')) throw new Error('Missing web/index.html');
  for (const name of web) if (!permittedWeb(name)) throw new Error(`Unexpected web resource: ${name}`);
  await sameTree(join(root, 'release/legal'), join(resources, 'legal'), 'legal');
  for (const name of ['favicon.ico', 'icons/trayTemplate.png', 'icons/trayTemplate@2x.png']) {
    if (!web.includes(name)) throw new Error(`Missing web tray/icon resource: ${name}`);
  }
  for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
    const file = join(platform === 'darwin' ? resources : appDir, name === 'LICENSE' ? 'LICENSE.electron.txt' : name);
    if (hash(await readFile(file)) !== hash(await readFile(join(root, 'node_modules/electron/dist', name)))) throw new Error(`Electron notice was removed or altered: ${name}`);
  }
  const executable = platform === 'darwin' ? join(appDir, 'Contents/MacOS/Folio') : join(appDir, 'Folio.exe');
  architecture(await readFile(executable), platform, arch, 'Folio executable');
  if (platform === 'darwin') {
    architecture(await readFile(join(appDir, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')), platform, arch, 'Electron Framework');
    if (hash(await readFile(join(resources, 'icon.icns'))) !== hash(await readFile(join(root, 'public/icons/folio.icns')))) throw new Error('macOS application icon differs from the shared brand');
  } else {
    let update;
    try { update = await readFile(join(resources, 'app-update.yml'), 'utf8'); }
    catch (error) { if (requireInstallerResources || error.code !== 'ENOENT') throw error; }
    if (update !== undefined) {
      const feed = yaml.load(update);
      if (feed?.provider !== 'github' || feed.owner !== 'mi1wei' || feed.repo !== 'cardart' || (feed.channel !== undefined && feed.channel !== 'beta')) throw new Error('Windows update feed must be the fixed public beta repository');
      if (['token', 'requestHeaders', 'username', 'password', 'url'].some((name) => Object.hasOwn(feed, name)) || feed.private === true) throw new Error('Windows update metadata must not contain credentials or alternate URLs');
    }
    try { architecture(await readFile(join(resources, 'elevate.exe')), platform, arch, 'NSIS elevation helper', true); }
    catch (error) { if (requireInstallerResources || error.code !== 'ENOENT') throw error; }
  }
  const fuses = await getCurrentFuseWire(platform === 'darwin' ? appDir : executable);
  for (const [option, enabled, label] of [
    [FuseV1Options.RunAsNode, false, 'RunAsNode'],
    [FuseV1Options.EnableCookieEncryption, false, 'cookie encryption'],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false, 'NodeOptions'],
    [FuseV1Options.EnableNodeCliInspectArguments, internalTest, 'inspector'],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true, 'ASAR integrity'],
    [FuseV1Options.OnlyLoadAppFromAsar, true, 'ASAR-only loading'],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, false, 'file protocol privileges'],
  ]) if (fuses[option] !== (enabled ? 49 : 48)) throw new Error(`Invalid fuse policy: ${label}`);
  return { version: metadata.version, target: `${platform}-${arch}`, files: payload.length, internalTest, readyForDistribution: inventory.readyForDistribution === true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      app: { type: 'string' }, platform: { type: 'string', default: process.platform },
      arch: { type: 'string', default: process.arch }, 'internal-test': { type: 'boolean', default: false },
    } });
    console.log(JSON.stringify(await verifyPackage({ appDir: values.app, platform: values.platform, arch: values.arch, internalTest: values['internal-test'] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
