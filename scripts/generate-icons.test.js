import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const appSource = fileURLToPath(new URL('../src/assets/folio-app-icon.png', import.meta.url));

// Mean absolute RGB difference over visible pixels: tolerates resampling and sharpening,
// but fails if a frame shows a different picture, a shifted layout or the old mark.
async function assertShowsAppIcon(image, size, inset = 0) {
  const expected = await sharp(appSource)
    .resize(size - 2 * inset)
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: '#0000' })
    .ensureAlpha().raw().toBuffer();
  const actual = await sharp(image).ensureAlpha().raw().toBuffer();
  assert.equal(actual.length, expected.length);
  let total = 0;
  let count = 0;
  for (let i = 0; i < expected.length; i += 4) {
    if (expected[i + 3] < 255) continue;
    assert.ok(actual[i + 3] > 200, 'opaque artwork must stay opaque');
    total += Math.abs(actual[i] - expected[i]) + Math.abs(actual[i + 1] - expected[i + 1]) + Math.abs(actual[i + 2] - expected[i + 2]);
    count += 3;
  }
  assert.ok(count > 0);
  assert.ok(total / count < 12, `frame differs from the app icon artwork (mean ${(total / count).toFixed(1)})`);
}

async function alphaAt(image, x, y) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
}

test('the app icon source is a 1024px illustration on a transparent rounded tile', async () => {
  const metadata = await sharp(appSource).metadata();
  assert.deepEqual([metadata.width, metadata.height, metadata.hasAlpha], [1024, 1024, true]);
  for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]]) assert.equal(await alphaAt(appSource, x, y), 0);
  assert.equal(await alphaAt(appSource, 512, 512), 255);
});

test('exports the app illustration to web and native icons, keeping the vector mark for the menu bar', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'folio-icons-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./generate-icons.js', import.meta.url)),
    output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const mark = await readFile(new URL('../src/assets/folio-mark.svg', import.meta.url), 'utf8');

  await t.test('the illustration has no vector favicon; iOS gets an opaque full-bleed icon', async () => {
    await assert.rejects(access(join(output, 'favicon.svg')), { code: 'ENOENT' });
    const touch = await readFile(join(output, 'apple-touch-icon.png'));
    const metadata = await sharp(touch).metadata();
    assert.deepEqual([metadata.width, metadata.height], [180, 180]);
    assert.equal((await sharp(touch).stats()).isOpaque, true);
    await assertShowsAppIcon(touch, 180);
    const app = await readFile(join(output, 'icons/folio-1024.png'));
    assert.deepEqual(
      await sharp(app).ensureAlpha().raw().toBuffer(),
      await sharp(appSource).ensureAlpha().raw().toBuffer(),
    );
  });

  await t.test('Windows and browser favicon frames show the illustration at every advertised size', async () => {
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
      assert.ok(await alphaAt(frame, 0, 0) <= 8, 'rounded corners must stay transparent');
      await assertShowsAppIcon(frame, size);
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
      assert.equal(await alphaAt(frame, Math.floor(size / 32), size / 2), 0, 'side margin must stay transparent');
      if (type === 'icp5' || type === 'ic08') await assertShowsAppIcon(frame, size, size / 16);
      expected.delete(type);
      offset += length;
    }
    assert.equal(offset, icns.length);
    assert.equal(expected.size, 0);
  });

  await t.test('menu-bar templates preserve the page curl in black on transparent pixels at both densities', async () => {
    for (const [name, size, density] of [['trayTemplate.png', 16, 72], ['trayTemplate@2x.png', 32, 144]]) {
      const image = await readFile(join(output, 'icons', name));
      const metadata = await sharp(image).metadata();
      assert.deepEqual([metadata.width, metadata.height, metadata.density], [size, size, density]);
      const pixels = await sharp(image).ensureAlpha().raw().toBuffer();
      const expected = await sharp(Buffer.from(mark.replaceAll('currentColor', '#000'))).resize(size).ensureAlpha().raw().toBuffer();
      assert.equal(pixels.length, expected.length);
      let visible = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        assert.deepEqual([...pixels.subarray(i, i + 3)], [0, 0, 0]);
        assert.ok(Math.abs(pixels[i + 3] - expected[i + 3]) <= 1, 'template silhouette diverged');
        if (pixels[i + 3]) visible++;
      }
      assert.ok(visible > size);
      assert.equal(pixels[3], 0);
    }
  });

  await t.test('published assets stay in sync with the icon sources', async () => {
    await assert.rejects(access(new URL('../public/favicon.svg', import.meta.url)), { code: 'ENOENT' });
    const stale = [];
    for (const name of ['favicon.ico', 'apple-touch-icon.png', 'icons/folio-1024.png', 'icons/folio.icns', 'icons/trayTemplate.png', 'icons/trayTemplate@2x.png']) {
      const published = await readFile(new URL(`../public/${name}`, import.meta.url));
      if (!published.equals(await readFile(join(output, name)))) stale.push(name);
    }
    assert.deepEqual(stale, [], `stale icons: ${stale.join(', ')}; run npm run icons`);
  });
});
