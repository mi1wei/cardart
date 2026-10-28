import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import yazl from 'yazl';
import { createReleaseManifest, validateReleaseIdentity } from './create-release-manifest.mjs';
import { fileDigest } from './verify-release.mjs';

const version = '0.1.0-beta.1';
const commit = 'a'.repeat(40);
const tag = `v${version}`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function zip(file, entries) {
  const archive = new yazl.ZipFile();
  const done = pipeline(archive.outputStream, createWriteStream(file));
  for (const [name, data] of Object.entries(entries)) archive.addBuffer(Buffer.from(data), name);
  archive.end();
  await done;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-release-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'candidates');
  const output = join(root, 'release-public');
  await mkdir(input);
  await mkdir(join(root, 'licenses'));
  const approvals = [];
  const targets = ['darwin-arm64', 'win32-x64'];
  const reports = [];
  for (const target of targets) {
    const folder = join(input, target);
    await mkdir(folder);
    const windows = target === 'win32-x64';
    const installer = windows ? `Folio-${version}-windows-x64-setup.exe` : `Folio-${version}-macos-${target.split('-')[1]}.dmg`;
    const bytes = Buffer.from(windows ? 'Owned Windows installer fixture' : `Owned ${target} DMG fixture`);
    await writeFile(join(folder, installer), bytes);
    const files = [{ ...(await fileDigest(join(folder, installer))), role: 'installer' }];
    if (windows) {
      const digest = createHash('sha512').update(bytes).digest('base64');
      await writeFile(join(folder, 'beta.yml'), JSON.stringify({
        version, files: [{ url: installer, sha512: digest, size: 31, isAdminRightsRequired: true }], path: installer, sha512: digest,
      }));
      await writeFile(join(folder, `${installer}.blockmap`), gzipSync(JSON.stringify({
        version: '2', files: [{ name: 'file', offset: 0, sizes: [31], checksums: ['PirorfDIuLeX5B+zPJHrsGtY'] }],
      })));
      files.push({ ...(await fileDigest(join(folder, 'beta.yml'))), role: 'windows-metadata' });
      files.push({ ...(await fileDigest(join(folder, `${installer}.blockmap`))), role: 'windows-blockmap' });
    }
    const inventoryInputs = { version, target, packages: [], documents: [], assets: [] };
    const inputsDigest = sha(JSON.stringify(inventoryInputs));
    const inventory = { ...inventoryInputs, inputsDigest, readyForDistribution: true };
    approvals.push({ inputsDigest, notices: true, correspondingSources: true, replaceableLibraries: true, codecsAndPatents: true });
    const legal = `Folio-${version}-third-party-licenses.zip`;
    await zip(join(folder, legal), {
      'inventory.json': JSON.stringify(inventory),
      'THIRD_PARTY_NOTICES.txt': 'Owned legal fixture',
      'electron/LICENSE': 'Owned Electron fixture',
      'electron/LICENSES.chromium.html': '<p>Owned Chromium fixture</p>',
    });
    files.push({ ...(await fileDigest(join(folder, legal))), role: 'licenses' });
    const report = {
      schemaVersion: 1, version, tag, sourceCommit: commit, target,
      signing: windows ? 'unsigned' : 'adhoc', notarized: false,
      checks: { package: true, smoke: true, artifact: true, trustState: true },
      legalInputsDigest: inputsDigest, files,
    };
    await writeFile(join(folder, 'candidate-report.json'), JSON.stringify(report));
    reports.push({ folder, report });
  }
  await writeFile(join(root, 'licenses/distribution-review.json'), JSON.stringify({ version: 1, approvals }));
  return { root, input, output, version, tag, sourceCommit: commit, reports };
}

test('aggregation creates only Windows x64 and Apple Silicon installers with combined legal and update files', async (t) => {
  const f = await fixture(t);
  const manifest = await createReleaseManifest(f);
  assert.equal(manifest.sourceCommit, commit);
  assert.equal(manifest.notarized, false);
  assert.equal(manifest.artifacts.filter((file) => file.role === 'installer').length, 2);
  assert.deepEqual((await readdir(f.output)).sort(), [
    `Folio-${version}-macos-arm64.dmg`,
    `Folio-${version}-third-party-licenses.zip`,
    `Folio-${version}-windows-x64-setup.exe`, `Folio-${version}-windows-x64-setup.exe.blockmap`,
    'SHA256SUMS', 'beta.yml', 'release-manifest.json', 'release-notes.md',
  ].sort());
  for (const file of manifest.artifacts) assert.equal((await fileDigest(join(f.output, file.name))).sha256, file.sha256);
  const sums = await readFile(join(f.output, 'SHA256SUMS'), 'utf8');
  assert.match(sums, /release-manifest\.json/);
});

test('a deferred Intel candidate cannot join the supported release targets', async (t) => {
  const f = await fixture(t);
  const folder = join(f.input, 'darwin-x64');
  await mkdir(folder);
  await writeFile(join(folder, 'candidate-report.json'), JSON.stringify({ ...f.reports[0].report, target: 'darwin-x64' }));
  await assert.rejects(createReleaseManifest(f), /target/i);
});

test('a missing architecture, stale commit or duplicate target cannot become a release candidate', async (t) => {
  const f = await fixture(t);
  const [first, second] = f.reports;
  await rm(join(first.folder, 'candidate-report.json'));
  await assert.rejects(createReleaseManifest(f), /missing|target/i);
  await writeFile(join(first.folder, 'candidate-report.json'), JSON.stringify({ ...first.report, sourceCommit: 'b'.repeat(40) }));
  await assert.rejects(createReleaseManifest(f), /commit/i);
  await writeFile(join(first.folder, 'candidate-report.json'), JSON.stringify({ ...second.report }));
  await assert.rejects(createReleaseManifest(f), /duplicate|target/i);
});

test('altered installers, unexpected files and unapproved legal inputs are blocked before output staging', async (t) => {
  const f = await fixture(t);
  const item = f.reports[0];
  const name = item.report.files.find((file) => file.role === 'installer').name;
  const original = await readFile(join(item.folder, name));
  await writeFile(join(item.folder, name), 'changed');
  await assert.rejects(createReleaseManifest(f), /hash|size/i);
  await writeFile(join(item.folder, name), original);
  await writeFile(join(item.folder, 'license-private.pem'), 'owned nonsecret forbidden fixture');
  await assert.rejects(createReleaseManifest(f), /unexpected|whitelist/i);
  await rm(join(item.folder, 'license-private.pem'));
  await writeFile(join(f.root, 'licenses/distribution-review.json'), '{"version":1,"approvals":[]}');
  await assert.rejects(createReleaseManifest(f), /review/i);
  await assert.rejects(readFile(join(f.output, 'release-manifest.json')), { code: 'ENOENT' });
});

test('a stale pending legal ZIP cannot inherit an approval added after it was generated', async (t) => {
  const f = await fixture(t);
  const item = f.reports[0];
  const legal = item.report.files.find((file) => file.role === 'licenses');
  const inventoryInputs = { version, target: item.report.target, packages: [], documents: [], assets: [] };
  await zip(join(item.folder, legal.name), {
    'inventory.json': JSON.stringify({ ...inventoryInputs, inputsDigest: sha(JSON.stringify(inventoryInputs)), readyForDistribution: false }),
    'THIRD_PARTY_NOTICES.txt': 'NOT CLEARED FOR DISTRIBUTION',
    'electron/LICENSE': 'Owned Electron fixture',
    'electron/LICENSES.chromium.html': '<p>Owned Chromium fixture</p>',
  });
  Object.assign(legal, await fileDigest(join(item.folder, legal.name)));
  await writeFile(join(item.folder, 'candidate-report.json'), JSON.stringify(item.report));
  await assert.rejects(createReleaseManifest(f), /pending|regenerat|review/i);
});

test('tag and prerelease version identity are checked rather than inferred from filenames', () => {
  assert.equal(validateReleaseIdentity({ version, tag, sourceCommit: commit }).tag, tag);
  assert.throws(() => validateReleaseIdentity({ version, tag: 'v0.1.0-beta.2', sourceCommit: commit }), /tag/i);
  assert.throws(() => validateReleaseIdentity({ version: '0.1.0', tag: 'v0.1.0', sourceCommit: commit }), /beta/i);
  assert.throws(() => validateReleaseIdentity({ version, tag, sourceCommit: 'short' }), /commit/i);
});
