import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutPages, layoutPortraitPage, photoAt } from './book/layout.js';

test('portrait reflow preserves the enlarged spread layout and photo proportions', () => {
  const landscape = layoutPages([.5], 1)[0];
  const portrait = layoutPortraitPage(landscape, 280);
  assert.ok(Math.abs(landscape.rects[0].w - 118.47) < .001);
  assert.ok(Math.abs(landscape.rects[0].h - 236.94) < .001);
  assert.ok(Math.abs(portrait.rects[0].w - 128.6) < .001);
  assert.ok(Math.abs(portrait.rects[0].h - 257.2) < .001);
  assert.equal(portrait.rects[0].w / portrait.rects[0].h, .5);
  assert.deepEqual(layoutPages([.5], 1)[0], landscape);
});

test('a photograph uses the added spread height and remains clickable below the old page edge', () => {
  const page = layoutPages([.5], 1)[0];
  assert.equal(page.rects[0].w / page.rects[0].h, .5);
  assert.equal(photoAt(page, 0, 113.1, 240), 0);
  assert.equal(photoAt(page, 0, 26, 240), -1);
});

test('portrait reflow retains the photos, their aspect ratios and their original page', () => {
  const page = { rects: [
    { i: 4, x: 0, y: 0, w: 60, h: 40 },
    { i: 9, x: 70, y: 0, w: 30, h: 60 },
  ] };
  const original = structuredClone(page);
  const fitted = layoutPortraitPage(page, 280);
  assert.deepEqual(fitted.rects.map((rect) => rect.i), [4, 9]);
  for (const [index, aspect] of [1.5, .5].entries()) {
    const rect = fitted.rects[index];
    assert.ok(Math.abs(rect.w / rect.h - aspect) < .0001);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.w <= 172.201);
    assert.ok(rect.y + rect.h <= 257.201);
  }
  const [first, second] = fitted.rects;
  const overlapWidth = Math.min(first.x + first.w, second.x + second.w) - Math.max(first.x, second.x);
  const overlapHeight = Math.min(first.y + first.h, second.y + second.h) - Math.max(first.y, second.y);
  assert.ok(overlapWidth <= 0 || overlapHeight <= 0);
  assert.deepEqual(page, original);
});

test('a tap below the old page height opens the photograph on a taller portrait page', () => {
  const page = layoutPortraitPage({ rects: [{ i: 7, x: 0, y: 0, w: 30, h: 60 }] }, 280);
  assert.equal(photoAt(page, 0, 113.1, 240), 7);
  assert.equal(photoAt(page, 0, 26, 240), -1);
});