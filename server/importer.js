import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { fail } from './library.js';
import { decodeHeic } from './heic.js';
import { MAX_BYTES } from './image-limits.js';

export { MAX_BYTES } from './image-limits.js';
// Originals are named by what they really are; other formats (SVG, PDF…) are not photos.
const RASTER = { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif', tiff: '.tif', heif: '.heic' };
const tmpName = () => `.tmp-${randomBytes(8).toString('hex')}`;

// The 1600 image comes from the source, the 600 from the upright 1600: one full decode per photo.
async function render(src, cacheDir, id, options = {}) {
  const big = join(cacheDir, `${id}_1600.webp`);
  await sharp(src, { ...options, failOn: 'error' })
    .autoOrient()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(big);
  await sharp(big)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(join(cacheDir, `${id}_600.webp`));
  const { autoOrient } = await sharp(src, options).metadata();
  return { w: autoOrient.width, h: autoOrient.height };
}

export async function makeCache(original, cacheDir, id) {
  try {
    const metadata = await sharp(original).metadata();
    if (metadata.format === 'heif' && metadata.compression !== 'av1') {
      const { width, height, pixels } = await decodeHeic(original);
      return await render(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), cacheDir, id, { raw: { width, height, channels: 4 } });
    }
    return await render(original, cacheDir, id);
  } catch (error) {
    await Promise.all([600, 1600].map((size) => rm(join(cacheDir, `${id}_${size}.webp`), { force: true })));
    throw error;
  }
}

export async function importPhoto(lib, albumId, req, rawName) {
  lib.get(albumId);
  const name = basename(String(rawName ?? '')).slice(0, 200) || 'photo';
  if (Number(req.headers?.['content-length']) > MAX_BYTES) {
    req.resume();
    return { skipped: 'too-large' };
  }
  const dir = lib.albumDir(albumId);
  const tmp = join(dir, 'originals', tmpName());
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) return done(fail(413, 'too-large'));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(req, meter, createWriteStream(tmp));
  } catch (err) {
    await rm(tmp, { force: true });
    if (err.status === 413) return { skipped: 'too-large' };
    throw err;
  }
  const sha256 = hash.digest('hex');

  // From here on, one photo at a time per album: the duplicate check and the numbering stay exact.
  return lib.queue(albumId, async () => {
    const album = lib.get(albumId);
    if (album.photos.some((p) => p.sha256 === sha256)) {
      await rm(tmp, { force: true });
      return { skipped: 'duplicate' };
    }
    const id = `p${String(album.nextSeq).padStart(3, '0')}`;
    const { format, compression } = await sharp(tmp).metadata().catch(() => ({}));
    const ext = format === 'heif' && compression === 'av1' ? '.avif' : RASTER[format];
    let size;
    try {
      if (!ext) throw new Error('not a photo');
      size = await makeCache(tmp, join(dir, 'cache'), id);
    } catch {
      await rm(tmp, { force: true });
      return { skipped: 'unsupported' };
    }
    const file = `${id}${ext}`;
    await rename(tmp, join(dir, 'originals', file));
    const photo = { id, file, name, w: size.w, h: size.h, sha256 };
    await lib.save({ ...album, nextSeq: album.nextSeq + 1, photos: [...album.photos, photo] });
    return { photo };
  });
}

const making = new Map();
export async function ensureCache(lib, albumId, photo, size) {
  const dir = lib.albumDir(albumId);
  const file = join(dir, 'cache', `${photo.id}_${size}.webp`);
  if (await stat(file).then(() => true, () => false)) return file;
  const key = `${albumId}/${photo.id}`;
  if (!making.has(key)) {
    const job = makeCache(join(dir, 'originals', photo.file), join(dir, 'cache'), photo.id);
    making.set(key, job.finally(() => making.delete(key)));
  }
  await making.get(key);
  return file;
}
