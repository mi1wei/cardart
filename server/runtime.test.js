import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import sharp from 'sharp';
import { startServer } from './app.js';
import { openLibrary } from './library.js';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';
import { importPhoto } from './importer.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-runtime-'));
  const dist = join(root, 'web');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>Folio fixture</title>');
  const runtimes = [];
  t.after(async () => {
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    dir: join(root, 'library'), dist,
    async start(options = {}) {
      const runtime = await startServer({ dir: join(root, 'library'), dist, port: 0, ...options });
      runtimes.push(runtime);
      return runtime;
    },
  };
}

test('desktop starts its own service on fallback and failed CLI listen releases the library', async (t) => {
  const f = await fixture(t);
  const occupied = http.createServer((req, res) => res.end('foreign'));
  await new Promise((resolve) => occupied.listen(0, '0.0.0.0', resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const port = occupied.address().port;
  await assert.rejects(startServer({ dir: f.dir, dist: f.dist, port }), { code: 'EADDRINUSE' });
  const runtime = await f.start({ port, fallbackToRandomPort: true });
  assert.notEqual(runtime.port, port);
  assert.deepEqual(await (await fetch(`${runtime.url}api/albums`)).json(), []);
  const phone = await (await fetch(`${runtime.url}api/phone`)).json();
  assert.equal(phone.port, runtime.port);
  const closing = runtime.close();
  assert.equal(runtime.close(), closing);
  await closing;
  const reopened = await openLibrary(f.dir);
  await reopened.close();
});

test('shutdown finishes an already accepted photo upload before releasing its library', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const response = await fetch(`${runtime.url}api/albums`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Uploading' }),
  });
  const album = await response.json();
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#1d5f80' } }).png().toBuffer();
  const upload = http.request(`${runtime.url}api/albums/${album.id}/photos?name=test.png`, {
    method: 'POST', headers: { Expect: '100-continue', 'X-Album-Upload': '1', 'Content-Length': png.length },
  });
  t.after(() => upload.destroy());
  const uploaded = new Promise((resolve, reject) => {
    upload.on('error', reject);
    upload.on('response', (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
  upload.flushHeaders();
  await once(upload, 'continue');
  upload.write(png.subarray(0, 10));
  const closing = runtime.close();
  upload.end(png.subarray(10));
  assert.ok((await uploaded).photo);
  await closing;
  const reopened = await openLibrary(f.dir);
  try { assert.equal(reopened.get(album.id).photos.length, 1); }
  finally { await reopened.close(); }
});

test('photo upload carries valid source file time but ignores malformed optional timestamps', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const bytes = await photoBytes();
  for (const [value, expected] of [['1577934245000', 'source-file'], ['1e3', 'library-copy']]) {
    const album = await (await fetch(`${runtime.url}api/albums`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Source time' }),
    })).json();
    const response = await fetch(`${runtime.url}api/albums/${album.id}/photos?name=image.jpg&lastModified=${value}`, {
      method: 'POST', headers: { 'X-Album-Upload': '1' }, body: bytes,
    });
    assert.equal(response.status, 200);
    const { photo } = await response.json();
    assert.ok(photo.metadata);
    assert.equal(photo.metadata.fileTimeSource, expected);
    if (expected === 'source-file') assert.equal(photo.metadata.fileModifiedAt, '2020-01-02T03:04:05.000Z');
    assert.equal(photo.metadata.takenAt.raw, '2026:08:15 09:30:00');
  }
});

async function seedPhoto(dir, { legacy = false } = {}) {
  const lib = await openLibrary(dir);
  try {
    const album = await lib.create('Photo details');
    const { photo } = await importPhoto(lib, album.id, Readable.from([await photoBytes()]), 'original.jpg');
    if (legacy) {
      const { metadata, ...oldPhoto } = photo;
      await lib.save({ ...lib.get(album.id), photos: [oldPhoto] });
    }
    return { albumId: album.id, photo, folder: lib.albumDir(album.id) };
  } finally { await lib.close(); }
}

test('legacy details read original EXIF in read-only mode without modifying any album data', async (t) => {
  const f = await fixture(t);
  const seeded = await seedPhoto(f.dir, { legacy: true });
  const files = [join(f.dir, 'library.json'), join(seeded.folder, 'album.json'), join(seeded.folder, 'originals', seeded.photo.file),
    ...[600, 1600].map((size) => join(seeded.folder, 'cache', `${seeded.photo.id}_${size}.webp`))];
  const before = await Promise.all(files.map((file) => readFile(file)));
  for (const state of ['missing', 'expired']) {
    const runtime = await f.start({ license: { status: () => ({ state, canWrite: false }) } });
    const response = await fetch(`${runtime.url}api/albums/${seeded.albumId}/photos/${seeded.photo.id}/details`);
    assert.equal(response.status, 200);
    const details = await response.json();
    assert.equal(details.photoId, seeded.photo.id);
    assert.equal(details.metadata.cameraModel, 'Synthetic Camera');
    assert.equal(details.metadata.takenAt.raw, '2026:08:15 09:30:00');
    assert.equal(details.metadata.fileTimeSource, 'library-copy');
    assert.deepEqual(await Promise.all(files.map((file) => readFile(file))), before);
    assert.deepEqual((await readdir(seeded.folder)).sort(), ['album.json', 'cache', 'originals']);
    await runtime.close();
  }
});

test('stored details survive missing originals while legacy missing files degrade without exposing paths', async (t) => {
  const f = await fixture(t);
  const seeded = await seedPhoto(f.dir);
  await rm(join(seeded.folder, 'originals', seeded.photo.file));
  let runtime = await f.start();
  const path = `api/albums/${seeded.albumId}/photos/${seeded.photo.id}/details`;
  const stored = await (await fetch(runtime.url + path)).json();
  assert.deepEqual(stored.metadata, seeded.photo.metadata);
  assert.equal((await fetch(`${runtime.url}api/albums/${seeded.albumId}/photos/p999/details`)).status, 404);
  assert.equal((await fetch(runtime.url + path + '/extra')).status, 404);
  assert.equal((await fetch(`${runtime.url}api/albums/${seeded.albumId}/photos/p001%2f..%2fsecret/details`)).status, 404);
  await runtime.close();
  for (const metadata of [{ schemaVersion: 999 }, { ...seeded.photo.metadata, latitude: 'invalid' }]) {
    const lib = await openLibrary(f.dir);
    try { await lib.save({ ...lib.get(seeded.albumId), photos: [{ ...seeded.photo, metadata }] }); }
    finally { await lib.close(); }
    runtime = await f.start();
    const response = await fetch(runtime.url + path);
    assert.equal(response.status, 200);
    const missing = await response.json();
    assert.equal(missing.metadata.exifStatus, 'unreadable');
    assert.equal(missing.metadata.takenAt, null);
    assert.ok(!JSON.stringify(missing).includes(f.dir));
    await runtime.close();
  }
});

test('legacy details do not leak across libraries with the same album and photo IDs', async (t) => {
  const f = await fixture(t);
  const seeded = await seedPhoto(f.dir, { legacy: true });
  const other = join(f.dir, '..', 'other-library');
  await cp(f.dir, other, { recursive: true });
  await writeFile(join(other, 'albums', seeded.albumId, 'originals', seeded.photo.file), await photoBytes({ exif: {
    IFD0: { Make: 'Other Library', Model: 'Other Camera' },
  } }));
  for (const [dir, make] of [[f.dir, 'Folio Test'], [other, 'Other Library']]) {
    const runtime = await f.start({ dir });
    const response = await fetch(`${runtime.url}api/albums/${seeded.albumId}/photos/${seeded.photo.id}/details`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).metadata.cameraMake, make);
    await runtime.close();
  }
});

test('a paused read-only video transfer cannot prevent shutdown or keep the library locked', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.dist, 'large.mp4'), Buffer.alloc(32 * 1024 * 1024));
  const runtime = await f.start();
  const request = http.get(`${runtime.url}large.mp4`);
  const [response] = await once(request, 'response');
  response.pause();
  const closing = runtime.close();
  try {
    const finished = await Promise.race([
      closing.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1000).unref()),
    ]);
    assert.equal(finished, true, 'read-only backpressure must not block safe shutdown');
  } finally { response.destroy(); request.destroy(); await closing; }
  const reopened = await openLibrary(f.dir);
  await reopened.close();
});

test('an unfinished GET body with no remaining handler work cannot strand shutdown', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const request = http.request(`${runtime.url}api/albums`, { method: 'GET', headers: { 'Content-Length': 10 } });
  request.on('error', () => {});
  request.flushHeaders();
  const [response] = await once(request, 'response');
  response.resume();
  await once(response, 'end');
  const closing = runtime.close();
  try {
    const finished = await Promise.race([
      closing.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1000).unref()),
    ]);
    assert.equal(finished, true, 'an unfinished GET body must not outlive all admitted work');
  } finally { request.destroy(); await closing; }
});

test('language falls back to the Folio cookie when this origin has no saved preference', async () => {
  const keys = ['document', 'localStorage', 'navigator'];
  const original = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      cookie: 'other_lang=zh; folio_lang=en',
      documentElement: { style: { setProperty() {} } },
      querySelector: () => null,
    } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['zh-CN'] } });
    const { lang } = await import('../src/i18n.js?runtime-cookie-test');
    assert.equal(lang(), 'en');
  } finally {
    keys.forEach((key, index) => {
      if (original[index]) Object.defineProperty(globalThis, key, original[index]);
      else delete globalThis[key];
    });
  }
});
