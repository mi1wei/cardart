import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import asar from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';
import yaml from 'js-yaml';
import { parseLicensePublicKey } from '../server/license.js';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const targets = new Set(['darwin-arm64', 'darwin-x64', 'win32-x64']);
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

export async function verifyPackage({ appDir, root = project, platform = process.platform, arch = process.arch, internalTest = false, requireInstallerResources = true } = {}) {
  if (!targets.has(`${platform}-${arch}`)) throw new Error(`Unsupported package target: ${platform}-${arch}`);
  if (!appDir) throw new Error('An explicit packaged application directory is required');
  appDir = resolve(appDir);
  const resources = platform === 'darwin' ? join(appDir, 'Contents/Resources') : join(appDir, 'resources');
  const archive = join(resources, 'app.asar');
  const expected = await json(join(root, 'package.json'));
  const key = await publicKey(root);
  const allowedTop = new Set(['app.asar', 'app.asar.unpacked', 'web', 'legal', ...(platform === 'darwin' ? ['icon.icns', 'LICENSE.electron.txt', 'LICENSES.chromium.html'] : ['app-update.yml', 'elevate.exe'])]);
  if ((await lstat(resources)).isSymbolicLink()) throw new Error('Unexpected resources directory symlink');
  for (const entry of await readdir(resources, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected application resource symlink: ${entry.name}`);
    if (!allowedTop.has(entry.name)) throw new Error(`Unexpected application resource: ${entry.name}`);
  }
  const inventory = await json(join(resources, 'legal/inventory.json'));
  if (inventory.version !== expected.version || inventory.target !== `${platform}-${arch}` || !Array.isArray(inventory.packages)) throw new Error('Legal inventory version/target differs from the package');
  const allowedPackages = new Set(inventory.packages.map((pkg) => pkg.location));
  asar.uncache(archive);
  const unpacked = new Set();
  const payload = [];
  for (const raw of asar.listPackage(archive, { isPack: false })) {
    const name = raw.replace(/^\//, '');
    if (name.includes('\\') || name.split('/').some((part) => part === '..' || !part)) throw new Error(`Forbidden archive path: ${name}`);
    const info = asar.statFile(archive, name, false);
    if (info.link) throw new Error(`Unexpected archive link: ${name}`);
    if (info.files) continue;
    if (name !== 'desktop/license-public.pem' && (
      /\.(pem|p12|pfx|key|crt|cer)$/i.test(name) ||
      /(?:^|\/)(?:\.env(?:\..*)?|library\.json|album\.json|license\.json|runtime\.json|desktop\.json)$/.test(name) ||
      /\.test\.(js|cjs|mjs)$/.test(name)
    )) throw new Error(`Forbidden app payload: ${name}`);
    const nodeModule = name.startsWith('node_modules/');
    if (nodeModule ? !allowedPackages.has(ownerOf(name)) : !(
      name === 'package.json' || name === 'desktop/license-public.pem' ||
      /^desktop\/[A-Za-z0-9-]+\.cjs$/.test(name) || /^server\/[A-Za-z0-9-]+\.(js|cjs)$/.test(name)
    )) throw new Error(`Unexpected/unlisted app payload: ${name}`);
    const nativeModule = /^node_modules\/(sharp|@img\/[^/]+|libheif-js)\//.test(name);
    if (nativeModule && !info.unpacked) throw new Error(`Native/WASM package must be unpacked: ${name}`);
    if (info.unpacked) unpacked.add(name);
    payload.push(name);
  }
  function content(name) {
    if (!payload.includes(name)) throw new Error(`Missing app payload: ${name}`);
    try { return asar.extractFile(archive, name, false); }
    catch (cause) { throw new Error(`Missing native/unpacked app file: ${name}`, { cause }); }
  }
  const metadata = JSON.parse(content('package.json'));
  if (metadata.version !== expected.version || metadata.main !== 'desktop/main.cjs' || metadata.type !== 'module') throw new Error('Packaged entry point/version is invalid');
  for (const name of ['desktop/main.cjs', 'desktop/service.cjs', 'server/app.js', 'server/heic-worker.cjs', 'server/license.js', 'server/license-store.js']) content(name);
  const packedKey = content('desktop/license-public.pem');
  parseLicensePublicKey(packedKey);
  if (hash(packedKey) !== hash(key)) throw new Error('Packaged license public key differs from the maintainer source key');
  for (const pkg of inventory.packages) {
    const actual = JSON.parse(content(`${pkg.location}/package.json`));
    if (actual.name !== pkg.name || actual.version !== pkg.version) throw new Error(`Packaged dependency differs from legal inventory: ${pkg.name}`);
  }
  const physical = await filesIn(join(resources, 'app.asar.unpacked'));
  if (physical.join('\n') !== [...unpacked].sort().join('\n')) throw new Error('Unpacked resource whitelist differs from the ASAR header');
  const native = `${platform}-${arch}`;
  const addon = `node_modules/@img/sharp-${native}/lib/sharp-${native}.node`;
  architecture(content(addon), platform, arch, addon);
  const vips = payload.filter((name) => name.startsWith(`node_modules/@img/sharp-libvips-${native}/lib/`) && /\.(dll|dylib)$/.test(name));
  if (!vips.length) throw new Error('Missing unpacked native libvips binary');
  for (const name of payload.filter((name) => /\.(node|dll|dylib)$/.test(name))) architecture(content(name), platform, arch, name);
  for (const name of ['node_modules/sharp/lib/index.js', 'node_modules/libheif-js/wasm-bundle.js', 'node_modules/libheif-js/libheif-wasm/libheif-bundle.js']) content(name);
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
    [FuseV1Options.EnableCookieEncryption, true, 'cookie encryption'],
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
