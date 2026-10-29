import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const repository = 'mi1wei/cardart';
const targets = ['darwin-arm64', 'win32-x64'];
const run = promisify(execFile);
const executeGitHub = async (args) => (await run('gh', args, { maxBuffer: 8 * 1024 * 1024 })).stdout;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bundleName = (version, target) => `Folio-${version}-self-test-${target}.zip`;
const assetNames = (version) => targets.flatMap((target) => [bundleName(version, target), `${bundleName(version, target)}.json`]);

function requireSelfTestRun(env) {
  const mainPush = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '');
  if (env.GITHUB_ACTIONS !== 'true' || (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' && !mainPush) || env.GITHUB_REPOSITORY !== repository ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID || '') || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || '')) {
    throw new Error('Self-test downloads require a manual request or a trusted main push in GitHub Actions for the Folio repository');
  }
}

function requireContext(context, env) {
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(context.version || '') || !/^[a-f0-9]{40}$/.test(context.sourceCommit || '') ||
    !Number.isSafeInteger(context.releaseId) || context.releaseId <= 0 ||
    !context.tag?.startsWith(`self-test-${context.version}-${context.sourceCommit.slice(0, 12)}-`) ||
    !/^\d+-\d+$/.test(context.tag.slice(`self-test-${context.version}-${context.sourceCommit.slice(0, 12)}-`.length))) {
    throw new Error('Invalid self-test draft identity');
  }
  if (env && (context.tag.split('-').at(-2) !== env.GITHUB_RUN_ID ||
    Number(context.tag.split('-').at(-1)) > Number(env.GITHUB_RUN_ATTEMPT))) {
    throw new Error('Self-test identity belongs to a different workflow run or future attempt');
  }
  if (env?.GITHUB_EVENT_NAME === 'push' && context.sourceCommit !== env.GITHUB_SHA) {
    throw new Error('Self-test source does not match this main push commit');
  }
}

function draftDownloadUrl(release) {
  const url = new URL(release.html_url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${repository}/releases/`)) throw new Error('Unexpected draft download page');
  return release.html_url;
}

function requireAssets(release, context) {
  const allowed = new Set(assetNames(context.version));
  if (!Array.isArray(release.assets) || new Set(release.assets.map((asset) => asset.name)).size !== release.assets.length ||
    release.assets.some((asset) => !allowed.has(asset.name))) throw new Error('Unexpected or duplicated self-test draft asset');
}

export function requireSelfTestDraft(release, context) {
  requireContext(context);
  if (release.id !== context.releaseId || release.draft !== true || release.published_at != null ||
    release.prerelease !== true || release.tag_name !== context.tag || release.target_commitish !== context.sourceCommit) {
    throw new Error('Self-test draft is published or its identity/source changed; refusing mutation');
  }
}

async function getDraft(gh, context) {
  const release = JSON.parse(await gh(['api', `repos/${repository}/releases/${context.releaseId}`]));
  requireSelfTestDraft(release, context);
  requireAssets(release, context);
  return release;
}

export async function prepareSelfTestRelease({ env = process.env, gh = executeGitHub } = {}) {
  requireSelfTestRun(env);
  // A queued push must keep its own source even if main advances.
  const ref = env.GITHUB_EVENT_NAME === 'push' ? { type: 'commit', sha: env.GITHUB_SHA } :
    JSON.parse(await gh(['api', `repos/${repository}/git/ref/heads/main`])).object;
  if (ref?.type !== 'commit' || !/^[a-f0-9]{40}$/.test(ref.sha)) throw new Error('Cannot resolve the fixed main source commit');
  const metadata = JSON.parse(await gh(['api', `repos/${repository}/contents/package.json?ref=${ref.sha}`]));
  if (metadata.encoding !== 'base64') throw new Error('Unexpected main package metadata encoding');
  const { version } = JSON.parse(Buffer.from(metadata.content, 'base64').toString('utf8'));
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(version || '')) throw new Error('Only the current explicit beta application version can be self-tested');
  const tag = `self-test-${version}-${ref.sha.slice(0, 12)}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const body = [
    'MAINTAINER SELF-TEST ONLY - NOT CLEARED FOR PUBLIC DISTRIBUTION.',
    `Source main commit: ${ref.sha}`,
    'Builds are in progress. Download only after the workflow and both target bundles are complete.',
    'Unsigned Windows / ad-hoc, unnotarized Apple Silicon. Import your license separately.',
    'Do not publish this draft. Formal distribution/manual approval and the public updater feed are unchanged.',
  ].join('\n\n');
  const release = JSON.parse(await gh([
    'api', `repos/${repository}/releases`, '--method', 'POST',
    '-f', `tag_name=${tag}`, '-f', `target_commitish=${ref.sha}`,
    '-f', `name=Folio ${version} maintainer self-test (building)`, '-f', `body=${body}`,
    '-F', 'draft=true', '-F', 'prerelease=true', '-f', 'make_latest=false',
  ]));
  const context = { version, sourceCommit: ref.sha, tag, releaseId: release.id, url: draftDownloadUrl(release) };
  requireSelfTestDraft(release, context);
  requireAssets(release, context);
  return context;
}

export async function uploadSelfTestBundle({ root, folder, target, context, env = process.env, gh = executeGitHub } = {}) {
  requireSelfTestRun(env);
  requireContext(context, env);
  if (!targets.includes(target)) throw new Error('Unsupported self-test target');
  root = await realpath(root);
  const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  if (head !== context.sourceCommit || JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version !== context.version) {
    throw new Error('Self-test candidate differs from the pinned main source/version');
  }
  folder = await realpath(folder || join(root, `release/candidate-${target}`));
  if (!folder.startsWith(join(root, 'release') + sep)) throw new Error('Self-test candidate must remain in this source checkout');
  const { verifyCandidateFiles, fileDigest } = await import(pathToFileURL(join(root, 'scripts/verify-release.mjs')).href);
  const report = JSON.parse(await readFile(join(folder, 'candidate-report.json'), 'utf8'));
  if (report.target !== target) throw new Error('Self-test report target mismatch');
  await verifyCandidateFiles({ folder, report, root, version: context.version, sourceCommit: context.sourceCommit, tag: null, requireReview: false });
  await getDraft(gh, context);
  const stage = await mkdtemp(join(root, 'release/.maintainer-self-test-'));
  try {
    const name = bundleName(context.version, target);
    const file = join(stage, name);
    const marker = {
      schemaVersion: 1, releaseMode: 'maintainer-self-test', distributionApproved: false,
      version: context.version, sourceCommit: context.sourceCommit, tag: context.tag, target,
      signing: report.signing, notarized: false, checks: report.checks, publicUpdateFeedVerified: false,
    };
    const extra = new Map([
      ['candidate-report.json', await readFile(join(folder, 'candidate-report.json'))],
      ['self-test.json', Buffer.from(JSON.stringify(marker, null, 2) + '\n')],
      ['SELF-TEST.txt', Buffer.from('Maintainer self-test only. NOT CLEARED FOR PUBLIC DISTRIBUTION.\nDo not publish this draft or use it as an updater feed.\nUnsigned/unnotarized: use normal per-app system confirmation, never disable system protection.\nImport your privately issued Folio JSON license separately; no private key or activation file is bundled.\n')],
    ]);
    const sums = [
      ...report.files.map((entry) => `${entry.sha256}  ${entry.name}`),
      ...[...extra].map(([entry, bytes]) => `${hash(bytes)}  ${entry}`),
    ];
    extra.set('SHA256SUMS', Buffer.from(sums.join('\n') + '\n'));
    const require = createRequire(join(root, 'package.json'));
    const { ZipFile } = require('yazl');
    const zip = new ZipFile();
    const finished = pipeline(zip.outputStream, createWriteStream(file, { flags: 'wx' }));
    for (const entry of report.files) zip.addFile(join(folder, entry.name), entry.name, { mtime: new Date('1980-01-01T00:00:00Z'), mode: 0o100644 });
    for (const [entry, bytes] of extra) zip.addBuffer(bytes, entry, { mtime: new Date('1980-01-01T00:00:00Z'), mode: 0o100644 });
    zip.end();
    await finished;
    const bundle = await fileDigest(file);
    const proof = Buffer.from(JSON.stringify({ ...marker, bundle }, null, 2) + '\n');
    const proofFile = `${file}.json`;
    await writeFile(proofFile, proof, { flag: 'wx' });
    for (const local of [bundle, await fileDigest(proofFile)]) {
      const release = await getDraft(gh, context);
      const existing = release.assets.find((asset) => asset.name === local.name);
      if (existing) {
        if (existing.state !== 'uploaded' || existing.size !== local.size || existing.digest !== `sha256:${local.sha256}`) throw new Error('Immutable self-test asset hash/size mismatch');
      } else {
        await gh(['release', 'upload', context.tag, join(stage, local.name), '--repo', repository]);
      }
      const retained = (await getDraft(gh, context)).assets.find((asset) => asset.name === local.name);
      if (retained?.state !== 'uploaded' || retained.size !== local.size || retained.digest !== `sha256:${local.sha256}`) throw new Error('GitHub did not retain the exact self-test asset');
    }
    return { target, bundle, published: false };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

export async function finishSelfTestRelease({ context, env = process.env, gh = executeGitHub } = {}) {
  requireSelfTestRun(env);
  requireContext(context, env);
  const release = await getDraft(gh, context);
  if (release.assets.length !== targets.length * 2) throw new Error('Both self-test target bundles and proofs must be complete');
  const lines = [];
  for (const target of targets) {
    const name = bundleName(context.version, target);
    const bundle = release.assets.find((asset) => asset.name === name);
    const proofAsset = release.assets.find((asset) => asset.name === `${name}.json`);
    if (!bundle || !proofAsset || bundle.state !== 'uploaded' || proofAsset.state !== 'uploaded' ||
      !Number.isSafeInteger(proofAsset.id) || !/^[a-f0-9]{64}$/.test(bundle.digest?.slice(7) || '') ||
      proofAsset.size > 65536) throw new Error('Self-test target asset/proof is incomplete');
    const bytes = Buffer.from(await gh(['api', `repos/${repository}/releases/assets/${proofAsset.id}`, '-H', 'Accept: application/octet-stream']));
    if (bytes.length !== proofAsset.size || `sha256:${hash(bytes)}` !== proofAsset.digest) throw new Error('Self-test proof asset hash mismatch');
    const proof = JSON.parse(bytes);
    if (proof.schemaVersion !== 1 || proof.releaseMode !== 'maintainer-self-test' || proof.distributionApproved !== false ||
      proof.version !== context.version || proof.sourceCommit !== context.sourceCommit || proof.tag !== context.tag ||
      proof.target !== target || proof.bundle?.name !== name || proof.bundle.size !== bundle.size ||
      `sha256:${proof.bundle.sha256}` !== bundle.digest) throw new Error('Self-test target proof/source/hash mismatch');
    lines.push(`- ${name}: SHA-256 \`${proof.bundle.sha256}\``);
  }
  const body = [
    '# Maintainer self-test packages (unpublished)', '',
    `Pinned main commit: ${context.sourceCommit}`, '',
    'Both native targets passed their technical checks. Download the matching platform ZIP and extract the installer.',
    'This is not public distribution approval, minimum-device/UAC acceptance or a verified public updater feed.',
    'Windows x64 is unsigned; macOS Apple Silicon is ad-hoc and not notarized. Import your license separately.',
    'Do not click Publish release. Keep formal legal/manual approval and public publication separate.', '', ...lines,
  ].join('\n\n');
  await gh(['api', `repos/${repository}/releases/${context.releaseId}`, '--method', 'PATCH',
    '-f', `tag_name=${context.tag}`,
    '-f', `name=Folio ${context.version} maintainer self-test (${context.sourceCommit.slice(0, 12)})`,
    '-f', `body=${body}`, '-F', 'draft=true', '-F', 'prerelease=true', '-f', 'make_latest=false']);
  const retained = await getDraft(gh, context);
  if (retained.assets.length !== release.assets.length || release.assets.some((asset) =>
    !retained.assets.some((entry) => entry.name === asset.name && entry.size === asset.size && entry.digest === asset.digest))) throw new Error('Self-test assets changed during finalization');
  return { url: draftDownloadUrl(retained), tag: context.tag, sourceCommit: context.sourceCommit, published: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      root: { type: 'string' }, target: { type: 'string' }, 'confirm-maintainer-self-test': { type: 'boolean', default: false },
    } });
    if (!values['confirm-maintainer-self-test']) throw new Error('Explicit maintainer self-test confirmation is required');
    requireSelfTestRun(process.env);
    const context = {
      version: process.env.SELF_TEST_VERSION, sourceCommit: process.env.SELF_TEST_SOURCE_COMMIT,
      tag: process.env.SELF_TEST_TAG, releaseId: Number(process.env.SELF_TEST_RELEASE_ID), url: process.env.SELF_TEST_URL,
    };
    let result;
    if (positionals.length !== 1) throw new Error('Exactly one self-test command is required');
    if (positionals[0] === 'prepare') {
      result = await prepareSelfTestRelease();
      if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, `version=${result.version}\nsource_commit=${result.sourceCommit}\ntag=${result.tag}\nrelease_id=${result.releaseId}\nurl=${result.url}\n`);
      }
    } else if (positionals[0] === 'upload') {
      if (values.target !== `${process.platform}-${process.arch}`) throw new Error('Self-test upload requires the matching native host');
      result = await uploadSelfTestBundle({ root: values.root, target: values.target, context });
    } else if (positionals[0] === 'finish') {
      result = await finishSelfTestRelease({ context });
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Maintainer-only self-test download\n\n[Open the unpublished draft](${result.url})\n\nUse a repository write-capable account. This is not a public release or distribution approval.\n`);
    } else throw new Error('Unknown self-test command');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
