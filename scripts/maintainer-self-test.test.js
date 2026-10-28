import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { fileDigest } from './verify-release.mjs';
import { requireSelfTestDraft, prepareSelfTestRelease, uploadSelfTestBundle, finishSelfTestRelease } from './maintainer-self-test.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'mi1wei/cardart', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1' };
const context = { version, sourceCommit, tag: `self-test-${version}-${sourceCommit.slice(0, 12)}-12345-1`, releaseId: 42, url: 'https://github.com/mi1wei/cardart/releases/tag/untagged-fixture' };
const draft = () => ({ id: 42, draft: true, published_at: null, prerelease: true, tag_name: context.tag, target_commitish: sourceCommit, html_url: context.url, assets: [] });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bundleName = (target) => `Folio-${version}-self-test-${target}.zip`;

test('only explicit manual requests in this repository can create a self-test draft', async () => {
  for (const change of [
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REPOSITORY: 'other/repository' }, { GITHUB_ACTIONS: undefined },
  ]) {
    let requests = 0;
    await assert.rejects(prepareSelfTestRelease({ env: { ...env, ...change }, gh: async () => { requests++; return ''; } }), /manual|repository|Actions/i);
    assert.equal(requests, 0);
  }
});

test('self-test preparation resolves main once and creates only an unpublished, non-latest draft', async () => {
  const calls = [];
  const result = await prepareSelfTestRelease({ env, gh: async (args) => {
    calls.push(args);
    if (args[1].endsWith('/git/ref/heads/main')) return JSON.stringify({ object: { type: 'commit', sha: sourceCommit } });
    if (args[1].includes('/contents/package.json?ref=')) {
      assert.ok(args[1].endsWith(sourceCommit));
      return JSON.stringify({ encoding: 'base64', content: Buffer.from(JSON.stringify({ version })).toString('base64') });
    }
    return JSON.stringify(draft());
  } });
  assert.ok(result, 'A draft identity must be returned');
  assert.equal(result.sourceCommit, sourceCommit);
  assert.equal(result.tag, context.tag);
  const creation = calls.find((args) => args.includes('POST'));
  assert.ok(creation.includes('draft=true'));
  assert.ok(creation.includes('prerelease=true'));
  assert.ok(creation.includes('make_latest=false'));
  assert.ok(creation.includes(`target_commitish=${sourceCommit}`));
});

test('a public, mismatched or published draft cannot receive self-test assets', () => {
  requireSelfTestDraft(draft(), context);
  for (const change of [
    { draft: false }, { published_at: '2026-01-01T00:00:00Z' },
    { tag_name: `v${version}` }, { target_commitish: 'b'.repeat(40) }, { id: 99 },
  ]) {
    assert.throws(() => requireSelfTestDraft({ ...draft(), ...change }, context), /draft|identity|source|published/i);
  }
});

test('a different workflow run cannot reuse another self-test run identity', async () => {
  let requests = 0;
  await assert.rejects(finishSelfTestRelease({
    context, env: { ...env, GITHUB_RUN_ID: '99999' },
    gh: async () => { requests++; return JSON.stringify(draft()); },
  }), /run|identity/i);
  assert.equal(requests, 0);
});

async function fixture(t) {
  await mkdir(join(root, 'release'), { recursive: true });
  const folder = await mkdtemp(join(root, 'release/.self-test-fixture-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const installer = `Folio-${version}-macos-arm64.dmg`;
  await writeFile(join(folder, installer), 'Owned structural DMG fixture, not runtime acceptance');
  const inputs = { version, target: 'darwin-arm64', packages: [], documents: [], assets: [] };
  const inventory = { ...inputs, inputsDigest: hash(JSON.stringify(inputs)), readyForDistribution: false };
  const legal = `Folio-${version}-third-party-licenses.zip`;
  const archive = new yazl.ZipFile();
  const done = pipeline(archive.outputStream, createWriteStream(join(folder, legal)));
  for (const [name, bytes] of Object.entries({
    'inventory.json': JSON.stringify(inventory), 'THIRD_PARTY_NOTICES.txt': 'NOT CLEARED FOR DISTRIBUTION',
    'electron/LICENSE': 'Owned notice fixture', 'electron/LICENSES.chromium.html': '<p>Owned fixture</p>',
  })) archive.addBuffer(Buffer.from(bytes), name);
  archive.end();
  await done;
  const report = {
    schemaVersion: 1, version, tag: null, sourceCommit, target: 'darwin-arm64', signing: 'adhoc', notarized: false,
    checks: { package: true, smoke: true, artifact: true, trustState: true },
    legalInputsDigest: inventory.inputsDigest,
    files: [
      { ...(await fileDigest(join(folder, installer))), role: 'installer' },
      { ...(await fileDigest(join(folder, legal))), role: 'licenses' },
    ],
  };
  await writeFile(join(folder, 'candidate-report.json'), JSON.stringify(report));
  const release = draft();
  const uploaded = new Map();
  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    if (args[0] === 'api') return JSON.stringify(release);
    assert.equal(args[1], 'upload');
    assert.ok(!args.includes('--clobber'));
    const bytes = await readFile(args[3]);
    const name = args[3].split(/[\\/]/).at(-1);
    uploaded.set(name, bytes);
    release.assets.push({ id: 100 + release.assets.length, name, size: bytes.length, digest: `sha256:${hash(bytes)}`, state: 'uploaded' });
    return '';
  };
  return { folder, installer, release, uploaded, calls, gh };
}

async function unzip(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) => zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => { entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
      }));
      zip.readEntry();
    });
  });
}

test('a self-test bundle retains verified files and notices but never pretends distribution approval', async (t) => {
  const f = await fixture(t);
  const result = await uploadSelfTestBundle({ root, folder: f.folder, target: 'darwin-arm64', context, env, gh: f.gh });
  assert.ok(result);
  const bytes = f.uploaded.get(bundleName('darwin-arm64'));
  assert.ok(bytes);
  const entries = await unzip(bytes);
  assert.equal(entries.get(f.installer).toString(), 'Owned structural DMG fixture, not runtime acceptance');
  const marker = JSON.parse(entries.get('self-test.json'));
  assert.equal(marker.distributionApproved, false);
  assert.equal(marker.sourceCommit, sourceCommit);
  assert.equal(marker.releaseMode, 'maintainer-self-test');
  assert.ok(entries.has(`Folio-${version}-third-party-licenses.zip`));
  const proof = JSON.parse(f.uploaded.get(`${bundleName('darwin-arm64')}.json`));
  assert.equal(proof.bundle.sha256, hash(bytes));
  assert.equal(f.release.draft, true);
});

test('changed candidates or conflicting existing assets cannot be uploaded or overwritten', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.folder, f.installer), 'changed');
  await assert.rejects(uploadSelfTestBundle({ root, folder: f.folder, target: 'darwin-arm64', context, env, gh: f.gh }), /hash|size/i);
  assert.equal(f.uploaded.size, 0);
  await writeFile(join(f.folder, f.installer), 'Owned structural DMG fixture, not runtime acceptance');
  f.release.assets.push({ name: bundleName('darwin-arm64'), size: 1, digest: `sha256:${'0'.repeat(64)}`, state: 'uploaded' });
  await assert.rejects(uploadSelfTestBundle({ root, folder: f.folder, target: 'darwin-arm64', context, env, gh: f.gh }), /immutable|asset|hash/i);
  assert.equal(f.uploaded.size, 0);
});

test('draft completion retains its tag, requires both exact target proofs and never publishes', async () => {
  const release = draft();
  const proofs = new Map();
  for (const [index, target] of ['darwin-arm64', 'win32-x64'].entries()) {
    const name = bundleName(target);
    const bytes = Buffer.from(`Owned ${target} bundle`);
    const proof = { schemaVersion: 1, releaseMode: 'maintainer-self-test', distributionApproved: false, version, sourceCommit, tag: context.tag, target, bundle: { name, size: bytes.length, sha256: hash(bytes) } };
    const proofBytes = Buffer.from(JSON.stringify(proof));
    const proofId = index + 10;
    proofs.set(proofId, proofBytes.toString());
    release.assets.push({ name, size: bytes.length, digest: `sha256:${hash(bytes)}`, state: 'uploaded' });
    release.assets.push({ id: proofId, name: `${name}.json`, size: proofBytes.length, digest: `sha256:${hash(proofBytes)}`, state: 'uploaded' });
  }
  const writes = [];
  const gh = async (args) => {
    if (args[1].includes('/releases/assets/')) return proofs.get(Number(args[1].split('/').at(-1)));
    if (args.includes('PATCH')) {
      writes.push(args);
      release.tag_name = args.find((arg) => arg.startsWith('tag_name='))?.slice('tag_name='.length) || 'untagged-fixture';
    }
    return JSON.stringify(release);
  };
  const result = await finishSelfTestRelease({ context, env, gh });
  assert.ok(result);
  assert.equal(result.published, false);
  assert.equal(release.tag_name, context.tag);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].includes('draft=true'));
  const removed = release.assets.pop();
  await assert.rejects(finishSelfTestRelease({ context, env, gh }), /target|asset|complete/i);
  assert.equal(writes.length, 1);
  release.assets.push(removed);
  const forged = JSON.parse(proofs.get(removed.id));
  forged.sourceCommit = 'b'.repeat(40);
  const forgedBytes = Buffer.from(JSON.stringify(forged));
  proofs.set(removed.id, forgedBytes.toString());
  removed.size = forgedBytes.length;
  removed.digest = `sha256:${hash(forgedBytes)}`;
  await assert.rejects(finishSelfTestRelease({ context, env, gh }), /proof|source/i);
  assert.equal(writes.length, 1);
});
