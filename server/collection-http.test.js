import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import yauzl from 'yauzl';
import { startServer } from './app.js';
import { openLibrary } from './library.js';
import { downloadZip } from './download.js';

async function fixture(t) {
  const root = join(process.cwd(), '.test-collection', randomUUID());
  const dir = join(root, 'library'), dist = join(root, 'web');
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), 'fixture');
  const lib = await openLibrary(dir);
  const album = await lib.create('Download\r\nalbum');
  const photos = [
    { id: 'p001', file: 'p001.jpg', name: '../same.jpg', sha256: 'one', addedAt: '2026-03-01T00:00:00.000Z', metadata: { takenAt: null }, note: 'note', w: 12, h: 8 },
    { id: 'p002', file: 'p002.jpg', name: 'C:\\private\\same.jpg', sha256: 'two', addedAt: '2026-01-01T00:00:00.000Z', metadata: { takenAt: null }, w: 12, h: 8 },
  ];
  for (const [i, photo] of photos.entries()) {
    await writeFile(join(lib.albumDir(album.id), 'originals', photo.file), `file ${i + 1}`);
    for (const size of [600, 1600]) await writeFile(join(lib.albumDir(album.id), 'cache', `${photo.id}_${size}.webp`), `preview ${i + 1}`);
  }
  await lib.save({ ...album, photos, nextSeq: 3 });
  const target = await lib.create('Target');
  await lib.close();
  let canWrite = true;
  const runtime = await startServer({ dir, dist, port: 0, license: { status: () => ({ state: canWrite ? 'active' : 'expired', canWrite }) } });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  return { runtime, dir, album, target, photos, readonly() { canWrite = false; },
    async request(path, body, method = 'POST') {
      return fetch(runtime.url + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } };
}
async function unzip(buffer) {
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
  return new Promise((resolve, reject) => {
    const files = [];
    zip.on('error', reject);
    zip.on('end', () => resolve(files));
    zip.on('entry', (entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('error', reject);
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => { files.push({ name: entry.fileName, method: entry.compressionMethod, data: Buffer.concat(chunks).toString() }); zip.readEntry(); });
      });
    });
    zip.readEntry();
  });
}

test('HTTP deletion retains album shape and complete trash entries; restore and purge are write-gated', async (t) => {
  const f = await fixture(t);
  const deleted = await f.request(`api/albums/${f.album.id}/photos/delete`, { ids: ['p001'] });
  assert.equal(deleted.status, 200);
  const album = await deleted.json();
  assert.equal(album.id, f.album.id);
  assert.equal(album.photos.length, 1);
  assert.ok(album.trashId);
  const entries = await (await fetch(f.runtime.url + 'api/trash')).json();
  assert.deepEqual(entries[0].photos, [f.photos[0]]);
  const path = `trash-media/${album.trashId}/p001/original`;
  const media = await fetch(f.runtime.url + path, { headers: { Range: 'bytes=1-3' } });
  assert.equal(media.status, 206);
  assert.equal(await media.text(), 'ile');
  assert.equal(media.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(f.runtime.url + `trash-media/${album.trashId}/p002/original`)).status, 404);
  assert.equal((await fetch(f.runtime.url + `media/${f.album.id}/p001/original`)).status, 404);
  assert.equal((await fetch(f.runtime.url + `trash-media/${album.trashId}/p001/600`)).status, 200);
  const restored = await f.request('api/trash/restore', { ids: [album.trashId] });
  assert.deepEqual(await restored.json(), { restored: [album.trashId] });
  assert.equal((await fetch(f.runtime.url + path)).status, 404);
  const removed = await f.request(`api/albums/${f.album.id}`, undefined, 'DELETE');
  const removal = await removed.json();
  assert.deepEqual(removal, { ok: true, trashId: removal.trashId });
  f.readonly();
  assert.equal((await f.request('api/trash/purge', { all: true })).status, 403);
  assert.equal((await f.request('api/trash/restore', { ids: [removal.trashId] })).status, 403);
  assert.equal((await fetch(f.runtime.url + `trash-media/${removal.trashId}/p001/original`)).status, 200);
});

test('ZIP is uncompressed, sanitizes and numbers duplicate names, and remains available read-only', async (t) => {
  const f = await fixture(t);
  f.readonly();
  const original = await fetch(f.runtime.url + `media/${f.album.id}/p001/original?download=1`);
  assert.equal(original.status, 200);
  assert.match(original.headers.get('content-disposition'), /^attachment;/);
  assert.ok(!original.headers.get('content-disposition').includes('..'));
  const response = await f.request(`api/albums/${f.album.id}/photos/download`, { ids: ['p001', 'p002'] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(await unzip(Buffer.from(await response.arrayBuffer())), [
    { name: 'same.jpg', method: 0, data: 'file 1' },
    { name: 'same (2).jpg', method: 0, data: 'file 2' },
  ]);
  assert.equal((await f.request(`api/albums/${f.album.id}/photos/download`, { ids: [] })).status, 400);
  assert.equal((await f.request(`api/albums/${f.album.id}/photos/download`, { ids: ['p999'] })).status, 404);
  const nativeDownload = await fetch(f.runtime.url + `api/albums/${f.album.id}/photos/download?ids=p001,p002`);
  assert.equal(nativeDownload.status, 200);
  assert.match(nativeDownload.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(await unzip(Buffer.from(await nativeDownload.arrayBuffer())), [
    { name: 'same.jpg', method: 0, data: 'file 1' },
    { name: 'same (2).jpg', method: 0, data: 'file 2' },
  ]);
  for (const query of ['', '?ids=p001,p001', '?ids=../secret', '?ids=p001&ids=p002', '?ids=p001,']) {
    assert.equal((await fetch(f.runtime.url + `api/albums/${f.album.id}/photos/download${query}`)).status, 400);
  }
});

test('API mutations and transfer return sorted snapshots and invalid sort is rejected', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request(`api/albums/${f.album.id}`, { sort: 'bad' }, 'PATCH')).status, 400);
  const sorted = await f.request(`api/albums/${f.album.id}`, { sort: 'added' }, 'PATCH');
  assert.deepEqual((await sorted.json()).photos.map((p) => p.id), ['p002', 'p001']);
  const snapshot = await (await fetch(f.runtime.url + `api/albums/${f.album.id}`)).json();
  assert.deepEqual(snapshot.photos.map((p) => p.id), ['p002', 'p001']);
  const noted = await f.request(`api/albums/${f.album.id}/photos/p001/note`, { note: 'Edited note', previousNote: 'note' }, 'PATCH');
  assert.deepEqual((await noted.json()).photos.map((p) => p.id), ['p002', 'p001']);
  const moved = await f.request(`api/albums/${f.album.id}/photos/transfer`, { ids: ['p001'], targetId: f.target.id, mode: 'move' });
  assert.equal(moved.status, 200);
  const result = await moved.json();
  assert.equal(result.album.photos.length, 1);
  assert.equal(result.target.photos[0].note, 'Edited note');
  assert.equal(result.copied, 1);
  assert.equal(result.skipped, 0);
  const deleted = await f.request(`api/albums/${f.target.id}/photos/delete`, { ids: [result.target.photos[0].id] });
  const { trashId } = await deleted.json();
  const purged = await f.request('api/trash/purge', { ids: [trashId] });
  assert.deepEqual(await purged.json(), { purged: [trashId] });
  assert.deepEqual(await (await fetch(f.runtime.url + 'api/trash')).json(), []);
  await assert.rejects(readFile(join(f.dir, '.trash', trashId, 'entry.json')), { code: 'ENOENT' });
});

test('aborting a ZIP releases its streams and coordinator so a subsequent move can finish', { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  await f.runtime.close();
  const lib = await openLibrary(f.dir);
  let completed;
  const completion = new Promise((resolve) => { completed = resolve; });
  const server = http.createServer((req, res) => {
    req.resume();
    lib.queue(f.album.id, () => downloadZip(lib, f.album.id, ['p001', 'p002'], req, res))
      .then(() => completed({}), (error) => completed({ error }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(join(f.dir, 'albums', f.album.id, 'originals', 'p001.jpg'), Buffer.alloc(8 * 1024 * 1024, 17));
    const request = http.request(`http://127.0.0.1:${server.address().port}/download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    t.after(() => request.destroy());
    request.end(JSON.stringify({ ids: ['p001', 'p002'] }));
    const [response] = await once(request, 'response');
    assert.equal(response.statusCode, 200);
    response.pause();
    response.destroy();
    request.destroy();
    assert.deepEqual(await completion, {});
    const transferred = await lib.transfer(f.album.id, { ids: ['p001'], targetId: f.target.id, mode: 'move' });
    assert.equal(transferred.copied, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await lib.close();
  }
});
