import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureMainTag, resolveMainSource, resolveRemoteTag } from './auto-main-tag.mjs';

const sourceCommit = 'a'.repeat(40);
const other = 'b'.repeat(40);
const packageVersion = '0.1.0-beta.1';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'mi1wei/cardart', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sourceCommit };
const ref = (tag, sha = other, type = 'commit') => ({ ref: `refs/tags/${tag}`, object: { type, sha } });
const metadata = { encoding: 'base64', content: Buffer.from(JSON.stringify({ version: packageVersion })).toString('base64') };

function github(initial = [], create) {
  const refs = [...initial];
  const writes = [];
  const gh = async (args) => {
    const endpoint = args[1];
    if (endpoint.includes('/contents/package.json?ref=')) return JSON.stringify(metadata);
    if (endpoint.endsWith('/git/ref/heads/main')) return JSON.stringify({ object: { type: 'commit', sha: other } });
    if (endpoint.includes('/compare/')) return JSON.stringify({ status: 'ahead' });
    if (endpoint.includes('/git/matching-refs/')) {
      assert.ok(args.includes('--paginate'));
      return JSON.stringify([refs.slice(0, 1), refs.slice(1)]);
    }
    if (endpoint.includes('/git/tags/')) return JSON.stringify({ object: { type: 'commit', sha: sourceCommit } });
    if (endpoint.includes('/git/ref/tags/')) {
      const found = refs.find((value) => value.ref === `refs/tags/${endpoint.split('/git/ref/tags/')[1]}`);
      if (!found) throw new Error('HTTP 404');
      return JSON.stringify(found);
    }
    assert.ok(args.includes('POST'), `Unexpected write: ${args}`);
    const tag = args.find((value) => value.startsWith('ref=')).slice('ref=refs/tags/'.length);
    const sha = args.find((value) => value.startsWith('sha=')).slice(4);
    writes.push({ tag, sha });
    if (create) await create({ refs, tag, sha, attempt: writes.length });
    if (refs.some((value) => value.ref === `refs/tags/${tag}`)) {
      throw Object.assign(new Error('HTTP 422'), { stderr: 'Reference already exists (HTTP 422)' });
    }
    const value = ref(tag, sha);
    refs.push(value);
    return JSON.stringify(value);
  };
  return { gh, refs, writes };
}

test('main source resolution pins push SHA and manual source is resolved once', async () => {
  const f = github();
  assert.deepEqual(await resolveMainSource({ env, gh: f.gh }), { sourceCommit, packageVersion });
  assert.deepEqual(await resolveMainSource({ env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, gh: f.gh }),
    { sourceCommit: other, packageVersion });
});

test('main tags allocate numerically across all pages and reuse an existing source tag', async () => {
  for (const [refs, expected] of [
    [[], 'v0.1.0-beta.2'],
    [[ref('v0.1.0-beta.9'), ref('v0.1.0-beta.10'), ref('v0.2.0-beta.90')], 'v0.1.0-beta.11'],
    [[ref('v0.1.0-beta.7', sourceCommit)], 'v0.1.0-beta.7'],
    [[ref('v0.1.0-beta.8', 'c'.repeat(40), 'tag')], 'v0.1.0-beta.8'],
  ]) {
    const f = github(refs);
    const result = await ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh });
    assert.equal(result.tag, expected);
    assert.equal(result.sourceCommit, sourceCommit);
    const again = await ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh });
    assert.deepEqual(again, result);
    assert.equal(f.writes.length, refs.some((value) => value.object.sha === sourceCommit || value.object.type === 'tag') ? 0 : 1);
  }
});

test('a concurrent ref winner is never overwritten and the losing source gets the next number', async () => {
  const f = github([], async ({ refs, tag, attempt }) => {
    if (attempt === 1) refs.push(ref(tag, other));
  });
  assert.equal((await ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh })).tag, 'v0.1.0-beta.3');
  assert.equal(f.refs.find((value) => value.ref.endsWith('beta.2')).object.sha, other);
  assert.equal(f.writes.length, 2);
});

test('a lost creation response is recovered from the same immutable ref', async () => {
  const f = github([], async ({ refs, tag, sha }) => {
    refs.push(ref(tag, sha));
    throw new Error('Connection reset after server write');
  });
  assert.equal((await ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh })).tag, 'v0.1.0-beta.2');
  assert.equal(f.writes.length, 1);
});

test('permissions, rate limits and unrelated validation errors do not allocate another version', async () => {
  for (const message of ['HTTP 403', 'HTTP 429', 'Invalid SHA (HTTP 422)']) {
    const f = github([], async () => { throw new Error(message); });
    await assert.rejects(ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh }));
    assert.equal(f.writes.length, 1);
  }
});

test('untrusted events, mismatched source metadata and ambiguous existing identities cannot write tags', async () => {
  for (const invalid of [
    { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, GITHUB_REF: 'refs/heads/feature' },
    { ...env, GITHUB_REPOSITORY: 'someone/fork' }, { ...env, GITHUB_SHA: other },
  ]) {
    const f = github();
    await assert.rejects(ensureMainTag({ sourceCommit, packageVersion, env: invalid, gh: f.gh }));
    assert.equal(f.writes.length, 0);
  }
  const f = github([ref('v0.1.0-beta.2', sourceCommit), ref('v0.1.0-beta.3', sourceCommit)]);
  await assert.rejects(ensureMainTag({ sourceCommit, packageVersion, env, gh: f.gh }), /multiple|ambiguous/i);
  await assert.rejects(ensureMainTag({ sourceCommit, packageVersion: '0.1.0-beta.9', env, gh: f.gh }), /baseline|metadata/i);
  assert.equal(f.writes.length, 0);
});

test('remote tag verification peels annotated refs and rejects an unexpected commit', async () => {
  const f = github([ref('v0.1.0-beta.2', other, 'tag')]);
  assert.equal(await resolveRemoteTag({ tag: 'v0.1.0-beta.2', gh: f.gh }), sourceCommit);
});
