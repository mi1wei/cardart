import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
