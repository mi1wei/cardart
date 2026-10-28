import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createPublicKey, verify, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./license-issuer.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('issuer creates protected test keys, refuses overwrites and emits independently verifiable JSON', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-issuer-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const privateFile = join(dir, 'test-private.pem');
  const publicFile = join(dir, 'test-public.pem');
  const output = join(dir, 'license.json');
  const generated = run('keygen', '--private-out', privateFile, '--public-out', publicFile);
  assert.equal(generated.status, 0, generated.stderr);
  if (process.platform !== 'win32') assert.equal((await stat(privateFile)).mode & 0o777, 0o600);
  const fingerprint = createHash('sha256').update(await readFile(privateFile)).digest('hex');
  assert.notEqual(run('keygen', '--private-out', privateFile, '--public-out', publicFile).status, 0);
  assert.equal(createHash('sha256').update(await readFile(privateFile)).digest('hex'), fingerprint);
  const issued = run('issue', '--private-key', privateFile, '--plan', 'trial', '--expires-at', '2099-01-01T00:00:00Z', '--out', output);
  assert.equal(issued.status, 0, issued.stderr);
  const license = JSON.parse(await readFile(output, 'utf8'));
  const bytes = Buffer.from(license.payload, 'base64url');
  assert.equal(verify(null, bytes, createPublicKey(await readFile(publicFile)), Buffer.from(license.signature, 'base64url')), true);
  const data = JSON.parse(bytes);
  assert.equal(data.device_id, null);
  assert.equal(data.plan, 'trial');
  assert.deepEqual(data.features, ['album_write']);
  assert.doesNotMatch(generated.stdout + issued.stdout, /BEGIN PRIVATE KEY|"payload"|"signature"/);
  assert.notEqual(run('issue', '--private-key', privateFile, '--plan', 'pro', '--expires-at', '2099-02-31T00:00:00Z', '--out', output).status, 0);
});

test('key generation refuses a private-key destination inside any repository', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-issuer-boundary-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, '.git'));
  const result = run('keygen', '--private-out', join(dir, 'private.pem'), '--public-out', join(dir, 'public.pem'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repository/i);
});

test('signing cannot disguise a repository-contained private key behind a file symlink', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-issuer-link-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  await mkdir(join(repo, '.git'), { recursive: true });
  const target = join(repo, 'not-a-real-key.pem');
  await writeFile(target, 'not a cryptographic key', { mode: 0o600 });
  const alias = join(dir, 'alias.pem');
  try { await symlink(target, alias, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows runner does not grant file-symlink privilege'); return; }
    throw error;
  }
  const result = run('issue', '--private-key', alias, '--plan', 'pro', '--expires-at', '2099-01-01T00:00:00Z', '--out', join(dir, 'license.json'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repository/i);
});
