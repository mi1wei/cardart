import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { openLibrary } from './library.js';
import { importPhoto } from './importer.js';
import { photoBytes } from '../tests/fixtures/photo-metadata.cjs';

async function fixture(t) {
  const dir = join(process.cwd(), '.test-collection', randomUUID());
  await mkdir(dir, { recursive: true });
  let lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, get lib() { return lib; }, async reopen() { await lib.close(); lib = await openLibrary(dir); return lib; } };
}
async function seed(lib, album, id, options = {}) {
  const photo = { id, file: `${id}.jpg`, name: 'same.jpg', w: 12, h: 8, sha256: id,
    metadata: { takenAt: null }, note: '保留备注', ...options };
  await writeFile(join(lib.albumDir(album.id), 'originals', photo.file), `original-${photo.sha256}`);
  if (photo.poster) await writeFile(join(lib.albumDir(album.id), 'originals', photo.poster), 'poster');
  for (const size of [600, 1600]) await writeFile(join(lib.albumDir(album.id), 'cache', `${id}_${size}.webp`), `cache-${size}`);
  await lib.save({ ...lib.get(album.id), nextSeq: Number(id.slice(1)) + 1, photos: [...lib.get(album.id).photos, photo] });
  return photo;
}

test('capture and import sorting return stable snapshots without rewriting manual order', async (t) => {
  const { lib } = await fixture(t);
  const album = await lib.create('Sort');
  await seed(lib, album, 'p001');
  await seed(lib, album, 'p002', { addedAt: '2026-03-01T00:00:00.000Z', metadata: { takenAt: { local: '2020-05-01T12:00:00' } } });
  await seed(lib, album, 'p003', { addedAt: '2026-01-01T00:00:00.000Z', metadata: { takenAt: { local: '2019-01-01T12:00:00' } } });
  await seed(lib, album, 'p004', { addedAt: '2026-02-01T00:00:00.000Z' });
  await lib.update(album.id, { sort: 'taken' });
  assert.deepEqual(lib.snapshot(album.id).photos.map((p) => p.id), ['p003', 'p002', 'p001', 'p004']);
  assert.deepEqual(lib.get(album.id).photos.map((p) => p.id), ['p001', 'p002', 'p003', 'p004']);
  assert.deepEqual(lib.list()[0].dateRange, { from: '2019-01-01T12:00:00', to: '2020-05-01T12:00:00' });
  await lib.update(album.id, { sort: 'added' });
  assert.deepEqual(lib.snapshot(album.id).photos.map((p) => p.id), ['p001', 'p003', 'p004', 'p002']);
  await assert.rejects(lib.update(album.id, { sort: 'random' }), { status: 400 });
  const stored = JSON.parse(await readFile(join(lib.albumDir(album.id), 'album.json'), 'utf8'));
  assert.deepEqual(stored.photos.map((p) => p.id), ['p001', 'p002', 'p003', 'p004']);
});

test('legacy albums default to manual and createdAt, then update timestamps on content changes', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Legacy timestamps');
  await seed(f.lib, album, 'p001');
  const stored = { ...f.lib.get(album.id), createdAt: '2000-01-01T00:00:00.000Z' };
  delete stored.updatedAt;
  delete stored.sort;
  await f.lib.close();
  await writeFile(join(f.lib.albumDir(album.id), 'album.json'), JSON.stringify(stored));
  await f.reopen();
  assert.equal(f.lib.get(album.id).sort, 'manual');
  assert.equal(f.lib.get(album.id).updatedAt, '2000-01-01T00:00:00.000Z');
  assert.equal(f.lib.list()[0].updatedAt, '2000-01-01T00:00:00.000Z');
  const updated = await f.lib.updatePhotoNote(album.id, 'p001', { note: 'Changed', previousNote: '保留备注' });
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(stored.createdAt));
  assert.equal(updated.createdAt, stored.createdAt);
});

test('imports timestamp records and opening a legacy library drains sequential metadata backfill on close', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Legacy');
  const { photo } = await importPhoto(f.lib, album.id, Readable.from([await photoBytes()]), 'photo.jpg');
  assert.ok(Number.isFinite(Date.parse(photo.addedAt)));
  const { metadata, ...legacy } = photo;
  await f.lib.save({ ...f.lib.get(album.id), photos: [legacy], updatedAt: undefined, sort: undefined });
  await f.reopen();
  await f.lib.close();
  const stored = JSON.parse(await readFile(join(f.lib.albumDir(album.id), 'album.json'), 'utf8'));
  assert.equal(stored.photos[0].metadata.takenAt.local, '2026-08-15T09:30:00');
  assert.equal(stored.photos[0].addedAt, photo.addedAt);
  assert.ok(Number.isFinite(Date.parse(stored.updatedAt)));
});

test('background metadata backfill yields between photos to already queued user writes', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Legacy queue');
  const { photo } = await importPhoto(f.lib, album.id, Readable.from([await photoBytes()]), 'one.jpg');
  const { metadata, ...legacy } = photo;
  await copyFile(join(f.lib.albumDir(album.id), 'originals', photo.file), join(f.lib.albumDir(album.id), 'originals', 'p002.jpg'));
  await f.lib.save({ ...f.lib.get(album.id), nextSeq: 3, photos: [legacy, { ...legacy, id: 'p002', file: 'p002.jpg' }] });
  await f.reopen();
  const completed = await f.lib.queue(album.id, async () => {
    const current = f.lib.get(album.id);
    await f.lib.save({ ...current, title: 'User edit did not starve' });
    return current.photos.filter((item) => item.metadata != null).length;
  });
  assert.equal(completed, 1);
  await f.lib.close();
  const stored = JSON.parse(await readFile(join(f.lib.albumDir(album.id), 'album.json'), 'utf8'));
  assert.equal(stored.title, 'User edit did not starve');
  assert.ok(stored.photos[0].metadata);
});

test('trash preserves all records and video files, restores append order and allocates around orphan caches', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Travel');
  const video = await seed(f.lib, album, 'p001', { kind: 'video', file: 'p001.mp4', poster: 'p001-poster.jpg', duration: 12 });
  await seed(f.lib, album, 'p002');
  const deleted = await f.lib.deletePhotos(album.id, [video.id]);
  assert.equal(deleted.id, album.id);
  assert.ok(deleted.trashId);
  assert.deepEqual(f.lib.listTrash()[0].photos, [video]);
  assert.equal(await readFile(join(f.lib.trashDir(deleted.trashId), 'originals', video.poster), 'utf8'), 'poster');
  await writeFile(join(f.lib.albumDir(album.id), 'cache', 'p003_600.webp'), 'orphan');
  await writeFile(join(f.lib.albumDir(album.id), 'cache', 'p001_600.webp'), 'collision');
  await f.reopen();
  assert.deepEqual(await f.lib.restoreTrash([deleted.trashId]), { restored: [deleted.trashId] });
  const restored = f.lib.get(album.id).photos;
  assert.deepEqual(restored.map((p) => p.id), ['p002', 'p004']);
  assert.equal(restored[1].poster, 'p004-poster.jpg');
  assert.equal(restored[1].note, video.note);
  assert.equal(await readFile(join(f.lib.albumDir(album.id), 'originals', restored[1].poster), 'utf8'), 'poster');
  assert.deepEqual(f.lib.listTrash(), []);
});

test('restoring photos first restores their missing trashed album; expiry purges only old entries', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Family');
  await seed(f.lib, album, 'p001');
  const photos = await f.lib.deletePhotos(album.id, ['p001']);
  const trashId = await f.lib.remove(album.id);
  assert.equal(f.lib.list().length, 0);
  assert.equal(f.lib.listTrash().find((e) => e.id === trashId).album.title, 'Family');
  await f.lib.restoreTrash([photos.trashId]);
  assert.equal(f.lib.get(album.id).photos.length, 1);
  assert.equal(f.lib.listTrash().length, 0);
  const old = await f.lib.remove(album.id);
  const entryFile = join(f.lib.trashDir(old), 'entry.json');
  const entry = JSON.parse(await readFile(entryFile, 'utf8'));
  await writeFile(entryFile, JSON.stringify({ ...entry, deletedAt: '2000-01-01T00:00:00.000Z' }));
  await f.reopen();
  assert.deepEqual(f.lib.listTrash(), []);
  await assert.rejects(readFile(entryFile), { code: 'ENOENT' });
});

test('failed trash commits roll files back and leave no visible entry', async (t) => {
  const { lib } = await fixture(t);
  const album = await lib.create('Failure');
  const photo = await seed(lib, album, 'p001');
  await mkdir(join(lib.albumDir(album.id), 'album.json.tmp'));
  await assert.rejects(lib.deletePhotos(album.id, [photo.id]));
  assert.equal(await readFile(join(lib.albumDir(album.id), 'originals', photo.file), 'utf8'), 'original-p001');
  assert.equal(lib.get(album.id).photos.length, 1);
  assert.equal(lib.listTrash().length, 0);
  await assert.rejects(lib.deletePhotos(album.id, ['p999']), { status: 404 });
});

test('copy and move preserve metadata, skip duplicates and never remove skipped source records', async (t) => {
  const { lib } = await fixture(t);
  const source = await lib.create('Source');
  const target = await lib.create('Target');
  const video = await seed(lib, source, 'p001', { kind: 'video', file: 'p001.mp4', poster: 'p001-poster.jpg', duration: 12 });
  await seed(lib, source, 'p002');
  await seed(lib, target, 'p001');
  const result = await lib.transfer(source.id, { ids: ['p001', 'p002'], targetId: target.id, mode: 'move' });
  assert.equal(result.copied, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.album.photos, [video]);
  assert.equal(result.target.photos[1].sha256, 'p002');
  const copied = await lib.transfer(source.id, { ids: ['p001'], targetId: (await lib.create('Other')).id, mode: 'copy' });
  assert.equal(copied.target.photos[0].poster, 'p001-poster.jpg');
  assert.equal(await readFile(join(lib.albumDir(copied.target.id), 'originals', copied.target.photos[0].poster), 'utf8'), 'poster');
  assert.equal(lib.get(source.id).photos.length, 1);
  await assert.rejects(lib.transfer(source.id, { ids: ['p001'], targetId: source.id, mode: 'move' }), { status: 400 });
});

test('a failed multi-album transfer rolls back destination files and both album snapshots', async (t) => {
  const { lib } = await fixture(t);
  const source = await lib.create('Source');
  const target = await lib.create('Target');
  await seed(lib, source, 'p001');
  await mkdir(join(lib.albumDir(source.id), 'album.json.tmp'));
  await assert.rejects(lib.transfer(source.id, { ids: ['p001'], targetId: target.id, mode: 'move' }));
  assert.equal(lib.get(source.id).photos.length, 1);
  assert.equal(lib.get(target.id).photos.length, 0);
  assert.deepEqual(await readdir(join(lib.albumDir(target.id), 'originals')), []);
});

test('restoring several photo entries recreates a purged album and resolves duplicate IDs between entries', async (t) => {
  const { lib } = await fixture(t);
  const album = await lib.create('Keep this title');
  await seed(lib, album, 'p001');
  const first = await lib.deletePhotos(album.id, ['p001']);
  await seed(lib, album, 'p001', { sha256: 'new-content' });
  const second = await lib.deletePhotos(album.id, ['p001']);
  const albumTrash = await lib.remove(album.id);
  await lib.purgeTrash({ ids: [albumTrash] });
  await lib.restoreTrash([first.trashId, second.trashId]);
  const restored = lib.get(album.id);
  assert.equal(restored.title, 'Keep this title');
  assert.deepEqual(restored.photos.map((p) => p.id), ['p001', 'p002']);
  assert.equal(await readFile(join(lib.albumDir(album.id), 'originals', 'p001.jpg'), 'utf8'), 'original-p001');
  assert.equal(await readFile(join(lib.albumDir(album.id), 'originals', 'p002.jpg'), 'utf8'), 'original-new-content');
});

test('failed restores preserve their trash files and original active snapshot', async (t) => {
  const { lib } = await fixture(t);
  const album = await lib.create('Restore failure');
  const photo = await seed(lib, album, 'p001');
  const { trashId } = await lib.deletePhotos(album.id, [photo.id]);
  await mkdir(join(lib.albumDir(album.id), 'album.json.tmp'));
  await assert.rejects(lib.restoreTrash([trashId]));
  assert.equal(lib.get(album.id).photos.length, 0);
  assert.equal(lib.listTrash().length, 1);
  assert.equal(await readFile(join(lib.trashDir(trashId), 'originals', photo.file), 'utf8'), 'original-p001');
  assert.deepEqual(await readdir(join(lib.albumDir(album.id), 'originals')), []);
});

test('invalid capture dates and invalid addedAt values sort as unknown without polluting date ranges', async (t) => {
  const { lib } = await fixture(t);
  const album = await lib.create('Unknown dates');
  await seed(lib, album, 'p001', { addedAt: 123, metadata: { takenAt: { local: '2026-02-30T00:00:00' } } });
  await seed(lib, album, 'p002', { addedAt: '2026-01-01T00:00:00.000Z', metadata: { takenAt: { local: '2026-03-01T00:00:00' } } });
  await lib.update(album.id, { sort: 'taken' });
  assert.deepEqual(lib.snapshot(album.id).photos.map((p) => p.id), ['p002', 'p001']);
  assert.deepEqual(lib.snapshot(album.id).dateRange, { from: '2026-03-01T00:00:00', to: '2026-03-01T00:00:00' });
  await lib.update(album.id, { sort: 'added' });
  assert.deepEqual(lib.snapshot(album.id).photos.map((p) => p.id), ['p001', 'p002']);
});

test('startup rolls back interrupted photo trash moves even after album.json was replaced', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Crash');
  const photo = await seed(f.lib, album, 'p001');
  const before = f.lib.get(album.id);
  await f.lib.close();
  const id = randomUUID(), tx = join(f.dir, '.transactions', randomUUID());
  const entry = { id, kind: 'photos', albumId: album.id, albumTitle: album.title, deletedAt: new Date().toISOString(), photos: [photo] };
  await mkdir(join(f.dir, '.trash', id, 'originals'), { recursive: true });
  await mkdir(tx);
  await writeFile(join(tx, 'journal.json'), JSON.stringify({
    version: 1, state: 'prepared', before: [before], after: [{ ...before, photos: [] }], entries: [entry],
    createdAlbums: [], cleanup: [], operations: [{ type: 'move', from: `albums/${album.id}/originals/p001.jpg`, to: `.trash/${id}/originals/p001.jpg` }],
  }));
  await rename(join(f.dir, 'albums', album.id, 'originals', 'p001.jpg'), join(f.dir, '.trash', id, 'originals', 'p001.jpg'));
  await writeFile(join(f.dir, 'albums', album.id, 'album.json'), JSON.stringify({ ...before, photos: [] }));
  await f.reopen();
  assert.equal(f.lib.get(album.id).photos.length, 1);
  assert.equal(await readFile(join(f.lib.albumDir(album.id), 'originals', 'p001.jpg'), 'utf8'), 'original-p001');
  assert.deepEqual(f.lib.listTrash(), []);
  assert.deepEqual(await readdir(join(f.dir, '.transactions')), []);
});

test('startup rolls back a half-committed move transfer without losing source or destination content', async (t) => {
  const f = await fixture(t);
  const source = await f.lib.create('Source'), target = await f.lib.create('Target');
  const photo = await seed(f.lib, source, 'p001');
  const beforeSource = f.lib.get(source.id), beforeTarget = f.lib.get(target.id);
  await f.lib.close();
  const tx = join(f.dir, '.transactions', randomUUID());
  await mkdir(tx);
  const operation = { type: 'copy', from: `albums/${source.id}/originals/p001.jpg`, to: `albums/${target.id}/originals/p001.jpg` };
  await writeFile(join(tx, 'journal.json'), JSON.stringify({
    version: 1, state: 'prepared', before: [beforeSource, beforeTarget], after: [], entries: [], createdAlbums: [],
    cleanup: [operation.from], operations: [operation],
  }));
  await copyFile(join(f.dir, operation.from), join(f.dir, operation.to));
  await writeFile(join(f.dir, 'albums', target.id, 'album.json'), JSON.stringify({ ...beforeTarget, photos: [photo] }));
  await f.reopen();
  assert.equal(f.lib.get(source.id).photos.length, 1);
  assert.equal(f.lib.get(target.id).photos.length, 0);
  assert.equal(await readFile(join(f.dir, operation.from), 'utf8'), 'original-p001');
  await assert.rejects(readFile(join(f.dir, operation.to)), { code: 'ENOENT' });
});

test('a failed rollback blocks later writes until startup recovers its journal', async (t) => {
  const f = await fixture(t);
  const album = await f.lib.create('Protected');
  await seed(f.lib, album, 'p001');
  const base = f.lib.albumDir(album.id);
  await mkdir(join(base, 'album.json.tmp'));
  await mkdir(join(base, 'album.json.rollback'));
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try { await assert.rejects(f.lib.deletePhotos(album.id, ['p001']), AggregateError); }
  finally { console.error = originalError; }
  assert.equal(errors.length, 1);
  await rm(join(base, 'album.json.tmp'), { recursive: true });
  await assert.rejects(f.lib.update(album.id, { title: 'Unsafe later write' }), { code: 'LIBRARY_RECOVERY_REQUIRED' });
  await f.lib.close();
  await rm(join(base, 'album.json.rollback'), { recursive: true });
  await f.reopen();
  assert.equal(f.lib.get(album.id).title, 'Protected');
  assert.equal(f.lib.get(album.id).photos.length, 1);
  assert.equal(await readFile(join(base, 'originals', 'p001.jpg'), 'utf8'), 'original-p001');
});

test('startup removes empty incomplete trash directories but preserves unjournaled media with an explicit error', async (t) => {
  const f = await fixture(t);
  await f.lib.close();
  const empty = randomUUID();
  await mkdir(join(f.dir, '.trash', empty));
  await f.reopen();
  assert.deepEqual(f.lib.listTrash(), []);
  await assert.rejects(readdir(join(f.dir, '.trash', empty)), { code: 'ENOENT' });
  await f.lib.close();
  const orphan = randomUUID();
  const original = join(f.dir, '.trash', orphan, 'owned.jpg');
  await mkdir(join(f.dir, '.trash', orphan));
  await writeFile(original, 'irreplaceable');
  await assert.rejects(f.reopen(), { code: 'TRASH_CORRUPT' });
  assert.equal(await readFile(original, 'utf8'), 'irreplaceable');
});
