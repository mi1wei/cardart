# 本地相册管理（子项目 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3D 翻阅卡册改造成本地相册管理工具，包括：
- 本地 Node 服务和相册库目录；
- 在网页里管理相册和照片；
- 3D 翻阅：一页按横竖自动排多张，整本相册是一本连续的书；
- 同一 Wi‑Fi 下手机扫码访问。

**Architecture:**
- **服务端 `server/`**（Node 内置 `http` + sharp）：
  - `library.js` 管相册库目录和 `album.json`；
  - `importer.js` 导入照片、生成缓存图；
  - `app.js` 做访问控制、接口、图片和静态文件。
  - 开发时 `vite.config.js` 把它挂成 Vite 中间件；运行时 `npm start` 起独立服务。
- **前端 `src/`**（原生 JS）：
  - `router.js` 负责 hash 路由，`main.js` 按路由切换页面；
  - 页面模块：`wall.js` 相册墙，`album.js` 相册页，`lightbox.js` 大图，`phone.js` 手机访问，`viewer.js` 3D 覆盖层。
- **3D `src/book/`**：
  - `layout.js` 自动排版，`textures.js` 页面贴图，`book.js` 20 张活页的滑动窗口；
  - `binder.js`、`sheet.js`、`scene.js` 不变。

**Tech Stack:**
- 运行：Node ≥ 20.9（本机 v26）、sharp 0.35、uqr 0.1、Vite 8、three 0.186、原生 JS ES 模块、CSS；macOS 自带 `sips`（转 HEIC）。
- 检查：用 Node 内置的 `fetch` 和 `WebSocket`，通过 DevTools 协议驱动无头 Chrome（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）。

**Spec:** `docs/superpowers/specs/2026-10-26-photo-album-manager-design.md`

## Global Constraints

- **技术与依赖**：
  - 原生 JS ES 模块，不用 TypeScript，不用 UI 框架。
  - 运行时依赖只有 three、sharp、uqr；服务端只用 Node 内置模块和 sharp。
- **启动参数**：
  - 相册库目录用环境变量 `ALBUM_LIBRARY`，默认 `~/Pictures/相册库`；
  - 端口用 `PORT`，默认 5180；
  - 服务监听 `0.0.0.0`。
- **数据格式**：
  - `album.json` 字段：`version, id, title, createdAt, cover, perPage, nextSeq, photos[{ id, file, name, w, h, sha256 }]`；
  - 相册 id 是 UUID；照片 id 从 `p001` 起递增，不复用；
  - `library.json` 为 `{ version: 1, phone: { enabled, key } }`，key 是 32 位 hex。
- **缓存图**：`cache/<id>_600.webp`（长边 600，质量 80）和 `cache/<id>_1600.webp`（长边 1600，质量 82），都不放大。
- **请求约定**：
  - 上传一次一张，请求体就是文件；带头 `X-Album-Upload: 1`；上限 100 MB。
  - JSON 写接口要求 `Content-Type: application/json`。
- **3D 排版**：
  - 每面一个整页透明袋 182.2 × 179.6 mm，袋内留白 5 mm，照片间距 4 mm，多张一页时短边 ≥ 30 mm；
  - `perPage` 取 1 / 2 / 3，平均每页 1 / 2 / 3 张，每页上限 1 / 3 / 4 张；
  - 排版按「40 × 平均张数」张一段计算；3D 里只画 20 张活页。
- **界面文案**逐字使用：
  - 相册墙与相册页：「相册」「新建相册」「新相册」「手机访问」「全部相册」「选择」「上传照片」「上传」「3D 翻阅」「取消」「删除」「已选 n 张」「封面」「把照片拖到这里」「点这里选择照片」「支持 JPG、PNG、HEIC、WebP」；
  - 上传进度：「正在导入 i / n」「已导入 n 张，跳过 m 张（重复 a，格式不支持 b，太大 c），失败 d 张」；
  - 大图：「设为封面」「查看原图」「图片丢失」；
  - 3D：「每页」「每页 1 张」「宽松」「紧凑」「打开相册」「合上相册」「拖动页面或点击两侧翻页；点击照片看大图」「点击封面或向左拖动打开」「请横过手机查看相册」「当前浏览器无法显示 3D 相册（WebGL 不可用）」；
  - 手机访问：「用手机看相册」「手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。」「允许手机访问」「关掉后，手机马上打不开」「复制」「这台电脑没有连接局域网」「手机访问已关闭，请在电脑上打开「手机访问」」；
  - 删除确认：「删除相册「名字」？相册里的照片会一起删除，不能恢复。」「删除 n 张照片？删除后不能恢复。」「删除这张照片？删除后不能恢复。」。
- **删除**：没有回收站，删除直接删文件，不能恢复（用户确认）。
- **颜色与样式**：沿用 `src/style.css` 的 `:root` 变量，另加 `--danger: #b42318` 和 `--panel`（浮层阴影）。
- **测试**：不写单元测试，仓库里不放测试文件。
  - 检查脚本放 `/tmp/album-checks/`；
  - 截图放 `/tmp/album-shots/`；
  - 临时相册库放 `/tmp/album-checks/lib-*`；
  - 以上都不提交。
- **命令与提交**：
  - 所有命令都在项目根目录 `/Users/miwei/PyCharmMiscProject/cardart` 下执行；检查脚本按当前目录加载项目模块。
  - 每次提交带 trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。
  - 没有远程仓库，不 push；不要动 `.codegraph/`。

## Review Focus

1. **两台设备几乎同时上传同一张照片**：只导入一次，另一次返回 `duplicate`。
   → Task 3 `check-import` 的「twins」。
2. **上传到一半断开**（手机切后台、断网）：不留 `.tmp-*`，`album.json` 不变。
   → Task 3 `check-import` 的「cut」。
3. **3D 里快速连翻、翻到窗口边上、合上后马上又打开**：计数正确，不卡住，最后停在正确的位置。
   → Task 8 `check-book` 的「rapid」「window」「reopen」。
4. **非常规照片**（8:1 全景、9:19.5 长截图、1×1 像素、带 EXIF 旋转）：能排进页面，不裁切，尺寸正确。
   → Task 7 `check-layout` 的「extremes」；Task 3 `check-import` 的 `dot.png` 和 `rotated.jpg`。
5. **文件名带中文、空格、`#`、`%`**：上传后 `name` 原样保存，查看原图时文件名正确。
   → Task 4 `check-server` 的「odd file name」。

---

### Task 1: 设计文档入库，加依赖

**Files:**
- Create: `docs/superpowers/specs/2026-10-26-photo-album-manager-design.md`
- Create: `docs/superpowers/plans/2026-10-26-photo-album-manager.md`
- Create: `docs/superpowers/mockups/2026-10-26-photo-album-manager/ui-draft-v1.html`
- Create: `docs/superpowers/mockups/2026-10-26-photo-album-manager/layout-auto-v1.html`
- Modify: `package.json`、`package-lock.json`

**Interfaces:**
- Consumes: 会话目录里的设计文档、本计划和两份稿子。
- Produces: 依赖 `sharp`、`uqr`；脚本 `npm start` = `vite build && node server/index.js`（Task 4 才有 `server/index.js`）。

- [ ] **Step 1: 复制文档和稿子**

```bash
S=/Users/miwei/.copilot/session-state/671e265d-8a07-4c24-a810-2e5aa094f578
mkdir -p docs/superpowers/mockups/2026-10-26-photo-album-manager
cp "$S/files/2026-10-26-photo-album-manager-design.md" docs/superpowers/specs/
cp "$S/plan.md" docs/superpowers/plans/2026-10-26-photo-album-manager.md
cp "$S/files/ui-draft-v1.html" "$S/files/layout-auto-v1.html" docs/superpowers/mockups/2026-10-26-photo-album-manager/
```

- [ ] **Step 2: 安装依赖**

Run: `npm install sharp@^0.35.5 uqr@^0.1.3`
Expected: `added … packages`，没有 `npm ERR!`。

- [ ] **Step 3: 改 package.json**

把 `name` 改成 `photo-album`，`scripts` 改成下面这样（`dependencies` 由上一步写入，保持原样）：

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "start": "vite build && node server/index.js"
  },
```

- [ ] **Step 4: 确认依赖能用**

Run: `node --input-type=module -e "import sharp from 'sharp'; import { renderSVG } from 'uqr'; console.log(typeof sharp, typeof renderSVG, renderSVG('x').startsWith('<svg'))"`
Expected: `function function true`

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers package.json package-lock.json
git commit -m "docs: add the photo album manager spec, plan and mockups; add sharp and uqr" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: 相册库

**Files:**
- Create: `server/library.js`
- Test: `/tmp/album-checks/check-library.mjs`（仓库外）

**Interfaces:**
- Consumes: 无。
- Produces（`server/library.js`）：
  - `DEFAULT_DIR`：`~/Pictures/相册库`。
  - `isAlbumId(id) → boolean`（UUID）、`isPhotoId(id) → boolean`（`p` 加至少 3 位数字）。
  - `fail(status, message) → Error`：带 `status` 字段的错误，接口层按它回状态码。
  - `openLibrary(dir) → Promise<Library>`。它会建目录、删 `.tmp-*` 和没删完的 `.del-*` 相册文件夹、扫描 `album.json`。`Library` 有：
    - `dir`；`albumDir(id) → string`；
    - `get(id) → album`：找不到抛 404；
    - `list() → [{ id, title, count, cover: { id, w, h } | null, createdAt }]`：新建的在前；
    - `create(title) → Promise<album>`；
    - `update(id, { title?, cover?, perPage?, order? }) → Promise<album>`：参数不对抛 400，`order` 不匹配抛 409；
    - `remove(id) → Promise<void>`：删除整本相册。先改名为 `.del-<id>`，再删除文件夹；
    - `deletePhotos(id, ids) → Promise<album>`：先写 `album.json`，再删除原图和缓存图；
    - `queue(id, task) → Promise`：同一相册的写操作排队执行；
    - `save(album) → Promise<album>`：原子写 `album.json` 并更新内存；只能在 `queue` 里调用；
    - `phone() → { enabled, key }`；
    - `setPhone(enabled) → Promise<{ enabled, key }>`：每次打开都换新 key。

- [ ] **Step 1: 写检查脚本**

Run: `mkdir -p /tmp/album-checks`

`/tmp/album-checks/check-library.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-library.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { openLibrary, isAlbumId, isPhotoId } = await import(`${process.cwd()}/server/library.js`);
const dir = '/tmp/album-checks/lib-library';
rmSync(dir, { recursive: true, force: true });
const rejects = (promise, status) => assert.rejects(promise, (err) => err.status === status);

let lib = await openLibrary(dir);
assert.ok(existsSync(join(dir, 'albums')));
const settings = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'));
assert.equal(settings.version, 1);
assert.equal(settings.phone.enabled, false);
assert.match(settings.phone.key, /^[0-9a-f]{32}$/);

const a = await lib.create('  京都旅行 ');
assert.ok(isAlbumId(a.id));
assert.deepEqual(
  { title: a.title, cover: a.cover, perPage: a.perPage, nextSeq: a.nextSeq, photos: a.photos },
  { title: '京都旅行', cover: null, perPage: 2, nextSeq: 1, photos: [] },
);
assert.ok(existsSync(join(dir, 'albums', a.id, 'originals')) && existsSync(join(dir, 'albums', a.id, 'cache')));
await rejects(lib.create('   '), 400);
await rejects(lib.create('字'.repeat(51)), 400);

// Fake three photos so order, cover and deletion can be checked without the importer.
const photo = (n) => ({ id: `p00${n}`, file: `p00${n}.jpg`, name: `IMG_${n}.JPG`, w: 4, h: 3, sha256: String(n) });
for (const n of [1, 2, 3]) {
  writeFileSync(join(dir, 'albums', a.id, 'originals', `p00${n}.jpg`), 'x');
  for (const size of [600, 1600]) writeFileSync(join(dir, 'albums', a.id, 'cache', `p00${n}_${size}.webp`), 'x');
}
await lib.queue(a.id, () => lib.save({ ...lib.get(a.id), nextSeq: 4, photos: [1, 2, 3].map(photo) }));

let b = await lib.update(a.id, { title: '京都', perPage: 3, cover: 'p002' });
assert.deepEqual([b.title, b.perPage, b.cover], ['京都', 3, 'p002']);
await rejects(lib.update(a.id, { perPage: 4 }), 400);
await rejects(lib.update(a.id, { cover: 'p009' }), 400);
await rejects(lib.update(a.id, null), 400);
await rejects(lib.update(a.id, { order: ['p001', 'p002'] }), 409);
await rejects(lib.update(a.id, { order: ['p001', 'p001', 'p002'] }), 409);
b = await lib.update(a.id, { order: ['p003', 'p001', 'p002'] });
assert.deepEqual(b.photos.map((p) => p.id), ['p003', 'p001', 'p002']);
assert.deepEqual(lib.list()[0].cover, { id: 'p002', w: 4, h: 3 });

// Many writes at once still leave one valid album.json, in call order.
await Promise.all(Array.from({ length: 20 }, (_, i) => lib.update(a.id, { title: `标题 ${i}` })));
assert.equal(JSON.parse(readFileSync(join(dir, 'albums', a.id, 'album.json'), 'utf8')).title, '标题 19');

// Deleting removes the files for good: no trash.
b = await lib.deletePhotos(a.id, ['p002', 'p404']);
assert.deepEqual(b.photos.map((p) => p.id), ['p003', 'p001']);
assert.equal(b.cover, null); // the cover went with p002
assert.ok(!existsSync(join(dir, 'albums', a.id, 'originals', 'p002.jpg')));
assert.ok(!existsSync(join(dir, 'albums', a.id, 'cache', 'p002_600.webp')));
assert.ok(!existsSync(join(dir, 'albums', a.id, 'cache', 'p002_1600.webp')));
assert.ok(existsSync(join(dir, 'albums', a.id, 'originals', 'p001.jpg')));
assert.ok(!existsSync(join(dir, 'trash')));
await rejects(lib.deletePhotos(a.id, []), 400);

// Phone access: every switch-on makes a new key; switching off keeps it.
const key0 = lib.phone().key;
const on = await lib.setPhone(true);
assert.ok(on.enabled && on.key !== key0);
const off = await lib.setPhone(false);
assert.ok(!off.enabled && off.key === on.key);

// Reopen: temp files and half-deleted albums go, a broken album is skipped, the rest survives.
writeFileSync(join(dir, 'albums', a.id, 'originals', '.tmp-abc'), 'x');
const halfDeleted = join(dir, 'albums', '.del-00000000-0000-4000-8000-000000000001');
mkdirSync(join(halfDeleted, 'originals'), { recursive: true });
const broken = '00000000-0000-4000-8000-000000000000';
mkdirSync(join(dir, 'albums', broken));
writeFileSync(join(dir, 'albums', broken, 'album.json'), '{oops');
lib = await openLibrary(dir);
assert.ok(!existsSync(join(dir, 'albums', a.id, 'originals', '.tmp-abc')));
assert.ok(!existsSync(halfDeleted));
assert.deepEqual(lib.list().map((x) => x.id), [a.id]);
await rejects(lib.update(broken, { title: 'x' }), 404);
assert.ok(isPhotoId('p001') && isPhotoId('p1000') && !isPhotoId('p01') && !isPhotoId('../x'));

await lib.remove(a.id);
assert.equal(lib.list().length, 0);
assert.deepEqual(readdirSync(join(dir, 'albums')).filter((n) => n.includes(a.id)), []);
await rejects(lib.remove(a.id), 404);
console.log('library ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-library.mjs`
Expected: FAIL，`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/cardart/server/library.js'`

- [ ] **Step 3: 实现 server/library.js**

`server/library.js`：

```js
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DIR = join(homedir(), 'Pictures', '相册库');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isAlbumId = (id) => typeof id === 'string' && UUID.test(id);
export const isPhotoId = (id) => typeof id === 'string' && /^p\d{3,}$/.test(id);
export const fail = (status, message) => Object.assign(new Error(message), { status });

const newKey = () => randomBytes(16).toString('hex');

// Write a temp file, then rename it: a crash never leaves half a JSON file behind.
async function writeJson(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
  await rename(`${file}.tmp`, file);
}

function cleanTitle(title) {
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t || [...t].length > 50) throw fail(400, '相册名要 1–50 个字');
  return t;
}

export async function openLibrary(dir) {
  const albumsDir = join(dir, 'albums');
  await mkdir(albumsDir, { recursive: true });

  const settingsFile = join(dir, 'library.json');
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`library.json 读不了，已重建：${err.message}`);
    settings = { version: 1, phone: { enabled: false, key: newKey() } };
    await writeJson(settingsFile, settings);
  }

  const albums = new Map();
  for (const id of await readdir(albumsDir)) {
    if (id.startsWith('.del-')) await rm(join(albumsDir, id), { recursive: true, force: true }); // a delete cut short
    if (!isAlbumId(id)) continue;
    try {
      albums.set(id, JSON.parse(await readFile(join(albumsDir, id, 'album.json'), 'utf8')));
    } catch (err) {
      console.warn(`跳过相册 ${id}：${err.message}`);
      continue;
    }
    for (const sub of ['originals', 'cache']) {
      const folder = join(albumsDir, id, sub);
      for (const name of await readdir(folder).catch(() => [])) {
        if (name.startsWith('.tmp-')) await rm(join(folder, name), { force: true });
      }
    }
  }

  // Tasks for one album run one after another; a failed task does not block the next.
  const queues = new Map();
  function queue(id, task) {
    const run = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(task);
    queues.set(id, run);
    return run;
  }

  const albumDir = (id) => join(albumsDir, id);
  function get(id) {
    const album = isAlbumId(id) ? albums.get(id) : null;
    if (!album) throw fail(404, '相册不存在');
    return album;
  }
  // Albums are replaced, never mutated, so a reader always sees a whole snapshot.
  async function save(album) {
    await writeJson(join(albumDir(album.id), 'album.json'), album);
    albums.set(album.id, album);
    return album;
  }

  return {
    dir,
    albumDir,
    get,
    save,
    queue,
    list() {
      return [...albums.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => {
          const cover = a.photos.find((p) => p.id === a.cover) ?? a.photos[0];
          return {
            id: a.id,
            title: a.title,
            count: a.photos.length,
            cover: cover ? { id: cover.id, w: cover.w, h: cover.h } : null,
            createdAt: a.createdAt,
          };
        });
    },
    async create(title) {
      const album = {
        version: 1,
        id: randomUUID(),
        title: cleanTitle(title),
        createdAt: new Date().toISOString(),
        cover: null,
        perPage: 2,
        nextSeq: 1,
        photos: [],
      };
      await mkdir(join(albumDir(album.id), 'originals'), { recursive: true });
      await mkdir(join(albumDir(album.id), 'cache'), { recursive: true });
      return save(album);
    },
    async update(id, patch) {
      get(id);
      if (!patch || typeof patch !== 'object') throw fail(400, '参数不对');
      return queue(id, () => {
        const album = get(id);
        const next = { ...album };
        if ('title' in patch) next.title = cleanTitle(patch.title);
        if ('cover' in patch) {
          if (patch.cover !== null && !album.photos.some((p) => p.id === patch.cover)) throw fail(400, '封面照片不存在');
          next.cover = patch.cover;
        }
        if ('perPage' in patch) {
          if (![1, 2, 3].includes(patch.perPage)) throw fail(400, '每页张数只能是 1、2、3');
          next.perPage = patch.perPage;
        }
        if ('order' in patch) {
          const byId = new Map(album.photos.map((p) => [p.id, p]));
          const order = patch.order;
          const same =
            Array.isArray(order) &&
            order.length === byId.size &&
            new Set(order).size === order.length &&
            order.every((pid) => byId.has(pid));
          if (!same) throw fail(409, '照片有变化，请刷新后再排');
          next.photos = order.map((pid) => byId.get(pid));
        }
        return save(next);
      });
    },
    async remove(id) {
      get(id);
      return queue(id, async () => {
        get(id);
        // Rename first, so the album is gone at once; a crash mid-delete only leaves a .del- folder.
        const doomed = join(albumsDir, `.del-${id}`);
        await rename(albumDir(id), doomed);
        albums.delete(id);
        await rm(doomed, { recursive: true, force: true });
      });
    },
    async deletePhotos(id, ids) {
      get(id);
      if (!Array.isArray(ids) || !ids.length) throw fail(400, '没有选中照片');
      return queue(id, async () => {
        const album = get(id);
        const drop = new Set(ids);
        const gone = album.photos.filter((p) => drop.has(p.id));
        if (!gone.length) return album;
        // album.json first: a crash afterwards only leaves files nobody points to.
        const next = await save({
          ...album,
          cover: drop.has(album.cover) ? null : album.cover,
          photos: album.photos.filter((p) => !drop.has(p.id)),
        });
        for (const p of gone) {
          await rm(join(albumDir(id), 'originals', p.file), { force: true });
          for (const size of [600, 1600]) await rm(join(albumDir(id), 'cache', `${p.id}_${size}.webp`), { force: true });
        }
        return next;
      });
    },
    phone: () => settings.phone,
    async setPhone(enabled) {
      settings = { ...settings, phone: { enabled: !!enabled, key: enabled ? newKey() : settings.phone.key } };
      await writeJson(settingsFile, settings);
      return settings.phone;
    },
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/check-library.mjs`
Expected: 一行 `跳过相册 00000000-…：…` 警告，然后是 `library ok`。

- [ ] **Step 5: 提交**

```bash
git add server/library.js
git commit -m "feat: add the photo library store with queued atomic album writes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: 导入与缓存图

**Files:**
- Create: `server/importer.js`
- Test: `/tmp/album-checks/fixtures.mjs`、`/tmp/album-checks/check-import.mjs`（仓库外）

**Interfaces:**
- Consumes（Task 2）：`fail`，以及 `Library` 的 `get`、`albumDir`、`queue`、`save`。
- Produces（`server/importer.js`）：
  - `MAX_BYTES = 100 * 1024 * 1024`。
  - `importPhoto(lib, albumId, req, name) → Promise<{ photo } | { skipped: 'duplicate' | 'unsupported' | 'too-large' }>`：
    - `req` 是可读流，带 `headers` 对象；
    - 相册不存在时抛 404；
    - 流出错时删掉临时文件，再把错误抛出去。
  - `makeCache(original, cacheDir, id) → Promise<{ w, h }>`：生成两张缓存图，返回摆正后的原图尺寸。
  - `ensureCache(lib, albumId, photo, size) → Promise<string>`：返回缓存图路径，缺了就重做；同一张照片同时只做一次。
- Produces（检查用，`/tmp/album-checks/fixtures.mjs`）：
  - `sharp`：从项目的 `node_modules` 加载；
  - `FIX`：fixtures 目录；
  - `makeFixtures() → Promise<{ land, rotated, tall, square, dot, heic, broken }>`，值都是文件路径。

- [ ] **Step 1: 写 fixtures 和检查脚本**

`/tmp/album-checks/fixtures.mjs`：

```js
// Test images for the checks. Run every check from the project root.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const sharp = createRequire(`${process.cwd()}/package.json`)('sharp');
export const FIX = '/tmp/album-checks/fixtures';
const solid = (w, h, background) => sharp({ create: { width: w, height: h, channels: 3, background } });

export async function makeFixtures() {
  mkdirSync(FIX, { recursive: true });
  const f = (name) => join(FIX, name);
  await solid(4000, 3000, '#d9a441').jpeg({ quality: 85 }).toFile(f('land.jpg'));
  // Stored 400×300 with EXIF orientation 6, so it is shown upright as 300×400.
  await solid(400, 300, '#2f6a8a').jpeg().withMetadata({ orientation: 6 }).toFile(f('rotated.jpg'));
  await solid(900, 1600, '#ef946b').png().toFile(f('tall.png'));
  await solid(1200, 1200, '#6d8868').webp().toFile(f('square.webp'));
  await solid(1, 1, '#000000').png().toFile(f('dot.png'));
  await solid(3000, 4000, '#b5d2ea').jpeg().toFile(f('portrait.jpg'));
  execFileSync('sips', ['-s', 'format', 'heic', f('portrait.jpg'), '--out', f('portrait.heic')], { stdio: 'ignore' });
  writeFileSync(f('broken.jpg'), 'this is not an image');
  return {
    land: f('land.jpg'),
    rotated: f('rotated.jpg'),
    tall: f('tall.png'),
    square: f('square.webp'),
    dot: f('dot.png'),
    heic: f('portrait.heic'),
    broken: f('broken.jpg'),
  };
}
```

`/tmp/album-checks/check-import.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-import.mjs
import assert from 'node:assert/strict';
import { createReadStream, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { FIX, makeFixtures, sharp } from './fixtures.mjs';

const { openLibrary } = await import(`${process.cwd()}/server/library.js`);
const { importPhoto, ensureCache, MAX_BYTES } = await import(`${process.cwd()}/server/importer.js`);
const dir = '/tmp/album-checks/lib-import';
rmSync(dir, { recursive: true, force: true });
const fx = await makeFixtures();
const lib = await openLibrary(dir);
const album = await lib.create('导入');
const cache = join(dir, 'albums', album.id, 'cache');
const originals = join(dir, 'albums', album.id, 'originals');
const send = (path, name = path.split('/').pop()) => {
  const req = createReadStream(path);
  req.headers = { 'content-length': String(statSync(path).size) };
  return importPhoto(lib, album.id, req, name);
};
const size = async (file) => {
  const m = await sharp(file).metadata();
  return [m.format, m.width, m.height];
};

const land = (await send(fx.land, 'IMG_0001.JPG')).photo;
assert.deepEqual([land.id, land.file, land.name, land.w, land.h], ['p001', 'p001.jpg', 'IMG_0001.JPG', 4000, 3000]);
assert.match(land.sha256, /^[0-9a-f]{64}$/);
assert.deepEqual(await size(join(cache, 'p001_1600.webp')), ['webp', 1600, 1200]);
assert.deepEqual(await size(join(cache, 'p001_600.webp')), ['webp', 600, 450]);
assert.equal((await send(fx.land)).skipped, 'duplicate');

const rotated = (await send(fx.rotated)).photo;
assert.deepEqual([rotated.w, rotated.h], [300, 400]);
assert.deepEqual(await size(join(cache, `${rotated.id}_1600.webp`)), ['webp', 300, 400]); // upright, not enlarged
assert.ok((await send(fx.tall)).photo.file.endsWith('.png'));
assert.equal((await send(fx.square)).photo.w, 1200);
const dot = (await send(fx.dot)).photo;
assert.deepEqual([dot.w, dot.h], [1, 1]);
const heic = (await send(fx.heic)).photo;
assert.deepEqual([heic.file.endsWith('.heic'), heic.w, heic.h], [true, 3000, 4000]);
assert.equal((await send(fx.broken)).skipped, 'unsupported');

// Too large: by Content-Length, and by counting bytes when the length is unknown.
const big = Readable.from([]);
big.headers = { 'content-length': String(MAX_BYTES + 1) };
assert.equal((await importPhoto(lib, album.id, big, 'big.jpg')).skipped, 'too-large');
const mb = Buffer.alloc(1024 * 1024);
const endless = Readable.from((function* () { for (let i = 0; i <= 100; i++) yield mb; })());
endless.headers = {};
assert.equal((await importPhoto(lib, album.id, endless, 'big2.jpg')).skipped, 'too-large');

// Review focus «twins»: the same photo sent twice at once is imported once.
const twin = join(FIX, 'twin.jpg');
await sharp({ create: { width: 640, height: 480, channels: 3, background: '#8db2c6' } }).jpeg().toFile(twin);
const pair = await Promise.all([send(twin), send(twin)]);
assert.deepEqual(pair.map((r) => (r.photo ? 'photo' : r.skipped)).sort(), ['duplicate', 'photo']);

// Review focus «cut»: an upload cut off half way leaves no temp file and no photo.
const cut = new Readable({ read() {} });
cut.headers = { 'content-length': '5000' };
cut.push(Buffer.alloc(1000));
setTimeout(() => cut.destroy(new Error('aborted')), 20);
await assert.rejects(importPhoto(lib, album.id, cut, 'cut.jpg'));
assert.deepEqual(readdirSync(originals).filter((n) => n.startsWith('.tmp-')), []);
assert.deepEqual(readdirSync(cache).filter((n) => n.startsWith('.tmp-')), []);

const saved = JSON.parse(readFileSync(join(dir, 'albums', album.id, 'album.json'), 'utf8'));
assert.deepEqual(saved.photos.map((p) => p.id), ['p001', 'p002', 'p003', 'p004', 'p005', 'p006', 'p007']);
assert.equal(saved.nextSeq, 8);
assert.ok(existsSync(join(originals, 'p006.heic')));

// Missing cache images are rebuilt once, even when asked for twice at the same time.
rmSync(join(cache, 'p001_600.webp'));
rmSync(join(cache, 'p001_1600.webp'));
const files = await Promise.all([600, 1600].map((s) => ensureCache(lib, album.id, saved.photos[0], s)));
assert.ok(files.every((f) => existsSync(f)));
await assert.rejects(ensureCache(lib, album.id, { id: 'p099', file: 'p099.jpg' }, 600)); // no original
await assert.rejects(importPhoto(lib, '00000000-0000-4000-8000-000000000000', createReadStream(fx.land), 'x.jpg'), (e) => e.status === 404);
console.log('import ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-import.mjs`
Expected: FAIL，`Cannot find module '…/cardart/server/importer.js'`

- [ ] **Step 3: 实现 server/importer.js**

`server/importer.js`：

```js
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { fail } from './library.js';

const run = promisify(execFile);
export const MAX_BYTES = 100 * 1024 * 1024;
const FORMAT_EXT = { jpeg: '.jpg', heif: '.heic' };
const tmpName = () => `.tmp-${randomBytes(8).toString('hex')}`;

// The 1600 image comes from the source, the 600 from the upright 1600: one full decode per photo.
async function render(src, cacheDir, id) {
  const big = join(cacheDir, `${id}_1600.webp`);
  await sharp(src, { failOn: 'error' })
    .autoOrient()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(big);
  await sharp(big)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(join(cacheDir, `${id}_600.webp`));
  const { autoOrient } = await sharp(src).metadata();
  return { w: autoOrient.width, h: autoOrient.height };
}

// sharp's prebuilt libvips cannot decode HEIC (HEVC); on macOS, sips converts it to JPEG first.
export async function makeCache(original, cacheDir, id) {
  try {
    return await render(original, cacheDir, id);
  } catch (err) {
    if (process.platform !== 'darwin') throw err;
    const jpeg = join(cacheDir, `${tmpName()}.jpg`);
    try {
      await run('sips', ['-s', 'format', 'jpeg', original, '--out', jpeg]);
      return await render(jpeg, cacheDir, id);
    } finally {
      await rm(jpeg, { force: true });
    }
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
    let size;
    try {
      size = await makeCache(tmp, join(dir, 'cache'), id);
    } catch {
      await rm(tmp, { force: true });
      return { skipped: 'unsupported' };
    }
    let ext = extname(name).toLowerCase();
    if (!/^\.[a-z0-9]{1,5}$/.test(ext)) {
      const { format } = await sharp(tmp).metadata().catch(() => ({ format: 'heif' }));
      ext = FORMAT_EXT[format] ?? `.${format}`;
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
```

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/check-import.mjs`
Expected: `import ok`（大约 10 秒，主要花在 4000×3000 图的解码上）。

- [ ] **Step 5: 提交**

```bash
git add server/importer.js
git commit -m "feat: import photos with dedupe, HEIC via sips and two WebP cache sizes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: HTTP 服务

**Files:**
- Create: `server/app.js`、`server/index.js`、`vite.config.js`
- Test: `/tmp/album-checks/check-server.mjs`（仓库外）

**Interfaces:**
- Consumes：
  - Task 2：`openLibrary`、`fail`、`isAlbumId`、`isPhotoId`、`DEFAULT_DIR`；
  - Task 3：`importPhoto`、`ensureCache`。
- Produces（`server/app.js`）：
  - `lanAddresses() → string[]`：非内部、非 169.254 的 IPv4 地址，en0、en1 排在前面。
  - `createHandler(lib) → (req, res, next)`：
    - 先做访问控制（spec §12），再处理 `/api/*` 和 `/media/*`，其他请求交给 `next()`；
    - 出错时回 `{ error }`，状态码取 `err.status`，默认 500。
  - `startServer({ dir, port = 5180, host = '0.0.0.0', dist }) → Promise<{ url, close() }>`：打开相册库，用 `createHandler` 处理请求，其余请求从 `dist/` 提供静态文件；`port: 0` 时随机分配端口。
- 接口表见 spec §7。`GET/PATCH /api/phone` 返回 `{ enabled, key, ip, port }`，`ip` 是 `lanAddresses()[0] ?? null`，`port` 是请求进来的端口。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-server.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-server.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { makeFixtures } from './fixtures.mjs';

const { startServer, lanAddresses } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-server';
const dist = '/tmp/album-checks/dist-server';
rmSync(dir, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(`${dist}/assets`, { recursive: true });
writeFileSync(`${dist}/index.html`, '<!doctype html><title>相册</title>');
writeFileSync(`${dist}/assets/app-1.js`, 'console.log(1)');
const fx = await makeFixtures();
const server = await startServer({ dir, port: 0, dist });
const base = server.url.replace(/\/$/, '');
const port = new URL(base).port;
const json = (method, path, body) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
// Raw request, so Host, Origin and Cookie can be anything and the source can be a LAN address.
const raw = (method, path, headers = {}, body = '', target = '127.0.0.1') =>
  new Promise((ok, bad) => {
    const req = http.request({ host: target, port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', bad);
    req.end(body);
  });

// Static files.
let res = await fetch(`${base}/`);
assert.equal(res.status, 200);
assert.equal(res.headers.get('cache-control'), 'no-cache');
assert.equal((await fetch(`${base}/assets/app-1.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
assert.equal((await fetch(`${base}/assets/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
assert.equal((await fetch(`${base}/nope.html`)).status, 404);

// Albums.
assert.deepEqual(await (await fetch(`${base}/api/albums`)).json(), []);
const album = await (await json('POST', '/api/albums', { title: '京都' })).json();
assert.equal(album.title, '京都');
assert.equal((await fetch(`${base}/api/albums`, { method: 'POST', body: '{"title":"x"}' })).status, 415);
assert.equal((await json('POST', '/api/albums', { title: '' })).status, 400);
assert.equal((await fetch(`${base}/api/albums/not-a-uuid`)).status, 404);

// Uploads; review focus «odd file name».
const upload = (file, name, headers = { 'X-Album-Upload': '1' }) =>
  fetch(`${base}/api/albums/${album.id}/photos?name=${encodeURIComponent(name)}`, { method: 'POST', headers, body: readFileSync(file) });
assert.equal((await upload(fx.land, 'a.jpg', {})).status, 403);
const name = '照片 #1 100%.jpg';
const { photo } = await (await upload(fx.land, name)).json();
assert.equal(photo.name, name);
await upload(fx.tall, 'b.png');
assert.equal((await (await upload(fx.land, 'again.jpg')).json()).skipped, 'duplicate');
res = await fetch(`${base}/api/albums/${album.id}/photos?name=huge.jpg`, {
  method: 'POST',
  headers: { 'X-Album-Upload': '1' },
  body: new Uint8Array(100 * 1024 * 1024 + 1),
});
assert.equal((await res.json()).skipped, 'too-large');

// Media.
res = await fetch(`${base}/media/${album.id}/${photo.id}/600`);
assert.equal(res.status, 200);
assert.equal(res.headers.get('content-type'), 'image/webp');
assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
res = await fetch(`${base}/media/${album.id}/${photo.id}/original`);
assert.equal(res.headers.get('content-type'), 'image/jpeg');
assert.equal(decodeURIComponent(res.headers.get('content-disposition').split("''")[1]), name);
for (const bad of [
  `/media/${album.id}/p999/600`,
  `/media/${album.id}/${photo.id}/800`,
  '/media/not-a-uuid/p001/600',
  `/media/${album.id}/..%2f..%2falbum.json/600`,
]) {
  assert.equal((await fetch(base + bad)).status, 404, bad);
}

// Order, cover, delete.
assert.equal((await json('PATCH', `/api/albums/${album.id}`, { order: ['p002'] })).status, 409);
res = await json('PATCH', `/api/albums/${album.id}`, { order: ['p002', 'p001'], cover: 'p001' });
assert.deepEqual((await res.json()).photos.map((p) => p.id), ['p002', 'p001']);
res = await json('POST', `/api/albums/${album.id}/photos/delete`, { ids: ['p001'] });
assert.equal((await res.json()).cover, null);
assert.equal((await fetch(`${base}/media/${album.id}/p001/600`)).status, 404); // deleted for good
assert.ok(!existsSync(`${dir}/albums/${album.id}/originals/p001.jpg`));

// Host and Origin (spec §12).
assert.equal((await raw('GET', '/api/albums', { Host: `evil.example:${port}` })).status, 403);
const post = (origin) =>
  raw('POST', '/api/albums', { Host: `localhost:${port}`, Origin: origin, 'Content-Type': 'application/json' }, '{"title":"同源"}');
assert.equal((await post('http://evil.example')).status, 403);
assert.equal((await post(`http://localhost:${port}`)).status, 200);

// Phone access from the LAN.
let phone = await (await fetch(`${base}/api/phone`)).json();
assert.equal(phone.enabled, false);
assert.equal(String(phone.port), port);
const ip = lanAddresses()[0];
if (!ip) console.log('skip LAN checks: this machine has no LAN address');
else {
  const lan = (path, cookie) => raw('GET', path, { Host: `${ip}:${port}`, ...(cookie && { Cookie: cookie }) }, '', ip);
  assert.match((await lan('/')).body, /手机访问已关闭，请在电脑上打开「手机访问」/);
  phone = await (await json('PATCH', '/api/phone', { enabled: true })).json();
  assert.equal(phone.enabled, true);
  assert.equal((await lan('/?key=wrong')).status, 403);
  res = await lan(`/?key=${phone.key}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/');
  const set = res.headers['set-cookie'][0];
  assert.equal(set, `album_key=${phone.key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  const cookie = set.split(';')[0];
  assert.equal((await lan('/api/albums', cookie)).status, 200);
  assert.equal((await lan('/api/phone', cookie)).status, 403); // settings stay on the computer
  assert.equal((await lan('/api/albums')).status, 403); // no cookie
  await json('PATCH', '/api/phone', { enabled: false });
  assert.equal((await lan('/api/albums', cookie)).status, 403);
  const again = await (await json('PATCH', '/api/phone', { enabled: true })).json();
  assert.notEqual(again.key, phone.key);
  assert.equal((await lan('/api/albums', cookie)).status, 403); // the old link is dead
  await json('PATCH', '/api/phone', { enabled: false });
}
await server.close();
console.log('server ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-server.mjs`
Expected: FAIL，`Cannot find module '…/cardart/server/app.js'`

- [ ] **Step 3: 实现 server/app.js**

`server/app.js`：

```js
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
  if (!local) {
    const { enabled, key } = lib.phone();
    if (!enabled) {
      send(res, 403, page('手机访问已关闭，请在电脑上打开「手机访问」'));
      return null;
    }
    const given = url.searchParams.get('key');
    if (given !== null) {
      if (!same(given, key)) send(res, 403, page('链接已失效，请在电脑上重新扫码'));
      else {
        res.writeHead(302, {
          Location: '/',
          'Set-Cookie': `album_key=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
          'Cache-Control': 'no-store',
        });
        res.end();
      }
      return null;
    }
    if (!same(cookie(req, 'album_key'), key)) {
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
```

- [ ] **Step 4: 实现 server/index.js 和 vite.config.js**

`server/index.js`：

```js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';
import { DEFAULT_DIR } from './library.js';

const dir = process.env.ALBUM_LIBRARY || DEFAULT_DIR;
const port = Number(process.env.PORT) || 5180;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const { url } = await startServer({ dir, port, dist });
  console.log(`相册已启动：${url}\n相册库：${dir}`);
} catch (err) {
  if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 被占用，可以用 PORT=xxxx npm start 换一个`);
  else if (['EACCES', 'EPERM', 'EROFS', 'ENOTDIR'].includes(err.code)) console.error(`相册库目录不可写：${dir}（${err.message}）`);
  else console.error(err);
  process.exit(1);
}
```

`vite.config.js`：

```js
import { defineConfig } from 'vite';
import { createHandler } from './server/app.js';
import { DEFAULT_DIR, openLibrary } from './server/library.js';

// Dev only: the same API as `npm start`, in the Vite process (spec §4). Added directly in
// configureServer, so it runs before Vite's own middlewares and guards every request.
export default defineConfig({
  plugins: [
    {
      name: 'album-api',
      async configureServer(server) {
        const lib = await openLibrary(process.env.ALBUM_LIBRARY || DEFAULT_DIR);
        server.middlewares.use(createHandler(lib));
      },
    },
  ],
});
```

- [ ] **Step 5: 运行，确认通过**

Run: `node /tmp/album-checks/check-server.mjs`
Expected: `server ok`（没有局域网地址时会多一行 `skip LAN checks…`）。

- [ ] **Step 6: 冒烟：`npm start` 与 `npm run dev`**

Run:

```bash
npm run build
PORT=5199 ALBUM_LIBRARY=/tmp/album-checks/lib-start node server/index.js & SERVER=$!; sleep 1
curl -s -o /dev/null -w "start %{http_code}\n" http://localhost:5199/
PORT=5199 ALBUM_LIBRARY=/tmp/album-checks/lib-start node server/index.js; echo "exit $?"
kill $SERVER
ALBUM_LIBRARY=/tmp/album-checks/lib-dev node node_modules/vite/bin/vite.js --port 5198 --strictPort > /tmp/album-checks/vite.log 2>&1 & VITE=$!; sleep 3
curl -s http://localhost:5198/api/albums; echo
kill $VITE
```

Expected：
- `start 200`；
- 第二次启动打印 `端口 5199 被占用，可以用 PORT=xxxx npm start 换一个`，然后是 `exit 1`；
- 最后一行是开发服务器返回的 `[]`。

- [ ] **Step 7: 提交**

```bash
git add server/app.js server/index.js vite.config.js
git commit -m "feat: serve the album API, media and the built app with LAN access control" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: 管理页面（相册墙、相册页）

**Files:**
- Create: `src/router.js`、`src/api.js`、`src/ui.js`、`src/wall.js`、`src/album.js`
- Modify: `src/main.js`（整个替换）、`src/style.css`（换掉入口页样式，加管理页面样式）、`index.html`（标题）
- Delete: `public/cards.json`
- Test: `/tmp/album-checks/cdp.mjs`、`/tmp/album-checks/check-pages.mjs`（仓库外）

**Interfaces:**
- Consumes: Task 4 的接口（spec §7）。
- Produces:
  - `src/router.js`：
    - `parse(hash) → { album: string | null, three: boolean, photo: string | null }`；
    - `start(listener)`：注册监听，并立即用当前地址调用一次；
    - `open(hash)`：新增一条历史记录；
    - `close(hash)`：这条记录是应用里打开的就后退，否则替换成 `hash`；
    - `swap(hash)`：只换地址，不加记录、不触发监听。
  - `src/api.js`：
    - `api.albums()`、`api.album(id)`、`api.createAlbum(title)`、`api.updateAlbum(id, patch)`、`api.deleteAlbum(id)`、`api.deletePhotos(id, ids)`、`api.phone()`、`api.setPhone(enabled)`、`api.upload(id, file)`；
    - 失败时抛 `Error`，带 `status` 字段；
    - `mediaUrl(albumId, photoId, size)`。
  - `src/ui.js`：
    - `icon(name)`：返回 SVG 字符串，name 取 `book bookOpen close prev next phone plus upload more trash star expand check copy`；
    - `toast(text, ms = 3000)`；
    - `dialog({ title, text?, value?, ok?, danger? }) → Promise<true | string | null>`：传了 `value` 时显示输入框，返回去掉首尾空格的文字；取消、Esc 或空输入返回 `null`。
  - `src/wall.js`：`renderWall(app) → { destroy() }`。
  - `src/album.js`：`renderAlbum(app, id) → { update(route), destroy() }`。
  - 页面结构里的类名和 `data-act`，后面的检查脚本要用：
    - 相册墙：`.album`、`[data-act=new|menu|rename|delete]`；
    - 相册页：`.tile[data-id]`、`.badge`、`.title`、`.count`、`.picked`、`.drop`、`.upload small`、`input[type=file]`、`[data-act=back|select|cancel|delete|upload|3d|rename]`。
- Produces（检查用，`/tmp/album-checks/cdp.mjs`）：`launch({ width = 1280, height = 800, mobile = false }) → Browser`。`Browser` 有：
  - `send(method, params)`、`evaluate(expr)`、`waitFor(expr, ms = 10000)`；
  - `goto(url)`、`click(selector)`、`mouse(type, x, y, buttons = 1)`、`key(key)`、`touch(type, x, y)`；
  - `files(selector, paths)`、`shot(path)`、`close()`；
  - `errors: string[]`：收集页面异常和 `console.error`。
  - 另外导出 `sleep(ms)`。

- [ ] **Step 1: 写 cdp.mjs 和检查脚本**

`/tmp/album-checks/cdp.mjs`：

```js
// Minimal DevTools-protocol driver for headless Chrome (checks only).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VK = { ArrowLeft: 37, ArrowRight: 39, Escape: 27, Enter: 13, PageUp: 33, PageDown: 34 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1280, height = 800, mobile = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'album-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  // Also after a failed assertion: no Chrome or profile is left behind.
  process.on('exit', () => {
    proc.kill();
    rmSync(profile, { recursive: true, force: true });
  });
  let targets = [];
  for (let i = 0; i < 100 && !targets.some((t) => t.type === 'page'); i++) {
    await sleep(100);
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => []);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok) => (ws.onopen = ok));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) =>
    new Promise((ok, bad) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? bad(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, ms = 10000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await evaluate(expression).catch(() => null);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out: ${expression}`);
      await sleep(50);
    }
  };
  return {
    send,
    evaluate,
    waitFor,
    errors,
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(100);
      await waitFor('document.readyState === "complete"');
    },
    async click(selector) {
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    },
    mouse: (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 }),
    async key(key) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0 });
    },
    touch: (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }),
    async files(selector, paths) {
      const { root } = await send('DOM.getDocument');
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      await send('DOM.setFileInputFiles', { nodeId, files: paths });
    },
    async shot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    async close() {
      ws.close();
      proc.kill();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
```

`/tmp/album-checks/check-pages.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-pages.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { makeFixtures } from './fixtures.mjs';

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-pages';
rmSync(dir, { recursive: true, force: true });
const fx = await makeFixtures();
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const fill = (text) =>
  `(() => { const i = document.querySelector('dialog[open] .dlg-input'); i.value = ${JSON.stringify(text)}; document.querySelector('dialog[open] [value=ok]').click(); })()`;
const order = `[...document.querySelectorAll('.grid .tile')].map((t) => t.dataset.id).join()`;
const center = (b, sel) =>
  b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

const b = await launch();
await b.goto(server.url);
await b.waitFor(`!document.querySelector('.empty').hidden`);

// New album through the dialog.
await b.click('[data-act=new]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-input')?.value === '新相册'`);
await b.evaluate(fill('京都旅行'));
await b.waitFor(`location.hash.startsWith('#/a/') && document.querySelector('.title')?.textContent === '京都旅行'`);
assert.equal(await b.evaluate(`document.querySelector('.drop').hidden`), false);
assert.equal(await b.evaluate(`document.querySelector('[data-act=select]').disabled`), true);

// Upload seven files: one duplicate, one broken.
await b.files('input[type=file]', [fx.land, fx.rotated, fx.tall, fx.square, fx.heic, fx.land, fx.broken]);
await b.waitFor(`document.querySelector('.upload small')?.textContent.startsWith('已导入')`, 60000);
assert.equal(await b.evaluate(`document.querySelector('.upload small').textContent`), '已导入 5 张，跳过 2 张（重复 1，格式不支持 1）');
assert.equal(await b.evaluate(order), 'p001,p002,p003,p004,p005');
assert.equal(await b.evaluate(`document.querySelector('.count').textContent`), '5 张');
assert.equal(await b.evaluate(`document.querySelector('.badge').closest('.tile').dataset.id`), 'p001');

// Drag p001 onto p003 with the mouse; the order is saved.
const from = await center(b, '.tile[data-id=p001]');
const to = await center(b, '.tile[data-id=p003]');
await b.mouse('mousePressed', from.x, from.y);
for (let t = 1; t <= 10; t++) await b.mouse('mouseMoved', from.x + ((to.x - from.x) * t) / 10, from.y + ((to.y - from.y) * t) / 10);
await b.mouse('mouseReleased', to.x, to.y, 0);
await b.waitFor(`${order} === 'p002,p003,p001,p004,p005'`);
await sleep(300);
await b.evaluate('location.reload()');
await b.waitFor(`${order} === 'p002,p003,p001,p004,p005'`);
assert.equal(await b.evaluate(`document.querySelector('.badge').closest('.tile').dataset.id`), 'p002');
assert.equal(await b.evaluate('location.hash.endsWith("/p/p001")'), false); // the drag was not a click

// Select two and delete them.
await b.click('[data-act=select]');
await b.click('.tile[data-id=p004]');
await b.click('.tile[data-id=p005]');
assert.equal(await b.evaluate(`document.querySelector('.picked').textContent`), '已选 2 张');
await b.click('.acts.picking [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-text')?.textContent === '删除 2 张照片？删除后不能恢复。'`);
await b.click('dialog[open] [value=ok]');
await b.waitFor(`document.querySelectorAll('.grid .tile').length === 3 && document.querySelector('.acts.picking').hidden`);

// Rename from the title.
await b.click('.title');
await b.waitFor(`document.querySelector('dialog[open] .dlg-input')`);
await b.evaluate(fill('京都 2024'));
await b.waitFor(`document.querySelector('.title').textContent === '京都 2024'`);

// Back to the wall: card, menu, delete.
await b.click('[data-act=back]');
await b.waitFor(`document.querySelector('.album h2')?.textContent === '京都 2024'`);
assert.equal(await b.evaluate(`document.querySelector('.album .names p').textContent`), '3 张');
assert.ok(await b.evaluate(`!!document.querySelector('.album .cover img')`));
await b.click('.album [data-act=menu]');
await b.click('.menu [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-text')?.textContent === '删除相册「京都 2024」？相册里的照片会一起删除，不能恢复。'`);
await b.click('dialog[open] [value=ok]');
await b.waitFor(`document.querySelectorAll('.album').length === 0 && !document.querySelector('.empty').hidden`);
assert.deepEqual(b.errors, []);
await b.close();

// Phone layout: two-column wall, three-column grid, floating buttons.
const api = (path, init) => fetch(server.url.replace(/\/$/, '') + path, init).then((r) => r.json());
const album = await api('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"手机"}' });
await api(`/api/albums/${album.id}/photos?name=a.jpg`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(fx.tall) });
const m = await launch({ width: 390, height: 844, mobile: true });
await m.goto(server.url);
await m.waitFor(`document.querySelectorAll('.album').length === 1`);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.wall')).gridTemplateColumns.split(' ').length`), 2);
await m.goto(`${server.url}#/a/${album.id}`);
await m.waitFor(`document.querySelectorAll('.grid .tile').length === 1`);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length`), 3);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.fab')).display`), 'flex');
assert.deepEqual(m.errors, []);
await m.close();
await server.close();
console.log('pages ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-pages.mjs`
Expected: FAIL，`timed out: !document.querySelector('.empty').hidden`（页面还是旧的卡册入口页）。

- [ ] **Step 3: 共用模块**

`src/router.js`：

```js
// Hash routes (spec §9): #/ · #/a/<id> · #/a/<id>/p/<photo> · #/a/<id>/3d · #/a/<id>/3d/p/<photo>
let listener = () => {};

export function parse(hash) {
  const m = /^#\/a\/([0-9a-f-]{36})(\/3d)?(?:\/p\/(p\d{3,}))?$/.exec(hash);
  return m ? { album: m[1], three: !!m[2], photo: m[3] ?? null } : { album: null, three: false, photo: null };
}

const emit = () => listener(parse(location.hash));

export function start(fn) {
  listener = fn;
  window.addEventListener('hashchange', emit);
  emit();
}

// A new history entry, so the back button undoes it.
export function open(hash) {
  history.pushState({ inApp: true }, '', hash);
  emit();
}

// Goes back when the entry was opened in the app; otherwise (e.g. after a reload) replaces it.
export function close(hash) {
  if (history.state?.inApp) history.back();
  else {
    history.replaceState(null, '', hash);
    emit();
  }
}

// Changes the address only: no new entry, no re-render (paging in the lightbox).
export function swap(hash) {
  history.replaceState(history.state, '', hash);
}
```

`src/api.js`：

```js
async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  albums: () => call('GET', '/api/albums'),
  album: (id) => call('GET', `/api/albums/${id}`),
  createAlbum: (title) => call('POST', '/api/albums', { title }),
  updateAlbum: (id, patch) => call('PATCH', `/api/albums/${id}`, patch),
  deleteAlbum: (id) => call('DELETE', `/api/albums/${id}`),
  deletePhotos: (id, ids) => call('POST', `/api/albums/${id}/photos/delete`, { ids }),
  phone: () => call('GET', '/api/phone'),
  setPhone: (enabled) => call('PATCH', '/api/phone', { enabled }),
  async upload(id, file) {
    const res = await fetch(`/api/albums/${id}/photos?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'X-Album-Upload': '1' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  },
};

export const mediaUrl = (albumId, photoId, size) => `/media/${albumId}/${photoId}/${size}`;
```

`src/ui.js`：

```js
const PATHS = {
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
};

export const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

let toastEl = null;
export function toast(text, ms = 3000) {
  toastEl ??= Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
  if (!toastEl.isConnected) document.body.append(toastEl);
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => (toastEl.hidden = true), ms);
}

// Native modal <dialog>. With `value` it shows a text field and resolves to the trimmed text,
// otherwise to true. Cancel, Esc or an empty field resolve to null.
export function dialog({ title, text = '', value = null, ok = '确定', danger = false }) {
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.innerHTML = `
    <form method="dialog">
      <h3></h3>
      <p class="dlg-text"></p>
      <input class="dlg-input" maxlength="50" autocomplete="off">
      <div class="dlg-acts">
        <button class="btn" type="button" data-act="cancel">取消</button>
        <button class="btn ${danger ? 'danger' : 'pri'}" value="ok"></button>
      </div>
    </form>`;
  d.querySelector('h3').textContent = title;
  d.querySelector('.dlg-text').textContent = text;
  d.querySelector('.dlg-text').hidden = !text;
  const input = d.querySelector('.dlg-input');
  input.hidden = value === null;
  input.value = value ?? '';
  d.querySelector('[value=ok]').textContent = ok;
  d.querySelector('[data-act=cancel]').onclick = () => d.close();
  document.body.append(d);
  d.showModal();
  if (value !== null) input.select();
  return new Promise((resolve) => {
    d.addEventListener('close', () => {
      d.remove();
      if (d.returnValue !== 'ok') return resolve(null);
      resolve(value === null ? true : input.value.trim() || null);
    });
  });
}
```

`src/main.js`（整个替换）：

```js
import './style.css';
import { renderAlbum } from './album.js';
import { start } from './router.js';
import { renderWall } from './wall.js';

const app = document.querySelector('#app');
let view = null;

start((route) => {
  const key = route.album ?? 'wall';
  if (view?.key !== key) {
    view?.destroy();
    view = { key, ...(route.album ? renderAlbum(app, route.album) : renderWall(app)) };
    scrollTo(0, 0);
  }
  view.update?.(route);
});
```

`index.html`：把 `<title>3D 卡册</title>` 改成 `<title>相册</title>`。

Run: `git rm public/cards.json`

- [ ] **Step 4: 相册墙**

`src/wall.js`：

```js
import { api, mediaUrl } from './api.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';

export function renderWall(app) {
  let alive = true;
  let albums = [];
  document.title = '相册';
  app.innerHTML = `
    <main class="mgr">
      <header class="bar">
        <h1 class="brand"><span class="logo">${icon('book')}</span>相册</h1>
        <span class="sp"></span>
        <button class="btn pri" type="button" data-act="new" aria-label="新建相册">${icon('plus')}<span>新建相册</span></button>
      </header>
      <div class="wall"></div>
      <p class="empty" hidden>还没有相册，点「新建相册」开始。</p>
    </main>`;
  const wall = app.querySelector('.wall');

  async function load() {
    try {
      const list = await api.albums();
      if (!alive) return;
      albums = list;
      wall.replaceChildren(...albums.map(card));
      app.querySelector('.empty').hidden = albums.length > 0;
    } catch (err) {
      if (alive) toast(`加载失败：${err.message}`);
    }
  }

  function card(a) {
    const el = document.createElement('article');
    el.className = 'album';
    el.dataset.id = a.id;
    el.innerHTML = `
      <a class="cover" href="#/a/${a.id}" data-act="open">${a.cover ? `<img alt="" src="${mediaUrl(a.id, a.cover.id, 600)}">` : icon('book')}</a>
      <div class="meta">
        <div class="names"><h2></h2><p>${a.count} 张</p></div>
        <button class="ibtn" type="button" data-act="menu" aria-label="更多">${icon('more')}</button>
      </div>`;
    el.querySelector('h2').textContent = a.title;
    return el;
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    const a = albums.find((x) => x.id === e.target.closest('.album')?.dataset.id);
    if (act !== 'menu') closeMenu();
    try {
      if (act === 'open') {
        e.preventDefault();
        open(`#/a/${a.id}`);
      } else if (act === 'menu') {
        const shown = target.parentElement.querySelector('.menu');
        closeMenu();
        if (!shown) {
          target.insertAdjacentHTML(
            'afterend',
            '<div class="menu" role="menu"><button type="button" data-act="rename">重命名</button><button type="button" class="red" data-act="delete">删除相册</button></div>',
          );
        }
      } else if (act === 'new') {
        const title = await dialog({ title: '新建相册', value: '新相册', ok: '创建' });
        if (title) open(`#/a/${(await api.createAlbum(title)).id}`);
      } else if (act === 'rename') {
        const title = await dialog({ title: '重命名相册', value: a.title, ok: '保存' });
        if (title && title !== a.title) await api.updateAlbum(a.id, { title });
        load();
      } else if (act === 'delete') {
        const text = `删除相册「${a.title}」？相册里的照片会一起删除，不能恢复。`;
        if (await dialog({ title: '删除相册', text, ok: '删除', danger: true })) await api.deleteAlbum(a.id);
        load();
      }
    } catch (err) {
      toast(`操作失败：${err.message}`);
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

- [ ] **Step 5: 相册页**

`src/album.js`：

```js
import { api, mediaUrl } from './api.js';
import { close, open } from './router.js';
import { dialog, icon, toast } from './ui.js';

const fine = matchMedia('(pointer: fine)');
const SKIP = { duplicate: 'dup', unsupported: 'bad', 'too-large': 'big' };

export function renderAlbum(app, id) {
  let album = null;
  let alive = true;
  let route = { album: id, three: false, photo: null };
  let selecting = false;
  const selected = new Set();
  let drag = null;
  let suppressClick = false;
  const queue = [];
  const tally = { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 };
  let uploading = false;

  app.innerHTML = `
    <main class="mgr album-page">
      <header class="bar">
        <button class="btn ghost" type="button" data-act="back">${icon('prev')}<span>全部相册</span></button>
        <div class="ttl"><h1><button class="title" type="button" data-act="rename" title="点击改名"></button></h1><span class="count"></span></div>
        <span class="sp"></span>
        <div class="acts normal">
          <button class="btn" type="button" data-act="select">选择</button>
          <button class="btn" type="button" data-act="upload">${icon('upload')}<span>上传照片</span></button>
          <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>3D 翻阅</span></button>
        </div>
        <div class="acts picking" hidden>
          <button class="btn ghost" type="button" data-act="cancel">取消</button>
          <span class="picked"></span>
          <button class="btn danger" type="button" data-act="delete">${icon('trash')}<span>删除</span></button>
        </div>
      </header>
      <div class="grid" hidden></div>
      <div class="drop" hidden>
        ${icon('upload')}
        <b>把照片拖到这里</b>
        <span>或 <button class="link" type="button" data-act="upload">点这里选择照片</button></span>
        <small>支持 JPG、PNG、HEIC、WebP</small>
      </div>
      <div class="fab">
        <button class="btn" type="button" data-act="upload">${icon('upload')}<span>上传</span></button>
        <button class="btn pri" type="button" data-act="3d">${icon('book')}<span>3D 翻阅</span></button>
      </div>
      <input type="file" accept="image/*,.heic,.heif" multiple hidden>
      <div class="upload" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>
    </main>`;
  const $ = (s) => app.querySelector(s);
  const main = $('.mgr');
  const grid = $('.grid');
  const input = $('input[type=file]');
  const box = $('.upload');

  async function load() {
    try {
      const next = await api.album(id);
      if (!alive) return;
      const same = album && JSON.stringify(next) === JSON.stringify(album);
      album = next;
      if (!same) render();
    } catch (err) {
      if (!alive) return;
      if (err.status === 404) main.innerHTML = '<p class="empty">相册不存在。<a href="#/">回到全部相册</a></p>';
      else toast(`加载失败：${err.message}`);
    }
  }

  function tile(p, isCover) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.dataset.id = p.id;
    t.classList.toggle('sel', selected.has(p.id));
    t.innerHTML = `<img alt="" loading="lazy" draggable="false" src="${mediaUrl(id, p.id, 600)}">${isCover ? '<span class="badge">封面</span>' : ''}<span class="chk">${icon('check')}</span>`;
    t.querySelector('img').onerror = () => t.classList.add('missing');
    return t;
  }

  function render() {
    const n = album.photos.length;
    $('.title').textContent = album.title;
    $('.count').textContent = `${n} 张`;
    document.title = `${album.title} · 相册`;
    $('.drop').hidden = n > 0;
    grid.hidden = n === 0;
    for (const b of app.querySelectorAll('[data-act=select], [data-act="3d"]')) b.disabled = n === 0;
    const cover = album.cover ?? album.photos[0]?.id;
    for (const pid of selected) if (!album.photos.some((p) => p.id === pid)) selected.delete(pid);
    grid.replaceChildren(...album.photos.map((p) => tile(p, p.id === cover)));
    renderPicking();
  }

  function renderPicking() {
    main.classList.toggle('selecting', selecting);
    $('.acts.normal').hidden = selecting;
    $('.acts.picking').hidden = !selecting;
    $('.picked').textContent = `已选 ${selected.size} 张`;
    $('.acts.picking [data-act=delete]').disabled = selected.size === 0;
  }

  // Uploads go one at a time (spec §7); files added meanwhile join the same run.
  function enqueue(files) {
    const list = [...files];
    if (!list.length || !album) return;
    queue.push(...list);
    tally.total += list.length;
    if (!uploading) pump();
  }

  async function pump() {
    uploading = true;
    box.hidden = false;
    clearTimeout(box.timer);
    box.querySelector('small').textContent = '';
    while (queue.length && alive) {
      const file = queue.shift();
      const i = tally.total - queue.length;
      box.querySelector('b').textContent = `正在导入 ${i} / ${tally.total}`;
      box.querySelector('.r span').textContent = file.name;
      box.querySelector('.prog i').style.width = `${((i - 1) / tally.total) * 100}%`;
      try {
        const res = await api.upload(id, file);
        if (res.photo) {
          tally.done++;
          album = { ...album, photos: [...album.photos, res.photo] };
          if (album.photos.length === 1) render();
          else grid.append(tile(res.photo, false));
          $('.count').textContent = `${album.photos.length} 张`;
        } else tally[SKIP[res.skipped]]++;
      } catch {
        tally.fail++;
      }
    }
    uploading = false;
    if (!alive) return;
    const skipped = tally.dup + tally.bad + tally.big;
    const why = [tally.dup && `重复 ${tally.dup}`, tally.bad && `格式不支持 ${tally.bad}`, tally.big && `太大 ${tally.big}`]
      .filter(Boolean)
      .join('，');
    box.querySelector('b').textContent = '导入完成';
    box.querySelector('.r span').textContent = '';
    box.querySelector('.prog i').style.width = '100%';
    box.querySelector('small').textContent =
      `已导入 ${tally.done} 张` + (skipped ? `，跳过 ${skipped} 张（${why}）` : '') + (tally.fail ? `，失败 ${tally.fail} 张` : '');
    Object.assign(tally, { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });
    box.timer = setTimeout(() => (box.hidden = true), 4000);
  }

  async function removeSelected() {
    const text = `删除 ${selected.size} 张照片？删除后不能恢复。`;
    if (!(await dialog({ title: '删除照片', text, ok: '删除', danger: true }))) return;
    try {
      album = await api.deletePhotos(id, [...selected]);
      selecting = false;
      selected.clear();
      render();
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  async function rename() {
    const title = await dialog({ title: '重命名相册', value: album.title, ok: '保存' });
    if (!title || title === album.title) return;
    try {
      album = await api.updateAlbum(id, { title });
      $('.title').textContent = album.title;
      document.title = `${album.title} · 相册`;
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  function onTile(t) {
    if (suppressClick) return;
    if (!selecting) return open(`#/a/${id}/p/${t.dataset.id}`);
    const pid = t.dataset.id;
    if (selected.has(pid)) selected.delete(pid);
    else selected.add(pid);
    t.classList.toggle('sel', selected.has(pid));
    renderPicking();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const t = e.target.closest('.tile');
    if (t && !act) return onTile(t);
    if (!album && act !== 'back') return;
    if (act === 'back') close('#/');
    else if (act === 'upload') input.click();
    else if (act === 'select' || act === 'cancel') {
      selecting = act === 'select';
      selected.clear();
      render();
    } else if (act === 'delete') removeSelected();
    else if (act === 'rename') rename();
    else if (act === '3d') open(`#/a/${id}/3d`);
  }

  // Desktop reordering with the pointer (spec §9): a ghost follows, the others make room.
  function onPointerDown(e) {
    const t = e.target.closest('.tile');
    if (!t || selecting || !fine.matches || e.button !== 0) return;
    drag = { t, x0: e.clientX, y0: e.clientY, ghost: null, before: '' };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      const r = drag.t.getBoundingClientRect();
      drag.dx = drag.x0 - r.left;
      drag.dy = drag.y0 - r.top;
      drag.before = [...grid.children].map((x) => x.dataset.id).join();
      drag.ghost = drag.t.cloneNode(true);
      drag.ghost.classList.add('ghost');
      Object.assign(drag.ghost.style, { width: `${r.width}px`, height: `${r.height}px` });
      document.body.append(drag.ghost);
      drag.t.classList.add('dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-3deg)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
    if (over && over !== drag.t && over.parentElement === grid) {
      const kids = [...grid.children];
      if (kids.indexOf(over) > kids.indexOf(drag.t)) over.after(drag.t);
      else over.before(drag.t);
    }
    if (e.clientY < 60) scrollBy(0, -16);
    else if (e.clientY > innerHeight - 60) scrollBy(0, 16);
  }

  async function onPointerUp() {
    const d = drag;
    drag = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    d.t.classList.remove('dragging');
    suppressClick = true; // the click that follows this pointerup is not a tap
    setTimeout(() => (suppressClick = false));
    const order = [...grid.children].map((x) => x.dataset.id);
    if (order.join() === d.before) return;
    try {
      album = await api.updateAlbum(id, { order });
      render(); // the cover badge follows the first photo
    } catch (err) {
      toast(err.status === 409 ? '照片有变化，已刷新' : `操作失败：${err.message}`);
      load();
    }
  }

  // Files dragged in from the desktop are uploaded (HTML5 drag and drop).
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  function onDragOver(e) {
    if (!hasFiles(e) || !album) return;
    e.preventDefault();
    main.classList.add('dropping');
    clearTimeout(main.dropTimer);
    main.dropTimer = setTimeout(() => main.classList.remove('dropping'), 150);
  }
  function onDrop(e) {
    if (!hasFiles(e) || !album) return;
    e.preventDefault();
    main.classList.remove('dropping');
    enqueue(e.dataTransfer.files);
  }

  const onFocus = () => {
    if (!uploading && !drag) load();
  };
  input.addEventListener('change', () => {
    enqueue(input.files);
    input.value = '';
  });
  grid.addEventListener('pointerdown', onPointerDown);
  app.addEventListener('click', onClick);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  window.addEventListener('focus', onFocus);
  load();

  return {
    update(next) {
      route = next;
    },
    destroy() {
      alive = false;
      drag?.ghost?.remove();
      app.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('focus', onFocus);
    },
  };
}
```

- [ ] **Step 6: 样式**

`src/style.css`：
1. 在 `:root` 里，`--font` 那一行后面加两行：

```css
  --danger: #b42318;
  --panel: 0 0 0 1px var(--line), 0 12px 32px -12px oklch(23.5% 0.02 255 / 0.28);
```

2. 删掉从 `/* Entry page */` 到 `.page-error { … }` 结束的整段（`.page`、`.page h1`、`.page-count`、`.page-error` 四条规则），换成下面这段：

```css
/* Manager pages */
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

.sp {
  flex: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 650;
}

.logo {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
}

.logo svg {
  width: 18px;
  height: 18px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.btn svg {
  width: 18px;
  height: 18px;
}

.btn:not(:disabled):hover {
  background: var(--hover);
}

.btn.pri {
  background: var(--accent);
  box-shadow: none;
  color: #fff;
}

.btn.pri:not(:disabled):hover {
  background: var(--accent-hover);
}

.btn.ghost {
  padding: 0 10px 0 6px;
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
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}

.ibtn:hover {
  background: var(--hover);
}

:is(.btn, .ibtn, .tile, .cover, .link, .title):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.empty {
  margin: 64px 0;
  color: var(--ink-2);
  text-align: center;
}

/* Album wall */
.wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 30px 28px;
  padding-top: 8px;
}

.album {
  min-width: 0;
}

.cover {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 14px;
  background: #e4e9ee;
  color: var(--ink-3);
  box-shadow: 0 1px 2px rgb(20 35 55 / 0.14), 0 12px 24px -14px rgb(20 35 55 / 0.4);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover svg {
  width: 40px;
  height: 40px;
}

.meta {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 10px;
}

.names {
  flex: 1;
  min-width: 0;
}

.names h2 {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.names p {
  margin: 0;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 18px;
}

@media (hover: hover) {
  .album .ibtn {
    opacity: 0;
  }

  .album:hover .ibtn,
  .album:focus-within .ibtn {
    opacity: 1;
  }
}

.menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 6;
  display: grid;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: var(--raised);
  box-shadow: var(--panel);
}

.menu button {
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
  cursor: pointer;
}

.menu button:hover {
  background: var(--hover);
}

.menu .red {
  color: var(--danger);
}

/* Album page */
.ttl {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.ttl h1 {
  min-width: 0;
  margin: 0;
}

.title {
  display: block;
  max-width: 40vw;
  padding: 0;
  border: 0;
  background: none;
  font-size: 20px;
  line-height: 28px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.count,
.picked {
  color: var(--ink-3);
  font-size: 13px;
  white-space: nowrap;
}

.acts {
  display: flex;
  align-items: center;
  gap: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
  user-select: none;
  -webkit-user-select: none;
}

.tile {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #e4e9ee;
  cursor: pointer;
}

.tile img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tile.missing img {
  visibility: hidden;
}

.tile.missing::after {
  content: '图片丢失';
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

.drop {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  min-height: 330px;
  margin-top: 4px;
  border: 2px dashed oklch(75% 0.05 235);
  border-radius: 20px;
  background: oklch(96.5% 0.012 235);
  color: var(--ink-2);
  text-align: center;
}

.drop svg {
  width: 40px;
  height: 40px;
  color: var(--accent);
}

.drop b {
  margin-top: 8px;
  color: var(--ink);
  font-size: 17px;
  line-height: 24px;
}

.drop small {
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 12px;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}

.dropping .grid {
  outline: 2px dashed oklch(75% 0.05 235);
  outline-offset: 6px;
  border-radius: 8px;
}

.dropping .drop {
  background: oklch(93% 0.025 235);
}

.fab {
  display: none;
}

/* Upload progress and toast */
.upload,
.toast {
  position: fixed;
  z-index: 90;
  border-radius: 16px;
  background: var(--raised);
  box-shadow: var(--panel);
}

.upload {
  right: 24px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  width: 320px;
  padding: 14px 16px;
}

.upload .r {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.upload .r span {
  min-width: 0;
  color: var(--ink-3);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prog {
  height: 6px;
  margin: 10px 0 8px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--line);
}

.prog i {
  display: block;
  width: 0;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.upload small {
  color: var(--ink-3);
  font-size: 12px;
}

.toast {
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  translate: -50%;
  padding: 10px 18px;
}

/* Dialogs */
.dlg {
  width: min(400px, calc(100vw - 32px));
  padding: 22px 24px;
  border: 0;
  border-radius: 20px;
  box-shadow: var(--panel);
  color: var(--ink);
}

.dlg::backdrop {
  background: rgb(16 26 38 / 0.42);
}

.dlg h3 {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 26px;
}

.dlg-text {
  margin: 0 0 8px;
  color: var(--ink-2);
}

.dlg-input {
  width: 100%;
  height: 40px;
  margin: 6px 0 4px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--hover);
  box-shadow: inset 0 0 0 1px var(--line);
  font: inherit;
}

.dlg-input:focus {
  outline: 2px solid var(--accent);
}

.dlg-acts {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

body:has(.ab, .lb) {
  overflow: hidden;
}

/* Phones: two-column wall, three-column grid, floating buttons */
@media (max-width: 600px) {
  .mgr {
    padding: 0 max(env(safe-area-inset-right, 0px), 14px) 120px max(env(safe-area-inset-left, 0px), 14px);
  }

  .bar {
    min-height: 56px;
  }

  .bar .btn span,
  .bar [data-act='upload'],
  .bar [data-act='3d'] {
    display: none;
  }

  .bar .btn.pri,
  .bar .btn.danger {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  .title {
    max-width: 46vw;
    font-size: 17px;
  }

  .wall {
    grid-template-columns: repeat(2, 1fr);
    gap: 22px 14px;
  }

  .grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
  }

  .tile {
    border-radius: 0;
  }

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
    padding: 0 22px;
    font-size: 16px;
    pointer-events: auto;
    box-shadow: inset 0 0 0 1px var(--line), 0 10px 24px -10px rgb(20 35 55 / 0.5);
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

- [ ] **Step 7: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-pages.mjs`
Expected: `pages ok`

- [ ] **Step 8: 提交**

```bash
git add index.html src/main.js src/router.js src/api.js src/ui.js src/wall.js src/album.js src/style.css
git commit -m "feat: add the album wall and album page with uploads, selection and reordering" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

（`public/cards.json` 已在 Step 3 用 `git rm` 删掉，会一起提交。）

### Task 6: 大图

**Files:**
- Create: `src/lightbox.js`
- Modify: `src/album.js`（接上大图）、`src/style.css`（大图样式）
- Test: `/tmp/album-checks/check-lightbox.mjs`（仓库外）

**Interfaces:**
- Consumes：
  - Task 5：`api`、`mediaUrl`、`dialog`、`icon`、`toast`、`swap`、`close`；
  - Task 5 `album.js` 里的 `route`、`album`、`render()`。
- Produces（`src/lightbox.js`）：
  - `openLightbox({ album, index, onIndex(photoId), onAlbum(album), onClose() }) → { show(index, album?), close() }`。
  - 键盘监听在 window 的捕获阶段，处理后调用 `stopImmediatePropagation()`；所以大图打开时，3D 查看器收不到按键。
  - 有确认框打开时，大图不处理按键。
  - × 和 Esc 只调用 `onClose()`，真正关闭由调用方根据地址调用 `close()`。
- Produces（`src/album.js` 新增）：
  - `sync()`：让大图和地址一致；
  - `changed(album)`：大图改了相册（设封面、删照片）后重画网格。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-lightbox.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-lightbox.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { makeFixtures } from './fixtures.mjs';

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-lightbox';
rmSync(dir, { recursive: true, force: true });
const fx = await makeFixtures();
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const base = server.url.replace(/\/$/, '');
const api = (path, init) => fetch(base + path, init).then((r) => r.json());
const album = await api('/api/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"大图"}' });
for (const [file, name] of [[fx.land, 'A.JPG'], [fx.tall, 'B.PNG'], [fx.square, 'C.WEBP']]) {
  await api(`/api/albums/${album.id}/photos?name=${name}`, { method: 'POST', headers: { 'X-Album-Upload': '1' }, body: readFileSync(file) });
}
const count = `document.querySelector('.lb-count')?.textContent`;

const b = await launch();
await b.goto(`${server.url}#/a/${album.id}`);
await b.click('.tile[data-id=p002]');
await b.waitFor(`${count} === '2 / 3' && location.hash.endsWith('/p/p002')`);
assert.equal(await b.evaluate(`document.querySelector('.lb-name').textContent`), 'B.PNG');
await b.waitFor(`document.querySelector('.lb-img').complete && document.querySelector('.lb-img').naturalWidth > 0`);

await b.key('ArrowRight');
await b.waitFor(`${count} === '3 / 3' && location.hash.endsWith('/p/p003')`);
assert.equal(await b.evaluate(`document.querySelector('[data-act=next]').disabled`), true);
await b.click('.lb [data-act=cover]');
await b.waitFor(`document.querySelector('.lb [data-act=cover]').disabled`);
await b.click('.lb [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open] .dlg-text')?.textContent === '删除这张照片？删除后不能恢复。'`);
await b.key('Escape'); // closes only the dialog
await sleep(200);
assert.equal(await b.evaluate(count), '3 / 3');
await b.click('.lb [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open]')`);
await b.click('dialog[open] [value=ok]');
await b.waitFor(`${count} === '2 / 2' && location.hash.endsWith('/p/p002')`);

await b.key('Escape');
await b.waitFor(`!document.querySelector('.lb') && location.hash === '#/a/${album.id}'`);
assert.equal(await b.evaluate(`document.querySelectorAll('.grid .tile').length`), 2);
assert.equal(await b.evaluate(`document.querySelector('.badge').closest('.tile').dataset.id`), 'p001'); // the cover was deleted
// The back button closes the lightbox too.
await b.click('.tile[data-id=p001]');
await b.waitFor(`${count} === '1 / 2'`);
await b.evaluate('history.back()');
await b.waitFor(`!document.querySelector('.lb')`);
// An address with a photo opens it directly; an unknown photo is dropped from the address.
await b.goto(`${server.url}#/a/${album.id}/p/p002`);
await b.waitFor(`${count} === '2 / 2'`);
await b.goto(`${server.url}#/a/${album.id}/p/p999`);
await b.waitFor(`location.hash === '#/a/${album.id}' && !document.querySelector('.lb')`);
assert.deepEqual(b.errors, []);
await b.close();

// Phone: swipe left for the next photo.
const m = await launch({ width: 390, height: 844, mobile: true });
await m.goto(`${server.url}#/a/${album.id}/p/p001`);
await m.waitFor(`${count} === '1 / 2'`);
await m.touch('touchStart', 300, 400);
await m.touch('touchMove', 200, 400);
await m.touch('touchMove', 100, 400);
await m.touch('touchEnd');
await m.waitFor(`${count} === '2 / 2'`);
assert.deepEqual(m.errors, []);
await m.close();
await server.close();
console.log('lightbox ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-lightbox.mjs`
Expected: FAIL，`timed out: document.querySelector('.lb-count')?.textContent === '2 / 3' …`

- [ ] **Step 3: 实现 src/lightbox.js**

`src/lightbox.js`：

```js
import { api, mediaUrl } from './api.js';
import { dialog, icon, toast } from './ui.js';

const KEYS = { ArrowLeft: 'prev', ArrowRight: 'next', Escape: 'close' };

export function openLightbox({ album, index, onIndex, onAlbum, onClose }) {
  const root = document.createElement('div');
  root.className = 'lb';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <header class="lb-bar">
      <b class="lb-count"></b><span class="lb-name"></span><span class="sp"></span>
      <button class="lb-btn" type="button" data-act="cover">${icon('star')}<span>设为封面</span></button>
      <button class="lb-btn" type="button" data-act="original">${icon('expand')}<span>查看原图</span></button>
      <button class="lb-btn" type="button" data-act="delete">${icon('trash')}<span>删除</span></button>
      <button class="ibtn" type="button" data-act="close" aria-label="关闭">${icon('close')}</button>
    </header>
    <img class="lb-img" alt="">
    <button class="ibtn lb-nav l" type="button" data-act="prev" aria-label="上一张">${icon('prev')}</button>
    <button class="ibtn lb-nav r" type="button" data-act="next" aria-label="下一张">${icon('next')}</button>`;
  const $ = (s) => root.querySelector(s);
  const img = $('.lb-img');
  img.onload = () => root.classList.remove('missing');
  img.onerror = () => root.classList.add('missing');

  function show(i, next = album) {
    album = next;
    index = Math.max(0, Math.min(album.photos.length - 1, i));
    const p = album.photos[index];
    img.src = mediaUrl(album.id, p.id, 1600);
    $('.lb-count').textContent = `${index + 1} / ${album.photos.length}`;
    $('.lb-name').textContent = p.name;
    $('[data-act=prev]').disabled = index === 0;
    $('[data-act=next]').disabled = index === album.photos.length - 1;
    $('[data-act=cover]').disabled = (album.cover ?? album.photos[0].id) === p.id;
    for (const j of [index - 1, index + 1]) {
      if (album.photos[j]) new Image().src = mediaUrl(album.id, album.photos[j].id, 1600);
    }
  }

  function go(i) {
    if (i < 0 || i >= album.photos.length || i === index) return;
    show(i);
    onIndex(album.photos[index].id);
  }

  async function act(name) {
    const p = album.photos[index];
    try {
      if (name === 'prev') go(index - 1);
      else if (name === 'next') go(index + 1);
      else if (name === 'close') onClose();
      else if (name === 'original') window.open(mediaUrl(album.id, p.id, 'original'), '_blank');
      else if (name === 'cover') {
        show(index, await api.updateAlbum(album.id, { cover: p.id }));
        onAlbum(album);
        toast('已设为封面');
      } else if (name === 'delete') {
        const text = '删除这张照片？删除后不能恢复。';
        if (!(await dialog({ title: '删除照片', text, ok: '删除', danger: true }))) return;
        const next = await api.deletePhotos(album.id, [p.id]);
        onAlbum(next);
        if (!next.photos.length) return onClose();
        show(index, next);
        onIndex(album.photos[index].id);
      }
    } catch (err) {
      toast(`操作失败：${err.message}`);
    }
  }

  // Capture phase: the lightbox gets the keys before the 3D viewer under it.
  function onKey(e) {
    if (!KEYS[e.key] || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    act(KEYS[e.key]);
  }

  // A horizontal swipe of 50 px or more pages, as on the phone's photo app.
  let x0 = null;
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button')) x0 = e.clientX;
  });
  root.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) >= 50) go(index + (dx < 0 ? 1 : -1));
  });
  root.addEventListener('click', (e) => {
    const name = e.target.closest('[data-act]')?.dataset.act;
    if (name) act(name);
  });
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  show(index);

  return {
    show,
    close() {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}
```

- [ ] **Step 4: 在相册页接上大图**

`src/album.js` 改四处：

1. import 改成：

```js
import { api, mediaUrl } from './api.js';
import { openLightbox } from './lightbox.js';
import { close, open, swap } from './router.js';
import { dialog, icon, toast } from './ui.js';
```

2. 在 `let uploading = false;` 后面加一行：

```js
  let lightbox = null;
```

3. 在 `function tile(p, isCover)` 前面加：

```js
  const base = () => `#/a/${id}${route.three ? '/3d' : ''}`;

  // The lightbox changed the album (cover, deletion): redraw what lies under it.
  function changed(next) {
    album = next;
    render();
  }

  // Opens, moves or closes the lightbox to match the address.
  function sync() {
    const i = route.photo ? album.photos.findIndex((p) => p.id === route.photo) : -1;
    if (i >= 0 && lightbox) lightbox.show(i, album);
    else if (i >= 0) {
      lightbox = openLightbox({
        album,
        index: i,
        onIndex: (pid) => {
          route = { ...route, photo: pid };
          swap(`${base()}/p/${pid}`);
        },
        onAlbum: changed,
        onClose: () => close(base()),
      });
    } else {
      lightbox?.close();
      lightbox = null;
      if (route.photo) swap(base()); // a photo that no longer exists
    }
  }
```

4. 两处调用：
   - `load()` 里把 `if (!same) render();` 改成：

```js
      if (!same) render();
      sync();
```

   - 返回值改成：

```js
  return {
    update(next) {
      route = next;
      if (album) sync();
    },
    destroy() {
      alive = false;
      lightbox?.close();
      drag?.ghost?.remove();
      app.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('focus', onFocus);
    },
  };
```

- [ ] **Step 5: 大图样式**

在 `src/style.css` 的 `/* Phones: two-column wall … */` 那一节前面加：

```css
/* Lightbox */
.lb {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: #0e1115;
  color: #e8edf2;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.lb-bar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 64px;
  padding: env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 16px) 0 max(env(safe-area-inset-left, 0px), 24px);
}

.lb-name {
  min-width: 0;
  margin-left: 8px;
  color: #8d98a5;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: #dfe5ec;
  cursor: pointer;
}

.lb-btn svg {
  width: 18px;
  height: 18px;
}

.lb-btn:not(:disabled):hover {
  background: rgb(255 255 255 / 0.12);
}

.lb-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.lb .ibtn {
  background: rgb(255 255 255 / 0.1);
  color: #fff;
}

.lb .ibtn:not(:disabled):hover {
  background: rgb(255 255 255 / 0.2);
}

.lb .ibtn:disabled {
  opacity: 0.3;
  cursor: default;
}

.lb-img {
  position: absolute;
  left: 88px;
  top: 72px;
  width: calc(100% - 176px);
  height: calc(100% - 96px);
  object-fit: contain;
}

.lb.missing .lb-img {
  visibility: hidden;
}

.lb.missing::after {
  content: '图片丢失';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #8d98a5;
}

.lb-nav {
  position: absolute;
  top: 50%;
  width: 48px;
  height: 48px;
  margin-top: -24px;
}

.lb-nav.l {
  left: max(env(safe-area-inset-left, 0px), 24px);
}

.lb-nav.r {
  right: max(env(safe-area-inset-right, 0px), 24px);
}

@media (max-width: 600px) {
  .lb-bar {
    min-height: 56px;
    padding-left: 16px;
  }

  .lb-btn span,
  .lb-name,
  .lb-nav {
    display: none;
  }

  .lb-img {
    left: 0;
    top: 64px;
    width: 100%;
    height: calc(100% - 88px);
  }
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-lightbox.mjs && node /tmp/album-checks/check-pages.mjs`
Expected: `lightbox ok`，然后是 `pages ok`。

- [ ] **Step 7: 提交**

```bash
git add src/lightbox.js src/album.js src/style.css
git commit -m "feat: add the lightbox with keys, swipe, cover, original and delete" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 7: 3D 自动排版

**Files:**
- Modify: `src/book/layout.js`（整个替换：保留 `DIM`，去掉卡袋、卡位相关函数）
- Test: `/tmp/album-checks/check-layout.mjs`（仓库外）

旧的 `book.js`、`textures.js` 还在引用 `sheetCount`、`pocketRect`、`cardPlacement`、`cardAt`，Task 8 会替换它们。这两个文件现在没人导入（Task 5 起 `main.js` 不再加载 `viewer.js`），所以构建不受影响。

**Interfaces:**
- Consumes: 无。
- Produces（`src/book/layout.js`）：
  - `DIM`：和原来完全一样。
  - `POCKET = { w: 182.2, h: 179.6, pad: 5, gap: 4, minSide: 30 }`，宽高由 `DIM` 算出。
  - `PER_PAGE = { 1: { avg: 1, max: 1 }, 2: { avg: 2, max: 3 }, 3: { avg: 3, max: 4 } }`。
  - `pocketX(face) → number`：偶数面是 22，奇数面是 5.6。
  - `spreadOfPage(p) → number`：`⌊(p + 1) / 2⌋ + 1`。
  - `layoutPages(aspects: number[], perPage) → Page[]`：
    - `Page = { fill, rects: [{ i, x, y, w, h }] }`；
    - `i` 是照片在整本相册里的序号；坐标是排版区内的 mm（排版区 172.2 × 169.6）。
  - `photoAt(page, face, x, y) → number`：照片序号，没点到照片返回 −1。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-layout.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-layout.mjs
import assert from 'node:assert/strict';

const { DIM, POCKET, PER_PAGE, layoutPages, photoAt, pocketX, spreadOfPage } = await import(`${process.cwd()}/src/book/layout.js`);
const BW = POCKET.w - 2 * POCKET.pad;
const BH = POCKET.h - 2 * POCKET.pad;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !≈ ${b}`);
near(POCKET.w, 182.2);
near(POCKET.h, 179.6);
assert.deepEqual([0, 1, 2, 3, 4].map(spreadOfPage), [1, 2, 2, 3, 3]);
assert.deepEqual([pocketX(0), pocketX(1)], [DIM.spine, DIM.outer]);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const MIX = [[4 / 3, 0.33], [3 / 4, 0.38], [16 / 9, 0.09], [9 / 16, 0.06], [1, 0.06], [3, 0.02], [3 / 2, 0.03], [2 / 3, 0.03]];
const pick = () => {
  let r = rnd();
  for (const [v, p] of MIX) if ((r -= p) < 0) return v;
  return 1;
};

// Order kept, nothing cropped, inside the box, no overlaps, 30 mm short sides on shared pages.
function verify(aspects, perPage) {
  const pages = layoutPages(aspects, perPage);
  const { max } = PER_PAGE[perPage];
  let next = 0;
  for (const page of pages) {
    assert.ok(page.rects.length >= 1 && page.rects.length <= max, 'photos per page');
    for (const r of page.rects) {
      assert.equal(r.i, next++, 'order');
      near(r.w / r.h, aspects[r.i]);
      assert.ok(r.x > -1e-6 && r.y > -1e-6 && r.x + r.w < BW + 1e-6 && r.y + r.h < BH + 1e-6, 'inside');
      if (page.rects.length > 1) assert.ok(Math.min(r.w, r.h) > POCKET.minSide - 1e-6, 'min side');
    }
    for (const a of page.rects) {
      for (const b of page.rects) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
        assert.ok(apart, 'overlap');
      }
    }
  }
  assert.equal(next, aspects.length);
  return pages;
}

for (const perPage of [1, 2, 3]) {
  for (const n of [0, 1, 2, 3, 7, 80, 81, 333]) {
    const pages = verify(Array.from({ length: n }, pick), perPage);
    const { avg } = PER_PAGE[perPage];
    if (n) assert.ok(pages.length >= Math.ceil(n / avg), `${perPage}/${n}: ${pages.length} pages`);
  }
}
assert.equal(layoutPages(Array(5).fill(4 / 3), 2).length, 4); // 3 pages rounded up to even
assert.equal(layoutPages(Array(5).fill(4 / 3), 1).length, 5); // one per page: cannot round

// Review focus «extremes»: panoramas, long screenshots, mixed with square and tiny ratios.
verify(Array(12).fill(8), 3);
verify(Array(12).fill(9 / 19.5), 3);
verify([1, 8, 1 / 8, 4 / 3, 3 / 4, 1], 2);

// Hit test on a front (ring on the left) and a back (ring on the right).
const pages = layoutPages([4 / 3, 3 / 4, 3 / 4], 2);
const [r] = pages[0].rects;
for (const face of [0, 1]) {
  const x = pocketX(face) + POCKET.pad + r.x + r.w / 2;
  const y = DIM.top + POCKET.pad + r.y + r.h / 2;
  assert.equal(photoAt(pages[0], face, x, y), r.i);
}
assert.equal(photoAt(pages[0], 0, 1, 1), -1);
assert.equal(photoAt(undefined, 0, 50, 50), -1);

// Speed: ten thousand photos (after a warm-up run).
const big = Array.from({ length: 10000 }, pick);
layoutPages(big.slice(0, 2000), 3);
for (const perPage of [1, 2, 3]) {
  const t = performance.now();
  const n = layoutPages(big, perPage).length;
  const ms = performance.now() - t;
  console.log(`10000 photos, perPage ${perPage}: ${n} pages in ${ms.toFixed(0)} ms`);
  assert.ok(ms < 100, 'layout too slow');
}
verify(big, 2);
console.log('layout ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-layout.mjs`
Expected: FAIL，`TypeError: Cannot read properties of undefined (reading 'w')`（`POCKET` 还不存在）。

- [ ] **Step 3: 实现 layout.js**

`src/book/layout.js`（整个替换）：

```js
// Sizes in mm (1 scene unit = 1 mm), measured from the original album.
export const DIM = {
  W: 209.8, // sheet width: 22 + 2 × 89.4 + 3.4 + 5.6
  H: 192.4, // sheet height: 6.4 + 3 × 57.6 + 2 × 3.4 + 6.4
  cardW: 85.6,
  cardH: 54,
  cardR: 3.18,
  pocketW: 89.4,
  pocketH: 57.6,
  gap: 3.4,
  spine: 22, // margin on the ring side
  outer: 5.6, // margin on the outer side
  top: 6.4,
  hole: 9.2, // hole centre to the inner edge
  holeR: 3.1,
  rings: [-81, -27, 27, 81], // ring positions along the spine (z)
  T: 1.05, // sheet thickness
  CT: 1.6, // board thickness
  HB: 206.4, // board height: H + 14
  h: 5, // hinge arc length
  drop: 2.2, // spine drop when open
  wire: 1.6, // ring wire radius
};

// One full-page clear pocket per face (spec §10); photos sit inside with padding and gaps.
export const POCKET = { w: DIM.W - DIM.spine - DIM.outer, h: DIM.H - 2 * DIM.top, pad: 5, gap: 4, minSide: 30 };
const BOX_W = POCKET.w - 2 * POCKET.pad; // 172.2
const BOX_H = POCKET.h - 2 * POCKET.pad; // 169.6

// perPage → average photos per page and the most one page may hold.
export const PER_PAGE = { 1: { avg: 1, max: 1 }, 2: { avg: 2, max: 3 }, 3: { avg: 3, max: 4 } };

// Left edge of the pocket on a face as seen; fronts (even faces) have the rings on the left.
export const pocketX = (face) => (face % 2 === 0 ? DIM.spine : DIM.outer);

// Spread that shows page p: spread 1 is the inside of the cover and page 0.
export const spreadOfPage = (p) => Math.floor((p + 1) / 2) + 1;

// Every order-keeping split tree of photos s..e−1. At height h a tree is a·h + b wide, gaps included.
function trees(aspects, s, e, memo) {
  const key = s * 1024 + e;
  let out = memo.get(key);
  if (out) return out;
  out = [];
  if (e - s === 1) out.push({ i: s, a: aspects[s], b: 0 });
  else {
    for (let m = s + 1; m < e; m++) {
      for (const A of trees(aspects, s, m, memo)) {
        for (const B of trees(aspects, m, e, memo)) {
          out.push({ row: true, A, B, a: A.a + B.a, b: A.b + B.b + POCKET.gap });
          const a = 1 / (1 / A.a + 1 / B.a);
          out.push({ row: false, A, B, a, b: a * (A.b / A.a + B.b / B.a - POCKET.gap) });
        }
      }
    }
  }
  memo.set(key, out);
  return out;
}

// Top down: a row shares the height, a column shares the width.
function place(node, x, y, w, h, out) {
  if (node.i !== undefined) out.push({ i: node.i, x, y, w, h });
  else if (node.row) {
    const wA = node.A.a * h + node.A.b;
    place(node.A, x, y, wA, h, out);
    place(node.B, x + wA + POCKET.gap, y, w - wA - POCKET.gap, h, out);
  } else {
    const hA = (w - node.A.b) / node.A.a;
    place(node.A, x, y, w, hA, out);
    place(node.B, x, y + hA + POCKET.gap, w, h - hA - POCKET.gap, out);
  }
  return out;
}

// The fullest page for photos s..e−1, centred; shared pages keep every short side ≥ 30 mm.
function bestPage(aspects, s, e, memo, cache) {
  const key = s * 1024 + e;
  if (cache.has(key)) return cache.get(key);
  let best = null;
  for (const t of trees(aspects, s, e, memo)) {
    const h = Math.min(BOX_H, (BOX_W - t.b) / t.a);
    const w = t.a * h + t.b;
    if (!(w > 0 && h > 0)) continue;
    const rects = place(t, (BOX_W - w) / 2, (BOX_H - h) / 2, w, h, []);
    if (e - s > 1 && rects.some((r) => Math.min(r.w, r.h) < POCKET.minSide)) continue;
    const fill = rects.reduce((sum, r) => sum + r.w * r.h, 0) / (BOX_W * BOX_H);
    if (!best || fill > best.fill) best = { fill, rects };
  }
  cache.set(key, best);
  return best;
}

// Exactly P pages of at most `max` photos with the highest total fill (spec §10); P grows
// when the 30 mm rule makes it impossible. `before` (last chunk only) keeps the total even.
function layoutChunk(aspects, avg, max, before) {
  const n = aspects.length;
  const memo = new Map();
  const cache = new Map();
  let P = Math.max(Math.ceil(n / avg), Math.ceil(n / max));
  if (before !== null && (before + P) % 2 && P < n) P++;
  for (;; P++) {
    let cost = new Array(n + 1).fill(Infinity);
    cost[0] = 0;
    const from = [];
    for (let p = 0; p < P; p++) {
      const next = new Array(n + 1).fill(Infinity);
      const back = new Array(n + 1).fill(-1);
      for (let j = 1; j <= n; j++) {
        for (let k = 1; k <= Math.min(max, j); k++) {
          if (cost[j - k] === Infinity) continue;
          const page = bestPage(aspects, j - k, j, memo, cache);
          if (page && cost[j - k] + 1 - page.fill < next[j]) {
            next[j] = cost[j - k] + 1 - page.fill;
            back[j] = j - k;
          }
        }
      }
      cost = next;
      from.push(back);
    }
    if (cost[n] === Infinity) continue; // one photo per page always works, so this ends
    const pages = [];
    for (let p = P - 1, j = n; p >= 0; p--) {
      const s = from[p][j];
      pages.unshift(bestPage(aspects, s, j, memo, cache));
      j = s;
    }
    return pages;
  }
}

// The whole album as one run of pages, computed in chunks of 40 × avg photos.
export function layoutPages(aspects, perPage) {
  const { avg, max } = PER_PAGE[perPage] ?? PER_PAGE[2];
  const size = 40 * avg;
  const out = [];
  for (let start = 0; start < aspects.length; start += size) {
    const last = start + size >= aspects.length;
    for (const page of layoutChunk(aspects.slice(start, start + size), avg, max, last ? out.length : null)) {
      out.push({ fill: page.fill, rects: page.rects.map((r) => ({ ...r, i: r.i + start })) });
    }
  }
  return out;
}

// Photo index at (x, y) mm on a face that shows `page`, or −1.
export function photoAt(page, face, x, y) {
  const x0 = pocketX(face) + POCKET.pad;
  const y0 = DIM.top + POCKET.pad;
  for (const r of page?.rects ?? []) {
    if (x >= x0 + r.x && x <= x0 + r.x + r.w && y >= y0 + r.y && y <= y0 + r.y + r.h) return r.i;
  }
  return -1;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/check-layout.mjs`
Expected: 三行耗时（每行都 < 100 ms），然后是 `layout ok`。

- [ ] **Step 5: 提交**

```bash
git add src/book/layout.js
git commit -m "feat: lay photos out on full-page pockets with order-keeping split trees" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 8: 3D 书：整页贴图与滑动窗口

**Files:**
- Modify: `src/book/textures.js`（整个替换）、`src/book/book.js`（整个替换）
- Test: `/tmp/album-checks/check-book.mjs`（仓库外）

**Interfaces:**
- Consumes：
  - Task 7：`DIM`、`POCKET`、`pocketX`、`photoAt`；
  - 不变的 `createBinder`、`createStage`、`createSheet`、`restHoleAngle`。
- Produces：
  - `src/book/textures.js`：`createPageTexture(face, page | null, photoUrl, onRedraw) → CanvasTexture`。
    - 先画膜、整页袋和灰色占位，图片到一张画一张；
    - 奇数面（背面）自己设好镜像（`repeat.x = -1`、`offset.x = 1`）；
    - `dispose()` 后不再画迟到的图片。
  - `src/book/book.js`：`createBook(container, { title, pages, photoUrl, insets, startSpread = 1, onChange, onPhotoClick })`，返回 `{ next(), prev(), toggleCover(), jump(spread), stats(), dispose() }`。
    - `onChange({ spread, spreads, closed })` 按整本相册计算；
    - `onPhotoClick(i)` 传出照片序号；
    - `stats() → { offset, textures }`。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-book.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-book.mjs
// Drives src/book directly through the Vite dev server, with 1000 one-per-page photos (500 leaves, 501 spreads).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launch, sleep } from './cdp.mjs';

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5197', '--strictPort'], {
  env: { ...process.env, ALBUM_LIBRARY: '/tmp/album-checks/lib-book' },
  stdio: 'ignore',
});
process.on('exit', () => vite.kill());
for (let i = 0; i < 100 && !(await fetch('http://localhost:5197/').then((r) => r.ok, () => false)); i++) await sleep(200);
const b = await launch();
const motion = (value) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
await motion('reduce'); // turns finish on the next frame
await b.goto('http://localhost:5197/');
await b.evaluate(`(async () => {
  const { createBook } = await import('/src/book/book.js');
  const { layoutPages } = await import('/src/book/layout.js');
  const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 });
  const g = c.getContext('2d');
  g.fillStyle = '#d9a441';
  g.fillRect(0, 0, 40, 30);
  const url = c.toDataURL();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:100';
  document.body.append(box);
  window.T = { changes: [], clicks: [] };
  T.book = createBook(box, {
    title: '检查',
    pages: layoutPages(Array(1000).fill(4 / 3), 1),
    photoUrl: () => url,
    insets: { top: 0, bottom: 0 },
    onChange: (e) => T.changes.push(e),
    onPhotoClick: (i) => T.clicks.push(i),
  });
})()`);
const state = () => b.evaluate('({ ...T.changes.at(-1), ...T.book.stats() })');
let s = await state();
assert.deepEqual([s.spread, s.spreads, s.closed, s.offset], [1, 501, false, 0]);

// Review focus «rapid»: a burst of 30 turns stops at the edge of the drawn leaves …
await b.evaluate('for (let i = 0; i < 30; i++) T.book.next()');
assert.equal((await state()).spread, 21);
// … the window moves once they have settled, and turning goes on.
await b.waitFor('T.book.stats().offset === 10', 20000);
for (let i = 0; i < 10; i++) {
  await b.evaluate('T.book.next()');
  await sleep(60);
}
await b.waitFor('T.changes.at(-1).spread === 31 && T.book.stats().offset === 20', 20000);
assert.ok((await state()).textures <= 10);

// Review focus «window»: jumps and both ends.
await b.evaluate('T.book.jump(400)');
s = await state();
assert.deepEqual([s.spread, s.offset], [400, 389]);
await b.evaluate('T.book.jump(9999)');
s = await state();
assert.deepEqual([s.spread, s.offset], [501, 480]);
await b.evaluate('T.book.next()');
assert.equal((await state()).spread, 501);

// Taps hit the photo of the page under the pointer (page p holds photo p here).
await b.evaluate('T.book.jump(50)');
await sleep(300);
for (const [x, photo] of [[960, 98], [320, 97]]) {
  await b.mouse('mousePressed', x, 400);
  await b.mouse('mouseReleased', x, 400, 0);
  await b.waitFor(`T.clicks.at(-1) === ${photo}`);
}

// Review focus «reopen»: closing in the middle, then opening at once or later.
await b.evaluate('T.book.jump(300); T.book.toggleCover()');
assert.equal((await state()).closed, true);
await b.evaluate('T.book.toggleCover()');
s = await state();
assert.deepEqual([s.spread, s.offset], [1, 0]);
await b.evaluate('T.book.jump(300); T.book.toggleCover()');
await b.waitFor('T.book.stats().offset === 0', 20000);
await b.evaluate('T.book.toggleCover()');
assert.equal((await state()).spread, 1);

// With animation: the window catches up once the turns have finished.
await motion('no-preference');
await b.evaluate('T.book.jump(100)');
for (let i = 0; i < 3; i++) {
  await b.evaluate('T.book.next()');
  await sleep(150);
}
await b.waitFor('T.changes.at(-1).spread === 103 && T.book.stats().offset === 92', 60000);
await b.evaluate('T.book.dispose()');
assert.deepEqual(b.errors, []);
await b.close();
vite.kill();
console.log('book ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-book.mjs`
Expected: FAIL，`SyntaxError: The requested module '/src/book/layout.js' does not provide an export named 'cardAt'`（旧 `book.js` 还在引用 Task 7 删掉的导出）。

- [ ] **Step 3: 页面贴图**

`src/book/textures.js`（整个替换）：

```js
import { CanvasTexture, SRGBColorSpace } from 'three';
import { DIM, POCKET, pocketX } from './layout.js';

// PVC palette from the original album.
const FILM = '#eef1f3';
const SEAM = '#f5f6f8';
const EDGE = 'rgba(255,255,255,0.9)';
const SHADE = 'rgba(24,31,40,0.16)';
const EMPTY = '#d5dbe1'; // a photo that has not arrived (or failed)
const PX = 4; // canvas pixels per mm

// Film, the full-page pocket with grey slots for the photos, and the ring holes.
function drawPage(ctx, face, page) {
  const x0 = pocketX(face);
  const y0 = DIM.top;
  ctx.fillStyle = FILM;
  ctx.fillRect(0, 0, DIM.W, DIM.H);

  // Welded seam around the pocket.
  const seam = [x0 - 1.6, y0 - 1.6, POCKET.w + 3.2, POCKET.h + 3.2];
  ctx.fillStyle = SEAM;
  ctx.fillRect(...seam);
  ctx.lineWidth = 0.22;
  ctx.strokeStyle = SHADE;
  ctx.strokeRect(...seam);
  ctx.fillStyle = FILM;
  ctx.fillRect(x0, y0, POCKET.w, POCKET.h);

  for (const r of page?.rects ?? []) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + POCKET.pad + r.x, y0 + POCKET.pad + r.y, r.w, r.h, 0.6);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 1.2 * PX; // shadow sizes are in canvas pixels
    ctx.shadowOffsetY = 0.25 * PX;
    ctx.fillStyle = EMPTY;
    ctx.fill();
    ctx.restore();
  }

  // Pocket mouth: a bright lip with a soft shade under it.
  ctx.fillStyle = SHADE;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x0, y0 + 2.38, POCKET.w, 0.5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = EDGE;
  ctx.fillRect(x0, y0 + 2.08, POCKET.w, 0.3);
  ctx.lineWidth = 0.22;
  ctx.strokeStyle = SHADE;
  ctx.strokeRect(x0, y0, POCKET.w, POCKET.h);

  const hx = face % 2 === 1 ? DIM.W - DIM.hole : DIM.hole;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = EDGE;
  for (const z of DIM.rings) {
    ctx.beginPath();
    ctx.arc(hx, DIM.H / 2 + z, DIM.holeR + 0.35, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const z of DIM.rings) {
    ctx.beginPath();
    ctx.arc(hx, DIM.H / 2 + z, DIM.holeR, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(0.3, 0.3, DIM.W - 0.6, DIM.H - 0.6);
}

// One album face. Photos are drawn into their slots as they arrive; the Image is then dropped.
// Backs are mirrored here, as sheet.js expects of every back map.
export function createPageTexture(face, page, photoUrl, onRedraw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DIM.W * PX);
  canvas.height = Math.round(DIM.H * PX);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / DIM.W, 0, 0, canvas.height / DIM.H, 0, 0);
  drawPage(ctx, face, page);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (face % 2 === 1) {
    texture.repeat.x = -1;
    texture.offset.x = 1;
  }
  let live = true;
  texture.addEventListener('dispose', () => (live = false));
  const x0 = pocketX(face) + POCKET.pad;
  const y0 = DIM.top + POCKET.pad;
  for (const r of page?.rects ?? []) {
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0 + r.x, y0 + r.y, r.w, r.h, 0.6);
      ctx.clip();
      ctx.drawImage(image, x0 + r.x, y0 + r.y, r.w, r.h);
      ctx.restore();
      texture.needsUpdate = true;
      onRedraw();
    };
    // 4 px/mm: a photo longer than 150 mm on the page needs more than the 600 image.
    image.src = photoUrl(r.i, Math.max(r.w, r.h) > 150 ? 1600 : 600);
  }
  return texture;
}
```

- [ ] **Step 4: 书与滑动窗口**

`src/book/book.js`（整个替换；`step`、`place`、拖拽和甩动与原来相同）：

```js
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createBinder } from './binder.js';
import { DIM, photoAt } from './layout.js';
import { createStage } from './scene.js';
import { createSheet, restHoleAngle } from './sheet.js';
import { createPageTexture } from './textures.js';

const { W, H, T } = DIM;
const PI = Math.PI;
const DRAWN = 20; // leaves drawn at once (spec §11)
const MIDDLE = 11; // local k with ten leaves on each side
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createBook(container, { title, pages, photoUrl, insets, startSpread = 1, onChange, onPhotoClick }) {
  const G = Math.max(1, Math.ceil(pages.length / 2)); // leaves in the whole album
  const S = Math.min(DRAWN, G); // leaves drawn
  const binder = createBinder({ sheets: S, title });
  const stage = createStage(container, binder.xb + binder.B, insets);
  const { scene, camera, renderer } = stage;
  const canvas = renderer.domElement;
  scene.add(binder.group);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const blank = [0, 1].map((face) => createPageTexture(face, null, photoUrl, () => {}));
  const textures = new Map(); // album face → texture, only around the current spread
  const sheets = [];
  for (let i = 0; i < S; i++) {
    const sheet = createSheet(blank[0], blank[1]);
    sheet.front.userData = { i, back: false };
    sheet.back.userData = { i, back: true };
    scene.add(sheet.group);
    sheets.push(sheet);
  }

  // Leaf 0 is the cover; leaf j ≥ 1 is drawn sheet j − 1 and shows album leaf o + j − 1.
  // Leaves j < k lie on the left. The album spread is o + k, or 0 when closed.
  const idle = (j, kk) => ({ th: j < kk ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 });
  const leaves = Array.from({ length: S + 1 }, (_, j) => idle(j, 1));
  let o = 0;
  let k = 1;
  let ringX = 0;
  let pointer = null;
  let drag = null;
  let raf = 0;
  let last = 0;
  let disposed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const atRest = (leaf) => leaf.w === 0 && leaf.b === 0 && leaf.bv === 0 && (leaf.th === 0 || leaf.th === PI);
  // At rest on the side it belongs to: a leaf told to turn but not yet moving is not settled.
  const settled = (leaf, j) => atRest(leaf) && leaf.wait === 0 && leaf.th === (j < k ? PI : 0);
  const spread = () => (k === 0 ? 0 : o + k);
  const report = () => onChange({ spread: spread(), spreads: G + 1, closed: k === 0 });

  // Real pages for the spreads around the current one; every other face shows the blank film.
  function refreshTextures() {
    const s = Math.max(1, spread());
    const want = new Set();
    for (let t = s - 2; t <= s + 2; t++) {
      for (const f of [2 * t - 3, 2 * t - 2]) if (f >= 0 && f < 2 * G) want.add(f);
    }
    for (const [f, texture] of textures) {
      if (want.has(f)) continue;
      texture.dispose();
      textures.delete(f);
    }
    for (const f of want) {
      if (textures.has(f)) continue;
      const texture = createPageTexture(f, pages[f] ?? null, photoUrl, requestRender);
      texture.anisotropy = anisotropy;
      textures.set(f, texture);
    }
    sheets.forEach((sheet, i) => {
      sheet.front.material.map = textures.get(2 * (o + i)) ?? blank[0];
      sheet.back.material.map = textures.get(2 * (o + i) + 1) ?? blank[1];
    });
    requestRender();
  }

  // Keeps the current spread in the middle of the drawn leaves (spec §11). Leaf states shift
  // with the window, so the visible spread stays put and the piles change by a sheet or so.
  function recenter() {
    if (drag || pointer) return;
    const target = Math.max(0, Math.min(G - S, spread() - MIDDLE));
    const d = target - o;
    if (!d) return;
    // Leaves that drop out: the bottom of the left pile (d > 0) or of the right pile (d < 0).
    const first = d > 0 ? 1 : Math.max(1, S + 1 + d);
    const lastOut = d > 0 ? Math.min(S, d) : S;
    for (let j = first; j <= lastOut; j++) if (!settled(leaves[j], j)) return;
    const kept = leaves.slice(1);
    const kNext = k === 0 ? 0 : k - d;
    for (let j = 1; j <= S; j++) leaves[j] = kept[j + d - 1] ?? idle(j, kNext);
    o = target;
    k = kNext;
    refreshTextures();
  }

  function setSpread(s) {
    s = Math.max(0, Math.min(G + 1, s));
    if (s === spread()) return;
    recenter();
    const next = s === 0 ? 0 : s - o;
    if (s > 0 && (next < 1 || next > S + 1)) return; // the drawn leaves cannot follow yet
    // Leaves that change side leave one after another, nearest to the current spread first.
    const order = next > k ? leaves.slice(k, next) : leaves.slice(next, k).reverse();
    order.forEach((leaf, i) => {
      leaf.wait = atRest(leaf) ? i * 0.06 : 0;
    });
    k = next;
    report();
    refreshTextures();
  }

  // Straight to an album spread, without turning pages.
  function jump(s) {
    s = Math.max(1, Math.min(G + 1, Math.round(s)));
    pointer = drag = null;
    o = Math.max(0, Math.min(G - S, s - MIDDLE));
    k = s - o;
    leaves.forEach((leaf, j) => Object.assign(leaf, idle(j, k)));
    report();
    refreshTextures();
  }

  // From the cover: if the window has not got back to the start yet, jump there.
  const open = () => (o > 0 ? jump(1) : setSpread(1));
  const setLocal = (kk) => setSpread(kk === 0 ? 0 : o + kk);

  // Advances every leaf by dt seconds; returns true while anything still moves.
  function step(dt) {
    let moving = false;
    leaves.forEach((leaf, j) => {
      const dragged = drag?.j === j;
      const goal = dragged ? drag.edge : j < k ? PI : 0;
      if (reduced.matches) {
        Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0, wait: 0 });
        return;
      }
      if (leaf.wait > 0 && !dragged) {
        leaf.wait = Math.max(0, leaf.wait - dt);
        moving = true;
        return;
      }
      const n = Math.ceil(dt * 120);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        leaf.w += (-81 * (leaf.th - goal) - 16.2 * leaf.w) * h;
        leaf.th += leaf.w * h;
        if (leaf.th < 0 || leaf.th > PI) {
          leaf.th = Math.min(PI, Math.max(0, leaf.th));
          leaf.w = 0;
        }
        if (j === 0) continue; // the cover does not bend
        if (dragged) {
          leaf.b = goal - leaf.th;
          leaf.bv = 0;
        } else {
          leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * h;
          leaf.b += leaf.bv * h;
        }
        leaf.b = Math.min(PI - leaf.th, Math.max(-leaf.th, leaf.b));
      }
      const still = Math.abs(leaf.w) < 1e-2 && Math.abs(leaf.b) < 1e-3 && Math.abs(leaf.bv) < 1e-2;
      if (!dragged && still && Math.abs(leaf.th - goal) < 1e-3) Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
      else moving = true;
    });
    return moving;
  }

  function place() {
    const c = leaves[0].th / PI;
    const { C } = binder.pose(c);
    sheets.forEach((sheet, i) => {
      const { th, b } = leaves[i + 1];
      const psiR = restHoleAngle(C[1], binder.R, (S - i - 0.5) * T);
      const psiL = PI - restHoleAngle(C[1], binder.R, (i + 0.5) * T);
      sheet.update(C, binder.R, psiR + (th / PI) * (psiL - psiR), th, b);
    });
    ringX = C[0];
    stage.frame(binder.closedCenter * (1 - smoothstep(c)), 1 + 0.15 * Math.sin(PI * c));
  }

  function tick(now) {
    raf = 0;
    const moving = step(last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60);
    recenter();
    place();
    stage.render();
    last = moving || drag ? now : 0;
    if (last) raf = requestAnimationFrame(tick);
  }

  function requestRender() {
    if (!disposed && !raf) raf = requestAnimationFrame(tick);
  }

  // Pointer input: drag a leaf, fling it, or tap a photo / either side.
  const raycaster = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const ndc = new Vector2();
  const hit = new Vector3();

  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    raycaster.setFromCamera(ndc, camera);
  }

  function pxPerMm() {
    const a = new Vector3(0, 0, 0).project(camera);
    const b = new Vector3(W, 0, 0).project(camera);
    return (Math.abs(b.x - a.x) * canvas.clientWidth) / 2 / W;
  }

  function onDown(e) {
    if (pointer || e.button !== 0) return;
    aim(e);
    const x = raycaster.ray.intersectPlane(floor, hit) ? hit.x : ringX;
    let j = k - 1;
    if (k === 0) j = 0;
    else if (x >= ringX) j = k <= S ? k : -1;
    const slop = e.pointerType === 'mouse' ? 5 : 9;
    pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x, j, fromRight: j >= k, slop, samples: [] };
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id || p.j < 0) return;
    const dx = e.clientX - p.x0;
    if (!drag) {
      if (Math.hypot(dx, e.clientY - p.y0) < p.slop) return;
      const leaf = leaves[p.j];
      p.edge0 = leaf.th + leaf.b;
      p.scale = pxPerMm();
      drag = p;
    }
    p.edge = Math.acos(Math.min(1, Math.max(-1, Math.cos(p.edge0) + dx / p.scale / W)));
    p.samples.push([e.timeStamp, e.clientX]);
    if (p.samples.length > 20) p.samples.shift();
    requestRender();
  }

  function release(p, e) {
    p.samples.push([e.timeStamp, e.clientX]);
    const [t0, x0] = p.samples.find(([t]) => e.timeStamp - t <= 100);
    const dt = (e.timeStamp - t0) / 1000;
    const vx = dt > 0 ? (e.clientX - x0) / p.scale / W / dt : 0; // sheet widths per second, rightwards
    const v = p.fromRight ? -vx : vx;
    const progress = p.fromRight ? p.edge / PI : 1 - p.edge / PI;
    if (v > 0.9 || (progress > 0.22 && v >= -0.05)) setLocal(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
  }

  function tap(e, p) {
    if (k === 0) return open();
    aim(e);
    const [first] = raycaster.intersectObjects(sheets.flatMap((s) => [s.front, s.back]), false);
    if (first) {
      const { i, back } = first.object.userData;
      const face = 2 * (o + i) + (back ? 1 : 0);
      const u = back ? 1 - first.uv.x : first.uv.x;
      const index = photoAt(pages[face], face, u * W, (1 - first.uv.y) * H);
      if (index >= 0) return onPhotoClick(index);
    }
    setSpread(spread() + (p.x < ringX ? -1 : 1));
  }

  function onUp(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id) return;
    pointer = null;
    if (drag) {
      drag = null;
      release(p, e);
    } else if (e.type === 'pointerup' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < p.slop) {
      tap(e, p); // a swipe that turned no leaf (e.g. past the last spread) is not a tap
    }
    requestRender();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const observer = new ResizeObserver(() => {
    stage.resize();
    requestRender();
  });
  observer.observe(container);
  stage.resize();
  jump(startSpread);
  place();

  return {
    next: () => (k === 0 ? open() : setSpread(spread() + 1)),
    prev: () => setSpread(spread() - 1),
    toggleCover: () => (k > 0 ? setSpread(0) : open()),
    jump,
    stats: () => ({ offset: o, textures: textures.size }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      sheets.forEach((s) => s.dispose());
      for (const texture of [...textures.values(), ...blank]) texture.dispose();
      binder.dispose();
      stage.dispose();
    },
  };
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `node /tmp/album-checks/check-book.mjs`
Expected: `book ok`（软件渲染很慢，最后一段带动画的检查可能要等半分钟）。

- [ ] **Step 6: 提交**

```bash
git add src/book/textures.js src/book/book.js
git commit -m "feat: draw photo pages and keep twenty leaves around the current spread" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 9: 3D 查看器接入相册

**Files:**
- Modify: `src/viewer.js`（整个替换）、`src/album.js`（接上 3D）、`src/style.css`（去掉详情栏，加每页下拉和页码滑条）
- Test: `/tmp/album-checks/check-viewer.mjs`（仓库外）

**Interfaces:**
- Consumes：
  - Task 5：`mediaUrl`、`icon`、`api`、`toast`、`open`、`close`、`swap`；
  - Task 6：`album.js` 的 `sync()`、`changed()`；
  - Task 7：`layoutPages`、`spreadOfPage`；
  - Task 8：`createBook`。
- Produces（`src/viewer.js`）：`openViewer({ album, onOpenPhoto(i), onClose(), onPerPage(perPage) }) → { close(), refresh(album) }`。
  - × 和 Esc 只调用 `onClose()`；真正关闭由相册页根据地址调用 `close()`。
  - `refresh` 在相册变了以后重排，停在原来那页第一张照片附近；相册空了就调用 `onClose()`。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-viewer.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-viewer.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { sharp } from './fixtures.mjs';

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const { layoutPages, spreadOfPage } = await import(`${process.cwd()}/src/book/layout.js`);
const dir = '/tmp/album-checks/lib-viewer';
rmSync(dir, { recursive: true, force: true });

// A 10 000-photo album written straight to disk: four shapes, cache images hard-linked.
const id = randomUUID();
const adir = join(dir, 'albums', id);
mkdirSync(join(adir, 'originals'), { recursive: true });
mkdirSync(join(adir, 'cache'), { recursive: true });
const shapes = [[1600, 1200, '#d9a441'], [1200, 1600, '#2f6a8a'], [1600, 900, '#6d8868'], [1200, 1200, '#ef946b']];
for (const [w, h, background] of shapes) {
  for (const size of [600, 1600]) {
    const s = size / Math.max(w, h);
    await sharp({ create: { width: Math.round(w * s), height: Math.round(h * s), channels: 3, background } })
      .webp()
      .toFile(join(dir, `shape-${w}x${h}_${size}.webp`));
  }
}
const photos = Array.from({ length: 10000 }, (_, i) => {
  const [w, h] = shapes[(i * 7) % 4];
  const pid = `p${String(i + 1).padStart(3, '0')}`;
  for (const size of [600, 1600]) linkSync(join(dir, `shape-${w}x${h}_${size}.webp`), join(adir, 'cache', `${pid}_${size}.webp`));
  return { id: pid, file: `${pid}.jpg`, name: `IMG_${i + 1}.JPG`, w, h, sha256: String(i) };
});
const meta = { version: 1, id, title: '一万张', createdAt: new Date().toISOString(), cover: null, perPage: 2, nextSeq: 10001 };
writeFileSync(join(adir, 'album.json'), JSON.stringify({ ...meta, photos }));
const aspects = photos.map((p) => p.w / p.h);
const spreadsOf = (pages) => Math.ceil(pages.length / 2) + 1;
const firstOf = (pages, s) => (pages[2 * s - 3]?.rects[0] ?? pages[2 * s - 2].rects[0]).i;
const spreadOfPhoto = (pages, i) => spreadOfPage(pages.findIndex((p) => p.rects.some((r) => r.i === i)));
const pages2 = layoutPages(aspects, 2);
const pages1 = layoutPages(aspects, 1);

const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const albumNow = () => fetch(`${server.url}api/albums/${id}`).then((r) => r.json());
const count = `document.querySelector('.ab-count')?.textContent`;
const b = await launch();
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await b.goto(`${server.url}#/a/${id}`);
await b.waitFor(`document.querySelectorAll('.grid .tile').length === 10000`, 30000);
const t0 = Date.now();
await b.click('.acts.normal [data-act="3d"]');
await b.waitFor(`${count} === '1 / ${spreadsOf(pages2)}'`, 30000);
console.log(`3D opened in ${Date.now() - t0} ms`);
assert.equal(await b.evaluate('location.hash'), `#/a/${id}/3d`);
assert.equal(await b.evaluate(`document.querySelector('.ab-slider').hidden`), false);
assert.equal(await b.evaluate(`document.querySelector('.ab-select select').value`), '2');

// Slider: dragging only changes the count; letting go jumps.
await b.evaluate(`(() => { const s = document.querySelector('.ab-slider'); s.value = '1000'; s.dispatchEvent(new Event('input')); })()`);
assert.equal(await b.evaluate(count), `1000 / ${spreadsOf(pages2)}`);
await b.evaluate(`document.querySelector('.ab-slider').dispatchEvent(new Event('change'))`);
await b.key('ArrowRight');
await b.waitFor(`${count} === '1001 / ${spreadsOf(pages2)}'`);

// Density: the book stays at the same photo, and the choice is saved.
const at1 = spreadOfPhoto(pages1, firstOf(pages2, 1001));
await b.evaluate(`(() => { const s = document.querySelector('.ab-select select'); s.value = '1'; s.dispatchEvent(new Event('change')); })()`);
await b.waitFor(`${count} === '${at1} / ${spreadsOf(pages1)}'`, 30000);
await sleep(300);
assert.equal((await albumNow()).perPage, 1);

// Tap the right page (one photo per page: photo 2s − 2) → the lightbox opens over the book.
await sleep(500);
await b.mouse('mousePressed', 960, 400);
await b.mouse('mouseReleased', 960, 400, 0);
await b.waitFor(`location.hash === '#/a/${id}/3d/p/${photos[2 * at1 - 2].id}' && !!document.querySelector('.lb')`);
// Keys now page the lightbox, not the book.
await b.key('ArrowRight');
await b.waitFor(`location.hash === '#/a/${id}/3d/p/${photos[2 * at1 - 1].id}'`);
assert.equal(await b.evaluate(count), `${at1} / ${spreadsOf(pages1)}`);

// Delete in the lightbox: the book is rebuilt from the new album.
await b.click('.lb [data-act=delete]');
await b.waitFor(`document.querySelector('dialog[open]')`);
await b.click('dialog[open] [value=ok]');
await b.waitFor(`${count} === '${at1} / ${Math.ceil(9999 / 2) + 1}'`, 30000);
assert.equal((await albumNow()).photos.length, 9999);

// Esc closes the lightbox first, then the book.
await b.key('Escape');
await b.waitFor(`!document.querySelector('.lb') && location.hash === '#/a/${id}/3d'`);
await b.key('Escape');
await b.waitFor(`!document.querySelector('.ab') && location.hash === '#/a/${id}'`);
assert.deepEqual(b.errors, []);
await b.close();

// Phones: the slider sits at the bottom in landscape; portrait asks to turn the phone.
const m = await launch({ width: 844, height: 390, mobile: true });
await m.goto(`${server.url}#/a/${id}/3d`);
await m.waitFor(`!!document.querySelector('.ab-count')?.textContent`, 30000);
assert.equal(await m.evaluate(`getComputedStyle(document.querySelector('.ab-slider')).position`), 'absolute');
await m.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await m.waitFor(`getComputedStyle(document.querySelector('.ab-rotate')).display === 'flex'`);
assert.deepEqual(m.errors, []);
await m.close();
await server.close();
console.log('viewer ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-viewer.mjs`
Expected: FAIL，`timed out: document.querySelector('.ab-count')?.textContent === '1 / …'`（点「3D 翻阅」还打不开书）。

- [ ] **Step 3: 查看器**

`src/viewer.js`（整个替换）：

```js
import { mediaUrl } from './api.js';
import { createBook } from './book/book.js';
import { layoutPages, spreadOfPage } from './book/layout.js';
import { icon } from './ui.js';

const HINT_OPEN = '拖动页面或点击两侧翻页；点击照片看大图';
const HINT_CLOSED = '点击封面或向左拖动打开';
const KEYS = { ArrowLeft: 'prev', PageUp: 'prev', ArrowRight: 'next', PageDown: 'next' };
const DENSITY = [[1, '每页 1 张'], [2, '宽松'], [3, '紧凑']];
const DRAWN = 20; // the slider shows once the album has more leaves than the book draws

export function openViewer({ album, onOpenPhoto, onClose, onPerPage }) {
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'ab';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="ab-stage"></div>
    <header class="ab-bar">
      <button class="ab-icon" type="button" data-act="close" aria-label="关闭">${icon('close')}</button>
      <h2 class="ab-title"></h2>
      <label class="ab-select"><span>每页</span><select>${DENSITY.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <button class="ab-icon" type="button" data-act="cover" aria-label="合上相册" aria-pressed="false">${icon('book')}</button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav" data-open>
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="上一页">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="下一页">${icon('next')}</button>
      </div>
      <input class="ab-slider" type="range" min="1" step="1" aria-label="跳到第几个跨页" hidden>
      <div class="ab-nav" data-closed hidden>
        <button class="ab-primary" type="button" data-act="cover">${icon('bookOpen')}打开相册</button>
      </div>
      <p class="ab-hint">${HINT_OPEN}</p>
    </footer>
    <p class="ab-message" hidden>当前浏览器无法显示 3D 相册（WebGL 不可用）</p>
    <div class="ab-rotate">${icon('phone')}<p>请横过手机查看相册</p></div>`;
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.ab-stage');
  const slider = $('.ab-slider');
  const per = $('.ab-select select');
  let book = null;
  let pages = [];
  let spread = 1;
  let sliding = false;

  const photoUrl = (i, size) => mediaUrl(album.id, album.photos[i].id, size);
  const firstPhotoOf = (s) => (pages[2 * s - 3]?.rects[0] ?? pages[2 * s - 2]?.rects[0])?.i ?? 0;
  function spreadOf(i) {
    const p = pages.findIndex((page) => page.rects.some((r) => r.i === i));
    return p < 0 ? 1 : spreadOfPage(p);
  }

  function onChange({ spread: s, spreads, closed }) {
    spread = s;
    $('[data-open]').hidden = closed;
    $('[data-closed]').hidden = !closed;
    $('.ab-count').textContent = `${s} / ${spreads}`;
    $('[data-act=next]').disabled = s === spreads;
    slider.hidden = closed || spreads <= DRAWN + 1;
    slider.max = String(spreads);
    if (!sliding) slider.value = String(s);
    const cover = $('.ab-bar [data-act=cover]');
    cover.innerHTML = icon(closed ? 'bookOpen' : 'book');
    cover.setAttribute('aria-label', closed ? '打开相册' : '合上相册');
    cover.setAttribute('aria-pressed', String(closed));
    $('.ab-hint').textContent = closed ? HINT_CLOSED : HINT_OPEN;
  }

  function fail() {
    root.dataset.error = '';
    $('.ab-message').hidden = false;
  }

  // (Re)builds the book from the album, opened at the spread that shows photo i.
  function build(i = 0) {
    book?.dispose();
    book = null;
    pages = layoutPages(album.photos.map((p) => p.w / p.h), album.perPage ?? 2);
    per.value = String(album.perPage ?? 2);
    $('.ab-title').textContent = album.title;
    root.setAttribute('aria-label', album.title);
    try {
      book = createBook(stage, {
        title: album.title,
        pages,
        photoUrl,
        insets,
        startSpread: spreadOf(i),
        onChange,
        onPhotoClick: onOpenPhoto,
      });
    } catch (err) {
      if (err.message !== 'webgl') throw err;
      fail();
    }
  }

  function onKey(e) {
    if (e.target.closest?.('select, input')) return; // the menu and the slider keep their keys
    if (e.key === 'Escape') onClose();
    else if (KEYS[e.key] && book) book[KEYS[e.key]]();
    else return;
    e.preventDefault();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') onClose();
    else if (act && book) book[act === 'cover' ? 'toggleCover' : act]();
  }

  slider.addEventListener('input', () => {
    sliding = true;
    $('.ab-count').textContent = `${slider.value} / ${slider.max}`;
  });
  slider.addEventListener('change', () => {
    sliding = false;
    book?.jump(Number(slider.value));
  });
  per.addEventListener('change', () => {
    const i = firstPhotoOf(spread);
    album = { ...album, perPage: Number(per.value) };
    build(i);
    per.blur(); // ← → turn pages again
    onPerPage(album.perPage);
  });

  function close() {
    window.removeEventListener('keydown', onKey);
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus?.();
  }

  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  stage.addEventListener('webglcontextlost', fail, true); // the event does not bubble
  document.body.append(root);
  root.focus();

  // Read live so the framing follows rotation; in phone landscape the foot floats over the book.
  const phoneLandscape = matchMedia('(orientation: landscape) and (max-height: 519.98px)');
  const insets = {
    get top() {
      return $('.ab-bar').offsetHeight;
    },
    get bottom() {
      return phoneLandscape.matches ? 0 : $('.ab-foot').offsetHeight;
    },
  };
  build(0);

  return {
    close,
    refresh(next) {
      const old = firstPhotoOf(spread);
      const keep = album.photos[old]?.id;
      album = next;
      if (!album.photos.length) return onClose();
      const i = album.photos.findIndex((p) => p.id === keep);
      build(i >= 0 ? i : Math.min(old, album.photos.length - 1));
    },
  };
}
```

- [ ] **Step 4: 相册页接上 3D**

`src/album.js` 改五处：

1. 在 `let lightbox = null;` 后面加：

```js
  let viewer = null;
  let viewerLoading = false;
```

2. `changed` 改成：

```js
  // The lightbox changed the album (cover, deletion): redraw what lies under it.
  function changed(next) {
    album = next;
    render();
    viewer?.refresh(next);
  }
```

3. `sync` 整个换成：

```js
  // Opens or closes the 3D book and the lightbox to match the address.
  function sync() {
    if (route.three && !album.photos.length) {
      route = { ...route, three: false, photo: null };
      swap(`#/a/${id}`);
    }
    if (route.three && !viewer && !viewerLoading) {
      viewerLoading = true;
      import('./viewer.js').then(({ openViewer }) => {
        viewerLoading = false;
        if (!alive || !route.three || viewer) return;
        viewer = openViewer({
          album,
          onOpenPhoto: (i) => open(`#/a/${id}/3d/p/${album.photos[i].id}`),
          onClose: () => close(`#/a/${id}`),
          onPerPage: (perPage) =>
            api.updateAlbum(id, { perPage }).then(
              (next) => (album = next),
              (err) => toast(`保存失败：${err.message}`),
            ),
        });
      });
    } else if (!route.three && viewer) {
      viewer.close();
      viewer = null;
    }
    const i = route.photo ? album.photos.findIndex((p) => p.id === route.photo) : -1;
    if (i >= 0 && lightbox) lightbox.show(i, album);
    else if (i >= 0) {
      lightbox = openLightbox({
        album,
        index: i,
        onIndex: (pid) => {
          route = { ...route, photo: pid };
          swap(`${base()}/p/${pid}`);
        },
        onAlbum: changed,
        onClose: () => close(base()),
      });
    } else {
      lightbox?.close();
      lightbox = null;
      if (route.photo) swap(base()); // a photo that no longer exists
    }
  }
```

4. `onFocus` 改成（3D 打开时不刷新，免得书被重建）：

```js
  const onFocus = () => {
    if (!uploading && !drag && !viewer) load();
  };
```

5. `destroy()` 第一行 `alive = false;` 后面加 `viewer?.close();`。

- [ ] **Step 5: 样式**

`src/style.css`：
1. 删掉 `/* Card detail panel */` 整段（`.ab-panel-wrap` 到 `.ab-panel-meta` 的所有规则和 `@keyframes ab-panel-in`）。
2. 删掉 `@media (max-width: 600px) { .ab-panel-wrap { … } }` 整个块。
3. 在 `@media (max-width: 600px) and (orientation: portrait)` 里，把选择器 `.ab-stage, .ab-foot, .ab-panel-wrap` 改成 `.ab-stage, .ab-foot`。
4. 在手机横屏块里删掉 `.ab-panel-wrap { top: 44px; }`，并在块的最后加：

```css
  .ab-slider {
    position: absolute;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    width: min(320px, 46vw);
    translate: -50%;
  }
```

5. 删掉文件最后的 `@media (prefers-reduced-motion: reduce) { .ab-panel { animation: none; } }`。
6. 在 `.ab-hint { … }` 后面加：

```css
.ab-select {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 4px 0 12px;
  border-radius: 999px;
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-2);
  font-size: 13px;
  pointer-events: auto;
}

.ab-select select {
  height: 34px;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}

.ab-slider {
  width: min(360px, 60vw);
  margin: 2px 0;
  accent-color: var(--accent);
  pointer-events: auto;
}
```

Run: `grep -n "ab-panel" src/style.css src/viewer.js`
Expected: 没有输出。

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-viewer.mjs && node /tmp/album-checks/check-lightbox.mjs`
Expected: `3D opened in … ms`、`viewer ok`，然后是 `lightbox ok`。

- [ ] **Step 7: 提交**

```bash
git add src/viewer.js src/album.js src/style.css
git commit -m "feat: open albums as one continuous 3D book with density menu and page slider" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 10: 手机访问

**Files:**
- Create: `src/phone.js`
- Modify: `src/wall.js`（「手机访问」按钮）、`src/style.css`（弹窗样式）
- Test: `/tmp/album-checks/check-phone.mjs`（仓库外）

**Interfaces:**
- Consumes：
  - Task 4：`GET/PATCH /api/phone` 返回的 `{ enabled, key, ip, port }`；
  - Task 5：`api.phone`、`api.setPhone`、`icon`、`toast`；
  - `uqr` 的 `renderSVG(text, { border })`。
- Produces（`src/phone.js`）：`openPhoneDialog() → Promise<void>`。
  - 弹窗类名 `dlg phone`，关闭时为 `off`；
  - 弹窗里有 `.qr`（SVG）、`code`（链接）、`.sw`（开关）、`.err`（没有局域网）、`[data-act=copy|close]`。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-phone.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-phone.mjs
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { launch } from './cdp.mjs';

const { startServer, lanAddresses } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-phone';
rmSync(dir, { recursive: true, force: true });
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const port = new URL(server.url).port;
const ip = lanAddresses()[0];
const b = await launch();
await b.goto(server.url);
await b.click('[data-act=phone]');
await b.waitFor(`document.querySelector('dialog[open] h3')?.textContent === '用手机看相册'`);
if (!ip) {
  assert.equal(await b.evaluate(`document.querySelector('dialog[open] .err').hidden`), false);
  assert.equal(await b.evaluate(`document.querySelector('dialog[open] .sw').disabled`), true);
  console.log('no LAN address: only the offline state was checked');
} else {
  assert.equal(await b.evaluate(`document.querySelector('dialog[open] .sw').checked`), false);
  assert.equal(await b.evaluate(`!!document.querySelector('dialog[open] .qr svg')`), false);
  await b.click('dialog[open] .sw');
  await b.waitFor(`!!document.querySelector('dialog[open] .qr svg')`);
  const url = await b.evaluate(`document.querySelector('dialog[open] code').textContent`);
  assert.match(url, new RegExp(`^http://${ip.replaceAll('.', '\\.')}:${port}/\\?key=[0-9a-f]{32}$`));

  // A phone opens the link: it gets the cookie and sees the wall, without the phone button.
  const m = await launch({ width: 390, height: 844, mobile: true });
  await m.goto(url);
  await m.waitFor(`location.pathname === '/' && !!document.querySelector('.wall')`);
  assert.equal(await m.evaluate(`!!document.querySelector('[data-act=phone]')`), false);
  // Switching off locks the phone out at once.
  await b.click('dialog[open] .sw');
  await b.waitFor(`!document.querySelector('dialog[open] .sw').checked`);
  await m.goto(`http://${ip}:${port}/`);
  await m.waitFor(`document.body.textContent.includes('手机访问已关闭')`);
  await m.close();
}
await b.click('dialog[open] [data-act=close]');
await b.waitFor(`!document.querySelector('dialog[open]')`);
assert.deepEqual(b.errors, []);
await b.close();
await server.close();
console.log('phone ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && node /tmp/album-checks/check-phone.mjs`
Expected: FAIL，`timed out: !!document.querySelector("[data-act=phone]")`

- [ ] **Step 3: 实现 src/phone.js**

`src/phone.js`：

```js
import { renderSVG } from 'uqr';
import { api } from './api.js';
import { icon, toast } from './ui.js';

export async function openPhoneDialog() {
  const d = document.createElement('dialog');
  d.className = 'dlg phone off';
  d.innerHTML = `
    <div class="mh"><h3>用手机看相册</h3><button class="ibtn" type="button" data-act="close" aria-label="关闭">${icon('close')}</button></div>
    <p class="dlg-text">手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。</p>
    <div class="qr"></div>
    <div class="ub"><code></code><button class="btn" type="button" data-act="copy">${icon('copy')}<span>复制</span></button></div>
    <label class="tg"><span><b>允许手机访问</b><small>关掉后，手机马上打不开</small></span><input class="sw" type="checkbox"></label>
    <p class="err" hidden>这台电脑没有连接局域网</p>`;
  const sw = d.querySelector('.sw');
  let info = null;

  function render() {
    const url = info.ip ? `http://${info.ip}:${info.port}/?key=${info.key}` : '';
    const on = info.enabled && !!url;
    d.classList.toggle('off', !on);
    sw.checked = info.enabled;
    sw.disabled = !url;
    d.querySelector('.err').hidden = !!url;
    d.querySelector('code').textContent = on ? url : '打开下面的开关后显示链接';
    d.querySelector('.qr').innerHTML = on ? renderSVG(url, { border: 1 }) : '';
    d.querySelector('[data-act=copy]').disabled = !on;
  }

  // Every switch-on makes a new key on the server, so old links stop working (spec §9).
  sw.addEventListener('change', async () => {
    try {
      info = await api.setPhone(sw.checked);
      render();
    } catch (err) {
      sw.checked = !sw.checked;
      toast(`操作失败：${err.message}`);
    }
  });
  d.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') d.close();
    else if (act === 'copy') {
      navigator.clipboard.writeText(d.querySelector('code').textContent).then(
        () => toast('已复制'),
        () => toast('复制失败，请手动复制'),
      );
    }
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  try {
    info = await api.phone();
    render();
  } catch (err) {
    toast(`加载失败：${err.message}`);
    d.close();
  }
}
```

- [ ] **Step 4: 相册墙加按钮**

`src/wall.js` 改三处：

1. import 后面加：

```js
import { openPhoneDialog } from './phone.js';

// Phone access is set up on the computer only (spec §12).
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
```

2. 顶栏里「新建相册」按钮前面加一行：

```js
        ${local ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>手机访问</span></button>` : ''}
```

3. `onClick` 里，在 `} else if (act === 'new') {` 前面加：

```js
      } else if (act === 'phone') {
        openPhoneDialog();
```

- [ ] **Step 5: 弹窗样式**

在 `src/style.css` 的 `/* Lightbox */` 前面加：

```css
/* Phone access */
.dlg.phone {
  width: min(440px, calc(100vw - 32px));
}

.mh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.mh h3 {
  margin: 0;
}

.qr {
  width: 220px;
  height: 220px;
  margin: 12px auto 0;
  padding: 8px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 0 0 1px var(--line);
}

.qr svg {
  display: block;
  width: 100%;
  height: 100%;
}

.phone.off .qr {
  display: none;
}

.ub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.ub code {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--hover);
  color: var(--ink-2);
  font: 13px/36px ui-monospace, Menlo, monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  cursor: pointer;
}

.tg small {
  display: block;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
}

.sw {
  appearance: none;
  position: relative;
  flex: none;
  width: 46px;
  height: 28px;
  margin: 0;
  border-radius: 14px;
  background: var(--line);
  cursor: pointer;
  transition: background-color 0.2s;
}

.sw::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: translate 0.2s;
}

.sw:checked {
  background: var(--accent);
}

.sw:checked::after {
  translate: 18px;
}

.sw:disabled {
  opacity: 0.4;
  cursor: default;
}

.err {
  margin: 12px 0 0;
  color: var(--danger);
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && node /tmp/album-checks/check-phone.mjs && node /tmp/album-checks/check-pages.mjs`
Expected: `phone ok`，然后是 `pages ok`。

- [ ] **Step 7: 提交**

```bash
git add src/phone.js src/wall.js src/style.css
git commit -m "feat: add phone access with a QR code and an on/off switch" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 11: 验收与使用说明

**Files:**
- Create: `README.md`
- Test: `/tmp/album-checks/check-shots.mjs`（仓库外），截图放在 `/tmp/album-shots/`

**Interfaces:**
- Consumes: 前面所有任务。
- Produces: 使用说明；一组截图（和界面稿对照用）；一份真机检查结果，由用户在手机上完成。

- [ ] **Step 1: 写使用说明**

`README.md`：

````markdown
# 相册

本地相册管理工具：照片存在自己的电脑上，在浏览器里管理，用 3D 翻阅的方式看；同一 Wi‑Fi 下手机扫码也能看、能上传。

## 运行

需要 macOS 和 Node 20.9 以上。

```bash
npm install
npm start
```

然后打开 http://localhost:5180 。

- 相册库默认在 `~/Pictures/相册库`，用 `ALBUM_LIBRARY=/你的/路径 npm start` 换位置。
- 端口默认 5180，用 `PORT=5181 npm start` 换端口。
- 开发：`npm run dev`；要让手机访问开发服务器，用 `npm run dev -- --host`。

## 手机访问

在相册墙点「手机访问」，打开「允许手机访问」，用手机相机扫二维码。手机和电脑要连同一个 Wi‑Fi。每次重新打开开关都会换一个新链接，旧链接失效。

第一次启动时，macOS 可能会问是否允许 node 接受传入的网络连接。要选「允许」，否则手机打不开。局域网里走的是 HTTP，只在家里或可信的 Wi‑Fi 下使用。

## 删除

在网页里删除的相册和照片会直接从相册库删除，不能恢复。要备份，复制整个相册库文件夹即可。
````

- [ ] **Step 2: 写截图脚本**

`/tmp/album-checks/check-shots.mjs`：

```js
// Run from the project root after `npm run build`: node /tmp/album-checks/check-shots.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { FIX, sharp } from './fixtures.mjs';

const { startServer } = await import(`${process.cwd()}/server/app.js`);
const dir = '/tmp/album-checks/lib-shots';
const out = '/tmp/album-shots';
rmSync(dir, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(FIX, { recursive: true });
const server = await startServer({ dir, port: 0, dist: `${process.cwd()}/dist` });
const base = server.url.replace(/\/$/, '');
const post = (path, body, headers) => fetch(base + path, { method: 'POST', headers, body }).then((r) => r.json());

// Three albums of mixed shapes and colours (gradients, so the pages are easy to tell apart).
const shapes = [[4, 3], [3, 4], [16, 9], [3, 4], [1, 1], [4, 3], [9, 16], [3, 2], [3, 4], [3, 1], [4, 3], [2, 3]];
const colours = ['#ef946b', '#2f6a8a', '#6d8868', '#d9a441', '#c8452b', '#8db2c6', '#3c7450', '#f2c94c'];
let first = null;
for (const [a, title] of [[0, '2024 京都旅行'], [3, '宝宝一周岁'], [5, '西湖周末']].map(([n, t]) => [n, t])) {
  const album = await post('/api/albums', JSON.stringify({ title }), { 'Content-Type': 'application/json' });
  first ??= album;
  for (let i = 0; i < (album === first ? 48 : 6); i++) {
    const [w, h] = shapes[(i + a) % shapes.length];
    const file = join(FIX, `shot-${a}-${i}.jpg`);
    const c1 = colours[(i + a) % colours.length];
    const c2 = colours[(i + a + 3) % colours.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 200}" height="${h * 200}"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="55%" font-size="${Math.min(w, h) * 60}" text-anchor="middle" fill="#fff" font-family="sans-serif">${i + 1}</text></svg>`;
    await sharp(Buffer.from(svg)).jpeg().toFile(file);
    await post(`/api/albums/${album.id}/photos?name=IMG_${i + 1}.JPG`, readFileSync(file), { 'X-Album-Upload': '1' });
  }
}

const shoot = async (b, name, ready) => {
  await b.waitFor(ready, 30000);
  await sleep(800);
  await b.shot(join(out, `${name}.png`));
};
const b = await launch();
await b.goto(server.url);
await shoot(b, 'wall', `document.querySelectorAll('.album .cover img').length === 3`);
await b.goto(`${server.url}#/a/${first.id}`);
await shoot(b, 'album', `document.querySelectorAll('.grid .tile').length === 48`);
await b.click('[data-act=select]');
await b.click('.tile[data-id=p002]');
await b.click('.tile[data-id=p005]');
await shoot(b, 'select', `document.querySelector('.picked').textContent === '已选 2 张'`);
await b.click('[data-act=cancel]');
await b.goto(`${server.url}#/a/${first.id}/p/p004`);
await shoot(b, 'lightbox', `document.querySelector('.lb-img')?.complete`);
await b.goto(`${server.url}#/a/${first.id}/3d`);
await shoot(b, '3d', `!!document.querySelector('.ab-count')?.textContent`);
await b.key('ArrowRight');
await shoot(b, '3d-spread-2', `document.querySelector('.ab-count').textContent.startsWith('2 /')`);
await b.key('Escape');
await b.goto(server.url);
await b.click('[data-act=phone]');
await b.click('dialog[open] .sw');
await shoot(b, 'phone', `!!document.querySelector('dialog[open] .qr svg') || !document.querySelector('dialog[open] .err').hidden`);
await b.click('dialog[open] .sw');
assert.deepEqual(b.errors, []);
await b.close();

const m = await launch({ width: 390, height: 844, mobile: true });
await m.goto(server.url);
await shoot(m, 'phone-wall', `document.querySelectorAll('.album').length === 3`);
await m.goto(`${server.url}#/a/${first.id}`);
await shoot(m, 'phone-album', `document.querySelectorAll('.grid .tile').length === 48`);
await m.goto(`${server.url}#/a/${first.id}/p/p002`);
await shoot(m, 'phone-lightbox', `document.querySelector('.lb-img')?.complete`);
await m.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await m.goto(`${server.url}#/a/${first.id}/3d`);
await shoot(m, 'phone-3d', `!!document.querySelector('.ab-count')?.textContent`);
assert.deepEqual(m.errors, []);
await m.close();
await server.close();
console.log(`shots in ${out}`);
```

- [ ] **Step 3: 全部检查跑一遍**

Run:

```bash
npm run build && for c in library import server layout book pages lightbox viewer phone shots; do node /tmp/album-checks/check-$c.mjs || break; done
```

Expected：
- 依次输出 `library ok`、`import ok`、`server ok`、`layout ok`、`book ok`、`pages ok`、`lightbox ok`、`viewer ok`、`phone ok`、`shots in /tmp/album-shots`；
- `vite build` 只有 three 的 chunk 体积警告。

- [ ] **Step 4: 对照界面稿看截图**

在浏览器打开 `docs/superpowers/mockups/2026-10-26-photo-album-manager/ui-draft-v1.html` 和 `layout-auto-v1.html`，逐张对照 `/tmp/album-shots/*.png`。下面各项都应一致，不一致就回到对应任务修改：
- `wall.png`、`phone-wall.png`：
  - 顶栏有「相册」「手机访问」「新建相册」，手机上只有「＋」；
  - 封面 4:3，下面是名字和张数；
  - 电脑多列，手机两列。
- `album.png`、`select.png`、`phone-album.png`：
  - 顶栏按钮；
  - 方形缩略图，第一张带「封面」；
  - 选择模式的勾和「已选 2 张 · 删除」；
  - 手机三列，底部浮动「上传」「3D 翻阅」。
- `lightbox.png`、`phone-lightbox.png`：
  - 黑底，「4 / 48」和文件名；
  - 「设为封面」「查看原图」「删除」×；
  - 照片完整显示。
- `3d.png`、`3d-spread-2.png`、`phone-3d.png`：
  - 每页是一整张透明袋，照片按横竖排成一张到三张；
  - 右上角有「每页 宽松」，底部有 ‹ k / N ›；
  - 手机横屏时书铺满屏幕，‹ › 在两边。
- `phone.png`：
  - 二维码、链接、「复制」、「允许手机访问」开关；
  - 没有局域网时显示「这台电脑没有连接局域网」。

- [ ] **Step 5: 真机检查（请用户完成）**

1. 运行 `npm start`。如果 macOS 问是否允许传入连接，选「允许」。
2. 在电脑上打开 http://localhost:5180 ，建一本相册，从电脑上传几张照片，其中包括 iPhone 竖拍的 HEIC。确认网格、大图和 3D 里照片方向都正确（spec §15 待验证）。
3. 打开「手机访问」，打开开关，用手机相机扫码，确认手机能看到相册墙。
4. 在手机上：
   - 进入相册，用「上传」从手机相册选几张，包括实况照片；
   - 确认进度提示正常，电脑上切回窗口后能看到新照片。
5. 手机横过来，打开 3D 翻阅：
   - 用手指拖动翻页；
   - 点照片打开大图，左右滑动；
   - 每页切到「紧凑」，看照片是否太小（spec §15）。
6. 在电脑上关掉开关，手机刷新，应显示「手机访问已关闭…」；再打开开关，旧的二维码链接不能再用。
7. 在一本有 100 张以上照片的相册里连续翻页，看两叠厚度变化和磨砂封面下的内容是否自然（spec §15）。

把结果告诉执行者；有问题就回到对应任务修改。

- [ ] **Step 6: 提交**

```bash
git add README.md
git commit -m "docs: add usage notes for the photo album" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

