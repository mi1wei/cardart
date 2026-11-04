# Folio 打磨 · S1 结构与文字 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开 Folio 直接进相册墙（删除首页；相册库为空时显示欢迎页）；顶栏只留 Logo、「手机访问」和「设置」，外观、语言、许可证收进设置对话框；电脑上「上传」改叫「添加照片」；排序、缩略图大小、3D 与 PDF 的「版式」都写清楚。

**Architecture:**
- **路由：** `src/router.js` 把 `#/`、空地址和未知地址用 `replaceState` 规整为 `#/albums`。首页的模块、素材、样式和文案整块删除。
- **设置：** 新模块 `src/settings.js` 是原生 `<dialog>`，复用原顶栏 `.theme` / `.lang` 分段按钮的样式。它和许可证页共用 `src/license.js` 新导出的 `licenseKind()` / `licenseExpiry()`。
- **返回链接：** 相册页、最近删除页、许可证页的返回链接都由 `src/ui.js` 的 `backLink()` 生成。
- **3D 版式：** 宽屏是分段按钮，窄屏保留下拉框，两者调用同一个 `setPerPage()`。

**Tech Stack:** 原生 JS（ES modules）+ Vite 8、three.js、Electron 45、Playwright 1.64（Electron 端到端）、Node 24 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md`。本计划实现其中的子项目 S1（§3.1–3.5），对应对比稿 `docs/superpowers/mockups/2026-11-03-folio-polish/index.html` 第 1、2、3、8、10 项（第 10 项只做界面，导入在 S3）。

## 开始之前

- 分支：从 `docs/folio-polish-design`（含规格、对比稿和本计划）新建 `feat/folio-polish-s1`。
- 依赖：`npm ci --include=optional`；Node 24 以上。
- 端到端测试运行的是 `dist/`，每次跑 Playwright 前都要先 `npm run build`。
  - 跑单个规格：`npx playwright test e2e/<name>.spec.cjs`。
  - 按测试名过滤：加 `-g "<title>"`。

## Global Constraints

- 不新增 npm 依赖。
- 不改服务端数据格式和接口：`upload` 接口名、`addedAt`、`perPage`（1 / 2 / 3）、`sort` 的取值都不变。
- 本地存储键不变：
  - `theme`：`light` / `dark`；自动 = 不存。
  - `lang`：`zh` / `en`，另有 cookie `folio_lang`。
  - `density`：`s` / `m` / `l`。
  - `album-sort`。
- 文案：
  - 每条新界面文字都要在 `src/i18n.js`（或 `src/collection-text.js`）的 `zh` 和 `en` 里各写一份。
  - App 名称中英文都叫「Folio」；中文引号用「」。
- 「电脑」指在运行 Folio 的电脑上打开（`onComputer`，包括桌面 App 和本机浏览器）；「手机」指局域网扫码访问。
- 导入互斥：
  - 所有写操作沿用 `allowWrite()` 授权检查和 `html[data-busy]` 互斥。
  - 导入进行中不能切换语言，也不能进入许可证页；外观随时可以切换。
- CSP 为 `script-src 'self'`，不能写内联脚本。
- 端到端测试一律通过 `e2e/fixtures.cjs` 启动真实 Electron；fixture 首次启动会把语言设为英文。
- 提交信息用 `feat:` / `fix:` / `test:` / `docs:` 前缀，结尾带一行 `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。

## Review Focus

1. **手机链接带 `?key=…`**（包括 iPhone 主屏幕图标）：把 `#/` 改写成 `#/albums` 时必须保留查询串，否则手机会被拒绝访问。→ Task 1 测试「the app opens on the album wall…」的最后两行。
2. **设置开着时导入结束**（`data-busy` 消失）：「语言」按钮和「管理…」应立即恢复可用，不需要关掉重开。→ Task 3 测试「Manage waits for an import…」。
3. **320px 宽的手机上打开设置**（中英文）：每一行自动换行，对话框和页面都不出现横向滚动。→ Task 3 测试「Settings holds…」的最后一段。
4. **3D 顶栏在最小窗口宽度 720px、英文下**：版式控件和「合上相册」都放得下；点过版式按钮后，← → 仍能翻页。→ Task 5 测试「the 3D book offers…」。
5. **320px 手机、英文下带「Sort」标签的排序胶囊**：标题行换行，不出现横向滚动。→ Task 5 测试「sort pickers say what they sort…」。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/router.js` | 改 | `parse()` 把未知地址归到相册墙；新增 `canonical()`；`emit()` 用 `replaceState` 规整地址 |
| `src/router.test.js` | 建 | 路由单元测试 |
| `package.json` | 改 | `npm test` 加上 `src/*.test.js` |
| `src/main.js` | 改 | 去掉首页；不再调用 `nav.update()` |
| `src/home.js`、`src/assets/home-book.jpg`、`src/assets/home-book.mp4` | 删 | 首页 |
| `src/style.css` | 改 | 删首页样式；新增欢迎页、设置、返回链接、3D 版式的样式；精简顶栏样式 |
| `src/collection.css` | 改 | 排序胶囊里的标签；`.wall-tools` |
| `src/i18n.js` | 改 | 删首页文案；新增欢迎页、设置、「添加照片」、版式的文案 |
| `src/collection-text.js` | 改 | 删首页文案；新增 `sortBy`；「添加时间」；英文单数「1 item」 |
| `src/ui.js` | 改 | 图标增删；新增 `backLink()` |
| `src/nav.js` | 改 | 只留 Logo、「手机访问」、「设置」 |
| `src/settings.js` | 建 | 设置对话框 |
| `src/license.js` | 改 | 导出 `licenseKind()`、`licenseExpiry()`；许可证页加返回链接 |
| `src/wall.js` | 改 | 欢迎页；搜索和排序包进 `.wall-tools`；排序标签 |
| `src/album.js` | 改 | 返回链接、排序标签、滑块图标、手机端的传输文字 |
| `src/trash.js` | 改 | 返回链接 |
| `src/viewer.js` | 改 | 3D 版式：分段按钮 + 窄屏下拉框 |
| `src/pdf-export.js`、`src/pdf-text.js` | 改 | 导出 PDF 的「版式」选项 |
| `server/text.js` | 改 | `sort-invalid` 文案 |
| `licenses/components.json`、`licenses/ASSET_PROVENANCE.txt` | 改 | 去掉首页素材 |
| `scripts/package-smoke.mjs`、`scripts/verify-package.mjs` | 改 | 不再期待首页视频 |
| `e2e/ui-helpers.cjs` | 改 | 新增 `openSettings()`、`setLang()` |
| `e2e/welcome-import.spec.cjs` | 建 | 启动进相册墙；欢迎页（S3 再加导入用例） |
| `e2e/settings.spec.cjs` | 建 | 设置、顶栏、返回链接 |
| `e2e/labels.spec.cjs` | 建 | 「添加照片」文字、排序标签、滑块、3D 和 PDF 的版式 |
| `e2e/album-polish.spec.cjs`、`theme.spec.cjs`、`recovery.spec.cjs`、`license-ui.spec.cjs`、`video-upload.spec.cjs`、`book-pages.spec.cjs`、`collection.spec.cjs` | 改 | 跟随首页删除、设置、文字和版式的变化 |
| `README.md` | 改 | 运行、语言、外观、3D、排序、PDF、图标各节 |

### Task 1: 启动进相册墙，删除首页

**Files:**
- Create: `src/router.test.js`、`e2e/welcome-import.spec.cjs`
- Modify: `src/router.js`、`src/main.js`、`src/nav.js:18-19`、`src/style.css`（`/* Home */` 整节、第 1252 行）、`src/i18n.js`、`src/collection-text.js`、`src/ui.js`、`package.json`、`licenses/ASSET_PROVENANCE.txt:13-27`、`licenses/components.json:31-32`、`scripts/package-smoke.mjs:3,137-141`、`scripts/verify-package.mjs:85-86`、`e2e/album-polish.spec.cjs`、`e2e/video-upload.spec.cjs:62-63`、`README.md:14,52,94`
- Delete: `src/home.js`、`src/assets/home-book.jpg`、`src/assets/home-book.mp4`

**Interfaces:**
- Consumes: 无
- Produces:
  - `parse(hash)` 返回 `{ page: 'album' | 'albums' | 'trash' | 'license', album, three, photo }`，不再返回 `'home'`。
  - `canonical(hash): string`：未知地址返回 `'#/albums'`，其余原样返回。

- [ ] **Step 1: 写路由单元测试**

新建 `src/router.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, parse } from './router.js';

const id = '0f3b6c1e-1d2a-4c55-9a7e-0123456789ab';

test('the old home page, an empty address and unknown addresses open the album wall', () => {
  for (const hash of ['', '#', '#/', '#/home', '#/albums/', '#/a/not-an-album', `#/a/${id}/4d`]) {
    assert.equal(canonical(hash), '#/albums', hash);
    assert.equal(parse(hash).page, 'albums', hash);
  }
});

test('known addresses are left as they are', () => {
  for (const hash of ['#/albums', '#/trash', '#/license', `#/a/${id}`, `#/a/${id}/3d`, `#/a/${id}/p/p001`, `#/a/${id}/3d/p/p012`]) {
    assert.equal(canonical(hash), hash);
  }
  assert.deepEqual(parse(`#/a/${id}/3d/p/p012`), { page: 'album', album: id, three: true, photo: 'p012' });
  assert.deepEqual(parse('#/trash'), { page: 'trash', album: null, three: false, photo: null });
});
```

- [ ] **Step 2: 让 `npm test` 包含前端单元测试**

`package.json` 的 `test` 脚本改为：

```json
    "test": "node --test \"scripts/*.test.js\" \"server/*.test.js\" \"desktop/*.test.cjs\" \"src/*.test.js\"",
```

打包只包含 `desktop/`、`server/` 和 `dist/`（见 `electron-builder.cjs`），`src/*.test.js` 不会进安装包。

- [ ] **Step 3: 写启动的端到端测试**

新建 `e2e/welcome-import.spec.cjs`（S3 会在这里加导入用例）：

```js
const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');

test('the app opens on the album wall, and old or unknown addresses lead there too', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveURL(`${origin}/#/albums`);
    await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    for (const address of ['/#/', '/#/home', '/#/a/not-an-album', '/']) {
      await page.goto(`${origin}${address}`);
      await expect(page).toHaveURL(`${origin}/#/albums`);
      await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');
    }
    // A phone's link carries its key in the query; rewriting the hash must keep it.
    await page.goto(`${origin}/?key=kept#/`);
    await expect(page).toHaveURL(`${origin}/?key=kept#/albums`);
  } finally { await fixture.close(); }
});
```

本机请求不检查 `key`（`server/app.js` 的 `gate()`），所以桌面窗口也能打开带 `?key=` 的地址。

- [ ] **Step 4: 运行，确认失败**

Run: `node --test src/router.test.js`
Expected: FAIL，报 `does not provide an export named 'canonical'`。

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs`
Expected: FAIL，`toHaveURL` 期待 `…/#/albums`，实际是 `…/`。

- [ ] **Step 5: 改路由**

`src/router.js` 整个文件替换为：

```js
// Hash routes (polish spec §3.1): #/albums · #/trash · #/license · #/a/<id> · #/a/<id>/p/<photo> ·
// #/a/<id>/3d · #/a/<id>/3d/p/<photo>. There is no home page: anything else shows the album wall.
let listener = () => {};
let emittedHash;

export function parse(hash) {
  const m = /^#\/a\/([0-9a-f-]{36})(\/3d)?(?:\/p\/(p\d{3,}))?$/.exec(hash);
  if (m) return { page: 'album', album: m[1], three: !!m[2], photo: m[3] ?? null };
  return { page: { '#/trash': 'trash', '#/license': 'license' }[hash] ?? 'albums', album: null, three: false, photo: null };
}

// The address a hash should show: the old home page and unknown addresses become #/albums.
export function canonical(hash) {
  return parse(hash).page === 'albums' ? '#/albums' : hash;
}

const emit = () => {
  // Replaced, not pushed, so Back never returns to an address that only redirects. The URL is
  // relative, so the query stays: a phone's ?key= must survive (spec §12).
  const target = canonical(location.hash);
  if (target !== location.hash) history.replaceState(history.state, '', target);
  const previous = emittedHash ?? location.hash;
  emittedHash = location.hash;
  listener(parse(location.hash), previous);
};

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
  emittedHash = location.hash;
}
```

- [ ] **Step 6: `src/main.js` 去掉首页**

删除这一行：

```js
import { renderHome } from './home.js';
```

把：

```js
    const page = next.album ? renderAlbum(app, next.album) : next.page === 'albums' ? renderWall(app) : next.page === 'trash' ? renderTrash(app) : next.page === 'license' ? renderLicense(app) : renderHome(app);
```

改为：

```js
    const page = next.album ? renderAlbum(app, next.album) : next.page === 'trash' ? renderTrash(app) : next.page === 'license' ? renderLicense(app) : renderWall(app);
```

- [ ] **Step 7: `src/nav.js` 的 Logo 指向相册墙，删掉「首页」标签**

把：

```js
      <a class="logo" href="#/">${brandLogo()}<span>${t('app')}</span></a>
      <a class="nl" href="#/" data-page="home">${t('home')}</a>
```

改为：

```js
      <a class="logo" href="#/albums">${brandLogo()}<span>${t('app')}</span></a>
```

（「相册」「许可证」标签在 Task 3 删除。）

- [ ] **Step 8: 运行单元测试**

Run: `node --test src/router.test.js`
Expected: PASS（2 tests）。

- [ ] **Step 9: 删除首页文件**

```bash
git rm src/home.js src/assets/home-book.jpg src/assets/home-book.mp4
```

- [ ] **Step 10: 删除首页样式**

在 `src/style.css` 里：

- 从注释行 `/* Home */` 开始删除，一直删到注释行 `/* Album page */` 之前。这一整节包括 `.home`、`.hero`、`.eyebrow`、`.h1`、`.lead`、`.ctas`、`.cta`、`.home-book`、`.sec`、`.feats`、`.feat`、`.recent .folders`、`.foot`，以及这一节末尾的 `@media (max-width: 600px)` 块。
- `/* Album page */` 这一行保留。

再把：

```css
:is(.logo, .nl, .lang button, .theme button, .cta, .more):focus-visible {
```

改为：

```css
:is(.logo, .nl, .lang button, .theme button):focus-visible {
```

- [ ] **Step 11: 删除首页文案**

`src/i18n.js` 的 `zh` 和 `en` 里各删除这些键：

- `home`
- `'local-albums'`、`'no-upload'`、`'hero-title'`、`'hero-lead'`（`en` 里占两行）
- `'open-albums'`、`'view-on-phone'`、`'what-it-does'`
- `'f1-title'`、`'f1-text'`、`'f2-title'`、`'f2-text'`、`'f3-title'`、`'f3-text'`、`'f4-title'`、`'f4-text'`
- `recent`、`footer`

**保留 `'all-albums'`**，Task 3 的返回链接要用。

`src/collection-text.js` 的 `en` 和 `zh` 里：

- 删除 `recent: …`（同一行的 `pdf` 和 `photoDates` 保留）。
- 删除 `sortFeature`、`sortFeatureText`、`trashFeature`、`trashFeatureText` 所在的两行。

例如 `en` 里：

```js
    pdf: 'Export PDF', recent: 'Recently updated', photoDates: 'Capture dates',
    sortFeature: 'By capture time', sortFeatureText: 'Find photos by filename or note. Browse in capture, upload or your own order.',
    trashFeature: 'Accidental deletes are recoverable', trashFeatureText: 'Deleted albums and media stay in Recently Deleted for 30 days. Undo right away or restore them later.',
```

改为：

```js
    pdf: 'Export PDF', photoDates: 'Capture dates',
```

`zh` 照此处理。然后核对：

```bash
node --input-type=module -e "
import { TEXT } from './src/i18n.js';
const gone = ['home','local-albums','no-upload','hero-title','hero-lead','open-albums','view-on-phone','what-it-does','f1-title','f1-text','f2-title','f2-text','f3-title','f3-text','f4-title','f4-text','recent','footer'];
for (const l of ['zh', 'en']) {
  const left = gone.filter((k) => k in TEXT[l]);
  if (left.length) throw new Error(l + ' still has ' + left);
  if (!TEXT[l]['all-albums']) throw new Error(l + ' lost all-albums');
}
console.log('ok');"
```

Expected: `ok`

- [ ] **Step 12: 删除只给首页用的图标**

在 `src/ui.js` 的 `PATHS` 里删除 `arrow: …` 和 `layout: …` 两行。`laptop` 许可证页还在用，保留。

- [ ] **Step 13: 许可证清单去掉首页素材**

1. 在 `licenses/ASSET_PROVENANCE.txt` 删除第 13–27 行：从 `The homepage media are byte-identical copies of the repository mockup:` 到 `before approving distribution.`，以及其后的空行。删除后，`This record does not provide a trademark clearance opinion.` 后面空一行就是 `Geist Variable is supplied by …`。
2. 在 `licenses/components.json` 的 `assets` 里，删除 `"file": "src/assets/home-book.jpg"` 和 `"file": "src/assets/home-book.mp4"` 两行。
3. 更新 `ASSET_PROVENANCE.txt` 在清单里的哈希：

```bash
node -e '
const fs = require("fs"), crypto = require("crypto");
const hash = crypto.createHash("sha256").update(fs.readFileSync("licenses/ASSET_PROVENANCE.txt")).digest("hex");
const file = "licenses/components.json";
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/("file": "licenses\/ASSET_PROVENANCE\.txt", "sha256": ")[0-9a-f]{64}/, `$1${hash}`));
console.log(hash);'
```

4. 核对清单里每个文件的哈希：

```bash
node -e '
const fs = require("fs"), crypto = require("crypto");
const m = JSON.parse(fs.readFileSync("licenses/components.json", "utf8"));
for (const e of [...m.documents, ...m.assets]) {
  if (crypto.createHash("sha256").update(fs.readFileSync(e.file)).digest("hex") !== e.sha256) throw new Error("hash mismatch: " + e.file);
}
console.log("ok", m.documents.length + m.assets.length);'
```

Expected: `ok 26`（23 份文档 + 3 个素材）。

- [ ] **Step 14: 打包脚本不再期待首页视频**

`scripts/package-smoke.mjs`：

- 第 3 行的 import 去掉 `readdir`：

```js
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
```

- 删除第 137–141 行：

```js
    const video = (await readdir(join(resources, 'web/assets'))).find((name) => /^home-book-.*\.mp4$/.test(name));
    assert.ok(video, 'Missing bundled homepage video');
    const range = await request(`/assets/${video}`, { headers: { Range: 'bytes=0-31' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 32);
```

前面对相册视频 `albumRange` 的 Range 检查还在，返回值里的 `videoRange: true` 保持不变（`scripts/package-smoke.test.js` 会检查它）。

`scripts/verify-package.mjs` 的 `permittedWeb()` 里，把：

```js
    /^assets\/geist-[A-Za-z0-9_.-]+\.woff2$/.test(file) ||
    /^assets\/home-book-[A-Za-z0-9_-]+\.(jpg|mp4)$/.test(file);
```

改为：

```js
    /^assets\/geist-[A-Za-z0-9_.-]+\.woff2$/.test(file);
```

- [ ] **Step 15: 跟随更新现有的端到端测试**

`e2e/album-polish.spec.cjs`：

1. 测试名 `'cards, breadcrumb, select icon, lightbox brand and home show the polished details'` 改为 `'cards, breadcrumb, select icon and lightbox brand show the polished details'`。
2. 删除这一段及其后的空行：

```js
    await page.goto(`${origin}/#/`);
    await expect(page.locator('.recent')).toBeVisible();
    await expect(page.locator('.recent .folder')).toHaveCount(1);
    await expect(page.locator(`.recent .folder[data-id="${full.id}"]`)).toHaveCount(1);
```

3. 在最后一个测试（`in Chinese the app keeps the name Folio…`）里，把：

```js
    await page.goto(`${origin}/#/`);
    await expect(page).toHaveTitle('Folio');
```

改为：

```js
    await page.goto(`${origin}/#/`);
    await expect(page).toHaveURL(/#\/albums$/);
    await expect(page).toHaveTitle('相册 · Folio');
```

`e2e/video-upload.spec.cjs`：删除第 62–63 行（相册墙副标题第 60 行已经检查过同样的统计）：

```js
    await page.goto(`${origin}/#/`);
    await expect(page.locator('.stats .n')).toContainText('1 张照片 · 1 个视频');
```

- [ ] **Step 16: README**

`README.md`：

- 第 14 行改为：`然后打开 http://localhost:5180 ，直接进入相册墙。`
- 第 52 行末尾的 `相册卡显示已有的拍摄月份范围，首页「最近更新」按内容更新时间排列。` 改为 `相册卡显示已有的拍摄月份范围。`
- 第 94 行的 `页面里的品牌 Logo（顶栏、页脚、照片查看页）` 改为 `页面里的品牌 Logo（顶栏、照片查看页）`。

- [ ] **Step 17: 检查残留**

```bash
grep -rnE "home\.js|home-book|renderHome|'hero-|'f[1-4]-|what-it-does|view-on-phone|open-albums|no-upload|local-albums|data-page=\"home\"|sortFeature|trashFeature|icon\('(arrow|layout)'\)" src scripts e2e licenses README.md; grep -n "首页" README.md
```

Expected: 没有输出。

- [ ] **Step 18: 全部验证**

Run: `npm test`
Expected: 全部通过（原有用例 + `src/router.test.js` 的 2 个）。

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs e2e/album-polish.spec.cjs e2e/video-upload.spec.cjs e2e/desktop.spec.cjs`
Expected: 全部通过。

- [ ] **Step 19: Commit**

```bash
git add -A src/router.js src/router.test.js src/main.js src/nav.js src/style.css src/i18n.js src/collection-text.js src/ui.js package.json licenses/ASSET_PROVENANCE.txt licenses/components.json scripts/package-smoke.mjs scripts/verify-package.mjs e2e/welcome-import.spec.cjs e2e/album-polish.spec.cjs e2e/video-upload.spec.cjs README.md
git commit -m "feat: open Folio on the album wall instead of the home page" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

（`git rm` 已经暂存了删除的三个文件。）

---

### Task 2: 空相册库的欢迎页

**Files:**
- Modify: `src/wall.js`、`src/i18n.js`、`src/collection-text.js:14`、`src/style.css`（`.empty .pocket`）、`src/collection.css`、`e2e/welcome-import.spec.cjs`、`README.md:14`

**Interfaces:**
- Consumes: Task 1 的 `#/albums` 启动路由。
- Produces（S3 的拖放区会接在这里）：
  - 相册墙标记：`<section class="welcome">`、`.welcome-panel`、`.welcome-trash`、`.wall-tools`。
  - i18n 键：`welcome-title`、`welcome-lead`、`welcome-lead-phone`。

- [ ] **Step 1: 写失败的端到端测试**

在 `e2e/welcome-import.spec.cjs` 末尾追加：

```js
test('an empty library shows the welcome page and creates the first album from it', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const welcome = page.locator('.welcome');
    await expect(welcome).toBeVisible();
    await expect(welcome.locator('h2')).toHaveText('Welcome to Folio');
    await expect(welcome.locator('.welcome-lead')).toHaveText('Photos stay on this computer and are never uploaded to the cloud. Start by adding a few.');
    await expect(welcome.locator('.welcome-formats')).toContainText('MP4, MOV and M4V');
    await expect(page.locator('.wall-search')).toBeHidden();
    await expect(page.locator('.wall-sort')).toBeHidden();
    await expect(page.locator('.page > .ph .sub')).toBeHidden();
    await expect(page.locator('.welcome-trash')).toBeHidden();
    await welcome.locator('[data-act=new]').click();
    await page.locator('dialog.dlg input').fill('First album');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page).toHaveURL(/#\/a\/[0-9a-f-]{36}$/);
    await expect(page.locator('.album-page .title')).toHaveText('First album');
    await page.goto(`${new URL(page.url()).origin}/#/albums`);
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(welcome).toBeHidden();
    await expect(page.locator('.wall-search')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the welcome page links to Recently Deleted while it holds something', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Gone' } })).json();
    expect((await page.request.delete(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.locator('.folders .trash-card')).toHaveCount(0);
    const link = page.locator('.welcome-trash');
    await expect(link).toHaveText('Recently Deleted · 1 item · Cleared after 30 days');
    await link.click();
    await expect(page).toHaveURL(/#\/trash$/);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs`
Expected: 新加的 2 个测试 FAIL（找不到 `.welcome`）；Task 1 的测试仍然 PASS。

- [ ] **Step 3: 文案**

`src/i18n.js`：

- `zh` 里删除 `'no-albums': '还没有相册',`，在 `'album-empty': '还没有照片',` 后面加：

```js
    'welcome-title': '欢迎使用 Folio',
    'welcome-lead': '照片只存在这台电脑上，不上传云端。先放一些照片进来吧。',
    'welcome-lead-phone': '新建一本相册，然后从手机添加照片。',
```

- `en` 里删除 `'no-albums': 'No albums yet',`，在 `'album-empty': 'No photos yet',` 后面加：

```js
    'welcome-title': 'Welcome to Folio',
    'welcome-lead': 'Photos stay on this computer and are never uploaded to the cloud. Start by adding a few.',
    'welcome-lead-phone': 'Create an album, then add photos from your phone.',
```

`src/collection-text.js` 的 `en`：欢迎页的链接会显示数量，所以修正单数写法。把：

```js
trashCount: ({ n }) => `${n} items · Cleared after 30 days`,
```

改为：

```js
trashCount: ({ n }) => `${n === 1 ? '1 item' : `${n} items`} · Cleared after 30 days`,
```

- [ ] **Step 4: 相册墙**

`src/wall.js`：

1. import 改动：把 `import { folder, folderClick, pocket } from './folder.js';` 改为 `import { folder, folderClick } from './folder.js';`，并在 `import { t } from './i18n.js';` 后面加 `import { onComputer } from './phone.js';`。

2. 在 `let alive = true;` 后面加一行：

```js
  let loaded = false;
```

3. 把 `<header class="ph">` 里的搜索框和排序：

```js
        <input class="wall-search" type="search" aria-label="${c('searchAlbums')}" placeholder="${c('searchAlbums')}">
        <select class="wall-sort" aria-label="${c('wallSort')}">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select>
```

包进一个容器：

```js
        <span class="wall-tools">
          <input class="wall-search" type="search" aria-label="${c('searchAlbums')}" placeholder="${c('searchAlbums')}">
          <select class="wall-sort" aria-label="${c('wallSort')}">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select>
        </span>
```

4. 把原来的空状态：

```js
      <div class="empty" hidden>
        <div class="pocket">${pocket('', [])}</div>
        <p>${t('no-albums')}</p>
        <button class="btn pri" type="button" data-write data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
      </div>
```

换成欢迎页：

```js
      <section class="welcome" aria-labelledby="welcome-title" hidden>
        <h2 id="welcome-title">${t('welcome-title')}</h2>
        <p class="welcome-lead">${t(onComputer ? 'welcome-lead' : 'welcome-lead-phone')}</p>
        <div class="welcome-panel">
          <span class="welcome-icon">${icon('bookOpen')}</span>
          <button class="btn pri" type="button" data-write data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
          <p class="welcome-formats">${t('formats')}</p>
        </div>
        <a class="welcome-trash" href="#/trash" hidden></a>
      </section>
```

5. `load()` 里把：

```js
      albums = list;
      entries = trash;
      render();
```

改为：

```js
      albums = list;
      entries = trash;
      loaded = true;
      render();
```

6. `render()` 整个函数换成：

```js
  function render() {
    // An empty library gets the welcome page instead of an empty grid (polish spec §3.2).
    const empty = loaded && albums.length === 0;
    if (empty && query) {
      query = '';
      app.querySelector('.wall-search').value = '';
    }
    app.querySelector('.wall-tools').hidden = empty;
    const list = albums.filter((a) => a.title.toLocaleLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      return (sort === 'created' ? b.createdAt : b.updatedAt ?? b.createdAt).localeCompare(sort === 'created' ? a.createdAt : a.updatedAt ?? a.createdAt);
    });
    wall.replaceChildren(...list.map((a) => folder(a, { menu: true })));
    if (entries.length && !empty) {
      const card = document.createElement('a');
      card.className = 'trash-card';
      card.href = '#/trash';
      card.innerHTML = `${icon('trash')}<strong>${c('trash')}</strong><span>${c('trashCount', { n: entries.length })}</span>`;
      wall.append(card);
    }
    app.querySelector('.search-empty').hidden = !query || list.length > 0;
    app.querySelector('.welcome').hidden = !empty;
    const trashLink = app.querySelector('.welcome-trash');
    trashLink.hidden = !entries.length;
    trashLink.textContent = `${c('trash')} · ${c('trashCount', { n: entries.length })}`;
  }
```

`onClick()` 不用改：欢迎页的按钮和顶部按钮都是 `data-act="new"`。

- [ ] **Step 5: 样式**

`src/style.css` 里把：

```css
.empty .pocket {
  width: 240px;
}
```

换成：

```css
/* Welcome: an empty library (polish spec §3.2) */
.welcome {
  max-width: 620px;
  margin: 48px auto 0;
  text-align: center;
}

.welcome h2 {
  margin: 0 0 6px;
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
}

.welcome-lead {
  margin: 0 0 22px;
  color: var(--ink-2);
}

.welcome-panel {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 32px 24px 24px;
  border: 2px dashed var(--dash);
  border-radius: 20px;
  background: var(--soft);
}

.welcome-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--raised);
  box-shadow: var(--card);
  color: var(--accent);
}

.welcome-icon svg {
  width: 26px;
  height: 26px;
}

.welcome-formats {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.welcome-trash {
  display: inline-block;
  margin-top: 18px;
  color: var(--ink-2);
  font-size: 13px;
}

.welcome-trash:hover {
  color: var(--ink);
}
```

`src/collection.css`：在 `.wall-search { width: min(220px, 22vw); }` 前面加一行。这个容器不占布局，手机上搜索框照旧换到下一行：

```css
.wall-tools { display: contents; }
```

- [ ] **Step 6: README**

把 Task 1 改过的第 14 行改为：`然后打开 http://localhost:5180 ，直接进入相册墙；相册库为空时显示欢迎页，可以从这里新建第一本相册。`

- [ ] **Step 7: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/welcome-import.spec.cjs e2e/album-polish.spec.cjs e2e/collection-v2.spec.cjs`
Expected: 全部 PASS。`album-polish` 里「loading shows placeholders…」在加载中不会显示欢迎页；`collection-v2` 的回收站卡片在还有相册时照旧出现。

- [ ] **Step 8: Commit**

```bash
git add src/wall.js src/i18n.js src/collection-text.js src/style.css src/collection.css e2e/welcome-import.spec.cjs README.md
git commit -m "feat: welcome an empty library on the album wall" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: 设置对话框取代顶栏开关；各页返回链接

外观和语言从顶栏移进设置后，现有用例里点 `.nav [data-lang=…]` 的地方都要改用新的辅助函数（Step 13）。只加设置、保留顶栏开关会让 320px 顶栏放不下（`theme.spec` 已有这项检查），所以这一项不再拆分。

**Files:**
- Create: `src/settings.js`、`e2e/settings.spec.cjs`
- Modify: `src/nav.js`、`src/main.js`、`src/license.js`、`src/ui.js`、`src/i18n.js`、`src/album.js:51,219,385`、`src/trash.js:17`、`src/style.css`（顶栏、`.crumb`、`.dlg-acts` 之后）、`e2e/ui-helpers.cjs`、`e2e/album-polish.spec.cjs`、`e2e/theme.spec.cjs`、`e2e/recovery.spec.cjs`、`e2e/license-ui.spec.cjs`、`e2e/video-upload.spec.cjs`、`e2e/book-pages.spec.cjs:155`、`README.md:22,26`

**Interfaces:**
- Consumes：
  - Task 1 的 `#/albums` 路由。
  - `theme.js` 的 `theme()`、`setTheme(mode)`、`themeSupported()`。
  - `i18n.js` 的 `lang()`、`setLang(code)`。
  - `router.js` 的 `open(hash)`。
- Produces：
  - `openSettings({ onLang })`（`src/settings.js`）：打开设置；`onLang()` 在语言切换后调用。S4 会往这里加桌面专属的行。
  - `licenseKind(): string`：`license-state-*` 的后缀（如 `'trial-active'`）。
  - `licenseExpiry(): Date | null`。
  - `backLink(): string`（`src/ui.js`）。
  - 图标 `gear`。
  - e2e 辅助：`openSettings(page)` 返回 `dialog.settings` 的 Locator；`setLang(page, 'zh' | 'en')`。

- [ ] **Step 1: e2e 辅助函数**

`e2e/ui-helpers.cjs` 在 `module.exports` 前面加：

```js
// Appearance and language live in Settings (polish spec §3.3). Returns the open dialog.
async function openSettings(page) {
  await page.locator('.nav [data-act=settings]').click();
  const settings = page.locator('dialog.settings');
  await expect(settings).toBeVisible();
  return settings;
}

async function setLang(page, code) {
  const settings = await openSettings(page);
  await settings.locator(`[data-lang=${code}]`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', code === 'zh' ? 'zh-CN' : 'en');
  await settings.locator('[data-act=done]').click();
  await expect(settings).toHaveCount(0);
}
```

再把导出改为：

```js
module.exports = { seed, seedBook, style, setRange, openSettings, setLang };
```

- [ ] **Step 2: 写失败的端到端测试**

新建 `e2e/settings.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { openSettings, seed } = require('./ui-helpers.cjs');

test('Settings holds appearance, language and the license in one dialog', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    let settings = await openSettings(page);
    await expect(settings.locator('h3')).toHaveText('Settings');
    await expect(settings.locator('[data-theme-mode]')).toHaveText(['Light', 'Dark', 'Auto']);
    await expect(settings.locator('[data-lang]')).toHaveText(['中文', 'English']);
    await expect(settings.locator('[data-lang=en]')).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.locator('.set-license')).toHaveText('Trial active');
    await expect(settings.locator('.set-expiry')).toContainText('Valid until');
    await settings.locator('[data-theme-mode=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings.locator('[data-lang=zh]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(settings.locator('h3')).toHaveText('设置');
    await expect(settings.locator('[data-theme-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page > .ph .t1')).toHaveText('相册');
    await settings.locator('[data-act=done]').click();
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    // A 320px phone: every row wraps inside the dialog, in both languages.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const code of ['zh', 'en']) {
      settings = await openSettings(page);
      await settings.locator(`[data-lang=${code}]`).click();
      expect(await settings.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await settings.locator('[data-act=done]').click();
    }
  } finally { await fixture.close(); }
});

test('Manage waits for an import to finish, then opens the license page', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    const settings = await openSettings(page);
    await expect(settings.locator('[data-lang=zh]')).toBeDisabled();
    await expect(settings.locator('.set-note')).toHaveText('Available after the import finishes');
    await expect(settings.locator('[data-act=license]')).toHaveAttribute('aria-disabled', 'true');
    await settings.locator('[data-act=license]').dispatchEvent('click');
    await expect(page.locator('.toast')).toHaveText('Wait for the current import to finish before managing the license.');
    await expect(page).toHaveURL(/#\/albums$/);
    // The import ends while Settings is still open.
    await page.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    await expect(settings.locator('[data-lang=zh]')).toBeEnabled();
    await expect(settings.locator('.set-note')).toBeHidden();
    await settings.locator('[data-act=license]').click();
    await expect(page).toHaveURL(/#\/license$/);
    await expect(page.locator('dialog.settings')).toHaveCount(0);
    await expect(page.locator('.license-page')).toBeVisible();
  } finally { await fixture.close(); }
});

test('the top bar keeps the logo, phone access and Settings, and every page leads back to the albums', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await expect(page.locator('.nav .logo')).toHaveAttribute('href', '#/albums');
    await expect(page.locator('.nav .nl, .nav .theme, .nav .lang')).toHaveCount(0);
    await expect(page.locator('.nav [data-act=phone]')).toBeVisible();
    await expect(page.locator('.nav [data-act=settings]')).toHaveAccessibleName('Settings');
    const album = await seed(page, origin, 'Way back', 1);
    for (const hash of [`#/a/${album.id}`, '#/trash', '#/license']) {
      await page.goto(`${origin}/${hash}`);
      const back = page.locator('main .back-link');
      await expect(back).toHaveText('All albums');
      await back.click();
      await expect(page).toHaveURL(/#\/albums$/);
    }
  } finally { await fixture.close(); }
});
```

「管理…」在导入中用 `aria-disabled`：键盘和屏幕阅读器仍能聚焦它，点击时会提示原因。Playwright 把 `aria-disabled` 视为不可点，所以测试用 `dispatchEvent('click')`。

- [ ] **Step 3: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/settings.spec.cjs`
Expected: 3 个都 FAIL（找不到 `.nav [data-act=settings]` 和 `main .back-link`）。

- [ ] **Step 4: 文案**

`src/i18n.js`：

- `zh` 里在 `'theme-auto': '自动',` 后面加：

```js
    settings: '设置',
    'settings-done': '完成',
    'lang-busy': '导入完成后可切换',
    'license-open': '管理…',
```

- `en` 里在 `'theme-auto': 'Auto',` 后面加：

```js
    settings: 'Settings',
    'settings-done': 'Done',
    'lang-busy': 'Available after the import finishes',
    'license-open': 'Manage…',
```

- [ ] **Step 5: 图标和返回链接**

`src/ui.js` 的 `PATHS` 里，在 `select: …` 后面加一个原创的齿轮（8 个齿，外圈 8.4、齿根 6.4，中心孔半径 2.6）：

```js
  gear: '<path d="M18.2 10.3L20.3 10.7L20.3 13.3L18.2 13.7L17.5 15.2L18.8 16.9L16.9 18.8L15.2 17.5L13.7 18.2L13.3 20.3L10.7 20.3L10.3 18.2L8.8 17.5L7.1 18.8L5.2 16.9L6.5 15.2L5.8 13.7L3.7 13.3L3.7 10.7L5.8 10.3L6.5 8.8L5.2 7.1L7.1 5.2L8.8 6.5L10.3 5.8L10.7 3.7L13.3 3.7L13.7 5.8L15.2 6.5L16.9 5.2L18.8 7.1L17.5 8.8Z"/><circle cx="12" cy="12" r="2.6"/>',
```

在 `export const icon = …` 定义的后面加：

```js
// The way back to the album wall from the album, Recently Deleted and License pages (polish spec §3.5).
export const backLink = () => `<a class="back-link" href="#/albums">${icon('prev')}<span>${t('all-albums')}</span></a>`;
```

- [ ] **Step 6: 许可证状态供设置共用；许可证页加返回链接**

`src/license.js`：

1. import 改为 `import { backLink, icon, toast } from './ui.js';`。
2. 在 `allowWrite()` 后面加：

```js
// The license-state-* key for the current state; the License page and Settings share it.
export function licenseKind() {
  let kind = state.state;
  if (kind === 'active' && state.expiresAt && Date.parse(state.expiresAt) <= Date.now()) kind = 'expired';
  if (kind === 'expired' && state.plan === 'trial') kind = 'trial-expired';
  if (kind === 'active') kind = !canWrite() ? 'readonly' : state.plan === 'trial' ? 'trial-active' : 'active';
  return kind;
}

export function licenseExpiry() {
  const date = typeof state.expiresAt === 'string' ? new Date(state.expiresAt) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
```

3. 在 `renderLicense()` 的 `update()` 里，把开头四行：

```js
    let kind = state.state;
    if (kind === 'active' && state.expiresAt && Date.parse(state.expiresAt) <= Date.now()) kind = 'expired';
    if (kind === 'expired' && state.plan === 'trial') kind = 'trial-expired';
    if (kind === 'active') kind = !canWrite() ? 'readonly' : state.plan === 'trial' ? 'trial-active' : 'active';
```

换成：

```js
    const kind = licenseKind();
```

再把：

```js
    const expiry = typeof state.expiresAt === 'string' ? new Date(state.expiresAt) : null;
    const validExpiry = expiry && Number.isFinite(expiry.getTime());
```

换成：

```js
    const expiry = licenseExpiry();
    const validExpiry = !!expiry;
```

4. 许可证页的标记 `<main class="page license-page">` 后面紧接着加 `      ${backLink()}`。

- [ ] **Step 7: 设置对话框**

新建 `src/settings.js`：

```js
import { lang, setLang, t } from './i18n.js';
import { licenseExpiry, licenseKind } from './license.js';
import { onComputer } from './phone.js';
import { open } from './router.js';
import { setTheme, theme, themeSupported } from './theme.js';
import { icon, toast } from './ui.js';

const THEMES = [['light', 'sun'], ['dark', 'moon'], ['auto', null]];
const busy = () => document.documentElement.hasAttribute('data-busy');

// Settings (polish spec §3.3): what is set once and then left alone. Appearance and language are kept
// per device; on the computer the license row shows its state and leads to the License page.
export function openSettings({ onLang }) {
  if (document.querySelector('dialog.settings')) return;
  const d = document.createElement('dialog');
  d.className = 'dlg settings';
  d.setAttribute('aria-labelledby', 'settings-title');

  function render() {
    d.innerHTML = `
      <form method="dialog">
        <h3 id="settings-title">${t('settings')}</h3>
        ${themeSupported() ? `
        <div class="set-row"><span class="set-k" id="set-theme">${t('theme')}</span><span class="set-v"></span>
          <span class="theme" role="group" aria-labelledby="set-theme">${THEMES.map(([mode, name]) =>
            `<button type="button" data-theme-mode="${mode}">${name ? icon(name) : ''}<span>${t(`theme-${mode}`)}</span></button>`).join('')}</span></div>` : ''}
        <div class="set-row"><span class="set-k" id="set-lang">${t('language')}</span><span class="set-v"><small class="set-note">${t('lang-busy')}</small></span>
          <span class="lang" role="group" aria-labelledby="set-lang"><button type="button" data-lang="zh" lang="zh-CN">中文</button><button type="button" data-lang="en" lang="en">English</button></span></div>
        ${onComputer ? `
        <div class="set-row"><span class="set-k">${t('license-manage')}</span><span class="set-v"><b class="set-license"></b><small class="set-expiry"></small></span>
          <button class="btn" type="button" data-act="license">${t('license-open')}</button></div>` : ''}
        <div class="dlg-acts"><button class="btn pri" value="done" data-act="done">${t('settings-done')}</button></div>
      </form>`;
    sync();
  }

  function sync() {
    const locked = busy();
    for (const b of d.querySelectorAll('[data-theme-mode]')) b.setAttribute('aria-pressed', String(b.dataset.themeMode === theme()));
    for (const b of d.querySelectorAll('[data-lang]')) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
      b.disabled = locked;
    }
    d.querySelector('.set-note').hidden = !locked;
    const state = d.querySelector('.set-license');
    if (!state) return;
    const kind = licenseKind();
    const expiry = licenseExpiry();
    state.textContent = t(`license-state-${kind}`);
    const label = t(['expired', 'trial-expired'].includes(kind) ? 'license-expired-on' : 'license-expires-on');
    d.querySelector('.set-expiry').textContent = expiry
      ? `${label} ${new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' }).format(expiry)}`
      : '';
    const manage = d.querySelector('[data-act=license]');
    if (locked) manage.setAttribute('aria-disabled', 'true');
    else manage.removeAttribute('aria-disabled');
  }

  d.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-theme-mode]')?.dataset.themeMode;
    if (mode) {
      setTheme(mode);
      sync();
      return;
    }
    const code = e.target.closest('[data-lang]')?.dataset.lang;
    if (code) {
      // While photos import, the page must not be rebuilt: the rest of the queue would be lost (spec §10).
      if (code === lang() || busy()) return;
      setLang(code);
      render();
      onLang();
      d.querySelector(`[data-lang=${code}]`).focus();
      return;
    }
    if (e.target.closest('[data-act=license]')) {
      if (busy()) {
        toast(t('license-wait-upload'));
        return;
      }
      d.close();
      open('#/license');
    }
  });

  // An import can start or end while the dialog is open; the license state can change too.
  const watch = new MutationObserver(sync);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-busy'] });
  window.addEventListener('folio-license-state', sync);
  d.addEventListener('close', () => {
    watch.disconnect();
    window.removeEventListener('folio-license-state', sync);
    d.remove();
  });
  document.body.append(d);
  render();
  d.showModal();
}
```

- [ ] **Step 8: 顶栏**

`src/nav.js` 整个文件替换为：

```js
import { t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { openSettings } from './settings.js';
import { brandLogo, icon } from './ui.js';

// The bar on top of every page (polish spec §3.3): the logo, phone access and Settings.
// `onLang` re-opens the current page in the new language.
export function createNav(onLang) {
  const el = document.createElement('nav');
  el.className = 'nav';

  function render() {
    el.setAttribute('aria-label', t('app'));
    el.innerHTML = `
      <a class="logo" href="#/albums">${brandLogo()}<span>${t('app')}</span></a>
      <span class="sp"></span>
      ${onComputer ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
      <button class="btn only-icon nav-settings" type="button" data-act="settings" aria-haspopup="dialog" aria-label="${t('settings')}" title="${t('settings')}">${icon('gear')}</button>`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=phone]')) openPhoneDialog();
    else if (e.target.closest('[data-act=settings]')) openSettings({ onLang: () => { render(); onLang(); } });
  });
  render();
  return { el };
}
```

`src/main.js`：删除 `show()` 里的这一行（顶栏已经没有标签可高亮）：

```js
  nav.update(next.album || next.page === 'trash' ? 'albums' : next.page);
```

- [ ] **Step 9: 相册页和最近删除页的返回链接**

`src/album.js`：

1. import 改为 `import { backLink, dialog, icon, toast } from './ui.js';`。
2. 把：

```js
      <p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span><b class="crumb-here"></b></p>
```

换成：

```js
      ${backLink()}
```

3. 删除 `render()` 和改名处理里的两行 `$('.crumb-here').textContent = album.title;`（原第 219、385 行）。

`src/trash.js`：

1. import 改为 `import { backLink, dialog, icon, toast } from './ui.js';`。
2. 把：

```js
    <p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span><b>${c('trash')}</b></p>
```

换成：

```js
    ${backLink()}
```

- [ ] **Step 10: 样式**

`src/style.css`：

1. 删除 `.nl {…}`、`.nl:hover {…}`、`.nl[aria-current='page'] {…}` 三个块。
2. 在 `.nav .btn { height: 34px; margin-right: 8px; }` 块后面加：

```css
.nav .nav-settings {
  margin-right: 0;
}
```

3. 删除这个块：

```css
.theme {
  margin-right: 6px;
}
```

4. 焦点选择器 `:is(.logo, .nl, .lang button, .theme button):focus-visible {` 改为 `:is(.logo, .lang button, .theme button):focus-visible {`。
5. 顶栏下面那个 `@media (max-width: 600px) { .nav {…} .logo {…} .nl {…} … }` 整块换成下面这块。原来手机上「只显示当前主题」的规则一并去掉，否则设置里的三个选项会被藏起来：

```css
@media (max-width: 600px) {
  .nav {
    padding-left: max(env(safe-area-inset-left, 0px), 12px);
    padding-right: max(env(safe-area-inset-right, 0px), 10px);
  }

  .logo {
    margin-right: 4px;
  }

  .nav [data-act='phone'] {
    display: none;
  }
}
```

6. 删除注释 `/* The narrowest phones: the wordmark stays for screen readers so the theme and language switches fit. */` 和它下面整个 `@media (max-width: 380px) {…}` 块。顶栏没有开关了，最窄的手机也放得下「Folio」字样。
7. 把 `/* Album page */` 下面的 `.crumb {…}`、`.crumb a {…}`、`.crumb a:hover {…}`、`.crumb-here {…}` 四个块换成：

```css
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0 0 8px -6px;
  padding: 2px 10px 2px 2px;
  border-radius: 999px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 20px;
  text-decoration: none;
}

.back-link:hover {
  background: var(--hover);
  color: var(--ink);
}

.back-link svg {
  width: 16px;
  height: 16px;
}

.back-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

8. 在 `.dlg-acts {…}` 块后面加设置对话框的样式。`.theme` / `.lang` 分段按钮沿用原顶栏的全局样式；`.set-v` 用 0 基准伸缩，窄屏时按钮组自动换到下一行：

```css
/* Settings (polish spec §3.3) */
.settings {
  width: min(520px, calc(100vw - 32px));
}

.set-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 56px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}

.set-k {
  flex: none;
  width: 72px;
  color: var(--ink-2);
  font-size: 13px;
}

.set-v {
  flex: 1 1 0;
  min-width: 0;
}

.set-v b {
  display: block;
  font-weight: 500;
}

.set-v small {
  display: block;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.settings .theme button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.settings :is(.theme, .lang) button:disabled {
  opacity: 0.4;
  cursor: default;
}

.settings .set-row .btn {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
}

.settings .dlg-acts {
  margin-top: 12px;
}
```

- [ ] **Step 11: 运行新测试**

Run: `npm run build && npx playwright test e2e/settings.spec.cjs`
Expected: 3 个都 PASS。

- [ ] **Step 12: 检查残留**

```bash
grep -rnE "crumb|nav\.update|data-page=|t\('home'\)" src; grep -nE "^\.nl|\.nl\b" src/style.css
```

Expected: 没有输出。

- [ ] **Step 13: 迁移现有的端到端测试**

顶栏不再有语言和主题按钮，下面这些用例改用 Step 1 的辅助函数。

`e2e/album-polish.spec.cjs`：

1. 第 4 行改为 `const { seed, setLang, setRange } = require('./ui-helpers.cjs');`。
2. 两处 `await page.locator('.nav [data-lang=zh]').click();` 都改为 `await setLang(page, 'zh');`。
3. 测试名 `'cards, breadcrumb, select icon and lightbox brand show the polished details'` 改为 `'cards, back link, select icon and lightbox brand show the polished details'`。
4. 把 `await expect(page.locator('.crumb .crumb-here')).toHaveText('Full');` 换成：

```js
    await expect(page.locator('.album-page .back-link')).toHaveAttribute('href', '#/albums');
    await expect(page.locator('.album-page .title')).toHaveText('Full');
```

5. 把 `await expect(page.locator('.crumb .crumb-here')).toHaveText('Full renamed');` 换成 `await expect(page.locator('.album-page .title')).toHaveText('Full renamed');`。

`e2e/theme.spec.cjs`：

1. 第 4 行改为 `const { openSettings, seed, setLang, style } = require('./ui-helpers.cjs');`。
2. 测试 `'auto follows the system and a manual choice survives a reload'` 里，`const origin = …` 之后、`} finally { await fixture.close(); }` 之前的内容换成：

```js
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/albums`);
    let settings = await openSettings(page);
    await expect(settings.locator('[data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
    await settings.locator('[data-theme-mode=dark]').click();
    await expect(settings.locator('[data-theme-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    expect(await page.locator('head script[src="/theme-boot.js"]').count()).toBe(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    settings = await openSettings(page);
    await settings.locator('[data-theme-mode=auto]').click();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
```

3. 测试 `'theme can change during an import while the language cannot'` 里，`const origin = …` 之后、`} finally { await fixture.close(); }` 之前的内容换成：

```js
    await page.goto(`${origin}/#/albums`);
    await setLang(page, 'zh');
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    try {
      const settings = await openSettings(page);
      await settings.locator('[data-theme-mode=dark]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(settings.locator('[data-lang=en]')).toBeDisabled();
      await settings.locator('[data-lang=en]').dispatchEvent('click');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    } finally {
      await page.evaluate(() => document.documentElement.removeAttribute('data-busy'));
    }
```

4. 测试 `'without light-dark support the switch is hidden and the page stays light'` 改名为 `'without light-dark support the appearance setting is hidden and the page stays light'`，并把最后一行 `await expect(page.locator('.theme')).toHaveCount(0);` 换成：

```js
    const settings = await openSettings(page);
    await expect(settings.locator('[data-theme-mode]')).toHaveCount(0);
    await expect(settings.locator('[data-lang]')).toHaveCount(2);
```

5. 测试 `'blocked storage falls back to auto and a choice still applies for this visit'` 里，把：

```js
    await expect(page.locator('.theme [data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.theme [data-theme-mode=dark]').click();
```

换成：

```js
    const settings = await openSettings(page);
    await expect(settings.locator('[data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await settings.locator('[data-theme-mode=dark]').click();
```

6. 测试 `'the album top bar with the theme switch fits a 320px phone in both languages'` 改名为 `'the album top bar fits a 320px phone in both languages'`，循环体换成：

```js
      await setLang(page, lang);
      await expect(page.locator('.nav [data-act=settings]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.nav .logo')).toHaveAccessibleName('Folio');
```

`e2e/recovery.spec.cjs`：

1. 在 `const { desktopFixture } = require('./fixtures.cjs');` 后面加 `const { setLang } = require('./ui-helpers.cjs');`。
2. 把：

```js
    await first.page.locator('.nav [data-lang=zh]').click();
    await first.page.locator('.nav [data-lang=en]').click();
```

换成：

```js
    await setLang(first.page, 'zh');
    await setLang(first.page, 'en');
```

3. 把 `await expect(page.locator('.nav [data-page=albums]')).toHaveText('Albums');` 换成 `await expect(page.locator('.page > .ph .t1')).toHaveText('Albums');`（重启后直接落在相册墙）。

`e2e/license-ui.spec.cjs`：

1. 在 `const { desktopFixture } = require('./fixtures.cjs');` 后面加 `const { setLang } = require('./ui-helpers.cjs');`。
2. `licensePage()` 里的 `await page.locator('.lang [data-lang=en]').click();` 改为 `await setLang(page, 'en');`。
3. 循环里的 ``await page.locator(`.lang [data-lang=${lang}]`).click();`` 改为 `await setLang(page, lang);`。

`e2e/video-upload.spec.cjs`：

1. 在 `const { desktopFixture } = require('./fixtures.cjs');` 后面加 `const { openSettings, setLang } = require('./ui-helpers.cjs');`。
2. 原第 57 行 `await page.locator('.nav [data-lang=zh]').click();` 改为 `await setLang(page, 'zh');`。
3. 导入进行中试图切语言的那一行（原第 89 行；Task 1 删了两行，现在约在第 87 行）：

```js
    await page.locator('.nav [data-lang=zh]').dispatchEvent('click');
```

换成：

```js
    const settings = await openSettings(page);
    await settings.locator('[data-lang=zh]').dispatchEvent('click');
    await settings.locator('[data-act=done]').click();
```

（紧接着的 `toHaveAttribute('lang', 'en')` 断言不变。）

`e2e/book-pages.spec.cjs` 第 155 行：3D 视图盖住了顶栏，所以直接写存储，下一行的 `reload()` 会读取它。把：

```js
    await page.locator('.nav [data-lang=en]').evaluate((el) => el.click());
```

换成：

```js
    await page.evaluate(() => localStorage.setItem('lang', 'en'));
```

然后确认没有遗漏：

```bash
grep -nE "\.nav \[data-lang|\.lang \[data-lang|\.theme \[data-theme-mode|data-page=|\.crumb" e2e/*.cjs
```

Expected: 没有输出。

- [ ] **Step 14: README**

`README.md`：

- 第 22 行改为：`第一次打开时跟随浏览器语言：中文系统显示中文，其他显示英文。点顶栏右边的齿轮打开「设置」，在「语言」一行切换，每台设备各自记住。正在准备或导入照片/视频时不能切换语言或相册库，以免丢失导入队列。在电脑上，「设置」里还能看到许可证状态，点「管理…」进入许可证页。`
- 第 26 行改为：`在「设置」的「外观」一行选浅色、深色或自动（跟随系统，默认），每台设备各自记住；导入照片时也能切换。浏览器太旧（iOS 17.4 及以下）时没有这一行，只有浅色。照片带白边（深色下为深灰边）；相册页右侧的滑块调缩略图大小（小 / 中 / 大），手机上固定大小。`

- [ ] **Step 15: 全部验证**

Run: `npm test`
Expected: 全部通过。

Run: `npm run build && npx playwright test e2e/settings.spec.cjs e2e/theme.spec.cjs e2e/album-polish.spec.cjs e2e/recovery.spec.cjs e2e/license-ui.spec.cjs e2e/license-navigation.spec.cjs e2e/video-upload.spec.cjs e2e/book-pages.spec.cjs e2e/desktop.spec.cjs e2e/welcome-import.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 16: Commit**

```bash
git add src/settings.js src/nav.js src/main.js src/license.js src/ui.js src/i18n.js src/album.js src/trash.js src/style.css e2e/ui-helpers.cjs e2e/settings.spec.cjs e2e/album-polish.spec.cjs e2e/theme.spec.cjs e2e/recovery.spec.cjs e2e/license-ui.spec.cjs e2e/video-upload.spec.cjs e2e/book-pages.spec.cjs README.md
git commit -m "feat: move appearance, language and license into Settings" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: 电脑上叫「添加照片」

**Files:**
- Create: `e2e/labels.spec.cjs`
- Modify: `src/i18n.js`、`src/collection-text.js`、`src/album.js`（视频上传进度那一行）、`server/text.js:19,62`、`e2e/video-upload.spec.cjs`（原第 86 行）、`README.md:52`

**Interfaces:**
- Consumes: Task 3 的 e2e 辅助 `setLang(page, code)`。
- Produces: i18n 键 `upload-sending-phone`。`upload`、`upload-sending`、`upload-network`、`upload-photos` 的取值改变，键名不变。

- [ ] **Step 1: 写失败的端到端测试**

新建 `e2e/labels.spec.cjs`（Task 5 会继续往里加）：

```js
const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, seedBook, setLang } = require('./ui-helpers.cjs');

test('on the computer, adding photos is called adding, not uploading', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Words', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('Add photos');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('Date added');
    await setLang(page, 'zh');
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('添加照片');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('添加时间');
    expect(await page.locator('main').innerText()).not.toContain('上传');
  } finally { await fixture.close(); }
});
```

`e2e/video-upload.spec.cjs` 里的 `await expect(page.locator('.upload')).toContainText('Uploading');`（原第 86 行）改为 `await expect(page.locator('.upload')).toContainText('Adding');`。

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/video-upload.spec.cjs -g "adding|response-held"`
Expected: 两个都 FAIL（仍然显示 `Upload` / `Uploading`）。

- [ ] **Step 3: 文案**

`src/i18n.js` 的 `zh`：

| 键 | 现在 | 改为 |
|---|---|---|
| `'upload-photos'` | `'上传照片'` | `'添加照片'` |
| `upload` | `'上传'` | `'添加照片'` |
| `'upload-sending'` | `'上传中'` | `'添加中'` |
| `'upload-network'` | `'上传连接中断，请重试。'` | `'传输中断，请重试。'` |

并在 `'upload-sending'` 后面加：

```js
    'upload-sending-phone': '上传到电脑',
```

`src/i18n.js` 的 `en`：

| 键 | 现在 | 改为 |
|---|---|---|
| `'upload-photos'` | `'Upload photos'` | `'Add photos'` |
| `upload` | `'Upload'` | `'Add photos'` |
| `'upload-sending'` | `'Uploading'` | `'Adding'` |
| `'upload-network'` | `'The upload connection was interrupted. Please try again.'` | `'The transfer was interrupted. Please try again.'` |

并在 `'upload-sending'` 后面加：

```js
    'upload-sending-phone': 'Sending to computer',
```

`src/collection-text.js`：`en` 的 `added: 'Upload time'` 改为 `added: 'Date added'`；`zh` 的 `added: '上传时间'` 改为 `added: '添加时间'`。

`server/text.js`：

- 第 19 行改为 `    'sort-invalid': '排序方式无效，请选择拍摄时间、添加时间或手动排序',`
- 第 62 行改为 `    'sort-invalid': 'Invalid sort. Choose capture time, date added or manual order.',`

- [ ] **Step 4: 手机上仍说「上传到电脑」**

`src/album.js` 的视频上传进度回调里，把：

```js
              box.querySelector('b').textContent = `${t(stage === 'saving' ? 'upload-saving' : 'upload-sending')} · ${i}/${tally.total}`;
```

改为：

```js
              box.querySelector('b').textContent = `${t(stage === 'saving' ? 'upload-saving' : onComputer ? 'upload-sending' : 'upload-sending-phone')} · ${i}/${tally.total}`;
```

（`album.js` 已经从 `./phone.js` 导入 `onComputer`。）

- [ ] **Step 5: README**

第 52 行的 `按拍摄时间、上传时间或手动顺序浏览` 改为 `按拍摄时间、添加时间或手动顺序浏览`。

再确认 README 里剩下的「上传」都是指手机传到电脑：

```bash
grep -n "上传" README.md
```

Expected: 只剩第 3 行开头的「手机扫码也能看、能上传」（指手机传到电脑），不改。

- [ ] **Step 6: 运行，确认通过**

Run: `npm test`
Expected: 全部通过。

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/video-upload.spec.cjs e2e/collection-v2.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/i18n.js src/collection-text.js src/album.js server/text.js e2e/labels.spec.cjs e2e/video-upload.spec.cjs README.md
git commit -m "fix: call adding photos 'Add photos' on the computer" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: 控件写清楚：排序标签、缩略图滑块、3D 与 PDF 的版式

**Files:**
- Modify: `src/ui.js`、`src/collection-text.js`、`src/i18n.js`、`src/wall.js`、`src/album.js:61-62`、`src/collection.css`、`src/style.css`（`.density`、`.ab-select` 之后、3D 焦点选择器）、`src/viewer.js`、`src/pdf-export.js`、`src/pdf-text.js`、`e2e/labels.spec.cjs`、`e2e/collection.spec.cjs:75`、`README.md:30,64`

**Interfaces:**
- Consumes：
  - Task 2 的 `.wall-tools`。
  - Task 4 的 `labels.spec.cjs` 及其 import（`seed`、`seedBook`、`setLang`）。
- Produces：
  - 图标 `gridSmall`、`gridLarge`、`layout1`、`layout2`、`layout3`。
  - `c('sortBy')`。
  - 3D 版式按钮 `.ab-layout [data-per="1|2|3"]`，带 `aria-pressed`。
  - `viewer.js` 内部的 `setPerPage(value: 1 | 2 | 3)`、`syncPerPage()`。

- [ ] **Step 1: 写失败的端到端测试**

在 `e2e/labels.spec.cjs` 末尾追加：

```js
test('sort pickers say what they sort and the thumbnail slider shows its range', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'A rather long album name for a narrow phone', 2);
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.ph .sort-label > span')).toHaveText('Sort');
    await expect(page.locator('.wall-sort')).toHaveAccessibleName(/^Sort/);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.acts .sort-label > span')).toHaveText('Sort');
    await expect(page.locator('.photo-sort')).toHaveAccessibleName(/^Sort/);
    await expect(page.locator('.density svg')).toHaveCount(2);
    await expect(page.locator('.density')).toHaveAttribute('title', 'Thumbnail size');
    // A 320px phone in English: the header rows wrap instead of scrolling sideways.
    await page.setViewportSize({ width: 320, height: 700 });
    for (const hash of ['#/albums', `#/a/${album.id}`]) {
      await page.goto(`${origin}/${hash}`);
      await expect(page.locator('.sort-label').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await fixture.close(); }
});

test('the 3D book offers single, relaxed and compact layouts as one control', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seedBook(page, origin, 'Layouts', 12, 2);
    const perPage = async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).perPage;
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    const layout = page.locator('.ab-layout');
    await expect(layout).toHaveAttribute('aria-label', 'Layout');
    await expect(layout.locator('button')).toHaveText(['Single', 'Relaxed', 'Compact']);
    await expect(layout.locator('[data-per="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ab-select')).toBeHidden();
    await layout.locator('[data-per="3"]').click();
    await expect(layout.locator('[data-per="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(perPage).toBe(3);
    // The layout button keeps focus, yet the arrow keys still turn pages.
    const before = await page.locator('.ab-count').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.ab-count')).not.toHaveText(before);
    // The narrowest desktop window in English: the top bar still fits.
    await page.setViewportSize({ width: 720, height: 600 });
    await expect(page.locator('.ab-bar [data-act=cover]')).toBeVisible();
    expect(await page.evaluate(() => [...document.querySelectorAll('.ab-bar > *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 0.5))).toBe(true);
    // Phones keep a menu that reads "Layout · …".
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(layout).toBeHidden();
    await expect(page.locator('.ab-select > span')).toHaveText('Layout');
    await expect(page.locator('.ab-select select')).toHaveValue('3');
    await page.locator('.ab-select select').selectOption('1');
    await expect.poll(perPage).toBe(1);
  } finally { await fixture.close(); }
});

test('PDF export names the layout the same way as the 3D book', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Print', 2);
    await page.goto(`${origin}/#/a/${album.id}`);
    await page.locator('.album-page [data-act=menu]').click();
    await page.locator('[data-act=pdf]').click();
    const d = page.locator('dialog.pdf-export');
    await expect(d).toBeVisible();
    await expect(d.locator('.pdf-option:has([name=perPage])')).toContainText('Layout');
    await expect(d.locator('[name=perPage] option')).toHaveText(['Single', 'Relaxed', 'Compact']);
    await expect(d.locator('[name=perPage]')).toHaveValue('2');
    await d.locator('[data-act=cancel]').click();
    await expect(d).toHaveCount(0);
  } finally { await fixture.close(); }
});
```

`e2e/collection.spec.cjs` 第 75 行：宽屏上的下拉框已隐藏。把：

```js
    await page.locator('.ab select').selectOption('1');
```

换成：

```js
    await page.locator('.ab-layout [data-per="1"]').click();
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/collection.spec.cjs`
Expected：
- `labels.spec` 新加的 3 个 FAIL（没有 `.sort-label > span` 和 `.ab-layout`，PDF 选项仍是 1 / 2 / 3）。
- `collection.spec` 里改过的那一个 FAIL（找不到 `.ab-layout`）。
- Task 4 的用例仍然 PASS。

- [ ] **Step 3: 图标**

`src/ui.js` 的 `PATHS` 里，在 `gear: …` 后面加：

```js
  gridSmall: '<path d="M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z"/>',
  gridLarge: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.2"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.2"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.2"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.2"/>',
  layout1: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="8" y="8.5" width="8" height="7" rx="1" fill="currentColor" stroke="none"/>',
  layout2: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="6.8" y="8.5" width="4.6" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="12.6" y="8.5" width="4.6" height="7" rx="1" fill="currentColor" stroke="none"/>',
  layout3: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="6.8" y="8.5" width="5" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="8.5" width="4.2" height="3" rx=".8" fill="currentColor" stroke="none"/><rect x="13" y="12.5" width="4.2" height="3" rx=".8" fill="currentColor" stroke="none"/>',
```

- [ ] **Step 4: 文案**

`src/collection-text.js`：

- `en`：`noResults: 'No matching items', wallSort: 'Sort albums', photoSort: 'Sort photos',` 改为 `noResults: 'No matching items', sortBy: 'Sort',`
- `zh`：`noResults: '没有匹配的内容', wallSort: '相册排序', photoSort: '照片排序',` 改为 `noResults: '没有匹配的内容', sortBy: '排序',`

`src/i18n.js`：

- `zh`：`'per-page': '每页',` 改为 `'per-page': '版式',`；`'per-1': '每页 1 张',` 改为 `'per-1': '单张',`。
- `en`：`'per-page': 'Per page',` 改为 `'per-page': 'Layout',`；`'per-1': '1 per page',` 改为 `'per-1': 'Single',`。

`'per-2'`（宽松 / Relaxed）和 `'per-3'`（紧凑 / Compact）不变。

- [ ] **Step 5: 排序标签与滑块图标**

`src/wall.js`（在 Task 2 加的 `.wall-tools` 里）把：

```js
          <select class="wall-sort" aria-label="${c('wallSort')}">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select>
```

换成：

```js
          <label class="sort-label"><span>${c('sortBy')}</span><select class="wall-sort">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select></label>
```

`src/album.js` 第 61–62 行：

```js
        <label class="sort-label"><span class="sr-only">${c('photoSort')}</span><select class="photo-sort" data-write>${['taken', 'added', 'manual'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select></label>
        <label class="density" title="${t('density')}"><input type="range" min="0" max="2" step="1" aria-label="${t('density')}"></label>
```

换成：

```js
        <label class="sort-label"><span>${c('sortBy')}</span><select class="photo-sort" data-write>${['taken', 'added', 'manual'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select></label>
        <label class="density" title="${t('density')}">${icon('gridSmall')}<input type="range" min="0" max="2" step="1" aria-label="${t('density')}">${icon('gridLarge')}</label>
```

`src/collection.css`：

1. 共用的输入框样式只留三个选择器（排序的下拉框改由标签胶囊提供边框）。把：

```css
.wall-search,
.album-search,
.wall-sort,
.photo-sort,
.transfer-mode {
```

改为：

```css
.wall-search,
.album-search,
.transfer-mode {
```

2. 把 `.sort-label { display: inline-flex; }` 这一行换成：

```css
/* Sort pickers carry a visible label (polish spec §3.5): "Sort  Manual ▾" in one pill. */
.sort-label {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 36px;
  padding-left: 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--raised);
  color: var(--ink-3);
  font-size: 13px;
  white-space: nowrap;
}
.sort-label select {
  min-width: 0;
  height: 34px;
  padding: 0 12px 0 6px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.sort-label select:focus { outline: none; }
.sort-label:has(select:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
```

3. 焦点选择器 `:is(.wall-search, .album-search, .wall-sort, .photo-sort, .album-target, .trash-card, .trash-preview, .undo-toast button):focus-visible {` 改为 `:is(.wall-search, .album-search, .album-target, .trash-card, .trash-preview, .undo-toast button):focus-visible {`。
4. 删除文件开头的 `.sr-only {…}` 块。它原本只用于相册页隐藏的排序标签，改完后没有地方再用：

```bash
grep -rn "sr-only" src
```

Expected: 没有输出。

（手机上的 `.wall-sort { max-width: 124px; }` 和 `.photo-sort { max-width: 120px; }` 保留，现在作用于胶囊里的下拉框。）

`src/style.css` 的 `.density` 块改为：

```css
.density {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: var(--ink-3);
}

.density svg {
  flex: none;
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 6: 3D 版式控件**

`src/viewer.js`：

1. 顶栏标记里，把：

```js
      <label class="ab-select"><span>${t('per-page')}</span><select data-write>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
```

换成下面两行：宽屏用分段按钮，手机用原来的下拉框，靠 CSS 二选一显示。

```js
      <span class="ab-layout" role="group" aria-label="${t('per-page')}"><span class="ab-layout-k" aria-hidden="true">${t('per-page')}</span>${DENSITY.map((v) => `<button type="button" data-write data-per="${v}" aria-pressed="false">${icon(`layout${v}`)}<span>${t(`per-${v}`)}</span></button>`).join('')}</span>
      <label class="ab-select"><span>${t('per-page')}</span><select data-write>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
```

2. `build()` 里的 `per.value = String(album.perPage ?? 2);` 换成 `syncPerPage();`。

3. 在 `build()` 函数后面加：

```js
  // One layout, two controls (polish spec §3.5): segmented buttons on wide screens, the menu on phones.
  function syncPerPage() {
    const value = String(album.perPage ?? 2);
    per.value = value;
    for (const button of root.querySelectorAll('[data-per]')) button.setAttribute('aria-pressed', String(button.dataset.per === value));
  }

  function setPerPage(value) {
    if (value === (album.perPage ?? 2)) return;
    if (!allowWrite()) { syncPerPage(); return; }
    const i = shownPhoto();
    const title = onTitlePage();
    album = { ...album, perPage: value };
    build(i, title);
    onPerPage(album.perPage);
  }
```

4. `onClick()` 开头两行：

```js
    const target = e.target.closest('[data-act], [data-speed]');
    if (!target) return;
    const act = target.dataset.act;
    if (target.dataset.speed) player.setSpeed(target.dataset.speed);
```

改为：

```js
    const target = e.target.closest('[data-act], [data-speed], [data-per]');
    if (!target) return;
    const act = target.dataset.act;
    if (target.dataset.per) setPerPage(Number(target.dataset.per));
    else if (target.dataset.speed) player.setSpeed(target.dataset.speed);
```

5. 下拉框的监听：

```js
  per.addEventListener('change', () => {
    if (!allowWrite()) { per.value = String(album.perPage); return; }
    const i = shownPhoto();
    const title = onTitlePage();
    album = { ...album, perPage: Number(per.value) };
    build(i, title);
    per.blur(); // ← → turn pages again
    onPerPage(album.perPage);
  });
```

整个换成：

```js
  per.addEventListener('change', () => {
    setPerPage(Number(per.value));
    per.blur(); // ← → turn pages again
  });
```

焦点停在版式按钮上时，`onKey()` 只对 `select, input` 让路，所以 ← → 照样翻页，不需要额外处理。

`src/style.css`：

1. 在 `.ab-select select {…}` 块后面、`.ab-slider {` 前面加：

```css
/* Layout: a segmented control on wide screens; phones keep the menu above (polish spec §3.5). */
.ab-layout {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 3px;
  border-radius: 999px;
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--line);
  pointer-events: auto;
}

.ab-layout-k {
  padding: 0 6px 0 9px;
  color: var(--ink-3);
  font-size: 13px;
  white-space: nowrap;
}

.ab-layout button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px 0 9px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--ink-2);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.ab-layout button svg {
  width: 18px;
  height: 18px;
}

.ab-layout button:hover {
  background: var(--hover);
}

.ab-layout button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}

@media (min-width: 601px) {
  .ab-select {
    display: none;
  }
}

@media (max-width: 900px) {
  .ab-layout-k {
    display: none;
  }
}

@media (max-width: 600px) {
  .ab-layout {
    display: none;
  }
}
```

2. 焦点选择器 `:is(.ab-icon, .ab-primary, .ab-secondary, .ab-back, .ab-play, .ab-speed button):focus-visible {` 改为 `:is(.ab-icon, .ab-primary, .ab-secondary, .ab-back, .ab-play, .ab-speed button, .ab-layout button):focus-visible {`。

- [ ] **Step 7: 导出 PDF 的版式**

`src/pdf-export.js`：

1. 第 1 行改为 `import { lang, t } from './i18n.js';`。
2. 把：

```js
        <label class="pdf-option">${text('perPage')}<select name="perPage"><option>1</option><option>2</option><option>3</option></select><small>${text('same')}</small></label>
```

换成（取值仍是 1 / 2 / 3，`normalizePdfOptions()` 不用改）：

```js
        <label class="pdf-option">${t('per-page')}<select name="perPage">${[1, 2, 3].map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select><small>${text('same')}</small></label>
```

`src/pdf-text.js`：删掉两种语言里的 `perPage` 键。

- `en`：`perPage: 'Photos per page', same: 'Defaults to your 3D setting', quality: 'Quality',` 改为 `same: 'Defaults to your 3D setting', quality: 'Quality',`
- `zh`：`perPage: '每页照片', same: '默认同 3D 设置', quality: '画质',` 改为 `same: '默认同 3D 设置', quality: '画质',`

- [ ] **Step 8: README**

- 第 30 行（「3D 翻阅」第一段）末尾加：`顶栏的「版式」可选单张、宽松或紧凑，保存在相册内；手机上在下拉菜单里选。`
- 第 64 行的 `每页 1 / 2 / 3 张` 改为 `版式（单张 / 宽松 / 紧凑）`。

- [ ] **Step 9: 运行，确认通过**

Run: `npm test`
Expected: 全部通过。

Run: `npm run build && npx playwright test e2e/labels.spec.cjs e2e/collection.spec.cjs e2e/collection-v2.spec.cjs e2e/pdf-export.spec.cjs e2e/album-polish.spec.cjs e2e/book-pages.spec.cjs e2e/book-portrait.spec.cjs e2e/theme.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 10: 检查残留**

```bash
grep -rnE "wallSort|photoSort|text\('perPage'\)|每页 1 张|1 per page" src e2e README.md
```

Expected: 没有输出。

- [ ] **Step 11: Commit**

```bash
git add src/ui.js src/collection-text.js src/i18n.js src/wall.js src/album.js src/collection.css src/style.css src/viewer.js src/pdf-export.js src/pdf-text.js e2e/labels.spec.cjs e2e/collection.spec.cjs README.md
git commit -m "feat: label sort, thumbnail size and layout controls" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: 全量验证，与对比稿对照

**Files:**
- 无代码改动。发现问题时回到对应的 Task 修复，并在那个 Task 的测试里补上用例。

- [ ] **Step 1: Node 测试**

Run: `npm test`
Expected: 全部通过，包括 `src/router.test.js` 的 2 个。只有原来那 1 个需要真实安装包的用例会跳过。

- [ ] **Step 2: 生产构建**

Run: `npm run build`
Expected: 构建成功；`dist/assets/` 里没有 `home-book-*`：

```bash
ls dist/assets | grep -c home-book
```

Expected: `0`

- [ ] **Step 3: Electron 端到端全量**

Run: `npm run test:desktop`
Expected: 全部通过。macOS 上只有原来那 1 个非 macOS 用例跳过。

- [ ] **Step 4: 与对比稿对照**

用一个临时相册库启动，在浏览器里逐项对照 `docs/superpowers/mockups/2026-11-03-folio-polish/img/` 中的「after」截图：

```bash
ALBUM_LIBRARY="$(mktemp -d)" PORT=5181 npm start
```

打开 http://localhost:5181 ，确认：

- 空库直接进相册墙，显示欢迎页，搜索和排序隐藏。对照 `c10-after.png`；这一版还没有拖放区和「从文件夹导入…」，S3 再加。
- 顶栏只有 Logo、「手机访问」和齿轮；设置对话框有外观、语言、许可证三行。对照 `c2-after-nav.png`、`c2-after-settings.png`；桌面专属的「相册库」「版本」两行在 S4 加。
- 新建相册后，按钮是「添加照片」，左上是「‹ 全部相册」，排序胶囊读作「排序 手动」，滑块两端有大小格子图标。对照 `c3-after-album.png`、`c8-after-album.png`。
- 3D 顶栏是「版式：单张 / 宽松 / 紧凑」。对照 `c8-after-3d.png`。
- 外观切到深色、语言切到 English，重复以上检查。

看完按 Ctrl+C 停掉服务，删除临时相册库目录。

- [ ] **Step 5: 交付**

把分支 `feat/folio-polish-s1` 推送并开 PR 之前，先问用户：是否推送、合并方式、是否与 `docs/folio-polish-design` 一起合并。

---

## Self-Review（写计划时已做）

**规格覆盖：**

| 规格条目 | 对应 Task |
|---|---|
| §3.1 启动进相册墙、删除首页、素材与许可证清单、Logo 链接 | Task 1 |
| §3.2 欢迎页（标题、说明、面板、格式说明、最近删除链接、手机文案） | Task 2 |
| §3.3 顶栏与设置（外观、语言及导入中禁用、许可证行、完成和 Esc、手机只有两行、许可证页与最近删除页的返回链接） | Task 3 |
| §3.4 文字表（按钮、`upload-photos`、电脑和手机的进度文字、连接中断、排序选项、服务端 `sort-invalid`） | Task 4 |
| §3.5 返回链接、排序标签、滑块图标与提示、3D 分段按钮和窄屏下拉、PDF 版式、`perPage` 存储不变 | Task 3、Task 5 |
| §10 README 与 `licenses/` | 各 Task 的 README 步骤、Task 1 Step 13 |
| §9 新增 `settings.spec.cjs`、`welcome-import.spec.cjs`，更新现有规格 | Task 1–5 |

「相册库」「版本」两行（§6.4）属于 S4，不在本计划内。

**占位扫描：** 没有 TBD、TODO、「类似 Task N」；每个代码步骤都给出了代码。

**名称一致：**
- `canonical` / `parse`（Task 1）。
- `openSettings({ onLang })`（`src/settings.js`）与 e2e 辅助 `openSettings(page)`：分属页面和测试两边，各自只在本侧使用。
- `licenseKind` / `licenseExpiry`、`backLink`、`setPerPage` / `syncPerPage`、`c('sortBy')`。
- i18n 键 `welcome-*`、`settings`、`settings-done`、`lang-busy`、`license-open`、`upload-sending-phone`。
- 后面的 Task 引用的名称都与定义处一致。

**Review Focus：** 5 条都已在对应 Task 的测试里写出断言。

