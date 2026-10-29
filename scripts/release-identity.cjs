const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function parseBetaVersion(value) {
  const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/.exec(value);
  if (!match || match[0] !== value || match.slice(1).some((part) => !Number.isSafeInteger(Number(part)))) {
    throw new Error('An explicit canonical beta version with safe integer components is required');
  }
  const [major, minor, patch, beta] = match.slice(1).map(Number);
  return { major, minor, patch, beta };
}

function resolveBuildVersion({ packageVersion, tag }) {
  const baseline = parseBetaVersion(packageVersion);
  if (!tag) return packageVersion;
  if (typeof tag !== 'string' || !tag.startsWith('v')) throw new Error('Build tag must use the v prefix');
  const version = tag.slice(1);
  const candidate = parseBetaVersion(version);
  if (['major', 'minor', 'patch'].some((key) => candidate[key] !== baseline[key]) || candidate.beta < baseline.beta) {
    throw new Error('Build tag must match the source beta series and cannot precede its baseline');
  }
  return version;
}

function readBuildIdentity({ root, env = process.env }) {
  const { version: packageVersion } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tag = env.RELEASE_TAG || null;
  const sourceCommit = env.SOURCE_COMMIT || null;
  const version = resolveBuildVersion({ packageVersion, tag });
  if (!tag && !sourceCommit) return { version, tag: null, sourceCommit: null };
  if (!tag || !/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Tagged builds require RELEASE_TAG and a full SOURCE_COMMIT');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git('rev-parse', 'HEAD') !== sourceCommit || git('rev-parse', `refs/tags/${tag}^{commit}`) !== sourceCommit) {
    throw new Error('Build tag, HEAD and source commit must agree');
  }
  return { version, tag, sourceCommit };
}

module.exports = { parseBetaVersion, resolveBuildVersion, readBuildIdentity };
