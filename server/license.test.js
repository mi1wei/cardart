import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { verifyLicense } from './license.js';
import { createLicenseStore } from './license-store.js';
import { startServer, createHandler } from './app.js';
import { openLibrary } from './library.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const expiresAt = '2099-01-01T00:00:00Z';
const payload = (overrides = {}) => ({
  license_id: 'lic_test', plan: 'trial', device_id: null, expires_at: expiresAt,
  features: ['album_write'], license_version: 1, ...overrides,
});
const envelope = (value = payload()) => {
  const bytes = Buffer.from(JSON.stringify(value));
  return { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') };
};
const now = Date.parse('2026-01-01T00:00:00Z');

test('raw-byte JSON licenses expire exactly at the boundary and capability controls writing', () => {
  const value = envelope();
  const boundary = Date.parse(expiresAt);
  assert.deepEqual(verifyLicense(value, publicKey, boundary - 1), { state: 'active', plan: 'trial', expiresAt, canWrite: true });
  assert.deepEqual(verifyLicense(value, publicKey, boundary), { state: 'expired', plan: 'trial', expiresAt, canWrite: false });
  assert.equal(verifyLicense(envelope(payload({ plan: 'pro', features: [] })), publicKey, now).canWrite, false);
  assert.deepEqual(verifyLicense(null, publicKey, now), { state: 'missing', canWrite: false });
});

test('outer JSON formatting is harmless but altered bytes, wrong keys and malformed envelopes fail closed', () => {
  const value = envelope();
  assert.equal(verifyLicense(JSON.parse(JSON.stringify(value, null, 2)), publicKey, now).canWrite, true);
  const changed = Buffer.from(JSON.stringify(payload(), null, 2)).toString('base64url');
  const largeBytes = Buffer.from(' '.repeat(8192) + JSON.stringify(payload()));
  const large = { payload: largeBytes.toString('base64url'), signature: sign(null, largeBytes, privateKey).toString('base64url') };
  const other = generateKeyPairSync('ed25519').publicKey;
  for (const [candidate, key] of [
    [{ ...value, payload: changed }, publicKey],
    [value, other],
    [{ ...value, signature: value.signature.slice(1) }, publicKey],
    [{ ...value, payload: `@@${value.payload}` }, publicKey],
    [large, publicKey],
    [{ ...value, publicKey: 'attacker' }, publicKey],
  ]) {
    const status = verifyLicense(candidate, key, now);
    assert.equal(status.state, 'invalid');
    assert.equal(status.canWrite, false);
  }
});

test('signed unsupported binding, dates, plans, versions and capabilities are rejected', () => {
  for (const overrides of [
    { device_id: 'device_abc' }, { license_version: 2 },
    { expires_at: '2099-02-31T00:00:00Z' }, { expires_at: '2099-01-01T00:00:00+00:00' },
    { plan: 'enterprise' }, { features: ['advanced_metadata'] },
    { features: ['album_write', 'album_write'] }, { license_id: 'line\nbreak' },
  ]) assert.equal(verifyLicense(envelope(payload(overrides)), publicKey, now).state, 'invalid', JSON.stringify(overrides));
  assert.equal(verifyLicense(envelope(payload({ device_id: 'device_abc' })), publicKey, now).reason, 'unsupported-binding');
});

test('license store preserves a valid file after rejected activation and recomputes expiry', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'license.json');
  const store = await createLicenseStore({ file, publicKey });
  assert.equal(store.status().state, 'missing');
  const value = envelope();
  await store.activate(value);
  const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const before = fingerprint(await readFile(file));
  await assert.rejects(store.activate({ ...value, signature: '' }), { code: 'LICENSE_INVALID' });
  assert.equal(fingerprint(await readFile(file)), before);
  const reopened = await createLicenseStore({ file, publicKey });
  assert.equal(reopened.status().canWrite, true);
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(expiresAt);
    assert.equal(reopened.status().state, 'expired');
    assert.equal(reopened.status().canWrite, false);
  } finally { Date.now = originalNow; }
});

test('private or wrong-algorithm verification keys are configuration errors', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-key-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'license.json');
  await assert.rejects(createLicenseStore({ file, publicKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) }), { code: 'LICENSE_PUBLIC_KEY_INVALID' });
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  await assert.rejects(createLicenseStore({ file, publicKey: rsa }), { code: 'LICENSE_PUBLIC_KEY_INVALID' });
});

test('a failed disk commit does not replace the active license or poison later activation', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-commit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'license.json');
  const backup = join(dir, 'saved.json');
  const store = await createLicenseStore({ file, publicKey });
  await store.activate(envelope());
  const original = await readFile(file);
  await rename(file, backup);
  await mkdir(file);
  await assert.rejects(store.activate(envelope(payload({ plan: 'pro' }))));
  assert.equal(store.status().plan, 'trial');
  assert.deepEqual(await readFile(backup), original);
  await rm(file, { recursive: true });
  await rename(backup, file);
  await store.activate(envelope(payload({ plan: 'pro' })));
  assert.equal(store.status().plan, 'pro');
});

test('HTTP licensing protects every content mutation, limits import size and preserves read access', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-http-'));
  const libraryDir = join(dir, 'library');
  const lib = await openLibrary(libraryDir);
  const existing = await lib.create('Existing');
  await lib.close();
  const dist = join(dir, 'web');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>Folio</title>');
  const license = await createLicenseStore({ file: join(dir, 'license.json'), publicKey });
  const runtime = await startServer({ dir: libraryDir, dist, port: 0, license });
  t.after(async () => { await runtime.close(); await rm(dir, { recursive: true, force: true }); });
  const request = (path, method = 'GET', body) => fetch(`${runtime.url}api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Album-Upload': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await request('albums')).status, 200);
  for (const [path, method, body] of [
    ['albums', 'POST', { title: 'Denied' }],
    [`albums/${existing.id}`, 'PATCH', { title: 'Denied' }],
    [`albums/${existing.id}`, 'DELETE'],
    [`albums/${existing.id}/photos`, 'POST'],
    [`albums/${existing.id}/photos/delete`, 'POST', { ids: ['p001'] }],
  ]) assert.equal((await request(path, method, body)).status, 403, `${method} ${path}`);
  const activated = await request('license', 'POST', envelope());
  assert.equal(activated.status, 200);
  const status = await activated.json();
  assert.equal(status.canWrite, true);
  assert.equal('payload' in status || 'signature' in status, false);
  assert.equal((await request('albums', 'POST', { title: 'Allowed' })).status, 200);
  assert.equal((await request('license', 'POST', { payload: '', signature: '' })).status, 400);
  const large = await fetch(`${runtime.url}api/license`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: ' '.repeat(8192) + JSON.stringify(envelope()),
  });
  assert.equal(large.status, 413);
  assert.equal((await (await request('license')).json()).canWrite, true);
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(expiresAt);
    assert.equal((await request('albums', 'POST', { title: 'Expired' })).status, 403);
    assert.equal((await request('albums')).status, 200);
    assert.equal((await request('phone', 'PATCH', { enabled: false })).status, 200);
  } finally { Date.now = originalNow; }
});

test('authenticated phones can read public license status but cannot activate a license', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-lan-'));
  const lib = await openLibrary(join(dir, 'library'));
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const phone = await lib.setPhone(true);
  const license = await createLicenseStore({ file: join(dir, 'license.json'), publicKey });
  const handler = createHandler(lib, { license });
  async function invoke(method) {
    const req = Object.assign(Readable.from([]), {
      method, url: `/api/license?key=${phone.key}`,
      headers: { host: 'localhost:5291', 'accept-language': 'en' },
      socket: { remoteAddress: '192.168.50.20', localPort: 5291 },
    });
    const result = {};
    const res = {
      headersSent: false, setHeader() {},
      writeHead(status) { result.status = status; this.headersSent = true; },
      end(body) { result.body = JSON.parse(String(body)); },
    };
    await handler(req, res, () => { throw new Error('Unexpected fallthrough'); });
    return result;
  }
  assert.deepEqual(await invoke('GET'), { status: 200, body: { state: 'missing', canWrite: false } });
  assert.equal((await invoke('POST')).status, 403);
});

test('development mode is explicit and fragmented UTF-8 titles are decoded without corruption', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-license-dev-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const handler = createHandler(lib);
  const bytes = Buffer.from(JSON.stringify({ title: '照片' }));
  const split = bytes.indexOf(Buffer.from('照片')) + 1;
  const req = Object.assign(Readable.from([bytes.subarray(0, split), bytes.subarray(split)]), {
    method: 'POST', url: '/api/albums',
    headers: { host: 'localhost:5291', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1', localPort: 5291 },
  });
  let result;
  await handler(req, {
    headersSent: false, writeHead() {}, end(body) { result = JSON.parse(String(body)); },
  }, () => {});
  assert.equal(result.title, '照片');
  await handler({
    method: 'GET', url: '/api/license', headers: req.headers, socket: req.socket,
  }, {
    headersSent: false, writeHead() {}, end(body) { result = JSON.parse(String(body)); },
  }, () => {});
  assert.deepEqual(result, { state: 'development', canWrite: true });
});
