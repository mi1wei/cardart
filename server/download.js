import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { randomUUID } from 'node:crypto';
import { fail, isPhotoId } from './library.js';

export function downloadName(value, fallback = 'photo') {
  const leaf = String(value ?? '').replaceAll('\\', '/').split('/').at(-1)
    .replace(/[\x00-\x1f\x7f:]/g, '_').replace(/[. ]+$/g, '').slice(0, 200);
  return leaf && leaf !== '.' && leaf !== '..' ? leaf : fallback;
}
export function disposition(type, name) {
  const encoded = encodeURIComponent(downloadName(name)).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename*=UTF-8''${encoded}`;
}

function selectedPhotos(lib, albumId, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !isPhotoId(id)) || new Set(ids).size !== ids.length) throw fail(400, 'none-selected');
  const album = lib.snapshot(albumId);
  const chosen = new Set(ids);
  const photos = album.photos.filter((photo) => chosen.has(photo.id));
  if (photos.length !== ids.length) throw fail(404, 'no-photo');
  return { album, photos };
}

// Keep large selections out of native download URLs, without buffering their ZIP in the renderer.
export function createDownloadTickets(lib) {
  const tickets = new Map();
  function prune() {
    for (const [id, ticket] of tickets) if (ticket.expires <= Date.now()) tickets.delete(id);
  }
  return {
    issue(albumId, ids) {
      prune();
      selectedPhotos(lib, albumId, ids);
      if (tickets.size >= 128) throw fail(503, 'download-busy');
      const ticket = randomUUID();
      tickets.set(ticket, { albumId, ids: [...ids], expires: Date.now() + 300000 });
      return ticket;
    },
    take(albumId, id) {
      prune();
      const ticket = tickets.get(id);
      if (!ticket || ticket.albumId !== albumId) throw fail(404, 'no-photo');
      tickets.delete(id);
      return ticket.ids;
    },
  };
}

// The caller holds the library coordinator until streaming ends, so a concurrent
// move/purge cannot unlink a file before yazl opens its lazy stream.
export async function downloadZip(lib, albumId, ids, req, res) {
  const { album, photos } = selectedPhotos(lib, albumId, ids);
  const used = new Set();
  const files = [];
  for (const photo of photos) {
    if (photo.file !== downloadName(photo.file)) throw fail(404, 'image-missing');
    const file = join(lib.albumDir(albumId), 'originals', photo.file);
    const info = await stat(file).catch((error) => { if (error.code === 'ENOENT') throw fail(404, 'image-missing'); throw error; });
    if (!info.isFile()) throw fail(404, 'image-missing');
    const original = downloadName(photo.name);
    let name = original;
    for (let number = 2; used.has(name.toLocaleLowerCase('en')); number++) {
      const extension = extname(original);
      name = `${original.slice(0, original.length - extension.length)} (${number})${extension}`;
    }
    used.add(name.toLocaleLowerCase('en'));
    files.push({ file, name, size: info.size });
  }
  if (res.destroyed) return;
  const zip = new yazl.ZipFile();
  const streams = new Set();
  let stopped = false;
  const abort = () => {
    stopped = true;
    zip.outputStream.destroy();
    for (const stream of streams) stream.destroy();
  };
  res.once('close', abort);
  zip.on('error', (error) => zip.outputStream.destroy(error));
  for (const { file, name, size } of files) {
    zip.addReadStreamLazy(name, { compress: false, size }, (callback) => {
      if (stopped) return callback(new Error('Download cancelled'));
      const stream = createReadStream(file);
      streams.add(stream);
      stream.once('close', () => streams.delete(stream));
      callback(null, stream);
    });
  }
  zip.end();
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': disposition('attachment', `${downloadName(album.title, 'album')}.zip`),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
  });
  try { await pipeline(zip.outputStream, res); }
  catch (error) {
    if (!res.destroyed || !['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET'].includes(error.code)) throw error;
  }
  finally {
    res.off('close', abort);
    abort();
    await Promise.all([...streams].map((stream) => finished(stream, { cleanup: true }).catch(() => {})));
  }
}
