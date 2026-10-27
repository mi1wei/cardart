import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const knownLicenses = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'Python-2.0', 'OFL-1.1', 'LGPL-3.0', 'LGPL-3.0-or-later']);
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const safeVersion = (value) => typeof value === 'string' && /^[0-9][0-9A-Za-z.+-]{0,127}$/.test(value);

function inside(root, file) {
  const path = resolve(root, file);
  if (!path.startsWith(root + sep)) throw new Error(`Out-of-tree legal input: ${file}`);
  return path;
}

async function productionPackages(root, metadata, lock) {
  const found = new Map();
  async function visit(name, parent, optional) {
    if (!packageName.test(name)) throw new Error(`Invalid package name: ${name}`);
    let dir;
    let pkg;
    for (let folder = parent; ; folder = dirname(folder)) {
      dir = join(folder, 'node_modules', name);
      try { pkg = await json(join(dir, 'package.json')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (folder === root) {
        if (optional) return;
        throw new Error(`Missing production package: ${name}`);
      }
    }
    const identity = await realpath(dir);
    inside(root, identity);
    if (found.has(identity)) return;
    const location = relative(root, dir).split(sep).join('/');
    if (!safeVersion(pkg.version) || pkg.name !== name || lock.packages[location]?.version !== pkg.version) throw new Error(`${name}: installed version differs from the lockfile or is unsafe`);
    found.set(identity, { dir, location, pkg, integrity: lock.packages[location].integrity });
    const dependencies = { ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const child of Object.keys(dependencies).sort()) {
      await visit(child, dir, Object.hasOwn(pkg.optionalDependencies || {}, child) || pkg.peerDependenciesMeta?.[child]?.optional === true);
    }
  }
  for (const name of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies }).sort()) {
    await visit(name, root, Object.hasOwn(metadata.optionalDependencies || {}, name));
  }
  return [...found.values()].sort((a, b) => `${a.pkg.name}@${a.pkg.version}:${a.location}`.localeCompare(`${b.pkg.name}@${b.pkg.version}:${b.location}`, 'en'));
}

async function inspectRuntime() {
  const profile = await mkdtemp(join(tmpdir(), 'folio-license-inventory-'));
  try {
    const { stdout } = await run(require('electron'), [join(project, 'scripts/inspect-electron-runtime.cjs'), `--user-data-dir=${profile}`], {
      timeout: 30000, maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } finally { await rm(profile, { recursive: true, force: true }); }
}

export async function requireDistributionApproval({ root = project, inventory }) {
  const review = await json(join(root, 'licenses/distribution-review.json'));
  const accepted = review.version === 1 && review.approvals?.some((entry) =>
    entry.inputsDigest === inventory.inputsDigest && ['notices', 'correspondingSources', 'replaceableLibraries', 'codecsAndPatents'].every((field) => entry[field] === true));
  if (!accepted) throw new Error('Distribution review is pending or does not cover these exact inputs, sources and codec obligations');
}

export async function generateNotices({ root = project, runtime } = {}) {
  root = await realpath(root);
  const metadata = await json(join(root, 'package.json'));
  if (!safeVersion(metadata.version)) throw new Error('Invalid application version for the release filename');
  const lock = await json(join(root, 'package-lock.json'));
  const manifestBytes = await readFile(join(root, 'licenses/components.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.version !== 1 || !Array.isArray(manifest.documents) || !Array.isArray(manifest.assets)) throw new Error('Invalid legal component manifest');
  const files = new Map();
  function add(name, bytes) {
    if (files.has(name) && !files.get(name).equals(bytes)) throw new Error(`Conflicting notice content: ${name}`);
    files.set(name, Buffer.from(bytes));
  }
  const documents = [];
  for (const doc of manifest.documents) {
    const source = new URL(doc.source);
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error(`Invalid source provenance: ${doc.file}`);
    const file = inside(root, doc.file);
    inside(root, await realpath(file));
    const bytes = await readFile(file);
    if (!bytes.length || sha256(bytes) !== doc.sha256) throw new Error(`${doc.file}: hash mismatch or empty source material`);
    const target = `materials/${basename(doc.file)}`;
    add(target, bytes);
    documents.push({ ...doc, target });
  }
  for (const asset of manifest.assets) {
    const file = inside(root, asset.file);
    inside(root, await realpath(file));
    if (!asset.provenance || sha256(await readFile(file)) !== asset.sha256) throw new Error(`${asset.file}: hash/provenance mismatch`);
  }
  const dependencies = await productionPackages(root, metadata, lock);
  const packages = [];
  const embedded = [];
  const sections = [];
  for (const { dir, location, pkg, integrity } of dependencies) {
    const id = `${pkg.name}@${pkg.version}`;
    if (!knownLicenses.has(pkg.license)) throw new Error(`${id}: unknown license ${String(pkg.license)}`);
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^(license|licence|copying|notice|copyright)(?:[.\s_-]|$)/i.test(entry.name))
      .map((entry) => entry.name).sort();
    const notices = [];
    for (const name of names) {
      const bytes = await readFile(join(dir, name));
      if (!bytes.length) throw new Error(`${id}: empty license notice`);
      const target = `npm/${id.replaceAll('/', '+')}/${name}`;
      add(target, bytes);
      notices.push({ file: target, sha256: sha256(bytes) });
      sections.push(`${id} (${pkg.license})\n${bytes.toString('utf8')}`);
    }
    const override = manifest.overrides?.[id];
    if (!notices.length && override?.license === pkg.license) {
      for (const file of override.documents || []) {
        const document = documents.find((doc) => doc.file === file);
        if (!document) throw new Error(`${id}: missing verified notice override ${file}`);
        notices.push({ file: document.target, sha256: document.sha256, basis: override.basis });
        sections.push(`${id} (${pkg.license})\n${files.get(document.target).toString('utf8')}`);
      }
    }
    if (!notices.length) throw new Error(`${id}: missing license notice`);
    packages.push({
      name: pkg.name, version: pkg.version, license: pkg.license, location, integrity, notices,
      source: `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
    });
    if (pkg.name.startsWith('@img/sharp-libvips-')) {
      const native = manifest.native;
      if (native.packageVersion !== pkg.version) throw new Error(`${id}: missing matching native source inventory`);
      const versions = await json(join(dir, 'versions.json'));
      for (const [name, version] of Object.entries(versions)) {
        if (name === 'sharp') continue;
        const component = native.components?.[name];
        if (!component?.license || component.version !== version) throw new Error(`${id}: unknown native component/version ${name}@${version}`);
        embedded.push({ name, version, license: component.license, source: native.source, bundle: 'sharp-libvips' });
      }
    }
    if (pkg.name === 'libheif-js') {
      if (manifest.wasm?.packageVersion !== pkg.version || !manifest.wasm.components?.length) throw new Error(`${id}: missing WASM source inventory`);
      embedded.push(...manifest.wasm.components.map((entry) => ({ ...entry, bundle: 'libheif-js/wasm-bundle' })));
    }
  }
  const electronDir = join(root, 'node_modules/electron');
  const electron = await json(join(electronDir, 'package.json'));
  const version = (await readFile(join(electronDir, 'dist/version'), 'utf8')).trim();
  runtime ??= await inspectRuntime();
  if ((runtime.platform && runtime.platform !== process.platform) || (runtime.arch && runtime.arch !== process.arch)) throw new Error('Electron runtime architecture/platform differs from the native target');
  runtime = Object.fromEntries(['electron', 'chrome', 'node', 'v8'].map((name) => [name, runtime[name]]));
  if (version !== electron.version || runtime.electron !== version ||
    !['chrome', 'node', 'v8'].every((name) => typeof runtime[name] === 'string' && /^[A-Za-z0-9._+-]+$/.test(runtime[name]))) throw new Error('Electron runtime version differs from its installed metadata');
  const ffmpeg = manifest.electron?.ffmpeg;
  if (manifest.electron?.version !== version || manifest.electron.chrome !== runtime.chrome ||
    !ffmpeg?.license || !/^[a-f0-9]{40}$/.test(ffmpeg.revision) || !ffmpeg.source?.startsWith('https://')) throw new Error('Missing matching Electron/FFmpeg source revision');
  embedded.push({ name: 'ffmpeg', version: ffmpeg.revision, license: ffmpeg.license, source: ffmpeg.source, bundle: 'electron' });
  for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
    const bytes = await readFile(join(electronDir, 'dist', name));
    if (!bytes.length) throw new Error(`Missing Electron notice: ${name}`);
    add(`electron/${name}`, bytes);
  }
  const inputs = {
    version: metadata.version, target: `${process.platform}-${process.arch}`, runtime,
    packages, embedded: embedded.sort((a, b) => `${a.bundle}:${a.name}`.localeCompare(`${b.bundle}:${b.name}`, 'en')),
    documents, assets: manifest.assets, componentManifest: sha256(manifestBytes),
    electronNotices: ['LICENSE', 'LICENSES.chromium.html'].map((name) => ({ name, sha256: sha256(files.get(`electron/${name}`)) })),
  };
  const inventory = { ...inputs, inputsDigest: sha256(JSON.stringify(inputs)), readyForDistribution: false };
  try { await requireDistributionApproval({ root, inventory }); inventory.readyForDistribution = true; }
  catch (error) { if (!error.message.startsWith('Distribution review')) throw error; }
  const header = [
    `Folio ${metadata.version} - Third-party notices`,
    `Target: ${inputs.target}`,
    `Distribution review: ${inventory.readyForDistribution ? 'approved for these exact inputs' : 'PENDING - NOT CLEARED FOR DISTRIBUTION'}`,
    '',
    'Copyright and license grants below remain with their respective owners.',
    'Electron/Chromium/FFmpeg notices: electron/LICENSE and electron/LICENSES.chromium.html.',
    'Native/WASM build provenance and remaining source-delivery obligations: materials/ and inventory.json.',
    'Source references/build recipes do not by themselves establish complete corresponding-source delivery or patent clearance.',
    '',
  ].join('\n');
  add('THIRD_PARTY_NOTICES.txt', Buffer.from(header + sections.join('\n\n--------------------\n\n')));
  add('inventory.json', Buffer.from(JSON.stringify(inventory, null, 2) + '\n'));
  const release = join(root, 'release');
  await mkdir(release, { recursive: true });
  inside(root, await realpath(release));
  const stage = join(release, `.legal-${randomUUID()}`);
  const temporaryZip = `${stage}.zip`;
  const directory = join(release, 'legal');
  const archive = join(release, `Folio-${metadata.version}-third-party-licenses.zip`);
  try {
    await mkdir(stage);
    const entries = [...files].sort(([a], [b]) => a.localeCompare(b, 'en'));
    for (const [name, bytes] of entries) {
      await mkdir(dirname(join(stage, name)), { recursive: true });
      await writeFile(join(stage, name), bytes);
    }
    const zip = new yazl.ZipFile();
    const output = createWriteStream(temporaryZip, { flags: 'wx' });
    const finished = pipeline(zip.outputStream, output);
    for (const [name, bytes] of entries) {
      zip.addBuffer(bytes, name, { mtime: new Date('1980-01-01T00:00:00Z'), mode: 0o100644 });
    }
    zip.end();
    await finished;
    await rm(directory, { recursive: true, force: true });
    await rename(stage, directory);
    await rename(temporaryZip, archive);
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(temporaryZip, { force: true });
  }
  return { directory, archive, inventory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'require-distribution-approval': { type: 'boolean', default: false } } });
    const result = await generateNotices();
    if (values['require-distribution-approval']) await requireDistributionApproval({ inventory: result.inventory });
    console.log(`Prepared ${result.inventory.packages.length} production packages and ${result.inventory.embedded.length} embedded libraries; distribution review: ${result.inventory.readyForDistribution ? 'approved' : 'pending'}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
