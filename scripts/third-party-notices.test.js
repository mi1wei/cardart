import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import yauzl from 'yauzl';
import { generateNotices, requireDistributionApproval } from './third-party-notices.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const runtime = { electron: '9.9.9', chrome: '99.0.0', node: '24.0.0', v8: '9.0' };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lock = { lockfileVersion: 3, packages: {} };
  async function file(path, data) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
  }
  async function pkg(path, metadata, notice = 'MIT fixture notice') {
    await file(`${path}/package.json`, metadata);
    if (notice !== null) await file(`${path}/LICENSE`, notice);
    lock.packages[path] = { version: metadata.version };
    await file('package-lock.json', lock);
  }
  await file('package.json', {
    name: 'folio', version: '0.1.0-beta.1',
    dependencies: { alpha: '1.0.0', beta: '2.0.0' }, devDependencies: { electron: '9.9.9', 'not-shipped': '1.0.0' },
  });
  await pkg('node_modules/alpha', { name: 'alpha', version: '1.0.0', license: 'MIT', dependencies: { gamma: '1.0.0' }, optionalDependencies: { absent: '1.0.0' } });
  await pkg('node_modules/beta', { name: 'beta', version: '2.0.0', license: 'ISC', dependencies: { gamma: '2.0.0' } }, 'ISC fixture notice');
  await pkg('node_modules/gamma', { name: 'gamma', version: '1.0.0', license: 'MIT' });
  await pkg('node_modules/beta/node_modules/gamma', { name: 'gamma', version: '2.0.0', license: 'MIT' });
  await pkg('node_modules/not-shipped', { name: 'not-shipped', version: '1.0.0', license: 'Unknown' }, null);
  await pkg('node_modules/electron', { name: 'electron', version: '9.9.9', license: 'MIT' });
  await file('node_modules/electron/dist/LICENSE', 'Electron fixture notice');
  await file('node_modules/electron/dist/LICENSES.chromium.html', '<p>Chromium and FFmpeg fixture notice</p>');
  await file('node_modules/electron/dist/version', '9.9.9');
  const sources = 'Pinned native build and source-reference fixture';
  const image = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  await file('licenses/native-build.txt', sources);
  await file('src/assets/hero.svg', image);
  const manifest = {
    version: 1,
    documents: [{ file: 'licenses/native-build.txt', sha256: hash(sources), source: 'https://example.test/commit/123/build' }],
    assets: [{ file: 'src/assets/hero.svg', sha256: hash(image), provenance: 'Project-original fixture' }],
    overrides: {}, native: {}, wasm: null,
    electron: { version: '9.9.9', chrome: '99.0.0', ffmpeg: {
      revision: '1111111111111111111111111111111111111111', license: 'LGPL-2.1-or-later',
      source: 'https://example.test/ffmpeg/1111111111111111111111111111111111111111',
    } },
  };
  await file('licenses/components.json', manifest);
  await file('licenses/distribution-review.json', { version: 1, approvals: [] });
  return { root, file, pkg, manifest };
}

async function unzip(path) {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

test('notices follow the installed production graph, preserve nested versions and match the legal ZIP', async (t) => {
  const { root } = await fixture(t);
  const result = await generateNotices({ root, runtime });
  assert.deepEqual(result.inventory.packages.map((pkg) => `${pkg.name}@${pkg.version}`).sort(), ['alpha@1.0.0', 'beta@2.0.0', 'gamma@1.0.0', 'gamma@2.0.0']);
  assert.equal(result.inventory.readyForDistribution, false);
  assert.equal(result.inventory.embedded.find((entry) => entry.name === 'ffmpeg').version, '1111111111111111111111111111111111111111');
  const files = await unzip(result.archive);
  const inventory = JSON.parse(files.get('inventory.json'));
  assert.equal(inventory.inputsDigest, result.inventory.inputsDigest);
  assert.match(files.get('THIRD_PARTY_NOTICES.txt').toString(), /alpha@1\.0\.0/);
  assert.match(files.get('THIRD_PARTY_NOTICES.txt').toString(), /ISC fixture notice/);
  assert.equal(files.get('electron/LICENSE').toString(), 'Electron fixture notice');
  assert.equal(files.get('electron/LICENSES.chromium.html').toString(), '<p>Chromium and FFmpeg fixture notice</p>');
  for (const [name, bytes] of files) assert.deepEqual(await readFile(join(result.directory, name)), bytes, name);
});

test('unknown licenses and missing notices fail instead of silently publishing an incomplete inventory', async (t) => {
  const { root, pkg } = await fixture(t);
  await pkg('node_modules/alpha', { name: 'alpha', version: '1.0.0', license: 'Unreviewed-Custom' });
  await assert.rejects(generateNotices({ root, runtime }), /alpha.*license/i);
  await pkg('node_modules/alpha', { name: 'alpha', version: '1.0.0', license: 'MIT' }, null);
  await rm(join(root, 'node_modules/alpha/LICENSE'));
  await assert.rejects(generateNotices({ root, runtime }), /alpha.*notice/i);
});

test('Windows Sharp preserves its combined license and inventories the libvips bundled in the same package', async (t) => {
  const { root, file, pkg, manifest } = await fixture(t);
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const name = '@img/sharp-win32-x64';
  const location = `node_modules/${name}`;
  const license = 'Apache-2.0 AND LGPL-3.0-or-later';
  await file('package.json', { ...metadata, dependencies: { ...metadata.dependencies, [name]: '0.35.5' } });
  await pkg(location, { name, version: '0.35.5', license }, 'Windows Apache and LGPL fixture notice');
  manifest.native = {
    packageVersion: '1.3.4', source: 'https://example.test/native-build',
    components: {
      vips: { version: '8.18.7', license: 'LGPL-3.0-or-later' },
      'proxy-libintl': { version: '0.5', license: 'LGPL-3.0-or-later' },
    },
  };
  await file('licenses/components.json', manifest);
  await file(`${location}/versions.json`, { vips: '8.18.7', 'proxy-libintl': '0.5' });
  const result = await generateNotices({ root, runtime });
  assert.equal(result.inventory.packages.find((entry) => entry.name === name).license, license);
  assert.deepEqual(result.inventory.embedded.filter((entry) => entry.bundle === 'sharp-libvips'), [
    { name: 'proxy-libintl', version: '0.5', license: 'LGPL-3.0-or-later', source: 'https://example.test/native-build', bundle: 'sharp-libvips' },
    { name: 'vips', version: '8.18.7', license: 'LGPL-3.0-or-later', source: 'https://example.test/native-build', bundle: 'sharp-libvips' },
  ]);
  const files = await unzip(result.archive);
  assert.equal(files.get('npm/@img+sharp-win32-x64@0.35.5/LICENSE').toString(), 'Windows Apache and LGPL fixture notice');
  assert.equal(result.inventory.readyForDistribution, false);
  await assert.rejects(requireDistributionApproval({ root, inventory: result.inventory }), /review/i);
  await file(`${location}/versions.json`, { vips: '8.18.8', 'proxy-libintl': '0.5' });
  await assert.rejects(generateNotices({ root, runtime }), /unknown native component\/version vips@8\.18\.8/);
  await file(`${location}/versions.json`, { 'proxy-libintl': '0.5' });
  await assert.rejects(generateNotices({ root, runtime }), /native.*vips|vips.*inventory/i);
  await pkg(location, { name, version: '0.35.5', license: 'Apache-2.0 AND Unreviewed-Custom' });
  await assert.rejects(generateNotices({ root, runtime }), /unknown license/);
});

test('missing build/source materials, changed artwork and the wrong Electron runtime cannot produce a bundle', async (t) => {
  const { root, file } = await fixture(t);
  await assert.rejects(generateNotices({ root, runtime: { ...runtime, electron: '9.9.8' } }), /Electron.*version/i);
  await file('src/assets/hero.svg', '<svg>changed</svg>');
  await assert.rejects(generateNotices({ root, runtime }), /hero\.svg.*hash/i);
  await file('src/assets/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await rm(join(root, 'licenses/native-build.txt'));
  await assert.rejects(generateNotices({ root, runtime }), /native-build\.txt/);
});

test('distribution requires explicit review of these exact inputs, including source delivery and codec obligations', async (t) => {
  const { root, file } = await fixture(t);
  const { inventory } = await generateNotices({ root, runtime });
  await assert.rejects(requireDistributionApproval({ root, inventory }), /review/i);
  await file('licenses/distribution-review.json', { version: 1, approvals: [{
    inputsDigest: inventory.inputsDigest, notices: true, correspondingSources: true, replaceableLibraries: true, codecsAndPatents: false,
  }] });
  await assert.rejects(requireDistributionApproval({ root, inventory }), /review/i);
  await file('licenses/distribution-review.json', { version: 1, approvals: [{
    inputsDigest: inventory.inputsDigest, notices: true, correspondingSources: true, replaceableLibraries: true, codecsAndPatents: true,
  }] });
  await requireDistributionApproval({ root, inventory });
  await assert.rejects(requireDistributionApproval({ root, inventory: { ...inventory, inputsDigest: 'different' } }), /review/i);
});

test('an unsafe application version cannot become a nested release output path', async (t) => {
  const { root, file } = await fixture(t);
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await file('package.json', { ...metadata, version: '0.1.0/invalid' });
  await assert.rejects(generateNotices({ root, runtime }), /application version/i);
});

test('a foreign-architecture Electron binary cannot be labeled as the current native target', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(generateNotices({
    root, runtime: { ...runtime, platform: process.platform, arch: process.arch === 'arm64' ? 'x64' : 'arm64' },
  }), /architecture/i);
});

test('a misspelled distribution-approval option cannot silently fall back to inventory-only mode', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./third-party-notices.mjs', import.meta.url)), '--require-distributon-approval',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option/i);
});
