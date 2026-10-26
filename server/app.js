import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { ensureCache, importPhoto } from './importer.js';
import { fail, isAlbumId, isPhotoId, openLibrary } from './library.js';

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
};

// IPv4 LAN addresses; en0 / en1 (Wi‑Fi or Ethernet on a Mac) first.
export function lanAddresses() {
  const rank = (name) => ['en0', 'en1'].indexOf(name) + 1 || 3;
  return Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((a) => ({ ...a, name })))
    .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((a) => a.address);
}

function send(res, status, body, headers = {}) {
  const html = typeof body === 'string';
  res.writeHead(status, {
    'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(html ? body : JSON.stringify(body));
}

const page = (text) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>相册</title><p style="margin:48px 24px;font:16px/1.6 system-ui,sans-serif;text-align:center;color:#3b4a5a">${text}</p>`;

async function sendFile(res, file, headers) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw fail(404, '图片丢失');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    ...headers,
  });
  createReadStream(file).pipe(res);
}

async function readJson(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, '请求格式不对');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw fail(413, '请求太大');
  }
  let data;
  try {
    data = JSON.parse(raw || '{}');
  } catch {
    throw fail(400, '请求格式不对');
  }
  if (!data || typeof data !== 'object') throw fail(400, '请求格式不对');
  return data;
}

function cookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Spec §12. Returns { local } when the request may go on; otherwise it has already answered.
function gate(lib, req, res, url) {
  const port = req.socket.localPort;
  const host = String(req.headers.host ?? '');
  const hosts = ['localhost', '127.0.0.1', '[::1]', ...lanAddresses()].map((h) => `${h}:${port}`);
  if (!hosts.includes(host)) {
    send(res, 403, page('地址不对'));
    return null;
  }
  const local = LOOPBACK.has(req.socket.remoteAddress);
  // The Home Screen icon is public: iOS may fetch it without the cookie.
  if (!local && url.pathname !== '/apple-touch-icon.png') {
    const { enabled, key } = lib.phone();
    if (!enabled) {
      send(res, 403, page('手机访问已关闭，请在电脑上打开「手机访问」'));
      return null;
    }
    const given = url.searchParams.get('key');
    if (given !== null && !same(given, key)) {
      send(res, 403, page('链接已失效，请在电脑上重新扫码'));
      return null;
    }
    // No redirect: the key stays in the address for Safari opened from WeChat and for the Home Screen app.
    if (given !== null) res.setHeader('Set-Cookie', `album_key=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    else if (!same(cookie(req, 'album_key'), key)) {
      send(res, 403, page('请在电脑上打开「手机访问」，用手机扫码进入'));
      return null;
    }
  }
  const origin = req.headers.origin;
  if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== `http://${host}`) {
    send(res, 403, { error: '不允许跨站请求' });
    return null;
  }
  return { local };
}

async function api(lib, req, res, url, local) {
  const [, , name, id, sub, action] = url.pathname.split('/');
  const m = req.method;
  if (name === 'phone' && id === undefined) {
    if (!local) throw fail(403, '只能在电脑上设置');
    if (m === 'PATCH') await lib.setPhone((await readJson(req)).enabled === true);
    else if (m !== 'GET') throw fail(405, '不支持');
    return send(res, 200, { ...lib.phone(), ip: lanAddresses()[0] ?? null, port: req.socket.localPort });
  }
  if (name === 'albums') {
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
    if (sub === 'photos' && action === undefined && m === 'POST') {
      if (req.headers['x-album-upload'] !== '1') throw fail(403, '缺少上传标记');
      return send(res, 200, await importPhoto(lib, id, req, url.searchParams.get('name')));
    }
    if (sub === 'photos' && action === 'delete' && m === 'POST') {
      return send(res, 200, await lib.deletePhotos(id, (await readJson(req)).ids));
    }
  }
  throw fail(404, '没有这个接口');
}

async function media(lib, res, pathname) {
  const [, , albumId, photoId, size] = pathname.split('/');
  if (!isAlbumId(albumId) || !isPhotoId(photoId) || !['600', '1600', 'original'].includes(size)) {
    throw fail(404, '没有这张图');
  }
  const photo = lib.get(albumId).photos.find((p) => p.id === photoId);
  if (!photo) throw fail(404, '没有这张图');
  if (size === 'original') {
    return sendFile(res, join(lib.albumDir(albumId), 'originals', photo.file), {
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(photo.name)}`,
    });
  }
  const file = await ensureCache(lib, albumId, photo, size).catch(() => {
    throw fail(404, '图片丢失');
  });
  return sendFile(res, file, { 'Cache-Control': 'public, max-age=31536000, immutable' });
}

export function createHandler(lib) {
  return async (req, res, next) => {
    try {
      const url = new URL(req.url, 'http://local');
      const who = gate(lib, req, res, url);
      if (!who) return;
      if (url.pathname.startsWith('/api/')) return await api(lib, req, res, url, who.local);
      if (url.pathname.startsWith('/media/')) return await media(lib, res, url.pathname);
      next();
    } catch (err) {
      if (!err.status) console.error(err);
      if (res.headersSent) return res.destroy();
      send(res, err.status ?? 500, { error: err.status ? err.message : '服务器出错了' });
    }
  };
}

async function serveStatic(root, req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, '不支持');
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch {
    throw fail(400, '地址不对');
  }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(root + sep)) throw fail(404, '没有这个页面');
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  await sendFile(res, file, { 'Cache-Control': cache });
}

export async function startServer({ dir, port = 5180, host = '0.0.0.0', dist }) {
  const lib = await openLibrary(dir);
  const handler = createHandler(lib);
  const root = resolve(dist);
  const server = http.createServer((req, res) =>
    handler(req, res, () =>
      serveStatic(root, req, res).catch((err) => {
        if (res.headersSent) return res.destroy();
        send(res, err.status ?? 500, page(err.status === 404 ? '没有这个页面' : '服务器出错了'));
      }),
    ),
  );
  await new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(port, host, ok);
  });
  return {
    url: `http://localhost:${server.address().port}/`,
    close: () => new Promise((ok) => server.close(ok)),
  };
}
