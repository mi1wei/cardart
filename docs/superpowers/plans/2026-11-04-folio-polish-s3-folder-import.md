# Folio 打磨 · S3 文件夹导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在电脑上把照片、视频或整个文件夹拖进 Folio，或在欢迎页点「从文件夹导入…」。每个顶层文件夹自动变成一本以文件夹命名的相册；拖进相册页的文件夹，其中的照片加进当前相册。

**Architecture:**
- **收集文件：** 新模块 `src/folder-files.js` 只做这一件事。它递归读取拖放文件夹的 entry，按 `webkitRelativePath` 给文件夹选择分组，再过滤和计数。它不依赖 DOM，可以在 Node 里测试。
- **导入队列：** `album.js` 里的导入队列和进度框抽到 `src/import-files.js`，相册页和相册墙共用。它负责逐个上传、视频探测、分类计数、汇总和 `data-busy`。
- **服务端：** 不改，复用 `POST /api/albums` 和现有上传接口。

**Tech Stack:** 原生 JS（ES modules）+ Vite 8、Electron 45、Playwright 1.64（Electron 端到端）、Node 24 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md` 的以下几节：
- §5（S3）
- §8 错误处理：读文件失败计为失败；新建相册失败则停止该文件夹，toast 原因，继续下一个
- §9 测试：`welcome-import.spec.cjs`
- §10 文档：README 新增「导入」一节

对应对比稿第 10 项：`docs/superpowers/mockups/2026-11-03-folio-polish/img/c10-after.png`。

## 开始之前

- **分支：** `feat/folio-polish-s3`，工作区 `.worktrees/folio-polish-s3`。
  - 它叠在 `feat/folio-polish-s2`（PR #24，CI 通过，尚未合并）之上，因为 S3 要改 S2 刚改过的 `album.js`、`i18n.js`、`style.css`。
  - S2 合并后，把本分支 rebase 到 `main`。
- **依赖：** `npm ci --include=optional`，再用 `npx --no-install electron --version` 解出 Electron。
- **构建：** 端到端测试跑的是 `dist/`，每次跑 Playwright 前先 `npm run build`。长时间运行的命令用 `caffeinate -di` 包起来，防止系统休眠导致超时。
- **已经验证过的事实（2026-11-04 在 Electron 45 里做的小实验）：**
  - Playwright 的 `setInputFiles(目录)` 能驱动 `<input type=file webkitdirectory>`。
    - 得到的 `webkitRelativePath` 形如 `Trip/a.jpg`、`Trip/sub/b.jpg`。
    - 隐藏文件和 `.txt` 也会给出来，所以代码必须自己过滤。
  - 用 `new DataTransfer()` 造的条目，`webkitGetAsEntry()` 返回 `null`。
    - 所以拖放用例改用自己造的 `dataTransfer` 对象（Task 3 的 `e2e/drop-helpers.cjs`）。
    - 代码在拿不到 entry 时退回 `getAsFile()`。
- **真实拖放的两个坑：**
  - **事件结束后条目失效：** drop 事件处理完，浏览器就清空 `DataTransfer.items`。所以 `webkitGetAsEntry()` 必须在事件处理函数里、第一个 `await` 之前调用；拿到的 entry 之后仍可读。
  - **分批返回：** Chromium 的 `readEntries()` 每次最多返回 100 项，要一直读到返回空数组。
- **现有机制（不改，只复用）：**
  - **导航拦截：** `main.js` 的 `show()` 在 `view.canLeave(next, again)` 为假时把地址换回原来的。语言切换重绘时 `again` 为真。
  - **退出等待：** 桌面版退出会等 `html[data-busy]` 清除。测试里自己设置的 `data-busy` 必须自己清掉。
  - **toast：** `toast(text, ms)` 共用一个元素，后一条覆盖前一条。
  - **对话框：** `dialog({ title, text, value, ok })` 的输入框 `maxlength=50`；取消或输入为空时返回 `null`。
  - **只读许可证：** `[data-write]` 控件变成 `inert` 并带 `aria-disabled="true"`；`allowWrite()` 在只读时 toast「只读模式…」并返回 `false`。
  - **手机：** `onComputer`（`src/phone.js`）只看主机名，端到端测试里总为真。手机上隐藏文件夹导入只能靠代码审查确认。

## Global Constraints

- **服务端：** 不改，复用现有的创建相册和上传接口。
- **保留哪些文件：** 只保留 `image/*` 和 MP4、MOV、M4V，按类型或扩展名判断，与相册页的 `accept="image/*,.heic,.heif,video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"` 一致。
- **隐藏项：** 跳过以 `.` 开头的文件和文件夹。
  - 只针对选中或拖入的文件夹**里面**的项。
  - 不计数，免得每个文件夹都报一个 `.DS_Store`。
  - 用户直接选中的那个文件夹即使名字以 `.` 开头也照常导入。
- **相册名：** 去掉首尾空白，超过 50 字截断。
  - 与服务端 `[...t].length > 50` 一致，按 code point 计。
  - 去掉空白后为空时用「新相册」。
  - 允许与已有相册同名。
- **手机：** 不提供文件夹导入（`onComputer` 为假时）。
  - 不显示拖放说明和「从文件夹导入…」。
  - 相册墙不注册拖放。
- **导入期间：** `html[data-busy]`、离开页面的拦截、完成后的汇总文案沿用现有规则；写操作先过 `allowWrite()`。
- **出错（spec §8）：**
  - 读不出的文件跳过，计为失败，继续其余文件。
  - 新建相册失败时停止该文件夹，toast 原因，继续下一个文件夹。
- **文案：** 中英文两套都要有（`src/i18n.js`）。

## Review Focus

1. **单层超过 100 个文件的文件夹**（Chromium 的 `readEntries()` 分批返回）：全部导入，不只前 100 个。→ Task 1 的 Node 测试（230 个，每批 100）和 Task 3 的端到端（每批 2）。
2. **drop 事件结束后浏览器清空条目**：文件夹 entry 必须在事件里同步取出，否则真实拖放什么也读不到，而测试里的假对象不会暴露这个问题。→ Task 1 的 Node 测试（返回 promise 后立刻清空条目），以及 `drop-helpers.cjs` 在事件后让条目失效。
3. **文件夹里有 `.DS_Store`、`.git`、子文件夹、非媒体文件、读不出的文件**：
   - 隐藏项不计数。
   - 子文件夹的照片并入顶层文件夹那本相册。
   - 非媒体文件计入「跳过」。
   - 读不出的文件计为失败，其余照常导入。
   - → Task 1、Task 3、Task 4。
4. **导入进行中**：
   - 离开相册墙、新建或删除相册：拒绝并提示稍候。
   - 再选一个文件夹或再拖入一批：排进同一轮，汇总合在一起。
   - → Task 4、Task 5。
5. **只读许可证**：拖入，或许可证到期后才选好文件夹，都不建相册、不上传。→ Task 4、Task 5。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/folder-files.js` | 建 | 从拖放或文件夹选择收集文件：分组、过滤、计数、相册名 |
| `src/folder-files.test.js` | 建 | 上面模块的 Node 测试（用假 entry） |
| `src/import-files.js` | 建 | 导入队列与进度框：逐个上传、视频探测、分类计数、汇总、`data-busy` |
| `src/album.js` | 改 | 改用 `import-files.js`；拖入的文件夹加进当前相册；导入时标题下的日期不消失 |
| `src/wall.js` | 改 | 欢迎页的拖放说明和「从文件夹导入…」；相册墙随时可拖入；进度；导入时不能离开 |
| `src/i18n.js` | 改 | 新文案（中英） |
| `src/ui.js` | 改 | `folder` 图标 |
| `src/style.css` | 改 | 欢迎页按钮行、拖放说明、整页拖放提示 |
| `e2e/drop-helpers.cjs` | 建 | 在页面里模拟系统拖放（带文件夹 entry、分批读取、事件后失效） |
| `e2e/welcome-import.spec.cjs` | 改 | 相册页拖入文件夹、欢迎页选择文件夹、相册墙拖入 |
| `e2e/album-polish.spec.cjs` | 改 | 导入时相册页标题下的日期不消失 |
| `README.md` | 改 | 新增「导入」一节 |

---

### Task 1: 收集文件 `src/folder-files.js`

**Files:**
- Create: `src/folder-files.js`
- Create: `src/folder-files.test.js`（`npm test` 已包含 `src/*.test.js`）

**Interfaces:**
- Consumes: 无。
- Produces:
  - `importable(file: File): boolean`
  - `pickedFolder(list: Iterable<File>): { name: string, files: File[], skipped: number, unreadable: number } | null`：没有文件时返回 `null`。
  - `collectDrop(transfer): Promise<{ folders: Array<{ name, files, skipped, unreadable }>, loose: { files, skipped, unreadable } }>`
    - 同步读完 `transfer.items` 后才返回 promise。
    - `transfer` 可以是 `DataTransfer` 或同形的对象。
  - `albumTitle(name: string, fallback: string): string`
  - 计数的含义：
    - `files`：按路径排序，`IMG_2` 在 `IMG_10` 之前。
    - `skipped`：不是照片或视频的文件数。
    - `unreadable`：读不出的文件或文件夹数。

- [ ] **Step 1: 写失败的测试**

`src/folder-files.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumTitle, collectDrop, importable, pickedFolder } from './folder-files.js';

const file = (name, type = '') => new File(['x'], name, { type });
// <input webkitdirectory> gives each file its path from the chosen folder down.
const picked = (path, type) => Object.defineProperty(file(path.split('/').at(-1), type), 'webkitRelativePath', { value: path });
// Folder entries like Chromium's: readEntries() hands out at most `batch` children a call.
const folder = (name, children, { batch = 100, broken = false } = {}) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let at = 0;
    return {
      readEntries(ok, fail) {
        if (broken) return queueMicrotask(() => fail(new DOMException('Denied', 'NotReadableError')));
        const next = children.slice(at, at + batch);
        at += next.length;
        queueMicrotask(() => ok(next));
      },
    };
  },
});
const entry = (name, type = '', { broken = false } = {}) => ({
  isFile: true,
  isDirectory: false,
  name,
  file(ok, fail) { queueMicrotask(() => (broken ? fail(new DOMException('Moved', 'NotFoundError')) : ok(file(name, type)))); },
});
// A drop's DataTransfer: once the event is over the list is empty and its items answer null.
function drop(...nodes) {
  let live = true;
  const items = nodes.map((node) => ({
    kind: 'file',
    webkitGetAsEntry: () => (live ? node.entry ?? null : null),
    getAsFile: () => (live ? node.file ?? null : null),
  }));
  return { transfer: { types: ['Files'], items }, end() { live = false; items.length = 0; } };
}
const names = (files) => files.map((f) => f.name);

test('importable keeps photos and MP4, MOV and M4V videos, by type or by name, as the file input does', () => {
  for (const f of [file('a.jpg', 'image/jpeg'), file('b.gif', 'image/gif'), file('c.HEIC'), file('d.heif'), file('e.MOV'), file('f.mp4'), file('g.m4v'), file('h', 'video/quicktime')]) {
    assert.equal(importable(f), true, f.name);
  }
  for (const f of [file('notes.txt', 'text/plain'), file('clip.webm', 'video/webm'), file('doc.pdf', 'application/pdf'), file('blank')]) {
    assert.equal(importable(f), false, f.name);
  }
});

test('a picked folder keeps its name and leaves out hidden items below it, sorted by path', () => {
  const result = pickedFolder([
    picked('Trip/img10.jpg', 'image/jpeg'), picked('Trip/img2.jpg', 'image/jpeg'), picked('Trip/sub/b.jpg', 'image/jpeg'),
    picked('Trip/.DS_Store'), picked('Trip/.git/x.jpg', 'image/jpeg'), picked('Trip/notes.txt', 'text/plain'),
  ]);
  assert.equal(result.name, 'Trip');
  assert.deepEqual(result.files.map((f) => f.webkitRelativePath), ['Trip/img2.jpg', 'Trip/img10.jpg', 'Trip/sub/b.jpg']);
  assert.equal(result.skipped, 1); // notes.txt; hidden items are not counted
  assert.equal(result.unreadable, 0);
  // The folder the user chose counts even when its own name starts with a dot.
  assert.equal(pickedFolder([picked('.photos/a.jpg', 'image/jpeg')]).files.length, 1);
  assert.equal(pickedFolder([]), null);
});

test('a dropped folder is read in every batch, not just the first 100 entries', async () => {
  const children = Array.from({ length: 230 }, (_, i) => entry(`p${String(i + 1).padStart(3, '0')}.jpg`, 'image/jpeg'));
  const { transfer } = drop({ entry: folder('Big', children) });
  const { folders } = await collectDrop(transfer);
  assert.equal(folders[0].files.length, 230);
  assert.equal(folders[0].files.at(-1).name, 'p230.jpg');
});

test('nested photos stay with their top-level folder; hidden items are skipped silently, other files counted', async () => {
  const { transfer } = drop(
    { entry: folder('Trip', [
      entry('b.jpg', 'image/jpeg'), entry('.DS_Store'), entry('notes.txt', 'text/plain'),
      folder('.git', [entry('x.jpg', 'image/jpeg')]),
      folder('more', [entry('a.jpg', 'image/jpeg'), entry('clip.mov')], { batch: 1 }),
    ], { batch: 2 }) },
    { file: file('loose.jpg', 'image/jpeg') },
    { file: file('readme.md', 'text/markdown') },
  );
  const { folders, loose } = await collectDrop(transfer);
  assert.equal(folders.length, 1);
  assert.equal(folders[0].name, 'Trip');
  assert.deepEqual(names(folders[0].files), ['b.jpg', 'a.jpg', 'clip.mov']); // b.jpg, more/a.jpg, more/clip.mov
  assert.equal(folders[0].skipped, 1);
  assert.equal(folders[0].unreadable, 0);
  assert.deepEqual(names(loose.files), ['loose.jpg']);
  assert.equal(loose.skipped, 1);
});

test('files and folders that cannot be read count as unreadable; the rest still come through', async () => {
  const { transfer } = drop({ entry: folder('Trip', [
    entry('a.jpg', 'image/jpeg'), entry('moved.jpg', 'image/jpeg', { broken: true }), folder('locked', [], { broken: true }),
  ]) });
  const { folders } = await collectDrop(transfer);
  assert.deepEqual(names(folders[0].files), ['a.jpg']);
  assert.equal(folders[0].unreadable, 2);
});

test('the items are taken while the drop event runs; the browser empties them right after', async () => {
  const { transfer, end } = drop({ entry: folder('Trip', [entry('a.jpg', 'image/jpeg')]) }, { file: file('b.jpg', 'image/jpeg') });
  const pending = collectDrop(transfer);
  end();
  const { folders, loose } = await pending;
  assert.deepEqual(names(folders[0].files), ['a.jpg']);
  assert.deepEqual(names(loose.files), ['b.jpg']);
});

test('without an item list the dropped files are used as they are', async () => {
  const { folders, loose } = await collectDrop({ types: ['Files'], files: [file('a.jpg', 'image/jpeg')] });
  assert.deepEqual(folders, []);
  assert.deepEqual(names(loose.files), ['a.jpg']);
});

test('album names are trimmed and cut to 50 characters, as the server counts them', () => {
  assert.equal(albumTitle('  Summer by the sea  ', 'New album'), 'Summer by the sea');
  assert.equal(albumTitle('海'.repeat(60), 'New album'), '海'.repeat(50));
  assert.equal(albumTitle('📷'.repeat(60), 'New album'), '📷'.repeat(50));
  assert.equal(albumTitle(`${'a'.repeat(49)} b`, 'New album'), 'a'.repeat(49));
  assert.equal(albumTitle('   ', 'New album'), 'New album');
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test src/folder-files.test.js`
Expected: FAIL，`Cannot find module '.../src/folder-files.js'`。

- [ ] **Step 3: 实现**

`src/folder-files.js`：

```js
// Files for an import, gathered from a drop or from <input webkitdirectory> (polish spec §5).
// Inside a chosen folder, names starting with "." are left out without a count; files that are not
// photos or videos are counted as `skipped` for the summary; what cannot be read counts as
// `unreadable`, which the import reports as failed.

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const BY_NAME = /\.(heic|heif|mp4|mov|m4v)$/i;

// The album page's file input accepts the same: image/*,.heic,.heif,video/mp4,…,.mov,.m4v.
export function importable(file) {
  const type = String(file.type ?? '').toLowerCase();
  return type.startsWith('image/') || VIDEO_TYPES.includes(type) || BY_NAME.test(file.name);
}

const hidden = (name) => name.startsWith('.');
const byPath = (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true });

// Sorted by path, so IMG_2 comes before IMG_10, then split into what to import and a count of the rest.
function sortOut(found, unreadable) {
  const files = [];
  let skipped = 0;
  for (const { file } of found.sort(byPath)) {
    if (importable(file)) files.push(file);
    else skipped++;
  }
  return { files, skipped, unreadable };
}

// <input webkitdirectory> picks one folder: every path starts with its name.
export function pickedFolder(list) {
  const found = [];
  let name = '';
  for (const file of list) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    name ||= parts[0];
    const inside = parts.slice(1);
    if (!inside.some(hidden)) found.push({ path: inside.join('/'), file });
  }
  return name ? { name, ...sortOut(found, 0) } : null;
}

const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

// readEntries() hands out at most 100 entries a call in Chromium: read until it returns none.
async function children(folder) {
  const reader = folder.createReader();
  const all = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

// Adds the folder's files, at any depth, to `found`; returns how many could not be read.
async function walk(folder, prefix, found) {
  let list;
  try { list = await children(folder); } catch { return 1; }
  let unreadable = 0;
  for (const entry of list) {
    if (hidden(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) unreadable += await walk(entry, `${path}/`, found);
    else {
      try { found.push({ path, file: await fileOf(entry) }); }
      catch { unreadable++; }
    }
  }
  return unreadable;
}

async function read(taken) {
  const folders = [];
  const loose = [];
  let unreadable = 0;
  for (const { entry, file } of taken) {
    if (entry?.isDirectory) {
      const found = [];
      const failed = await walk(entry, '', found);
      folders.push({ name: entry.name, ...sortOut(found, failed) });
    } else if (file) loose.push({ path: file.name, file });
    else if (entry?.isFile) {
      try {
        const loaded = await fileOf(entry);
        loose.push({ path: loaded.name, file: loaded });
      } catch { unreadable++; }
    } else unreadable++;
  }
  return { folders, loose: sortOut(loose, unreadable) };
}

// A drop: each top-level folder is one group, everything else is `loose`. The browser empties the
// item list once the drop event is over, so every item is taken here, before the first await.
export function collectDrop(transfer) {
  const taken = [];
  const items = transfer.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') taken.push({ entry: item.webkitGetAsEntry?.() ?? null, file: item.getAsFile() });
    }
  } else for (const file of transfer.files ?? []) taken.push({ entry: null, file });
  return read(taken);
}

// Album names follow the server's rule: trimmed, at most 50 characters counted as code points.
export function albumTitle(name, fallback) {
  return [...name.trim()].slice(0, 50).join('').trim() || fallback;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `node --test src/folder-files.test.js && npm test`
Expected：8 个新测试全部通过。`npm test` 无失败，跳过的仍是基线里那 1 个。

- [ ] **Step 5: 提交**

```bash
git add src/folder-files.js src/folder-files.test.js
git commit -m "feat: gather photos and videos from dropped or picked folders"
```

---

### Task 2: 抽出导入队列 `src/import-files.js`

只搬代码，不改相册页的导入行为。现有的上传端到端用例（`video-upload`、`library-switch`、`license-navigation`、`lifecycle`、`collection`、`photo-details`、`video-review-regressions`、`license-ui`、`desktop`、`album-polish`）就是回归测试。

顺带修一个 S2 留下的小问题：
- **问题：** 每加进一张照片，标题下那行就被改写成只有数量（`$('.count').textContent = mediaCountText(...)`），S2 加的日期要等导入全部结束重绘时才回来。
- **改法：** 改为与 `render()` 共用 `countText()`。

**Files:**
- Create: `src/import-files.js`
- Modify: `src/album.js`
- Test: `e2e/album-polish.spec.cjs`

**Interfaces:**
- Consumes: 无（Task 1 不在这里用）。
- Produces:
  - `createImporter(host: Element, { beforeFile?, onPhoto?, onDone? })`，返回 `{ readonly active: boolean, add({ album: string, files: File[] }): void, destroy(): void }`。
  - 进度框：在 `host` 末尾插入 `<div class="upload" role="status" aria-live="polite" hidden>`，结构和类名与原来相同（`.r b`、`.r span`、`.prog i`、`small`）。
  - `beforeFile()`：每个文件上传前调用一次，返回值作为 `before` 传给 `onPhoto`。
  - `onPhoto(photo, { signal, before }) → Promise<string | void>`：返回的字符串作为汇总后面的说明（例如「刷新失败」）；抛出 `AbortError` 时视为页面已关闭。
  - `onDone()`：队列空了以后、写汇总之前调用。

- [ ] **Step 1: 写失败的测试**

在 `e2e/album-polish.spec.cjs` 末尾追加：

```js
test('the album header keeps its capture dates while photos are being added', async () => {
  const fixture = await desktopFixture();
  try {
    const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Dated', 0);
    for (const [i, date] of ['2026:07:02 09:00:00', '2026:07:15 18:00:00'].entries()) {
      const data = await photoBytes({ width: 300 + i, height: 200, exif: { IFD2: { DateTimeOriginal: date } } });
      expect((await page.request.post(`${origin}/api/albums/${album.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data })).ok()).toBe(true);
    }
    await page.goto(`${origin}/#/a/${album.id}`);
    const count = page.locator('.album-page .count');
    await expect(count).toHaveText('2 photos · Jul 2 – 15, 2026');
    // Hold the second upload so the header can be read between the two.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let posts = 0;
    await page.route(new RegExp(`/api/albums/${album.id}/photos\\?`), async (route) => {
      if (route.request().method() === 'POST' && ++posts === 2) await held;
      await route.continue();
    });
    await page.locator('.album-page input[type=file]').setInputFiles([
      { name: 'n0.jpg', mimeType: 'image/jpeg', buffer: await photoBytes({ width: 320, height: 200, exif: null }) },
      { name: 'n1.jpg', mimeType: 'image/jpeg', buffer: await photoBytes({ width: 321, height: 200, exif: null }) },
    ]);
    await expect(page.locator('.tile')).toHaveCount(3);
    await expect(count).toHaveText('3 photos · Jul 2 – 15, 2026');
    release();
    await expect(page.locator('.tile')).toHaveCount(4);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await expect(count).toHaveText('4 photos · Jul 2 – 15, 2026');
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/album-polish.spec.cjs -g "keeps its capture dates"`
Expected: FAIL，`Expected: "3 photos · Jul 2 – 15, 2026"`，`Received: "3 photos"`。

- [ ] **Step 3: 新建 `src/import-files.js`**

```js
import { api } from './api.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';
import { onComputer } from './phone.js';
import { probeVideo } from './video-probe.js';

const SKIP = { duplicate: 'dup', unsupported: 'bad', 'too-large': 'big' };
const FAILURE = { timeout: 'video-timeout', blocked: 'video-blocked', unreadable: 'video-unreadable', network: 'upload-network', 'bad-response': 'upload-bad-response' };
const isVideo = (file) => /\.(mp4|mov|m4v)$/i.test(file.name) || /^(video\/mp4|video\/quicktime|video\/x-m4v)$/i.test(file.type);
const fresh = () => ({ total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });

// The import queue and its progress box, shared by the album page and the album wall (polish spec §5).
// Files go up one at a time (v1 spec §7) and files added during a run join it; html[data-busy] holds
// other changes and quitting until the run ends. beforeFile() runs before each upload and its result
// reaches onPhoto(photo, { signal, before }), which may return a note for the summary; onDone() runs
// once the queue is empty, before the summary.
export function createImporter(host, { beforeFile, onPhoto, onDone } = {}) {
  host.insertAdjacentHTML('beforeend', '<div class="upload" role="status" aria-live="polite" hidden><div class="r"><b></b><span></span></div><div class="prog"><i></i></div><small></small></div>');
  const box = host.lastElementChild;
  const heading = box.querySelector('b');
  const current = box.querySelector('.r span');
  const bar = box.querySelector('.prog i');
  const result = box.querySelector('small');
  const queue = [];
  const tally = fresh();
  let lastFailure = '';
  let active = false;
  let dead = false;
  let controller = null;

  function summary() {
    const skipped = tally.dup + tally.bad + tally.big;
    const why = [tally.dup && t('dup', { n: tally.dup }), tally.bad && t('bad', { n: tally.bad }), tally.big && t('big', { n: tally.big })]
      .filter(Boolean)
      .join(t('sep'));
    return t('imported', { n: tally.done }) + (skipped ? t('skipped', { n: skipped, why }) : '') + (tally.fail ? t('failed-n', { n: tally.fail }) : '') +
      (lastFailure ? ` · ${lastFailure}` : '');
  }

  async function run() {
    active = true;
    document.documentElement.setAttribute('data-busy', '');
    box.hidden = false;
    clearTimeout(box.timer);
    result.textContent = '';
    try {
      while (queue.length && !dead) {
        if (!allowWrite()) { queue.length = 0; break; }
        const { album, file } = queue.shift();
        const i = tally.total - queue.length;
        const before = beforeFile?.();
        controller = new AbortController();
        const { signal } = controller;
        heading.textContent = t('importing', { i, n: tally.total });
        current.textContent = file.name;
        bar.style.width = `${((i - 1) / tally.total) * 100}%`;
        try {
          let res;
          if (isVideo(file)) {
            heading.textContent = `${t('video-preparing')} · ${i}/${tally.total}`;
            const prepared = await probeVideo(file, { signal });
            if (dead || !allowWrite()) { queue.length = 0; break; }
            res = await api.uploadVideo(album, file, prepared, ({ stage, loaded, total }) => {
              if (dead) return;
              heading.textContent = `${t(stage === 'saving' ? 'upload-saving' : onComputer ? 'upload-sending' : 'upload-sending-phone')} · ${i}/${tally.total}`;
              const fraction = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0;
              bar.style.width = `${((i - 1 + fraction) / tally.total) * 100}%`;
            }, { signal });
          } else if (/^video\//i.test(file.type)) res = { skipped: 'unsupported' };
          else res = await api.upload(album, file, { signal });
          if (dead) break;
          if (res.photo) {
            tally.done++;
            const note = await onPhoto?.(res.photo, { signal, before });
            if (dead) break;
            if (note) lastFailure = note;
          } else if (SKIP[res.skipped]) tally[SKIP[res.skipped]]++;
          else throw Object.assign(new Error('Invalid upload response'), { code: 'bad-response' });
        } catch (error) {
          if (dead || error.name === 'AbortError') continue;
          if (SKIP[error.code]) tally[SKIP[error.code]]++;
          else {
            tally.fail++;
            const key = FAILURE[error.code];
            lastFailure = `${file.name.slice(0, 200)}: ${key ? t(key) : error.message}`;
          }
        }
      }
    } finally {
      controller = null;
      active = false;
      document.documentElement.removeAttribute('data-busy');
    }
    if (dead) return;
    await onDone?.();
    // Files added meanwhile started another run; it carries these counts on to its own summary.
    if (dead || active) return;
    const failed = Boolean(lastFailure);
    heading.textContent = t('import-done');
    current.textContent = '';
    bar.style.width = '100%';
    result.textContent = summary();
    Object.assign(tally, fresh());
    lastFailure = '';
    if (!failed) box.timer = setTimeout(() => (box.hidden = true), 4000);
  }

  return {
    get active() { return active; },
    add({ album, files }) {
      const list = [...files];
      for (const file of list) queue.push({ album, file });
      tally.total += list.length;
      if (!active && !dead) void run();
    },
    destroy() {
      dead = true;
      controller?.abort();
      queue.length = 0;
      clearTimeout(box.timer);
    },
  };
}
```

- [ ] **Step 4: 改 `src/album.js` 用它**

按下面逐项替换（左边是现有代码）：

1. 引入：`import { probeVideo } from './video-probe.js';` 换成 `import { createImporter } from './import-files.js';`。
2. 删除顶部的 `const SKIP = { duplicate: 'dup', unsupported: 'bad', 'too-large': 'big' };`。
3. `renderAlbum()` 开头的状态变量删掉这四行：
   ```js
   const queue = [];
   const tally = { total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 };
   let uploading = false;
   let uploadController;
   ```
4. 模板里删除 `<div class="upload" role="status" aria-live="polite" hidden>…</div>` 这一行（进度框改由导入模块插入）。
5. 把
   ```js
   const input = $('input[type=file]');
   const box = $('.upload');
   const density = $('.density input');
   ```
   换成
   ```js
   const input = $('input[type=file]');
   const density = $('.density input');
   const importer = createImporter(main, { beforeFile: () => album, onPhoto: addedPhoto, onDone: load });
   ```
6. `render()` 里的
   ```js
   const dates = formatRange(album.dateRange?.from, album.dateRange?.to, { lang: lang() });
   $('.count').textContent = [mediaCountText(mediaCounts(album.photos)), dates].filter(Boolean).join(' · ');
   ```
   换成 `$('.count').textContent = countText();`，并在 `render()` 前面加：
   ```js
   // The count and the capture dates under the title (polish spec §4.3).
   function countText() {
     const dates = formatRange(album.dateRange?.from, album.dateRange?.to, { lang: lang() });
     return [mediaCountText(mediaCounts(album.photos)), dates].filter(Boolean).join(' · ');
   }
   ```
7. 从 `// Uploads go one at a time (spec §7); files added meanwhile join the same run.` 一直到 `pump()` 函数结束，整段换成下面的代码（`refreshAfterUpload` 原样保留）：
   ```js
   // Files from the file input or a drop join the import queue (import-files.js).
   function enqueue(files) {
     if (!allowWrite()) return;
     if (mutating || (document.documentElement.hasAttribute('data-busy') && !importer.active)) { toast(c('busy')); return; }
     const list = [...files];
     if (!list.length || !album) return;
     importer.add({ album: id, files: list });
   }

   async function refreshAfterUpload(signal) {
     while (alive) {
       const before = album;
       const next = await api.album(id, { signal });
       if (!alive) return;
       if (album !== before) continue;
       if (next?.id !== id || !Array.isArray(next.photos)) throw new Error('Invalid album response');
       album = next;
       render();
       return;
     }
   }

   // A photo has been added: show its tile, or reload when the album changed meanwhile or is sorted
   // or searched. Returns a note for the import summary when that reload fails.
   async function addedPhoto(photo, { signal, before }) {
     if (!alive) return;
     let note;
     if (!album.photos.some((item) => item.id === photo.id)) {
       if (album !== before || (album.sort && album.sort !== 'manual') || query) {
         try { await refreshAfterUpload(signal); }
         catch (error) {
           if (!alive || error.name === 'AbortError') throw error;
           note = t('upload-refresh-failed');
         }
       } else {
         album = { ...album, photos: [...album.photos, photo] };
         if (album.photos.length === 1) render();
         else grid.append(tile(photo, false));
       }
     } else render();
     if (alive) $('.count').textContent = countText();
     return note;
   }
   ```
8. 其余用到 `uploading` 的地方一律改成 `importer.active`：
   - 排序下拉的 `change` 监听（两处）
   - `removeSelected()`（两处）
   - `removeAlbum()`（两处）
   - `transfer()`（三处）
   - `onPointerDown()`
   - 改为手动排序的确认回调
   - `onFocus`
   - `canLeave()`
9. `destroy()` 里的
   ```js
   uploadController?.abort();
   queue.length = 0;
   clearTimeout(box.timer);
   ```
   换成 `importer.destroy();`。

检查：`grep -nE "uploading|uploadController|tally|pump\(|probeVideo|SKIP|box\." src/album.js` 没有输出。

- [ ] **Step 5: 运行，确认通过且没有回归**

Run:
```bash
npm run build && caffeinate -di npx playwright test e2e/album-polish.spec.cjs e2e/video-upload.spec.cjs \
  e2e/library-switch.spec.cjs e2e/license-navigation.spec.cjs e2e/lifecycle.spec.cjs e2e/collection.spec.cjs \
  e2e/photo-details.spec.cjs e2e/video-review-regressions.spec.cjs e2e/license-ui.spec.cjs e2e/desktop.spec.cjs
```
Expected: 全部通过，包括新用例。

- [ ] **Step 6: 提交**

```bash
git add src/import-files.js src/album.js e2e/album-polish.spec.cjs
git commit -m "refactor: move the import queue out of the album page"
```

---

### Task 3: 拖进相册页的文件夹

**Files:**
- Modify: `src/album.js`
- Modify: `src/import-files.js`
- Modify: `src/i18n.js`
- Create: `e2e/drop-helpers.cjs`
- Test: `e2e/welcome-import.spec.cjs`

**Interfaces:**
- Consumes:
  - Task 1 的 `collectDrop(transfer)`
  - Task 2 的 `createImporter(...)`
- Produces:
  - `importer.add({ album, files, notMedia = 0, unreadable = 0 })`
    - `notMedia` 计入「跳过」。
    - `unreadable` 计入失败，汇总后面写「N 个文件无法读取」。
    - `files` 为空、只有计数时也会跑一轮，只为显示汇总。
  - `e2e/drop-helpers.cjs` 导出：
    - `jpeg(width) → Promise<Buffer>`：宽度不同，字节就不同，不会被当成重复。
    - `dropFiles(page, nodes, { target = 'body', batch = 2, drop = true }) → Promise<{ hint: boolean }>`。
      - `nodes` 由两种节点组成：文件夹 `{ name, children }`；文件 `{ name, type, bytes, unreadable }`。
      - `hint` 是事件刚派发完时 `.drop-hint` 是否可见（Task 5 用）。
  - 新文案 key：`not-media`、`skipped-not-media`、`read-failed`、`folder-empty`（参数 `{ names }`）。

- [ ] **Step 1: 写测试辅助 `e2e/drop-helpers.cjs`**

```js
const sharp = require('sharp');

// A small JPEG; a different width gives different bytes, so no two count as duplicates.
const jpeg = (width) => sharp({ create: { width, height: 20, channels: 3, background: '#2f6fa3' } }).jpeg().toBuffer();

const encode = (nodes) => nodes.map((node) => (node.children
  ? { name: node.name, children: encode(node.children) }
  : { name: node.name, type: node.type ?? '', data: (node.bytes ?? Buffer.alloc(0)).toString('base64'), unreadable: Boolean(node.unreadable) }));

// Drops files and folders on the page the way the system file manager does in Chromium: folder
// entries hand out at most `batch` children per readEntries() call (Chromium: 100), and the items stop
// answering once the drop event is over. A DataTransfer built in the page cannot do this:
// webkitGetAsEntry() returns null for its items. With `drop: false` the files only hover.
async function dropFiles(page, nodes, { target = 'body', batch = 2, drop = true } = {}) {
  return page.evaluate(({ nodes, target, batch, drop }) => {
    const toFile = (node) => new File([Uint8Array.from(atob(node.data), (c) => c.charCodeAt(0))], node.name, { type: node.type });
    const later = (fn) => setTimeout(fn);
    const entry = (node) => (node.children ? {
      isFile: false,
      isDirectory: true,
      name: node.name,
      createReader() {
        let at = 0;
        return {
          readEntries(ok) {
            const next = node.children.slice(at, at + batch).map(entry);
            at += next.length;
            later(() => ok(next));
          },
        };
      },
    } : {
      isFile: true,
      isDirectory: false,
      name: node.name,
      file(ok, fail) { later(() => (node.unreadable ? fail(new DOMException('The file was moved', 'NotFoundError')) : ok(toFile(node)))); },
    });
    let live = true;
    const items = nodes.map((node) => ({
      kind: 'file',
      webkitGetAsEntry: () => (live ? entry(node) : null),
      getAsFile: () => (live && !node.children ? toFile(node) : null),
    }));
    const dataTransfer = { types: ['Files'], items, files: nodes.filter((node) => !node.children).map(toFile), dropEffect: 'copy' };
    const el = document.querySelector(target);
    for (const type of drop ? ['dragenter', 'dragover', 'drop'] : ['dragenter', 'dragover']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      el.dispatchEvent(event);
    }
    live = false;
    const hint = document.querySelector('.drop-hint');
    return { hint: Boolean(hint && !hint.hidden) };
  }, { nodes: encode(nodes), target, batch, drop });
}

module.exports = { jpeg, dropFiles };
```

- [ ] **Step 2: 写失败的测试**

在 `e2e/welcome-import.spec.cjs` 顶部加引入：

```js
const { seed } = require('./ui-helpers.cjs');
const { dropFiles, jpeg } = require('./drop-helpers.cjs');
```

末尾追加：

```js
test('a folder dropped on an album adds what is inside at any depth; hidden files are ignored, others counted', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Trip', 0);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.album-page .drop')).toBeVisible();
    await dropFiles(page, [
      { name: 'Day 1', children: [
        { name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(40) },
        { name: '.DS_Store', bytes: Buffer.from('junk') },
        { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') },
        { name: '.thumbnails', children: [{ name: 't.jpg', type: 'image/jpeg', bytes: await jpeg(41) }] },
        { name: 'more', children: [
          { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(42) },
          { name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(43) },
          { name: 'moved.jpg', type: 'image/jpeg', unreadable: true },
        ] },
      ] },
      { name: 'loose.jpg', type: 'image/jpeg', bytes: await jpeg(44) },
    ]);
    await expect(page.locator('.tile')).toHaveCount(4);
    await expect(page.locator('.upload small')).toHaveText("Imported 4 items, skipped 1 file that isn't a photo or video, 1 failed · 1 file could not be read");
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    // A folder with nothing to import says so and adds nothing.
    await dropFiles(page, [{ name: 'Receipts', children: [
      { name: '.DS_Store', bytes: Buffer.from('junk') },
      { name: 'r.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF') },
    ] }]);
    await expect(page.locator('.toast')).toHaveText('"Receipts" has no photos or videos');
    expect((await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).photos).toHaveLength(4);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs -g "dropped on an album"`
Expected: FAIL。现在拖放只读 `e.dataTransfer.files`（只有 `loose.jpg`），所以 `.tile` 是 1 个而不是 4 个。

- [ ] **Step 4: 加文案**

`src/i18n.js` 中文部分，在 `'failed-n'` 一行后加：

```js
    'not-media': ({ n }) => `不是照片或视频 ${n}`,
    'skipped-not-media': ({ n }) => `，跳过 ${n} 个不是照片或视频的文件`,
    'read-failed': ({ n }) => `${n} 个文件无法读取`,
    'folder-empty': ({ names }) => `${names.map((name) => `「${name}」`).join('')}里没有照片或视频`,
```

英文部分，在 `'failed-n'` 一行后加：

```js
    'not-media': ({ n }) => `${n} not photos or videos`,
    'skipped-not-media': ({ n }) => (n === 1 ? ", skipped 1 file that isn't a photo or video" : `, skipped ${n} files that aren't photos or videos`),
    'read-failed': ({ n }) => (n === 1 ? '1 file could not be read' : `${n} files could not be read`),
    'folder-empty': ({ names }) => `${names.map((name) => `"${name}"`).join(', ')} ${names.length === 1 ? 'has' : 'have'} no photos or videos`,
```

- [ ] **Step 5: 导入模块计入「不是照片或视频」和「无法读取」**

`src/import-files.js`：

1. `const fresh = () => ({ total: 0, done: 0, dup: 0, bad: 0, big: 0, fail: 0 });` 换成
   ```js
   const fresh = () => ({ total: 0, done: 0, dup: 0, bad: 0, big: 0, other: 0, unreadable: 0, fail: 0 });
   ```
2. `summary()` 整个换成：
   ```js
   // Files that are not photos or videos never went up; they are counted with the skipped ones.
   function summary() {
     const skipped = tally.dup + tally.bad + tally.big + tally.other;
     const why = [tally.dup && t('dup', { n: tally.dup }), tally.bad && t('bad', { n: tally.bad }), tally.big && t('big', { n: tally.big }),
       tally.other && t('not-media', { n: tally.other })].filter(Boolean).join(t('sep'));
     const skip = !skipped ? '' : skipped === tally.other ? t('skipped-not-media', { n: skipped }) : t('skipped', { n: skipped, why });
     const note = lastFailure || (tally.unreadable ? t('read-failed', { n: tally.unreadable }) : '');
     return t('imported', { n: tally.done }) + skip + (tally.fail ? t('failed-n', { n: tally.fail }) : '') + (note ? ` · ${note}` : '');
   }
   ```
3. `run()` 末尾的 `const failed = Boolean(lastFailure);` 换成 `const failed = Boolean(lastFailure || tally.unreadable);`。
4. `add()` 换成：
   ```js
   // notMedia and unreadable come from collecting a drop or a folder: counted, never uploaded.
   add({ album, files, notMedia = 0, unreadable = 0 }) {
     const list = [...files];
     for (const file of list) queue.push({ album, file });
     tally.total += list.length;
     tally.other += notMedia;
     tally.unreadable += unreadable;
     tally.fail += unreadable;
     if (!active && !dead) void run();
   },
   ```

- [ ] **Step 6: 相册页用 `collectDrop()`**

`src/album.js`：

1. 引入：`import { collectDrop } from './folder-files.js';`
2. `enqueue()` 换成：
   ```js
   // Files from the file input or a drop join the import queue (import-files.js).
   function enqueue(files, { notMedia = 0, unreadable = 0 } = {}) {
     if (!allowWrite()) return;
     if (mutating || (document.documentElement.hasAttribute('data-busy') && !importer.active)) { toast(c('busy')); return; }
     const list = [...files];
     if ((!list.length && !notMedia && !unreadable) || !album) return;
     importer.add({ album: id, files: list, notMedia, unreadable });
   }
   ```
3. `onDrop()` 换成：
   ```js
   // Dropped folders add what is inside them, at any depth, to this album (polish spec §5).
   async function onDrop(e) {
     if (!hasFiles(e) || !album) return;
     e.preventDefault();
     main.classList.remove('dropping');
     if (!allowWrite()) return;
     const { folders, loose } = await collectDrop(e.dataTransfer); // takes the items before it awaits
     if (!alive) return;
     const groups = [loose, ...folders];
     const files = groups.flatMap((group) => group.files);
     const unreadable = groups.reduce((n, group) => n + group.unreadable, 0);
     if (!files.length && !unreadable && folders.length) {
       toast(t('folder-empty', { names: folders.map((group) => group.name) }));
       return;
     }
     enqueue(files, { notMedia: groups.reduce((n, group) => n + group.skipped, 0), unreadable });
   }
   ```

- [ ] **Step 7: 运行，确认通过**

Run: `npm run build && caffeinate -di npx playwright test e2e/welcome-import.spec.cjs e2e/video-upload.spec.cjs e2e/album-polish.spec.cjs`
Expected: 全部通过。

- [ ] **Step 8: 提交**

```bash
git add src/album.js src/import-files.js src/i18n.js e2e/drop-helpers.cjs e2e/welcome-import.spec.cjs
git commit -m "feat: folders dropped on an album add the photos inside"
```

---

### Task 4: 欢迎页「从文件夹导入…」与相册墙的导入

**Files:**
- Modify: `src/wall.js`
- Modify: `src/import-files.js`
- Modify: `src/i18n.js`
- Modify: `src/ui.js`
- Modify: `src/style.css`
- Test: `e2e/welcome-import.spec.cjs`

**Interfaces:**
- Consumes:
  - Task 1 的 `pickedFolder()`、`albumTitle()`
  - Task 2、3 的导入模块
- Produces:
  - `createImporter(host, { finish = 'box' | 'toast', ... })`
    - `'box'`（相册页）：汇总留在进度框里。
    - `'toast'`（相册墙）：关掉进度框，用 toast 显示汇总，5 秒；有失败时 8 秒。
  - `importer.add({ album: string | (() => Promise<string>), label?, files, notMedia?, unreadable? })`
    - `album` 是函数时，轮到这一批才调用（一个文件夹一本相册，空文件夹不建）。
    - 有 `label` 时，标题写「正在导入「label」· 本批第 n/共 m」。
    - 建相册失败时：toast「无法新建相册「名」：原因」；这一批的文件计为失败；继续下一批。
  - 相册墙：`canLeave()` 在导入中返回 `false` 并 toast「请等待当前操作完成。」。
  - 新文案 key：`import-folder`、`importing-into`、`folder-picked-empty`、`album-create-failed`。
  - 新图标：`icon('folder')`。

- [ ] **Step 1: 写失败的测试**

`e2e/welcome-import.spec.cjs` 顶部再加：

```js
const { join } = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
```

末尾追加：

```js
// A folder on disk: { 'a.jpg': Buffer, 'more/b.jpg': Buffer, ... } under fixture.root/name.
async function folderOnDisk(fixture, name, files) {
  const dir = join(fixture.root, name);
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
  return dir;
}

test('Import from folder on the welcome page makes an album named after the folder', async () => {
  const fixture = await desktopFixture();
  try {
    const dir = await folderOnDisk(fixture, 'Summer by the sea', {
      'a.jpg': await jpeg(50), 'more/b.jpg': await jpeg(51), '.thumbnails/t.jpg': await jpeg(52), '.DS_Store': 'junk', 'list.txt': 'notes',
    });
    const { page } = await fixture.launch();
    const button = page.locator('.welcome [data-act=import-folder]');
    await expect(button).toHaveText('Import from folder…');
    const chooser = page.waitForEvent('filechooser');
    await button.click();
    await (await chooser).setFiles(dir);
    await expect(page.locator('.folder h3')).toHaveText('Summer by the sea');
    await expect(page.locator('.folder .n')).toHaveText('2 photos');
    await expect(page.locator('.toast')).toHaveText("Imported 2 items, skipped 1 file that isn't a photo or video");
    await expect(page.locator('.upload')).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
  } finally { await fixture.close(); }
});

test('while a folder imports, the wall stays open, other changes wait and another folder joins the run', async () => {
  const fixture = await desktopFixture();
  try {
    const kyoto = await folderOnDisk(fixture, 'Kyoto', { 'k0.jpg': await jpeg(60), 'k1.jpg': await jpeg(61) });
    const nara = await folderOnDisk(fixture, 'Nara', { 'n0.jpg': await jpeg(62) });
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (route.request().method() === 'POST') { entered(); await held; }
      await route.continue();
    });
    await page.locator('.folder-input').setInputFiles(kyoto);
    await started;
    await expect(page.locator('.upload b')).toHaveText('Importing "Kyoto" · 1/2');
    await page.evaluate(() => { location.hash = '#/trash'; });
    await expect(page.locator('.toast')).toHaveText('Please wait for the current operation to finish.');
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await page.locator('.page > .ph [data-act=new]').click();
    await expect(page.locator('dialog.dlg')).toHaveCount(0);
    await page.locator('.folder-input').setInputFiles(nara);
    release();
    await expect(page.locator('.toast')).toHaveText('Imported 3 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Kyoto', 'Nara']);
    await expect(page.locator('html')).not.toHaveAttribute('data-busy', '');
    await page.evaluate(() => { location.hash = '#/trash'; });
    await expect(page).toHaveURL(`${origin}/#/trash`);
  } finally { await fixture.close(); }
});

test('a read-only license imports no folder', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const dir = await folderOnDisk(fixture, 'Locked', { 'a.jpg': await jpeg(70) });
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.welcome [data-act=import-folder]')).toHaveAttribute('aria-disabled', 'true');
    // As if the license ran out while the folder dialog was open.
    await page.locator('.folder-input').setInputFiles(dir);
    await expect(page.locator('.toast')).toHaveText(/^Read-only mode/);
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
  } finally { await fixture.close(); }
});
```

如果 Electron 下 `page.waitForEvent('filechooser')` 等不到事件（Step 2 会看出来），第一个用例改成以下写法，并在执行账本里记一条：
- 在页面里 `HTMLInputElement.prototype.click` 上记下被点击的 input 的类名，断言点按钮会点到 `.folder-input`。
- 然后直接 `setInputFiles('.folder-input', dir)`。

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs -g "Import from folder|while a folder imports|read-only license"`
Expected: 3 个都 FAIL，找不到 `[data-act=import-folder]` 或 `.folder-input`。

- [ ] **Step 3: 文案、图标、样式**

`src/i18n.js` 中文部分，在 `'folder-empty'` 后加：

```js
    'import-folder': '从文件夹导入…',
    'importing-into': ({ album, i, n }) => `正在导入「${album}」· ${i}/${n}`,
    'folder-picked-empty': '这个文件夹里没有照片或视频',
    'album-create-failed': ({ name, reason }) => `无法新建相册「${name}」：${reason}`,
```

英文部分，在 `'folder-empty'` 后加：

```js
    'import-folder': 'Import from folder…',
    'importing-into': ({ album, i, n }) => `Importing "${album}" · ${i}/${n}`,
    'folder-picked-empty': 'This folder has no photos or videos',
    'album-create-failed': ({ name, reason }) => `Couldn't create "${name}": ${reason}`,
```

`src/ui.js` 图标表，在 `image:` 一行后加：

```js
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
```

`src/style.css` 在 `.welcome-icon svg { … }` 后加：

```css
.welcome-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
```

- [ ] **Step 4: 导入模块支持「按文件夹建相册」和 toast 汇总**

`src/import-files.js`：

1. 引入 `import { toast } from './ui.js';`。
2. 函数签名与注释：
   ```js
   // … finish 'box' leaves the summary in the box (album page); 'toast' closes the box and shows it as a
   // toast (album wall). A batch's album is an id, or an async function that creates the album when the
   // batch's turn comes (one album per folder); its label names the album in the box.
   export function createImporter(host, { finish = 'box', beforeFile, onPhoto, onDone } = {}) {
   ```
3. `run()` 循环开头，把
   ```js
   const { album, file } = queue.shift();
   const i = tally.total - queue.length;
   const before = beforeFile?.();
   controller = new AbortController();
   const { signal } = controller;
   heading.textContent = t('importing', { i, n: tally.total });
   ```
   换成
   ```js
   const { batch, file, n } = queue.shift();
   const i = tally.total - queue.length;
   // A folder's album counts its own files; the album page counts the whole run.
   const at = batch.label ? `${n}/${batch.count}` : `${i}/${tally.total}`;
   if (batch.error) { tally.fail++; continue; }
   if (!batch.id) {
     try { batch.id = await batch.album(); }
     catch (error) {
       if (dead) break;
       // Spec §8: this folder stops, the next one still goes.
       batch.error = t('album-create-failed', { name: batch.label, reason: error.message });
       lastFailure = batch.error;
       toast(batch.error);
       tally.fail++;
       continue;
     }
     if (dead) break;
   }
   const album = batch.id;
   const before = beforeFile?.();
   controller = new AbortController();
   const { signal } = controller;
   heading.textContent = batch.label ? t('importing-into', { album: batch.label, i: n, n: batch.count }) : t('importing', { i, n: tally.total });
   ```
   视频的两处标题里的 `${i}/${tally.total}` 都改成 `${at}`。
4. `run()` 结尾，从 `const failed = …` 到最后，换成：
   ```js
   const failed = Boolean(lastFailure || tally.unreadable);
   const text = summary();
   Object.assign(tally, fresh());
   lastFailure = '';
   if (finish === 'toast') {
     box.hidden = true;
     toast(text, failed ? 8000 : 5000);
     return;
   }
   heading.textContent = t('import-done');
   current.textContent = '';
   bar.style.width = '100%';
   result.textContent = text;
   if (!failed) box.timer = setTimeout(() => (box.hidden = true), 4000);
   ```
5. `add()` 换成：
   ```js
   // notMedia and unreadable come from collecting a drop or a folder: counted, never uploaded.
   add({ album, label = '', files, notMedia = 0, unreadable = 0 }) {
     const list = [...files];
     const batch = { album, id: typeof album === 'string' ? album : null, label, count: list.length, error: '' };
     list.forEach((file, index) => queue.push({ batch, file, n: index + 1 }));
     tally.total += list.length;
     tally.other += notMedia;
     tally.unreadable += unreadable;
     tally.fail += unreadable;
     if (!active && !dead) void run();
   },
   ```

- [ ] **Step 5: 相册墙接上**

`src/wall.js`：

1. 引入：
   ```js
   import { albumTitle, pickedFolder } from './folder-files.js';
   import { createImporter } from './import-files.js';
   ```
2. 欢迎页面板里，把单独的「新建相册」按钮换成按钮行。`</section>` 后加隐藏的文件夹选择框（只在电脑上）：
   ```js
          <div class="welcome-acts">
            <button class="btn pri" type="button" data-write data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
            ${onComputer ? `<button class="btn" type="button" data-write data-act="import-folder">${icon('folder')}<span>${t('import-folder')}</span></button>` : ''}
          </div>
   ```
   ```js
      </section>
      ${onComputer ? '<input class="folder-input" type="file" webkitdirectory hidden>' : ''}
    </main>`;
   ```
3. `const sub = app.querySelector('.sub');` 后加：
   ```js
   const importer = createImporter(app.querySelector('.page'), { finish: 'toast', onDone: load });
   const folderInput = app.querySelector('.folder-input');
   ```
4. `const closeMenu = …` 前加：
   ```js
   // Imports wait for other changes; one already running takes more files (polish spec §5).
   function canImport() {
     if (!allowWrite()) return false;
     if (mutating || (document.documentElement.hasAttribute('data-busy') && !importer.active)) { toast(c('busy')); return false; }
     return true;
   }

   // One album per folder, named after it and created when its turn comes; a folder with nothing to
   // import gets no album.
   function importFolders(groups) {
     const empty = groups.filter((group) => !group.files.length && !group.unreadable);
     if (empty.length) toast(t('folder-empty', { names: empty.map((group) => group.name) }));
     for (const group of groups) {
       if (group.files.length || group.unreadable) importInto(albumTitle(group.name, t('new-album-name')), group);
     }
   }

   function importInto(title, { files, skipped, unreadable }) {
     importer.add({
       album: async () => {
         const created = await api.createAlbum(title);
         void load(); // the new card shows while its photos come in
         return created.id;
       },
       label: title,
       files,
       notMedia: skipped,
       unreadable,
     });
   }
   ```
5. `onClick()` 里，在 `if (['new', 'rename', 'delete'].includes(act) && !allowWrite()) return;` 之前加：
   ```js
   if (act === 'import-folder') {
     if (canImport()) folderInput.click();
     return;
   }
   ```
6. 在 `app.addEventListener('click', onClick);` 前加：
   ```js
   folderInput?.addEventListener('change', () => {
     const group = pickedFolder(folderInput.files);
     folderInput.value = '';
     if (!canImport()) return;
     if (group) importFolders([group]);
     else toast(t('folder-picked-empty'));
   });
   ```
7. 返回值改成：
   ```js
   return {
     // An import keeps the wall open (polish spec §5).
     canLeave() {
       if (!importer.active) return true;
       toast(c('busy'));
       return false;
     },
     destroy() {
       alive = false;
       importer.destroy();
       app.removeEventListener('click', onClick);
       window.removeEventListener('focus', onFocus);
       window.removeEventListener('keydown', onKey);
       window.removeEventListener('folio-library-changed', onFocus);
     },
   };
   ```

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && caffeinate -di npx playwright test e2e/welcome-import.spec.cjs e2e/video-upload.spec.cjs e2e/album-polish.spec.cjs`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add src/wall.js src/import-files.js src/i18n.js src/ui.js src/style.css e2e/welcome-import.spec.cjs
git commit -m "feat: import a folder as a new album from the welcome page"
```

---

### Task 5: 拖进相册墙，以及文档

**Files:**
- Modify: `src/wall.js`
- Modify: `src/style.css`
- Modify: `src/i18n.js`
- Modify: `README.md`
- Test: `e2e/welcome-import.spec.cjs`

**Interfaces:**
- Consumes:
  - Task 1 的 `collectDrop()`
  - Task 4 的 `canImport()`、`importFolders()`、`importInto()`
  - Task 3 的 `dropFiles()`
- Produces:
  - 相册墙上的 `.drop-hint` 整页提示：拖到窗口上方时显示，离开 150ms 后消失。
  - 欢迎页面板里的 `.welcome-drop`、`.welcome-drop-hint`。
  - 新文案 key：`welcome-drop`、`welcome-drop-hint`、`drop-hint`、`loose-new-album`、`nothing-to-import`。

- [ ] **Step 1: 写失败的测试**

`e2e/welcome-import.spec.cjs` 顶部引入（若未引入）：

```js
const { openWall } = require('./ui-helpers.cjs');
const { nativeVideo } = require('../tests/fixtures/video.cjs');
```

末尾追加：

```js
test('folders dropped on the wall become albums one after another; an empty one gets none', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'Existing', 1);
    await openWall(page, origin);
    await expect(page.locator('.folder')).toHaveCount(1);
    // Hovering shows the whole-page hint, which goes once the drag leaves.
    expect((await dropFiles(page, [{ name: 'Summer', children: [] }], { drop: false })).hint).toBe(true);
    await expect(page.locator('.drop-hint')).toBeHidden();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let posts = 0;
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => {
      if (route.request().method() === 'POST' && ++posts === 1) await held;
      await route.continue();
    });
    const long = '海'.repeat(60);
    await dropFiles(page, [
      { name: `  ${long} `, children: [
        { name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(80) },
        { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(81) },
        { name: 'clip.mov', type: 'video/quicktime', bytes: await nativeVideo('h264-aac.mov') },
      ] },
      { name: 'Empty', children: [{ name: '.DS_Store', bytes: Buffer.from('junk') }] },
      { name: '   ', children: [{ name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(82) }] },
    ]);
    await expect(page.locator('.toast')).toHaveText('"Empty" has no photos or videos');
    await expect(page.locator('.upload b')).toHaveText(`Importing "${'海'.repeat(50)}" · 1/3`);
    release();
    await expect(page.locator('.toast')).toHaveText('Imported 4 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Existing', 'New album', '海'.repeat(50)].sort());
    await expect(page.locator('.folder', { hasText: '海'.repeat(50) }).locator('.n')).toHaveText('2 photos · 1 video');
  } finally { await fixture.close(); }
});

test('an album that cannot be created stops only its own folder', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    let refused = false;
    await page.route(`${origin}/api/albums`, async (route) => {
      if (route.request().method() !== 'POST' || refused) return route.continue();
      refused = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Disk full' }) });
    });
    await dropFiles(page, [
      { name: 'First', children: [{ name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(90) }, { name: 'b.jpg', type: 'image/jpeg', bytes: await jpeg(91) }] },
      { name: 'Second', children: [{ name: 'c.jpg', type: 'image/jpeg', bytes: await jpeg(92) }] },
    ]);
    await expect(page.locator('.toast')).toHaveText('Imported 1 item, 2 failed · Couldn\'t create "First": Disk full');
    await expect(page.locator('.folder h3')).toHaveText(['Second']);
  } finally { await fixture.close(); }
});

test('loose photos dropped on the wall get a new album named first; cancelling imports nothing', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.welcome .welcome-drop')).toHaveText('Drop photos or folders here');
    const drop = async () => dropFiles(page, [
      { name: 'x.jpg', type: 'image/jpeg', bytes: await jpeg(100) },
      { name: 'y.jpg', type: 'image/jpeg', bytes: await jpeg(101) },
      { name: 'Folder', children: [{ name: 'z.jpg', type: 'image/jpeg', bytes: await jpeg(102) }] },
    ]);
    const dialog = page.locator('dialog.dlg');
    await drop();
    await expect(dialog.locator('h3')).toHaveText('New album');
    await expect(dialog.locator('.dlg-text')).toHaveText('Put these 2 items in a new album');
    await dialog.locator('[data-act=cancel]').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.welcome')).toBeVisible();
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
    await drop();
    await dialog.locator('input').fill('Beach day');
    await dialog.locator('[value=ok]').click();
    await expect(page.locator('.toast')).toHaveText('Imported 3 items');
    expect((await page.locator('.folder h3').allTextContents()).sort()).toEqual(['Beach day', 'Folder']);
  } finally { await fixture.close(); }
});

test('a read-only license takes no drop on the wall', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await dropFiles(page, [{ name: 'Locked', children: [{ name: 'a.jpg', type: 'image/jpeg', bytes: await jpeg(110) }] }]);
    await expect(page.locator('.toast')).toHaveText(/^Read-only mode/);
    expect(await (await page.request.get(`${origin}/api/albums`)).json()).toEqual([]);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs -g "dropped on the wall|cannot be created|loose photos|takes no drop"`
Expected: 4 个都 FAIL。相册墙还没有拖放处理，`hint` 为 `false`，也找不到 `.welcome-drop`。

- [ ] **Step 3: 文案和样式**

`src/i18n.js` 中文部分，在 `'welcome-lead-phone'` 后加：

```js
    'welcome-drop': '把照片或文件夹拖到这里',
    'welcome-drop-hint': '每个文件夹会变成一本相册，文件夹名就是相册名',
    'drop-hint': '松开即可导入，每个文件夹会变成一本相册',
    'loose-new-album': ({ n }) => `把这 ${n} 项放进一本新相册`,
    'nothing-to-import': '没有可以导入的照片或视频',
```

英文部分，在 `'welcome-lead-phone'` 后加：

```js
    'welcome-drop': 'Drop photos or folders here',
    'welcome-drop-hint': 'Each folder becomes an album, named after the folder',
    'drop-hint': 'Drop to import. Each folder becomes an album.',
    'loose-new-album': ({ n }) => (n === 1 ? 'Put this item in a new album' : `Put these ${n} items in a new album`),
    'nothing-to-import': 'There are no photos or videos to import',
```

`src/style.css` 在 `.welcome-acts { … }` 后加（全局已有 `[hidden] { display: none !important; }`）：

```css
.welcome-drop {
  margin: 0;
  color: var(--ink);
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}

.welcome-drop-hint {
  margin: -10px 0 4px;
  color: var(--ink-2);
  font-size: 14px;
}

/* The whole wall takes a drop (polish spec §5). */
.drop-hint {
  position: fixed;
  inset: 12px;
  z-index: 80;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  pointer-events: none;
}

.drop-hint span {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 600;
}

.drop-hint svg {
  width: 40px;
  height: 40px;
  color: var(--accent);
}
```

- [ ] **Step 4: 相册墙接收拖放**

`src/wall.js`：

1. 引入改为 `import { albumTitle, collectDrop, pickedFolder } from './folder-files.js';`。
2. 欢迎页面板的图标与说明（只在电脑上）：
   ```js
          <span class="welcome-icon">${icon(onComputer ? 'upload' : 'bookOpen')}</span>
          ${onComputer ? `<h3 class="welcome-drop">${t('welcome-drop')}</h3><p class="welcome-drop-hint">${t('welcome-drop-hint')}</p>` : ''}
   ```
3. 文件夹选择框后面加整页提示：
   ```js
      ${onComputer ? `<input class="folder-input" type="file" webkitdirectory hidden><div class="drop-hint" hidden><span>${icon('upload')}<b>${t('drop-hint')}</b></span></div>` : ''}
   ```
4. `folderInput?.addEventListener(…)` 之后加：
   ```js
   // Files dragged in from the computer (polish spec §5): each folder becomes an album, loose photos
   // get one album, named before anything is imported.
   const hint = app.querySelector('.drop-hint');
   const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
   function onDragOver(e) {
     if (!hasFiles(e)) return;
     e.preventDefault();
     if (document.querySelector('dialog[open]')) return;
     hint.hidden = false;
     clearTimeout(hint.timer);
     hint.timer = setTimeout(() => (hint.hidden = true), 150);
   }
   async function onDrop(e) {
     if (!hasFiles(e)) return;
     e.preventDefault();
     clearTimeout(hint.timer);
     hint.hidden = true;
     if (document.querySelector('dialog[open]') || !canImport()) return;
     const { folders, loose } = await collectDrop(e.dataTransfer); // takes the items before it awaits
     if (!alive) return;
     if (loose.files.length || loose.unreadable) {
       const n = loose.files.length + loose.unreadable;
       const title = await dialog({ title: t('new-album'), text: t('loose-new-album', { n }), value: t('new-album-name'), ok: t('create') });
       // Cancelling drops everything, the folders too.
       if (!title || !alive || !canImport()) return;
       importInto(albumTitle(title, t('new-album-name')), loose);
     } else if (!folders.length) {
       toast(t('nothing-to-import'));
       return;
     }
     importFolders(folders);
   }
   if (onComputer) {
     window.addEventListener('dragover', onDragOver);
     window.addEventListener('drop', onDrop);
   }
   ```
5. `destroy()` 里加：
   ```js
       clearTimeout(hint?.timer);
       window.removeEventListener('dragover', onDragOver);
       window.removeEventListener('drop', onDrop);
   ```

- [ ] **Step 5: 运行，确认通过**

Run: `npm run build && caffeinate -di npx playwright test e2e/welcome-import.spec.cjs`
Expected: 全部通过（原有 3 个，加 Task 3、4、5 的 8 个）。

- [ ] **Step 6: README 新增「导入」一节**

在 `## 3D 翻阅` 前插入：

```markdown
## 导入

在电脑上，可以把照片、视频或整个文件夹拖进 Folio：

- 拖到相册墙（没有相册时是欢迎页）：每个文件夹新建一本相册，相册名就是文件夹名（去掉首尾空白，超过 50 字截断）；只拖了零散的照片时，先给新相册起名，取消就什么都不导入。多个文件夹依次导入，右下角显示进度，完成后弹出汇总。导入期间不能离开相册墙。
- 拖到相册页：照片加进当前相册，文件夹里的照片也一样，不新建相册。
- 欢迎页的「从文件夹导入…」一次选一个文件夹。

子文件夹里的照片并入同一本相册。以 `.` 开头的文件和文件夹会被忽略；不是照片或视频的文件跳过，并在汇总里计数；读不出的文件计为失败，不影响其他文件。手机上不提供文件夹导入。
```

- [ ] **Step 7: 提交**

```bash
git add src/wall.js src/style.css src/i18n.js README.md e2e/welcome-import.spec.cjs
git commit -m "feat: drop folders or photos anywhere on the album wall"
```

---

### Task 6: 全量验证、视觉对照与交付

**Files:** 无代码改动（发现问题时回到负责的 Task，按 TDD 修）。

- [ ] **Step 1: 全量测试**

Run: `caffeinate -di bash -o pipefail -c 'npm test && npm run build && npm run test:desktop'`
Expected:
- Node 测试比基线多 8 个，全部通过，跳过的仍是 1 个。
- Electron 端到端比基线多 9 个（Task 2 一个，Task 3 一个，Task 4 三个，Task 5 四个），全部通过。

- [ ] **Step 2: 视觉对照**

真实 GPU 的 Chromium，窗口 1180×800，中文浅色、英文深色各一套。截图与 `c10-after.png` 对照：
- 欢迎页面板：图标、标题、说明、「新建相册」「从文件夹导入…」两个按钮、格式说明。
- 相册墙的整页拖放提示。
- 导入中右下角的进度框。
- 完成后的汇总 toast。

另外：
- 在 390px 宽度下确认欢迎页按钮行能换行、不溢出。
- 确认手机地址（非 localhost）下欢迎页仍是原样，靠代码审查确认，因为端到端测不到。

- [ ] **Step 3: 整分支评审**

- 用 `review-package` 生成评审包（`MERGE_BASE` = `feat/folio-polish-s2` 的末尾提交）。
- 派一个全新的评审代理，把本节 Review Focus 原文和执行账本的 Ruling 行一并交给它。
- Critical 和 Important 级别的问题一轮修完，每个修复都先写出失败的测试；Minor 级别的问题记入账本。

- [ ] **Step 4: 交付**

- 推送 `feat/folio-polish-s3`，开 PR。
  - S2 已合并时，先 rebase 到 `main`，PR 的目标分支是 `main`。
  - S2 未合并时，PR 的目标分支是 `feat/folio-polish-s2`，并在描述里注明叠在 #24 上。
- 盯 CI；失败时按 systematic-debugging 处理。
