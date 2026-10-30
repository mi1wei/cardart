import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smokePackage } from './package-smoke.mjs';

test('a real production-fuse package serves rebuilt photo/video caches and preserves its isolated library', {
  skip: !process.env.FOLIO_PACKAGE_APP,
  timeout: 90000,
}, async () => {
  let liveChecks = 0;
  const result = await smokePackage({
    appDir: process.env.FOLIO_PACKAGE_APP,
    whileRunning: async ({ pid, servicePid, origin }) => {
      assert.ok(Number.isSafeInteger(pid) && pid > 0);
      assert.ok(Number.isSafeInteger(servicePid) && servicePid > 0 && servicePid !== pid);
      const albums = await fetch(`${origin}/api/albums`, { signal: AbortSignal.timeout(10000) });
      assert.equal(albums.status, 200);
      assert.equal((await albums.json()).length, 1);
      liveChecks++;
    },
  });
  assert.equal(liveChecks, 1, 'The owned live-process check must run before explicit quit');
  assert.equal(result.nativeCacheRebuild, true);
  assert.equal(result.readOnlyEnforced, true);
  assert.equal(result.videoRange, true);
  assert.equal(result.albumVideoReadOnly, true);
  assert.equal(result.libraryReleased, true);
});
