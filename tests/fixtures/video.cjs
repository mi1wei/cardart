const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');

function atom(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}
function bmff({ brand = 'isom', handler = 'vide', compatible = ['isom'], lateMoov = false } = {}) {
  const identity = Buffer.alloc(8);
  identity.write(brand, 0, 'latin1');
  const ftyp = atom('ftyp', Buffer.concat([identity, ...compatible.map((value) => Buffer.from(value, 'latin1'))]));
  const hdlr = Buffer.alloc(12);
  hdlr.write(handler, 8, 'latin1');
  const moov = atom('moov', atom('trak', atom('mdia', atom('hdlr', hdlr))));
  const mdat = atom('mdat', Buffer.from([1, 2, 3, 4]));
  return Buffer.concat(lateMoov ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}
async function posterBytes({ width = 640, height = 360, format = 'jpeg', background = '#1d5f80' } = {}) {
  const { default: sharp } = await import('sharp');
  return sharp({ create: { width, height, channels: 3, background } }).toFormat(format).toBuffer();
}
async function nativeVideo(name = 'h264-aac.mp4') {
  return readFile(join(__dirname, 'videos', name));
}
async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-video-'));
  const { openLibrary } = await import('../../server/library.js');
  const lib = await openLibrary(dir);
  t.after(async () => { await lib.close(); await rm(dir, { recursive: true, force: true }); });
  const album = await lib.create('Owned mixed-media fixture');
  return { dir, lib, album, originals: join(lib.albumDir(album.id), 'originals'), cache: join(lib.albumDir(album.id), 'cache') };
}
function request(poster, video, { splitAt = poster.length, headers = {} } = {}) {
  const body = Buffer.concat([poster, video]);
  return Object.assign(Readable.from([body.subarray(0, splitAt), body.subarray(splitAt)]), { headers });
}
function videoOptions(poster, overrides = {}) {
  return { posterBytes: poster.length, w: 3840, h: 2160, duration: 12.4, ...overrides };
}
module.exports = { atom, bmff, posterBytes, nativeVideo, workspace, request, videoOptions };
