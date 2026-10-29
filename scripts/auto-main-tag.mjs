import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import identity from './release-identity.cjs';

const { parseBetaVersion } = identity;
const run = promisify(execFile);
const repository = 'mi1wei/cardart';
const endpoint = `repos/${repository}`;
const executeGitHub = async (args) => (await run('gh', args, { maxBuffer: 16 * 1024 * 1024 })).stdout;
const validCommit = (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha);

export function requireMainEvent(env) {
  const push = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main' && validCommit(env.GITHUB_SHA);
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository ||
    (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' && !push)) throw new Error('Tag allocation requires a trusted main push or manual Folio Actions run');
}

async function sourceVersion(sha, gh) {
  const data = JSON.parse(await gh(['api', `${endpoint}/contents/package.json?ref=${sha}`]));
  if (data.encoding !== 'base64') throw new Error('Invalid source package metadata encoding');
  const { version } = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  parseBetaVersion(version);
  return version;
}

export async function resolveMainSource({ env = process.env, gh = executeGitHub } = {}) {
  requireMainEvent(env);
  const ref = env.GITHUB_EVENT_NAME === 'push' ? { type: 'commit', sha: env.GITHUB_SHA } :
    JSON.parse(await gh(['api', `${endpoint}/git/ref/heads/main`])).object;
  if (ref?.type !== 'commit' || !validCommit(ref.sha)) throw new Error('Cannot resolve main source commit');
  return { sourceCommit: ref.sha, packageVersion: await sourceVersion(ref.sha, gh) };
}

async function peel(ref, gh) {
  for (let depth = 0; ref?.type === 'tag' && depth < 3; depth++) {
    if (!validCommit(ref.sha)) throw new Error('Invalid annotated tag object');
    ref = JSON.parse(await gh(['api', `${endpoint}/git/tags/${ref.sha}`])).object;
  }
  if (ref?.type !== 'commit' || !validCommit(ref.sha)) throw new Error('Tag must resolve to a full source commit');
  return ref.sha;
}

export async function resolveRemoteTag({ tag, gh = executeGitHub }) {
  if (typeof tag !== 'string' || tag[0] !== 'v') throw new Error('A beta build tag is required');
  parseBetaVersion(tag.slice(1));
  return peel(JSON.parse(await gh(['api', `${endpoint}/git/ref/tags/${tag}`])).object, gh);
}

async function seriesTags(packageVersion, gh) {
  const baseline = parseBetaVersion(packageVersion);
  const pages = JSON.parse(await gh(['api', `${endpoint}/git/matching-refs/tags/v`, '--paginate', '--slurp']));
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error('Invalid paginated tag listing');
  const tags = [];
  for (const ref of pages.flat()) {
    const tag = ref.ref?.slice('refs/tags/'.length);
    if (!ref.ref?.startsWith('refs/tags/v') || !/^v\d+\.\d+\.\d+-beta\.\d+$/.test(tag)) continue;
    const version = parseBetaVersion(tag.slice(1));
    if (['major', 'minor', 'patch'].some((key) => version[key] !== baseline[key])) continue;
    tags.push({ tag, version: tag.slice(1), beta: version.beta, sourceCommit: await peel(ref.object, gh) });
  }
  return tags;
}

function existingIdentity(tags, sourceCommit, baseline) {
  const existing = tags.filter((tag) => tag.sourceCommit === sourceCommit);
  if (existing.length > 1) throw new Error('Multiple ambiguous beta tags already identify this source');
  if (existing[0]?.beta < baseline) throw new Error('Existing source tag predates its version baseline');
  if (!existing.length) return null;
  const { version, tag } = existing[0];
  return { version, tag, sourceCommit };
}

export async function ensureMainTag({ sourceCommit, packageVersion, env = process.env, gh = executeGitHub } = {}) {
  requireMainEvent(env);
  const baseline = parseBetaVersion(packageVersion);
  if (!validCommit(sourceCommit) || (env.GITHUB_EVENT_NAME === 'push' && sourceCommit !== env.GITHUB_SHA)) throw new Error('Tag source must match the pinned main push');
  if (await sourceVersion(sourceCommit, gh) !== packageVersion) throw new Error('Pinned source package baseline metadata changed');
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const comparison = JSON.parse(await gh(['api', `${endpoint}/compare/${sourceCommit}...main`]));
    if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('Manual tag source is not in main history');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const tags = await seriesTags(packageVersion, gh);
    const existing = existingIdentity(tags, sourceCommit, baseline.beta);
    if (existing) return existing;
    const beta = Math.max(baseline.beta, ...tags.map((tag) => tag.beta)) + 1;
    if (!Number.isSafeInteger(beta)) throw new Error('Beta sequence exhausted safe integers');
    const version = `${baseline.major}.${baseline.minor}.${baseline.patch}-beta.${beta}`;
    const tag = `v${version}`;
    try {
      await gh(['api', `${endpoint}/git/refs`, '--method', 'POST', '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sourceCommit}`]);
    } catch (error) {
      const retained = existingIdentity(await seriesTags(packageVersion, gh), sourceCommit, baseline.beta);
      if (retained) return retained;
      if (!/Reference already exists/i.test(`${error.message}\n${error.stderr || ''}`)) throw error;
      continue;
    }
    if (await resolveRemoteTag({ tag, gh }) !== sourceCommit) throw new Error('Created tag does not match the pinned source');
    return { version, tag, sourceCommit };
  }
  throw new Error('Concurrent beta tag allocation did not settle after 10 attempts');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (process.argv.length !== 3 || !['resolve', 'ensure'].includes(command)) throw new Error('Expected resolve or ensure');
    const result = command === 'resolve' ? await resolveMainSource() :
      await ensureMainTag({ sourceCommit: process.env.SOURCE_COMMIT, packageVersion: process.env.SOURCE_PACKAGE_VERSION });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
      `source_commit=${result.sourceCommit}\n${result.tag ? `tag=${result.tag}\nversion=${result.version}` : `package_version=${result.packageVersion}`}\n`);
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
