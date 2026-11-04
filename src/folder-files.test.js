import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumTitle, collectDrop, importable, pickedFolder } from './folder-files.js';

const file = (name, type = '') => new File(['x'], name, { type });
// <input webkitdirectory> gives each file its path from the chosen folder down.
const picked = (path, type) => Object.defineProperty(file(path.split('/').at(-1), type), 'webkitRelativePath', { value: path });
// Folder entries like Chromium's: readEntries() hands out at most `batch` children a call.
const folder = (name, children, { batch = 100, broken = false } = {}) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let at = 0;
    return {
      readEntries(ok, fail) {
        if (broken) return queueMicrotask(() => fail(new DOMException('Denied', 'NotReadableError')));
        const next = children.slice(at, at + batch);
        at += next.length;
        queueMicrotask(() => ok(next));
      },
    };
  },
});
const entry = (name, type = '', { broken = false } = {}) => ({
  isFile: true,
  isDirectory: false,
  name,
  file(ok, fail) { queueMicrotask(() => (broken ? fail(new DOMException('Moved', 'NotFoundError')) : ok(file(name, type)))); },
});
// A drop's DataTransfer: once the event is over the list is empty and its items answer null.
function drop(...nodes) {
  let live = true;
  const items = nodes.map((node) => ({
    kind: 'file',
    webkitGetAsEntry: () => (live ? node.entry ?? null : null),
    getAsFile: () => (live ? node.file ?? null : null),
  }));
  return { transfer: { types: ['Files'], items }, end() { live = false; items.length = 0; } };
}
const names = (files) => files.map((f) => f.name);

test('importable keeps photos and MP4, MOV and M4V videos, by type or by name, as the file input does', () => {
  for (const f of [file('a.jpg', 'image/jpeg'), file('b.gif', 'image/gif'), file('c.HEIC'), file('d.heif'), file('e.MOV'), file('f.mp4'), file('g.m4v'), file('h', 'video/quicktime')]) {
    assert.equal(importable(f), true, f.name);
  }
  for (const f of [file('notes.txt', 'text/plain'), file('clip.webm', 'video/webm'), file('doc.pdf', 'application/pdf'), file('blank')]) {
    assert.equal(importable(f), false, f.name);
  }
});

test('a picked folder keeps its name and leaves out hidden items below it, sorted by path', () => {
  const result = pickedFolder([
    picked('Trip/img10.jpg', 'image/jpeg'), picked('Trip/img2.jpg', 'image/jpeg'), picked('Trip/sub/b.jpg', 'image/jpeg'),
    picked('Trip/.DS_Store'), picked('Trip/.git/x.jpg', 'image/jpeg'), picked('Trip/notes.txt', 'text/plain'),
  ]);
  assert.equal(result.name, 'Trip');
  assert.deepEqual(result.files.map((f) => f.webkitRelativePath), ['Trip/img2.jpg', 'Trip/img10.jpg', 'Trip/sub/b.jpg']);
  assert.equal(result.skipped, 1); // notes.txt; hidden items are not counted
  assert.equal(result.unreadable, 0);
  // The folder the user chose counts even when its own name starts with a dot.
  assert.equal(pickedFolder([picked('.photos/a.jpg', 'image/jpeg')]).files.length, 1);
  assert.equal(pickedFolder([]), null);
});

test('a dropped folder is read in every batch, not just the first 100 entries', async () => {
  const children = Array.from({ length: 230 }, (_, i) => entry(`p${String(i + 1).padStart(3, '0')}.jpg`, 'image/jpeg'));
  const { transfer } = drop({ entry: folder('Big', children) });
  const { folders } = await collectDrop(transfer);
  assert.equal(folders[0].files.length, 230);
  assert.equal(folders[0].files.at(-1).name, 'p230.jpg');
});

test('nested photos stay with their top-level folder; hidden items are skipped silently, other files counted', async () => {
  const { transfer } = drop(
    { entry: folder('Trip', [
      entry('b.jpg', 'image/jpeg'), entry('.DS_Store'), entry('notes.txt', 'text/plain'),
      folder('.git', [entry('x.jpg', 'image/jpeg')]),
      folder('more', [entry('a.jpg', 'image/jpeg'), entry('clip.mov')], { batch: 1 }),
    ], { batch: 2 }) },
    { file: file('loose.jpg', 'image/jpeg') },
    { file: file('readme.md', 'text/markdown') },
  );
  const { folders, loose } = await collectDrop(transfer);
  assert.equal(folders.length, 1);
  assert.equal(folders[0].name, 'Trip');
  assert.deepEqual(names(folders[0].files), ['b.jpg', 'a.jpg', 'clip.mov']); // b.jpg, more/a.jpg, more/clip.mov
  assert.equal(folders[0].skipped, 1);
  assert.equal(folders[0].unreadable, 0);
  assert.deepEqual(names(loose.files), ['loose.jpg']);
  assert.equal(loose.skipped, 1);
});

test('files and folders that cannot be read count as unreadable; the rest still come through', async () => {
  const { transfer } = drop({ entry: folder('Trip', [
    entry('a.jpg', 'image/jpeg'), entry('moved.jpg', 'image/jpeg', { broken: true }), folder('locked', [], { broken: true }),
  ]) });
  const { folders } = await collectDrop(transfer);
  assert.deepEqual(names(folders[0].files), ['a.jpg']);
  assert.equal(folders[0].unreadable, 2);
});

test('the items are taken while the drop event runs; the browser empties them right after', async () => {
  const { transfer, end } = drop({ entry: folder('Trip', [entry('a.jpg', 'image/jpeg')]) }, { file: file('b.jpg', 'image/jpeg') });
  const pending = collectDrop(transfer);
  end();
  const { folders, loose } = await pending;
  assert.deepEqual(names(folders[0].files), ['a.jpg']);
  assert.deepEqual(names(loose.files), ['b.jpg']);
});

test('without an item list the dropped files are used as they are', async () => {
  const { folders, loose } = await collectDrop({ types: ['Files'], files: [file('a.jpg', 'image/jpeg')] });
  assert.deepEqual(folders, []);
  assert.deepEqual(names(loose.files), ['a.jpg']);
});

test('album names are trimmed and cut to 50 characters, as the server counts them', () => {
  assert.equal(albumTitle('  Summer by the sea  ', 'New album'), 'Summer by the sea');
  assert.equal(albumTitle('海'.repeat(60), 'New album'), '海'.repeat(50));
  assert.equal(albumTitle('📷'.repeat(60), 'New album'), '📷'.repeat(50));
  assert.equal(albumTitle(`${'a'.repeat(49)} b`, 'New album'), 'a'.repeat(49));
  assert.equal(albumTitle('   ', 'New album'), 'New album');
});
