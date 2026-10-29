import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { lanInterfaces, createHandler } from './app.js';
import { openLibrary } from './library.js';
import { importPhoto } from './importer.js';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';

test('LAN candidates exclude unusable addresses, deduplicate aliases and prefer physical adapters', () => {
  const ipv4 = (address, internal = false) => ({ address, family: 'IPv4', internal });
  const candidates = lanInterfaces({
    'vEthernet (Default Switch)': [ipv4('172.20.16.1')],
    'Wi-Fi': [ipv4('192.168.50.10')],
    VPN: [ipv4('10.9.0.1')],
    'vEthernet alias': [ipv4('192.168.50.10')],
    Loopback: [ipv4('127.0.0.1', true)],
    link: [ipv4('169.254.1.2')],
    invalid: [ipv4('0.0.0.0'), { address: '::1', family: 'IPv6', internal: true }],
  });
  assert.deepEqual(candidates[0], { address: '192.168.50.10', name: 'Wi-Fi' });
  assert.deepEqual(new Set(candidates.map((candidate) => candidate.address)), new Set(['192.168.50.10', '172.20.16.1', '10.9.0.1']));
  assert.deepEqual(lanInterfaces({}), []);
});

test('new LAN choices preserve phone key rotation, cookie access and computer-only controls', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-network-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const handler = createHandler(lib);
  const album = await lib.create('Private details');
  const { photo } = await importPhoto(lib, album.id, Readable.from([await photoBytes()]), 'private.jpg');
  const details = `/api/albums/${album.id}/photos/${photo.id}/details`;
  const note = `/api/albums/${album.id}/photos/${photo.id}/note`;
  async function request(url, { local = false, method = 'GET', headers = {}, body } = {}) {
    const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), {
      method, url,
      headers: { host: 'localhost:5291', 'accept-language': 'en', 'content-type': 'application/json', ...headers },
      socket: { remoteAddress: local ? '127.0.0.1' : '192.168.50.20', localPort: 5291 },
    });
    const result = {};
    const res = {
      headersSent: false,
      writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; this.headersSent = true; },
      setHeader() {},
      end(value) { result.body = String(value); },
    };
    await handler(req, res, () => { throw new Error('Unexpected static fallthrough'); });
    return result;
  }
  assert.equal((await request('/api/albums')).status, 403);
  assert.equal((await request(details)).status, 403);
  assert.equal((await request(note, { method: 'PATCH', body: { note: 'Denied', previousNote: '' } })).status, 403);
  const first = await lib.setPhone(true);
  assert.equal((await request('/api/albums')).status, 403);
  assert.equal((await request('/api/albums?key=wrong')).status, 403);
  assert.equal((await request(`/api/albums?key=${first.key}`)).status, 200);
  assert.equal((await request(`${details}?key=${first.key}`)).status, 200);
  assert.equal((await request(`${note}?key=${first.key}`, { method: 'PATCH', body: { note: 'Phone note', previousNote: '' } })).status, 200);
  assert.equal((await request(note, { method: 'PATCH', headers: { cookie: `album_key=${first.key}`, origin: 'https://example.com' }, body: { note: 'Cross-site', previousNote: 'Phone note' } })).status, 403);
  assert.equal((await request(details, { headers: { cookie: `album_key=${first.key}` } })).status, 200);
  assert.equal((await request('/api/albums', { headers: { cookie: `album_key=${first.key}` } })).status, 200);
  assert.equal((await request(`/api/phone?key=${first.key}`)).status, 403);
  assert.equal((await request('/api/phone', { local: true, method: 'PATCH', headers: { origin: 'https://example.com' }, body: { enabled: false } })).status, 403);
  await lib.setPhone(false);
  const second = await lib.setPhone(true);
  assert.notEqual(first.key, second.key);
  assert.equal((await request(`/api/albums?key=${first.key}`)).status, 403);
  assert.equal((await request(`${details}?key=${first.key}`)).status, 403);
  assert.equal((await request(`${note}?key=${first.key}`, { method: 'PATCH', body: { note: 'Expired link', previousNote: 'Phone note' } })).status, 403);
  const info = JSON.parse((await request('/api/phone', { local: true })).body);
  assert.equal(info.port, 5291);
  assert.ok(Array.isArray(info.addresses));
});
