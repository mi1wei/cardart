import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { startServer } from './app.js';
import { openLibrary } from './library.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-runtime-'));
  const dist = join(root, 'web');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>Folio fixture</title>');
  const runtimes = [];
  t.after(async () => {
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    dir: join(root, 'library'), dist,
    async start(options = {}) {
      const runtime = await startServer({ dir: join(root, 'library'), dist, port: 0, ...options });
      runtimes.push(runtime);
      return runtime;
    },
  };
}

test('desktop starts its own service on fallback and failed CLI listen releases the library', async (t) => {
  const f = await fixture(t);
  const occupied = http.createServer((req, res) => res.end('foreign'));
  await new Promise((resolve) => occupied.listen(0, '0.0.0.0', resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const port = occupied.address().port;
  await assert.rejects(startServer({ dir: f.dir, dist: f.dist, port }), { code: 'EADDRINUSE' });
  const runtime = await f.start({ port, fallbackToRandomPort: true });
  assert.notEqual(runtime.port, port);
  assert.deepEqual(await (await fetch(`${runtime.url}api/albums`)).json(), []);
  const phone = await (await fetch(`${runtime.url}api/phone`)).json();
  assert.equal(phone.port, runtime.port);
  const closing = runtime.close();
  assert.equal(runtime.close(), closing);
  await closing;
  const reopened = await openLibrary(f.dir);
  await reopened.close();
});

test('shutdown finishes an already accepted photo upload before releasing its library', async (t) => {
  const f = await fixture(t);
  const runtime = await f.start();
  const response = await fetch(`${runtime.url}api/albums`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Uploading' }),
  });
  const album = await response.json();
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#1d5f80' } }).png().toBuffer();
  const upload = http.request(`${runtime.url}api/albums/${album.id}/photos?name=test.png`, {
    method: 'POST', headers: { Expect: '100-continue', 'X-Album-Upload': '1', 'Content-Length': png.length },
  });
  t.after(() => upload.destroy());
  const uploaded = new Promise((resolve, reject) => {
    upload.on('error', reject);
    upload.on('response', (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
  upload.flushHeaders();
  await once(upload, 'continue');
  upload.write(png.subarray(0, 10));
  const closing = runtime.close();
  upload.end(png.subarray(10));
  assert.ok((await uploaded).photo);
  await closing;
  const reopened = await openLibrary(f.dir);
  try { assert.equal(reopened.get(album.id).photos.length, 1); }
  finally { await reopened.close(); }
});

test('language falls back to the Folio cookie when this origin has no saved preference', async () => {
  const keys = ['document', 'localStorage', 'navigator'];
  const original = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      cookie: 'other_lang=zh; folio_lang=en',
      documentElement: { style: { setProperty() {} } },
      querySelector: () => null,
    } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['zh-CN'] } });
    const { lang } = await import('../src/i18n.js?runtime-cookie-test');
    assert.equal(lang(), 'en');
  } finally {
    keys.forEach((key, index) => {
      if (original[index]) Object.defineProperty(globalThis, key, original[index]);
      else delete globalThis[key];
    });
  }
});
