import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { fileDigest } from './verify-release.mjs';
import { validateReleaseIdentity } from './create-release-manifest.mjs';

export const releaseRepository = 'mi1wei/cardart';
const run = promisify(execFile);
const executeGitHub = async (args) => (await run('gh', args)).stdout;

export function releaseFileNames(version) {
  return [
    `Folio-${version}-macos-arm64.dmg`, `Folio-${version}-macos-x64.dmg`,
    `Folio-${version}-windows-x64-setup.exe`, `Folio-${version}-windows-x64-setup.exe.blockmap`,
    `Folio-${version}-third-party-licenses.zip`, 'beta.yml',
    'release-manifest.json', 'release-notes.md', 'SHA256SUMS',
  ];
}

export async function readReleaseWhitelist(directory) {
  if (!directory) throw new Error('An explicit release whitelist directory is required');
  directory = resolve(directory);
  const manifest = JSON.parse(await readFile(join(directory, 'release-manifest.json'), 'utf8'));
  validateReleaseIdentity(manifest);
  if (manifest.schemaVersion !== 1 || manifest.distributionApproved !== true) throw new Error('Release distribution review is incomplete');
  const { version } = manifest;
  const artifacts = new Set(releaseFileNames(version).slice(0, 6));
  if (manifest.artifacts?.length !== artifacts.size || new Set(manifest.artifacts.map((file) => file.name)).size !== artifacts.size ||
    manifest.artifacts.some((file) => !artifacts.has(file.name))) throw new Error('Release artifact whitelist is incomplete or unexpected');
  const names = new Set([...artifacts, 'release-manifest.json', 'release-notes.md', 'SHA256SUMS']);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== names.size || entries.some((entry) => !entry.isFile() || !names.has(entry.name))) throw new Error('Unexpected release file outside the publication whitelist');
  const checksums = new Map();
  for (const line of (await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trimEnd().split('\n')) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match || checksums.has(match[2]) || match[2] === 'SHA256SUMS' || !names.has(match[2])) throw new Error('Malformed release checksum list');
    checksums.set(match[2], match[1]);
  }
  if (checksums.size !== names.size - 1) throw new Error('Release checksum list is incomplete');
  const files = [];
  for (const name of [...names].sort()) {
    const actual = await fileDigest(join(directory, name));
    if (name !== 'SHA256SUMS' && checksums.get(name) !== actual.sha256) throw new Error(`Release checksum mismatch: ${name}`);
    const declared = manifest.artifacts.find((file) => file.name === name);
    if (declared && (declared.sha256 !== actual.sha256 || declared.size !== actual.size)) throw new Error(`Release artifact hash/size mismatch: ${name}`);
    files.push(actual);
  }
  return { manifest, files, directory };
}

export function requireImmutableDraft(release, manifest, files) {
  if (!release.draft) throw new Error('A public release is immutable and cannot be overwritten');
  if (release.tag_name !== manifest.tag || release.target_commitish !== manifest.sourceCommit) throw new Error('Draft source commit/tag differs from the candidate');
  const expected = new Map(files.map((file) => [file.name, file]));
  const seen = new Set();
  for (const asset of release.assets || []) {
    const file = expected.get(asset.name);
    if (!file || seen.has(asset.name) || asset.size !== file.size || asset.digest !== `sha256:${file.sha256}`) throw new Error(`Immutable draft asset hash/whitelist mismatch: ${asset.name}`);
    seen.add(asset.name);
  }
  return seen;
}

export async function resolveReleaseByTag(gh, tag) {
  let identity;
  try { identity = JSON.parse(await gh(['release', 'view', tag, '--repo', releaseRepository, '--json', 'databaseId'])); }
  catch (error) {
    if (/release not found/i.test(error.stderr || '')) error.releaseMissing = true;
    throw error;
  }
  if (!Number.isSafeInteger(identity.databaseId) || identity.databaseId <= 0) throw new Error('GitHub returned an invalid release ID');
  const endpoint = `repos/${releaseRepository}/releases/${identity.databaseId}`;
  const release = JSON.parse(await gh(['api', endpoint]));
  if (release.id !== identity.databaseId) throw new Error('GitHub release ID changed during lookup');
  return { endpoint, release };
}

export async function stageDraftRelease({ directory, gh = executeGitHub } = {}) {
  const local = await readReleaseWhitelist(directory);
  let endpoint;
  let release;
  let created = false;
  try { ({ endpoint, release } = await resolveReleaseByTag(gh, local.manifest.tag)); }
  catch (error) {
    if (!error.releaseMissing) throw error;
    await gh([
      'release', 'create', local.manifest.tag, '--repo', releaseRepository,
      '--target', local.manifest.sourceCommit, '--verify-tag', '--draft', '--prerelease',
      '--title', `Folio ${local.manifest.tag} (unsigned)`, '--notes-file', join(local.directory, 'release-notes.md'),
    ]);
    created = true;
    ({ endpoint, release } = await resolveReleaseByTag(gh, local.manifest.tag));
  }
  const existing = requireImmutableDraft(release, local.manifest, local.files);
  let uploaded = 0;
  for (const file of local.files) {
    if (existing.has(file.name)) continue;
    requireImmutableDraft(JSON.parse(await gh(['api', endpoint])), local.manifest, local.files);
    await gh(['release', 'upload', local.manifest.tag, join(local.directory, file.name), '--repo', releaseRepository]);
    uploaded++;
  }
  return { tag: local.manifest.tag, created, uploaded, published: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { directory: { type: 'string' } } });
    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== releaseRepository) throw new Error('Release staging is restricted to the Folio repository');
    console.log(JSON.stringify(await stageDraftRelease({ directory: values.directory })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
