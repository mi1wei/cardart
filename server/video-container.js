import { open } from 'node:fs/promises';

const MP4 = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'hvc1', 'hev1']);
const M4V = new Set(['M4V ', 'M4VH', 'M4VP']);
const IMAGES = new Set(['mif1', 'msf1', 'miaf', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'avif', 'avis']);
const CHILD = { '': 'moov', moov: 'trak', 'moov/trak': 'mdia' };
const unsupported = () => Object.assign(new Error('Unsupported video container'), { code: 'VIDEO_UNSUPPORTED' });

export async function inspectVideo(file) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 16) throw unsupported();
    let readBytes = 0;
    let boxes = 0;
    let format;
    let videoTrack = false;
    let mediaData = false;
    async function readAt(position, length, end = info.size) {
      if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) || position < 0 || length < 0 ||
          position + length > end || end > info.size || readBytes + length > 512 * 1024) throw unsupported();
      readBytes += length;
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
        if (!bytesRead) throw unsupported();
        offset += bytesRead;
      }
      return buffer;
    }
    async function walk(start, end, path) {
      let offset = start;
      while (offset < end) {
        if (++boxes > 4096) throw unsupported();
        const header = await readAt(offset, 8, end);
        const type = header.toString('latin1', 4, 8);
        let length = header.readUInt32BE(0);
        let headerSize = 8;
        if (length === 1) {
          const extended = (await readAt(offset + 8, 8, end)).readBigUInt64BE();
          if (extended > BigInt(end - offset) || extended > BigInt(Number.MAX_SAFE_INTEGER)) throw unsupported();
          length = Number(extended);
          headerSize = 16;
        } else if (length === 0) length = end - offset;
        if (length < headerSize || length > end - offset) throw unsupported();
        const payload = offset + headerSize;
        const next = offset + length;
        if (offset === 0 && type !== 'ftyp') throw unsupported();
        if (path === '' && type === 'ftyp') {
          if (offset !== 0 || format || length > 4096 || length - headerSize < 8 || (length - headerSize - 8) % 4) throw unsupported();
          const identity = await readAt(payload, length - headerSize, next);
          const major = identity.toString('latin1', 0, 4);
          const brands = [major];
          for (let i = 8; i < identity.length; i += 4) brands.push(identity.toString('latin1', i, i + 4));
          if (brands.some((brand) => IMAGES.has(brand))) throw unsupported();
          format = major === 'qt  ' ? 'mov' : M4V.has(major) ? 'm4v' : MP4.has(major) ? 'mp4' : null;
          if (!format) throw unsupported();
        }
        if (path === '' && type === 'mdat' && next > payload) mediaData = true;
        if (type === CHILD[path]) await walk(payload, next, path ? `${path}/${type}` : type);
        if (path === 'moov/trak/mdia' && type === 'hdlr') {
          const handler = await readAt(payload, 12, next);
          if (handler.toString('latin1', 8, 12) === 'vide') videoTrack = true;
        }
        offset = next;
      }
    }
    await walk(0, info.size, '');
    if (!format || !videoTrack || !mediaData) throw unsupported();
    return { format, ext: `.${format}` };
  } finally { await handle.close(); }
}
