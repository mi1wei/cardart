import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './router.js';

const id = '0f3b6c1e-1d2a-4c55-9a7e-0123456789ab';

test('an empty address, the home address and unknown addresses show the home page', () => {
  for (const hash of ['', '#', '#/', '#/home', '#/albums/', '#/a/not-an-album', `#/a/${id}/4d`]) {
    assert.deepEqual(parse(hash), { page: 'home', album: null, three: false, photo: null }, hash);
  }
});

test('known addresses open their own pages', () => {
  assert.deepEqual(parse('#/albums'), { page: 'albums', album: null, three: false, photo: null });
  assert.deepEqual(parse('#/trash'), { page: 'trash', album: null, three: false, photo: null });
  assert.deepEqual(parse('#/license'), { page: 'license', album: null, three: false, photo: null });
  assert.deepEqual(parse(`#/a/${id}`), { page: 'album', album: id, three: false, photo: null });
  assert.deepEqual(parse(`#/a/${id}/p/p001`), { page: 'album', album: id, three: false, photo: 'p001' });
  assert.deepEqual(parse(`#/a/${id}/3d/p/p012`), { page: 'album', album: id, three: true, photo: 'p012' });
});
