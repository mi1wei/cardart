import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openLibrary } from './library.js';

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-library-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('a second process cannot open the library or remove an in-flight temporary photo', async (t) => {
  const dir = await workspace(t);
  const child = fork(fileURLToPath(new URL('../tests/fixtures/hold-library.mjs', import.meta.url)), [dir], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const [message] = await once(child, 'message');
  const temp = join(dir, 'albums', message.id, 'originals', '.tmp-in-flight');
  await writeFile(temp, 'partial upload');
  await assert.rejects(openLibrary(dir), { code: 'LIBRARY_IN_USE' });
  assert.equal(await readFile(temp, 'utf8'), 'partial upload');
  child.send('close');
  await once(child, 'exit');
  const lib = await openLibrary(dir);
  try {
    assert.equal(lib.list().length, 1);
    await assert.rejects(readFile(temp), { code: 'ENOENT' });
  } finally { await lib.close(); }
});

test('close waits for already queued writes before releasing the library lock', async (t) => {
  const dir = await workspace(t);
  const lib = await openLibrary(dir);
  const album = await lib.create('Before');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const write = lib.queue(album.id, async () => {
    await gate;
    await lib.save({ ...lib.get(album.id), title: 'After' });
  });
  const closing = lib.close();
  await assert.rejects(openLibrary(dir), { code: 'LIBRARY_IN_USE' });
  release();
  await write;
  await closing;
  await lib.close();
  await assert.rejects(lib.save({ ...album, title: 'Stale write' }), { code: 'LIBRARY_CLOSED' });
  const reopened = await openLibrary(dir);
  try { assert.equal(reopened.get(album.id).title, 'After'); }
  finally { await reopened.close(); }
});

test('failed initialization does not leave a locked library', async (t) => {
  const dir = await workspace(t);
  await writeFile(join(dir, 'albums'), 'not a directory');
  await assert.rejects(openLibrary(dir));
  await rm(join(dir, 'albums'));
  const lib = await openLibrary(dir);
  try { assert.deepEqual(lib.list(), []); }
  finally { await lib.close(); }
});

test('corrupt library settings are preserved rather than silently rebuilt', async (t) => {
  const dir = await workspace(t);
  const file = join(dir, 'library.json');
  await writeFile(file, '{broken');
  let opened;
  t.after(() => opened?.close());
  await assert.rejects(async () => { opened = await openLibrary(dir); }, { code: 'LIBRARY_CORRUPT' });
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('closing the Vite development server releases its library', async (t) => {
  const dir = await workspace(t);
  const previous = process.env.ALBUM_LIBRARY;
  process.env.ALBUM_LIBRARY = dir;
  const { createServer } = await import('vite');
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  });
  try {
    await server.listen();
    await assert.rejects(openLibrary(dir), { code: 'LIBRARY_IN_USE' });
    await server.close();
    const reopened = await openLibrary(dir);
    await reopened.close();
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.ALBUM_LIBRARY;
    else process.env.ALBUM_LIBRARY = previous;
  }
});

async function photoLibrary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-photo-notes-'));
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const created = await lib.create('Notes');
  const photo = { id: 'p001', file: 'p001.jpg', name: 'Owned photo.jpg', w: 12, h: 8, sha256: 'a'.repeat(64), metadata: { schemaVersion: 1, cameraModel: 'Owned camera' } };
  const album = await lib.save({ ...created, nextSeq: 3, photos: [photo, { ...photo, id: 'p002', file: 'p002.jpg', note: 'Other photo' }] });
  await writeFile(join(lib.albumDir(album.id), 'originals', photo.file), 'owned original bytes');
  await writeFile(join(lib.albumDir(album.id), 'cache', 'p001_1600.webp'), 'owned cache bytes');
  return { dir, lib, album, photo };
}

test('one photo note is saved atomically and survives reopening without altering original properties', async (t) => {
  const { dir, lib, album, photo } = await photoLibrary(t);
  const note = '清晨的湖边 🌿\n保留这段描述。';
  const updated = await lib.updatePhotoNote(album.id, photo.id, { note: ` ${note}\r\n`, previousNote: '' });
  assert.equal(updated.photos[0].note, note);
  assert.deepEqual(updated.photos[0], { ...photo, note });
  assert.deepEqual(updated.photos[1], album.photos[1]);
  assert.equal(updated.nextSeq, 3);
  const disk = JSON.parse(await readFile(join(lib.albumDir(album.id), 'album.json'), 'utf8'));
  assert.equal(disk.version, 1);
  assert.equal(disk.photos[0].note, note);
  assert.equal(await readFile(join(lib.albumDir(album.id), 'originals', photo.file), 'utf8'), 'owned original bytes');
  assert.equal(await readFile(join(lib.albumDir(album.id), 'cache', 'p001_1600.webp'), 'utf8'), 'owned cache bytes');
  await lib.close();
  const reopened = await openLibrary(dir);
  try {
    assert.equal(reopened.get(album.id).photos[0].note, note);
    await reopened.update(album.id, { order: ['p002', 'p001'], cover: 'p002' });
    const cleared = await reopened.updatePhotoNote(album.id, 'p001', { note: ' \n ', previousNote: note });
    assert.equal(cleared.photos[1].note, '');
    assert.equal(cleared.photos[0].note, 'Other photo');
    assert.equal(cleared.cover, 'p002');
  } finally { await reopened.close(); }
});

test('note validation rejects invalid types and excessive text without changing the saved album', async (t) => {
  const { lib, album } = await photoLibrary(t);
  const file = join(lib.albumDir(album.id), 'album.json');
  const before = await readFile(file);
  for (const patch of [null, [], {}, { note: null, previousNote: '' }, { note: 123, previousNote: '' },
    { note: 'a'.repeat(2001), previousNote: '' }, { note: 'value', previousNote: null }, { note: 'value', previousNote: [] }]) {
    await assert.rejects(lib.updatePhotoNote(album.id, 'p001', patch), { status: 400 });
    assert.deepEqual(await readFile(file), before);
  }
  await assert.rejects(lib.updatePhotoNote(album.id, 'p999', { note: '', previousNote: '' }), { status: 404 });
  await assert.rejects(lib.updatePhotoNote(album.id, '../p001', { note: '', previousNote: '' }), { status: 404 });
  const updated = await lib.updatePhotoNote(album.id, 'p001', { note: '🌿'.repeat(2000), previousNote: '' });
  assert.equal([...updated.photos[0].note].length, 2000);
});

test('concurrent note edits cannot overwrite a newer value and an identical retry is safe', async (t) => {
  const { lib, album } = await photoLibrary(t);
  const results = await Promise.allSettled([
    lib.updatePhotoNote(album.id, 'p001', { note: 'First edit', previousNote: '' }),
    lib.updatePhotoNote(album.id, 'p001', { note: 'Stale second edit', previousNote: '' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.status, 409);
  assert.equal(lib.get(album.id).photos[0].note, 'First edit');
  const retried = await lib.updatePhotoNote(album.id, 'p001', { note: 'First edit', previousNote: '' });
  assert.equal(retried.photos[0].note, 'First edit');
  assert.equal(retried.photos[1].note, 'Other photo');
});

test('a failed note commit preserves the saved snapshot and does not poison subsequent edits', async (t) => {
  const { lib, album } = await photoLibrary(t);
  const folder = lib.albumDir(album.id);
  const before = await readFile(join(folder, 'album.json'));
  await mkdir(join(folder, 'album.json.tmp'));
  await assert.rejects(lib.updatePhotoNote(album.id, 'p001', { note: 'Cannot commit', previousNote: '' }));
  assert.equal(lib.get(album.id).photos[0].note, undefined);
  assert.deepEqual(await readFile(join(folder, 'album.json')), before);
  await rm(join(folder, 'album.json.tmp'), { recursive: true });
  const updated = await lib.updatePhotoNote(album.id, 'p001', { note: 'Can commit', previousNote: '' });
  assert.equal(updated.photos[0].note, 'Can commit');
});
