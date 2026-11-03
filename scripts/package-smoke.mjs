import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import sharp from 'sharp';
import { openLibrary } from '../server/library.js';
import { importPhoto } from '../server/importer.js';
import { importVideo } from '../server/video-importer.js';

async function until(read, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const result = await read(); if (result) return result; }
    catch (error) { last = error; }
    await delay(100);
  }
  throw new Error(`Packaged application did not reach the expected state: ${last?.message || 'timed out'}`);
}

export async function smokePackage({ appDir, platform = process.platform, whileRunning } = {}) {
  if (!appDir || !['darwin', 'win32'].includes(platform) || platform !== process.platform) throw new Error('Package smoke requires an explicit app on its native platform');
  appDir = resolve(appDir);
  const executable = platform === 'darwin' ? join(appDir, 'Contents/MacOS/Folio') : join(appDir, 'Folio.exe');
  const resources = platform === 'darwin' ? join(appDir, 'Contents/Resources') : join(appDir, 'resources');
  const root = await mkdtemp(join(tmpdir(), 'folio-package-smoke-'));
  const profile = join(root, 'Isolated profile');
  const library = join(root, '\u76f8\u518c\u5e93 with spaces');
  let child;
  let exited;
  let servicePid;
  let output = '';
  let outcome;
  let failed;
  try {
    await mkdir(profile);
    const lib = await openLibrary(library);
    let album;
    let albumVideo;
    let videoPoster;
    const originals = new Map();
    const unchanged = new Map();
    try {
      album = await lib.create('Owned package-smoke photos');
      const inputs = [
        ['owned.png', await sharp({ create: { width: 12, height: 8, channels: 3, background: '#1d5f80' } }).png().toBuffer()],
        ['primary.heic', await readFile(new URL('../tests/fixtures/photos/multi.heic', import.meta.url))],
      ];
      for (const [name, bytes] of inputs) {
        const { photo } = await importPhoto(lib, album.id, Readable.from([bytes]), name);
        assert.ok(photo, `Cannot create owned smoke fixture: ${name}`);
        originals.set(photo.id, bytes);
      }
      const videoBytes = await readFile(new URL('../tests/fixtures/videos/h264-aac.mp4', import.meta.url));
      videoPoster = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#1d5f80' } }).jpeg().toBuffer();
      const imported = await importVideo(lib, album.id, Readable.from([videoPoster, videoBytes]), 'owned.mp4', {
        posterBytes: videoPoster.length, w: 320, h: 180, duration: 2, lastModified: 1577934245000,
      });
      assert.ok(imported.photo, 'Cannot create owned video smoke fixture');
      albumVideo = imported.photo;
      originals.set(albumVideo.id, videoBytes);
      await lib.updatePhotoNote(album.id, albumVideo.id, { note: 'Owned video note', previousNote: '' });
      album = lib.get(album.id);
      for (const file of [join(lib.albumDir(album.id), 'album.json'), join(lib.albumDir(album.id), 'originals', albumVideo.poster)]) {
        unchanged.set(file, await readFile(file));
      }
      for (const photo of album.photos) {
        for (const size of [600, 1600]) await rm(join(lib.albumDir(album.id), 'cache', `${photo.id}_${size}.webp`));
      }
    } finally { await lib.close(); }
    const reservation = createServer();
    let preferredPort;
    try {
      await new Promise((resolve, reject) => {
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', resolve);
      });
      preferredPort = reservation.address().port;
      await writeFile(join(profile, 'desktop.json'), JSON.stringify({ version: 1, libraryDir: library, preferredPort }), { mode: 0o600 });
    } finally { await new Promise((resolve) => reservation.close(resolve)); }
    const env = { ...process.env, ALBUM_LIBRARY: library };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const isolatedArgs = [`--user-data-dir=${profile}`, ...(platform === 'darwin' ? ['--use-mock-keychain'] : [])];
    child = spawn(executable, isolatedArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    child.once('error', (error) => { failed = error; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (bytes) => { output = (output + bytes.toString()).slice(-8192); });
    const runtime = await until(async () => {
      if (failed) throw failed;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Application exited before readiness: ${output}`);
      return JSON.parse(await readFile(join(profile, 'runtime.json'), 'utf8'));
    });
    servicePid = runtime.servicePid;
    assert.equal(runtime.pid, child.pid);
    const origin = new URL(runtime.origin).origin;
    assert.equal(new URL(origin).hostname, 'localhost');
    assert.equal(Number(new URL(origin).port), preferredPort, 'The isolated smoke port was taken before startup');
    const request = (path, options = {}) => fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(20000) });
    const html = await request('/');
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await (await request('/api/license')).json()).state, 'missing');
    assert.equal((await request('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"Must be denied"}' })).status, 403);
    for (const photo of album.photos) {
      const response = await request(`/media/${album.id}/${photo.id}/600`);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(bytes).metadata();
      assert.deepEqual([metadata.width, metadata.height], photo.kind === 'video' ? [320, 180] : photo.name.endsWith('.heic') ? [64, 48] : [12, 8]);
      assert.deepEqual(Buffer.from(await (await request(`/media/${album.id}/${photo.id}/original`)).arrayBuffer()), originals.get(photo.id));
    }
    const albumRange = await request(`/media/${album.id}/${albumVideo.id}/original`, { headers: { Range: 'bytes=0-31' } });
    assert.equal(albumRange.status, 206);
    assert.equal(albumRange.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await albumRange.arrayBuffer()), originals.get(albumVideo.id).subarray(0, 32));
    const details = await (await request(`/api/albums/${album.id}/photos/${albumVideo.id}/details`)).json();
    assert.equal(details.kind, 'video');
    assert.equal(details.metadata.bytes, originals.get(albumVideo.id).length);
    assert.equal(details.metadata.exifStatus, undefined);
    const deniedVideo = await request(`/api/albums/${album.id}/photos?kind=video`, {
      method: 'POST', headers: { 'X-Album-Upload': '1' }, body: Buffer.alloc(0),
    });
    assert.equal(deniedVideo.status, 403);
    await deniedVideo.arrayBuffer();
    const deniedNote = await request(`/api/albums/${album.id}/photos/${albumVideo.id}/note`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"note":"Denied","previousNote":"Owned video note"}',
    });
    assert.equal(deniedNote.status, 403);
    await deniedNote.arrayBuffer();
    await whileRunning?.({ pid: child.pid, servicePid, origin });
    await promisify(execFile)(executable, [`--user-data-dir=${profile}`, '--quit'], { cwd: root, env, timeout: 10000 });
    const stopped = await Promise.race([exited, delay(15000, undefined, { ref: false }).then(() => { throw new Error('Packaged application did not complete explicit quit'); })]);
    assert.equal(stopped.code, 0, `Abnormal packaged-app exit: ${JSON.stringify(stopped)}`);
    await until(async () => !(await request('/api/albums').then(() => true, () => false)), 5000);
    const reopened = await openLibrary(library);
    try {
      assert.equal(reopened.get(album.id).photos.length, 3);
      assert.equal(reopened.list().length, 1);
      assert.equal(reopened.get(album.id).photos.find((photo) => photo.id === albumVideo.id).note, 'Owned video note');
      for (const [file, bytes] of unchanged) assert.deepEqual(await readFile(file), bytes);
    } finally { await reopened.close(); }
    await assert.rejects(readFile(join(profile, 'runtime.json')), { code: 'ENOENT' });
    return { target: `${platform}-${runtime.arch}`, version: runtime.version, nativeCacheRebuild: true, readOnlyEnforced: true, videoRange: true, albumVideoReadOnly: true, libraryReleased: true };
  } catch (error) {
    outcome = error;
    const log = await readFile(join(profile, 'logs/desktop.log'), 'utf8').catch(() => '');
    if (log) output = (output + `\nIsolated desktop log:\n${log}`).slice(-12288);
    throw new Error(`${error.message}${output ? `\nOwned application output:\n${output}` : ''}`, { cause: error });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await delay(300);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await Promise.race([exited, delay(5000, undefined, { ref: false })]);
    }
    if (outcome && servicePid) {
      try { process.kill(servicePid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { app: { type: 'string' } } });
    console.log(JSON.stringify(await smokePackage({ appDir: values.app })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
