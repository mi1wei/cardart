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
