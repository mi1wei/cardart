import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, parse } from './router.js';

const id = '0f3b6c1e-1d2a-4c55-9a7e-0123456789ab';

test('the old home page, an empty address and unknown addresses open the album wall', () => {
  for (const hash of ['', '#', '#/', '#/home', '#/albums/', '#/a/not-an-album', `#/a/${id}/4d`]) {
    assert.equal(canonical(hash), '#/albums', hash);
    assert.equal(parse(hash).page, 'albums', hash);
  }
});

test('known addresses are left as they are', () => {
  for (const hash of ['#/albums', '#/trash', '#/license', `#/a/${id}`, `#/a/${id}/3d`, `#/a/${id}/p/p001`, `#/a/${id}/3d/p/p012`]) {
    assert.equal(canonical(hash), hash);
  }
  assert.deepEqual(parse(`#/a/${id}/3d/p/p012`), { page: 'album', album: id, three: true, photo: 'p012' });
  assert.deepEqual(parse('#/trash'), { page: 'trash', album: null, three: false, photo: null });
});
