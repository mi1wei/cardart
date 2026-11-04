# Folio 打磨 · S2 3D 与看大图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日期在相册卡、相册页、3D 扉页、PDF 封面和详情面板里写法一致（同时修复 PDF 封面印出 ISO 时间）；3D 封面标题改为深色压印字；3D 与 PDF 的小字加大并改为正体；看大图顶栏去掉品牌字，「查看原图」改为「下载原图」，「⋯」菜单可设为相册封面、复制或移动到其他相册。

**Architecture:**
- **日期：** 新模块 `shared/dates.js` 提供 `formatRange()`、`formatDateTime()`、`formatInstant()` 三个纯函数，可在 Node 里测试。所有显示日期的地方都改用它，删除 `collection-text.js` 的 `dateRange()`。
- **3D 与 PDF：** `binder.js` 的封面标题贴图改为深色字加下方浅色高光，材质不透明；`textures.js`、`title-page.js`、`print-layout.css` 改字号和字形。
- **看大图：** `lightbox.js` 顶栏只留「详情 · 下载原图 · 删除 · ⋯」。「⋯」菜单复用批量操作的 `chooseAlbum()`（返回值加上相册名）和 `api.transferPhotos()`。

**Tech Stack:** 原生 JS（ES modules）+ Vite 8、three.js、Electron 45、Playwright 1.64（Electron 端到端）、Node 24 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md` §4（S2），以及 §8 错误处理、§9 测试、§10 文档。对应对比稿第 4、5、6、7 项：`docs/superpowers/mockups/2026-11-03-folio-polish/img/` 下的 `c4-after.png`、`c5-after*.png`、`c6-after*.png`、`c7-after.png`。

## 开始之前

- 分支：从最新的 `main`（已含 S1，即 PR #23）新建 `feat/folio-polish-s2`，在 `.worktrees/folio-polish-s2` 里工作。
- 依赖：`npm ci --include=optional`，再用 `npx --no-install electron --version` 解出 Electron。
- 端到端测试运行的是 `dist/`：每次跑 Playwright 前先 `npm run build`。
  - 跑单个规格：`npx playwright test e2e/<name>.spec.cjs`；按测试名过滤加 `-g "<title>"`。
- 本机长时间的验证用 `caffeinate -di` 包住，避免系统休眠打断 Electron。

## Global Constraints

- 不新增 npm 依赖。
- 不改服务端数据格式和接口。以下都按现状使用：
  - `dateRange`：`{ from, to }`，本地时间字符串。
  - `metadata.takenAt.local`。
  - `metadata.fileModifiedAt`：UTC ISO。
  - `POST /api/albums/:id/photos/transfer`。
- 日期：
  - 输入是本地时间字符串（`YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`），照原样写，不做时区换算。
  - 只有文件修改时间（UTC 存储）换算成本机时间，并带上时区名。
  - 写法按 spec §4.3 的表：中文自己拼（如 `2026年7月12日–15日`）。英文用 `Intl.DateTimeFormat('en', { month: 'short' })` 的 `formatRange`，并把 Intl 输出的细空格（U+2009、U+202F）换成普通空格，与界面其他文字一致。
- 文案：
  - 新文字在 `src/i18n.js` 的 `zh` 和 `en` 里各写一份。
  - 中文引号用「」；英文里提到相册名用直双引号，与现有的 `delete-album-text` 一致。
- 所有写操作沿用 `allowWrite()` 和 `html[data-busy]` 互斥。「最近删除」里的只读看大图不变。
- CSP 为 `script-src 'self'`，不能写内联脚本。
- 端到端测试一律启动真实 Electron：用 `e2e/fixtures.cjs`，或规格文件自带的 fixture。
- 提交信息用 `feat:` / `fix:` / `test:` / `docs:` 前缀，结尾带一行 `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。

## Review Focus

1. **320px 手机上的相册卡，长标题且有拍摄日期**：照片数完整显示；日期跟在数量后面，放不下时用省略号截断，不挤掉数量和标题。→ Task 2 的 collection-v2 测试。
2. **没有拍摄时间，或日期无效**（没有 EXIF、`dateRange` 为 null、`2026-02-30` 这类不存在的日期）：相册卡、相册页、扉页、PDF 封面都不显示日期，不出现 `Invalid Date`、`NaN` 或原始 ISO 文字。→ Task 1、Task 2 的 Node 测试。
3. **文件修改时间**（UTC 存储）按本机时间加时区名显示，跨日也正确；拍摄时间照原样显示，不换算。→ Task 1 的 `formatInstant` 测试、Task 2 的详情测试。
4. **在 3D 书上打开的看大图里，把相册最后一项移走**：看大图和 3D 书都关闭，相册页显示空相册，不弹错误。→ Task 6 测试。
5. **导入进行中，或许可证只读时，用「⋯」复制或移动**：拒绝（提示稍候，或按钮不可用），不弹相册选择框，不发请求。→ Task 6 测试。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `shared/dates.js` | 建 | 日期写法：日期范围、日期时间、带时区的时刻 |
| `shared/dates.test.js` | 建 | 日期写法单元测试 |
| `package.json` | 改 | `npm test` 加上 `shared/*.test.js` |
| `src/collection-text.js` | 改 | 删除 `dateRange()` |
| `src/folder.js` | 改 | 相册卡：拍摄月份跟在照片数后面 |
| `src/style.css` | 改 | 相册卡 meta 行的日期样式和窄卡换行 |
| `src/collection.css` | 改 | 删除旧的 `.folder-dates` 独立一行样式 |
| `src/album.js` | 改 | 相册页标题下的日期 |
| `src/book/title-page.js` | 改 | 扉页日期写法；小字 5.2mm |
| `src/print-layout.js` | 改 | PDF 封面日期；`buildPrintModel()` 加 `language` 参数 |
| `src/print-layout.test.js` | 建 | PDF 封面日期的 Node 测试 |
| `src/pdf-export.js`、`src/print-entry.js` | 改 | 把界面语言传给 `buildPrintModel()` |
| `src/photo-details.js` | 改 | 拍摄时间、文件修改时间的写法 |
| `src/book/textures.js` | 改 | 3D 图注 5mm 正体，图注留白 7.4mm |
| `src/print-layout.css` | 改 | PDF 图注 3mm 正体 |
| `src/book/binder.js` | 改 | 封面标题深色压印、不透明 |
| `src/lightbox.js` | 改 | 顶栏、「⋯」菜单、复制和移动 |
| `src/photo-view.css` | 改 | 顶栏与菜单样式 |
| `src/i18n.js` | 改 | 下载原图、相册封面、复制、移动的文案 |
| `src/ui.js` | 改 | 新增 `image` 图标 |
| `src/collection-actions.js` | 改 | `chooseAlbum()` 返回值加上目标相册名 |
| `e2e/collection-v2.spec.cjs`、`book-pages.spec.cjs`、`photo-details.spec.cjs`、`pdf-export.spec.cjs`、`lightbox-v2.spec.cjs`、`album-polish.spec.cjs`、`book-portrait.spec.cjs` | 改 | 跟随新写法和新顶栏，并加新用例 |
| `README.md` | 改 | 排序与搜索（相册卡日期）、看大图 |
| `docs/superpowers/specs/2026-11-02-folio-v2-design.md` | 改 | 注明「看大图品牌字」已被替代 |

---

### Task 1: 日期写法模块 `shared/dates.js`

**Files:**
- Create: `shared/dates.js`
- Create: `shared/dates.test.js`
- Modify: `package.json`（`test` 脚本）

**Interfaces:**
- Produces（后面的 Task 都用这三个函数，输入无效时都返回 `''`）：
  - `formatRange(from, to = from, { lang = 'en', month = false } = {}) → string`
  - `formatDateTime(local, { lang = 'en' } = {}) → string`
  - `formatInstant(iso, { lang = 'en', timeZone } = {}) → string`。`timeZone` 省略时用本机时区。

- [ ] **Step 1: 写失败的测试**

新建 `shared/dates.test.js`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateTime, formatInstant, formatRange } from './dates.js';

test('a day range is spelled out in Chinese and uses Intl in English (polish spec §4.3)', () => {
  const cases = [
    ['2026-07-12', '2026-07-12', '2026年7月12日', 'Jul 12, 2026'],
    ['2026-07-12T19:02:11', '2026-07-15T08:00:00', '2026年7月12日–15日', 'Jul 12 – 15, 2026'],
    ['2026-07-30', '2026-08-02', '2026年7月30日–8月2日', 'Jul 30 – Aug 2, 2026'],
    ['2025-12-30', '2026-01-02', '2025年12月30日–2026年1月2日', 'Dec 30, 2025 – Jan 2, 2026'],
  ];
  for (const [from, to, zh, en] of cases) {
    assert.equal(formatRange(from, to, { lang: 'zh' }), zh);
    assert.equal(formatRange(from, to, { lang: 'en' }), en);
  }
});

test('album cards write the range to the month', () => {
  const month = true;
  assert.equal(formatRange('2026-07-02T09:00:00', '2026-07-15T18:00:00', { lang: 'zh', month }), '2026年7月');
  assert.equal(formatRange('2026-07-02T09:00:00', '2026-07-15T18:00:00', { lang: 'en', month }), 'Jul 2026');
  assert.equal(formatRange('2026-07-03', '2026-09-20', { lang: 'zh', month }), '2026年7月–9月');
  assert.equal(formatRange('2026-07-03', '2026-09-20', { lang: 'en', month }), 'Jul – Sep 2026');
  assert.equal(formatRange('2025-11-03', '2026-01-20', { lang: 'zh', month }), '2025年11月–2026年1月');
  assert.equal(formatRange('2025-11-03', '2026-01-20', { lang: 'en', month }), 'Nov 2025 – Jan 2026');
});

test('one date, a reversed range and invalid dates', () => {
  assert.equal(formatRange('2026-07-12', undefined, { lang: 'en' }), 'Jul 12, 2026');
  assert.equal(formatRange('2026-07-15', '2026-07-12', { lang: 'zh' }), '2026年7月12日–15日');
  for (const [from, to] of [[null, null], [undefined, undefined], ['2026-02-30', '2026-03-01'], ['July', '2026-07-01'], ['2026-07-01', null]]) {
    assert.equal(formatRange(from, to, { lang: 'en' }), '');
    assert.equal(formatRange(from, to, { lang: 'zh' }), '');
  }
});

test('a capture time is written as recorded, never shifted', () => {
  assert.equal(formatDateTime('2026-07-12T19:02:11', { lang: 'zh' }), '2026年7月12日 19:02:11');
  assert.equal(formatDateTime('2026-07-12T19:02:11', { lang: 'en' }), 'Jul 12, 2026, 19:02:11');
  assert.equal(formatDateTime('2026-07-12', { lang: 'en' }), 'Jul 12, 2026');
  assert.equal(formatDateTime('2026-13-01T00:00:00', { lang: 'en' }), '');
});

test('a moment stored in UTC is written in local time with its zone', () => {
  assert.equal(formatInstant('2026-07-12T10:02:11.000Z', { lang: 'zh', timeZone: 'Asia/Tokyo' }), '2026年7月12日 19:02:11 GMT+9');
  assert.equal(formatInstant('2026-07-12T10:02:11.000Z', { lang: 'en', timeZone: 'Asia/Tokyo' }), 'Jul 12, 2026, 19:02:11 GMT+9');
  // Five in the morning UTC is still the previous evening in New York.
  assert.equal(formatInstant('2026-01-01T04:59:59Z', { lang: 'en', timeZone: 'America/New_York' }), 'Dec 31, 2025, 23:59:59 EST');
  assert.equal(formatInstant('2026-07-12T19:02:11Z', { lang: 'en', timeZone: 'UTC' }), 'Jul 12, 2026, 19:02:11 UTC');
  for (const value of ['soon', null, 42]) assert.equal(formatInstant(value, { lang: 'en', timeZone: 'UTC' }), '');
});
```

`package.json` 的 `test` 脚本末尾加上 `"shared/*.test.js"`：

```json
    "test": "node --test \"scripts/*.test.js\" \"server/*.test.js\" \"desktop/*.test.cjs\" \"src/*.test.js\" \"shared/*.test.js\"",
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test`
Expected: FAIL，`shared/dates.test.js` 报 `ERR_MODULE_NOT_FOUND`（还没有 `shared/dates.js`）；其余测试通过。

- [ ] **Step 3: 实现**

新建 `shared/dates.js`：

```js
// One way to write dates everywhere (polish spec §4.3). Inputs are local wall-clock strings
// (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss): they are written as recorded, never moved to another zone.
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/;

function parse(value) {
  const match = typeof value === 'string' ? LOCAL.exec(value) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d, date, time: match[4] ?? '' };
}

// Intl puts thin spaces around the range dash; the rest of the interface uses plain spaces.
const plain = (text) => text.replace(/[\u2009\u202f]/g, ' ');

function english(a, b, month) {
  const format = new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short', ...(month ? {} : { day: 'numeric' }) });
  return plain(b ? format.formatRange(a.date, b.date) : format.format(a.date));
}

// zh-CN Intl ranges read "2026/7/12 – 2026/7/15", so Chinese is spelled out by hand.
function chinese(a, b, month) {
  const day = (p) => (month ? '' : `${p.d}日`);
  const full = (p) => `${p.y}年${p.m}月${day(p)}`;
  if (!b) return full(a);
  if (a.y !== b.y) return `${full(a)}–${full(b)}`;
  if (a.m !== b.m) return `${full(a)}–${b.m}月${day(b)}`;
  return `${full(a)}–${day(b)}`;
}

export function formatRange(from, to = from, { lang = 'en', month = false } = {}) {
  let [a, b] = [parse(from), parse(to)];
  if (!a || !b) return '';
  if (b.date < a.date) [a, b] = [b, a];
  const same = month ? a.y === b.y && a.m === b.m : a.date.getTime() === b.date.getTime();
  return lang === 'zh' ? chinese(a, same ? null : b, month) : english(a, same ? null : b, month);
}

export function formatDateTime(local, { lang = 'en' } = {}) {
  const value = parse(local);
  if (!value) return '';
  const date = formatRange(local, local, { lang });
  if (!value.time) return date;
  return lang === 'zh' ? `${date} ${value.time}` : `${date}, ${value.time}`;
}

// A moment stored in UTC (a file's modification time): written in local time with the zone's name.
export function formatInstant(iso, { lang = 'en', timeZone } = {}) {
  const moment = typeof iso === 'string' ? new Date(iso) : null;
  if (!moment || !Number.isFinite(moment.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(moment).map(({ type, value }) => [type, value]));
  const written = formatDateTime(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`, { lang });
  if (!written) return '';
  const zone = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { timeZone, timeZoneName: 'short' })
    .formatToParts(moment).find(({ type }) => type === 'timeZoneName')?.value;
  return zone ? `${written} ${zone}` : written;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test`
Expected: 全部通过（原有 246 个通过、1 个跳过，加上新增的 5 个）。

- [ ] **Step 5: Commit**

```bash
git add shared/dates.js shared/dates.test.js package.json
git commit -m "feat: write dates one way in both languages" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: 所有日期改用 `shared/dates.js`

**Files:**
- Create: `src/print-layout.test.js`
- Modify:
  - `src/print-layout.js`；`src/pdf-export.js` 的两处 `buildPrintModel(album, options())`；`src/print-entry.js` 的 `buildPrintModel(album, config.options)`
  - `src/collection-text.js`（删除 `dateRange`）
  - `src/folder.js`、`src/style.css`（`.folder .n` 之后和窄卡容器查询）、`src/collection.css`（第 46 行 `.folder-dates`）
  - `src/album.js`（第 5、9 行的 import，`render()` 里的 `.count`）
  - `src/book/title-page.js`（`titlePageText()`）
  - `src/photo-details.js`（`capture()`、`fields()`、`modified`）
  - `README.md`（「排序与搜索」一节）
- Test: `e2e/collection-v2.spec.cjs`（「capture date ranges appear…」）、`e2e/book-pages.spec.cjs`（「the title page names the album…」）、`e2e/photo-details.spec.cjs`（两处 `taken-at`）、`e2e/pdf-export.spec.cjs`（新用例）

**Interfaces:**
- Consumes：Task 1 的 `formatRange`、`formatInstant`。
- Produces：`buildPrintModel(album, options = {}, language = 'en')`，`language` 为 `'zh'` 或 `'en'`。相册卡上的日期是 `.meta` 行里紧跟 `.n` 的 `<span class="folder-dates">`。

- [ ] **Step 1: 写失败的 Node 测试**

新建 `src/print-layout.test.js`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrintModel } from './print-layout.js';

const album = { id: 'a', title: 'Summer', photos: [], dateRange: { from: '2026-07-12T19:02:11', to: '2026-07-15T08:00:00' } };
const photo = (local) => ({ id: local ?? 'none', w: 3, h: 2, metadata: { takenAt: local ? { local } : null } });

test('the PDF cover writes its date range like the rest of the app, not as ISO timestamps', () => {
  assert.equal(buildPrintModel(album, {}, 'en').dateRange, 'Jul 12 – 15, 2026');
  assert.equal(buildPrintModel(album, {}, 'zh').dateRange, '2026年7月12日–15日');
});

test('without a stored range the cover uses the capture days, and nothing when there are none', () => {
  assert.equal(buildPrintModel({ ...album, dateRange: null, photos: [photo('2026-07-02T09:00:00'), photo(null)] }, {}, 'en').dateRange, 'Jul 2, 2026');
  assert.equal(buildPrintModel({ ...album, dateRange: null, photos: [photo(null)] }, {}, 'zh').dateRange, '');
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test src/print-layout.test.js`
Expected: 两个都 FAIL。第一个得到 `'2026-07-12T19:02:11 – 2026-07-15T08:00:00'`，第二个得到 `'2026-07-02'`。

- [ ] **Step 3: PDF 封面日期**

`src/print-layout.js`：

1. 第 1 行后加：

```js
import { formatRange } from '../shared/dates.js';
```

2. `export function buildPrintModel(album, options = {}) {` 改为：

```js
export function buildPrintModel(album, options = {}, language = 'en') {
```

3. 把：

```js
  const dates = photos.map((photo) => photo.metadata?.takenAt?.local?.slice(0, 10)).filter(Boolean).sort();
```

改为（`formatRange(day)` 只用来跳过读不出的拍摄时间）：

```js
  const dates = photos.map((photo) => photo.metadata?.takenAt?.local).filter((day) => formatRange(day)).sort();
```

4. 把：

```js
    dateRange: range ? range.from === range.to ? range.from : `${range.from} – ${range.to}` : '',
```

改为：

```js
    dateRange: formatRange(range?.from, range?.to, { lang: language }),
```

`src/pdf-export.js` 里两处 `buildPrintModel(album, options())` 都改为 `buildPrintModel(album, options(), language)`。`language` 已在该函数开头定义为 `lang()`。

`src/print-entry.js` 的：

```js
    const model = buildPrintModel(album, config.options);
```

改为：

```js
    const model = buildPrintModel(album, config.options, language);
```

- [ ] **Step 4: 运行，确认通过**

Run: `node --test src/print-layout.test.js`
Expected: 2 个都 PASS。

- [ ] **Step 5: 写失败的端到端测试**

`e2e/collection-v2.spec.cjs`，「capture date ranges appear on the album and card, and phone long-press opens selection」。把：

```js
    await openWall(page, origin);
    await expect(page.locator('.folder-dates')).toHaveText('2026.07');
    expect(await page.locator('.pocket img').first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('4px');
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.album-page .count')).toContainText('2026.07.02 – 2026.07.15');
```

换成：

```js
    await openWall(page, origin);
    await expect(page.locator('.folder .n')).toHaveText('2 photos');
    await expect(page.locator('.folder .folder-dates')).toHaveText('Jul 2026');
    expect(await page.locator('.pocket img').first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('4px');
    // A phone card with a long title: the count stays whole and the dates give way first.
    expect((await page.request.patch(`${origin}/api/albums/${a.id}`, { data: { title: 'A rather long album name for a narrow phone' } })).ok()).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload();
    const card = await page.locator('.folder').first().evaluate((el) => {
      const box = (selector) => el.querySelector(selector).getBoundingClientRect();
      const count = el.querySelector('.n');
      const title = el.querySelector('h3');
      return {
        countWhole: count.scrollWidth <= count.clientWidth,
        title: title.clientWidth, titleFull: title.scrollWidth, meta: el.querySelector('.meta').clientWidth,
        sameLine: Math.abs(box('.folder-dates').top - box('.n').top),
        inside: box('.folder-dates').right <= box('.meta').right + 0.5,
        ellipsis: getComputedStyle(el.querySelector('.folder-dates')).textOverflow,
      };
    });
    expect(card.countWhole).toBe(true);
    expect(card.title).toBeGreaterThanOrEqual(Math.min(card.titleFull, card.meta * 0.6));
    expect(card.sameLine).toBeLessThan(2);
    expect(card.inside).toBe(true);
    expect(card.ellipsis).toBe('ellipsis');
    await page.goto(`${origin}/#/a/${a.id}`);
    await expect(page.locator('.album-page .count')).toContainText('Jul 2 – 15, 2026');
```

`e2e/book-pages.spec.cjs`，「the title page names the album with its date range and count, inside the cover」。把：

```js
    await expect(page.locator('.ab')).toHaveAccessibleDescription(/^July 2\D+15, 2026 · 3 photos$/);
```

改为：

```js
    await expect(page.locator('.ab')).toHaveAccessibleDescription('Jul 2 – 15, 2026 · 3 photos');
```

`e2e/photo-details.spec.cjs`：

- 「photo Details shows original dimensions…」里，`toHaveText('2026-08-15 09:30:00.125 +09:00')` 改为 `toHaveText('Aug 15, 2026 09:30:00.125 +09:00')`。
- 「read-only legacy Details…in Chinese」里，`toHaveText('2026-08-15 00:30:00（时区未记录）')` 改为 `toHaveText('2026年8月15日 00:30:00（时区未记录）')`。
- 同一用例中，在 `await expect(panel.locator('[data-field=file-modified-label]')).toHaveText('本地文件修改时间');` 后面加：

```js
    // Stored in UTC, shown in this computer's time with the zone (polish spec §4.3).
    await expect(panel.locator('[data-field=file-modified]')).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}:\d{2} \S+/);
```

`e2e/pdf-export.spec.cjs`：

1. 文件开头的 require 后面加：

```js
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
```

2. 在文件末尾追加：

```js
test('the PDF cover writes the capture dates the way the rest of the app does', async () => {
  const f = await fixture();
  try {
    const album = await seed(f.page, f.origin, 'Dated', 0);
    for (const [i, date] of ['2026:07:12 19:02:11', '2026:07:15 08:00:00'].entries()) {
      const data = await photoBytes({ width: 300 + i, height: 200, exif: { IFD2: { DateTimeOriginal: date } } });
      expect((await f.page.request.post(`${f.origin}/api/albums/${album.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data })).ok()).toBe(true);
    }
    await f.page.goto(`${f.origin}/#/a/${album.id}`);
    await f.page.locator('.album-page [data-act=menu]').click();
    await f.page.locator('[data-act=pdf]').click();
    await expect(f.page.locator('.pdf-export .print-cover p')).toHaveText('Jul 12 – 15, 2026');
    await f.page.locator('.pdf-export [data-act=cancel]').click();
  } finally { await f.close(); }
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/collection-v2.spec.cjs e2e/book-pages.spec.cjs e2e/photo-details.spec.cjs e2e/pdf-export.spec.cjs -g "capture date ranges|title page names|photo Details shows|read-only legacy Details|PDF cover writes"`
Expected: 5 个都 FAIL，仍是旧写法：卡片上是 `2026.07`，扉页是 `July 2 – 15, 2026`，两处详情是 `2026-08-15 …`，PDF 封面是 ISO 时间。

- [ ] **Step 7: 相册卡**

`src/collection-text.js`：删除整个 `export function dateRange(range, month = false) {…}`（7 行）及其前面的空行。

`src/folder.js`：

1. import 改为：

```js
import { mediaUrl } from './api.js';
import { lang, mediaCountText, t } from './i18n.js';
import { open } from './router.js';
import { icon } from './ui.js';
import { formatRange } from '../shared/dates.js';
```

2. 把：

```js
  const dates = dateRange(a.dateRange, true);
  if (dates) {
    const text = document.createElement('span');
    text.className = 'folder-dates';
    text.textContent = dates;
    el.append(text);
  }
```

换成：

```js
  // The capture months follow the count on its line (polish spec §4.3).
  const dates = formatRange(a.dateRange?.from, a.dateRange?.to, { lang: lang(), month: true });
  if (dates) {
    const text = document.createElement('span');
    text.className = 'folder-dates';
    text.textContent = dates;
    el.querySelector('.n').after(text);
  }
```

`src/collection.css`：删除第 46 行 `.folder-dates { display: block; margin-top: 4px; color: var(--ink-3); font-size: 11px; }`。

`src/style.css`：

1. 在 `.folder .n {…}` 块后面加：

```css
/* The capture months follow the count and give way first when the row is short. */
.folder .folder-dates {
  flex: 0 100 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.folder .folder-dates::before {
  content: '·';
  margin-right: 4px;
}
```

2. 窄卡的容器查询，把：

```css
/* Narrow cards (phones, the four-up home row): the count gets its own line so the title stays readable. */
@container (max-width: 279px) {
  .folder .meta {
    flex-wrap: wrap;
    row-gap: 0;
    height: auto;
    min-height: 22px;
  }

  .folder h3 {
    flex: 1 1 0;
  }

  .folder .n {
    order: 1;
    flex-basis: 100%;
  }
}
```

换成：

```css
/* Narrow cards (phones): the count and its dates get their own line so the title stays readable. */
@container (max-width: 279px) {
  .folder .meta {
    flex-wrap: wrap;
    row-gap: 0;
    height: auto;
    min-height: 22px;
  }

  /* A zero-height break: the count and its dates start the second line. */
  .folder .meta::before {
    content: '';
    order: 1;
    flex-basis: 100%;
  }

  .folder h3 {
    flex: 1 1 0;
  }

  .folder .n,
  .folder .folder-dates {
    order: 2;
  }
}
```

- [ ] **Step 8: 相册页、扉页、详情**

`src/album.js`：

1. 第 5 行 `import { mediaCountText, t } from './i18n.js';` 改为 `import { lang, mediaCountText, t } from './i18n.js';`。
2. 第 9 行 `import { c, dateRange } from './collection-text.js';` 改为：

```js
import { c } from './collection-text.js';
import { formatRange } from '../shared/dates.js';
```

3. `render()` 里：

```js
    $('.count').textContent = [mediaCountText(mediaCounts(album.photos)), dateRange(album.dateRange)].filter(Boolean).join(' · ');
```

改为：

```js
    const dates = formatRange(album.dateRange?.from, album.dateRange?.to, { lang: lang() });
    $('.count').textContent = [mediaCountText(mediaCounts(album.photos)), dates].filter(Boolean).join(' · ');
```

`src/book/title-page.js`：

1. import 区加 `import { formatRange } from '../../shared/dates.js';`。
2. `titlePageText()` 整个换成：

```js
// The first left page when the book opens (v2 spec §8): name, a rule, the date range and the count.
export function titlePageText(album) {
  // formatRange(day) only skips capture times that cannot be read.
  const days = album.photos.map((p) => p.metadata?.takenAt?.local).filter((day) => formatRange(day)).sort();
  return {
    title: album.title,
    dates: formatRange(days[0], days.at(-1), { lang: lang() }),
    count: mediaCountText(mediaCounts(album.photos)),
  };
}
```

`src/photo-details.js`：

1. import 区加 `import { formatInstant, formatRange } from '../shared/dates.js';`。
2. `capture()` 整个换成：

```js
// The capture time as recorded (polish spec §4.3): the date in the app's writing, then the clock time.
function capture(value) {
  if (!value) return null;
  return {
    date: formatRange(value.local, value.local, { lang: lang() }) || value.local.slice(0, 10),
    time: value.local.slice(11) + (value.subsecond ? `.${value.subsecond}` : '') +
      (value.offset ? ` ${value.offset}` : t('details-timezone-unknown')),
  };
}
```

3. `fields()` 里，把：

```js
      term.textContent = t(title);
      description.textContent = value;
      if (key === 'taken-at') {
        const date = document.createElement('span');
        const time = document.createElement('span');
        date.className = 'lb-capture-date';
        time.className = 'lb-capture-time';
        date.textContent = value.slice(0, 10);
        time.textContent = value.slice(11);
        description.replaceChildren(date, document.createTextNode(' '), time);
      }
```

换成：

```js
      term.textContent = t(title);
      if (key === 'taken-at') {
        const date = document.createElement('span');
        const time = document.createElement('span');
        date.className = 'lb-capture-date';
        time.className = 'lb-capture-time';
        date.textContent = value.date;
        time.textContent = value.time;
        description.replaceChildren(date, document.createTextNode(' '), time);
      } else description.textContent = value;
```

4. 把：

```js
    const modified = metadata.fileModifiedAt && Number.isFinite(Date.parse(metadata.fileModifiedAt))
      ? new Intl.DateTimeFormat(locale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(metadata.fileModifiedAt)) : null;
```

换成：

```js
    const modified = formatInstant(metadata.fileModifiedAt, { lang: lang() }) || null;
```

- [ ] **Step 9: README**

「排序与搜索」一节的 `相册卡显示已有的拍摄月份范围。` 改为：

`相册卡在照片数后面显示拍摄月份范围（如「8 张照片 · 2026年7月」）。日期在相册页、3D 扉页、PDF 封面和详情里写法一致，如「2026年7月12日–15日」。`

- [ ] **Step 10: 运行，确认通过**

Run: `npm test`
Expected: 全部通过。

Run: `npm run build && npx playwright test e2e/collection-v2.spec.cjs e2e/book-pages.spec.cjs e2e/photo-details.spec.cjs e2e/pdf-export.spec.cjs e2e/album-polish.spec.cjs e2e/welcome-import.spec.cjs`
Expected: 全部 PASS。album-polish 的「narrow album cards…」保持通过：没有日期的卡片不受影响。

- [ ] **Step 11: 检查残留**

```bash
grep -rn "dateRange(" src shared e2e
```

Expected: 没有输出（服务端字段 `dateRange` 不带括号）。

- [ ] **Step 12: Commit**

```bash
git add src/print-layout.js src/print-layout.test.js src/pdf-export.js src/print-entry.js src/collection-text.js src/folder.js src/style.css src/collection.css src/album.js src/book/title-page.js src/photo-details.js e2e/collection-v2.spec.cjs e2e/book-pages.spec.cjs e2e/photo-details.spec.cjs e2e/pdf-export.spec.cjs README.md
git commit -m "fix: write dates the same way on cards, albums, the 3D title page, PDF covers and Details" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: 3D 与 PDF 的小字

**Files:**
- Modify: `src/book/textures.js`（第 13 行 `CAPTION`，`drawPage()` 里的图注字体）、`src/book/title-page.js`（`drawTitlePage()` 的小字）、`src/print-layout.css`（`.print-face figcaption`）
- Test: `e2e/book-pages.spec.cjs`（「a photo with a note gets a one-line caption…」「title page text leaves out…」）、`e2e/pdf-export.spec.cjs`（「Chinese preview prints only video posters…」）

**Interfaces:**
- Consumes：无。
- Produces：无新接口。3D 图注字体为 `5px`（单位是毫米，画布已缩放），正体；图注留白 7.4mm。扉页日期和数量为 `5.2px`。PDF 图注为 3mm，正体。

- [ ] **Step 1: 写失败的测试**

`e2e/book-pages.spec.cjs`，「a photo with a note gets a one-line caption under it; blank notes change nothing」：

1. 把：

```js
      const labels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); return fillText.call(this, text, ...args); };
```

换成：

```js
      const labels = [];
      const fonts = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); fonts.push(this.font); return fillText.call(this, text, ...args); };
```

2. 把：

```js
      const out = {
        labels,
        captionedCorner: pixel(27 + 1.5, 11.4 + 40 - 1),
```

换成（新增的点在旧照片区里、新图注留白里、字形上方）：

```js
      const out = {
        labels,
        fonts,
        captionGap: pixel(27 + 30, 11.4 + 33.6),
        captionedCorner: pixel(27 + 1.5, 11.4 + 40 - 1),
```

3. 在 `expect(result.labels).toHaveLength(2);` 后面加：

```js
    // Upright and about 12 px on screen at 1180 × 800 (polish spec §4.2).
    expect(result.fonts).toHaveLength(2);
    for (const font of result.fonts) expect(font).toMatch(/^5px /);
    expect(result.captionGap[0]).toBeGreaterThan(180); // the photo leaves 7.4 mm for the caption: film shows
```

「title page text leaves out a missing date range and cuts a long name to one line」：

1. `ctx.fillText = (text, ...rest) => { labels.push({ text, width: ctx.measureText(text).width }); return fillText(text, ...rest); };` 改为：

```js
      ctx.fillText = (text, ...rest) => { labels.push({ text, width: ctx.measureText(text).width, font: ctx.font }); return fillText(text, ...rest); };
```

2. 在 `expect(result.labels[1].text).toBe('2 photos');` 后面加：

```js
    expect(result.labels[1].font).toMatch(/^5\.2px /);
```

`e2e/pdf-export.spec.cjs`，「Chinese preview prints only video posters, labels them and respects the captions toggle」，在 `await expect(d.locator('figcaption')).toHaveText('海边 <sunset>');` 后面加：

```js
    // Upright 3 mm captions (polish spec §4.2).
    const caption = await d.locator('figcaption').evaluate((el) => ({ style: getComputedStyle(el).fontStyle, size: parseFloat(getComputedStyle(el).fontSize) }));
    expect(caption.style).toBe('normal');
    expect(caption.size).toBeCloseTo((3 * 96) / 25.4, 1);
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs e2e/pdf-export.spec.cjs -g "one-line caption|title page text|Chinese preview"`
Expected: 3 个 FAIL。图注字体是 `italic 3.4px …`，`captionGap` 处仍是照片；扉页小字是 `4.2px …`；PDF 图注是 `italic`、约 9.45px。

- [ ] **Step 3: 实现**

`src/book/textures.js`：

1. `const CAPTION = 6; // mm under a photo with a note (v2 spec §8)` 改为：

```js
const CAPTION = 7.4; // mm under a photo with a note (polish spec §4.2)
```

2. `ctx.font = \`italic 3.4px ${SERIF}\`;` 改为：

```js
      ctx.font = `5px ${SERIF}`;
```

`src/book/title-page.js` 的 `drawTitlePage()`：`` ctx.font = `4.2px system-ui, sans-serif`; `` 改为：

```js
  ctx.font = `5.2px system-ui, sans-serif`;
```

`src/print-layout.css` 的 `.print-face figcaption` 整行换成（去掉 `font-style: italic`）：

```css
.print-face figcaption { position: absolute; top: calc(100% + .5mm); left: 0; width: 100%; font-size: 3mm; line-height: 3.4mm; max-height: 3.4mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs e2e/pdf-export.spec.cjs e2e/video-book.spec.cjs`
Expected: 全部 PASS。「a caption never collapses a panoramic photo…」依旧通过：全景照片的条带比 2 × 7.4mm 矮，图注放在条带下方。

- [ ] **Step 5: Commit**

```bash
git add src/book/textures.js src/book/title-page.js src/print-layout.css e2e/book-pages.spec.cjs e2e/pdf-export.spec.cjs
git commit -m "fix: larger upright captions in the 3D book and PDF" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: 3D 封面标题：深色压印字

**Files:**
- Modify: `src/book/binder.js`（`titleTexture()`；`createBinder()` 里的 `label`）
- Test: `e2e/book-pages.spec.cjs`（新用例）

**Interfaces:**
- Consumes：无。
- Produces：封面标题网格名为 `'cover-title'`（`group.getObjectByName('cover-title')`），材质 `opacity` 为 1。

- [ ] **Step 1: 写失败的测试**

`e2e/book-pages.spec.cjs` 末尾追加：

```js
test('the cover title is opaque dark ink with a light edge, legible against the cover', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/binder.js', '/__folio-binder-test.js');
    const result = await page.evaluate(async () => {
      const { createBinder } = await import('/__folio-binder-test.js');
      const { group } = createBinder({ sheets: 2, title: 'Summer by the sea' });
      const label = group.getObjectByName('cover-title');
      const canvas = label.material.map.image;
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const board = label.parent.material.color.getHexString();
      const base = [0, 2, 4].map((i) => parseInt(board.slice(i, i + 2), 16));
      const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
      // What the eye sees: each title pixel laid over the board at the label's opacity.
      let ink = luminance(base);
      let light = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = (data[i + 3] / 255) * label.material.opacity;
        if (alpha < 0.3) continue;
        const seen = luminance([0, 1, 2].map((k) => data[i + k] * alpha + base[k] * (1 - alpha)));
        ink = Math.min(ink, seen);
        if (seen > luminance(base)) light++;
      }
      return { opacity: label.material.opacity, contrast: (luminance(base) + 0.05) / (ink + 0.05), light };
    });
    expect(result.opacity).toBe(1);
    expect(result.contrast, 'title against the cover (WCAG AA: 4.5)').toBeGreaterThanOrEqual(4.5);
    expect(result.light, 'a light edge under the letters').toBeGreaterThan(0);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs -g "cover title"`
Expected: FAIL，`TypeError`：还没有名为 `cover-title` 的网格。

- [ ] **Step 3: 先给网格命名，确认失败原因是对比度**

`src/book/binder.js` 的 `createBinder()` 里，在 `label.position.set(…)` 前面加：

```js
  label.name = 'cover-title';
```

Run: `npx playwright test e2e/book-pages.spec.cjs -g "cover title"`
Expected: FAIL：`opacity` 为 `0.7`；修正后它的断言通过，`contrast` 约为 1（白字比封面更亮，深色投影太淡）。

- [ ] **Step 4: 实现**

`titleTexture()` 整个换成：

```js
// The cover title is pressed into the frosted board (polish spec §4.1): dark ink with a light edge
// under it, drawn opaque so it reads whatever page shows through the cover.
function titleTexture(title, width) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * 8);
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.scale(8, 8);
  ctx.font = '600 7.2px system-ui, sans-serif';
  for (const [color, d] of [['rgba(255,255,255,0.75)', 0.25], ['#1f2c37', 0]]) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 15 + d, 9, 0.7);
    ctx.fillText(title, 0, 25 + d);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
```

`createBinder()` 里的标签材质：

```js
    new MeshBasicMaterial({ map: titleTexture(title, tw), transparent: true, opacity: 0.7, depthWrite: false }),
```

改为：

```js
    new MeshBasicMaterial({ map: titleTexture(title, tw), transparent: true, depthWrite: false }),
```

- [ ] **Step 5: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs e2e/collection.spec.cjs -g "cover title|close button"`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/book/binder.js e2e/book-pages.spec.cjs
git commit -m "fix: press the 3D cover title in dark ink so it can be read" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: 看大图顶栏与「⋯」菜单

**Files:**
- Modify: `src/lightbox.js`（import、顶栏和菜单的标记、`show()`）、`src/photo-view.css`、`src/i18n.js`、`src/ui.js`、`README.md`（「看大图」一节）、`docs/superpowers/specs/2026-11-02-folio-v2-design.md`（第 54 行）
- Test: `e2e/lightbox-v2.spec.cjs`（新用例，并修改三处）、`e2e/album-polish.spec.cjs`（两处 `.lb-brand`）、`e2e/book-portrait.spec.cjs`（`.lb [data-act=cover]`）

**Interfaces:**
- Consumes：无。
- Produces：
  - 顶栏可见按钮依次为 `[data-act=close]`、`[data-act=details]`、`[data-act=original]`、`[data-act=delete]`、`[data-act=menu]`。手机上隐藏 `details` 和 `delete`。
  - 菜单 `.lb-menu` 里有 `[data-act=menu-cover]`（文字在其中的 `<span>`）和 `[data-act=menu-delete]`（只在手机上显示）。Task 6 往菜单里加 `menu-copy`、`menu-move`。
  - i18n 键 `set-album-cover`、`already-cover`；`original`、`original-video` 改为下载文案。图标 `image`。

- [ ] **Step 1: 写失败的测试**

`e2e/lightbox-v2.spec.cjs` 末尾追加：

```js
test('the top bar keeps details, download, delete and More; More sets the album cover', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    await expect(page.locator('.lb-brand')).toHaveCount(0);
    const shown = await page.locator('.lb-bar').evaluate((bar) =>
      [...bar.querySelectorAll('button')].filter((button) => button.getClientRects().length).map((button) => button.dataset.act));
    expect(shown).toEqual(['close', 'details', 'original', 'delete', 'menu']);
    await expect(page.locator('.lb-bar [data-act=original]')).toHaveAccessibleName('Download original');
    await page.locator('.lb-bar [data-act=menu]').click();
    const cover = page.locator('.lb-menu [data-act=menu-cover]');
    await expect(cover).toBeDisabled();
    await expect(cover).toHaveText('Already the cover');
    await expect(page.locator('.lb-menu [data-act=menu-delete]')).toBeHidden(); // the bar has Delete on a computer
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.lb-bar [data-act=original]')).toHaveAccessibleName('Download original video');
    await page.locator('.lb-bar [data-act=menu]').click();
    await expect(cover).toBeEnabled();
    await expect(cover).toHaveText('Set as album cover');
    await cover.click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/albums/${album.id}`)).json()).cover).toBe(album.photos[1].id);
    await page.locator('.lb-bar [data-act=menu]').click();
    await expect(cover).toBeDisabled();
  } finally { await fixture.close(); }
});
```

同一文件里修改三处：

1. 「fullscreen fit viewer has floating persistent details…」：

```js
    for (const action of ['details', 'cover', 'original', 'delete']) await expect(page.locator(`.lb-bar [data-act=${action}]`)).toBeVisible();
```

改为：

```js
    for (const action of ['details', 'original', 'delete', 'menu']) await expect(page.locator(`.lb-bar [data-act=${action}]`)).toBeVisible();
```

2. 「phone swipes navigate…」：在 `await expect(page.locator('.lb-menu [data-act=menu-cover]')).toBeVisible();` 后面加：

```js
    await expect(page.locator('.lb-menu [data-act=menu-delete]')).toBeVisible(); // phones have no Delete in the bar
```

3. 「video Space toggles outside native controls…」，把：

```js
    await page.locator('.lb-bar [data-act=cover]').click();
    await expect(page.locator('.lb-bar [data-act=cover]')).toBeDisabled();
```

改为：

```js
    await page.locator('.lb-bar [data-act=menu]').click();
    await page.locator('.lb-menu [data-act=menu-cover]').click();
    await page.locator('.lb-bar [data-act=menu]').click();
    await expect(page.locator('.lb-menu [data-act=menu-cover]')).toBeDisabled();
    await page.keyboard.press('Escape');
```

`e2e/album-polish.spec.cjs`：

1. 测试名 `'cards, back link, select icon and lightbox brand show the polished details'` 改为 `'cards, back link and select icon show the polished details; the photo viewer has no brand'`。其中：

```js
    await expect(page.locator('.lb-brand')).toContainText('Folio');
```

改为：

```js
    await expect(page.locator('.lb')).toBeVisible();
    await expect(page.locator('.lb-brand')).toHaveCount(0); // polish spec §4.4
```

2. 测试名 `'in Chinese the app keeps the name Folio in the nav, titles, viewer and phone tips'` 改为 `'in Chinese the app keeps the name Folio in the nav, titles and phone tips'`，并删除其中两行：

```js
    await page.locator('.tile').first().click();
    await expect(page.locator('.lb-brand')).toHaveText('Folio');
```

`e2e/book-portrait.spec.cjs`：`await page.locator('.lb [data-act=cover]').evaluate((el) => el.click());` 改为：

```js
    await page.locator('.lb [data-act=menu-cover]').evaluate((el) => el.click());
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs e2e/album-polish.spec.cjs e2e/book-portrait.spec.cjs`
Expected: FAIL：
- 新用例：顶栏还有品牌字和星标按钮。
- 「fullscreen fit…」：桌面上「⋯」隐藏。
- 「video Space…」：桌面上找不到可点的「⋯」。
- album-polish 的第一个用例：仍有品牌字。
- book-portrait「…stays on the page…」：`menu-cover` 已存在，可能仍通过。
其余用例 PASS。

- [ ] **Step 3: 文案和图标**

`src/i18n.js` 的 `zh`：

- `'original-video': '原文件',` 改为 `'original-video': '下载原视频',`
- `original: '查看原图',` 改为 `original: '下载原图',`
- 在 `'cover-set': '已设为封面',` 后面加：

```js
    'set-album-cover': '设为相册封面',
    'already-cover': '已是封面',
```

`src/i18n.js` 的 `en`：

- `'original-video': 'Original file',` 改为 `'original-video': 'Download original video',`
- `original: 'View original',` 改为 `original: 'Download original',`
- 在 `'cover-set': 'Cover updated',` 后面加：

```js
    'set-album-cover': 'Set as album cover',
    'already-cover': 'Already the cover',
```

`src/ui.js` 的 `PATHS` 里，在 `star: …` 后面加：

```js
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>',
```

- [ ] **Step 4: 顶栏和菜单**

`src/lightbox.js`：

1. 第 2 行 `import { brandLogo, dialog, icon, toast } from './ui.js';` 改为 `import { dialog, icon, toast } from './ui.js';`。
2. 删除顶栏里的一行 `<span class="lb-brand">${brandLogo()} ${t('app')}</span>`。
3. 非「最近删除」的那组按钮，把：

```js
        <button class="ibtn lb-desktop-details" type="button" data-act="details" aria-label="${t('details')}" aria-expanded="false" aria-controls="photo-details">${icon('info')}</button>
        <button class="ibtn lb-desktop-action" type="button" data-write data-act="cover" aria-label="${t('set-cover')}">${icon('star')}</button>
        <button class="ibtn" type="button" data-act="original" aria-label="${t('original')}">${icon('upload')}<span class="lb-sr">${t('original')}</span></button>
```

换成（顶栏不再放星标封面按钮，下载用下载图标）：

```js
        <button class="ibtn lb-desktop-details" type="button" data-act="details" aria-label="${t('details')}" aria-expanded="false" aria-controls="photo-details">${icon('info')}</button>
        <button class="ibtn" type="button" data-act="original" aria-label="${t('original')}">${icon('download')}<span class="lb-sr">${t('original')}</span></button>
```

4. 菜单，把：

```js
      <button type="button" role="menuitem" data-write data-act="menu-cover">${icon('star')}${t('set-cover')}</button>
      <button type="button" role="menuitem" data-write data-act="menu-delete">${icon('trash')}${t('delete')}</button>
```

换成：

```js
      <button type="button" role="menuitem" data-write data-act="menu-cover">${icon('image')}<span>${t('set-album-cover')}</span></button>
      <button type="button" role="menuitem" data-write data-act="menu-delete">${icon('trash')}<span>${t('delete')}</span></button>
```

5. `show()` 里，把：

```js
      for (const button of root.querySelectorAll('[data-act=cover], [data-act=sheet-cover], [data-act=menu-cover]')) button.disabled = (album.cover ?? album.photos[0].id) === p.id;
```

换成：

```js
      const isCover = (album.cover ?? album.photos[0].id) === p.id;
      for (const button of root.querySelectorAll('[data-act=sheet-cover], [data-act=menu-cover]')) button.disabled = isCover;
      $('[data-act=menu-cover] span').textContent = t(isCover ? 'already-cover' : 'set-album-cover');
```

`src/photo-view.css`：

1. 删除两行：

```css
.lb-brand { display: flex; align-items: center; gap: 6px; color: #7d8792; font-size: 12px; }
.lb-brand .brand-logo { width: 21px; height: 21px; }
```

2. 删除两行（原来把上传图标转 180° 当下载用；「⋯」原来只在手机上显示）：

```css
.lb [data-act=original] > svg { transform: rotate(180deg); }
.lb-overflow { display: none !important; }
```

3. `@media (max-width: 860px)` 里：
   - `.lb-brand, .lb .lb-desktop-action, .lb .lb-nav { display: none; }` 改为 `.lb .lb-desktop-action, .lb .lb-nav { display: none; }`。
   - 删除 `.lb-overflow { display: inline-flex !important; }`。
4. 在 `.lb-menu [data-act=menu-delete] { color: #f2a59a; }` 后面加：

```css
/* A computer has Delete in the bar; phones find it in ⋯ (polish spec §4.4). */
@media (min-width: 861px) {
  .lb-menu [data-act=menu-delete] { display: none; }
}
```

- [ ] **Step 5: 文档**

`README.md` 的「看大图」一节，第一段末尾加：

`顶栏右侧依次是「详情」「下载原图」（视频为「下载原视频」）「删除」和「⋯」；「⋯」里可以设为相册封面。手机上「删除」也在「⋯」里。`

`docs/superpowers/specs/2026-11-02-folio-v2-design.md` 第 54 行：

```markdown
  - 看大图品牌字中英文都显示 Folio。
```

改为：

```markdown
  - ~~看大图品牌字中英文都显示 Folio。~~ 已被 `2026-11-03-folio-polish-design.md` §4.4 取代：看大图顶栏不再显示品牌。
```

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs e2e/album-polish.spec.cjs e2e/book-portrait.spec.cjs e2e/desktop.spec.cjs e2e/collection-v2.spec.cjs e2e/photo-details.spec.cjs`
Expected: 全部 PASS。「最近删除」的预览仍只有恢复和彻底删除。

- [ ] **Step 7: Commit**

```bash
git add src/lightbox.js src/photo-view.css src/i18n.js src/ui.js README.md docs/superpowers/specs/2026-11-02-folio-v2-design.md e2e/lightbox-v2.spec.cjs e2e/album-polish.spec.cjs e2e/book-portrait.spec.cjs
git commit -m "feat: a quieter photo viewer bar with Download original and a More menu" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: 「⋯」复制或移动到其他相册

**Files:**
- Modify: `src/collection-actions.js`（`chooseAlbum()` 的两个 `return`）、`src/lightbox.js`（import、菜单标记、`act()`）、`src/i18n.js`、`README.md`（「看大图」一节）
- Test: `e2e/lightbox-v2.spec.cjs`（新用例 3 个）

**Interfaces:**
- Consumes：
  - Task 5 的菜单（`.lb-menu`、`menu-cover`、`menu-delete`）。
  - `chooseAlbum(sourceId, mode)`（`src/collection-actions.js`）。
  - `api.transferPhotos(id, ids, targetId, mode) → { album, target, copied, skipped }`。
  - `c('busy')`、`c('transferred', { n, skipped })`。
- Produces：
  - `chooseAlbum()` 返回 `{ id, mode, title } | null`，原有调用方（`album.js` 的批量 `transfer()`）不受影响。
  - 菜单项 `[data-act=menu-copy]`、`[data-act=menu-move]`。
  - i18n 键 `copy-to-album`、`move-to-album`、`copied-to`、`moved-to`。

- [ ] **Step 1: 写失败的测试**

`e2e/lightbox-v2.spec.cjs` 末尾追加：

```js
test('More copies or moves the current item to another album, then shows the next one', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page, origin, album } = await open(fixture);
    const kyoto = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Kyoto' } })).json();
    const count = async (id) => (await (await page.request.get(`${origin}/api/albums/${id}`)).json()).photos.length;
    const pick = async (act) => {
      await page.locator('.lb-bar [data-act=menu]').click();
      await page.locator(`.lb-menu [data-act=menu-${act}]`).click();
      await expect(page.locator('.album-picker .transfer-mode')).toHaveValue(act);
    };
    await pick('copy');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.toast')).toHaveText('Copied to "Kyoto"');
    await expect(page.locator('.lb-count')).toHaveText('1 / 2');
    expect(await count(kyoto.id)).toBe(1);
    // The same photo again is skipped as a duplicate, reported as batch transfers report it.
    await pick('copy');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.toast')).toHaveText('0 items transferred · 1 duplicates skipped');
    // Moving into a new album: the viewer goes on to the next item.
    await pick('move');
    await page.locator('.album-picker [data-action=new]').click();
    await page.locator('dialog.dlg input').fill('Nara');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.toast')).toHaveText('Moved to "Nara"');
    await expect(page.locator('.lb-count')).toHaveText('1 / 1');
    await expect(page.locator('.lb-filmstrip [aria-current=true]')).toHaveAccessibleName(/clip.mp4/);
    expect(await count(album.id)).toBe(1);
    // Moving the last item from the viewer over the 3D book closes both and leaves an empty album.
    await page.goto(`${origin}/#/a/${album.id}/3d/p/${album.photos[1].id}`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect(page.locator('.lb')).toBeVisible();
    await pick('move');
    await page.locator(`.album-picker [data-target="${kyoto.id}"]`).click();
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`#/a/${album.id}$`));
    await expect(page.locator('.album-page .drop')).toBeVisible();
    expect(await count(kyoto.id)).toBe(2);
  } finally { await fixture.close(); }
});

test('copy and move wait for an import to finish', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await open(fixture);
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    await page.locator('.lb-bar [data-act=menu]').click();
    await page.locator('.lb-menu [data-act=menu-move]').click();
    await expect(page.locator('.toast')).toHaveText('Please wait for the current operation to finish.');
    await expect(page.locator('.album-picker')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('a read-only license disables setting the cover, copying and moving in More', async () => {
  const fixture = await desktopFixture({ license: 'expired' });
  try {
    const { page } = await open(fixture);
    await page.locator('.lb-bar [data-act=menu]').click();
    for (const act of ['cover', 'copy', 'move']) await expect(page.locator(`.lb-menu [data-act=menu-${act}]`)).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.lb-menu [data-act=menu-copy]').dispatchEvent('click');
    await expect(page.locator('.album-picker')).toHaveCount(0);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs -g "copies or moves|wait for an import|read-only license disables"`
Expected: 3 个 FAIL，找不到 `[data-act=menu-copy]` / `[data-act=menu-move]`。

- [ ] **Step 3: 选择框返回相册名**

`src/collection-actions.js` 的 `chooseAlbum()` 末尾，把：

```js
  if (choice === 'new') {
    const name = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
    if (!name || !allowWrite()) return null;
    return { id: (await api.createAlbum(name)).id, mode: operation.value };
  }
  return choice && choice !== 'cancel' ? { id: choice, mode: operation.value } : null;
```

换成：

```js
  if (choice === 'new') {
    const name = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
    if (!name || !allowWrite()) return null;
    const created = await api.createAlbum(name);
    return { id: created.id, mode: operation.value, title: created.title };
  }
  if (!choice || choice === 'cancel') return null;
  return { id: choice, mode: operation.value, title: albums.find((album) => album.id === choice)?.title ?? '' };
```

- [ ] **Step 4: 文案**

`src/i18n.js` 的 `zh`，在 `'already-cover': '已是封面',` 后面加：

```js
    'copy-to-album': '复制到其他相册…',
    'move-to-album': '移动到其他相册…',
    'copied-to': ({ album }) => `已复制到「${album}」`,
    'moved-to': ({ album }) => `已移到「${album}」`,
```

`en`，在 `'already-cover': 'Already the cover',` 后面加：

```js
    'copy-to-album': 'Copy to another album…',
    'move-to-album': 'Move to another album…',
    'copied-to': ({ album }) => `Copied to "${album}"`,
    'moved-to': ({ album }) => `Moved to "${album}"`,
```

- [ ] **Step 5: 看大图里的复制和移动**

`src/lightbox.js`：

1. import 区加：

```js
import { c } from './collection-text.js';
import { chooseAlbum } from './collection-actions.js';
```

2. 菜单里 `menu-cover` 那一行后面加：

```js
      <button type="button" role="menuitem" data-write data-act="menu-copy">${icon('copy')}<span>${t('copy-to-album')}</span></button>
      <button type="button" role="menuitem" data-write data-act="menu-move">${icon('move')}<span>${t('move-to-album')}</span></button>
```

3. `act()` 开头，把：

```js
    if (['cover', 'delete', 'restore', 'purge'].includes(name) && !allowWrite()) return;
    const p = album.photos[index];
    if (busy || (['cover', 'delete', 'restore', 'purge'].includes(name) && details?.saving)) { toast(t(p.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save')); return; }
```

换成：

```js
    const writes = ['cover', 'copy', 'move', 'delete', 'restore', 'purge'];
    if (writes.includes(name) && !allowWrite()) return;
    const p = album.photos[index];
    if (busy || (writes.includes(name) && details?.saving)) { toast(t(p.kind === 'video' ? 'note-video-wait-save' : 'note-wait-save')); return; }
```

4. 在 `} else if (name === 'delete') {` 前面插入：

```js
      } else if (name === 'copy' || name === 'move') {
        if (name === 'move' && !details.canLeave()) return;
        closeMenu();
        // Imports and batch changes hold html[data-busy]; a transfer waits for them (polish spec §8).
        if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
        const target = await chooseAlbum(album.id, name);
        if (!target || !root.isConnected || !allowWrite()) return;
        if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
        setPending(true);
        document.documentElement.setAttribute('data-busy', '');
        try {
          const result = await api.transferPhotos(album.id, [p.id], target.id, target.mode);
          onAlbum(result.album);
          toast(result.skipped
            ? c('transferred', { n: result.copied, skipped: result.skipped })
            : t(target.mode === 'move' ? 'moved-to' : 'copied-to', { album: target.title }));
          if (!root.isConnected) return;
          // A moved item leaves: show the next one, the previous one at the end, or close when none is left.
          if (!result.album.photos.length) return onClose();
          show(index, result.album);
          onIndex(album.photos[index].id);
        } finally {
          document.documentElement.removeAttribute('data-busy');
          setPending(false);
        }
```

（这一段接在 `else if (name === 'cover') {…}` 的结尾 `}` 之后，原来紧跟着的 `else if (name === 'delete') {` 保持不变。）

- [ ] **Step 6: README**

「看大图」一节，Task 5 加的那句改为：

`顶栏右侧依次是「详情」「下载原图」（视频为「下载原视频」）「删除」和「⋯」。「⋯」里可以设为相册封面，或复制、移动到其他相册（可新建相册，相同文件会跳过）；移走后显示下一项，相册空了就关闭。手机上「删除」也在「⋯」里。`

- [ ] **Step 7: 运行，确认通过**

Run: `npm test`
Expected: 全部通过。

Run: `npm run build && npx playwright test e2e/lightbox-v2.spec.cjs e2e/collection-v2.spec.cjs e2e/book-portrait.spec.cjs e2e/video-review-regressions.spec.cjs`
Expected: 全部 PASS。批量移动和复制（collection-v2）不受 `chooseAlbum()` 返回值变化影响。

- [ ] **Step 8: Commit**

```bash
git add src/collection-actions.js src/lightbox.js src/i18n.js README.md e2e/lightbox-v2.spec.cjs
git commit -m "feat: copy or move the item you are viewing to another album" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: 全量验证，与对比稿对照

**Files:**
- 无代码改动。发现问题时回到对应的 Task 修复，并在那个 Task 的测试里补上用例。

- [ ] **Step 1: Node 测试**

Run: `npm test`
Expected: 全部通过，包括 `shared/dates.test.js` 的 5 个和 `src/print-layout.test.js` 的 2 个；只有原来那 1 个需要真实安装包的用例会跳过。

- [ ] **Step 2: 生产构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Electron 端到端全量**

Run: `caffeinate -di npm run test:desktop`
Expected: 全部通过；macOS 上只有原来那 1 个非 macOS 用例跳过。

- [ ] **Step 4: 与对比稿对照**

用临时相册库启动（`startServer()` 加一次性目录，用完删除）。放入带拍摄时间和备注的照片，以及一个视频。用真实 GPU（Chromium + `--use-angle=metal`）在 1180×800 下分别检查中文浅色和英文深色：

- 第 4 项（`c4-after.png`）：合上的 3D 封面上，标题是深色字、下方有浅色高光。在截图上量标题字与周围封面的对比度，应不低于 4.5:1。
- 第 5 项（`c5-after*.png`）：3D 图注是正体，扉页的日期和数量变大，字形高约 11px；PDF 预览里的图注也是正体。
- 第 6 项（`c6-after*.png`）：
  - 相册页标题下是「8 张照片 · 2026年7月12日–15日」。
  - 相册卡是「8 张照片 · 2026年7月」。
  - 扉页、PDF 封面、详情面板的写法一致；PDF 封面不再出现 `T19:02:11`。
- 第 7 项（`c7-after.png`）：
  - 顶栏只有「‹ 相册名 · n / N」和右侧的详情、下载原图、删除、「⋯」，没有品牌字。
  - 「⋯」里有设为相册封面、复制到其他相册…、移动到其他相册…。
  - 手机宽度下「⋯」里另有删除。

看完关掉服务，删除临时相册库。

- [ ] **Step 5: 交付**

推送 `feat/folio-polish-s2`，向 `main` 开 PR，等 CI（Windows 与 macOS）通过。不合并。

---

## Self-Review（写计划时已做）

**规格覆盖：**

| 规格条目 | 对应 Task |
|---|---|
| §4.1 封面标题：深色字 `#1f2c37`、不透明、下方 0.25mm 浅色高光；对比度 ≥ 4.5:1 | Task 4（单元测试），Task 7 Step 4（真实 GPU 对照） |
| §4.2 3D 图注 5mm 正体、留白 7.4mm；扉页小字 5.2mm；PDF 图注 3mm 正体 | Task 3 |
| §4.3 `shared/dates.js`：中文自拼、英文 `formatRange`、只到月份、日期时间、文件修改时间换算 | Task 1 |
| §4.3 使用的地方：相册页、相册卡（并到数量行、省略号、取消单独日期行）、扉页、PDF 封面（修复 ISO）、详情面板；删除 `dateRange` | Task 2 |
| §4.4 顶栏去品牌字；「下载原图 / 下载原视频」+ 下载图标；顶栏顺序 | Task 5 |
| §4.4「⋯」：设为相册封面（图片图标，已是封面时禁用并显示「已是封面」）、复制、移动；手机另加删除 | Task 5、Task 6 |
| §4.4 复制和移动复用选择框（可新建相册）、只作用于当前项、移动后显示下一项或上一项、相册空了就关闭、toast、重复跳过提示 | Task 6 |
| §4.4「最近删除」只读看大图不变 | Task 5、Task 6（菜单只在非预览模式出现；现有 trash preview 用例） |
| §8 写操作沿用 `allowWrite()` 和 `data-busy` | Task 6 |
| §9 `shared/dates.test.js`、`npm test` 加 `shared/*.test.js`；扩展 lightbox-v2、book-*、pdf-export | Task 1–6 |
| §10 README（看大图）；v2 设计文档注明被替代 | Task 2、Task 5、Task 6 |

**占位扫描：** 没有 TBD、TODO、「类似 Task N」；每个代码步骤都给出了代码。

**名称一致：**
- `formatRange` / `formatDateTime` / `formatInstant`（Task 1 定义；Task 2 使用）。
- `buildPrintModel(album, options, language)`。
- `'cover-title'`。
- `menu-cover` / `menu-copy` / `menu-move` / `menu-delete`。
- `set-album-cover`、`already-cover`、`copy-to-album`、`move-to-album`、`copied-to`、`moved-to`。
- `chooseAlbum() → { id, mode, title }`。

**Review Focus：** 5 条都已在对应 Task 的测试里写出断言。第 1 条在 Task 2 的 collection-v2，第 2 条在 Task 1 和 Task 2 的 Node 测试，第 3 条在 Task 1 和 Task 2 的详情测试，第 4、5 条在 Task 6。
