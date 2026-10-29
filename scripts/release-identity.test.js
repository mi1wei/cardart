import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import identity from './release-identity.cjs';

const { parseBetaVersion, resolveBuildVersion, readBuildIdentity } = identity;

test('build versions use an exact same-series beta tag without changing the source baseline', () => {
  assert.equal(resolveBuildVersion({ packageVersion: '0.1.0-beta.1', tag: 'v0.1.0-beta.2' }), '0.1.0-beta.2');
  assert.equal(resolveBuildVersion({ packageVersion: '0.1.0-beta.1' }), '0.1.0-beta.1');
  assert.deepEqual(parseBetaVersion('0.1.0-beta.12'), { major: 0, minor: 1, patch: 0, beta: 12 });
  for (const tag of ['0.1.0-beta.2', 'v0.1.0', 'v0.2.0-beta.2', 'v0.1.0-beta.0', 'v0.1.0-beta.02', 'v0.1.0-beta.9007199254740992']) {
    assert.throws(() => resolveBuildVersion({ packageVersion: '0.1.0-beta.1', tag }));
  }
  for (const value of ['0.1.0', '00.1.0-beta.1', '0.1.0-beta.1\n', undefined]) assert.throws(() => parseBetaVersion(value));
});

test('tagged build identity requires HEAD, full source SHA and a real peeled tag to agree', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-build-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.0-beta.1' }));
  assert.deepEqual(readBuildIdentity({ root, env: {} }), { version: '0.1.0-beta.1', tag: null, sourceCommit: null });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Folio test');
  git('config', 'user.email', 'test@example.invalid');
  git('add', 'package.json');
  git('commit', '-qm', 'fixture');
  const sourceCommit = git('rev-parse', 'HEAD');
  git('tag', '-a', 'v0.1.0-beta.2', '-m', 'fixture tag');
  const env = { RELEASE_TAG: 'v0.1.0-beta.2', SOURCE_COMMIT: sourceCommit };
  assert.deepEqual(readBuildIdentity({ root, env }), { version: '0.1.0-beta.2', tag: env.RELEASE_TAG, sourceCommit });
  for (const invalid of [
    { ...env, SOURCE_COMMIT: 'b'.repeat(40) }, { ...env, SOURCE_COMMIT: undefined },
    { ...env, RELEASE_TAG: 'v0.1.0-beta.3' }, { ...env, RELEASE_TAG: undefined },
  ]) assert.throws(() => readBuildIdentity({ root, env: invalid }));
  git('commit', '--allow-empty', '-qm', 'another source');
  assert.throws(() => readBuildIdentity({ root, env }));
});
