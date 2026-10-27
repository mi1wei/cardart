# 册页 Folio 界面改版与中英双语 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参考 cardart.cc 改版界面：加导航栏和主页（含 3D 翻页视频）、透明袋相册卡片、等高行照片网格，并支持中英切换。

**Architecture:**
- **服务端**：
  - `server/text.js` 存中英文字；
  - `app.js` 按 Cookie `lang` / `Accept-Language` 选语言，支持分段下载（Range）；
  - `library.js` 的相册列表改给 `previews`（最多 3 张，封面在前）。
- **前端**：
  - `src/i18n.js` 是中英对照表和 `t()`；
  - `src/nav.js` 导航栏；`src/home.js` 主页；`src/folder.js` 透明袋卡片（主页和相册墙共用）；
  - `main.js` 按路由切换主页 / 相册墙 / 相册页，切换语言时重画当前页；
  - 样式全部在 `src/style.css`。

**Tech Stack:** 原生 JS ES 模块、CSS、Vite 8、Node ≥ 20.9（本机 v26）、sharp 0.35；新增字体包 `@fontsource-variable/geist`（OFL）。检查用 Node 内置 `fetch`、`WebSocket`，通过 DevTools 协议驱动无头 Chrome。

**Spec:** `docs/superpowers/specs/2026-10-27-folio-redesign-design.md`（界面稿：`docs/superpowers/mockups/2026-10-27-folio-redesign/`）

## Global Constraints

- **技术**：原生 JS，不用框架；新增的运行时依赖只有 `@fontsource-variable/geist`；不从网上加载任何东西。
- **产品名**：册页 / Folio。页面标题：
  - 主页「册页」/ Folio；
  - 相册墙「相册 · 册页」/ Albums · Folio；
  - 相册页「相册名 · 册页」/「相册名 · Folio」。
- **路由**：`#/` 主页，`#/albums` 相册墙，`#/a/<id>`（及 `/3d`、`/p/<photo>`）相册页；认不出的地址当作主页。
- **语言**：
  - 只有 `zh`、`en`；
  - 第一次打开时：`navigator.languages[0]` 以 `zh` 开头就用中文，否则英文；
  - 选择存在 `localStorage` 的 `lang` 里；每次打开页面和切换时都写 Cookie `lang=<zh|en>; Path=/; Max-Age=31536000; SameSite=Lax`；
  - 服务端先看 Cookie `lang`，没有就看 `Accept-Language` 是否以 `zh` 开头，否则英文。
- **文案**：
  - 界面文字只从 `src/i18n.js` 的 `t()` 取，键和中英文按 Task 2 的表逐字使用（即 spec §13）；
  - 服务端文字只从 `server/text.js` 取；
  - 用户内容（相册名、文件名）不翻译。
- **视觉**：
  - 颜色沿用 `:root` 变量，新增 `--accent-soft: oklch(95.2% 0.018 237)`；
  - 字体栈 `'Geist Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Noto Sans CJK SC', system-ui, sans-serif`；
  - 字号按 spec §4 的表；
  - 按钮是胶囊形，高 36px（主页大按钮 44px）；图标按钮 30px；
  - 阴影两档：`--panel`（浮起）、`--card`（卡片）；缓动 `cubic-bezier(0.22, 1, 0.36, 1)`；
  - 「减少动态效果」打开时：主页不播视频，悬停时照片不动。
- **手机断点**：`max-width: 600px`（沿用）。
- **主页视频**：
  - `src/assets/home-book.mp4`（1280×700，H.264，约 0.55 MB）和封面图 `src/assets/home-book.jpg`；
  - 从 `docs/superpowers/mockups/2026-10-27-folio-redesign/book-hero.mp4` 和 `book-hero-poster.jpg` 复制。
- **数据**：
  - 相册库位置和 `album.json` 格式都不变；
  - `GET /api/albums` 每项改为 `{ id, title, count, previews, createdAt }`，去掉 `cover`。
- **测试**：
  - 不写单元测试，仓库里不放测试文件；
  - 检查脚本在 `/tmp/album-checks/`，截图在 `/tmp/album-shots/`，临时相册库是 `/tmp/album-checks/lib-*`，都不提交；
  - 检查里的浏览器默认用中文（`--accept-lang=zh-CN`）。
- **命令与提交**：
  - 所有命令都在项目根目录 `/Users/miwei/PyCharmMiscProject/cardart` 下执行；
  - 每次提交带 trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`；
  - 不 push；不要动 `.codegraph/`。

## Review Focus

1. **很长的相册名**（50 个字、没有空格）：卡片和相册页标题都用省略号截断，不撑破布局，各卡片一样宽。
   → Task 3 `check-pages` 的「long name」；Task 5 `check-pages` 的「long title」。
2. **极端长宽比**（8:1 全景、1:20 长截图）：等高行里不超出网格，不出现巨大的格子。
   → Task 5 `check-pages` 的「extreme shapes」。
3. **卡片上的照片读不到**（原图和缓存都没了）：那一格显示空白卡片，不显示裂图。
   → Task 3 `check-pages` 的「lost photo」。
4. **浏览器语言既不是中文也不是英文**（`ja`）或是繁体（`zh-TW`），以及存了坏值（`lang=fr`）：日语用英文，繁体用中文，坏值回到浏览器语言。
   → Task 2 `check-i18n` 的「other languages」；Task 1 `check-server` 的「bad cookie」。
5. **相册很多**（100 本）：相册墙不会一打开就把所有缩略图都下载下来。
   → Task 3 `check-pages` 的「many albums」。

## 文件结构

| 文件 | 职责 | 任务 |
| --- | --- | --- |
| `server/text.js`（新） | 服务端中英文字、`say(lang, code)` | 1 |
| `server/app.js` | 语言选择、Range、`.mp4`、错误文字按语言 | 1 |
| `server/library.js` | `previews`；错误改用代码 | 1 |
| `server/index.js` | 启动信息中英两行 | 1 |
| `src/i18n.js`（新） | 中英对照表、`lang()`、`t()`、`setLang()` | 2 |
| `src/folder.js`（新） | 透明袋卡片：`pocket()`、`folder()`、`folderClick()` | 3 |
| `src/nav.js`（新） | 导航栏：`createNav(onLang)` | 4 |
| `src/home.js`（新） | 主页：`renderHome(app)` | 4 |
| `src/assets/home-book.mp4`、`home-book.jpg`（新） | 主页视频和封面图 | 4 |
| `public/geist-OFL.txt`（新） | 字体许可证 | 3 |
| `src/main.js` | 导航栏、三种页面、切换语言时重画 | 2、3、4 |
| `src/router.js` | `page: 'home' / 'albums' / 'album'` | 4 |
| `src/wall.js` | 标题区、透明袋卡片、空状态 | 1、2、3、4 |
| `src/album.js` | 文案；标题区、按钮行、等高行网格、拖动换位间隔 | 2、4、5 |
| `src/lightbox.js`、`viewer.js`、`phone.js`、`ui.js` | 文案改用 `t()`；`onComputer`；新图标 | 2、3、4、5 |
| `src/style.css` | 视觉规范、卡片、导航、主页、相册页 | 2、3、4、5 |
| `index.html` | 标题和主屏幕名称「册页」 | 2 |
| `README.md`、旧设计文档 | 改名、说明、指向新文档 | 6 |

---
### Task 1: 服务端：预览图、分段下载、中英文字

**Files:**
- Create: `server/text.js`
- Modify: `server/app.js`（整个文件换掉）、`server/library.js`、`server/index.js`、`src/wall.js:43`
- Test: `/tmp/album-checks/check-server.mjs`、`/tmp/album-checks/check-library.mjs`

**Interfaces:**
- Consumes: 现有 `openLibrary`、`fail(status, message)`、`importPhoto`、`ensureCache`。
- Produces:
  - `GET /api/albums` 每项 `{ id, title, count, previews: [{ id, w, h }]（最多 3 张，封面在前）, createdAt }`；
  - `server/text.js`：`TEXT = { zh: {…}, en: {…} }`、`say(lang, code) → string`；
  - `fail(status, code)` 的第二个参数一律是 `TEXT` 里的键；接口错误返回 `{ error: say(lang, code) }`；
  - 所有文件响应带 `Accept-Ranges: bytes`，`Range: bytes=a-b` 返回 206，越界返回 416；
  - `.mp4` 的类型是 `video/mp4`。

- [ ] **Step 1: 改 check-server，让它先失败**

在 `/tmp/album-checks/check-server.mjs` 里：

(a) 在 `writeFileSync(\`${dist}/apple-touch-icon.png\`, 'png');` 下面加一行：

```js
writeFileSync(`${dist}/assets/v.mp4`, 'mp4');
```

(b) 在 `// Order, cover, delete.` 这一节里，把

```js
res = await json('PATCH', `/api/albums/${album.id}`, { order: ['p002', 'p001'], cover: 'p001' });
assert.deepEqual((await res.json()).photos.map((p) => p.id), ['p002', 'p001']);
```

换成

```js
res = await json('PATCH', `/api/albums/${album.id}`, { order: ['p002', 'p001'], cover: 'p001' });
assert.deepEqual((await res.json()).photos.map((p) => p.id), ['p002', 'p001']);
// The wall's pockets: the cover first, then the next photos; no `cover` field any more (spec §11).
let item = (await (await fetch(`${base}/api/albums`)).json()).find((a) => a.id === album.id);
assert.deepEqual(Object.keys(item).sort(), ['count', 'createdAt', 'id', 'previews', 'title']);
assert.deepEqual(item.previews.map((p) => p.id), ['p001', 'p002']);
assert.deepEqual(Object.keys(item.previews[0]).sort(), ['h', 'id', 'w']);
```

(c) 在 `// Host and Origin (spec §12).` 这一行前面插入：

```js
// At most three previews, the cover first and not twice.
const four = await (await json('POST', '/api/albums', { title: 'four' })).json();
for (const f of [fx.land, fx.tall, fx.square, fx.rotated]) {
  await fetch(`${base}/api/albums/${four.id}/photos?name=x.jpg`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(f) });
}
await json('PATCH', `/api/albums/${four.id}`, { cover: 'p003' });
item = (await (await fetch(`${base}/api/albums`)).json()).find((a) => a.id === four.id);
assert.deepEqual([item.count, item.previews.map((p) => p.id)], [4, ['p003', 'p001', 'p002']]);
const none = await (await json('POST', '/api/albums', { title: 'none' })).json();
assert.deepEqual((await (await fetch(`${base}/api/albums`)).json()).find((a) => a.id === none.id).previews, []);

// Partial downloads (Range), which iPhone Safari needs for video (spec §11).
const ranged = (path, range) => fetch(base + path, { headers: { Range: range } });
res = await ranged('/assets/app-1.js', 'bytes=0-6');
assert.equal(res.status, 206);
assert.equal(res.headers.get('content-range'), 'bytes 0-6/14');
assert.equal(res.headers.get('accept-ranges'), 'bytes');
assert.equal(await res.text(), 'console');
assert.equal(await (await ranged('/assets/app-1.js', 'bytes=-2')).text(), '1)');
assert.equal(await (await ranged('/assets/app-1.js', 'bytes=8-')).text(), 'log(1)');
res = await ranged('/assets/app-1.js', 'bytes=99-');
assert.equal(res.status, 416);
assert.equal(res.headers.get('content-range'), 'bytes */14');
res = await fetch(`${base}/assets/app-1.js`);
assert.deepEqual([res.status, res.headers.get('accept-ranges')], [200, 'bytes']);
res = await ranged(`/media/${album.id}/p002/original`, 'bytes=0-3');
assert.equal(res.status, 206);
assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47]); // p002 is a PNG
assert.equal((await fetch(`${base}/assets/v.mp4`)).headers.get('content-type'), 'video/mp4');

// Error text follows the page's language: the lang cookie first, then Accept-Language (spec §10).
const titleError = async (headers) =>
  (await (await fetch(`${base}/api/albums`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{"title":""}' })).json()).error;
assert.equal(await titleError({ 'Accept-Language': 'zh-CN,zh;q=0.9' }), '相册名要 1–50 个字');
assert.equal(await titleError({ 'Accept-Language': 'en-US,zh;q=0.8' }), 'Album names must be 1–50 characters');
assert.equal(await titleError({}), 'Album names must be 1–50 characters');
assert.equal(await titleError({ 'Accept-Language': 'zh-CN', Cookie: 'lang=en' }), 'Album names must be 1–50 characters');
assert.equal(await titleError({ Cookie: 'album_key=x; lang=zh' }), '相册名要 1–50 个字');
// Review focus «bad cookie»: an unknown value falls back to the browser's language.
assert.equal(await titleError({ 'Accept-Language': 'zh-CN', Cookie: 'lang=fr' }), '相册名要 1–50 个字');
assert.equal((await (await fetch(`${base}/api/albums/not-a-uuid`, { headers: { Cookie: 'lang=en' } })).json()).error, 'Album not found');
```

(d) 把 LAN 那一节开头的

```js
  const lan = (path, cookie) => raw('GET', path, { Host: `${ip}:${port}`, ...(cookie && { Cookie: cookie }) }, '', ip);
  assert.match((await lan('/')).body, /手机访问已关闭，请在电脑上打开「手机访问」/);
```

换成

```js
  const lan = (path, cookie, headers = {}) =>
    raw('GET', path, { Host: `${ip}:${port}`, ...(cookie && { Cookie: cookie }), ...headers }, '', ip);
  assert.match((await lan('/', '', { 'Accept-Language': 'zh-CN' })).body, /手机访问已关闭，请在电脑上打开「手机访问」/);
  res = await lan('/'); // no language at all: English
  assert.match(res.body, /Phone access is off\. Turn on "Phone access" on the computer\./);
  assert.match(res.body, /<title>Folio<\/title>/);
  assert.match((await lan('/', 'lang=zh')).body, /<title>册页<\/title>/);
```

- [ ] **Step 2: 改 check-library**

在 `/tmp/album-checks/check-library.mjs` 里，把

```js
assert.deepEqual(lib.list()[0].cover, { id: 'p002', w: 4, h: 3 });
```

换成

```js
// Order p003, p001, p002 with p002 as the cover: the cover first, then the others in order.
assert.deepEqual(lib.list()[0].previews, [{ id: 'p002', w: 4, h: 3 }, { id: 'p003', w: 4, h: 3 }, { id: 'p001', w: 4, h: 3 }]);
assert.equal('cover' in lib.list()[0], false);
```

- [ ] **Step 3: 运行，确认失败**

Run: `node /tmp/album-checks/check-library.mjs; node /tmp/album-checks/check-server.mjs`
Expected: 两个都失败。check-library 报 `previews` 是 `undefined`；check-server 在 `Object.keys(item)` 那里失败（还有 `cover`，没有 `previews`）。

- [ ] **Step 4: 写 server/text.js**

```js
// Server text in Chinese and English (spec §11, §13). Errors carry a code; it is turned into text
// in the visitor's language just before it is sent.
export const TEXT = {
  zh: {
    app: '册页',
    'wrong-address': '地址不对',
    'phone-off': '手机访问已关闭，请在电脑上打开「手机访问」',
    'link-expired': '链接已失效，请在电脑上重新扫码',
    'scan-first': '请在电脑上打开「手机访问」，用手机扫码进入',
    'no-page': '没有这个页面',
    'server-error': '服务器出错了',
    'title-length': '相册名要 1–50 个字',
    'album-missing': '相册不存在',
    'cover-missing': '封面照片不存在',
    'per-page': '每页张数只能是 1、2、3',
    'order-changed': '照片有变化，请刷新后再排',
    'none-selected': '没有选中照片',
    'no-photo': '没有这张图',
    'image-missing': '图片丢失',
    'computer-only': '只能在电脑上设置',
    'cross-site': '不允许跨站请求',
    'bad-request': '请求格式不对',
    'too-big': '请求太大',
    'upload-header': '缺少上传标记',
    'no-api': '没有这个接口',
    'not-supported': '不支持',
  },
  en: {
    app: 'Folio',
    'wrong-address': 'Wrong address',
    'phone-off': 'Phone access is off. Turn on "Phone access" on the computer.',
    'link-expired': 'This link has expired. Scan the new code on the computer.',
    'scan-first': 'Turn on "Phone access" on the computer, then scan the code with your phone.',
    'no-page': 'Page not found',
    'server-error': 'Server error',
    'title-length': 'Album names must be 1–50 characters',
    'album-missing': 'Album not found',
    'cover-missing': 'Cover photo not found',
    'per-page': 'Photos per page must be 1, 2 or 3',
    'order-changed': 'The photos changed. Refresh and try again.',
    'none-selected': 'No photos selected',
    'no-photo': 'Photo not found',
    'image-missing': 'Image missing',
    'computer-only': 'Only available on the computer',
    'cross-site': "Cross-site requests aren't allowed",
    'bad-request': 'Bad request',
    'too-big': 'Request too large',
    'upload-header': 'Missing upload header',
    'no-api': 'Not found',
    'not-supported': 'Not supported',
  },
};

export const say = (lang, code) => TEXT[lang]?.[code] ?? TEXT.zh[code] ?? code;
```

- [ ] **Step 5: 换掉 server/app.js**

整个文件换成：

```js
import { timingSafeEqual } from 'node:crypto';
import { open } from 'node:fs/promises';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ensureCache, importPhoto } from './importer.js';
import { fail, isAlbumId, isPhotoId, openLibrary } from './library.js';
import { say } from './text.js';

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
  '.txt': 'text/plain; charset=utf-8',
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
  res.writeHead(partial ? 206 : 200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(partial && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    ...headers,
  });
  const stream = handle.createReadStream(partial ? { start, end } : {});
  await pipeline(stream, res).catch(() => {}); // the phone left mid-download
}

// Whatever is inside a file, it never runs as a page of this site.
const MEDIA = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' };

async function readJson(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, 'bad-request');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw fail(413, 'too-big');
  }
  let data;
  try {
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

// The page's choice (cookie `lang`) wins; otherwise the browser's first language (spec §10).
function langOf(req) {
  const chosen = cookie(req, 'lang');
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

async function api(lib, req, res, url, local) {
  const [, , name, id, sub, action] = url.pathname.split('/');
  const m = req.method;
  if (name === 'phone' && id === undefined) {
    if (!local) throw fail(403, 'computer-only');
    if (m === 'PATCH') await lib.setPhone((await readJson(req)).enabled === true);
    else if (m !== 'GET') throw fail(405, 'not-supported');
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
      if (req.headers['x-album-upload'] !== '1') throw fail(403, 'upload-header');
      return send(res, 200, await importPhoto(lib, id, req, url.searchParams.get('name')));
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

export function createHandler(lib) {
  return async (req, res, next) => {
    try {
      const url = new URL(req.url, 'http://local');
      const who = gate(lib, req, res, url);
      if (!who) return;
      if (url.pathname.startsWith('/api/')) return await api(lib, req, res, url, who.local);
      if (url.pathname.startsWith('/media/')) return await media(lib, req, res, url.pathname);
      next();
    } catch (err) {
      if (!err.status) console.error(err);
      if (res.headersSent) return res.destroy();
      send(res, err.status ?? 500, { error: say(langOf(req), err.status ? err.message : 'server-error') });
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
  await sendFile(req, res, file, { 'Cache-Control': cache });
}

export async function startServer({ dir, port = 5180, host = '0.0.0.0', dist }) {
  const lib = await openLibrary(dir);
  const handler = createHandler(lib);
  const root = resolve(dist);
  const server = http.createServer((req, res) =>
    handler(req, res, () =>
      serveStatic(root, req, res).catch((err) => {
        if (res.headersSent) return res.destroy();
        send(res, err.status ?? 500, page(langOf(req), err.status === 404 ? 'no-page' : 'server-error'));
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
```

- [ ] **Step 6: 改 server/library.js**

逐行替换（每行只改引号里的文字或那条警告，行首的条件不变）：

- `throw fail(400, '相册名要 1–50 个字')` → `throw fail(400, 'title-length')`
- `throw fail(404, '相册不存在')` → `throw fail(404, 'album-missing')`
- `throw fail(400, '参数不对')` → `throw fail(400, 'bad-request')`
- `throw fail(400, '封面照片不存在')` → `throw fail(400, 'cover-missing')`
- `throw fail(400, '每页张数只能是 1、2、3')` → `throw fail(400, 'per-page')`
- `throw fail(409, '照片有变化，请刷新后再排')` → `throw fail(409, 'order-changed')`
- `throw fail(400, '没有选中照片')` → `throw fail(400, 'none-selected')`
- `` console.warn(`library.json 读不了，已重建：${err.message}`) `` → `` console.warn(`library.json 读不了，已重建：${err.message}\nlibrary.json was unreadable and has been rebuilt: ${err.message}`) ``
- `` console.warn(`跳过相册 ${id}：${err.message}`) `` → `` console.warn(`跳过相册 ${id}：${err.message}\nSkipped album ${id}: ${err.message}`) ``

再把 `fail` 的定义改成（注释说明第二个参数是代码）：

```js
// `code` is a key of server/text.js; app.js turns it into the visitor's language.
export const fail = (status, code) => Object.assign(new Error(code), { status });
```

把 `list()` 整个换成：

```js
    list() {
      return [...albums.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => {
          // The pocket on the wall shows the cover in front, then the next photos (spec §7, §11).
          const cover = a.photos.find((p) => p.id === a.cover) ?? a.photos[0];
          const previews = cover ? [cover, ...a.photos.slice(0, 3).filter((p) => p !== cover)].slice(0, 3) : [];
          return {
            id: a.id,
            title: a.title,
            count: a.photos.length,
            previews: previews.map(({ id, w, h }) => ({ id, w, h })),
            createdAt: a.createdAt,
          };
        });
    },
```

- [ ] **Step 7: 改 server/index.js**

把 `try { … } catch { … }` 里的三条输出换成中英两行：

```js
try {
  const { url } = await startServer({ dir, port, dist });
  console.log(`册页已启动：${url}；相册库：${dir}\nFolio is running: ${url}; library: ${dir}`);
} catch (err) {
  if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 被占用，可以用 PORT=xxxx npm start 换一个\nPort ${port} is in use. Try PORT=xxxx npm start.`);
  else if (['EACCES', 'EPERM', 'EROFS', 'ENOTDIR'].includes(err.code)) {
    console.error(`相册库目录不可写：${dir}（${err.message}）\nThe library folder isn't writable: ${dir} (${err.message})`);
  } else console.error(err);
  process.exit(1);
}
```

- [ ] **Step 8: 相册墙改用 previews**

`src/wall.js` 里卡片的封面那一行，把

```js
      <a class="cover" href="#/a/${a.id}" data-act="open">${a.cover ? `<img alt="" src="${mediaUrl(a.id, a.cover.id, 600)}">` : icon('book')}</a>
```

换成

```js
      <a class="cover" href="#/a/${a.id}" data-act="open">${a.previews[0] ? `<img alt="" src="${mediaUrl(a.id, a.previews[0].id, 600)}">` : icon('book')}</a>
```

- [ ] **Step 9: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-library.mjs && node /tmp/album-checks/check-import.mjs && node /tmp/album-checks/check-server.mjs && node /tmp/album-checks/check-pages.mjs && node /tmp/album-checks/smoke-start.mjs`
Expected: `library ok`、`import ok`、`server ok`、`pages ok`；smoke 输出 `start 200`，第二个进程打印两行端口被占用（中文一行、英文一行）和 `exit 1`，最后是 `[]`。

- [ ] **Step 10: 提交**

```bash
git add server/text.js server/app.js server/library.js server/index.js src/wall.js
git commit -m "feat: give album previews, byte ranges and server text in Chinese and English" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: 中英对照表，所有界面文字改用 t()

**Files:**
- Create: `src/i18n.js`
- Modify: `src/ui.js`、`src/phone.js`、`src/wall.js`、`src/album.js`、`src/lightbox.js`、`src/viewer.js`、`src/main.js`、`src/style.css`（两处「图片丢失」）、`index.html`
- Test: `/tmp/album-checks/cdp.mjs`（加 `lang`）、`/tmp/album-checks/check-i18n.mjs`（新）、`check-pages.mjs`、`check-phone.mjs`

**Interfaces:**
- Consumes: Task 1 的 `server/text.js`（检查里比对键）、按 Cookie `lang` 返回的错误文字。
- Produces（`src/i18n.js`）：
  - `TEXT = { zh: {…}, en: {…} }`：值是字符串，或接收变量对象、返回字符串的函数；
  - `lang() → 'zh' | 'en'`：第一次调用时决定语言并 `apply()`；
  - `t(key, vars?) → string`；
  - `setLang(code)`：存 `localStorage`、`apply()`；
  - `apply()`（内部）：设 `<html lang>`（`zh-CN` / `en`）、CSS 变量 `--missing`、`apple-mobile-web-app-title`、Cookie `lang`。
- 检查：`launch({ lang })`，默认 `'zh-CN'`。

- [ ] **Step 1: 检查里的浏览器可以指定语言**

在 `/tmp/album-checks/cdp.mjs` 里，把

```js
export async function launch({ width = 1280, height = 800, mobile = false } = {}) {
```

换成

```js
// `lang` sets navigator.languages and Accept-Language (--lang alone does not on macOS).
export async function launch({ width = 1280, height = 800, mobile = false, lang = 'zh-CN' } = {}) {
```

并在 Chrome 参数里 `` `--window-size=${width},${height}`, `` 后面加 `` `--accept-lang=${lang}`, ``。

- [ ] **Step 2: 写 check-i18n**

新建 `/tmp/album-checks/check-i18n.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-i18n.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { launch } from './cdp.mjs';
import { makeFixtures } from './fixtures.mjs';

const HAN = /\p{Script=Han}/u;

// Both tables have the same keys, and no English text contains Chinese (spec §10, §13).
const { TEXT } = await import(`${process.cwd()}/src/i18n.js`);
assert.deepEqual(Object.keys(TEXT.en).sort(), Object.keys(TEXT.zh).sort());
const vars = (n) => ({ n, i: 1, a: n, p: n, name: 'Trip', reason: 'oops', why: 'why' });
for (const [key, v] of Object.entries(TEXT.en)) {
  for (const n of [1, 2]) {
    const s = typeof v === 'function' ? v(vars(n)) : v;
    assert.equal(typeof s, 'string', key);
    assert.ok(!HAN.test(s) && !s.includes('undefined'), `en ${key}: ${s}`);
  }
}
for (const [key, v] of Object.entries(TEXT.zh)) {
  const s = typeof v === 'function' ? v(vars(2)) : v;
  assert.ok(typeof s === 'string' && !s.includes('undefined'), `zh ${key}: ${s}`);
}
const { TEXT: SERVER } = await import(`${process.cwd()}/server/text.js`);
assert.deepEqual(Object.keys(SERVER.en).sort(), Object.keys(SERVER.zh).sort());
for (const [key, s] of Object.entries(SERVER.en)) assert.ok(!HAN.test(s), `server en ${key}: ${s}`);

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-i18n';
rmSync(dir, { recursive: true, force: true });
const fx = await makeFixtures();
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const base = server.url.replace(/\/$/, '');
const api = (path, init) => fetch(base + path, init).then((r) => r.json());
// User content in plain ASCII, so any Chinese left on screen comes from the app.
const album = await api('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"Trip"}' });
for (const [file, name] of [[fx.land, 'a.jpg'], [fx.tall, 'b.png']]) {
  await api(`/api/albums/${album.id}/photos?name=${name}`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(file) });
}
await api('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"Empty"}' });

// Everything a person can read: the title, the text, and labels, tooltips and placeholders.
const visible = `(() => {
  const attrs = [...document.querySelectorAll('[aria-label], [title], [placeholder]')]
    .map((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')].join(' '));
  return [document.title, document.body.innerText, ...attrs].join('\\n');
})()`;
// 「中」 is the language button itself.
const english = async (b, where) => {
  const lines = (await b.evaluate(visible)).replaceAll('中', '').split('\n').filter((l) => HAN.test(l));
  assert.deepEqual(lines, [], `${where}: ${lines.join(' | ')}`);
};

const b = await launch({ lang: 'en-US' });
await b.goto(`${server.url}#/albums`);
await b.waitFor(`document.querySelectorAll('.album').length === 2`);
assert.equal(await b.evaluate('document.documentElement.lang'), 'en');
assert.match(await b.evaluate('document.cookie'), /(^|; )lang=en(;|$)/);
assert.equal(await b.evaluate(`document.querySelector('meta[name=apple-mobile-web-app-title]').content`), 'Folio');
await english(b, 'wall');
await b.click('.album [data-act=menu]');
await english(b, 'wall menu');
await b.click('.menu [data-act=delete]');
await b.waitFor(`!!document.querySelector('dialog[open]')`);
await english(b, 'delete album dialog');
await b.key('Escape');
await b.click('[data-act=new]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-input')?.value === 'New album'`);
await english(b, 'new album dialog');
await b.key('Escape');
// The server answers in the page's language (the cookie the page wrote).
const err = await b.evaluate(`fetch('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":""}' }).then((r) => r.json())`);
assert.equal(err.error, 'Album names must be 1–50 characters');

await b.goto(`${server.url}#/a/${album.id}`);
await b.waitFor(`document.querySelectorAll('.grid .tile').length === 2`);
assert.equal(await b.evaluate('document.title'), 'Trip · Folio');
await english(b, 'album page');
await b.click('[data-act=select]');
await b.click('.tile[data-id=p001]');
await english(b, 'selecting');
await b.click('.acts.picking [data-act=delete]');
await b.waitFor(`!!document.querySelector('dialog[open]')`);
await english(b, 'delete photos dialog');
await b.key('Escape');
await b.click('[data-act=cancel]');
await b.click('.title');
await b.waitFor(`!!document.querySelector('dialog[open] .dlg-input')`);
await english(b, 'rename dialog');
await b.key('Escape');
await b.files('input[type=file]', [fx.land, fx.broken, fx.square]);
await b.waitFor(`document.querySelector('.upload small')?.textContent.startsWith('Imported')`, 60000);
assert.equal(await b.evaluate(`document.querySelector('.upload small').textContent`), 'Imported 1 photo, skipped 2 (1 duplicate, 1 unsupported)');
await english(b, 'import summary');
await b.click('.tile[data-id=p002]');
await b.waitFor(`!!document.querySelector('.lb')`);
await english(b, 'lightbox');
await b.click('.lb [data-act=delete]');
await b.waitFor(`!!document.querySelector('dialog[open]')`);
await english(b, 'delete photo dialog');
await b.key('Escape');
await b.key('Escape');
await b.waitFor(`!document.querySelector('.lb')`);
await b.goto(`${server.url}#/a/${album.id}/3d`);
await b.waitFor(`!!document.querySelector('.ab-count')?.textContent`, 30000);
await english(b, '3D');
await b.key('Escape');
await b.goto(`${server.url}#/a/00000000-0000-4000-8000-000000000000`);
await b.waitFor(`!!document.querySelector('.empty a')`);
await english(b, 'missing album');
await b.goto(`${server.url}#/albums`);
await b.click('[data-act=phone]');
await b.waitFor(`document.querySelector('dialog[open] h3')?.textContent === 'View on your phone'`);
await english(b, 'phone dialog');
assert.deepEqual(b.errors, []);
await b.close();

// A Chinese browser gets Chinese, from the page and from the server.
const z = await launch();
await z.goto(`${server.url}#/albums`);
await z.waitFor(`document.querySelectorAll('.album').length === 2`);
assert.equal(await z.evaluate('document.documentElement.lang'), 'zh-CN');
assert.equal(await z.evaluate('document.title'), '相册 · 册页');
assert.match(await z.evaluate('document.cookie'), /(^|; )lang=zh(;|$)/);
const zerr = await z.evaluate(`fetch('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":""}' }).then((r) => r.json())`);
assert.equal(zerr.error, '相册名要 1–50 个字');
// A saved choice wins over the browser; a bad saved value falls back to the browser.
await z.evaluate(`localStorage.setItem('lang', 'en')`);
await z.evaluate('location.reload()');
await z.waitFor(`document.documentElement.lang === 'en' && document.querySelectorAll('.album').length === 2`);
await z.evaluate(`localStorage.setItem('lang', 'fr')`);
await z.evaluate('location.reload()');
await z.waitFor(`document.documentElement.lang === 'zh-CN' && document.querySelectorAll('.album').length === 2`);
assert.deepEqual(z.errors, []);
await z.close();

// Review focus «other languages»: Japanese gets English, Traditional Chinese gets Chinese.
for (const [browser, page] of [['ja', 'en'], ['zh-TW', 'zh-CN'], ['en-GB', 'en']]) {
  const o = await launch({ lang: browser });
  await o.goto(`${server.url}#/albums`);
  await o.waitFor(`document.querySelectorAll('.album').length === 2`);
  assert.equal(await o.evaluate('document.documentElement.lang'), page, browser);
  await o.close();
}
await server.close();
console.log('i18n ok');
```

- [ ] **Step 3: 其他检查里跟着变的中文**

- `/tmp/album-checks/check-pages.mjs`：
  - `assert.equal(await b.evaluate(\`document.querySelector('.count').textContent\`), '5 张');` 里的 `'5 张'` 改成 `'5 张照片'`；
  - `assert.equal(await b.evaluate(\`document.querySelector('.album .names p').textContent\`), '3 张');` 里的 `'3 张'` 改成 `'3 张照片'`。
- `/tmp/album-checks/check-phone.mjs`：`'name="apple-mobile-web-app-title" content="相册"'` 改成 `'name="apple-mobile-web-app-title" content="册页"'`。

- [ ] **Step 4: 运行，确认失败**

Run: `node /tmp/album-checks/check-i18n.mjs`
Expected: FAIL，`Cannot find module '…/src/i18n.js'`。

- [ ] **Step 5: 写 src/i18n.js**

（`Wi‑Fi` 里的连字符是不断行连字符 U+2011，和现有文案一致；`hero-title` 英文在换行前留一个空格，电脑上不换行时两个词之间才有空格。）

```js
// Chinese and English text (spec §10, §13). A value is a string, or a function of the variables.
export const TEXT = {
  zh: {
    app: '册页',
    home: '首页',
    albums: '相册',
    'phone-access': '手机访问',
    language: '语言',
    ok: '确定',
    cancel: '取消',
    delete: '删除',
    save: '保存',
    close: '关闭',
    more: '更多',
    'load-failed': ({ reason }) => `加载失败：${reason}`,
    failed: ({ reason }) => `操作失败：${reason}`,
    'save-failed': ({ reason }) => `保存失败：${reason}`,
    'image-missing': '图片丢失',
    photos: ({ n }) => `${n} 张照片`,
    stats: ({ a, p }) => `${a} 本相册 · ${p} 张照片`,
    'local-albums': '本地相册',
    'no-upload': '照片不上传云端',
    'hero-title': '把照片装进一本\n能翻的相册',
    'hero-lead': '照片存在自己的电脑上。横的竖的自动排版，像真的相册一样一页页翻；同一个 Wi‑Fi 下，手机扫码也能看。',
    'open-albums': '打开相册',
    'view-on-phone': '用手机看',
    'what-it-does': '能做什么',
    'f1-title': '照片只在你的电脑上',
    'f1-text': '不上传到任何地方。整个相册库就是一个文件夹，复制一份就是备份。',
    'f2-title': '像真的相册一样翻',
    'f2-text': '3D 翻页，拖动或点两侧翻；一万张照片也是一本连续的书。',
    'f3-title': '横竖自动排版',
    'f3-text': '横的竖的混在一起，每页自动排一到四张，照片不裁切。',
    'f4-title': '手机扫码就能看',
    'f4-text': '同一个 Wi‑Fi 下扫码，手机也能看、能上传；iPhone 可以添加到主屏幕全屏看。',
    recent: '最近的相册',
    'all-albums': '全部相册',
    footer: '照片只保存在这台电脑上',
    'new-album': '新建相册',
    'new-album-name': '新相册',
    'no-albums': '还没有相册',
    rename: '重命名',
    'delete-album': '删除相册',
    create: '创建',
    'rename-album': '重命名相册',
    'delete-album-text': ({ name }) => `删除相册「${name}」？相册里的照片会一起删除，不能恢复。`,
    'rename-hint': '点击改名',
    'flip-3d': '3D 翻阅',
    'upload-photos': '上传照片',
    upload: '上传',
    select: '选择',
    selected: ({ n }) => `已选 ${n} 张`,
    cover: '封面',
    'drop-here': '把照片拖到这里',
    or: '或',
    'choose-photos': '点这里选择照片',
    formats: '支持 JPG、PNG、HEIC、WebP',
    'album-missing': '相册不存在。',
    'back-to-albums': '回到全部相册',
    importing: ({ i, n }) => `正在导入 ${i} / ${n}`,
    'import-done': '导入完成',
    imported: ({ n }) => `已导入 ${n} 张`,
    skipped: ({ n, why }) => `，跳过 ${n} 张（${why}）`,
    dup: ({ n }) => `重复 ${n}`,
    bad: ({ n }) => `格式不支持 ${n}`,
    big: ({ n }) => `太大 ${n}`,
    'failed-n': ({ n }) => `，失败 ${n} 张`,
    sep: '，',
    'delete-photos': '删除照片',
    'delete-photos-text': ({ n }) => `删除 ${n} 张照片？删除后不能恢复。`,
    'order-changed': '照片有变化，已刷新',
    'set-cover': '设为封面',
    'cover-set': '已设为封面',
    original: '查看原图',
    'prev-photo': '上一张',
    'next-photo': '下一张',
    'delete-photo': '删除照片',
    'delete-photo-text': '删除这张照片？删除后不能恢复。',
    'hint-open': '拖动页面或点击两侧翻页；点击照片看大图',
    'hint-closed': '点击封面或向左拖动打开',
    'per-page': '每页',
    'per-1': '每页 1 张',
    'per-2': '宽松',
    'per-3': '紧凑',
    fullscreen: '全屏',
    'fullscreen-exit': '退出全屏',
    'close-book': '合上相册',
    'open-book': '打开相册',
    'prev-page': '上一页',
    'next-page': '下一页',
    'jump-spread': '跳到第几个跨页',
    'no-webgl': '当前浏览器无法显示 3D 相册（WebGL 不可用）',
    rotate: '请横过手机查看相册',
    'no-fullscreen': '当前浏览器不能全屏',
    'tip-iphone': 'iPhone 的浏览器不能全屏：点分享 →「添加到主屏幕」，以后从主屏幕上的「册页」图标打开就是全屏。',
    'tip-wechat': '微信里不能全屏：点右上角「···」→「在 Safari 中打开」，再点分享 →「添加到主屏幕」。',
    'phone-title': '用手机看相册',
    'phone-help': '手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。',
    copy: '复制',
    copied: '已复制',
    'copy-failed': '复制失败，请手动复制',
    'phone-note': '想在 iPhone 上全屏看：在 Safari 里点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开。',
    'phone-allow': '允许手机访问',
    'phone-allow-help': '关掉后，手机马上打不开',
    'phone-link-off': '打开下面的开关后显示链接',
    'phone-no-lan': '这台电脑没有连接局域网',
  },
  en: {
    app: 'Folio',
    home: 'Home',
    albums: 'Albums',
    'phone-access': 'Phone access',
    language: 'Language',
    ok: 'OK',
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    close: 'Close',
    more: 'More',
    'load-failed': ({ reason }) => `Couldn't load: ${reason}`,
    failed: ({ reason }) => `Something went wrong: ${reason}`,
    'save-failed': ({ reason }) => `Couldn't save: ${reason}`,
    'image-missing': 'Image missing',
    photos: ({ n }) => (n === 1 ? '1 photo' : `${n} photos`),
    stats: ({ a, p }) => `${a === 1 ? '1 album' : `${a} albums`} · ${p === 1 ? '1 photo' : `${p} photos`}`,
    'local-albums': 'Local photo albums',
    'no-upload': 'Nothing is uploaded',
    'hero-title': 'Your photos, bound \ninto a real album',
    'hero-lead':
      'Folio keeps your photos on your own computer, lays them out page by page, and lets you flip through them like a real album. Phones on the same Wi‑Fi can join with a scan.',
    'open-albums': 'Open albums',
    'view-on-phone': 'View on phone',
    'what-it-does': 'What it does',
    'f1-title': 'Stays on your computer',
    'f1-text': 'Nothing leaves your machine. The library is just a folder — copy it and you have a backup.',
    'f2-title': 'Flip it like a real album',
    'f2-text': 'Turn pages in 3D by dragging or tapping. Even 10,000 photos make one continuous book.',
    'f3-title': 'Automatic layout',
    'f3-text': 'Landscape and portrait photos share pages, one to four per page, never cropped.',
    'f4-title': 'Open it on your phone',
    'f4-text': 'Scan the code on the same Wi‑Fi to view and upload from your phone, or add it to your iPhone Home Screen.',
    recent: 'Recent albums',
    'all-albums': 'All albums',
    footer: 'Your photos stay on this computer',
    'new-album': 'New album',
    'new-album-name': 'New album',
    'no-albums': 'No albums yet',
    rename: 'Rename',
    'delete-album': 'Delete album',
    create: 'Create',
    'rename-album': 'Rename album',
    'delete-album-text': ({ name }) => `Delete "${name}"? Its photos will be deleted too. This can't be undone.`,
    'rename-hint': 'Click to rename',
    'flip-3d': 'Flip in 3D',
    'upload-photos': 'Upload photos',
    upload: 'Upload',
    select: 'Select',
    selected: ({ n }) => `${n} selected`,
    cover: 'Cover',
    'drop-here': 'Drop photos here',
    or: 'or',
    'choose-photos': 'choose photos',
    formats: 'JPG, PNG, HEIC and WebP',
    'album-missing': "This album doesn't exist.",
    'back-to-albums': 'Back to all albums',
    importing: ({ i, n }) => `Importing ${i} of ${n}`,
    'import-done': 'Import finished',
    imported: ({ n }) => (n === 1 ? 'Imported 1 photo' : `Imported ${n} photos`),
    skipped: ({ n, why }) => `, skipped ${n} (${why})`,
    dup: ({ n }) => (n === 1 ? '1 duplicate' : `${n} duplicates`),
    bad: ({ n }) => `${n} unsupported`,
    big: ({ n }) => `${n} too large`,
    'failed-n': ({ n }) => `, ${n} failed`,
    sep: ', ',
    'delete-photos': 'Delete photos',
    'delete-photos-text': ({ n }) => `${n === 1 ? 'Delete 1 photo?' : `Delete ${n} photos?`} This can't be undone.`,
    'order-changed': 'The photos changed elsewhere and were reloaded',
    'set-cover': 'Set as cover',
    'cover-set': 'Cover updated',
    original: 'View original',
    'prev-photo': 'Previous',
    'next-photo': 'Next',
    'delete-photo': 'Delete photo',
    'delete-photo-text': "Delete this photo? This can't be undone.",
    'hint-open': 'Drag a page or click either side to turn it; click a photo to enlarge it',
    'hint-closed': 'Click the cover or drag it left to open',
    'per-page': 'Per page',
    'per-1': '1 per page',
    'per-2': 'Relaxed',
    'per-3': 'Compact',
    fullscreen: 'Full screen',
    'fullscreen-exit': 'Exit full screen',
    'close-book': 'Close book',
    'open-book': 'Open book',
    'prev-page': 'Previous page',
    'next-page': 'Next page',
    'jump-spread': 'Jump to spread',
    'no-webgl': "This browser can't show the 3D album (WebGL is unavailable)",
    rotate: 'Turn your phone sideways to view the album',
    'no-fullscreen': "This browser can't go full screen",
    'tip-iphone': 'iPhone browsers can\'t go full screen: tap Share → "Add to Home Screen", then open Folio from its Home Screen icon.',
    'tip-wechat': 'WeChat can\'t go full screen: tap "···" at the top right → "Open in Safari", then Share → "Add to Home Screen".',
    'phone-title': 'View on your phone',
    'phone-help': 'Connect your phone to the same Wi‑Fi as this computer, then scan the code with its camera.',
    copy: 'Copy',
    copied: 'Copied',
    'copy-failed': "Couldn't copy. Please copy it by hand.",
    'phone-note': 'For full screen on iPhone: in Safari, tap Share → "Add to Home Screen", then open Folio from its icon.',
    'phone-allow': 'Allow phone access',
    'phone-allow-help': 'Phones lose access as soon as this is off',
    'phone-link-off': 'Turn on the switch below to show the link',
    'phone-no-lan': "This computer isn't on a local network",
  },
};

let current = null;

// Decided on first use: a saved choice, else the browser's first language (spec §10).
export function lang() {
  if (!current) {
    const saved = localStorage.getItem('lang');
    const browser = navigator.languages?.[0] ?? navigator.language ?? '';
    current = saved === 'zh' || saved === 'en' ? saved : /^zh/i.test(browser) ? 'zh' : 'en';
    apply();
  }
  return current;
}

export function t(key, vars = {}) {
  const v = TEXT[lang()][key] ?? TEXT.zh[key];
  return typeof v === 'function' ? v(vars) : v;
}

export function setLang(code) {
  localStorage.setItem('lang', code);
  current = code;
  apply();
}

// The page, the Home Screen name, the CSS placeholder text and the server follow the language.
function apply() {
  const root = document.documentElement;
  root.lang = current === 'zh' ? 'zh-CN' : 'en';
  root.style.setProperty('--missing', JSON.stringify(TEXT[current]['image-missing']));
  document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content', TEXT[current].app);
  document.cookie = `lang=${current}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
```

- [ ] **Step 6: ui.js、phone.js 改用 t()**

`src/ui.js`：
- 第一行加 `import { t } from './i18n.js';`；
- `fullscreenTip` 整个换成：

```js
// iPhone browsers cannot go full screen; a Home Screen web app opens without browser bars (spec §9).
export const fullscreenTip = () => t(/MicroMessenger/i.test(navigator.userAgent) ? 'tip-wechat' : 'tip-iphone');
```

- `dialog` 的参数里 `ok = '确定'` 改成 `ok = t('ok')`；
- 模板里的 `data-act="cancel">取消</button>` 改成 `` data-act="cancel">${t('cancel')}</button> ``。

`src/phone.js`：
- 在 `import { icon, toast } from './ui.js';` 下面加 `import { t } from './i18n.js';`；
- `d.innerHTML = \`…\`;` 整段换成：

```js
  d.innerHTML = `
    <div class="mh"><h3>${t('phone-title')}</h3><button class="ibtn" type="button" data-act="close" aria-label="${t('close')}">${icon('close')}</button></div>
    <p class="dlg-text">${t('phone-help')}</p>
    <div class="qr"></div>
    <div class="ub"><code></code><button class="btn" type="button" data-act="copy">${icon('copy')}<span>${t('copy')}</span></button></div>
    <p class="note">${t('phone-note')}</p>
    <label class="tg"><span><b>${t('phone-allow')}</b><small>${t('phone-allow-help')}</small></span><input class="sw" type="checkbox"></label>
    <p class="err" hidden>${t('phone-no-lan')}</p>`;
```

- `'打开下面的开关后显示链接'` → `t('phone-link-off')`；
- `` toast(`操作失败：${err.message}`) `` → `toast(t('failed', { reason: err.message }))`；
- `toast('已复制')` → `toast(t('copied'))`；`toast('复制失败，请手动复制')` → `toast(t('copy-failed'))`；
- `` toast(`加载失败：${err.message}`) `` → `toast(t('load-failed', { reason: err.message }))`。

- [ ] **Step 7: wall.js 改用 t()**

在 `import { dialog, icon, toast } from './ui.js';` 下面加 `import { t } from './i18n.js';`，再逐处替换：

- `document.title = '相册';` → `` document.title = `${t('albums')} · ${t('app')}`; ``
- `<h1 class="brand"><span class="logo">${icon('book')}</span>相册</h1>` → `<h1 class="brand"><span class="logo">${icon('book')}</span>${t('albums')}</h1>`
- `<span>手机访问</span>` → `<span>${t('phone-access')}</span>`
- `aria-label="新建相册">${icon('plus')}<span>新建相册</span>` → `aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span>`
- `<p class="empty" hidden>还没有相册，点「新建相册」开始。</p>` → `<p class="empty" hidden>${t('no-albums')}</p>`
- `` toast(`加载失败：${err.message}`) `` → `toast(t('load-failed', { reason: err.message }))`
- `<p>${a.count} 张</p>` → `<p>${t('photos', { n: a.count })}</p>`
- `aria-label="更多"` → `aria-label="${t('more')}"`
- 菜单那一行 `'<div class="menu" role="menu"><button type="button" data-act="rename">重命名</button><button type="button" class="red" data-act="delete">删除相册</button></div>',` → `` `<div class="menu" role="menu"><button type="button" data-act="rename">${t('rename')}</button><button type="button" class="red" data-act="delete">${t('delete-album')}</button></div>`, ``
- `dialog({ title: '新建相册', value: '新相册', ok: '创建' })` → `dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') })`
- `dialog({ title: '重命名相册', value: a.title, ok: '保存' })` → `dialog({ title: t('rename-album'), value: a.title, ok: t('save') })`
- `` const text = `删除相册「${a.title}」？相册里的照片会一起删除，不能恢复。`; `` → `const text = t('delete-album-text', { name: a.title });`
- `dialog({ title: '删除相册', text, ok: '删除', danger: true })` → `dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })`
- `` toast(`操作失败：${err.message}`) `` → `toast(t('failed', { reason: err.message }))`

- [ ] **Step 8: album.js 改用 t()**

在 `import { dialog, icon, toast } from './ui.js';` 下面加 `import { t } from './i18n.js';`，再逐处替换：

- `<span>全部相册</span>` → `<span>${t('all-albums')}</span>`
- `title="点击改名"` → `title="${t('rename-hint')}"`
- `data-act="select">选择</button>` → `data-act="select">${t('select')}</button>`
- `<span>上传照片</span>` → `<span>${t('upload-photos')}</span>`
- 两处 `<span>3D 翻阅</span>` → `<span>${t('flip-3d')}</span>`
- `data-act="cancel">取消</button>` → `data-act="cancel">${t('cancel')}</button>`
- `${icon('trash')}<span>删除</span>` → `${icon('trash')}<span>${t('delete')}</span>`
- `<b>把照片拖到这里</b>` → `<b>${t('drop-here')}</b>`
- `<span>或 <button class="link" type="button" data-act="upload">点这里选择照片</button></span>` → `<span>${t('or')} <button class="link" type="button" data-act="upload">${t('choose-photos')}</button></span>`
- `<small>支持 JPG、PNG、HEIC、WebP</small>` → `<small>${t('formats')}</small>`
- `<span>上传</span>` → `<span>${t('upload')}</span>`
- `main.innerHTML = '<p class="empty">相册不存在。<a href="#/">回到全部相册</a></p>';` → `` main.innerHTML = `<p class="empty">${t('album-missing')}<a href="#/albums">${t('back-to-albums')}</a></p>`; ``
- `` toast(`加载失败：${err.message}`) `` → `toast(t('load-failed', { reason: err.message }))`
- `` (err) => toast(`保存失败：${err.message}`), `` → `(err) => toast(t('save-failed', { reason: err.message })),`
- `'<span class="badge">封面</span>'` → `` `<span class="badge">${t('cover')}</span>` ``
- `` $('.count').textContent = `${n} 张`; `` → `$('.count').textContent = t('photos', { n });`
- 两处 `` document.title = `${album.title} · 相册`; `` → `` document.title = `${album.title} · ${t('app')}`; ``
- `` $('.picked').textContent = `已选 ${selected.size} 张`; `` → `$('.picked').textContent = t('selected', { n: selected.size });`
- `` box.querySelector('b').textContent = `正在导入 ${i} / ${tally.total}`; `` → `box.querySelector('b').textContent = t('importing', { i, n: tally.total });`
- `` $('.count').textContent = `${album.photos.length} 张`; `` → `$('.count').textContent = t('photos', { n: album.photos.length });`
- 导入结束的汇总，从 `const why = …` 到 `` + (tally.fail ? `，失败 ${tally.fail} 张` : ''); `` 换成：

```js
    const why = [tally.dup && t('dup', { n: tally.dup }), tally.bad && t('bad', { n: tally.bad }), tally.big && t('big', { n: tally.big })]
      .filter(Boolean)
      .join(t('sep'));
    box.querySelector('b').textContent = t('import-done');
    box.querySelector('.r span').textContent = '';
    box.querySelector('.prog i').style.width = '100%';
    box.querySelector('small').textContent =
      t('imported', { n: tally.done }) + (skipped ? t('skipped', { n: skipped, why }) : '') + (tally.fail ? t('failed-n', { n: tally.fail }) : '');
```

- `` const text = `删除 ${selected.size} 张照片？删除后不能恢复。`; `` → `const text = t('delete-photos-text', { n: selected.size });`
- `dialog({ title: '删除照片', text, ok: '删除', danger: true })` → `dialog({ title: t('delete-photos'), text, ok: t('delete'), danger: true })`
- `dialog({ title: '重命名相册', value: album.title, ok: '保存' })` → `dialog({ title: t('rename-album'), value: album.title, ok: t('save') })`
- 两处 `` toast(`操作失败：${err.message}`) `` → `toast(t('failed', { reason: err.message }))`
- `` toast(err.status === 409 ? '照片有变化，已刷新' : `操作失败：${err.message}`); `` → `toast(err.status === 409 ? t('order-changed') : t('failed', { reason: err.message }));`

- [ ] **Step 9: lightbox.js、viewer.js 改用 t()**

`src/lightbox.js`：在 `import { dialog, icon, toast } from './ui.js';` 下面加 `import { t } from './i18n.js';`；`root.innerHTML` 里从 `<button class="lb-btn" type="button" data-act="cover">` 到结尾换成：

```js
      <button class="lb-btn" type="button" data-act="cover">${icon('star')}<span>${t('set-cover')}</span></button>
      <button class="lb-btn" type="button" data-act="original">${icon('expand')}<span>${t('original')}</span></button>
      <button class="lb-btn" type="button" data-act="delete">${icon('trash')}<span>${t('delete')}</span></button>
      <button class="ibtn" type="button" data-act="close" aria-label="${t('close')}">${icon('close')}</button>
    </header>
    <img class="lb-img" alt="">
    <button class="ibtn lb-nav l" type="button" data-act="prev" aria-label="${t('prev-photo')}">${icon('prev')}</button>
    <button class="ibtn lb-nav r" type="button" data-act="next" aria-label="${t('next-photo')}">${icon('next')}</button>`;
```

再替换：`toast('已设为封面')` → `toast(t('cover-set'))`；`const text = '删除这张照片？删除后不能恢复。';` → `const text = t('delete-photo-text');`；`dialog({ title: '删除照片', text, ok: '删除', danger: true })` → `dialog({ title: t('delete-photo'), text, ok: t('delete'), danger: true })`；`` toast(`操作失败：${err.message}`) `` → `toast(t('failed', { reason: err.message }))`。

`src/viewer.js`：
- 在 `import { fullscreenTip, icon, toast } from './ui.js';` 下面加 `import { t } from './i18n.js';`；
- 删掉 `const HINT_OPEN = …;` 和 `const HINT_CLOSED = …;` 两行；`const DENSITY = [[1, '每页 1 张'], [2, '宽松'], [3, '紧凑']];` 改成 `const DENSITY = [1, 2, 3];`；
- `root.innerHTML` 里从 `<button class="ab-icon" type="button" data-act="close"` 到结尾换成：

```js
      <button class="ab-icon" type="button" data-act="close" aria-label="${t('close')}">${icon('close')}</button>
      <h2 class="ab-title"></h2>
      <label class="ab-select"><span>${t('per-page')}</span><select>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
      <button class="ab-icon" type="button" data-act="fullscreen" aria-label="${t('fullscreen')}" aria-pressed="false">${icon('fullscreen')}</button>
      <button class="ab-icon" type="button" data-act="cover" aria-label="${t('close-book')}" aria-pressed="false">${icon('book')}</button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav" data-open>
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="${t('prev-page')}">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="${t('next-page')}">${icon('next')}</button>
      </div>
      <input class="ab-slider" type="range" min="1" step="1" aria-label="${t('jump-spread')}" hidden>
      <div class="ab-nav" data-closed hidden>
        <button class="ab-primary" type="button" data-act="cover">${icon('bookOpen')}${t('open-book')}</button>
      </div>
      <p class="ab-hint">${t('hint-open')}</p>
    </footer>
    <p class="ab-message" hidden>${t('no-webgl')}</p>
    <div class="ab-rotate">${icon('phone')}<p>${t('rotate')}</p></div>`;
```

- `toast('当前浏览器不能全屏')` → `toast(t('no-fullscreen'))`；
- `full.setAttribute('aria-label', on ? '退出全屏' : '全屏');` → `full.setAttribute('aria-label', t(on ? 'fullscreen-exit' : 'fullscreen'));`；
- `cover.setAttribute('aria-label', closed ? '打开相册' : '合上相册');` → `cover.setAttribute('aria-label', t(closed ? 'open-book' : 'close-book'));`；
- `$('.ab-hint').textContent = closed ? HINT_CLOSED : HINT_OPEN;` → `$('.ab-hint').textContent = t(closed ? 'hint-closed' : 'hint-open');`。

- [ ] **Step 10: main.js、style.css、index.html**

`src/main.js`：在 `import { start } from './router.js';` 前面加 `import { lang, t } from './i18n.js';`；在 `const app = document.querySelector('#app');` 前面加一行：

```js
lang(); // the cookie tells the server our language before the first request
```

并把微信提示里的 `aria-label="关闭"` 换成 `aria-label="${t('close')}"`。

`src/style.css`：两处 `content: '图片丢失';` 都换成 `content: var(--missing, '图片丢失');`。

`index.html`：`<title>相册</title>` → `<title>册页</title>`；`<meta name="apple-mobile-web-app-title" content="相册" />` → `<meta name="apple-mobile-web-app-title" content="册页" />`。

- [ ] **Step 11: 确认源码里不再有写死的中文**

Run: `grep -nP '\p{Han}' src/*.js | grep -v '^src/i18n.js'`
Expected: 没有输出。

- [ ] **Step 12: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-i18n.mjs && node /tmp/album-checks/check-pages.mjs && node /tmp/album-checks/check-lightbox.mjs && node /tmp/album-checks/check-viewer.mjs && node /tmp/album-checks/check-phone.mjs`
Expected: `i18n ok`、`pages ok`、`lightbox ok`、`viewer ok`、`phone ok`。

- [ ] **Step 13: 提交**

```bash
git add src/i18n.js src/ui.js src/phone.js src/wall.js src/album.js src/lightbox.js src/viewer.js src/main.js src/style.css index.html
git commit -m "feat: put all interface text in a Chinese and English table" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: 视觉基础、透明袋卡片、相册墙

**Files:**
- Create: `src/folder.js`、`public/geist-OFL.txt`
- Modify: `package.json`、`package-lock.json`（新字体包；`name` 改为 `folio`）、`src/main.js`（引入字体）、`src/wall.js`（整个文件换掉）、`src/style.css`
- Test: `/tmp/album-checks/check-pages.mjs`、`check-shots.mjs`、`check-phone.mjs`、`check-i18n.mjs`

**Interfaces:**
- Consumes: Task 1 的 `previews`；Task 2 的 `t()`。
- Produces：
  - `src/folder.js`：
    - `pocket(albumId, previews) → string`：透明袋内部的 HTML；
    - `folder(album, { menu }) → HTMLElement`：`<article class="folder" data-id>`；
    - `folderClick(event) → boolean`：点在卡片上（不在菜单上）就打开相册并返回 `true`。
  - CSS：
    - `.page`、`.ph`、`.t1`、`.sub`、`.sp`、`.empty`；
    - `.folders`、`.folder`、`.pocket`；
    - 变量 `--accent-soft`、`--card`，`--panel` 换成浮起阴影。
  - 相册墙：标题区 `.ph`（`h1.t1` 和统计 `.sub`）、卡片网格 `.folders`、空状态 `.empty`；「手机访问」按钮暂时留在标题区，Task 4 挪到导航栏。

- [ ] **Step 1: 改检查**

`/tmp/album-checks/check-pages.mjs`：

(a) 顶部的导入换成：

```js
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { makeFixtures, sharp } from './fixtures.mjs';
```

(b) 第一次打开页面的 `await b.goto(server.url);` 改成 `` await b.goto(`${server.url}#/albums`); ``。

(c) `// Back to the wall: card, menu, delete.` 这一节换成：

```js
// Back to the wall: a pocket with the photos; the whole card opens the album; menu; delete.
await b.click('[data-act=back]');
await b.waitFor(`document.querySelector('.folder h3')?.textContent === '京都 2024'`);
assert.equal(await b.evaluate(`document.querySelector('.folder .n').textContent`), '3');
assert.equal(await b.evaluate(`document.querySelector('.ph .sub').textContent`), '1 本相册 · 3 张照片');
assert.equal(await b.evaluate(`document.querySelectorAll('.folder .pocket img').length`), 3);
await b.click('.folder h3');
await b.waitFor(`location.hash.startsWith('#/a/') && document.querySelector('.title')?.textContent === '京都 2024'`);
await b.click('[data-act=back]');
await b.waitFor(`!!document.querySelector('.folder [data-act=menu]')`);
await b.click('.folder [data-act=menu]');
await b.click('.menu [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-text')?.textContent === '删除相册「京都 2024」？相册里的照片会一起删除，不能恢复。'`);
await b.click('dialog[open] [value=ok]');
await b.waitFor(`document.querySelectorAll('.folder').length === 0 && !document.querySelector('.empty').hidden`);
assert.equal(await b.evaluate(`document.querySelector('.ph .sub').hidden`), true);
```

(d) 手机那一节里：`await m.goto(server.url);` 改成 `` await m.goto(`${server.url}#/albums`); ``；`document.querySelectorAll('.album').length === 1` 改成 `document.querySelectorAll('.folder').length === 1`；`document.querySelector('.wall')` 改成 `document.querySelector('.folders')`。

(e) 在最后的 `await server.close();` 前面插入：

```js
// Review focus «long name» and «lost photo»: a 50-character name is cut with an ellipsis, cards keep
// one width, and a photo that cannot be read leaves a blank card instead of a broken image.
const long = await api('/api/albums', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '很长的相册名字'.repeat(8).slice(0, 50) }),
});
for (const f of [fx.land, fx.square]) {
  await api(`/api/albums/${long.id}/photos?name=x.jpg`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(f) });
}
for (const f of ['originals/p001.jpg', 'cache/p001_600.webp', 'cache/p001_1600.webp']) rmSync(`${dir}/albums/${long.id}/${f}`, { force: true });
const card = `.folder[data-id="${long.id}"]`;
const d = await launch();
await d.goto(`${server.url}#/albums`);
await d.waitFor(`document.querySelectorAll('.folder').length === 2`);
await d.waitFor(`document.querySelectorAll('${card} .pocket .ghost').length === 2`);
assert.equal(await d.evaluate(`document.querySelectorAll('${card} .pocket img').length`), 1);
assert.ok(await d.evaluate(`(() => { const h = document.querySelector('${card} h3'); return h.scrollWidth > h.clientWidth; })()`));
assert.equal(await d.evaluate(`new Set([...document.querySelectorAll('.folder')].map((f) => Math.round(f.getBoundingClientRect().width))).size`), 1);
assert.deepEqual(d.errors, []);
await d.close();

// Review focus «many albums»: with 100 albums the wall does not fetch every thumbnail at once.
const many = '/tmp/album-checks/lib-pages-many';
rmSync(many, { recursive: true, force: true });
mkdirSync(many, { recursive: true });
const thumb = `${many}/thumb.webp`;
await sharp({ create: { width: 600, height: 450, channels: 3, background: '#2f6a8a' } }).webp().toFile(thumb);
for (let i = 0; i < 100; i++) {
  const id = randomUUID();
  const adir = `${many}/albums/${id}`;
  mkdirSync(`${adir}/originals`, { recursive: true });
  mkdirSync(`${adir}/cache`, { recursive: true });
  linkSync(thumb, `${adir}/cache/p001_600.webp`);
  const photos = [{ id: 'p001', file: 'p001.jpg', name: 'a.jpg', w: 1600, h: 1200, sha256: String(i) }];
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
  writeFileSync(`${adir}/album.json`, JSON.stringify({ version: 1, id, title: `A${i}`, createdAt, cover: null, perPage: 2, nextSeq: 2, photos }));
}
const server2 = await startServer({ dir: many, port: 0, dist: `${process.cwd()}/dist` });
const w = await launch();
await w.goto(`${server2.url}#/albums`);
await w.waitFor(`document.querySelectorAll('.folder').length === 100`);
await sleep(1500);
const fetched = await w.evaluate(`performance.getEntriesByType('resource').filter((r) => r.name.includes('/media/')).length`);
assert.ok(fetched > 0 && fetched < 100, `fetched ${fetched} thumbnails`);
assert.deepEqual(w.errors, []);
await w.close();
await server2.close();
```

`/tmp/album-checks/check-shots.mjs`：
- 第一处 `await b.goto(server.url);` 改成 `` await b.goto(`${server.url}#/albums`); ``，下一行的 `` `document.querySelectorAll('.album .cover img').length === 3` `` 改成 `` `document.querySelectorAll('.folder .pocket img').length === 9` ``；
- 打开手机访问弹窗前的 `await b.goto(server.url);` 改成 `` await b.goto(`${server.url}#/albums`); ``；
- 手机那段的 `await m.goto(server.url);` 改成 `` await m.goto(`${server.url}#/albums`); ``，`` `document.querySelectorAll('.album').length === 3` `` 改成 `` `document.querySelectorAll('.folder').length === 3` ``。

`/tmp/album-checks/check-phone.mjs`：两处 `document.querySelector('.wall')` 改成 `document.querySelector('.folders')`。

`/tmp/album-checks/check-i18n.mjs`：选择器里的 `.album` 全部改成 `.folder`：

```bash
sed -i '' "s/'\.album/'.folder/g" /tmp/album-checks/check-i18n.mjs && grep -c "'\.folder" /tmp/album-checks/check-i18n.mjs
```

Expected: 输出 `6`（五处 `.folder').length === 2` 和一处 `.folder [data-act=menu]`）。

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-pages.mjs`
Expected: FAIL，`timed out: document.querySelector('.folder h3')?.textContent === '京都 2024'`。

- [ ] **Step 3: 字体包、许可证、包名**

```bash
npm install @fontsource-variable/geist@^5.3.0
mkdir -p public && cp node_modules/@fontsource-variable/geist/LICENSE public/geist-OFL.txt
```

Expected: `added 1 package`，没有 `npm ERR!`。再把 `package.json` 的 `"name": "photo-album"` 改成 `"name": "folio"`。

`src/main.js` 第一行（`import './style.css';` 前面）加：

```js
import '@fontsource-variable/geist';
```

- [ ] **Step 4: 写 src/folder.js**

```js
import { mediaUrl } from './api.js';
import { t } from './i18n.js';
import { open } from './router.js';
import { icon } from './ui.js';

// The see-through pocket (spec §7): up to three photos peek out, the cover in front; blank cards fill
// the empty slots. Thumbnails load lazily, so a big library does not fetch them all at once.
export function pocket(albumId, previews) {
  const pics = previews.map((p) => `<img alt="" loading="lazy" draggable="false" src="${mediaUrl(albumId, p.id, 600)}">`).reverse();
  while (pics.length < 3) pics.unshift('<i class="ghost"></i>');
  return `<span class="back"></span>${pics.join('')}<span class="front"></span><span class="notch"></span>`;
}

export function folder(a, { menu = false } = {}) {
  const el = document.createElement('article');
  el.className = 'folder';
  el.dataset.id = a.id;
  el.innerHTML = `
    <a class="pocket" href="#/a/${a.id}">${pocket(a.id, a.previews)}</a>
    <div class="meta"><h3></h3><span class="n">${a.count}</span>${
      menu ? `<button class="ibtn" type="button" data-act="menu" aria-label="${t('more')}">${icon('more')}</button>` : ''
    }</div>`;
  el.querySelector('h3').textContent = a.title;
  el.querySelector('.pocket').setAttribute('aria-label', a.title);
  // A photo that cannot be read becomes a blank card, not a broken image.
  for (const img of el.querySelectorAll('.pocket img')) {
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('i'), { className: 'ghost' }));
  }
  return el;
}

// A click anywhere on a card, except on its menu, opens the album.
export function folderClick(e) {
  const card = e.target.closest('.folder');
  if (!card || e.target.closest('[data-act=menu], .menu')) return false;
  e.preventDefault();
  open(`#/a/${card.dataset.id}`);
  return true;
}
```

- [ ] **Step 5: 换掉 src/wall.js**

```js
import { api } from './api.js';
import { folder, folderClick, pocket } from './folder.js';
import { t } from './i18n.js';
import { openPhoneDialog } from './phone.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';

// Phone access is set up on the computer only (spec §12).
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function renderWall(app) {
  let alive = true;
  let albums = [];
  document.title = `${t('albums')} · ${t('app')}`;
  app.innerHTML = `
    <main class="page">
      <header class="ph">
        <div><h1 class="t1">${t('albums')}</h1><p class="sub" hidden></p></div>
        <span class="sp"></span>
        ${local ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
        <button class="btn pri" type="button" data-act="new" aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span></button>
      </header>
      <div class="folders"></div>
      <div class="empty" hidden>
        <div class="pocket">${pocket('', [])}</div>
        <p>${t('no-albums')}</p>
        <button class="btn pri" type="button" data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
      </div>
    </main>`;
  const wall = app.querySelector('.folders');
  const sub = app.querySelector('.sub');

  async function load() {
    try {
      const list = await api.albums();
      if (!alive) return;
      albums = list;
      wall.replaceChildren(...albums.map((a) => folder(a, { menu: true })));
      sub.textContent = t('stats', { a: albums.length, p: albums.reduce((n, a) => n + a.count, 0) });
      sub.hidden = albums.length === 0;
      app.querySelector('.empty').hidden = albums.length > 0;
    } catch (err) {
      if (alive) toast(t('load-failed', { reason: err.message }));
    }
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    const a = albums.find((x) => x.id === e.target.closest('.folder')?.dataset.id);
    if (act !== 'menu') closeMenu();
    if (!act && folderClick(e)) return;
    try {
      if (act === 'menu') {
        const shown = target.parentElement.querySelector('.menu');
        closeMenu();
        if (!shown) {
          target.insertAdjacentHTML(
            'afterend',
            `<div class="menu" role="menu"><button type="button" data-act="rename">${t('rename')}</button><button type="button" class="red" data-act="delete">${t('delete-album')}</button></div>`,
          );
        }
      } else if (act === 'phone') {
        openPhoneDialog();
      } else if (act === 'new') {
        const title = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
        if (title) open(`#/a/${(await api.createAlbum(title)).id}`);
      } else if (act === 'rename') {
        const title = await dialog({ title: t('rename-album'), value: a.title, ok: t('save') });
        if (title && title !== a.title) await api.updateAlbum(a.id, { title });
        load();
      } else if (act === 'delete') {
        const text = t('delete-album-text', { name: a.title });
        if (await dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })) await api.deleteAlbum(a.id);
        load();
      }
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
  }

  const onFocus = () => load();
  app.addEventListener('click', onClick);
  window.addEventListener('focus', onFocus);
  load();
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', onFocus);
    },
  };
}
```

- [ ] **Step 6: 样式：视觉基础**

`src/style.css` 里，从文件开头到 `/* Album wall */` 这一行之前（不含这一行）整段换成：

```css
:root {
  --bg: #f7f9fb;
  --raised: #fff;
  --ink: oklch(23.5% 0.02 255);
  --ink-2: oklch(46.5% 0.022 248);
  --ink-3: oklch(52.5% 0.016 248);
  --line: oklch(92.2% 0.007 245);
  --hover: oklch(95.5% 0.007 242);
  --accent: #1d5f80;
  --accent-hover: oklch(40.5% 0.085 240);
  --accent-soft: oklch(95.2% 0.018 237);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --font: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI',
    'Noto Sans CJK SC', system-ui, sans-serif;
  --danger: #b42318;
  /* Floating layers (menus, upload progress, dialogs) and cards, as on cardart.cc */
  --panel: 0 0 0 1px oklch(23.5% 0.02 255 / 0.06), 0 8px 24px oklch(23.5% 0.02 255 / 0.08),
    0 32px 64px -16px oklch(23.5% 0.02 255 / 0.22);
  --card: 0 0 0 1px oklch(23.5% 0.02 255 / 0.05), 0 2px 6px oklch(23.5% 0.02 255 / 0.04),
    0 14px 32px -12px oklch(23.5% 0.02 255 / 0.16);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/24px var(--font);
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  color: inherit;
}

/* Buttons: pills, as on cardart.cc */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--line), 0 1px 2px oklch(23.5% 0.02 255 / 0.04);
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.btn svg {
  width: 17px;
  height: 17px;
  color: var(--ink-2);
}

.btn:not(:disabled):hover {
  background: var(--hover);
}

.btn.pri {
  background: var(--accent);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px oklch(23.5% 0.02 255 / 0.14);
  color: oklch(99% 0.004 240);
}

.btn.pri svg,
.btn.danger svg {
  color: inherit;
}

.btn.pri:not(:disabled):hover {
  background: var(--accent-hover);
}

.btn.ghost {
  padding: 0 12px;
  background: none;
  box-shadow: none;
  color: var(--ink-2);
}

.btn.danger {
  color: var(--danger);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ibtn {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}

.ibtn svg {
  width: 18px;
  height: 18px;
}

.ibtn:not(:disabled):hover {
  background: var(--hover);
}

:is(.btn, .ibtn, .tile, .pocket, .link, .title):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Album page frame */
.mgr {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 max(env(safe-area-inset-right, 0px), 32px) 48px max(env(safe-area-inset-left, 0px), 32px);
}

.bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--bg);
}

/* Page frame and header */
.page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px max(env(safe-area-inset-right, 0px), 40px) 64px max(env(safe-area-inset-left, 0px), 40px);
}

.ph {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 28px;
}

.sp {
  flex: 1;
}

.t1 {
  margin: 0;
  font-size: 28px;
  line-height: 34px;
  font-weight: 600;
}

.sub {
  margin: 6px 0 0;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 20px;
}

.empty {
  display: grid;
  justify-items: center;
  gap: 14px;
  margin: 72px 0;
  color: var(--ink-2);
  text-align: center;
}

.empty .pocket {
  width: 240px;
}

.empty p {
  margin: 0;
}

@media (max-width: 600px) {
  .page {
    padding: 24px max(env(safe-area-inset-right, 0px), 14px) 120px max(env(safe-area-inset-left, 0px), 14px);
  }

  .ph {
    margin-bottom: 18px;
  }

  .t1 {
    font-size: 24px;
    line-height: 30px;
  }

  .ph .btn span {
    display: none;
  }

  .ph .btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
}

```

- [ ] **Step 7: 样式：透明袋卡片**

从 `/* Album wall */` 这一行起，到 `/* Album page */` 这一行之前，整段换成：

```css
/* Album folders (home page and wall): see-through pockets, as on cardart.cc */
.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 40px 24px;
}

.folder {
  position: relative;
  min-width: 0;
  cursor: pointer;
}

.pocket {
  position: relative;
  display: block;
  aspect-ratio: 253 / 212;
  border-radius: 16px;
}

.pocket .back {
  position: absolute;
  left: 1.2%;
  right: 1.2%;
  top: 41%;
  bottom: 0;
  border-radius: 14px 14px 16px 16px;
  background: linear-gradient(#eaeff4, #e0e6ec);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.85), inset 0 0 0 1px oklch(23.5% 0.02 255 / 0.09),
    0 14px 26px -12px oklch(23.5% 0.02 255 / 0.3);
}

.pocket img,
.pocket .ghost {
  position: absolute;
  width: 81%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border: 5px solid #fff;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 0.4px 1px oklch(23.5% 0.02 255 / 0.12), 0 3.5px 7.6px -3px oklch(23.5% 0.02 255 / 0.32);
  transition: transform 0.45s var(--ease-out);
}

.pocket .ghost {
  border: 0;
  background: oklch(93.5% 0.018 230);
  box-shadow: inset 0 0 0 1px oklch(23.5% 0.02 255 / 0.05);
}

.pocket > :nth-child(2) {
  left: 6%;
  top: 3%;
  transform: rotate(-3deg);
}

.pocket > :nth-child(3) {
  left: 13%;
  top: 12%;
  transform: rotate(2.5deg);
}

.pocket > :nth-child(4) {
  left: 9.5%;
  top: 22%;
  transform: rotate(-1deg);
}

.pocket .front {
  position: absolute;
  left: 0;
  right: 0;
  top: 45%;
  bottom: 0;
  border-radius: 16px;
  background: linear-gradient(rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.82));
  -webkit-backdrop-filter: blur(8px) saturate(1.3);
  backdrop-filter: blur(8px) saturate(1.3);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.95), inset 0 0 0 1px oklch(23.5% 0.02 255 / 0.07);
  /* the half-round notch in the middle of the front edge */
  -webkit-mask: radial-gradient(circle at 50% 0, transparent 15px, #000 15.5px);
  mask: radial-gradient(circle at 50% 0, transparent 15px, #000 15.5px);
}

.pocket .notch {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 32px;
  height: 16px;
  margin-left: -16px;
  border: 1px solid rgb(255 255 255 / 0.95);
  border-top: 0;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 1px 0 oklch(23.5% 0.02 255 / 0.06);
}

/* The photos slide up a little on hover; never with reduced motion. */
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .folder:hover .pocket > :nth-child(2) {
    transform: translateY(-12px) rotate(-5deg);
  }

  .folder:hover .pocket > :nth-child(3) {
    transform: translateY(-9px) rotate(4deg);
  }

  .folder:hover .pocket > :nth-child(4) {
    transform: translateY(-6px) rotate(-1.5deg);
  }
}

.folder .meta {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  margin-top: 12px;
}

.folder h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  font-weight: 550;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.folder .n {
  color: var(--ink-3);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.folder .ibtn {
  width: 26px;
  height: 26px;
  margin-right: -4px;
}

@media (hover: hover) {
  .folder .ibtn {
    opacity: 0;
  }

  .folder:hover .ibtn,
  .folder:focus-within .ibtn,
  .folder:has(.menu) .ibtn {
    opacity: 1;
  }
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: -4px;
  z-index: 6;
  display: grid;
  min-width: 150px;
  padding: 6px;
  border-radius: 12px;
  background: var(--raised);
  box-shadow: var(--panel);
}

.menu button {
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}

.menu button:hover {
  background: var(--hover);
}

.menu .red {
  color: var(--danger);
}

@media (max-width: 600px) {
  .folders {
    grid-template-columns: repeat(2, 1fr);
    gap: 26px 14px;
  }
}

```

- [ ] **Step 8: 样式：浮层和提示**

在 `src/style.css` 其余部分：

- 手机那一段（`/* Phones: two-column wall, three-column grid, floating buttons */` 下面）里删掉这条规则：

```css
  .wall {
    grid-template-columns: repeat(2, 1fr);
    gap: 22px 14px;
  }
```

- `.upload {` 规则（`right: 24px;` 那条）末尾加 `font-size: 14px;` 和 `line-height: 20px;`；
- `.toast {` 规则换成深色胶囊：

```css
.toast {
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  translate: -50%;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 14px;
  line-height: 20px;
}
```

- `.dlg {` 规则末尾加 `font-size: 14px;` 和 `line-height: 20px;`；
- `.lb {` 规则末尾加 `font-size: 14px;` 和 `line-height: 20px;`；
- 在 `.lb .ibtn {` 规则前面加（大图顶栏的关闭按钮保持 36px，左右翻页按钮仍是 48px）：

```css
.lb-bar .ibtn {
  width: 36px;
  height: 36px;
}
```

- [ ] **Step 9: 运行，确认通过，看截图**

Run: `npm run build && node /tmp/album-checks/check-pages.mjs && node /tmp/album-checks/check-phone.mjs && node /tmp/album-checks/check-i18n.mjs && node /tmp/album-checks/check-lightbox.mjs && node /tmp/album-checks/check-shots.mjs`
Expected: `pages ok`、`phone ok`、`i18n ok`、`lightbox ok`、`shots in /tmp/album-shots`。

再打开 `/tmp/album-shots/wall.png` 和 `/tmp/album-shots/phone-wall.png`，和 `docs/superpowers/mockups/2026-10-27-folio-redesign/albums.html` 上半部分对照：透明袋、三张照片露出、缺口、标题和数字、电脑 5 列 / 手机 2 列。

- [ ] **Step 10: 提交**

```bash
git add package.json package-lock.json public/geist-OFL.txt src/main.js src/folder.js src/wall.js src/style.css
git commit -m "feat: restyle buttons and show albums as see-through pockets" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: 导航栏、路由和主页

**Files:**
- Create: `src/nav.js`、`src/home.js`、`src/assets/home-book.mp4`、`src/assets/home-book.jpg`
- Modify: `src/main.js`（整个文件换掉）、`src/router.js`、`src/phone.js`、`src/wall.js`、`src/album.js`、`src/ui.js`、`src/style.css`
- Test: `/tmp/album-checks/check-home.mjs`（新）、`check-i18n.mjs`、`check-phone.mjs`、`check-shots.mjs`

**Interfaces:**
- Consumes：
  - Task 2：`lang()`、`t()`、`setLang()`；
  - Task 3：`folder()`、`folderClick()` 和 `.folders`、`.btn`、`.sp` 等样式。
- Produces：
  - `router.parse(hash) → { page: 'home' | 'albums' | 'album', album, three, photo }`；
  - `createNav(onLang) → { el, update(page) }`：`page` 是 `'home'` 或 `'albums'`；切换语言后调用 `onLang()`；
  - `renderHome(app) → { destroy() }`；
  - `phone.js` 导出 `onComputer`（这台电脑上打开时为 `true`）；
  - 导入照片期间 `<html>` 带 `data-busy` 属性，语言按钮不起作用。

- [ ] **Step 1: 写 check-home**

新建 `/tmp/album-checks/check-home.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-home.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { makeFixtures } from './fixtures.mjs';

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-home';
rmSync(dir, { recursive: true, force: true });
const fx = await makeFixtures();
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const base = server.url.replace(/\/$/, '');
const api = (path, init) => fetch(base + path, init).then((r) => r.json());
const video = `document.querySelector('video.home-book')`;

// No albums yet: no numbers and no recent albums; the video plays, loops and answers byte ranges.
const b = await launch();
await b.goto(server.url);
await b.waitFor(`!!document.querySelector('.home .h1')`);
assert.equal(await b.evaluate(`document.querySelector('.home .h1').textContent`), '把照片装进一本能翻的相册');
assert.equal(await b.evaluate('document.title'), '册页');
assert.equal(await b.evaluate(`document.querySelector('.nl[aria-current=page]').getAttribute('href')`), '#/');
await sleep(500);
assert.equal(await b.evaluate(`document.querySelector('.eyebrow .stats').hidden`), true);
assert.equal(await b.evaluate(`document.querySelector('.recent').hidden`), true);
await b.waitFor(`!${video}.paused && ${video}.currentTime > 0.3`, 15000);
assert.deepEqual(await b.evaluate(`[${video}.muted, ${video}.loop, ${video}.playsInline]`), [true, true, true]);
assert.equal(await b.evaluate(`fetch(${video}.currentSrc, { headers: { Range: 'bytes=0-99' } }).then((r) => r.status)`), 206);

// Five albums: the numbers, and the four newest as pockets (blank cards where photos are missing).
const made = [];
for (const [title, files] of [['一', [fx.land, fx.tall, fx.square]], ['二', [fx.rotated]], ['三', []], ['四', [fx.dot, fx.heic]], ['五', [fx.land, fx.tall, fx.square, fx.rotated]]]) {
  const a = await api('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  for (const f of files) await api(`/api/albums/${a.id}/photos?name=x.jpg`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(f) });
  made.push(a);
  await sleep(5);
}
await b.evaluate('location.reload()');
await b.waitFor(`document.querySelector('.recent')?.hidden === false`);
assert.equal(await b.evaluate(`document.querySelector('.eyebrow .stats').textContent`), '5 本相册 · 10 张照片');
assert.deepEqual(await b.evaluate(`[...document.querySelectorAll('.recent .folder h3')].map((h) => h.textContent)`), ['五', '四', '三', '二']);
assert.deepEqual(
  await b.evaluate(`[...document.querySelectorAll('.recent .folder')].map((f) => [f.querySelectorAll('.pocket img').length, f.querySelectorAll('.pocket .ghost').length])`),
  [[3, 0], [2, 1], [0, 3], [1, 2]],
);

// Cards, «全部相册 →», «打开相册» and the logo lead on; the nav marks where we are.
await b.click('.recent .folder:nth-child(2) h3');
await b.waitFor(`location.hash === '#/a/${made[3].id}' && !!document.querySelector('.grid')`);
assert.equal(await b.evaluate(`document.querySelector('.nl[aria-current=page]').getAttribute('href')`), '#/albums');
await b.evaluate('history.back()');
await b.waitFor(`!!document.querySelector('.home .more')`);
await b.click('.home .more');
await b.waitFor(`location.hash === '#/albums' && document.querySelectorAll('.folders .folder').length === 5`);
await b.click('.logo');
await b.waitFor(`location.hash === '#/' && !!document.querySelector('.home .cta.dark')`);
await b.click('.home .cta.dark');
await b.waitFor(`location.hash === '#/albums'`);
await b.click('.nl[href="#/"]');
await b.waitFor(`!!document.querySelector('.home [data-act=phone]')`);
await b.click('.home [data-act=phone]');
await b.waitFor(`document.querySelector('dialog[open] h3')?.textContent === '用手机看相册'`);
await b.click('dialog[open] [data-act=close]');
// An address the app does not know shows the home page.
await b.goto(`${server.url}#/nope`);
await b.waitFor(`!!document.querySelector('.home')`);
assert.deepEqual(b.errors, []);
await b.close();

// Reduced motion: the still picture only; the video is never fetched.
const still = await launch();
await still.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await still.goto(server.url);
await still.waitFor(`document.querySelector('img.home-book')?.complete && document.querySelector('img.home-book').naturalWidth > 0`);
assert.equal(await still.evaluate(`!!document.querySelector('video')`), false);
assert.equal(await still.evaluate(`performance.getEntriesByType('resource').some((r) => r.name.includes('.mp4'))`), false);
await still.close();

// Phone: one column of features, two of albums, no numbers, no phone buttons, nothing scrolls sideways.
const m = await launch({ width: 390, height: 844, mobile: true });
await m.goto(server.url);
await m.waitFor(`document.querySelector('.recent')?.hidden === false`);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.eyebrow .stats')).display`), 'none');
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.feats')).gridTemplateColumns.split(' ').length`), 1);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.recent .folders')).gridTemplateColumns.split(' ').length`), 2);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.home .cta.text')).display`), 'none');
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.nav [data-act=phone]')).display`), 'none');
assert.ok(await m.evaluate('document.documentElement.scrollWidth <= innerWidth'));
assert.deepEqual(m.errors, []);
await m.close();
await server.close();
console.log('home ok');
```

- [ ] **Step 2: 改其他检查**

`/tmp/album-checks/check-i18n.mjs`：
- 导入改成 `import { launch, sleep } from './cdp.mjs';`；
- 英文浏览器那一段开头的

```js
const b = await launch({ lang: 'en-US' });
await b.goto(`${server.url}#/albums`);
```

换成

```js
const b = await launch({ lang: 'en-US' });
await b.goto(server.url);
await b.waitFor(`document.querySelector('.recent')?.hidden === false`);
assert.equal(await b.evaluate('document.title'), 'Folio');
await english(b, 'home');
await b.goto(`${server.url}#/albums`);
```

- 在 `// Review focus «other languages»` 前面插入：

```js
// The switch in the bar: the page is rebuilt in place, the choice is kept, and it waits while photos import.
const s = await launch();
await s.goto(`${server.url}#/a/${album.id}`);
await s.waitFor(`document.querySelectorAll('.grid .tile').length >= 2`);
assert.equal(await s.evaluate(`document.querySelector('.lang [aria-pressed=true]').dataset.lang`), 'zh');
await s.evaluate('window.stillHere = true');
await s.click('.lang [data-lang=en]');
await s.waitFor(`document.documentElement.lang === 'en' && document.querySelector('.lang [aria-pressed=true]').dataset.lang === 'en'`);
assert.equal(await s.evaluate('window.stillHere'), true); // no reload
await s.waitFor(`document.querySelectorAll('.grid .tile').length >= 2`);
await english(s, 'album page after switching');
await s.evaluate('location.reload()');
await s.waitFor(`document.querySelectorAll('.grid .tile').length >= 2`);
assert.equal(await s.evaluate('document.documentElement.lang'), 'en');
await s.evaluate(`(() => {
  const f = window.fetch;
  window.fetch = (u, o) => (String(u).includes('/photos?') ? new Promise((ok) => setTimeout(ok, 800)).then(() => f(u, o)) : f(u, o));
})()`);
await s.files('input[type=file]', [fx.rotated, fx.heic]);
await s.waitFor(`document.documentElement.hasAttribute('data-busy')`);
await s.click('.lang [data-lang=zh]');
await sleep(300);
assert.equal(await s.evaluate('document.documentElement.lang'), 'en');
await s.waitFor(`!document.documentElement.hasAttribute('data-busy')`, 60000);
await s.click('.lang [data-lang=zh]');
await s.waitFor(`document.documentElement.lang === 'zh-CN'`);
assert.equal(await s.evaluate(`document.querySelector('.nl[href="#/albums"]').textContent`), '相册');
assert.deepEqual(s.errors, []);
await s.close();
```

`/tmp/album-checks/check-phone.mjs`（手机扫码后看到的是主页）：
- `` await m.waitFor(`location.pathname === '/' && !!document.querySelector('.folders')`); `` → `` await m.waitFor(`location.pathname === '/' && !!document.querySelector('.home')`); ``
- `await fresh.waitFor("!!document.querySelector('.folders')");` → `await fresh.waitFor("!!document.querySelector('.home')");`

`/tmp/album-checks/check-shots.mjs`：
- 在 `const b = await launch();` 下面插入：

```js
await b.goto(server.url);
await shoot(b, 'home', `document.querySelector('.recent')?.hidden === false && !document.querySelector('video.home-book').paused`);
```

- 在 `const m = await launch({ width: 390, height: 844, mobile: true });` 下面插入：

```js
await m.goto(server.url);
await shoot(m, 'phone-home', `document.querySelector('.recent')?.hidden === false`);
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-home.mjs`
Expected: FAIL，`timed out: !!document.querySelector('.home .h1')`。

- [ ] **Step 4: 视频和封面图**

```bash
mkdir -p src/assets
cp docs/superpowers/mockups/2026-10-27-folio-redesign/book-hero.mp4 src/assets/home-book.mp4
cp docs/superpowers/mockups/2026-10-27-folio-redesign/book-hero-poster.jpg src/assets/home-book.jpg
```

- [ ] **Step 5: 路由、手机访问、图标**

`src/router.js` 里，开头的注释和 `parse` 换成：

```js
// Hash routes (spec §5): #/ home · #/albums · #/a/<id> · #/a/<id>/p/<photo> · #/a/<id>/3d · #/a/<id>/3d/p/<photo>
let listener = () => {};

// Anything the app does not know shows the home page.
export function parse(hash) {
  const m = /^#\/a\/([0-9a-f-]{36})(\/3d)?(?:\/p\/(p\d{3,}))?$/.exec(hash);
  if (m) return { page: 'album', album: m[1], three: !!m[2], photo: m[3] ?? null };
  return { page: hash === '#/albums' ? 'albums' : 'home', album: null, three: false, photo: null };
}
```

`src/phone.js` 里，在 import 下面加：

```js
// Phone access is set up on the computer only (spec §12).
export const onComputer = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
```

`src/ui.js` 的 `PATHS` 里，`fullscreenExit` 那一行后面加：

```js
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/>',
  layout: '<rect x="4" y="4" width="9" height="7" rx="1.2"/><rect x="15" y="4" width="5" height="16" rx="1.2"/><rect x="4" y="13" width="9" height="7" rx="1.2"/>',
```

- [ ] **Step 6: 写 src/nav.js**

```js
import { lang, setLang, t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { icon } from './ui.js';

// The bar on top of every page (spec §5). `onLang` re-opens the current page in the new language.
export function createNav(onLang) {
  const el = document.createElement('nav');
  el.className = 'nav';
  let page = 'home';

  function render() {
    el.setAttribute('aria-label', t('app'));
    el.innerHTML = `
      <a class="logo" href="#/"><i>${icon('book')}</i><span>${t('app')}</span></a>
      <a class="nl" href="#/" data-page="home">${t('home')}</a>
      <a class="nl" href="#/albums" data-page="albums">${t('albums')}</a>
      <span class="sp"></span>
      ${onComputer ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
      <span class="lang" role="group" aria-label="${t('language')}"><button type="button" data-lang="zh" lang="zh-CN">中</button><button type="button" data-lang="en" lang="en">EN</button></span>`;
    update(page);
  }

  function update(next) {
    page = next;
    for (const a of el.querySelectorAll('.nl')) {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    for (const b of el.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=phone]')) return openPhoneDialog();
    const next = e.target.closest('[data-lang]')?.dataset.lang;
    // While photos import, the page must not be rebuilt: the rest of the queue would be lost (spec §10).
    if (!next || next === lang() || document.documentElement.hasAttribute('data-busy')) return;
    setLang(next);
    render();
    onLang();
  });
  render();
  return { el, update };
}
```

- [ ] **Step 7: 写 src/home.js**

```js
import posterUrl from './assets/home-book.jpg';
import videoUrl from './assets/home-book.mp4';
import { api } from './api.js';
import { folder, folderClick } from './folder.js';
import { t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { icon, toast } from './ui.js';

const still = matchMedia('(prefers-reduced-motion: reduce)');
const FEATURES = [['laptop', 'f1'], ['bookOpen', 'f2'], ['layout', 'f3'], ['phone', 'f4']];

// The home page (spec §6): what the app is for, the recorded book, and the newest albums.
export function renderHome(app) {
  let alive = true;
  document.title = t('app');
  // The title's line break is for phones only; on wider screens CSS hides it.
  const title = t('hero-title').replace('\n', '<br>');
  app.innerHTML = `
    <main class="home">
      <section class="hero">
        <p class="eyebrow"><span class="dot"></span><b>${t('local-albums')}</b><span>·</span><span>${t('no-upload')}</span><span class="stats" hidden><span class="rule"></span><span class="n"></span></span></p>
        <h1 class="h1">${title}</h1>
        <p class="lead">${t('hero-lead')}</p>
        <div class="ctas">
          <a class="cta dark" href="#/albums">${t('open-albums')}${icon('arrow')}</a>
          ${onComputer ? `<button class="cta text" type="button" data-act="phone">${t('view-on-phone')}</button>` : ''}
        </div>
        ${
          still.matches
            ? `<img class="home-book" alt="" src="${posterUrl}">`
            : `<video class="home-book" src="${videoUrl}" poster="${posterUrl}" muted loop playsinline autoplay aria-hidden="true"></video>`
        }
      </section>
      <section class="sec">
        <h2>${t('what-it-does')}</h2>
        <div class="feats">${FEATURES.map(([ic, k]) => `<div class="feat"><span class="ic">${icon(ic)}</span><h3>${t(`${k}-title`)}</h3><p>${t(`${k}-text`)}</p></div>`).join('')}</div>
      </section>
      <section class="sec recent" hidden>
        <div class="sec-h"><h2>${t('recent')}</h2><a class="more" href="#/albums">${t('all-albums')} →</a></div>
        <div class="folders"></div>
      </section>
      <footer class="sec"><div class="foot"><span class="logo"><i>${icon('book')}</i>${t('app')}</span><span>${t('footer')}</span></div></footer>
    </main>`;
  app.querySelector('video')?.play().catch(() => {});

  api.albums().then(
    (list) => {
      if (!alive || !list.length) return;
      app.querySelector('.stats .n').textContent = t('stats', { a: list.length, p: list.reduce((n, a) => n + a.count, 0) });
      app.querySelector('.stats').hidden = false;
      app.querySelector('.recent .folders').replaceChildren(...list.slice(0, 4).map((a) => folder(a)));
      app.querySelector('.recent').hidden = false;
    },
    (err) => alive && toast(t('load-failed', { reason: err.message })),
  );

  function onClick(e) {
    if (folderClick(e)) return;
    if (e.target.closest('[data-act=phone]')) openPhoneDialog();
  }
  app.addEventListener('click', onClick);
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
    },
  };
}
```

- [ ] **Step 8: 换掉 src/main.js**

```js
import '@fontsource-variable/geist';
import './style.css';
import { renderAlbum } from './album.js';
import { renderHome } from './home.js';
import { lang, t } from './i18n.js';
import { createNav } from './nav.js';
import { start } from './router.js';
import { fullscreenTip, icon } from './ui.js';
import { renderWall } from './wall.js';

lang(); // the cookie tells the server our language before the first request
const app = document.querySelector('#app');
let view = null;
let route = null;

// A language switch re-opens the current page (spec §10).
const nav = createNav(() => show(route, true));
document.body.prepend(nav.el);

// WeChat's browser cannot go full screen: point to Safari and the Home Screen (spec §9).
if (/MicroMessenger/i.test(navigator.userAgent)) {
  const tip = document.createElement('p');
  tip.className = 'wx-tip';
  tip.innerHTML = `<span>${fullscreenTip()}</span><button class="ibtn" type="button" aria-label="${t('close')}">${icon('close')}</button>`;
  tip.querySelector('button').onclick = () => tip.remove();
  document.body.prepend(tip);
}

function show(next, again = false) {
  route = next;
  const key = next.album ?? next.page;
  if (again || view?.key !== key) {
    view?.destroy();
    const page = next.album ? renderAlbum(app, next.album) : next.page === 'albums' ? renderWall(app) : renderHome(app);
    view = { key, ...page };
    if (!again) scrollTo(0, 0);
  }
  view.update?.(next);
  nav.update(next.album ? 'albums' : next.page);
}

start(show);
```

- [ ] **Step 9: 相册墙去掉「手机访问」，相册页回相册墙、导入时标记忙**

`src/wall.js`：
- 删掉 `import { openPhoneDialog } from './phone.js';`；
- 删掉 `// Phone access is set up on the computer only (spec §12).` 和下一行 `const local = …;`；
- 删掉标题区里 `${local ? \`<button class="btn" type="button" data-act="phone">…</button>\` : ''}` 这一行；
- 删掉 `onClick` 里的 `} else if (act === 'phone') {` 和下一行 `openPhoneDialog();`。

`src/album.js`：
- `if (act === 'back') close('#/');` → `if (act === 'back') close('#/albums');`；
- `pump()` 里 `uploading = true;` 下面加 `document.documentElement.setAttribute('data-busy', '');`；循环后面的 `uploading = false;` 下面加 `document.documentElement.removeAttribute('data-busy');`。

- [ ] **Step 10: 样式：导航栏和主页**

在 `src/style.css` 的 `/* Album page */` 这一行前面插入：

```css
/* Navigation */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  height: calc(56px + env(safe-area-inset-top, 0px));
  padding: env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 24px) 0 max(env(safe-area-inset-left, 0px), 24px);
  background: color-mix(in oklch, var(--bg) 80%, transparent);
  -webkit-backdrop-filter: saturate(1.4) blur(12px);
  backdrop-filter: saturate(1.4) blur(12px);
  box-shadow: 0 1px 0 var(--line);
}

.logo {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-right: 14px;
  padding: 4px 6px;
  border-radius: 10px;
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 650;
  text-decoration: none;
}

.logo i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.2), 0 1px 2px oklch(23.5% 0.02 255 / 0.25);
}

.logo svg {
  width: 17px;
  height: 17px;
}

.nl {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-decoration: none;
}

.nl:hover {
  background: var(--hover);
  color: var(--ink);
}

.nl[aria-current='page'] {
  background: oklch(23.5% 0.02 255 / 0.06);
  color: var(--ink);
}

.nav .btn {
  height: 34px;
  margin-right: 8px;
}

.lang {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: oklch(23.5% 0.02 255 / 0.05);
}

.lang button {
  min-width: 38px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1;
  font-weight: 500;
  cursor: pointer;
}

.lang button[aria-pressed='true'] {
  background: var(--raised);
  color: var(--ink);
  box-shadow: 0 1px 2px oklch(23.5% 0.02 255 / 0.12), inset 0 0 0 1px var(--line);
}

/* While photos import the language cannot change (spec §10). */
[data-busy] .lang {
  opacity: 0.4;
  pointer-events: none;
}

:is(.logo, .nl, .lang button, .cta, .more):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .nav {
    padding-left: max(env(safe-area-inset-left, 0px), 12px);
    padding-right: max(env(safe-area-inset-right, 0px), 10px);
  }

  .logo {
    margin-right: 4px;
  }

  .nl {
    padding: 0 11px;
  }

  .nav [data-act='phone'] {
    display: none;
  }

  .lang button {
    min-width: 34px;
    padding: 0 8px;
  }
}

/* Home */
.home {
  overflow-x: clip;
}

.hero {
  max-width: 1280px;
  margin: 0 auto;
  padding: 80px max(env(safe-area-inset-right, 0px), 40px) 0 max(env(safe-area-inset-left, 0px), 40px);
  text-align: center;
}

.eyebrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 20px;
}

.eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.eyebrow b {
  color: var(--ink-2);
  font-weight: 500;
}

.eyebrow .stats {
  display: contents;
}

.eyebrow .rule {
  width: 1px;
  height: 12px;
  margin: 0 4px;
  background: oklch(82.3% 0.009 235);
}

.h1 {
  margin: 20px 0 0;
  font-size: 52px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.02em;
}

:lang(zh) .h1 {
  letter-spacing: 0.01em;
}

.h1 br {
  display: none;
}

.lead {
  max-width: 31em;
  margin: 20px auto 0;
  color: var(--ink-3);
  font-size: 17px;
  line-height: 28px;
}

.ctas {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
}

.cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 16px 0 20px;
  border: 0;
  border-radius: 999px;
  background: none;
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}

.cta svg {
  width: 18px;
  height: 18px;
}

.cta.dark {
  background: var(--ink);
  color: var(--bg);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12), 0 1px 2px oklch(23.5% 0.02 255 / 0.3);
}

.cta.text {
  padding: 0 20px;
  color: var(--ink-2);
}

.cta.text:hover {
  background: var(--hover);
}

/* The recorded book; its edges fade into the page, so a slight colour shift never shows as a box. */
.home-book {
  display: block;
  width: 100%;
  max-width: 1080px;
  aspect-ratio: 1280 / 700;
  margin: 8px auto 0;
  object-fit: cover;
  -webkit-mask: linear-gradient(90deg, transparent, #000 24px calc(100% - 24px), transparent),
    linear-gradient(transparent, #000 24px calc(100% - 24px), transparent);
  -webkit-mask-composite: source-in;
  mask: linear-gradient(90deg, transparent, #000 24px calc(100% - 24px), transparent),
    linear-gradient(transparent, #000 24px calc(100% - 24px), transparent);
  mask-composite: intersect;
}

.sec {
  max-width: 1280px;
  margin: 0 auto;
  padding: 72px max(env(safe-area-inset-right, 0px), 40px) 0 max(env(safe-area-inset-left, 0px), 40px);
}

.sec h2 {
  margin: 0 0 20px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}

.sec-h {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
}

.sec-h h2 {
  margin: 0;
}

.more {
  margin-left: auto;
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.more:hover {
  color: var(--ink);
}

.feats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.feat {
  padding: 22px 22px 24px;
  border-radius: 18px;
  background: var(--raised);
  box-shadow: var(--card);
}

.feat .ic {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.feat .ic svg {
  width: 21px;
  height: 21px;
}

.feat h3 {
  margin: 16px 0 6px;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
}

.feat p {
  margin: 0;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 22px;
}

.recent .folders {
  grid-template-columns: repeat(4, 1fr);
}

.foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 24px 0 calc(env(safe-area-inset-bottom, 0px) + 36px);
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 13px;
  line-height: 20px;
}

.foot .logo {
  margin: 0;
  padding: 0;
  font-size: 14px;
}

.foot .logo i {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

.foot .logo svg {
  width: 14px;
  height: 14px;
}

@media (max-width: 600px) {
  .hero {
    padding: 40px max(env(safe-area-inset-right, 0px), 20px) 0 max(env(safe-area-inset-left, 0px), 20px);
  }

  .eyebrow .stats {
    display: none;
  }

  .h1 {
    font-size: 34px;
    line-height: 1.18;
  }

  .h1 br {
    display: inline;
  }

  .lead {
    font-size: 16px;
    line-height: 26px;
  }

  .ctas {
    margin-top: 26px;
  }

  .cta.text {
    display: none;
  }

  .cta.dark {
    flex: 1;
    justify-content: center;
  }

  .home-book {
    width: 116%;
    max-width: none;
    margin: 12px -8% 0;
  }

  .sec {
    padding: 52px max(env(safe-area-inset-right, 0px), 20px) 0 max(env(safe-area-inset-left, 0px), 20px);
  }

  .feats {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .feat {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 2px 14px;
    padding: 16px;
    border-radius: 16px;
  }

  .feat .ic {
    grid-row: span 2;
  }

  .feat h3 {
    margin: 0;
  }

  .recent .folders {
    grid-template-columns: repeat(2, 1fr);
  }

  .foot {
    flex-wrap: wrap;
  }
}

```

- [ ] **Step 11: 运行，确认通过，看截图**

Run: `npm run build && node /tmp/album-checks/check-home.mjs && node /tmp/album-checks/check-i18n.mjs && node /tmp/album-checks/check-pages.mjs && node /tmp/album-checks/check-phone.mjs && node /tmp/album-checks/check-book.mjs && node /tmp/album-checks/check-shots.mjs`
Expected: `home ok`、`i18n ok`、`pages ok`、`phone ok`、`book ok`、`shots in /tmp/album-shots`。

打开 `/tmp/album-shots/home.png` 和 `/tmp/album-shots/phone-home.png`，和 `docs/superpowers/mockups/2026-10-27-folio-redesign/home.html` 对照：导航栏、居中标题、翻页视频、四张功能卡片、最近的相册、页脚。

- [ ] **Step 12: 提交**

```bash
git add src/assets src/nav.js src/home.js src/main.js src/router.js src/phone.js src/ui.js src/wall.js src/album.js src/style.css
git commit -m "feat: add the navigation bar, the home page with the page-turning video, and the language switch" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: 相册页改版：标题区、按钮行、等高行网格

**Files:**
- Modify: `src/album.js`、`src/ui.js`（加 `pen` 图标）、`src/style.css`、`docs/superpowers/specs/2026-10-27-folio-redesign-design.md`（§8 补一句增长上限）
- Test: `/tmp/album-checks/check-pages.mjs`、`/tmp/album-checks/check-viewer.mjs`

**Interfaces:**
- Consumes: Task 3 的 `.page`、`.t1`、`.sub`、`.btn`；Task 2 的 `t()`。
- Produces：
  - 相册页结构：
    - `.crumb a[href="#/albums"]`；
    - `h1.t1 > button.title + .pen`；
    - `p.sub.count`；
    - `.acts.normal`（3D 翻阅、上传照片、选择）和 `.acts.picking`；
  - `.grid` 是等高行：每个 `.tile` 带 `--a`（宽 / 高）。

关于「不出现巨大的格子」：每行是贪心排的。一张很宽的照片（宽高比大于约 3:1）放不进当前行时，这一行剩下的照片会被拉得很大（8:1 全景前面那行可到行高的 2.7 倍）。所以每张照片最多长到行高的 2 倍。代价是只有这种行会差一点撑满；手机上一张 16:9 照片单独一行时仍然撑满（约 1.96 倍）。

- [ ] **Step 1: 先量现在的网格速度**

在 `/tmp/album-checks/check-viewer.mjs` 里，把

```js
await b.goto(`${server.url}#/a/${id}`);
await b.waitFor(`document.querySelectorAll('.grid .tile').length === 10000`, 30000);
```

换成

```js
const tGrid = Date.now();
await b.goto(`${server.url}#/a/${id}`);
await b.waitFor(`document.querySelectorAll('.grid .tile').length === 10000`, 30000);
await b.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
console.log(`grid of 10000 shown in ${Date.now() - tGrid} ms`);
```

Run: `node /tmp/album-checks/check-viewer.mjs`
Expected: `viewer ok`。记下 `grid of 10000 shown in N ms`（旧的方格），写进进度记录。

- [ ] **Step 2: 改检查，让它先失败**

`/tmp/album-checks/check-viewer.mjs`：在上一步加的 `console.log(\`grid of 10000 shown …\`)` 下面插入：

```js
// Justified rows (spec §8): one height per row, every photo whole, full rows exactly as wide as the grid.
const laid = await b.evaluate(`(() => {
  const grid = document.querySelector('.grid').getBoundingClientRect();
  const rows = new Map();
  for (const t of [...document.querySelectorAll('.grid .tile')].slice(0, 60)) {
    const r = t.getBoundingClientRect();
    const key = Math.round(r.top);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ left: r.left, right: r.right, w: r.width, h: r.height, a: Number(getComputedStyle(t).getPropertyValue('--a')) });
  }
  return { left: grid.left, right: grid.right, rows: [...rows.values()].slice(0, -1) };
})()`);
assert.ok(laid.rows.length >= 3);
for (const row of laid.rows) {
  assert.ok(Math.max(...row.map((t) => t.h)) - Math.min(...row.map((t) => t.h)) < 1, 'one height per row');
  assert.ok(Math.abs(row[0].left - laid.left) < 1 && Math.abs(row.at(-1).right - laid.right) < 1, 'full rows');
  for (const t of row) assert.ok(t.a > 0 && Math.abs(t.w / t.h - t.a) / t.a < 0.01, 'whole photos');
}
```

`/tmp/album-checks/check-pages.mjs`：
- 两处 `await b.click('[data-act=back]');` 都改成 `await b.click('.crumb a');`；
- 手机那段的 `` assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length`), 3); `` 换成 `` assert.equal(await m.evaluate(`Math.round(document.querySelector('.grid .tile').getBoundingClientRect().height)`), 104); ``；
- 导入里加上 `FIX`：`import { FIX, makeFixtures, sharp } from './fixtures.mjs';`；
- 在最后的 `await server.close();` 前面插入：

```js
// Review focus «long title» and «extreme shapes»: the title is cut with an ellipsis; an 8:1 panorama and
// a 1:20 strip stay inside the grid, and no photo grows past twice the row height.
await sharp({ create: { width: 4000, height: 500, channels: 3, background: '#6d8868' } }).jpeg().toFile(`${FIX}/pano.jpg`);
await sharp({ create: { width: 300, height: 6000, channels: 3, background: '#ef946b' } }).jpeg().toFile(`${FIX}/strip.jpg`);
for (const f of [`${FIX}/pano.jpg`, `${FIX}/strip.jpg`, fx.tall]) {
  await api(`/api/albums/${long.id}/photos?name=x.jpg`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(f) });
}
const e = await launch();
await e.goto(`${server.url}#/a/${long.id}`);
await e.waitFor(`document.querySelectorAll('.grid .tile').length === 5`);
assert.ok(await e.evaluate(`(() => { const t = document.querySelector('.title'); return t.scrollWidth > t.clientWidth; })()`));
assert.ok(await e.evaluate(`document.querySelector('.t1').getBoundingClientRect().right <= document.querySelector('.grid').getBoundingClientRect().right + 1`));
const shape = await e.evaluate(`(() => {
  const g = document.querySelector('.grid').getBoundingClientRect();
  return [...document.querySelectorAll('.grid .tile')].map((t) => { const r = t.getBoundingClientRect(); return [r.left - g.left, g.right - r.right, r.height]; });
})()`);
for (const [l, r, h] of shape) assert.ok(l >= -1 && r >= -1 && h <= 381, JSON.stringify(shape));
assert.deepEqual(e.errors, []);
await e.close();
```

- [ ] **Step 3: 运行，确认失败**

Run: `node /tmp/album-checks/check-viewer.mjs; node /tmp/album-checks/check-pages.mjs`
Expected: check-viewer 报 `whole photos`（方格里照片被裁成正方形，`--a` 也不存在）；check-pages 报 `timed out` 等 `.crumb a`。

- [ ] **Step 4: 改 src/album.js**

`app.innerHTML = \`…\`;` 整段换成：

```js
  app.innerHTML = `
    <main class="page album-page">
      <p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span></p>
      <h1 class="t1"><button class="title" type="button" data-act="rename" title="${t('rename-hint')}"></button><span class="pen">${icon('pen')}</span></h1>
      <p class="sub count"></p>
      <div class="acts normal">
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>${t('flip-3d')}</span></button>
        <button class="btn" type="button" data-act="upload">${icon('upload')}<span>${t('upload-photos')}</span></button>
        <button class="btn" type="button" data-act="select">${t('select')}</button>
      </div>
      <div class="acts picking" hidden>
        <button class="btn ghost" type="button" data-act="cancel">${t('cancel')}</button>
        <span class="picked"></span>
        <button class="btn danger" type="button" data-act="delete">${icon('trash')}<span>${t('delete')}</span></button>
      </div>
      <div class="grid" hidden></div>
      <div class="drop" hidden>
        ${icon('upload')}
        <b>${t('drop-here')}</b>
        <span>${t('or')} <button class="link" type="button" data-act="upload">${t('choose-photos')}</button></span>
        <small>${t('formats')}</small>
      </div>
      <div class="fab">
        <button class="btn" type="button" data-act="upload">${icon('upload')}<span>${t('upload')}</span></button>
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>${t('flip-3d')}</span></button>
      </div>
      <input type="file" accept="image/*,.heic,.heif" multiple hidden>
      <div class="upload" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>
    </main>`;
```

再改：
- `const main = $('.mgr');` → `const main = $('.page');`；
- `tile()` 里 `t.dataset.id = p.id;` 下面加 `t.style.setProperty('--a', (p.w / p.h).toFixed(4));`；
- `onClick` 里

```js
    if (!album && act !== 'back') return;
    if (act === 'back') close('#/albums');
    else if (act === 'upload') input.click();
```

换成

```js
    if (!album) return;
    if (act === 'upload') input.click();
```

- `onPointerMove` 里，从 `const over = document.elementFromPoint(` 到它下面那个 `if` 块结束，换成：

```js
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
    // Rows re-flow after each move, so the next move waits until the pointer has gone 24 px further.
    if (over && over !== drag.t && over.parentElement === grid && Math.hypot(e.clientX - drag.mx, e.clientY - drag.my) >= 24) {
      const kids = [...grid.children];
      if (kids.indexOf(over) > kids.indexOf(drag.t)) over.after(drag.t);
      else over.before(drag.t);
      drag.mx = e.clientX;
      drag.my = e.clientY;
    }
```

- `onPointerDown` 里 `drag = { t, x0: e.clientX, y0: e.clientY, ghost: null, before: '' };` 改成 `drag = { t, x0: e.clientX, y0: e.clientY, mx: -Infinity, my: -Infinity, ghost: null, before: '' };`。

`src/ui.js` 的 `PATHS` 里加：

```js
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
```

- [ ] **Step 5: 样式：相册页**

`src/style.css`：

(a) 删掉从 `/* Album page frame */` 到 `/* Page frame and header */` 之前的整段（`.mgr` 和 `.bar` 两条规则）。

(b) 从 `/* Album page */` 这一行起，到 `.drop {` 这一行之前，整段换成：

```css
/* Album page */
.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 20px;
}

.crumb a {
  color: inherit;
  text-decoration: none;
}

.crumb a:hover {
  color: var(--ink);
}

.album-page .t1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.title {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.pen {
  flex: none;
  display: grid;
  color: var(--ink-3);
  opacity: 0;
  transition: opacity 0.15s;
}

.pen svg {
  width: 18px;
  height: 18px;
}

.t1:hover .pen,
.title:focus-visible + .pen {
  opacity: 1;
}

.acts {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 24px;
}

.picked {
  margin: 0 4px;
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

/* Photos in justified rows (spec §8): free space goes to each photo in proportion to its aspect ratio, so
   a row has one height and every photo is whole. A photo grows to at most twice the row height, so the
   row before a panorama never turns into giant tiles. */
.grid {
  --row: 190px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  user-select: none;
  -webkit-user-select: none;
}

.grid::after {
  content: '';
  flex: 1e6 1 0px;
}

.tile {
  position: relative;
  flex: calc(var(--a) * 1000) 1 calc(var(--a) * var(--row));
  min-width: 0;
  max-width: calc(var(--a) * var(--row) * 2);
  aspect-ratio: var(--a);
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: #e4e9ee;
  cursor: pointer;
}

.tile img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s var(--ease-out);
}

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .tile:hover img {
    transform: scale(1.03);
  }
}

.tile.missing img {
  visibility: hidden;
}

.tile.missing::after {
  content: var(--missing, '图片丢失');
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink-3);
  font-size: 12px;
}

.badge {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.94);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
}

.chk {
  position: absolute;
  right: 8px;
  top: 8px;
  display: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.18);
  color: #fff;
}

.chk svg {
  width: 14px;
  height: 14px;
  stroke-width: 3;
  opacity: 0;
}

.selecting .chk {
  display: grid;
}

.tile.sel {
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}

.tile.sel img {
  inset: 9px;
  width: calc(100% - 18px);
  height: calc(100% - 18px);
  border-radius: 4px;
  transform: none;
}

.tile.sel .chk {
  background: var(--accent);
}

.tile.sel .chk svg {
  opacity: 1;
}

.tile.dragging {
  opacity: 0.3;
}

.tile.ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 50;
  pointer-events: none;
  border-radius: 8px;
  box-shadow: 0 26px 40px -14px rgb(20 35 55 / 0.55), 0 0 0 3px #fff;
}

@media (max-width: 600px) {
  .grid {
    --row: 104px;
    gap: 3px;
  }

  .tile {
    border-radius: 4px;
  }

  .acts {
    margin: 14px 0 18px;
  }

  /* On phones these two float at the bottom (.fab). */
  .acts.normal [data-act='upload'],
  .acts.normal [data-act='3d'] {
    display: none;
  }
}

```

(c) 从 `/* Phones: two-column wall, three-column grid, floating buttons */` 这一行起，到 `/* Viewer overlay */` 这一行之前，整段换成：

```css
/* Phones: floating buttons on the album page */
@media (max-width: 600px) {
  .fab {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
    z-index: 6;
    display: flex;
    justify-content: center;
    gap: 10px;
    pointer-events: none;
  }

  .fab .btn {
    height: 46px;
    padding: 0 22px 0 18px;
    font-size: 16px;
    pointer-events: auto;
    box-shadow: inset 0 0 0 1px var(--line), 0 10px 24px -10px rgb(20 35 55 / 0.5);
  }

  .fab .btn.pri {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14), 0 10px 24px -10px rgb(20 35 55 / 0.6);
  }

  .selecting .fab {
    display: none;
  }

  .upload {
    left: 14px;
    right: 14px;
    width: auto;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
  }
}

```

- [ ] **Step 6: 规格补上增长上限**

在 `docs/superpowers/specs/2026-10-27-folio-redesign-design.md` §8 里，`  - 目标行高电脑约 190px、手机约 104px；每行左右撑满，最后一行不拉伸；` 下面加一行：

```markdown
  - 每张照片最多长到行高的 2 倍：一张很宽的照片（宽高比大于约 3:1）放不进当前行时，这一行会差一点撑满，而不是把前面的照片拉得很大；
```

- [ ] **Step 7: 运行，确认通过，比较速度**

Run: `npm run build && node /tmp/album-checks/check-pages.mjs && node /tmp/album-checks/check-viewer.mjs && node /tmp/album-checks/check-lightbox.mjs && node /tmp/album-checks/check-i18n.mjs && node /tmp/album-checks/check-shots.mjs`
Expected: `pages ok`、`viewer ok`、`lightbox ok`、`i18n ok`、`shots in /tmp/album-shots`。

把新的 `grid of 10000 shown in N ms` 和 Step 1 的旧值一起写进进度记录。新值超过旧值 3 倍时停下来报告，不要提交。

打开 `/tmp/album-shots/album.png`、`select.png`、`phone-album.png`，和 `docs/superpowers/mockups/2026-10-27-folio-redesign/albums.html` 下半部分（选「A 等高行」）对照：「相册 /」、标题、照片数、按钮行、等高行、选择模式的蓝框和勾。

- [ ] **Step 8: 提交**

```bash
git add src/album.js src/ui.js src/style.css docs/superpowers/specs/2026-10-27-folio-redesign-design.md
git commit -m "feat: restyle the album page and lay photos out in justified rows" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: 使用说明、旧文档指向、验收

**Files:**
- Modify: `README.md`（整个文件换掉）、`docs/superpowers/specs/2026-10-26-photo-album-manager-design.md`（开头加一行）
- Test: `/tmp/album-checks/check-shots.mjs`（加英文截图）；全部 12 个检查

**Interfaces:**
- Consumes: Task 1–5 的全部结果。
- Produces: 文档；中英文截图；交给用户的真机清单。

- [ ] **Step 1: 英文截图**

在 `/tmp/album-checks/check-shots.mjs` 的 `await server.close();` 前面插入：

```js
// English (spec §10): the same pages in an English browser.
const en = await launch({ lang: 'en-US' });
for (const [name, hash, ready] of [
  ['en-home', '', `document.querySelector('.recent')?.hidden === false`],
  ['en-wall', '#/albums', `document.querySelectorAll('.folder .pocket img').length === 9`],
  ['en-album', `#/a/${first.id}`, `document.querySelectorAll('.grid .tile').length === 48`],
  ['en-3d', `#/a/${first.id}/3d`, `!!document.querySelector('.ab-count')?.textContent`],
]) {
  await en.goto(`${server.url}${hash}`);
  await shoot(en, name, ready);
}
assert.deepEqual(en.errors, []);
await en.close();
const enm = await launch({ width: 390, height: 844, mobile: true, lang: 'en-US' });
await enm.goto(server.url);
await shoot(enm, 'en-phone-home', `document.querySelector('.recent')?.hidden === false`);
assert.deepEqual(enm.errors, []);
await enm.close();
```

- [ ] **Step 2: 换掉 README.md**

````markdown
# 册页 Folio

本地相册管理工具：照片存在自己的电脑上，在浏览器里管理，用 3D 翻阅的方式看；同一 Wi‑Fi 下手机扫码也能看、能上传。界面有中文和英文。

## 运行

需要 macOS 和 Node 20.9 以上。

```bash
npm install
npm start
```

然后打开 http://localhost:5180 ，先看到主页；点导航栏的「相册」进入相册墙。

- 相册库默认在 `~/Pictures/相册库`，用 `ALBUM_LIBRARY=/你的/路径 npm start` 换位置。
- 端口默认 5180，用 `PORT=5181 npm start` 换端口。
- 开发：`npm run dev`；要让手机访问开发服务器，用 `npm run dev -- --host`。

## 语言

第一次打开时跟随浏览器语言：中文系统显示中文，其他显示英文。点导航栏右边的「中 / EN」切换，每台设备各自记住。正在导入照片时不能切换。

## 手机访问

在导航栏点「手机访问」，打开「允许手机访问」，用手机相机扫二维码。手机和电脑要连同一个 Wi‑Fi。每次重新打开开关都会换一个新链接，旧链接失效。

想在 iPhone 上全屏看：用 Safari 打开链接，点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开，没有地址栏。用微信扫码时，先点右上角「···」→「在 Safari 中打开」。重新打开开关后，主屏幕上的图标也要删掉重新添加。

第一次启动时，macOS 可能会问是否允许 node 接受传入的网络连接。要选「允许」，否则手机打不开。局域网里走的是 HTTP，只在家里或可信的 Wi‑Fi 下使用。

## 删除

在网页里删除的相册和照片会直接从相册库删除，不能恢复。要备份，复制整个相册库文件夹即可。

## 字体

英文和数字用 Geist 字体（SIL Open Font License 1.1），打包在软件里，不从网上加载。许可证见 `public/geist-OFL.txt`。
````

- [ ] **Step 3: 旧设计文档指向新文档**

在 `docs/superpowers/specs/2026-10-26-photo-album-manager-design.md` 的 `- 状态：已确认（2026-10-26）` 下面加一行：

```markdown
- 界面改版（主页、导航栏、中英切换）：见 `docs/superpowers/specs/2026-10-27-folio-redesign-design.md`。它覆盖本文 §9 里相册墙、相册页的样子，以及「界面用中文」的假设。
```

- [ ] **Step 4: 没有遗留的旧样式和写死的中文**

Run: `grep -nE '^\.(mgr|bar|brand|wall|album|cover|names|ttl|meta)[ ,{]' src/style.css; grep -nP '\p{Han}' src/*.js | grep -v '^src/i18n.js'`
Expected: 两条都没有输出。

- [ ] **Step 5: 全部检查**

Run: `npm run build && for c in library import server layout book pages lightbox viewer phone home i18n shots; do node /tmp/album-checks/check-$c.mjs || break; done`
Expected: 依次 `library ok`、`import ok`、`server ok`、`layout ok`、`book ok`、`pages ok`、`lightbox ok`、`viewer ok`、`phone ok`、`home ok`、`i18n ok`、`shots in /tmp/album-shots`，中间不停。

- [ ] **Step 6: 截图对照**

逐张打开 `/tmp/album-shots/` 下的 `home`、`phone-home`、`wall`、`phone-wall`、`album`、`select`、`phone-album`、`lightbox`、`3d`、`phone-3d`、`phone`，以及 `en-home`、`en-wall`、`en-album`、`en-3d`、`en-phone-home`，和两份界面稿对照：
- 中文和英文都没有溢出、截断错位；
- 英文页面上除了「中」按钮，没有中文。

发现问题就修，修完重跑 Step 5。

- [ ] **Step 7: 提交**

```bash
git add README.md docs/superpowers/specs/2026-10-26-photo-album-manager-design.md
git commit -m "docs: rename to Folio and describe the home page and the language switch" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 8: 真机清单（交给用户）**

- iPhone Safari：
  - 主页的翻页视频能自动播放、循环；
  - 从主屏幕图标打开时，导航栏没有被状态栏挡住；
- 中英切换：点「EN」整页变英文，刷新后还是英文；切回「中」；
- 相册墙卡片：透明袋、照片露出、鼠标移上去照片往上抽；
- 电脑上在等高行里拖动排序：换位不来回跳（spec §15 的 24px 间隔）；
- 一万张照片的相册页滚动是否流畅。
