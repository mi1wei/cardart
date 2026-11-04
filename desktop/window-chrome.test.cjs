const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BAR, background, themeSource, windowChrome } = require('./window-chrome.cjs');

test('the title bar merges into the 56 px top bar: inset traffic lights on macOS, an overlay on Windows', () => {
  assert.deepEqual(windowChrome('darwin', false), { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } });
  assert.deepEqual(windowChrome('win32', false), { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f9fb', symbolColor: '#4e5a66', height: BAR } });
  assert.deepEqual(windowChrome('win32', true), { titleBarStyle: 'hidden', titleBarOverlay: { color: '#121417', symbolColor: '#a7b0ba', height: BAR } });
  assert.deepEqual(windowChrome('linux', true), {});
  assert.equal(BAR, 56);
});

test('the window colour and the native theme follow the appearance', () => {
  assert.deepEqual([background(false), background(true)], ['#f7f9fb', '#121417']);
  assert.deepEqual(['light', 'dark', 'auto', undefined, 'neon'].map(themeSource), ['light', 'dark', 'system', 'system', 'system']);
});

test('on Windows the window buttons sit on dark colours while the always-dark photo viewer is open', () => {
  const { overlay } = require('./window-chrome.cjs');
  assert.deepEqual(overlay(false), { color: '#f7f9fb', symbolColor: '#4e5a66', height: BAR });
  assert.deepEqual(overlay(false, 'dark'), { color: '#121417', symbolColor: '#a7b0ba', height: BAR });
  assert.deepEqual(overlay(true, 'page'), { color: '#121417', symbolColor: '#a7b0ba', height: BAR });
});
