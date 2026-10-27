import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

async function assertSharedMark(image, mark, size, inset = 0) {
  const expected = await sharp(Buffer.from(mark.replaceAll('currentColor', '#fff')))
    .resize(size - 2 * inset)
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: '#0000' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const actual = await sharp(image).ensureAlpha().raw().toBuffer();
  assert.equal(actual.length, expected.length);
  let mismatches = 0;
  for (let i = 0; i < expected.length; i += 4) {
    if (expected[i + 3] === 255 && actual[i] < 250) mismatches++;
    if (expected[i + 3] === 0 && actual[i + 3] > 0 && actual[i] > 64) mismatches++;
  }
  assert.equal(mismatches, 0, 'the exported silhouette must match the shared vector mark');
}

test('exports the shared photo-page mark to web and native icon formats', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'folio-icons-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./generate-icons.js', import.meta.url)),
    output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const mark = await readFile(new URL('../src/assets/folio-mark.svg', import.meta.url), 'utf8');
  const web = await readFile(join(output, 'favicon.svg'));

  await t.test('web and iOS retain the mark while the home-screen background stays opaque', async () => {
    const web32 = await sharp(web).resize(32).png().toBuffer();
    await assertSharedMark(web32, mark, 32);
    const touch = await readFile(join(output, 'apple-touch-icon.png'));
    const metadata = await sharp(touch).metadata();
    assert.deepEqual([metadata.width, metadata.height], [180, 180]);
    assert.equal((await sharp(touch).ensureAlpha().stats()).channels[3].min, 255);
    await assertSharedMark(touch, mark, 180);
    const app = await sharp(join(output, 'icons/folio-1024.png')).metadata();
    assert.deepEqual([app.width, app.height], [1024, 1024]);
  });

  await t.test('Windows and fallback favicon frames decode at every advertised size', async () => {
    const ico = await readFile(join(output, 'favicon.ico'));
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    const count = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = ico[entry] || 256;
      assert.equal(ico[entry + 1] || 256, size);
      assert.equal(ico.readUInt16LE(entry + 4), 1);
      assert.equal(ico.readUInt16LE(entry + 6), 32);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      assert.ok(offset >= 6 + count * 16 && offset + length <= ico.length);
      const frame = ico.subarray(offset, offset + length);
      const metadata = await sharp(frame).metadata();
      assert.deepEqual([metadata.width, metadata.height], [size, size]);
      assert.deepEqual(
        await sharp(frame).ensureAlpha().raw().toBuffer(),
        await sharp(web).resize(size).ensureAlpha().raw().toBuffer(),
      );
      sizes.push(size);
    }
    assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
  });

  await t.test('macOS representations include Retina sizes and leave transparent Dock margins', async () => {
    const icns = await readFile(join(output, 'icons/folio.icns'));
    assert.equal(icns.toString('ascii', 0, 4), 'icns');
    assert.equal(icns.readUInt32BE(4), icns.length);
    const expected = new Map([
      ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128],
      ['ic08', 256], ['ic09', 512], ['ic10', 1024],
      ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
    ]);
    let offset = 8;
    while (offset < icns.length) {
      const type = icns.toString('ascii', offset, offset + 4);
      const length = icns.readUInt32BE(offset + 4);
      assert.ok(length > 8 && offset + length <= icns.length);
      const size = expected.get(type);
      assert.ok(size, `unexpected ICNS representation ${type}`);
      const frame = icns.subarray(offset + 8, offset + length);
      const metadata = await sharp(frame).metadata();
      assert.deepEqual([metadata.width, metadata.height], [size, size]);
      const pixels = await sharp(frame).ensureAlpha().raw().toBuffer();
      assert.equal(pixels[3], 0);
      if (type === 'icp5' || type === 'ic08') await assertSharedMark(frame, mark, size, size / 16);
      expected.delete(type);
      offset += length;
    }
    assert.equal(offset, icns.length);
    assert.equal(expected.size, 0);
  });

  await t.test('published assets stay in sync with the shared vector source', async () => {
    for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icons/folio-1024.png', 'icons/folio.icns']) {
      assert.deepEqual(
        await readFile(new URL(`../public/${name}`, import.meta.url)),
        await readFile(join(output, name)),
        `${name} is stale; run npm run icons`,
      );
    }
  });
});
