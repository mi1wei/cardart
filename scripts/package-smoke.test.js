import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smokePackage } from './package-smoke.mjs';

test('a real production-fuse package serves rebuilt PNG/HEIC caches and preserves its isolated library', {
  skip: !process.env.FOLIO_PACKAGE_APP,
  timeout: 90000,
}, async () => {
  const result = await smokePackage({ appDir: process.env.FOLIO_PACKAGE_APP });
  assert.equal(result.nativeCacheRebuild, true);
  assert.equal(result.readOnlyEnforced, true);
  assert.equal(result.videoRange, true);
  assert.equal(result.libraryReleased, true);
});
