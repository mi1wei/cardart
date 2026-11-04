import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrintModel } from './print-layout.js';

const album = { id: 'a', title: 'Summer', photos: [], dateRange: { from: '2026-07-12T19:02:11', to: '2026-07-15T08:00:00' } };
const photo = (local) => ({ id: local ?? 'none', w: 3, h: 2, metadata: { takenAt: local ? { local } : null } });

test('the PDF cover writes its date range like the rest of the app, not as ISO timestamps', () => {
  assert.equal(buildPrintModel(album, {}, 'en').dateRange, 'Jul 12 – 15, 2026');
  assert.equal(buildPrintModel(album, {}, 'zh').dateRange, '2026年7月12日–15日');
});

test('without a stored range the cover uses the capture days, and nothing when there are none', () => {
  assert.equal(buildPrintModel({ ...album, dateRange: null, photos: [photo('2026-07-02T09:00:00'), photo(null)] }, {}, 'en').dateRange, 'Jul 2, 2026');
  assert.equal(buildPrintModel({ ...album, dateRange: null, photos: [photo(null)] }, {}, 'zh').dateRange, '');
});
