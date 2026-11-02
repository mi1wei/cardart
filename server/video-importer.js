import { createHash, randomBytes } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { MAX_POSTER_BYTES, MAX_POSTER_EDGE, MAX_VIDEO_BYTES, MAX_VIDEO_DIMENSION } from '../shared/media.js';
import { makeCache } from './importer.js';
import { inspectVideo } from './video-container.js';
import { makeVideoMetadata } from './video-metadata.js';

const integer = (value, max) => Number.isInteger(value) && value > 0 && value <= max;
function validParameters({ posterBytes, w, h, duration }) {
  return integer(posterBytes, MAX_POSTER_BYTES) && integer(w, MAX_VIDEO_DIMENSION) && integer(h, MAX_VIDEO_DIMENSION) &&
    Number.isFinite(duration) && duration > 0;
}
export function parseVideoParameters(search) {
  const readInteger = (key) => /^[1-9]\d{0,7}$/.test(search.get(key) ?? '') ? Number(search.get(key)) : NaN;
  const time = search.get('lastModified');
  const duration = search.get('duration') ?? '';
  const result = {
    posterBytes: readInteger('posterBytes'), w: readInteger('w'), h: readInteger('h'),
    duration: /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(duration) ? Number(duration) : NaN,
    lastModified: /^(?:0|[1-9]\d{0,14})$/.test(time ?? '') && Number(time) <= 253402300799999 ? Number(time) : undefined,
  };
  return validParameters(result) ? result : null;
}

async function validatePoster(file) {
  const bytes = await readFile(file);
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_POSTER_EDGE ** 2, failOn: 'error' });
    const metadata = await image.metadata();
    const { width, height } = metadata.autoOrient ?? metadata;
    if (metadata.format !== 'jpeg' || (metadata.pages ?? 1) !== 1 ||
        !integer(width, MAX_POSTER_EDGE) || !integer(height, MAX_POSTER_EDGE)) return null;
    await image.raw().toBuffer();
    return { posterW: width, posterH: height };
  } catch { return null; }
}

export async function importVideo(lib, albumId, req, rawName, options = {}) {
  lib.get(albumId);
  if (!validParameters(options)) return { skipped: 'unsupported' };
  const { posterBytes, w, h, duration, lastModified, maxVideoBytes = MAX_VIDEO_BYTES } = options;
  if (Number(req.headers?.['content-length']) > posterBytes + maxVideoBytes) return { skipped: 'too-large' };
  const dir = lib.albumDir(albumId);
  const originals = join(dir, 'originals');
  const cache = join(dir, 'cache');
  const temp = () => join(originals, `.tmp-${randomBytes(12).toString('hex')}`);
  const tmpVideo = temp();
  const tmpPoster = temp();
  const owned = new Set();
  const handles = [];
  let committed = false;
  async function closeHandles() {
    const results = await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  try {
    const videoHandle = await open(tmpVideo, 'wx');
    handles.push(videoHandle);
    owned.add(tmpVideo);
    const posterHandle = await open(tmpPoster, 'wx');
    handles.push(posterHandle);
    owned.add(tmpPoster);
    let remainingPoster = posterBytes;
    let videoBytes = 0;
    const hash = createHash('sha256');
    for await (const input of req.iterator({ destroyOnReturn: false })) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      const split = Math.min(remainingPoster, chunk.length);
      if (split) {
        await posterHandle.writeFile(chunk.subarray(0, split));
        remainingPoster -= split;
      }
      if (split < chunk.length) {
        const data = chunk.subarray(split);
        videoBytes += data.length;
        if (videoBytes > maxVideoBytes) return { skipped: 'too-large' };
        hash.update(data);
        await videoHandle.writeFile(data);
      }
    }
    await closeHandles();
    if (remainingPoster || !videoBytes) return { skipped: 'unsupported' };
    let container;
    try { container = await inspectVideo(tmpVideo); }
    catch (error) {
      if (error.code === 'VIDEO_UNSUPPORTED') return { skipped: 'unsupported' };
      throw error;
    }
    const posterSize = await validatePoster(tmpPoster);
    if (!posterSize) return { skipped: 'unsupported' };
    const sha256 = hash.digest('hex');
    return await lib.queue(albumId, async () => {
      const album = lib.get(albumId);
      if (album.photos.some((item) => item.sha256 === sha256)) return { skipped: 'duplicate' };
      const { id, sequence } = await lib.nextPhotoIdentity(album);
      const file = `${id}${container.ext}`;
      const poster = `${id}-poster.jpg`;
      for (const size of [600, 1600]) owned.add(join(cache, `${id}_${size}.webp`));
      await makeCache(tmpPoster, cache, id);
      const videoPath = join(originals, file);
      const posterPath = join(originals, poster);
      await rename(tmpVideo, videoPath);
      owned.add(videoPath);
      await rename(tmpPoster, posterPath);
      owned.add(posterPath);
      const photo = {
        id, kind: 'video', file, poster, name: basename(String(rawName ?? '')).slice(0, 200) || 'video',
        w, h, ...posterSize, duration, sha256, addedAt: new Date().toISOString(),
        metadata: makeVideoMetadata({ format: container.format, bytes: videoBytes, lastModified }),
      };
      await lib.save({ ...album, nextSeq: sequence + 1, photos: [...album.photos, photo] });
      committed = true;
      return { photo };
    });
  } finally {
    try { await closeHandles(); }
    finally {
      if (!committed) {
        const paths = [...owned];
        const results = await Promise.allSettled(paths.map((file) => rm(file, { force: true })));
        results.forEach((result, index) => {
          if (result.status === 'rejected') console.error('Video import cleanup failed', paths[index], result.reason);
        });
      }
    }
  }
}
