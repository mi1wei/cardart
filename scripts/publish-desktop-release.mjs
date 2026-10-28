import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { releaseTargets } from './verify-release.mjs';
import { requireDistributionApproval } from './third-party-notices.mjs';
import { readReleaseWhitelist, releaseFileNames, releaseRepository, requireImmutableDraft } from './stage-desktop-release.mjs';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const run = promisify(execFile);
const executeGitHub = async (args) => (await run('gh', args)).stdout;
const acceptanceChecks = [
  'licenseStates', 'tamperedLicenseRejected', 'phoneReadOnly', 'photoAndHeic',
  'viewerFullscreenLanguages', 'trayAndExit', 'portAndNetworks', 'windowsUacFirewall',
  'controlledWindowsUpgrade', 'manualMacUpdate', 'dataRetention', 'downloadPrompts',
];

export function validateAcceptance({ manifest, record }) {
  const entry = record?.version === 1 && record.candidates?.find((value) => value.tag === manifest.tag && value.sourceCommit === manifest.sourceCommit);
  if (!entry) throw new Error('Exact candidate manual acceptance is required');
  for (const name of acceptanceChecks) if (entry.checks?.[name] !== true) throw new Error(`Manual acceptance is incomplete: ${name}`);
  if (!Array.isArray(entry.systems) || entry.systems.length !== 3 || new Set(entry.systems.map((system) => system.target)).size !== 3) throw new Error('Manual acceptance requires all three minimum-system targets');
  const systems = releaseTargets.map((target) => {
    const system = entry.systems.find((system) => system.target === target);
    const installer = manifest.artifacts.find((artifact) => artifact.target === target && artifact.role === 'installer');
    if (!system || system.passed !== true || !installer || system.installerSha256 !== installer.sha256) throw new Error('Manual acceptance installer hash/target mismatch');
    if (typeof system.osVersion !== 'string' || !system.osVersion || system.osVersion.length > 80 ||
      (target === 'win32-x64' ? system.os !== 'Windows 11' : system.os !== 'macOS' || !/^13\./.test(system.osVersion))) throw new Error('Manual minimum-system acceptance requires Windows 11 and macOS 13');
    return { target, os: system.os, osVersion: system.osVersion, installerSha256: system.installerSha256, passed: true };
  });
  return {
    version: 1, tag: manifest.tag, sourceCommit: manifest.sourceCommit, systems,
    checks: Object.fromEntries(acceptanceChecks.map((name) => [name, true])),
    publicUpdateFeedVerified: false,
  };
}

export function requirePublishProtection(environment) {
  const protectedByReviewers = environment?.protection_rules?.some((rule) => rule.type === 'required_reviewers' &&
    rule.reviewers?.some((value) => ['User', 'Team'].includes(value.type) && Number.isSafeInteger(value.reviewer?.id) && value.reviewer.id > 0));
  if (!protectedByReviewers) throw new Error('desktop-publish requires a configured nonempty required-reviewer protection rule');
}

export async function publishDesktopRelease({ tag, acceptanceFile = join(project, 'licenses/desktop-acceptance.json'), root = project, confirmed = false, gh = executeGitHub } = {}) {
  if (!confirmed) throw new Error('Explicit confirmation of public beta publication is required');
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+-beta\.\d+$/.test(tag)) throw new Error('An existing beta tag is required');
  const record = JSON.parse(await readFile(acceptanceFile, 'utf8'));
  if (record.version !== 1 || !record.candidates?.some((entry) => entry.tag === tag)) throw new Error('Manual acceptance for this candidate must be recorded before publication');
  requirePublishProtection(JSON.parse(await gh(['api', `repos/${releaseRepository}/environments/desktop-publish`])));
  const endpoint = `repos/${releaseRepository}/releases/tags/${tag}`;
  let release = JSON.parse(await gh(['api', endpoint]));
  if (!release.draft) throw new Error('A public release is immutable; only an existing draft may be published');
  const names = releaseFileNames(tag.slice(1));
  if (!Array.isArray(release.assets) || release.assets.some((asset) => !names.includes(asset.name) && asset.name !== 'release-acceptance.json')) throw new Error('Unexpected draft asset outside the publication whitelist');
  const directory = await mkdtemp(join(tmpdir(), 'folio-approved-publication-'));
  const acceptanceDirectory = await mkdtemp(join(tmpdir(), 'folio-acceptance-'));
  try {
    for (const name of names) await gh(['release', 'download', tag, '--repo', releaseRepository, '--pattern', name, '--dir', directory]);
    const local = await readReleaseWhitelist(directory);
    if (local.manifest.tag !== tag || local.manifest.notarized !== false ||
      !releaseTargets.every((target) => local.manifest.targets?.some((value) => value.target === target &&
        value.signing === (target === 'win32-x64' ? 'unsigned' : 'adhoc') &&
        ['package', 'smoke', 'artifact', 'trustState'].every((name) => value.checks?.[name] === true)))) throw new Error('Draft native verification/signing state is incomplete');
    const acceptance = validateAcceptance({ manifest: local.manifest, record });
    for (const target of local.manifest.targets) await requireDistributionApproval({ root, inventory: { inputsDigest: target.legalInputsDigest } });
    let ref = JSON.parse(await gh(['api', `repos/${releaseRepository}/git/ref/tags/${tag}`])).object;
    for (let depth = 0; ref?.type === 'tag' && depth < 3; depth++) ref = JSON.parse(await gh(['api', `repos/${releaseRepository}/git/tags/${ref.sha}`])).object;
    if (ref?.type !== 'commit' || ref.sha !== local.manifest.sourceCommit) throw new Error('Remote tag does not match the accepted source commit');
    const bytes = Buffer.from(JSON.stringify(acceptance, null, 2) + '\n');
    const approvedFile = { name: 'release-acceptance.json', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const expected = [...local.files, approvedFile];
    release = JSON.parse(await gh(['api', endpoint]));
    const existing = requireImmutableDraft(release, local.manifest, expected);
    if (!existing.has(approvedFile.name)) {
      const file = join(acceptanceDirectory, approvedFile.name);
      await writeFile(file, bytes, { flag: 'wx' });
      await gh(['release', 'upload', tag, file, '--repo', releaseRepository]);
    }
    const retained = requireImmutableDraft(JSON.parse(await gh(['api', endpoint])), local.manifest, expected);
    if (retained.size !== expected.length) throw new Error('Remote candidate/acceptance assets are incomplete; publication remains blocked');
    await gh(['release', 'edit', tag, '--repo', releaseRepository, '--draft=false', '--prerelease']);
    const published = JSON.parse(await gh(['api', endpoint]));
    if (published.draft || published.prerelease !== true) throw new Error('GitHub did not confirm the requested public prerelease state');
    return { tag, published: true, publicUpdateFeedVerified: false };
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(acceptanceDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      tag: { type: 'string' }, acceptance: { type: 'string' }, 'confirm-public-beta': { type: 'boolean', default: false },
    } });
    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== releaseRepository) throw new Error('Publication is restricted to the Folio repository');
    console.log(JSON.stringify(await publishDesktopRelease({ tag: values.tag, acceptanceFile: values.acceptance, confirmed: values['confirm-public-beta'] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
