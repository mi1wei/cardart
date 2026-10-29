import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, lstat, open, mkdir, cp, mkdtemp, rmdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import yaml from 'js-yaml';
import yauzl from 'yauzl';
import asar from '@electron/asar';
import electronBuilder from 'electron-builder';
import { blake2b } from '@noble/hashes/blake2.js';
import { verifyPackage } from './verify-package.mjs';
import { smokePackage } from './package-smoke.mjs';
import { requireDistributionApproval } from './third-party-notices.mjs';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const run = promisify(execFile);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const releaseTargets = ['darwin-arm64', 'win32-x64'];

export async function fileDigest(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Not a regular release file: ${basename(file)}`);
  const sha256 = createHash('sha256');
  const sha512 = createHash('sha512');
  let size = 0;
  for await (const bytes of createReadStream(file)) { size += bytes.length; sha256.update(bytes); sha512.update(bytes); }
  if (size !== info.size) throw new Error(`Release file size changed during verification: ${basename(file)}`);
  return { name: basename(file), size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') };
}

export async function verifyWindowsUpdate({ installer, update, blockmap, version }) {
  const actual = await fileDigest(installer);
  const expected = `Folio-${version}-windows-x64-setup.exe`;
  if (actual.name !== expected || basename(update) !== 'beta.yml' || basename(blockmap) !== `${expected}.blockmap`) throw new Error('Windows update filename is not the expected beta installer');
  const metadata = yaml.load(await readFile(update, 'utf8'));
  if (metadata?.version !== version) throw new Error('Windows update version differs from the installer');
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1 || metadata.files[0].url !== expected || metadata.path !== expected) throw new Error('Windows update filename/URL must refer only to this installer');
  const entry = metadata.files[0];
  if (entry.sha512 !== actual.sha512 || metadata.sha512 !== actual.sha512) throw new Error('Windows update SHA-512 hash mismatch');
  if (entry.size !== actual.size) throw new Error('Windows update size mismatch');
  if (entry.isAdminRightsRequired !== true) throw new Error('Windows per-machine update is missing elevation metadata');
  const map = JSON.parse(gunzipSync(await readFile(blockmap), { maxOutputLength: 32 * 1024 * 1024 }));
  if (map.version !== '2' || map.files?.length !== 1 || map.files[0].offset !== 0 || map.files[0].name !== 'file') throw new Error('Unsupported Windows blockmap layout');
  const blocks = map.files[0];
  if (!Array.isArray(blocks.sizes) || blocks.sizes.length !== blocks.checksums?.length || !blocks.sizes.length ||
    blocks.sizes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > 16 * 1024 * 1024) ||
    blocks.sizes.reduce((sum, size) => sum + size, 0) !== actual.size) throw new Error('Windows blockmap size/coverage mismatch');
  const handle = await open(installer, 'r');
  try {
    let position = 0;
    for (let i = 0; i < blocks.sizes.length; i++) {
      const buffer = Buffer.alloc(blocks.sizes[i]);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead !== buffer.length || Buffer.from(blake2b(buffer, { dkLen: 18 })).toString('base64') !== blocks.checksums[i]) throw new Error(`Windows blockmap checksum mismatch at block ${i}`);
      position += buffer.length;
    }
  } finally { await handle.close(); }
}

export function verifyWindowsExecutableMetadata(state, { file, version, productVersion = version, fileVersion = version }) {
  if (state.status !== 'NotSigned' || state.productName !== 'Folio' || state.productVersion !== productVersion || state.fileVersion !== fileVersion) {
    const actual = { status: state.status, productName: state.productName, productVersion: state.productVersion, fileVersion: state.fileVersion };
    throw new Error(`${basename(file)}: Windows trust/product metadata differs from the expected unsigned Folio build: ${JSON.stringify(actual)}`);
  }
}

export async function readLegalArchive(file, { version, target }) {
  const files = await new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      const result = new Map();
      let total = 0;
      function fail(error) { zip.close(); reject(error); }
      zip.on('error', fail);
      zip.on('end', () => resolve(result));
      zip.on('entry', (entry) => {
        const name = entry.fileName;
        if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').some((part) => !part || part === '..') ||
          /(?:^|\/)(?:\.env|\.git|license-private\.pem)/.test(name) || result.has(name) ||
          (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000 || entry.uncompressedSize > 32 * 1024 * 1024 ||
          (total += entry.uncompressedSize) > 64 * 1024 * 1024) return fail(new Error(`Forbidden/oversized legal ZIP entry: ${name}`));
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', (bytes) => chunks.push(bytes));
          stream.on('end', () => { result.set(name, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
  const inventory = JSON.parse(files.get('inventory.json')?.toString() || 'null');
  if (!inventory || inventory.version !== version || inventory.target !== target) throw new Error('Legal ZIP version/target mismatch');
  const { inputsDigest, readyForDistribution, ...inputs } = inventory;
  if (inputsDigest !== digest(JSON.stringify(inputs))) throw new Error('Legal inventory input digest mismatch');
  const allowed = new Set(['inventory.json', 'THIRD_PARTY_NOTICES.txt', 'electron/LICENSE', 'electron/LICENSES.chromium.html']);
  const notices = [
    ...(inventory.documents || []).map((entry) => ({ file: entry.target, sha256: entry.sha256 })),
    ...(inventory.packages || []).flatMap((pkg) => pkg.notices || []),
    ...(inventory.electronNotices || []).map((entry) => ({ file: `electron/${entry.name}`, sha256: entry.sha256 })),
  ];
  for (const entry of notices) {
    if (typeof entry.file !== 'string' || !files.has(entry.file) || digest(files.get(entry.file)) !== entry.sha256) throw new Error('Legal ZIP is missing an original notice or its hash differs');
    allowed.add(entry.file);
  }
  for (const name of allowed) if (!files.get(name)?.length) throw new Error(`Missing legal ZIP material: ${name}`);
  for (const name of files.keys()) if (!allowed.has(name)) throw new Error(`Unexpected legal ZIP material: ${name}`);
  return { files, inventory };
}

export async function verifyCandidateFiles({ folder, report, version, tag, sourceCommit, root = project, requireReview = true }) {
  if (report.schemaVersion !== 1 || report.version !== version || report.tag !== tag) throw new Error('Candidate version/tag mismatch');
  if (report.sourceCommit !== sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Candidate source commit mismatch');
  if (!releaseTargets.includes(report.target)) throw new Error('Unknown candidate target');
  const windows = report.target === 'win32-x64';
  if (report.signing !== (windows ? 'unsigned' : 'adhoc') || report.notarized !== false ||
    !['package', 'smoke', 'artifact', 'trustState'].every((name) => report.checks?.[name] === true)) throw new Error('Candidate native checks/signing state are incomplete');
  const installer = windows ? `Folio-${version}-windows-x64-setup.exe` : `Folio-${version}-macos-${report.target.split('-')[1]}.dmg`;
  const roles = new Map([
    [installer, 'installer'], [`Folio-${version}-third-party-licenses.zip`, 'licenses'],
    ...(windows ? [['beta.yml', 'windows-metadata'], [`${installer}.blockmap`, 'windows-blockmap']] : []),
  ]);
  if (!Array.isArray(report.files) || report.files.length !== roles.size || new Set(report.files.map((file) => file.name)).size !== roles.size) throw new Error('Candidate file whitelist is incomplete or duplicated');
  const disk = await readdir(folder, { withFileTypes: true });
  if (disk.some((entry) => !entry.isFile() || (!roles.has(entry.name) && entry.name !== 'candidate-report.json')) || disk.length !== roles.size + 1) throw new Error('Unexpected candidate file outside the whitelist');
  for (const file of report.files) {
    if (roles.get(file.name) !== file.role) throw new Error('Candidate filename/role mismatch');
    const actual = await fileDigest(join(folder, file.name));
    if (['size', 'sha256', 'sha512'].some((key) => actual[key] !== file[key])) throw new Error(`Candidate hash/size mismatch: ${file.name}`);
  }
  if (windows) await verifyWindowsUpdate({ installer: join(folder, installer), update: join(folder, 'beta.yml'), blockmap: join(folder, `${installer}.blockmap`), version });
  const legal = await readLegalArchive(join(folder, `Folio-${version}-third-party-licenses.zip`), { version, target: report.target });
  if (report.legalInputsDigest !== legal.inventory.inputsDigest) throw new Error('Candidate legal-input digest mismatch');
  if (requireReview) {
    if (legal.inventory.readyForDistribution !== true) throw new Error('Pending legal bundle must be regenerated after distribution review');
    await requireDistributionApproval({ root, inventory: legal.inventory });
  }
  return legal;
}

export async function verifyNativeRelease({ appDir, artifact, output, root = project, platform = process.platform, arch = process.arch, sourceCommit, tag = null, requireReview = false } = {}) {
  root = resolve(root);
  const target = `${platform}-${arch}`;
  if (!releaseTargets.includes(target) || platform !== process.platform || arch !== process.arch) throw new Error('Release verification requires the matching native host');
  const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  sourceCommit ||= head;
  if (sourceCommit !== head || (await run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root })).stdout.trim()) throw new Error('Native candidate must come from the exact clean source commit');
  const checked = await verifyPackage({ appDir, root, platform, arch });
  const expectedName = platform === 'darwin' ? `Folio-${checked.version}-macos-${arch}.dmg` : `Folio-${checked.version}-windows-x64-setup.exe`;
  if (basename(artifact || '') !== expectedName || (tag && tag !== `v${checked.version}`)) throw new Error('Native artifact name/version/tag mismatch');
  const resources = platform === 'darwin' ? join(appDir, 'Contents/Resources') : join(appDir, 'resources');
  const metadata = JSON.parse(asar.extractFile(join(resources, 'app.asar'), 'package.json'));
  if (metadata.folioBuild?.sourceCommit !== head || metadata.folioBuild?.dirty !== false) throw new Error('Packaged source commit differs from the clean candidate source');
  if (tag && metadata.folioBuild.tag !== tag) throw new Error('Packaged build tag differs from the candidate');
  const legal = await readLegalArchive(join(root, `release/Folio-${checked.version}-third-party-licenses.zip`), { version: checked.version, target });
  if (requireReview) {
    if (legal.inventory.readyForDistribution !== true) throw new Error('Pending legal bundle must be regenerated after distribution review');
    await requireDistributionApproval({ root, inventory: legal.inventory });
  }
  const smoke = await smokePackage({ appDir, platform });
  if (platform === 'darwin') {
    await run('codesign', ['--verify', '--deep', '--strict', appDir]);
    const signing = await run('codesign', ['--display', '--verbose=2', appDir]);
    if (!/Signature=adhoc/.test(signing.stderr)) throw new Error('Expected only local ad-hoc macOS signing');
    await run('hdiutil', ['verify', artifact]);
    const mount = await mkdtemp(join(root, 'release/dmg-verification-'));
    let attached = false;
    try {
      await run('hdiutil', ['attach', artifact, '-readonly', '-nobrowse', '-mountpoint', mount]);
      attached = true;
      await verifyPackage({ appDir: join(mount, 'Folio.app'), root, platform, arch });
      await smokePackage({ appDir: join(mount, 'Folio.app'), platform });
    } finally {
      if (attached) await run('hdiutil', ['detach', mount]);
      await rmdir(mount);
    }
  } else {
    // The app's PE ProductVersion is numeric; FileVersion retains the complete beta identity.
    const appInfo = new electronBuilder.AppInfo({ metadata, config: { productName: 'Folio' } });
    for (const [file, productVersion, fileVersion] of [
      [join(appDir, 'Folio.exe'), appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(), appInfo.shortVersion || appInfo.buildVersion],
      [artifact, checked.version, appInfo.buildVersion],
    ]) {
      const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(root, 'build/inspect-signature.ps1'), '-Path', file]);
      const state = JSON.parse(result.stdout);
      verifyWindowsExecutableMetadata(state, { file, version: checked.version, productVersion, fileVersion });
    }
    await verifyWindowsUpdate({
      installer: artifact, update: join(root, 'release/beta.yml'), blockmap: `${artifact}.blockmap`, version: checked.version,
    });
  }
  const selected = [
    [artifact, 'installer'], [join(root, `release/Folio-${checked.version}-third-party-licenses.zip`), 'licenses'],
    ...(platform === 'win32' ? [[join(root, 'release/beta.yml'), 'windows-metadata'], [`${artifact}.blockmap`, 'windows-blockmap']] : []),
  ];
  output = resolve(output || join(root, `release/candidate-${target}`));
  if (!output.startsWith(join(root, 'release') + sep)) throw new Error('Candidate output must stay inside this checkout release directory');
  const report = {
    schemaVersion: 1, version: checked.version, tag, sourceCommit, target,
    signing: platform === 'darwin' ? 'adhoc' : 'unsigned', notarized: false,
    checks: { package: true, smoke: true, artifact: true, trustState: true },
    smoke, legalInputsDigest: legal.inventory.inputsDigest,
    files: await Promise.all(selected.map(async ([file, role]) => ({ ...(await fileDigest(file)), role }))),
  };
  await mkdir(output);
  for (const [file] of selected) await cp(file, join(output, basename(file)), { errorOnExist: true, force: false });
  await writeFile(join(output, 'candidate-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      app: { type: 'string' }, artifact: { type: 'string' }, output: { type: 'string' },
      commit: { type: 'string' }, tag: { type: 'string' }, 'require-distribution-approval': { type: 'boolean', default: false },
    } });
    console.log(JSON.stringify(await verifyNativeRelease({
      appDir: values.app, artifact: values.artifact, output: values.output,
      sourceCommit: values.commit, tag: values.tag, requireReview: values['require-distribution-approval'],
    })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
