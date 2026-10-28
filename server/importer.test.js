import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { decodeHeic } from './heic.js';
import { importPhoto, ensureCache } from './importer.js';
import { openLibrary } from './library.js';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';

const photos = fileURLToPath(new URL('../tests/fixtures/photos/', import.meta.url));
const palette = {
  red: [240, 0, 0], green: [0, 208, 0], blue: [0, 0, 240], yellow: [224, 192, 0],
};

function assertCorners({ width, height, pixels }, colors) {
  for (const [index, [x, y]] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].entries()) {
    const offset = (Math.floor(y * height) * width + Math.floor(x * width)) * 4;
    const expected = palette[colors[index]];
    const actual = Array.from(pixels.subarray(offset, offset + 3));
    assert.ok(actual.every((value, channel) => Math.abs(value - expected[channel]) < 48), `${colors[index]} corner was ${actual}`);
  }
}

for (const [name, dimensions, corners] of [
  ['upright', [64, 48], ['red', 'green', 'blue', 'yellow']],
  ['rotated', [48, 64], ['blue', 'red', 'yellow', 'green']],
  ['mirrored', [64, 48], ['green', 'red', 'yellow', 'blue']],
  ['multi', [64, 48], ['red', 'green', 'blue', 'yellow']],
]) {
  test(`HEIC ${name} returns the upright primary image`, async () => {
    const decoded = await decodeHeic(join(photos, `${name}.heic`));
    assert.deepEqual([decoded.width, decoded.height], dimensions);
    assertCorners(decoded, corners);
  });
}

test('HEIC rejects excessive dimensions before RGBA allocation', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-heic-limit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = await readFile(join(photos, 'upright.heic'));
  let count = 0;
  for (let offset = bytes.indexOf('ispe'); offset !== -1; offset = bytes.indexOf('ispe', offset + 4)) {
    bytes.writeUInt32BE(8000, offset + 8);
    bytes.writeUInt32BE(8000, offset + 12);
    count++;
  }
  assert.ok(count > 0);
  const file = join(dir, 'oversized.heic');
  await writeFile(file, bytes);
  await assert.rejects(decodeHeic(file), { code: 'HEIC_TOO_LARGE' });
});

test('cancelled and failed HEIC work does not poison later queued decodes', async () => {
  const controller = new AbortController();
  const pending = decodeHeic(join(photos, 'upright.heic'), { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(decodeHeic(join(photos, 'source.svg')), { code: 'HEIC_DECODE_FAILED' });
  const decoded = await decodeHeic(join(photos, 'upright.heic'));
  assertCorners(decoded, ['red', 'green', 'blue', 'yellow']);
});

test('import preserves HEIC bytes, detects its format rather than extension, deduplicates and rebuilds caches', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-import-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const album = await lib.create('HEIC');
  const bytes = await readFile(join(photos, 'rotated.heic'));
  const request = () => Object.assign(Readable.from([bytes]), { headers: { 'content-length': bytes.length } });
  const { photo } = await importPhoto(lib, album.id, request(), 'misnamed.jpg');
  assert.ok(photo);
  assert.deepEqual([photo.w, photo.h], [48, 64]);
  assert.equal(photo.file, 'p001.heic');
  const original = join(lib.albumDir(album.id), 'originals', photo.file);
  assert.deepEqual(await readFile(original), bytes);
  assert.equal(photo.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await importPhoto(lib, album.id, request(), 'again.heic'), { skipped: 'duplicate' });
  for (const size of [600, 1600]) await rm(join(lib.albumDir(album.id), 'cache', `${photo.id}_${size}.webp`));
  const cache = await ensureCache(lib, album.id, photo, 600);
  const metadata = await sharp(cache).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 48, 64]);
  assert.deepEqual(await readFile(original), bytes);
});

test('imported original properties survive restart, reordering, cover changes and cache reconstruction', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-import-metadata-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const album = await lib.create('Original properties');
  const bytes = await photoBytes();
  const request = () => Object.assign(Readable.from([bytes]), { headers: { 'content-length': bytes.length } });
  const { photo } = await importPhoto(lib, album.id, request(), 'misnamed.png', { lastModified: Date.parse('2020-01-02T03:04:05.000Z') });
  assert.ok(photo?.metadata);
  assert.equal(photo.file, 'p001.jpg');
  assert.deepEqual([photo.w, photo.h], [8, 12]);
  assert.equal(photo.metadata.takenAt.raw, '2026:08:15 09:30:00');
  assert.equal(photo.metadata.cameraModel, 'Synthetic Camera');
  assert.equal(photo.metadata.bytes, bytes.length);
  assert.equal(photo.metadata.fileModifiedAt, '2020-01-02T03:04:05.000Z');
  assert.equal(photo.metadata.fileTimeSource, 'source-file');
  const original = join(lib.albumDir(album.id), 'originals', photo.file);
  assert.deepEqual(await readFile(original), bytes);
  assert.equal(photo.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await importPhoto(lib, album.id, request(), 'duplicate.jpg'), { skipped: 'duplicate' });
  const otherBytes = await photoBytes({ format: 'png', exif: null });
  const other = (await importPhoto(lib, album.id, Readable.from([otherBytes]), 'other.png')).photo;
  await lib.update(album.id, { order: [other.id, photo.id], cover: other.id });
  await lib.deletePhotos(album.id, [other.id]);
  assert.deepEqual(lib.get(album.id).photos[0].metadata, photo.metadata);
  const saved = JSON.parse(await readFile(join(lib.albumDir(album.id), 'album.json'), 'utf8'));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.photos[0].metadata, photo.metadata);
  await lib.close();
  const reopened = await openLibrary(dir);
  try {
    const restored = reopened.get(album.id).photos[0];
    assert.deepEqual(restored.metadata, photo.metadata);
    for (const size of [600, 1600]) await rm(join(reopened.albumDir(album.id), 'cache', `${photo.id}_${size}.webp`));
    const cache = await ensureCache(reopened, album.id, restored, 1600);
    const info = await sharp(cache).metadata();
    assert.deepEqual([info.width, info.height], [8, 12]);
    assert.equal(info.exif, undefined);
    assert.deepEqual(await readFile(original), bytes);
    assert.deepEqual(restored.metadata, photo.metadata);
  } finally { await reopened.close(); }
});

test('unreadable EXIF and invalid source file time do not reject an otherwise valid image', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-import-bad-exif-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const album = await lib.create('Damaged metadata');
  const bytes = await photoBytes();
  const offset = bytes.indexOf(Buffer.from('Exif\0\0II'));
  assert.ok(offset > 0);
  bytes.writeUInt32LE(0xffffffff, offset + 10);
  const { photo } = await importPhoto(lib, album.id, Readable.from([bytes]), 'valid-image.jpg', { lastModified: 'tomorrow' });
  assert.ok(photo?.metadata);
  assert.equal(photo.metadata.exifStatus, 'unreadable');
  assert.equal(photo.metadata.takenAt, null);
  assert.equal(photo.metadata.fileTimeSource, 'library-copy');
  assert.deepEqual(await readFile(join(lib.albumDir(album.id), 'originals', photo.file)), bytes);
  assert.equal((await sharp(await ensureCache(lib, album.id, photo, 600)).metadata()).format, 'webp');
});
