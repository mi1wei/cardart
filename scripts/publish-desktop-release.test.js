import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateAcceptance, requirePublishProtection, publishDesktopRelease } from './publish-desktop-release.mjs';

const targets = ['darwin-arm64', 'darwin-x64', 'win32-x64'];
const checks = {
  licenseStates: true, tamperedLicenseRejected: true, phoneReadOnly: true, photoAndHeic: true,
  viewerFullscreenLanguages: true, trayAndExit: true, portAndNetworks: true, windowsUacFirewall: true,
  controlledWindowsUpgrade: true, manualMacUpdate: true, dataRetention: true, downloadPrompts: true,
};
const manifest = {
  version: '0.1.0-beta.1', tag: 'v0.1.0-beta.1', sourceCommit: 'a'.repeat(40),
  artifacts: targets.map((target, i) => ({ target, role: 'installer', sha256: String(i + 1).repeat(64) })),
};
const entry = {
  tag: manifest.tag, sourceCommit: manifest.sourceCommit, checks,
  systems: targets.map((target, i) => ({
    target, os: target === 'win32-x64' ? 'Windows 11' : 'macOS',
    osVersion: target === 'win32-x64' ? '23H2' : '13.7',
    installerSha256: String(i + 1).repeat(64), passed: true,
  })),
};
const record = { version: 1, candidates: [entry] };

test('publication acceptance binds every minimum-system result and manual check to these exact installers', () => {
  const accepted = validateAcceptance({ manifest, record });
  assert.equal(accepted.sourceCommit, manifest.sourceCommit);
  assert.equal(accepted.systems.length, 3);
  assert.equal(accepted.publicUpdateFeedVerified, false);
  assert.throws(() => validateAcceptance({ manifest, record: { version: 1, candidates: [] } }), /acceptance/i);
  assert.throws(() => validateAcceptance({ manifest, record: { version: 1, candidates: [{ ...entry, checks: { ...checks, windowsUacFirewall: false } }] } }), /windowsUacFirewall|acceptance/i);
  assert.throws(() => validateAcceptance({ manifest, record: { version: 1, candidates: [{
    ...entry, systems: [{ ...entry.systems[0], installerSha256: '0'.repeat(64) }, ...entry.systems.slice(1)],
  }] } }), /hash|installer/i);
  assert.throws(() => validateAcceptance({ manifest, record: { version: 1, candidates: [{
    ...entry, systems: [{ ...entry.systems[0], osVersion: '15.0' }, ...entry.systems.slice(1)],
  }] } }), /minimum|13/i);
});

test('an absent or empty reviewer protection rule is not a protected publication environment', () => {
  assert.throws(() => requirePublishProtection({ protection_rules: [] }), /reviewer/i);
  assert.throws(() => requirePublishProtection({ protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }), /reviewer/i);
  requirePublishProtection({ protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1 } }] }] });
});

test('without explicit public confirmation or recorded acceptance, no GitHub request can start publication', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-publication-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const acceptanceFile = join(root, 'acceptance.json');
  await writeFile(acceptanceFile, '{"version":1,"candidates":[]}');
  let requests = 0;
  const gh = async () => { requests++; return ''; };
  await assert.rejects(publishDesktopRelease({ tag: manifest.tag, acceptanceFile, confirmed: false, gh }), /confirmation/i);
  await assert.rejects(publishDesktopRelease({ tag: manifest.tag, acceptanceFile, confirmed: true, gh }), /acceptance/i);
  assert.equal(requests, 0);
});

async function publicationFixture(t, dropUploadedAcceptance = false) {
  const root = await mkdtemp(join(tmpdir(), 'folio-publish-simulation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'licenses'));
  const version = manifest.version;
  const files = {
    [`Folio-${version}-macos-arm64.dmg`]: 'Owned ARM fixture',
    [`Folio-${version}-macos-x64.dmg`]: 'Owned Intel fixture',
    [`Folio-${version}-windows-x64-setup.exe`]: 'Owned Windows fixture',
    [`Folio-${version}-windows-x64-setup.exe.blockmap`]: 'Owned blockmap fixture',
    [`Folio-${version}-third-party-licenses.zip`]: 'Owned legal fixture',
    'beta.yml': 'Owned beta fixture',
  };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const declarations = Object.entries(files).map(([name, value], i) => ({
    name, size: Buffer.byteLength(value), sha256: hash(value),
    ...(i < 3 ? { target: targets[i], role: 'installer' } : {}),
  }));
  const source = {
    ...manifest, schemaVersion: 1, distributionApproved: true, notarized: false,
    artifacts: declarations,
    targets: targets.map((target, i) => ({
      target, signing: target === 'win32-x64' ? 'unsigned' : 'adhoc', legalInputsDigest: String(i + 1).repeat(64),
      checks: { package: true, smoke: true, artifact: true, trustState: true },
    })),
  };
  const accepted = { ...entry, systems: entry.systems.map((system, i) => ({ ...system, installerSha256: declarations[i].sha256 })) };
  const acceptanceFile = join(root, 'acceptance.json');
  await writeFile(acceptanceFile, JSON.stringify({ version: 1, candidates: [accepted] }));
  await writeFile(join(root, 'licenses/distribution-review.json'), JSON.stringify({ version: 1, approvals: source.targets.map((target) => ({
    inputsDigest: target.legalInputsDigest, notices: true, correspondingSources: true, replaceableLibraries: true, codecsAndPatents: true,
  })) }));
  files['release-manifest.json'] = JSON.stringify(source);
  files['release-notes.md'] = 'Owned release notes';
  files.SHA256SUMS = Object.entries(files).map(([name, value]) => `${hash(value)}  ${name}`).join('\n') + '\n';
  const release = {
    id: 42,
    draft: true, prerelease: true, tag_name: source.tag, target_commitish: source.sourceCommit,
    assets: Object.entries(files).map(([name, value]) => ({ name, size: Buffer.byteLength(value), digest: `sha256:${hash(value)}` })),
  };
  const mutations = [];
  let uploaded;
  async function gh(args) {
    if (args[0] === 'release' && args[1] === 'view') return JSON.stringify({ databaseId: 42 });
    if (args[0] === 'api') {
      if (args[1].includes('/environments/')) return JSON.stringify({ protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1 } }] }] });
      if (args[1].includes('/git/ref/')) return JSON.stringify({ object: { type: 'commit', sha: source.sourceCommit } });
      if (args[1].includes('/releases/tags/')) throw Object.assign(new Error('Published endpoint cannot resolve a draft'), { stderr: 'HTTP 404' });
      assert.equal(args[1], 'repos/mi1wei/cardart/releases/42');
      return JSON.stringify(release);
    }
    if (args[1] === 'download') {
      const name = args[args.indexOf('--pattern') + 1];
      await writeFile(join(args[args.indexOf('--dir') + 1], name), files[name]);
      return '';
    }
    mutations.push(args);
    if (args[1] === 'upload') {
      const bytes = await readFile(args[3]);
      uploaded = JSON.parse(bytes);
      if (!dropUploadedAcceptance) release.assets.push({ name: 'release-acceptance.json', size: bytes.length, digest: `sha256:${hash(bytes)}` });
    } else if (args[1] === 'edit') { release.draft = false; }
    else throw new Error('Unexpected simulated GitHub operation');
    return '';
  }
  return { root, acceptanceFile, gh, mutations, get uploaded() { return uploaded; } };
}

test('a protected accepted draft publishes only after attaching a sanitized exact-file acceptance record', async (t) => {
  const f = await publicationFixture(t);
  const result = await publishDesktopRelease({ ...f, tag: manifest.tag, confirmed: true });
  assert.equal(result.published, true);
  assert.equal(f.mutations.filter((args) => args[1] === 'edit').length, 1);
  assert.equal(f.uploaded.publicUpdateFeedVerified, false);
  assert.equal(f.uploaded.tag, manifest.tag);
  assert.equal(f.uploaded.candidates, undefined);
});

test('publication stays blocked if GitHub has not retained the uploaded acceptance asset', async (t) => {
  const f = await publicationFixture(t, true);
  await assert.rejects(publishDesktopRelease({ ...f, tag: manifest.tag, confirmed: true }), /acceptance|incomplete/i);
  assert.ok(f.mutations.every((args) => args[1] !== 'edit'));
});
