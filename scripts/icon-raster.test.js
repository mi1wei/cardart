import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resizeRgba, sharpenRgba } from './icon-raster.js';

function image(size, pixel) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(pixel(x, y), (y * size + x) * 4);
  return data;
}

test('a uniform opaque colour survives any downscale unchanged', () => {
  const out = resizeRgba(image(40, () => [12, 130, 201, 255]), 40, 7);
  assert.equal(out.length, 7 * 7 * 4);
  for (let i = 0; i < out.length; i += 4) assert.deepEqual([...out.subarray(i, i + 4)], [12, 130, 201, 255]);
});

test('transparent pixels never darken the colour of an antialiased edge', () => {
  // Opaque white on the left half, fully transparent black on the right half.
  const out = resizeRgba(image(32, (x) => (x < 16 ? [255, 255, 255, 255] : [0, 0, 0, 0])), 32, 9);
  let partial = 0;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    if (out[i + 3] < 255) partial++;
    assert.deepEqual([...out.subarray(i, i + 3)], [255, 255, 255]);
  }
  assert.ok(partial > 0, 'the edge must be antialiased');
});

test('sharpening adds edge contrast inside the artwork but leaves flat colour and transparency alone', () => {
  const size = 12;
  const source = image(size, (x, y) => (y < 2 ? [0, 0, 0, 0] : x < 6 ? [100, 100, 100, 255] : [200, 200, 200, 255]));
  const out = sharpenRgba(source, size, 0.5);
  const at = (x, y) => [...out.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  assert.ok(at(5, 8)[0] < 100 && at(6, 8)[0] > 200, 'edge contrast must increase');
  assert.deepEqual(at(1, 8), [100, 100, 100, 255]);
  assert.deepEqual(at(10, 8), [200, 200, 200, 255]);
  assert.deepEqual(at(4, 0), [0, 0, 0, 0]);
  assert.deepEqual(at(1, 2), [100, 100, 100, 255], 'pixels next to transparency are not sharpened');
});
