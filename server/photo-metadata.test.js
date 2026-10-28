import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';

const read = async (...args) => (await import('./photo-metadata.js')).readPhotoMetadata(...args);
const photos = fileURLToPath(new URL('../tests/fixtures/photos/', import.meta.url));

async function fixture(t, bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-photo-metadata-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'original');
  await writeFile(file, bytes);
  return file;
}

for (const format of ['jpeg', 'png']) {
  test(`${format} properties come from real original EXIF, including zero GPS and raw capture time`, async (t) => {
    const bytes = await photoBytes({ format });
    const file = await fixture(t, bytes);
    const metadata = await read(file);
    assert.equal(metadata.exifStatus, 'ready');
    assert.equal(metadata.format, format);
    assert.equal(metadata.bytes, bytes.length);
    assert.deepEqual(metadata.takenAt, {
      raw: '2026:08:15 09:30:00', local: '2026-08-15T09:30:00',
      offset: '+09:00', subsecond: '125', source: 'DateTimeOriginal',
    });
    assert.equal(metadata.cameraMake, 'Folio Test');
    assert.equal(metadata.cameraModel, 'Synthetic Camera');
    assert.equal(metadata.lensModel, 'Folio Prime 35');
    assert.equal(metadata.orientation, 6);
    assert.equal(metadata.latitude, 0);
    assert.equal(metadata.longitude, 0);
    assert.equal(metadata.exposureTime, 0.005);
    assert.equal(metadata.fNumber, 2.8);
    assert.equal(metadata.iso, 200);
    assert.equal(metadata.focalLength, 35);
    assert.deepEqual(await readFile(file), bytes);
    assert.doesNotThrow(() => JSON.stringify(metadata));
  });
}

test('capture dates without offsets do not change with the host timezone', async (t) => {
  const file = await fixture(t, await photoBytes({ exif: { IFD2: { DateTimeOriginal: '2026:08:15 00:30:00' } } }));
  const script = `import { readPhotoMetadata } from ${JSON.stringify(new URL('./photo-metadata.js', import.meta.url).href)}; console.log(JSON.stringify((await readPhotoMetadata(process.argv[1])).takenAt));`;
  for (const TZ of ['UTC', 'America/Los_Angeles']) {
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, file], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.deepEqual(actual, { raw: '2026:08:15 00:30:00', local: '2026-08-15T00:30:00', offset: null, subsecond: null, source: 'DateTimeOriginal' });
  }
});

test('invalid capture dates fall back to CreateDate with its own offset and negative GPS stays negative', async (t) => {
  const file = await fixture(t, await photoBytes({ exif: {
    IFD2: { DateTimeOriginal: '2026:02:30 09:30:00', OffsetTimeOriginal: '+09:00', DateTimeDigitized: '2026:08:16 01:02:03', OffsetTimeDigitized: '-03:30', SubSecTimeDigitized: '45' },
    IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '35/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '58/1 15/1 0/1' },
  } }));
  const metadata = await read(file);
  assert.deepEqual(metadata.takenAt, { raw: '2026:08:16 01:02:03', local: '2026-08-16T01:02:03', offset: '-03:30', subsecond: '45', source: 'CreateDate' });
  assert.equal(metadata.latitude, -35.5);
  assert.equal(metadata.longitude, -58.25);
});

test('missing EXIF and unavailable originals remain usable without inventing capture data', async (t) => {
  const file = await fixture(t, await photoBytes({ format: 'png', exif: null }));
  const metadata = await read(file);
  assert.equal(metadata.exifStatus, 'none');
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.takenAt, null);
  assert.equal(metadata.cameraMake, null);
  assert.equal(metadata.latitude, null);
  const missing = await read(join(file, 'missing'));
  assert.equal(missing.exifStatus, 'unreadable');
  assert.equal(missing.takenAt, null);
  assert.ok(!JSON.stringify(missing).includes(file));
});

test('malformed EXIF, invalid coordinates and oversized camera text are bounded and nonfatal', async (t) => {
  const file = await fixture(t, await photoBytes({ exif: {
    IFD0: { Make: '<img src=x onerror=alert(1)>'.repeat(30), BodySerialNumber: 'not-for-details' },
    IFD2: { DateTimeOriginal: 'not a capture date' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '91/1 0/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '20/1 0/1 0/1' },
  } }));
  const metadata = await read(file);
  assert.equal(metadata.takenAt, null);
  assert.equal(metadata.latitude, null);
  assert.equal(metadata.longitude, null);
  assert.ok(metadata.cameraMake.startsWith('<img'));
  assert.ok(metadata.cameraMake.length <= 200);
  assert.ok(!JSON.stringify(metadata).includes('not-for-details'));
  const damaged = await readFile(file);
  const tiff = damaged.indexOf(Buffer.from('Exif\0\0II'));
  assert.ok(tiff > 0);
  damaged.writeUInt32LE(0xffffffff, tiff + 10);
  await writeFile(file, damaged);
  const unreadable = await read(file);
  assert.equal(unreadable.exifStatus, 'unreadable');
  assert.ok(unreadable.bytes > 0);
});

test('HEIC metadata follows the upright primary image, not an auxiliary image', async () => {
  for (const name of ['metadata.heic', 'metadata-multi.heic']) {
    const metadata = await read(join(photos, name));
    assert.equal(metadata.format, 'heif');
    assert.equal(metadata.exifStatus, 'ready');
    assert.equal(metadata.cameraMake, 'Folio Primary');
    assert.equal(metadata.cameraModel, 'Synthetic HEIC');
    assert.equal(metadata.takenAt.raw, '2026:08:15 09:30:00');
    assert.equal(metadata.takenAt.offset, '+09:00');
    assert.equal(metadata.latitude, 0);
    assert.equal(metadata.longitude, 0);
  }
});
