import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateTime, formatInstant, formatRange } from './dates.js';

test('a day range is spelled out in Chinese and uses Intl in English (polish spec §4.3)', () => {
  const cases = [
    ['2026-07-12', '2026-07-12', '2026年7月12日', 'Jul 12, 2026'],
    ['2026-07-12T19:02:11', '2026-07-15T08:00:00', '2026年7月12日–15日', 'Jul 12 – 15, 2026'],
    ['2026-07-30', '2026-08-02', '2026年7月30日–8月2日', 'Jul 30 – Aug 2, 2026'],
    ['2025-12-30', '2026-01-02', '2025年12月30日–2026年1月2日', 'Dec 30, 2025 – Jan 2, 2026'],
  ];
  for (const [from, to, zh, en] of cases) {
    assert.equal(formatRange(from, to, { lang: 'zh' }), zh);
    assert.equal(formatRange(from, to, { lang: 'en' }), en);
  }
});

test('album cards write the range to the month', () => {
  const month = true;
  assert.equal(formatRange('2026-07-02T09:00:00', '2026-07-15T18:00:00', { lang: 'zh', month }), '2026年7月');
  assert.equal(formatRange('2026-07-02T09:00:00', '2026-07-15T18:00:00', { lang: 'en', month }), 'Jul 2026');
  assert.equal(formatRange('2026-07-03', '2026-09-20', { lang: 'zh', month }), '2026年7月–9月');
  assert.equal(formatRange('2026-07-03', '2026-09-20', { lang: 'en', month }), 'Jul – Sep 2026');
  assert.equal(formatRange('2025-11-03', '2026-01-20', { lang: 'zh', month }), '2025年11月–2026年1月');
  assert.equal(formatRange('2025-11-03', '2026-01-20', { lang: 'en', month }), 'Nov 2025 – Jan 2026');
});

test('one date, a reversed range and invalid dates', () => {
  assert.equal(formatRange('2026-07-12', undefined, { lang: 'en' }), 'Jul 12, 2026');
  assert.equal(formatRange('2026-07-15', '2026-07-12', { lang: 'zh' }), '2026年7月12日–15日');
  for (const [from, to] of [[null, null], [undefined, undefined], ['2026-02-30', '2026-03-01'], ['July', '2026-07-01'], ['2026-07-01', null]]) {
    assert.equal(formatRange(from, to, { lang: 'en' }), '');
    assert.equal(formatRange(from, to, { lang: 'zh' }), '');
  }
});

test('a capture time is written as recorded, never shifted', () => {
  assert.equal(formatDateTime('2026-07-12T19:02:11', { lang: 'zh' }), '2026年7月12日 19:02:11');
  assert.equal(formatDateTime('2026-07-12T19:02:11', { lang: 'en' }), 'Jul 12, 2026, 19:02:11');
  assert.equal(formatDateTime('2026-07-12', { lang: 'en' }), 'Jul 12, 2026');
  assert.equal(formatDateTime('2026-13-01T00:00:00', { lang: 'en' }), '');
});

test('a moment stored in UTC is written in local time with its zone', () => {
  assert.equal(formatInstant('2026-07-12T10:02:11.000Z', { lang: 'zh', timeZone: 'Asia/Tokyo' }), '2026年7月12日 19:02:11 GMT+9');
  assert.equal(formatInstant('2026-07-12T10:02:11.000Z', { lang: 'en', timeZone: 'Asia/Tokyo' }), 'Jul 12, 2026, 19:02:11 GMT+9');
  // Five in the morning UTC is still the previous evening in New York.
  assert.equal(formatInstant('2026-01-01T04:59:59Z', { lang: 'en', timeZone: 'America/New_York' }), 'Dec 31, 2025, 23:59:59 EST');
  assert.equal(formatInstant('2026-07-12T19:02:11Z', { lang: 'en', timeZone: 'UTC' }), 'Jul 12, 2026, 19:02:11 UTC');
  for (const value of ['soon', null, 42]) assert.equal(formatInstant(value, { lang: 'en', timeZone: 'UTC' }), '');
});
