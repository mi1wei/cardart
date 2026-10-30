import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import sharp from 'sharp';
import { openLibrary } from './library.js';
import { ensureCache, importPhoto } from './importer.js';
import { importVideo, parseVideoParameters } from './video-importer.js';
import { bmff, posterBytes, request, videoOptions, workspace } from '../tests/fixtures/video.cjs';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';

function failFs(t, method, predicate) {
  const original = fs[method];
  const spy = t.mock.method(fs, method, async (...args) => {
    if (predicate(...args)) throw Object.assign(new Error('Owned filesystem failure'), { code: 'EIO' });
    return original(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { spy.mock.restore(); syncBuiltinESMExports(); });
  return () => { spy.mock.restore(); syncBuiltinESMExports(); };
}
async function assertEmpty(lib, album, originals, cache) {
  assert.deepEqual(await readdir(originals), []);
  assert.deepEqual(await readdir(cache), []);
  assert.deepEqual(lib.get(album.id).photos, []);
}

test('video parameters reject nondecimal and unsafe values without rejecting optional bad file times', () => {
  const base = { posterBytes: '100', w: '3840', h: '2160', duration: '0.04', lastModified: '1577934245000' };
  assert.deepEqual(parseVideoParameters(new URLSearchParams(base)),
    { posterBytes: 100, w: 3840, h: 2160, duration: 0.04, lastModified: 1577934245000 });
  for (const [key, values] of Object.entries({
    posterBytes: ['', '0', '-1', '1.5', '10485761', '0x10', '1e3'],
    w: ['0', '65536', '1.2', 'Infinity'], h: ['', '-1'],
    duration: ['', ' ', '0', '-1', 'Infinity', 'NaN', '0x10'],
  })) for (const value of values) assert.equal(parseVideoParameters(new URLSearchParams({ ...base, [key]: value })), null);
  const time = parseVideoParameters(new URLSearchParams({ ...base, lastModified: '1e3', duration: '4e-2' }));
  assert.equal(time.duration, 0.04);
  assert.equal(time.lastModified, undefined);
});

test('video import preserves raw hash and separates browser dimensions from actual poster dimensions across chunks', async (t) => {
  const { dir, lib, album, originals, cache } = await workspace(t);
  const poster = await posterBytes();
  const video = bmff({ brand: 'qt  ' });
  let saved;
  for (const splitAt of [1, poster.length - 1, poster.length, poster.length + 1]) {
    const result = await importVideo(lib, album.id, request(poster, video, { splitAt }), 'not-trusted.mp4',
      videoOptions(poster, { lastModified: 1577934245000 }));
    if (saved) { assert.deepEqual(result, { skipped: 'duplicate' }); continue; }
    saved = result.photo;
    assert.equal(saved.file, 'p001.mov');
    assert.equal(saved.kind, 'video');
    assert.deepEqual([saved.w, saved.h, saved.posterW, saved.posterH], [3840, 2160, 640, 360]);
    assert.equal(saved.metadata.bytes, video.length);
    assert.equal(saved.metadata.dimensionsSource, 'browser');
    assert.equal(saved.metadata.fileModifiedAt, '2020-01-02T03:04:05.000Z');
    assert.equal(saved.metadata.exifStatus, undefined);
    assert.equal(saved.sha256, createHash('sha256').update(video).digest('hex'));
    assert.deepEqual(await readFile(join(originals, saved.file)), video);
    assert.deepEqual(await readFile(join(originals, saved.poster)), poster);
    for (const size of [600, 1600]) assert.ok((await stat(join(cache, `${saved.id}_${size}.webp`))).size);
  }
  const otherPoster = await posterBytes({ background: '#a32f2f' });
  assert.deepEqual(await importVideo(lib, album.id, request(otherPoster, video), 'duplicate.mov', videoOptions(otherPoster)), { skipped: 'duplicate' });
  await lib.close();
  const reopened = await openLibrary(dir);
  try { assert.deepEqual(reopened.get(album.id).photos, [saved]); }
  finally { await reopened.close(); }
});

test('video byte limit counts only original bytes and supports chunked requests at the exact limit', async (t) => {
  for (const declared of [false, true]) {
    await t.test(`declared length ${declared}`, async (t) => {
      const { lib, album, originals, cache } = await workspace(t);
      const poster = await posterBytes();
      const video = bmff();
      const headers = declared ? { 'content-length': poster.length + video.length } : {};
      const rejected = await importVideo(lib, album.id, request(poster, video, { headers }), 'large.mp4',
        videoOptions(poster, { maxVideoBytes: video.length - 1 }));
      assert.deepEqual(rejected, { skipped: 'too-large' });
      await assertEmpty(lib, album, originals, cache);
      assert.ok((await importVideo(lib, album.id, request(poster, video, { headers }), 'exact.mp4',
        videoOptions(poster, { maxVideoBytes: video.length }))).photo);
    });
  }
});

test('bad video bodies, JPEGs and dimensions leave no originals, caches or index entries', async (t) => {
  const { lib, album, originals, cache } = await workspace(t);
  const jpeg = await posterBytes();
  const png = await posterBytes({ format: 'png' });
  const wide = await posterBytes({ width: 1601, height: 1 });
  const bomb = Buffer.from(jpeg);
  for (let offset = 2; offset < bomb.length - 9; offset++) {
    if (bomb[offset] === 0xff && [0xc0, 0xc1, 0xc2].includes(bomb[offset + 1])) {
      bomb.writeUInt16BE(60000, offset + 5);
      bomb.writeUInt16BE(60000, offset + 7);
      break;
    }
  }
  const cases = [
    [jpeg.subarray(0, -1), Buffer.alloc(0), videoOptions(jpeg)],
    [jpeg, Buffer.alloc(0), videoOptions(jpeg)],
    [jpeg, Buffer.from('not video'), videoOptions(jpeg)],
    [png, bmff(), videoOptions(png)], [wide, bmff(), videoOptions(wide)],
    [bomb, bmff(), videoOptions(bomb)],
    [jpeg.subarray(0, jpeg.length / 2), bmff(), videoOptions(jpeg.subarray(0, jpeg.length / 2))],
    [jpeg, bmff(), videoOptions(jpeg, { posterBytes: 0 })],
    [jpeg, bmff(), videoOptions(jpeg, { duration: 0 })],
    [jpeg, bmff(), videoOptions(jpeg, { w: 65536 })],
  ];
  for (const [poster, video, options] of cases) {
    assert.deepEqual(await importVideo(lib, album.id, request(poster, video), 'bad.mp4', options), { skipped: 'unsupported' });
    await assertEmpty(lib, album, originals, cache);
  }
});

test('interrupted video input closes partial files and permits the next upload', async (t) => {
  const { lib, album, originals, cache } = await workspace(t);
  const poster = await posterBytes();
  const req = Readable.from((async function* () {
    yield poster;
    yield bmff().subarray(0, 20);
    throw new DOMException('Owned cancellation', 'AbortError');
  })());
  await assert.rejects(importVideo(lib, album.id, req, 'interrupted.mp4', videoOptions(poster)), { name: 'AbortError' });
  await assertEmpty(lib, album, originals, cache);
  assert.ok((await importVideo(lib, album.id, request(poster, bmff()), 'next.mp4', videoOptions(poster))).photo);
});

test('video failures compensate renamed files and caches without deleting an existing item or poisoning the queue', async (t) => {
  for (const failure of ['read', 'write', 'poster-rename', 'cache', 'json']) await t.test(failure, async (t) => {
    const { lib, album, originals, cache } = await workspace(t);
    const poster = await posterBytes();
    const video = bmff();
    const first = (await importVideo(lib, album.id, request(poster, video), 'first.mp4', videoOptions(poster))).photo;
    const before = await readFile(join(lib.albumDir(album.id), 'album.json'));
    const oldFiles = (await readdir(originals)).sort();
    const oldCaches = (await readdir(cache)).sort();
    const next = Buffer.from(video);
    next[next.length - 1] ^= 1;
    let restore;
    if (failure === 'read') restore = failFs(t, 'readFile', (file) => String(file).startsWith(join(originals, '.tmp-')));
    if (failure === 'poster-rename') restore = failFs(t, 'rename', (_source, target) => target.endsWith('-poster.jpg'));
    if (failure === 'write') {
      const open = fs.open;
      const handles = [];
      const spy = t.mock.method(fs, 'open', async (...args) => {
        const handle = await open(...args);
        if (args[1] === 'wx') {
          handles.push(handle);
          handle.writeFile = async () => { throw Object.assign(new Error('Owned write failure'), { code: 'EIO' }); };
        }
        return handle;
      });
      syncBuiltinESMExports();
      restore = () => { spy.mock.restore(); syncBuiltinESMExports(); assert.ok(handles.every((handle) => handle.fd === -1)); };
      t.after(() => { spy.mock.restore(); syncBuiltinESMExports(); });
    }
    if (failure === 'cache') {
      const spy = t.mock.method(sharp.prototype, 'toFile', async () => { throw Object.assign(new Error('Owned cache failure'), { code: 'EIO' }); });
      restore = () => spy.mock.restore();
    }
    if (failure === 'json') {
      const spy = t.mock.method(lib, 'save', async () => { throw Object.assign(new Error('Owned save failure'), { code: 'EIO' }); });
      restore = () => spy.mock.restore();
    }
    try { await assert.rejects(importVideo(lib, album.id, request(poster, next), 'next.mp4', videoOptions(poster)), { code: 'EIO' }); }
    finally { restore(); }
    assert.deepEqual((await readdir(originals)).sort(), oldFiles);
    assert.deepEqual((await readdir(cache)).sort(), oldCaches);
    assert.deepEqual(await readFile(join(originals, first.file)), video);
    assert.deepEqual(await readFile(join(lib.albumDir(album.id), 'album.json')), before);
    assert.ok((await importVideo(lib, album.id, request(poster, next), 'retry.mp4', videoOptions(poster))).photo);
  });
});

test('orphan identities are never overwritten and video caches rebuild from the JPEG only', async (t) => {
  const { lib, album, originals, cache } = await workspace(t);
  await writeFile(join(originals, 'p001.mov'), 'owned orphan');
  await writeFile(join(cache, 'p002_600.webp'), 'owned orphan cache');
  const poster = await posterBytes();
  const { photo } = await importVideo(lib, album.id, request(poster, bmff()), 'clip.mp4', videoOptions(poster));
  assert.equal(photo.id, 'p003');
  assert.equal(await readFile(join(originals, 'p001.mov'), 'utf8'), 'owned orphan');
  for (const size of [600, 1600]) await rm(join(cache, `${photo.id}_${size}.webp`));
  assert.equal((await sharp(await ensureCache(lib, album.id, photo, 600)).metadata()).format, 'webp');
  for (const size of [600, 1600]) await rm(join(cache, `${photo.id}_${size}.webp`));
  await rm(join(originals, photo.poster));
  await assert.rejects(ensureCache(lib, album.id, photo, 600));
  assert.deepEqual(await readFile(join(originals, photo.file)), bmff());
});

test('video queued behind album deletion is rejected and leaves no new files', async (t) => {
  const { lib, album } = await workspace(t);
  const poster = await posterBytes();
  const queue = lib.queue;
  lib.queue = async (id, task) => {
    lib.queue = queue;
    await lib.remove(id);
    return queue(id, task);
  };
  await assert.rejects(importVideo(lib, album.id, request(poster, bmff()), 'gone.mp4', videoOptions(poster)), { status: 404 });
  await assert.rejects(stat(lib.albumDir(album.id)), { code: 'ENOENT' });
});

test('photo and video imports share collision-safe numbering without overwriting orphan files', async (t) => {
  const { lib, album, originals, cache } = await workspace(t);
  await writeFile(join(originals, 'p001.mov'), 'owned orphan video');
  await writeFile(join(cache, 'p002_600.webp'), 'owned orphan cache');
  const bytes = await photoBytes({ exif: null });
  const { photo } = await importPhoto(lib, album.id, Readable.from([bytes]), 'new.jpg');
  assert.equal(photo.id, 'p003');
  const poster = await posterBytes();
  const video = (await importVideo(lib, album.id, request(poster, bmff()), 'new.mp4', videoOptions(poster))).photo;
  assert.equal(video.id, 'p004');
  assert.equal(lib.get(album.id).nextSeq, 5);
  assert.equal(await readFile(join(originals, 'p001.mov'), 'utf8'), 'owned orphan video');
  assert.equal(await readFile(join(cache, 'p002_600.webp'), 'utf8'), 'owned orphan cache');
  assert.deepEqual(await readFile(join(originals, photo.file)), bytes);
});
