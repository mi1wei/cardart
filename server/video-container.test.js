import assert from 'node:assert/strict';
import fs, { readFile, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectVideo } from './video-container.js';
import { atom, bmff, nativeVideo, posterBytes, workspace } from '../tests/fixtures/video.cjs';

test('video container recognizes real MP4/MOV/M4V and preserves source bytes', async (t) => {
  const { originals } = await workspace(t);
  for (const [name, format] of [['h264-aac.mp4', 'mp4'], ['h264-aac.mov', 'mov'], ['h264-aac.m4v', 'm4v']]) {
    const bytes = await nativeVideo(name);
    const file = join(originals, name);
    await writeFile(file, bytes);
    assert.deepEqual(await inspectVideo(file), { format, ext: `.${format}` });
    assert.deepEqual(await readFile(file), bytes);
  }
});

test('video container finds late moov and accepts supported extended and terminal box sizes', async (t) => {
  const { originals } = await workspace(t);
  const normal = bmff();
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('free', 4);
  extended.writeBigUInt64BE(16n, 8);
  const terminal = Buffer.from(normal);
  terminal.writeUInt32BE(0, terminal.length - 12);
  const minimal = Buffer.concat([atom('ftyp', Buffer.from('isom\0\0\0\0', 'latin1')), normal.subarray(20)]);
  for (const [index, bytes] of [bmff({ lateMoov: true }), Buffer.concat([normal, extended]), terminal, minimal].entries()) {
    const file = join(originals, `${index}.bin`);
    await writeFile(file, bytes);
    assert.deepEqual(await inspectVideo(file), { format: 'mp4', ext: '.mp4' });
  }
});

test('video container rejects image/audio brands and bounded malformed structures', async (t) => {
  const { originals } = await workspace(t);
  const large = Buffer.alloc(16);
  large.writeUInt32BE(1);
  large.write('moov', 4);
  large.writeBigUInt64BE(2n ** 63n, 8);
  const shortFtyp = atom('ftyp', Buffer.from('isom'));
  const wrongParent = bmff();
  wrongParent.writeUInt32BE(10, 20);
  const cases = [
    bmff({ brand: 'heic' }), bmff({ brand: 'avif' }), bmff({ compatible: ['isom', 'avif'] }),
    bmff({ brand: 'zzzz' }), bmff({ handler: 'soun' }), bmff().subarray(0, -1),
    Buffer.from('not a video'), shortFtyp, wrongParent,
    Buffer.concat([bmff().subarray(0, 20), large]),
    Buffer.concat([bmff(), ...Array.from({ length: 4097 }, () => atom('free'))]),
    Buffer.concat([atom('ftyp', Buffer.concat([Buffer.from('isom\0\0\0\0', 'latin1'), Buffer.alloc(4096)])), bmff().subarray(20)]),
    bmff().subarray(0, -12),
    Buffer.concat([bmff().subarray(0, -12), atom('mdat')]),
    Buffer.concat([atom('free'), bmff()]),
    Buffer.concat([bmff(), atom('ftyp', Buffer.from('isom\0\0\0\0', 'latin1'))]),
    await readFile(new URL('../tests/fixtures/photos/multi.heic', import.meta.url)),
    await posterBytes({ format: 'avif', width: 16, height: 12 }),
  ];
  for (const [index, bytes] of cases.entries()) {
    const file = join(originals, `${index}.bin`);
    await writeFile(file, bytes);
    await assert.rejects(inspectVideo(file), { code: 'VIDEO_UNSUPPORTED' }, `case ${index}`);
  }
});

test('video container preserves I/O errors and closes its file handle', async (t) => {
  const { originals } = await workspace(t);
  const file = join(originals, 'owned.mp4');
  await writeFile(file, bmff());
  const open = fs.open;
  let owned;
  const spy = t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    owned = handle;
    handle.read = async () => { throw Object.assign(new Error('Owned read failure'), { code: 'EIO' }); };
    return handle;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(inspectVideo(file), { code: 'EIO' });
    assert.equal(owned.fd, -1);
  } finally { spy.mock.restore(); syncBuiltinESMExports(); }
});
