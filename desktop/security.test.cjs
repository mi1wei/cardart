const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isAppURL, isAllowedPermission, parseReady, isOriginalURL } = require('./security.cjs');

test('only the exact local app origin is navigable', () => {
  const origin = 'http://localhost:5197';
  assert.equal(isAppURL(`${origin}/#/albums`, origin), true);
  for (const url of ['http://localhost:5198/', 'https://localhost:5197/', 'http://localhost.evil:5197/', 'file:///tmp/photo.html', 'javascript:alert(1)', 'http://user@localhost:5197/']) {
    assert.equal(isAppURL(url, origin), false, url);
  }
});

test('permission policy allows only fullscreen and sanitized clipboard writes for this app', () => {
  const origin = 'http://localhost:5197';
  assert.equal(isAllowedPermission('fullscreen', `${origin}/`, origin), true);
  assert.equal(isAllowedPermission('clipboard-sanitized-write', origin, origin), true);
  for (const permission of ['clipboard-read', 'media', 'geolocation', 'notifications', 'unknown']) {
    assert.equal(isAllowedPermission(permission, origin, origin), false);
  }
  assert.equal(isAllowedPermission('fullscreen', 'https://example.com', origin), false);
});

test('backend ready messages cannot select remote or mismatched origins', () => {
  assert.equal(parseReady({ type: 'ready', origin: 'http://localhost:5197', port: 5197 }), 'http://localhost:5197');
  for (const message of [
    { type: 'ready', origin: 'https://example.com', port: 443 },
    { type: 'ready', origin: 'http://localhost:5197', port: 5198 },
    { type: 'unknown', origin: 'http://localhost:5197', port: 5197 },
    { type: 'ready', origin: 'http://localhost:5197/?key=x', port: 5197 },
  ]) assert.throws(() => parseReady(message));
});

test('only an exact original-photo path may open a controlled preview window', () => {
  const origin = 'http://localhost:5197';
  const path = '/media/00000000-0000-4000-8000-000000000001/p001/original';
  assert.equal(isOriginalURL(origin + path, origin), true);
  assert.equal(isOriginalURL('https://example.com' + path, origin), false);
  assert.equal(isOriginalURL(origin + '/api/phone', origin), false);
  assert.equal(isOriginalURL(origin + path + '?key=unexpected', origin), false);
});
