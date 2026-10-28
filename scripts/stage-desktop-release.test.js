import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stageDraftRelease } from './stage-desktop-release.mjs';

async function fixture(t, { includeIntel = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'folio-draft-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const version = '0.1.0-beta.1';
  const payloads = {
    [`Folio-${version}-macos-arm64.dmg`]: 'owned arm64 fixture',
    [`Folio-${version}-windows-x64-setup.exe`]: 'owned Windows fixture',
    [`Folio-${version}-windows-x64-setup.exe.blockmap`]: 'owned blockmap fixture',
    [`Folio-${version}-third-party-licenses.zip`]: 'owned legal fixture',
    'beta.yml': 'owned beta fixture',
  };
  if (includeIntel) payloads[`Folio-${version}-macos-x64.dmg`] = 'owned deferred Intel fixture';
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  const manifest = {
    schemaVersion: 1, version, tag: `v${version}`, sourceCommit: 'a'.repeat(40), distributionApproved: true,
    targets: ['darwin-arm64', 'win32-x64', ...(includeIntel ? ['darwin-x64'] : [])].map((target) => ({ target })),
    artifacts: Object.entries(payloads).map(([name, value]) => ({ name, size: Buffer.byteLength(value), sha256: sha(value) })),
  };
  payloads['release-manifest.json'] = JSON.stringify(manifest);
  payloads['release-notes.md'] = 'Owned release notes';
  payloads.SHA256SUMS = Object.entries(payloads).map(([name, value]) => `${sha(value)}  ${name}`).join('\n') + '\n';
  for (const [name, value] of Object.entries(payloads)) await writeFile(join(directory, name), value);
  const release = {
    id: 42,
    draft: true, target_commitish: manifest.sourceCommit, tag_name: manifest.tag,
    assets: Object.entries(payloads).map(([name, value]) => ({ name, size: Buffer.byteLength(value), digest: `sha256:${sha(value)}` })),
  };
  return { directory, release, manifest };
}

test('a same-commit draft resumes only a missing exact-hash asset without clobbering existing files', async (t) => {
  const f = await fixture(t);
  f.release.assets = f.release.assets.filter((asset) => asset.name !== 'release-notes.md');
  const calls = [];
  await stageDraftRelease({ directory: f.directory, gh: async (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') return JSON.stringify({ databaseId: 42 });
    if (args[0] === 'api' && args[1].includes('/releases/tags/')) throw Object.assign(new Error('Published endpoint cannot resolve a draft'), { stderr: 'HTTP 404' });
    return args[0] === 'api' ? JSON.stringify(f.release) : '';
  } });
  const mutations = calls.filter((args) => ['create', 'upload', 'edit'].includes(args[1]));
  assert.deepEqual(mutations, [['release', 'upload', f.manifest.tag, join(f.directory, 'release-notes.md'), '--repo', 'mi1wei/cardart']]);
});

test('a public release, another source commit or a changed existing asset is never overwritten', async (t) => {
  const f = await fixture(t);
  for (const release of [
    { ...f.release, draft: false },
    { ...f.release, target_commitish: 'b'.repeat(40) },
    { ...f.release, assets: [{ ...f.release.assets[0], digest: `sha256:${'0'.repeat(64)}` }] },
  ]) {
    const calls = [];
    await assert.rejects(stageDraftRelease({ directory: f.directory, gh: async (args) => {
      calls.push(args);
      if (args[0] === 'release' && args[1] === 'view') return JSON.stringify({ databaseId: 42 });
      return JSON.stringify(release);
    } }), /public|commit|hash|immutable/i);
    assert.ok(calls.every((args) => args[0] === 'api' || args[1] === 'view'));
  }
});

test('a corrupted local whitelist is rejected before making any GitHub call', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, 'release-notes.md'), 'changed');
  let requests = 0;
  await assert.rejects(stageDraftRelease({ directory: f.directory, gh: async () => { requests++; return ''; } }), /checksum|hash/i);
  assert.equal(requests, 0);
});

test('an old whitelist containing an Intel installer is rejected before any GitHub call', async (t) => {
  const f = await fixture(t, { includeIntel: true });
  let requests = 0;
  await assert.rejects(stageDraftRelease({ directory: f.directory, gh: async () => { requests++; return ''; } }), /target|whitelist|unexpected/i);
  assert.equal(requests, 0);
});

test('a newly created draft is resolved through the draft-capable CLI and numeric release ID', async (t) => {
  const f = await fixture(t);
  f.release.assets = [];
  let created = false;
  const result = await stageDraftRelease({ directory: f.directory, gh: async (args) => {
    if (args[0] === 'release' && args[1] === 'view') {
      if (!created) throw Object.assign(new Error('release not found'), { stderr: 'release not found' });
      return JSON.stringify({ databaseId: 42 });
    }
    if (args[0] === 'api') {
      if (args[1].includes('/releases/tags/')) throw Object.assign(new Error('Not Found'), { stderr: 'HTTP 404' });
      assert.equal(args[1], 'repos/mi1wei/cardart/releases/42');
      return JSON.stringify(f.release);
    }
    if (args[1] === 'create') created = true;
    return '';
  } });
  assert.equal(result.created, true);
  assert.equal(result.uploaded, 8);
  assert.equal(result.published, false);
});
