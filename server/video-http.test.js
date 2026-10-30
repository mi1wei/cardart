import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startServer } from './app.js';
import { openLibrary } from './library.js';
import { importVideo } from './video-importer.js';
import { bmff, nativeVideo, posterBytes, request, videoOptions } from '../tests/fixtures/video.cjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-video-http-'));
  const dir = join(root, 'library');
  const dist = join(root, 'web');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>Owned video fixture</title>');
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    dir,
    async start(options = {}) {
      const runtime = await startServer({ dir, dist, port: 0, ...options });
      servers.push(runtime);
      return runtime;
    },
    async seed({ metadata = 'valid' } = {}) {
      const lib = await openLibrary(dir);
      try {
        const album = await lib.create('Owned video');
        const poster = await posterBytes({ width: 320, height: 180 });
        const video = await nativeVideo();
        const { photo } = await importVideo(lib, album.id, request(poster, video), 'clip.mp4',
          videoOptions(poster, { w: 320, h: 180, duration: 2, lastModified: 1577934245000 }));
        if (metadata !== 'valid') {
          const item = { ...photo };
          if (metadata === 'missing') delete item.metadata;
          else item.metadata = metadata;
          await lib.save({ ...lib.get(album.id), photos: [item] });
        }
        return { album, photo, poster, video, folder: lib.albumDir(album.id) };
      } finally { await lib.close(); }
    },
  };
}
function params(poster, overrides = {}) {
  return new URLSearchParams({ kind: 'video', name: 'wrong-name.jpg', posterBytes: String(poster.length), w: '320', h: '180', duration: '2', ...overrides });
}
async function createAlbum(runtime) {
  return (await fetch(`${runtime.url}api/albums`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'HTTP video' }),
  })).json();
}

test('real video uploads retain container MIME and protected original Range/HEAD semantics', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const album = await createAlbum(runtime);
  const poster = await posterBytes({ width: 320, height: 180 });
  for (const [name, type] of [['h264-aac.mp4', 'video/mp4'], ['h264-aac.mov', 'video/quicktime'], ['h264-aac.m4v', 'video/mp4']]) {
    const video = await nativeVideo(name);
    const response = await fetch(`${runtime.url}api/albums/${album.id}/photos?${params(poster)}`, {
      method: 'POST', headers: { 'X-Album-Upload': '1' }, body: Buffer.concat([poster, video]),
    });
    assert.equal(response.status, 200);
    const { photo } = await response.json();
    assert.equal(photo.kind, 'video');
    const url = `${runtime.url}media/${album.id}/${photo.id}/original`;
    const original = await fetch(url);
    assert.equal(original.headers.get('content-type'), type);
    assert.equal(original.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(original.headers.get('content-security-policy'), 'sandbox');
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), video);
    for (const [range, start, end] of [['bytes=0-31', 0, 31], ['bytes=32-', 32, video.length - 1], ['bytes=-32', video.length - 32, video.length - 1]]) {
      const partial = await fetch(url, { headers: { Range: range } });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get('content-range'), `bytes ${start}-${end}/${video.length}`);
      assert.deepEqual(Buffer.from(await partial.arrayBuffer()), video.subarray(start, end + 1));
    }
    for (const range of [`bytes=${video.length}-`, 'bytes=-0']) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get('content-range'), `bytes */${video.length}`);
      await response.arrayBuffer();
    }
    const head = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=0-31' } });
    assert.equal(head.status, 206);
    assert.equal(head.headers.get('content-length'), '32');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const details = await (await fetch(`${runtime.url}api/albums/${album.id}/photos/${photo.id}/details`)).json();
    assert.equal(details.kind, 'video');
    assert.equal(details.metadata.bytes, video.length);
    assert.equal(details.metadata.exifStatus, undefined);
    assert.equal(details.metadata.fileModifiedAt, null);
  }
});

test('invalid video protocol and oversized declared uploads return JSON without storing or draining the body forever', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const album = await createAlbum(runtime);
  const poster = await posterBytes();
  for (const overrides of [{ kind: 'unknown' }, { duration: '0' }, { posterBytes: '' }, { w: 'Infinity' }]) {
    const response = await fetch(`${runtime.url}api/albums/${album.id}/photos?${params(poster, overrides)}`, {
      method: 'POST', headers: { 'X-Album-Upload': '1' }, body: Buffer.concat([poster, bmff()]),
    });
    assert.deepEqual(await response.json(), { skipped: 'unsupported' });
    assert.equal(response.headers.get('connection'), 'close');
  }
  const denied = await fetch(`${runtime.url}api/albums/${album.id}/photos?${params(poster)}`, { method: 'POST', body: 'not accepted' });
  assert.equal(denied.status, 403);
  await denied.arrayBuffer();
  const result = await new Promise((resolve, reject) => {
    const upload = http.request(`${runtime.url}api/albums/${album.id}/photos?${params(poster)}`, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { 'X-Album-Upload': '1', 'Content-Length': poster.length + 1_000_000_001 },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => { resolve(JSON.parse(Buffer.concat(chunks).toString())); upload.destroy(); });
    });
    upload.on('error', reject);
    upload.flushHeaders();
    t.after(() => upload.destroy());
  });
  assert.deepEqual(result, { skipped: 'too-large' });
  const saved = await (await fetch(`${runtime.url}api/albums/${album.id}`)).json();
  assert.deepEqual(saved.photos, []);
  for (const folder of ['originals', 'cache']) assert.deepEqual(await readdir(join(f.dir, 'albums', album.id, folder)), []);
});

test('video Details fallback only reads file size and never rewrites data or invents EXIF/file times', async (t) => {
  for (const metadata of ['missing', { schemaVersion: 999 }, {
    schemaVersion: 1, kind: 'video', format: 'mp4', bytes: 'invalid', dimensionsSource: 'browser', durationSource: 'browser',
    fileModifiedAt: '2026-02-31T00:00:00.000Z', fileTimeSource: 'source-file',
  }]) await t.test(JSON.stringify(metadata), async (t) => {
    const f = await fixture(t);
    const seeded = await f.seed({ metadata });
    const before = await readFile(join(seeded.folder, 'album.json'));
    const runtime = await f.start({ license: { status: () => ({ state: 'expired', canWrite: false }) } });
    const path = `${runtime.url}api/albums/${seeded.album.id}/photos/${seeded.photo.id}/details`;
    let response = await (await fetch(path)).json();
    assert.equal(response.kind, 'video');
    assert.equal(response.metadata.bytes, seeded.video.length);
    assert.equal(response.metadata.fileModifiedAt, null);
    assert.equal(response.metadata.fileTimeSource, null);
    assert.equal(response.metadata.exifStatus, undefined);
    assert.equal(response.metadata.takenAt, undefined);
    assert.ok(!JSON.stringify(response).includes(f.dir));
    assert.deepEqual(await readFile(join(seeded.folder, 'album.json')), before);
    await rm(join(seeded.folder, 'originals', seeded.photo.file));
    response = await (await fetch(path)).json();
    assert.equal(response.metadata.bytes, null);
    assert.deepEqual(await readFile(join(seeded.folder, 'album.json')), before);
  });
});

test('expired or missing licenses reject video mutations while originals, cached posters and Details stay readable', async (t) => {
  const f = await fixture(t);
  const seeded = await f.seed();
  let state = 'missing';
  const runtime = await f.start({ license: { status: () => ({ state, canWrite: false }) } });
  for (state of ['missing', 'expired']) {
    const base = `${runtime.url}api/albums/${seeded.album.id}`;
    const upload = await fetch(`${base}/photos?${params(seeded.poster)}`, {
      method: 'POST', headers: { 'X-Album-Upload': '1' }, body: Buffer.concat([seeded.poster, seeded.video]),
    });
    assert.equal(upload.status, 403);
    await upload.arrayBuffer();
    for (const [path, body] of [[`${base}/photos/delete`, { ids: [seeded.photo.id] }], [`${base}/photos/${seeded.photo.id}/note`, { note: 'Denied', previousNote: '' }]]) {
      const response = await fetch(path, { method: path.endsWith('note') ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 403);
      await response.arrayBuffer();
    }
    for (const path of [`media/${seeded.album.id}/${seeded.photo.id}/600`, `media/${seeded.album.id}/${seeded.photo.id}/original`,
      `api/albums/${seeded.album.id}/photos/${seeded.photo.id}/details`]) {
      const response = await fetch(runtime.url + path);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  }
});

test('shutdown drains an accepted video upload before releasing its library lock', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const album = await createAlbum(runtime);
  const poster = await posterBytes();
  const video = await nativeVideo();
  const body = Buffer.concat([poster, video]);
  const upload = http.request(`${runtime.url}api/albums/${album.id}/photos?${params(poster)}`, {
    method: 'POST', headers: { Expect: '100-continue', 'X-Album-Upload': '1', 'Content-Length': body.length },
  });
  t.after(() => upload.destroy());
  const uploaded = new Promise((resolve, reject) => {
    upload.on('error', reject);
    upload.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
      response.on('error', reject);
    });
  });
  upload.flushHeaders();
  await once(upload, 'continue');
  upload.write(body.subarray(0, 10));
  const closing = runtime.close();
  upload.end(body.subarray(10));
  const { photo } = await uploaded;
  assert.equal(photo.kind, 'video');
  await closing;
  const reopened = await openLibrary(f.dir);
  try {
    assert.equal(reopened.get(album.id).photos.length, 1);
    assert.deepEqual(await readFile(join(reopened.albumDir(album.id), 'originals', photo.file)), video);
  } finally { await reopened.close(); }
});
