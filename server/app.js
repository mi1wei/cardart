import { timingSafeEqual } from 'node:crypto';
import { open } from 'node:fs/promises';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ensureCache, importPhoto } from './importer.js';
import { fail, isAlbumId, isPhotoId, openLibrary } from './library.js';
import { say } from './text.js';
import { MAX_LICENSE_BYTES } from './license.js';
import { isPhotoMetadata, readPhotoMetadata } from './photo-metadata.js';
import { importVideo, parseVideoParameters } from './video-importer.js';
import { readVideoMetadata } from './video-metadata.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

export function lanInterfaces(interfaces = networkInterfaces()) {
  const seen = new Set();
  return Object.entries(interfaces)
    .flatMap(([name, list]) => (list ?? []).map((address) => ({ ...address, name })))
    .filter((address) => address.family === 'IPv4' && !address.internal && isIP(address.address) === 4 &&
      !/^(?:0\.|127\.|169\.254\.)/.test(address.address) && Number(address.address.split('.')[0]) < 224)
    .map((address) => ({
      ...address,
      rank: (/utun|^tun|^tap|vpn|docker|vethernet|vmnet|tailscale|^veth|^br-/i.test(address.name) ? 2 : 0) +
        (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address.address) ? 0 : 1),
    }))
    .sort((a, b) => a.rank - b.rank)
    .filter(({ address }) => { if (seen.has(address)) return false; seen.add(address); return true; })
    .map(({ address, name }) => ({ address, name }));
}

export const lanAddresses = () => lanInterfaces().map(({ address }) => address);
function send(res, status, body, headers = {}) {
  const html = typeof body === 'string';
  res.writeHead(status, {
    'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(html ? body : JSON.stringify(body));
}

// A small page for refusals and errors, in the visitor's language.
const page = (lang, code) =>
  `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${say(lang, 'app')}</title><p style="margin:48px 24px;font:16px/1.6 system-ui,sans-serif;text-align:center;color:#3b4a5a">${say(lang, code)}</p>`;

// Opens first: a file deleted or unreadable meanwhile is a 404, never a crash of the server.
// One byte range is answered when asked: iPhone Safari plays video only this way (spec §11).
async function sendFile(req, res, file, headers) {
  const handle = await open(file).catch(() => null);
  const info = await handle?.stat();
  if (!info?.isFile()) {
    await handle?.close();
    throw fail(404, 'image-missing');
  }
  const size = info.size;
  let start = 0;
  let end = size - 1;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  const partial = !!m && (m[1] !== '' || m[2] !== '');
  if (partial) {
    if (m[1] !== '') {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
    } else start = Math.max(0, size - Number(m[2]));
    if (start > end) {
      await handle.close();
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' });
      return res.end();
    }
  }
  // The browser may have dropped the request meanwhile (a photo scrolled away). Streaming into a closed
  // response never finishes and would leave the file open, so close it here instead.
  if (res.destroyed) return handle.close();
  res.writeHead(partial ? 206 : 200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(partial && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    ...headers,
  });
  if (req.method === 'HEAD') {
    await handle.close();
    return res.end();
  }
  const stream = handle.createReadStream(partial ? { start, end } : {});
  await pipeline(stream, res).catch(() => {}); // the phone left mid-download
}

// Whatever is inside a file, it never runs as a page of this site.
const MEDIA = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' };

async function readJson(req, limit = 1_000_000) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, 'bad-request');
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw fail(413, 'too-big'); }
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > limit) throw fail(413, 'too-big');
      chunks.push(buffer);
    }
  } catch (error) {
    req.resume();
    throw error;
  }
  let data;
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
    data = JSON.parse(raw || '{}');
  } catch {
    throw fail(400, 'bad-request');
  }
  if (!data || typeof data !== 'object') throw fail(400, 'bad-request');
  return data;
}

function cookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// The page's choice (cookie `folio_lang`) wins; otherwise the browser's first language (spec §10).
function langOf(req) {
  const chosen = cookie(req, 'folio_lang');
  if (chosen === 'zh' || chosen === 'en') return chosen;
  return /^zh/i.test(String(req.headers['accept-language'] ?? '')) ? 'zh' : 'en';
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Spec §12. Returns { local } when the request may go on; otherwise it has already answered.
function gate(lib, req, res, url) {
  const lang = langOf(req);
  const port = req.socket.localPort;
  const host = String(req.headers.host ?? '');
  const hosts = ['localhost', '127.0.0.1', '[::1]', ...lanAddresses()].map((h) => `${h}:${port}`);
  if (!hosts.includes(host)) {
    send(res, 403, page(lang, 'wrong-address'));
    return null;
  }
  const local = LOOPBACK.has(req.socket.remoteAddress);
  // The Home Screen icon is public: iOS may fetch it without the cookie.
  if (!local && url.pathname !== '/apple-touch-icon.png') {
    const { enabled, key } = lib.phone();
    if (!enabled) {
      send(res, 403, page(lang, 'phone-off'));
      return null;
    }
    const given = url.searchParams.get('key');
    if (given !== null && !same(given, key)) {
      send(res, 403, page(lang, 'link-expired'));
      return null;
    }
    // No redirect: the key stays in the address for Safari opened from WeChat and for the Home Screen app.
    if (given !== null) res.setHeader('Set-Cookie', `album_key=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    else if (!same(cookie(req, 'album_key'), key)) {
      send(res, 403, page(lang, 'scan-first'));
      return null;
    }
  }
  const origin = req.headers.origin;
  if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== `http://${host}`) {
    send(res, 403, { error: say(lang, 'cross-site') });
    return null;
  }
  return { local };
}

async function api(lib, req, res, url, local, license) {
  const [, , name, id, sub, action, detail, ...rest] = url.pathname.split('/');
  const m = req.method;
  if (name === 'license' && id === undefined) {
    if (m === 'GET') return send(res, 200, license?.status() ?? { state: 'development', canWrite: true });
    if (m !== 'POST') throw fail(405, 'not-supported');
    if (!local) throw fail(403, 'computer-only');
    if (!license) throw fail(409, 'license-development');
    return send(res, 200, await license.activate(await readJson(req, MAX_LICENSE_BYTES)));
  }
  if (name === 'phone' && id === undefined) {
    if (!local) throw fail(403, 'computer-only');
    if (m === 'PATCH') await lib.setPhone((await readJson(req)).enabled === true);
    else if (m !== 'GET') throw fail(405, 'not-supported');
    const addresses = lanInterfaces();
    return send(res, 200, { ...lib.phone(), ip: addresses[0]?.address ?? null, addresses, port: req.socket.localPort });
  }
  if (name === 'albums') {
    if (license && !['GET', 'HEAD'].includes(m)) {
      const state = license.status();
      if (state.state !== 'active' || !state.canWrite) throw fail(403, 'license-required');
    }
    if (id === undefined && m === 'GET') return send(res, 200, lib.list());
    if (id === undefined && m === 'POST') return send(res, 200, await lib.create((await readJson(req)).title));
    if (id !== undefined && sub === undefined) {
      if (m === 'GET') return send(res, 200, lib.get(id));
      if (m === 'PATCH') return send(res, 200, await lib.update(id, await readJson(req)));
      if (m === 'DELETE') {
        await lib.remove(id);
        return send(res, 200, { ok: true });
      }
    }
    if (sub === 'photos' && detail === 'details' && !rest.length && m === 'GET') {
      if (!isPhotoId(action)) throw fail(404, 'no-photo');
      const photo = lib.get(id).photos.find((item) => item.id === action);
      if (!photo) throw fail(404, 'no-photo');
      if (photo.kind === 'video') {
        return send(res, 200, { photoId: photo.id, kind: 'video',
          metadata: await readVideoMetadata(join(lib.albumDir(id), 'originals', photo.file), photo) });
      }
      const metadata = isPhotoMetadata(photo.metadata) ? photo.metadata :
        await readPhotoMetadata(join(lib.albumDir(id), 'originals', photo.file));
      return send(res, 200, { photoId: photo.id, metadata });
    }
    if (sub === 'photos' && detail === 'note' && !rest.length && m === 'PATCH') {
      return send(res, 200, await lib.updatePhotoNote(id, action, await readJson(req, 32768)));
    }
    if (sub === 'photos' && action === undefined && m === 'POST') {
      if (req.headers['x-album-upload'] !== '1') throw fail(403, 'upload-header');
      if (url.searchParams.has('kind')) {
        const options = url.searchParams.get('kind') === 'video' ? parseVideoParameters(url.searchParams) : null;
        return send(res, 200, options
          ? await importVideo(lib, id, req, url.searchParams.get('name'), options)
          : { skipped: 'unsupported' });
      }
      const modified = url.searchParams.get('lastModified');
      const lastModified = /^(0|[1-9]\d{0,14})$/.test(modified ?? '') ? Number(modified) : undefined;
      return send(res, 200, await importPhoto(lib, id, req, url.searchParams.get('name'), { lastModified }));
    }
    if (sub === 'photos' && action === 'delete' && m === 'POST') {
      return send(res, 200, await lib.deletePhotos(id, (await readJson(req)).ids));
    }
  }
  throw fail(404, 'no-api');
}

async function media(lib, req, res, pathname) {
  const [, , albumId, photoId, size] = pathname.split('/');
  if (!isAlbumId(albumId) || !isPhotoId(photoId) || !['600', '1600', 'original'].includes(size)) {
    throw fail(404, 'no-photo');
  }
  const photo = lib.get(albumId).photos.find((p) => p.id === photoId);
  if (!photo) throw fail(404, 'no-photo');
  if (size === 'original') {
    return sendFile(req, res, join(lib.albumDir(albumId), 'originals', photo.file), {
      ...MEDIA,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(photo.name)}`,
    });
  }
  const file = await ensureCache(lib, albumId, photo, size).catch(() => {
    throw fail(404, 'image-missing');
  });
  return sendFile(req, res, file, { ...MEDIA, 'Cache-Control': 'public, max-age=31536000, immutable' });
}

export function createHandler(lib, { license = null } = {}) {
  return async (req, res, next) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (req.method === 'POST' && /^\/api\/albums\/[^/]+\/photos$/.test(url.pathname) && url.searchParams.has('kind')) {
        res.setHeader('Connection', 'close');
        res.once('finish', () => { if (!req.readableEnded) req.destroy(); });
      }
      const who = gate(lib, req, res, url);
      if (!who) return;
      if (url.pathname.startsWith('/api/')) return await api(lib, req, res, url, who.local, license);
      if (url.pathname.startsWith('/media/')) return await media(lib, req, res, url.pathname);
      return await next();
    } catch (err) {
      if (!err.status) console.error(err);
      if (res.headersSent) return res.destroy();
      send(res, err.status ?? 500, { error: say(langOf(req), err.status ? err.message : 'server-error') }, err.status === 413 ? { Connection: 'close' } : {});
    }
  };
}

async function serveStatic(root, req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'not-supported');
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch {
    throw fail(400, 'wrong-address');
  }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(root + sep)) throw fail(404, 'no-page');
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  const headers = { 'Cache-Control': cache };
  if (extname(file) === '.html') headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  await sendFile(req, res, file, headers);
}

export async function startServer({ dir, port = 5180, host = '0.0.0.0', dist, fallbackToRandomPort = false, license = null }) {
  const root = resolve(dist);
  const lib = await openLibrary(dir);
  const handler = createHandler(lib, { license });
  const pending = new Set();
  const writes = new Set();
  const readers = new Set();
  let stopping = false;
  let closing;
  const server = http.createServer((req, res) => {
    if (stopping) return send(res, 503, { error: say(langOf(req), 'server-stopping') }, { Connection: 'close' });
    const reading = ['GET', 'HEAD'].includes(req.method);
    if (reading) {
      readers.add(res);
      res.once('close', () => readers.delete(res));
    }
    const job = handler(req, res, () =>
      serveStatic(root, req, res).catch((err) => {
        if (res.headersSent) return res.destroy();
        send(res, err.status ?? 500, page(langOf(req), err.status === 404 ? 'no-page' : 'server-error'));
      }),
    );
    pending.add(job);
    if (!reading) writes.add(job);
    job.then(
      () => { pending.delete(job); writes.delete(job); },
      (error) => { pending.delete(job); writes.delete(job); res.destroy(); console.error(error); },
    );
  });
  const listen = (number) => new Promise((ok, bad) => {
    const cleanup = () => { server.off('error', failed); server.off('listening', ready); };
    const failed = (error) => { cleanup(); bad(error); };
    const ready = () => { cleanup(); ok(); };
    server.once('error', failed);
    server.once('listening', ready);
    try { server.listen(number, host); } catch (error) { failed(error); }
  });
  try {
    try { await listen(port); }
    catch (error) {
      if (!fallbackToRandomPort || error.code !== 'EADDRINUSE') throw error;
      await listen(0);
    }
  } catch (error) {
    await lib.close();
    throw error;
  }
  const actualPort = server.address().port;
  return {
    url: `http://localhost:${actualPort}/`,
    port: actualPort,
    close() {
      closing ??= (async () => {
        stopping = true;
        const stopped = new Promise((ok, bad) => server.close((error) => error ? bad(error) : ok()));
        server.closeIdleConnections();
        await Promise.allSettled([...writes]);
        for (const response of readers) response.destroy();
        await Promise.allSettled([...pending]);
        server.closeAllConnections();
        try { await stopped; } finally { await lib.close(); }
      })();
      return closing;
    },
  };
}
