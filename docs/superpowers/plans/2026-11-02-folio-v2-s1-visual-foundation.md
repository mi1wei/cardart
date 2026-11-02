# Folio v2 · S1 视觉基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给册页加上深色模式（☀ / ☾ / 自动）、照片白边、缩略图大小、加载占位和一组界面细节修复，作为 v2 其余子项目的视觉基础。

**Architecture:** 颜色全部收进 `src/style.css` 的 CSS 自定义属性；用 CSS `light-dark()` 让每个令牌同时带浅/深两值，`:root` 的 `color-scheme` 决定取哪一个（`data-theme` 手动覆盖，缺省跟随系统）。新模块 `src/theme.js` 管理选择与变更事件；`public/theme-boot.js` 在首屏前恢复手动选择（CSP 不允许内联脚本）。3D 场景读取页面背景色并在主题变化时重绘。看大图在 S1 用 `color-scheme: light` 钉住浅色，S2 再整体重做为深色。

**Tech Stack:** 原生 JS（ES modules）+ Vite 8、three.js、Electron 45、Playwright 1.64（Electron 端到端）、Node 24 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-02-folio-v2-design.md`（本计划实现 §2 中的 S1 与 §3）；界面稿 `docs/superpowers/mockups/2026-11-02-folio-v2/design-1-wall-album.html`。

## Global Constraints

- 不新增 npm 依赖。
- CSP 为 `script-src 'self'`：不能写内联 `<script>`，首屏脚本必须是同源文件。
- 每条新界面文字都要在 `src/i18n.js` 的 `zh` 和 `en` 里各写一份。
- 主题选择存 `localStorage` 键 `theme`（值 `light` / `dark`；自动 = 不存）；缩略图大小存键 `density`（值 `s` / `m` / `l`）。存储不可用时只在本次访问有效，不报错。
- 深色令牌值（spec §3）：底 `#121417`、面板 `#1a1d21`、主色 `#7fc0e0`、主色上的字 `#0f1a20`、照片边 `#2a2e33`。
- 网格行高：小 / 中 / 大 = 120 / 180 / 260px（手机固定 104px，不显示滑块）。
- 照片白边：桌面 4px、手机 3px，颜色 `var(--frame)`。
- 主题切换在导入中（`html[data-busy]`）仍可用；语言切换仍禁用。
- 看大图在 S1 保持浅色（S2 改为始终深色）。
- 端到端测试跑的是 `dist/`：每次跑 Playwright 前先 `npm run build`。

## Review Focus

1. 浏览器不支持 `light-dark()`（iOS Safari < 17.5）：页面应完整保持浅色，主题开关不出现。→ Task 2 测试「without light-dark support…」（Chromium 无法关闭 CSS 支持，测试只能覆盖开关隐藏；浅色回退由 `@supports` 外的浅色令牌保证，Task 6 Step 3 在 iOS 17.4 以下设备或模拟器上目测）。
2. 站点数据被禁止、`localStorage` 抛错：页面照常打开，主题为自动，手动切换在本次访问内生效。→ Task 2 测试「blocked storage…」。
3. 正在导入照片时切换主题：主题应立即生效，导入队列不受影响，语言按钮仍被禁用。→ Task 2 测试「theme can change during an import…」。
4. 3D 相册打开期间系统从浅色切到深色（自动模式）：书后的背景应随之变化，不需要重开。→ Task 3 测试。
5. 正在导入时从相册页「⋯」删除相册：应拒绝并提示等待导入完成，相册仍在。→ Task 5 测试「deleting the album from ⋯ during an import…」。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/style.css` | 改 | 令牌（浅/深）、所有硬编码颜色换令牌、主题开关、白边、密度、占位、细节样式 |
| `src/photo-view.css` | 改 | `.lb` 钉住浅色；删 `.lb-fit` |
| `src/theme.js` | 建 | 读 / 设主题、循环、变更订阅、支持检测 |
| `public/theme-boot.js` | 建 | 首屏前恢复手动主题 |
| `index.html` | 改 | 引用 `/theme-boot.js` |
| `scripts/verify-package.mjs` | 改 | 打包白名单加 `theme-boot.js` |
| `src/nav.js` | 改 | 主题三段按钮 |
| `src/ui.js` | 改 | 新图标 `sun` `moon` `select` |
| `src/i18n.js` | 改 | 新文案；删 `details-fit` `video-controls` |
| `src/book/scene.js`、`src/book/book.js` | 改 | 3D 背景跟随主题 |
| `src/album.js` | 改 | 占位、密度滑块、面包屑当前项、选择图标、「⋯」菜单 |
| `src/wall.js` | 改 | 相册墙占位 |
| `src/folder.js` | 改 | 数量带单位、空相册文案 |
| `src/home.js` | 改 | 最近相册跳过空相册 |
| `src/lightbox.js` | 改 | 品牌名随语言；删适应提示 |
| `e2e/ui-helpers.cjs` | 建 | 端到端共用：建相册、读计算样式、设滑块 |
| `e2e/theme.spec.cjs` | 建 | Task 1–3 端到端 |
| `e2e/album-polish.spec.cjs` | 建 | Task 4–5 端到端 |
| `README.md` | 改 | 外观一节 |

---

### Task 1: 颜色令牌与深色调色板

**Files:**
- Modify: `src/style.css`（`:root`、以及下列选择器）
- Modify: `src/photo-view.css:1-14`（`.lb`）
- Create: `e2e/ui-helpers.cjs`
- Test: `e2e/theme.spec.cjs`（新建）

**Interfaces:**
- Produces（`e2e/ui-helpers.cjs`）: `seed(page, origin, title, count) → album`、`style(page, selector, prop) → string`、`setRange(locator, value: string)`。
- Produces: CSS 令牌 `--on-accent --frame --tile --ghost --press --track --rule --soft --soft-strong --dash --pocket-top --pocket-bottom --glass-top --glass-bottom --glass-edge --warn-ink --warn-soft --ok-ink --ok-soft --bad-soft`；`:root[data-theme='light'|'dark']` 覆盖系统选择（Task 2 写入该属性）。

- [ ] **Step 1: 写失败的测试**

新建 `e2e/ui-helpers.cjs`（共用工具放这里，不要从一个 spec 里 `require` 另一个 spec——那会把它的测试注册两遍）：

```js
const { expect } = require('@playwright/test');
const sharp = require('sharp');

async function seed(page, origin, title, count) {
  const album = await (await page.request.post(`${origin}/api/albums`, { data: { title } })).json();
  for (let i = 0; i < count; i++) {
    // Different sizes give different bytes, so the importer never skips one as a duplicate.
    const jpeg = await sharp({ create: { width: 30 + i, height: 20, channels: 3, background: '#a32f2f' } }).jpeg().toBuffer();
    const res = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=p${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data: jpeg });
    expect(res.ok()).toBe(true);
  }
  return album;
}

const style = (page, selector, prop) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el)[p], prop);

// Playwright cannot fill a range input: set it and fire the event the page listens to.
const setRange = (locator, value) => locator.evaluate((el, v) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

module.exports = { seed, style, setRange };
```

新建 `e2e/theme.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, style } = require('./ui-helpers.cjs');

test('the dark palette covers page surfaces and the lightbox stays light', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Dark check', 1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(18, 20, 23)');
    expect(await style(page, '.acts.normal .btn.pri', 'color')).toBe('rgb(15, 26, 32)');
    expect(await style(page, '.tile .badge', 'color')).toBe('rgb(28, 36, 48)');
    expect(await style(page, '.tile', 'backgroundColor')).toBe('rgb(34, 38, 43)');
    await page.locator('.album-page .title').click();
    await expect(page.locator('dialog.dlg')).toBeVisible();
    expect(await style(page, 'dialog.dlg', 'backgroundColor')).toBe('rgb(26, 29, 33)');
    await page.keyboard.press('Escape');
    await page.locator('.tile').click();
    await expect(page.locator('.lb')).toBeVisible();
    expect(await style(page, '.lb', 'backgroundColor')).toBe('rgb(245, 247, 249)');
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.folder')).toHaveCount(1);
    expect(await style(page, '.folder .pocket .back', 'backgroundImage')).toContain('rgb(38, 42, 47)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await style(page, 'body', 'backgroundColor')).toBe('rgb(247, 249, 251)');
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs`
Expected: FAIL，`body` 背景为 `rgb(247, 249, 251)` 而不是 `rgb(18, 20, 23)`。

- [ ] **Step 3: 改 `:root` 令牌**

把 `src/style.css` 开头整个 `:root { … }`（第 1–21 行）换成：

```css
:root {
  color-scheme: light;
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
  --on-accent: oklch(99% 0.004 240);
  --danger: #b42318;
  /* Photo mounts: the white border every photo gets, like a print in an album */
  --frame: #fff;
  --tile: #e4e9ee;
  --ghost: oklch(93.5% 0.018 230);
  --press: oklch(23.5% 0.02 255 / 0.06);
  --track: oklch(23.5% 0.02 255 / 0.05);
  --rule: oklch(82.3% 0.009 235);
  --soft: oklch(96.5% 0.012 235);
  --soft-strong: oklch(93% 0.025 235);
  --dash: oklch(75% 0.05 235);
  --pocket-top: #eaeff4;
  --pocket-bottom: #e0e6ec;
  --glass-top: rgb(255 255 255 / 0.55);
  --glass-bottom: rgb(255 255 255 / 0.82);
  --glass-edge: rgb(255 255 255 / 0.95);
  --warn-ink: #997024;
  --warn-soft: #fbf3e5;
  --ok-ink: #36795f;
  --ok-soft: #edf6f1;
  --bad-soft: #faf0ee;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --font: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI',
    'Noto Sans CJK SC', system-ui, sans-serif;
  /* Floating layers (menus, upload progress, dialogs) and cards, as on cardart.cc */
  --panel: 0 0 0 1px oklch(23.5% 0.02 255 / 0.06), 0 8px 24px oklch(23.5% 0.02 255 / 0.08),
    0 32px 64px -16px oklch(23.5% 0.02 255 / 0.22);
  --card: 0 0 0 1px oklch(23.5% 0.02 255 / 0.05), 0 2px 6px oklch(23.5% 0.02 255 / 0.04),
    0 14px 32px -12px oklch(23.5% 0.02 255 / 0.16);
}

/* Dark mode (v2 spec §3). Each colour carries both values; color-scheme picks one: the system's by
   default, or the choice in data-theme. Browsers without light-dark() keep the light values above. */
@supports (color: light-dark(#000, #fff)) {
  :root {
    color-scheme: light dark;
    --bg: light-dark(#f7f9fb, #121417);
    --raised: light-dark(#fff, #1a1d21);
    --ink: light-dark(oklch(23.5% 0.02 255), #e9ecef);
    --ink-2: light-dark(oklch(46.5% 0.022 248), #a7b0ba);
    --ink-3: light-dark(oklch(52.5% 0.016 248), #8a949f);
    --line: light-dark(oklch(92.2% 0.007 245), #2a2f35);
    --hover: light-dark(oklch(95.5% 0.007 242), #22262b);
    --accent: light-dark(#1d5f80, #7fc0e0);
    --accent-hover: light-dark(oklch(40.5% 0.085 240), #9fd0ea);
    --accent-soft: light-dark(oklch(95.2% 0.018 237), #1c2a33);
    --on-accent: light-dark(oklch(99% 0.004 240), #0f1a20);
    --danger: light-dark(#b42318, #ff8a7a);
    --frame: light-dark(#fff, #2a2e33);
    --tile: light-dark(#e4e9ee, #22262b);
    --ghost: light-dark(oklch(93.5% 0.018 230), #262b31);
    --press: light-dark(oklch(23.5% 0.02 255 / 0.06), rgb(255 255 255 / 0.08));
    --track: light-dark(oklch(23.5% 0.02 255 / 0.05), rgb(255 255 255 / 0.06));
    --rule: light-dark(oklch(82.3% 0.009 235), #3a4047);
    --soft: light-dark(oklch(96.5% 0.012 235), #182026);
    --soft-strong: light-dark(oklch(93% 0.025 235), #1f2b33);
    --dash: light-dark(oklch(75% 0.05 235), #3d5566);
    --pocket-top: light-dark(#eaeff4, #262a2f);
    --pocket-bottom: light-dark(#e0e6ec, #1f2327);
    --glass-top: light-dark(rgb(255 255 255 / 0.55), rgb(38 42 48 / 0.55));
    --glass-bottom: light-dark(rgb(255 255 255 / 0.82), rgb(30 33 38 / 0.85));
    --glass-edge: light-dark(rgb(255 255 255 / 0.95), rgb(255 255 255 / 0.1));
    --warn-ink: light-dark(#997024, #e2b66a);
    --warn-soft: light-dark(#fbf3e5, #2b2416);
    --ok-ink: light-dark(#36795f, #6cc4a0);
    --ok-soft: light-dark(#edf6f1, #16261f);
    --bad-soft: light-dark(#faf0ee, #2d1a18);
  }

  :root[data-theme='light'] {
    color-scheme: light;
  }

  :root[data-theme='dark'] {
    color-scheme: dark;
  }
}
```

（原来写在 `--font` 后面的 `--danger: #b42318;` 已并入上面，删掉旧行。）

- [ ] **Step 4: 把硬编码颜色换成令牌**

在 `src/style.css` 中逐条替换（按选择器定位，行号会因 Step 3 移动）：

| 选择器 | 原值 | 新值 |
|---|---|---|
| `.btn.pri` | `color: oklch(99% 0.004 240);` | `color: var(--on-accent);` |
| `.pocket .back` | `background: linear-gradient(#eaeff4, #e0e6ec);` | `background: linear-gradient(var(--pocket-top), var(--pocket-bottom));` |
| `.pocket .back` | `box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.85), …` | 只把 `rgb(255 255 255 / 0.85)` 换成 `var(--glass-edge)` |
| `.pocket img, .pocket .ghost` | `border: 5px solid #fff;` / `background: #fff;` | `border: 5px solid var(--frame);` / `background: var(--frame);` |
| `.pocket .ghost` | `background: oklch(93.5% 0.018 230);` | `background: var(--ghost);` |
| `.pocket .front` | `background: linear-gradient(rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.82));` | `background: linear-gradient(var(--glass-top), var(--glass-bottom));` |
| `.pocket .front` | `box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.95), …` | 只把 `rgb(255 255 255 / 0.95)` 换成 `var(--glass-edge)` |
| `.pocket .notch` | `border: 1px solid rgb(255 255 255 / 0.95);` | `border: 1px solid var(--glass-edge);` |
| `.license-workspace` | `--license-success: #36795f;` | `--license-success: var(--ok-ink);` |
| `.license-workspace[data-tone="expired"] .license-status-icon` | `color: #997024;` / `background: #fbf3e5;` | `color: var(--warn-ink);` / `background: var(--warn-soft);` |
| `.license-workspace[data-tone="active"] …` | `background: #edf6f1;` | `background: var(--ok-soft);` |
| `.license-workspace[data-tone="invalid"] …` | `background: #faf0ee;` | `background: var(--bad-soft);` |
| `.license-result[data-result="error"]` | `background: #faf0ee;` | `background: var(--bad-soft);` |
| `.license-result[data-result="success"]` | `background: #edf6f1;` | `background: var(--ok-soft);` |
| `.nl[aria-current='page']` | `background: oklch(23.5% 0.02 255 / 0.06);` | `background: var(--press);` |
| `.lang` | `background: oklch(23.5% 0.02 255 / 0.05);` | `background: var(--track);` |
| `.eyebrow .rule` | `background: oklch(82.3% 0.009 235);` | `background: var(--rule);` |
| `.tile` | `background: #e4e9ee;` | `background: var(--tile);` |
| `.drop` | `border: 2px dashed oklch(75% 0.05 235);` / `background: oklch(96.5% 0.012 235);` | `border: 2px dashed var(--dash);` / `background: var(--soft);` |
| `.dropping .grid` | `outline: 2px dashed oklch(75% 0.05 235);` | `outline: 2px dashed var(--dash);` |
| `.dropping .drop` | `background: oklch(93% 0.025 235);` | `background: var(--soft-strong);` |
| `.wx-tip` | `background: oklch(96.5% 0.012 235);` | `background: var(--soft);` |
| `.ab-select` | `background: #fff;` | `background: var(--raised);` |
| `.ab-round` | `background: #fff;` | `background: var(--raised);` |
| `.ab-primary` | `color: #fff;` | `color: var(--on-accent);` |
| `.ab-secondary` | `background: #fff;` | `background: var(--raised);` |

再加三处声明：

```css
/* in .badge — a white pill on the photo keeps dark text in both themes */
  color: #1c2430;

/* in .dlg */
  background: var(--raised);

/* in .dlg-input */
  color: var(--ink);
```

不改：`.qr`（二维码必须白底）、`.sw::after`、`.chk`、`.video-badge`、`.toast`、`.cta.dark`（它们本来就用 `--ink`/`--bg` 互换或固定在照片上）。

- [ ] **Step 5: 看大图钉住浅色**

`src/photo-view.css` 的 `.lb { … }` 里，在 `background: #f5f7f9;` 前加一行：

```css
  /* Light until the v2 lightbox (S2) makes it dark: var() colours inside resolve to their light values. */
  color-scheme: light;
```

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs`
Expected: PASS（1 test）。

- [ ] **Step 7: 提交**

```bash
git add src/style.css src/photo-view.css e2e/ui-helpers.cjs e2e/theme.spec.cjs
git commit -m "feat: colour tokens with a dark palette that follows the system"
```

---

### Task 2: 主题开关（☀ / ☾ / 自动）

**Files:**
- Create: `src/theme.js`、`public/theme-boot.js`
- Modify: `index.html`、`scripts/verify-package.mjs:81-87`、`src/nav.js`、`src/ui.js`（`PATHS`）、`src/i18n.js`、`src/style.css`（`.lang` 一组）
- Test: `e2e/theme.spec.cjs`

**Interfaces:**
- Consumes: Task 1 的 `:root[data-theme]` 规则。
- Produces（`src/theme.js`）:
  - `theme(): 'light' | 'dark' | 'auto'`
  - `setTheme(mode: 'light' | 'dark' | 'auto'): void` — 写存储、设 `html[data-theme]`、派发 `document` 事件 `folio-theme`
  - `nextTheme(mode): mode` — light → dark → auto → light
  - `onThemeChange(fn: () => void): () => void` — 主题或系统配色变化时调用，返回取消函数
  - `themeSupported(): boolean`

- [ ] **Step 1: 写失败的测试**

在 `e2e/theme.spec.cjs` 末尾追加：

```js
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('auto follows the system and a manual choice survives a reload', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.theme [data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
    await page.locator('.theme [data-theme-mode=dark]').click();
    await expect(page.locator('.theme [data-theme-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    expect(await page.locator('head script[src="/theme-boot.js"]').count()).toBe(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
    await page.locator('.theme [data-theme-mode=auto]').click();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    await expect.poll(() => bg(page)).toBe('rgb(247, 249, 251)');
  } finally { await fixture.close(); }
});

test('theme can change during an import while the language cannot', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/#/albums`);
    await page.locator('.nav [data-lang=zh]').click();
    await page.evaluate(() => document.documentElement.setAttribute('data-busy', ''));
    await page.locator('.theme [data-theme-mode=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.nav [data-lang=en]').click({ force: true });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  } finally { await fixture.close(); }
});

test('without light-dark support the switch is hidden and the page stays light', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => (args.join(' ').includes('light-dark') ? false : supports(...args));
    });
    await page.goto(`${origin}/#/albums`);
    await page.reload();
    await expect(page.locator('.nav .logo')).toBeVisible();
    await expect(page.locator('.theme')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('blocked storage falls back to auto and a choice still applies for this visit', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await page.goto(`${origin}/#/albums`);
    await page.reload();
    await expect(page.locator('.theme [data-theme-mode=auto]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.theme [data-theme-mode=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 23)');
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs`
Expected: 新的 4 个 FAIL（找不到 `.theme`）。

- [ ] **Step 3: 写 `src/theme.js`**

```js
// Light, dark or follow the system (v2 spec §3). Each device keeps its own choice.
const KEY = 'theme';
const MODES = ['light', 'dark', 'auto'];
const system = matchMedia('(prefers-color-scheme: dark)');

export const themeSupported = () => typeof CSS !== 'undefined' && CSS.supports('color', 'light-dark(#000, #fff)');

// public/theme-boot.js has already put a saved choice on <html> before the first paint.
export function theme() {
  const mode = document.documentElement.dataset.theme;
  return mode === 'light' || mode === 'dark' ? mode : 'auto';
}

export function setTheme(mode) {
  if (!MODES.includes(mode)) return;
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  document.dispatchEvent(new Event('folio-theme'));
}

export const nextTheme = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

// Calls fn whenever the colours may have changed: a choice here, or the system switching in auto mode.
export function onThemeChange(fn) {
  document.addEventListener('folio-theme', fn);
  system.addEventListener('change', fn);
  return () => {
    document.removeEventListener('folio-theme', fn);
    system.removeEventListener('change', fn);
  };
}
```

- [ ] **Step 4: 写 `public/theme-boot.js` 并在 `index.html` 引用**

`public/theme-boot.js`：

```js
// Puts a saved light/dark choice on <html> before the first paint (v2 spec §3); auto needs nothing.
// A file, not inline: the page's CSP allows only same-origin scripts.
try {
  const mode = localStorage.getItem('theme');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch {}
```

`index.html` 在 `<title>册页</title>` 前加一行：

```html
    <script src="/theme-boot.js"></script>
```

`scripts/verify-package.mjs` 的 `permittedWeb` 第一条正则改为：

```js
  return /^(index\.html|theme-boot\.js|favicon\.(svg|ico)|apple-touch-icon\.png|geist-OFL\.txt)$/.test(file) ||
```

- [ ] **Step 5: 图标与文案**

`src/ui.js` 的 `PATHS` 里加：

```js
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  select: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
```

`src/i18n.js`：`zh` 里 `language: '语言',` 后加：

```js
    theme: '外观',
    'theme-light': '浅色',
    'theme-dark': '深色',
    'theme-auto': '自动',
```

`en` 里 `language: 'Language',` 后加：

```js
    theme: 'Appearance',
    'theme-light': 'Light',
    'theme-dark': 'Dark',
    'theme-auto': 'Auto',
```

- [ ] **Step 6: 导航栏三段按钮**

`src/nav.js`：

```js
import { lang, setLang, t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { nextTheme, setTheme, theme, themeSupported } from './theme.js';
import { brandLogo, icon } from './ui.js';

const compact = matchMedia('(max-width: 600px)');
const THEMES = [['light', () => icon('sun')], ['dark', () => icon('moon')], ['auto', () => t('theme-auto')]];
```

`render()` 里把 `<span class="lang" …>` 那一行前插入：

```js
      ${themeSupported() ? `<span class="theme" role="group" aria-label="${t('theme')}">${THEMES.map(([mode, label]) =>
        `<button type="button" data-theme-mode="${mode}" aria-label="${t(`theme-${mode}`)}" title="${t(`theme-${mode}`)}">${label()}</button>`).join('')}</span>` : ''}
```

`update(next)` 末尾加：

```js
    for (const b of el.querySelectorAll('[data-theme-mode]')) b.setAttribute('aria-pressed', String(b.dataset.themeMode === theme()));
```

点击处理里，`if (e.target.closest('[data-act=phone]')) …` 之后、语言处理之前加（主题不看 `data-busy`）：

```js
    const mode = e.target.closest('[data-theme-mode]')?.dataset.themeMode;
    if (mode) {
      // On phones only the current mode shows; tapping it moves on to the next one.
      setTheme(mode === theme() && compact.matches ? nextTheme(mode) : mode);
      update(page);
      return;
    }
```

- [ ] **Step 7: 样式**

`src/style.css`：把原来的 `.lang { … }`、`.lang button { … }`、`.lang button[aria-pressed='true'] { … }` 三条规则整体替换为：

```css
:is(.lang, .theme) {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--track);
}

.theme {
  margin-right: 6px;
}

:is(.lang, .theme) button {
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

.theme button {
  display: inline-grid;
  place-items: center;
}

.theme button svg {
  width: 15px;
  height: 15px;
}

:is(.lang, .theme) button[aria-pressed='true'] {
  background: var(--raised);
  color: var(--ink);
  box-shadow: 0 1px 2px oklch(23.5% 0.02 255 / 0.12), inset 0 0 0 1px var(--line);
}
```

手机媒体查询里原有的 `.lang button { min-width: 34px; padding: 0 8px; }` 改为 `:is(.lang, .theme) button { … }`（声明不变）。把 `:is(.logo, .nl, .lang button, .cta, .more):focus-visible` 改为 `:is(.logo, .nl, .lang button, .theme button, .cta, .more):focus-visible`。`[data-busy] .lang` 保持不变（只禁语言）。在 `/* Navigation */` 的手机媒体查询 `@media (max-width: 600px) { … }` 里加：

```css
  .theme button:not([aria-pressed='true']) {
    display: none;
  }

  .theme {
    margin-right: 4px;
  }
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs && npm test`
Expected: theme.spec 5 个 PASS；`npm test` 全部 PASS（`verify-package` 白名单改动不破坏现有测试）。

- [ ] **Step 9: 提交**

```bash
git add src/theme.js public/theme-boot.js index.html scripts/verify-package.mjs src/nav.js src/ui.js src/i18n.js src/style.css e2e/theme.spec.cjs
git commit -m "feat: light, dark and auto appearance switch in the top bar"
```

---

### Task 3: 3D 场景背景跟随主题

**Files:**
- Modify: `src/book/scene.js`（`createStage`）、`src/book/book.js:18`
- Test: `e2e/theme.spec.cjs`

**Interfaces:**
- Consumes: `onThemeChange(fn): () => void`（Task 2）。
- Produces: `createStage(container, halfWidth, insets, onRepaint = () => {})` — 新增第 4 个参数，背景变化后调用它请求重绘。

- [ ] **Step 1: 写失败的测试**

在 `e2e/theme.spec.cjs` 末尾追加：

```js
async function corner(page) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data } = await sharp(png).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);

test('the 3D book background follows the theme while the book is open', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, '3D theme', 2);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab canvas')).toBeVisible();
    await expect.poll(async () => near(await corner(page), [18, 20, 23]), { timeout: 15000 }).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => near(await corner(page), [247, 249, 251]), { timeout: 15000 }).toBe(true);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs -g "3D book background"`
Expected: FAIL，角落像素约为 `[247, 249, 251]`（写死的浅色）。

- [ ] **Step 3: 实现**

`src/book/scene.js` 顶部 import 后加：

```js
import { onThemeChange } from '../theme.js';
```

函数签名改为：

```js
export function createStage(container, halfWidth, insets, onRepaint = () => {}) {
```

把：

```js
  const scene = new Scene();
  scene.background = new Color('#f7f9fb');
```

换成：

```js
  const scene = new Scene();
  // The book sits on the page colour, light or dark (v2 spec §3).
  const pageColour = () => new Color(getComputedStyle(document.body).backgroundColor);
  scene.background = pageColour();
  const stopTheme = onThemeChange(() => {
    scene.background = pageColour();
    onRepaint();
  });
```

`dispose()` 第一行加：

```js
      stopTheme();
```

`src/book/book.js` 第 18 行改为（`requestRender` 是函数声明，回调执行时已初始化）：

```js
  const stage = createStage(container, binder.xb + binder.B, insets, () => requestRender());
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/theme.spec.cjs e2e/collection.spec.cjs e2e/video-book.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/book/scene.js src/book/book.js e2e/theme.spec.cjs
git commit -m "feat: the 3D book background follows the light or dark theme"
```

---

### Task 4: 照片白边、缩略图大小、加载占位

**Files:**
- Modify: `src/style.css`（`.grid` `.tile` `.tile.sel` `.tile.ghost` `.dropping .grid` 及手机媒体查询；新增 `.skel` `.folder-skel` `.density`）
- Modify: `src/album.js`、`src/wall.js`
- Test: `e2e/album-polish.spec.cjs`（新建）

**Interfaces:**
- Consumes: Task 1 令牌 `--frame --tile --ghost`；`seed()`、`setRange()` from `e2e/ui-helpers.cjs`。
- Produces: `main.album-page[data-density='s'|'m'|'l']`；`.density input[type=range]`（0–2）；占位元素 `.grid .skel`、`.folders .folder-skel`。

- [ ] **Step 1: 写失败的测试**

新建 `e2e/album-polish.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const sharp = require('sharp');
const { seed, setRange } = require('./ui-helpers.cjs');

test('photos get a frame and the thumbnail size is remembered', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Frames', 3);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 4px');
    const row = () => page.locator('.grid').evaluate((el) => getComputedStyle(el).getPropertyValue('--row').trim());
    expect(await row()).toBe('180px');
    await setRange(page.locator('.density input'), '0');
    await expect.poll(row).toBe('120px');
    await setRange(page.locator('.density input'), '2');
    await expect.poll(row).toBe('260px');
    await page.reload();
    await expect(page.locator('.tile')).toHaveCount(3);
    expect(await row()).toBe('260px');
    await expect(page.locator('.density input')).toHaveValue('2');
  } finally { await fixture.close(); }
});

test('loading shows placeholders instead of the empty drop zone', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Slow', 1);
    let release;
    let held = new Promise((resolve) => { release = resolve; });
    const albumRoute = new RegExp(`/api/albums/${album.id}$`);
    await page.route(albumRoute, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.grid .skel').first()).toBeVisible();
    await expect(page.locator('.album-page .drop')).toBeHidden();
    release();
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.grid .skel')).toHaveCount(0);
    await page.unroute(albumRoute);

    held = new Promise((resolve) => { release = resolve; });
    await page.route(/\/api\/albums$/, async (route) => { await held; await route.continue(); });
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.folder-skel').first()).toBeVisible();
    await expect(page.locator('.folder')).toHaveCount(0);
    release();
    await expect(page.locator('.folder')).toHaveCount(1);
    await expect(page.locator('.folder-skel')).toHaveCount(0);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/album-polish.spec.cjs`
Expected: FAIL（`--row` 为 `190px`；没有 `.skel`）。

- [ ] **Step 3: 网格与白边样式**

`src/style.css`：

`.grid` 里 `--row: 190px;` → `--row: 180px;`，`gap: 6px;` → `gap: 14px;`。

`.tile` 里 `border-radius: 8px;` → `border-radius: 2px;`，并加：

```css
  box-shadow: 0 0 0 4px var(--frame), 0 4px 12px -4px oklch(23.5% 0.02 255 / 0.28);
```

`.tile.sel { outline: …; outline-offset: …; }` 整段换成：

```css
.tile.sel {
  box-shadow: 0 0 0 4px var(--accent);
}
```

删除整段 `.tile.sel img { … }`。

`.tile.ghost` 里 `border-radius: 8px;` → `2px`，`box-shadow` 末尾的 `0 0 0 3px #fff` → `0 0 0 4px var(--frame)`。

`.dropping .grid` 里 `outline-offset: 6px;` → `outline-offset: 10px;`。

把 `:is(.btn, .ibtn, .tile, .pocket, .link, .title):focus-visible` 规则后追加：

```css
.tile:focus-visible {
  outline-offset: 6px;
}
```

相册页手机媒体查询（`@media (max-width: 600px)` 里含 `.grid { --row: 104px; gap: 3px; }` 那段）中，只把 `.grid { … }` 和 `.tile { border-radius: 4px; }` 两条换成下面四条，同一段里的 `.acts` 与 `.acts.normal [data-act=…]` 规则保持不变：

```css
  .grid {
    --row: 104px;
    gap: 8px;
  }

  .tile {
    border-radius: 2px;
    box-shadow: 0 0 0 3px var(--frame), 0 2px 6px -2px oklch(23.5% 0.02 255 / 0.25);
  }

  .tile.sel {
    box-shadow: 0 0 0 3px var(--accent);
  }

  .density {
    display: none;
  }
```

在 `.grid::after { … }` 后追加：

```css
/* Thumbnail size (v2 spec §3); phones keep their own row height. */
@media (min-width: 601px) {
  .album-page[data-density='s'] .grid {
    --row: 120px;
  }

  .album-page[data-density='l'] .grid {
    --row: 260px;
  }
}

.density {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.density input {
  width: 96px;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Placeholders while the album or the wall loads */
.skel {
  flex: calc(var(--a) * 1000) 1 calc(var(--a) * var(--row));
  max-width: calc(var(--a) * var(--row) * 2);
  aspect-ratio: var(--a);
  border-radius: 2px;
  background: var(--tile);
}

.folder-skel {
  display: grid;
  gap: 12px;
}

.folder-skel i {
  display: block;
  aspect-ratio: 253 / 212;
  border-radius: 16px;
  background: var(--ghost);
}

.folder-skel b {
  display: block;
  width: 60%;
  height: 14px;
  border-radius: 7px;
  background: var(--ghost);
}

@media (prefers-reduced-motion: no-preference) {
  .skel,
  .folder-skel :is(i, b) {
    animation: skel 1.4s ease-in-out infinite;
  }
}

@keyframes skel {
  50% {
    opacity: 0.55;
  }
}
```

- [ ] **Step 4: 相册页：占位与密度**

`src/album.js` 顶部常量区加：

```js
const DENSITY = ['s', 'm', 'l'];
// Rough aspect ratios, so the placeholder rows look like photos.
const SKELETON = [1.5, 0.75, 1.33, 1, 1.5, 0.75, 1.33, 1.5].map((a) => `<i class="skel" style="--a:${a}" aria-hidden="true"></i>`).join('');

function savedDensity() {
  try {
    const value = localStorage.getItem('density');
    return DENSITY.includes(value) ? value : 'm';
  } catch {
    return 'm';
  }
}
```

模板里：

- `<div class="grid" hidden></div>` → `<div class="grid">${SKELETON}</div>`（`.drop` 原本就带 `hidden`，保持不变；`render()` 会按照片数决定显示哪个）
- `.acts.normal` 里 `select` 按钮之后加：

```html
        <label class="density" title="${t('density')}"><input type="range" min="0" max="2" step="1" aria-label="${t('density')}"></label>
```

在 `const box = $('.upload');` 之后加：

```js
  const density = $('.density input');
  main.dataset.density = savedDensity();
  density.value = String(DENSITY.indexOf(main.dataset.density));
  density.addEventListener('input', () => {
    main.dataset.density = DENSITY[Number(density.value)];
    try { localStorage.setItem('density', main.dataset.density); } catch {}
  });
```

`load()` 的 `catch` 里，`else toast(...)` 改为：

```js
      else {
        grid.querySelectorAll('.skel').forEach((node) => node.remove());
        toast(t('load-failed', { reason: err.message }));
      }
```

`render()` 里 `grid.hidden = n === 0;` 后加：

```js
    $('.density').hidden = n === 0;
```

`src/i18n.js`：`zh` 加 `density: '缩略图大小',`；`en` 加 `density: 'Thumbnail size',`（放在 `select` 附近）。

- [ ] **Step 5: 相册墙占位**

`src/wall.js` 模板里 `<div class="folders"></div>` → 

```js
      <div class="folders">${'<div class="folder-skel" aria-hidden="true"><i></i><b></b></div>'.repeat(4)}</div>
```

`load()` 的 `catch` 里 `if (alive) toast(...)` 改为：

```js
      if (!alive) return;
      wall.querySelectorAll('.folder-skel').forEach((node) => node.remove());
      toast(t('load-failed', { reason: err.message }));
```

（成功路径的 `wall.replaceChildren(...)` 已经会移除占位。）

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/album-polish.spec.cjs e2e/collection.spec.cjs e2e/desktop.spec.cjs e2e/video-review-regressions.spec.cjs`
Expected: 全部 PASS（`collection` 覆盖拖动排序与选择；`video-review-regressions` 覆盖空相册的 `.drop`）。

- [ ] **Step 7: 提交**

```bash
git add src/style.css src/album.js src/wall.js src/i18n.js e2e/album-polish.spec.cjs
git commit -m "feat: framed photos, thumbnail size and loading placeholders"
```

---

### Task 5: 界面细节修复

**Files:**
- Modify: `src/folder.js`、`src/home.js`、`src/album.js`、`src/lightbox.js:18,28,72`、`src/photo-view.css`（`.lb-fit` 两处）、`src/i18n.js`、`src/style.css`（`.folder h3` `.folder .n` `.folder .ibtn`；新增 `.crumb-here` `.menu-host` `.btn.only-icon`）
- Test: `e2e/album-polish.spec.cjs`

**Interfaces:**
- Consumes: `icon('select')`（Task 2）、`mediaCountText()`（`src/i18n.js`）、`api.deleteAlbum(id)`、`open(hash)`（`src/router.js`）。
- Produces: `.folder .n` 显示带单位数量或「还没有照片」；`.crumb .crumb-here`；相册页 `[data-act=menu]` → `.menu` 内 `[data-act=rename]` `[data-act=delete-album]`。

- [ ] **Step 1: 写失败的测试**

在 `e2e/album-polish.spec.cjs` 末尾追加：

```js
test('cards, breadcrumb, select icon, lightbox brand and home show the polished details', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const full = await seed(page, origin, 'Full', 2);
    const empty = await seed(page, origin, 'Empty', 0);
    await page.goto(`${origin}/#/albums`);
    await page.locator('.nav [data-lang=zh]').click();
    await expect(page.locator(`.folder[data-id="${full.id}"] .n`)).toHaveText('2 张照片');
    await expect(page.locator(`.folder[data-id="${empty.id}"] .n`)).toHaveText('还没有照片');

    await page.goto(`${origin}/#/`);
    await expect(page.locator('.recent')).toBeVisible();
    await expect(page.locator('.recent .folder')).toHaveCount(1);
    await expect(page.locator(`.recent .folder[data-id="${full.id}"]`)).toHaveCount(1);

    await page.goto(`${origin}/#/a/${full.id}`);
    await expect(page.locator('.crumb .crumb-here')).toHaveText('Full');
    await expect(page.locator('.acts.normal [data-act=select] svg')).toHaveCount(1);
    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=rename]').click();
    await page.locator('dialog.dlg input').fill('Full renamed');
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page.locator('.crumb .crumb-here')).toHaveText('Full renamed');
    await expect(page.locator('.acts .menu')).toHaveCount(0);

    await page.locator('.tile').first().click();
    await expect(page.locator('.lb-brand')).toContainText('册页');
    await expect(page.locator('.lb-fit')).toHaveCount(0);
    await page.goto(`${origin}/#/a/${full.id}`);
    await expect(page.locator('.lb')).toHaveCount(0);

    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=delete-album]').click();
    await page.locator('dialog.dlg [value=ok]').click();
    await expect(page).toHaveURL(/#\/albums$/);
    await expect(page.locator(`.folder[data-id="${full.id}"]`)).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('deleting the album from ⋯ during an import is refused', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Busy', 1);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    await page.route(/\/api\/albums\/[^/]+\/photos\?/, async (route) => { entered(); await held; await route.continue(); });
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.tile')).toHaveCount(1);
    const jpeg = await sharp({ create: { width: 50, height: 20, channels: 3, background: '#2f6aa3' } }).jpeg().toBuffer();
    await page.locator('.album-page input[type=file]').setInputFiles([{ name: 'new.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
    await started;
    await page.locator('.acts.normal [data-act=menu]').click();
    await page.locator('.acts .menu [data-act=delete-album]').click();
    await expect(page.locator('.toast')).toHaveText(/请等待当前导入完成|Please wait for the import/);
    await expect(page.locator('dialog.dlg')).toHaveCount(0);
    release();
    await expect(page.locator('.tile')).toHaveCount(2);
    expect((await page.request.get(`${origin}/api/albums/${album.id}`)).ok()).toBe(true);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/album-polish.spec.cjs -g "polished details|during an import"`
Expected: FAIL（`.n` 为 `2`；没有 `.crumb-here`；没有 `[data-act=menu]`）。

- [ ] **Step 3: 文案**

`src/i18n.js`：

- `zh` 加 `'album-empty': '还没有照片',`；`en` 加 `'album-empty': 'No photos yet',`（放在 `no-albums` 后）。
- 两种语言都删掉 `'details-fit'` 与 `'video-controls'` 两行。

- [ ] **Step 4: 相册卡数量与空相册**

`src/folder.js`：

```js
import { mediaCountText, t } from './i18n.js';
```

模板中 `<span class="n">${a.count}</span>` → `<span class="n"></span>`；`el.querySelector('h3').textContent = a.title;` 后加：

```js
  el.querySelector('.n').textContent = a.count ? mediaCountText(a) : t('album-empty');
```

`src/style.css`：

- `.folder h3` 里 `flex: 1;` → `flex: 0 1 auto;`
- `.folder .n` 改为：

```css
.folder .n {
  flex: none;
  color: var(--ink-3);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
```

- `.folder .ibtn` 里加 `margin-left: auto;`

- [ ] **Step 5: 首页最近相册跳过空相册**

`src/home.js` 的成功回调里，把：

```js
      app.querySelector('.recent .folders').replaceChildren(...list.slice(0, 4).map((a) => folder(a)));
      app.querySelector('.recent').hidden = false;
```

换成：

```js
      const filled = list.filter((a) => a.count > 0);
      if (!filled.length) return;
      app.querySelector('.recent .folders').replaceChildren(...filled.slice(0, 4).map((a) => folder(a)));
      app.querySelector('.recent').hidden = false;
```

- [ ] **Step 6: 相册页：面包屑、选择图标、⋯ 菜单**

`src/album.js` 模板：

- `<p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span></p>` → `<p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span><b class="crumb-here"></b></p>`
- `select` 按钮改为：

```html
        <button class="btn" type="button" data-act="select">${icon('select')}<span>${t('select')}</span></button>
        <span class="menu-host"><button class="btn only-icon" type="button" data-act="menu" aria-label="${t('more')}" aria-haspopup="menu">${icon('more')}</button></span>
```

`render()` 里 `$('.title').textContent = album.title;` 后加 `$('.crumb-here').textContent = album.title;`；`rename()` 成功分支 `$('.title').textContent = album.title;` 后同样加一行。

新增两个函数（放在 `rename()` 之后）：

```js
  function toggleMenu(button) {
    const shown = button.parentElement.querySelector('.menu');
    if (shown) return shown.remove();
    button.insertAdjacentHTML(
      'afterend',
      `<div class="menu" role="menu"><button type="button" role="menuitem" data-write data-act="rename">${t('rename')}</button><button type="button" role="menuitem" data-write class="red" data-act="delete-album">${t('delete-album')}</button></div>`,
    );
  }

  async function removeAlbum() {
    if (!allowWrite()) return;
    if (uploading) { toast(t('upload-wait')); return; }
    const text = t('delete-album-text', { name: album.title });
    if (!(await dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })) || !alive) return;
    try {
      await api.deleteAlbum(id);
      open('#/albums');
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
  }
```

`onClick(e)` 改为（注意：函数里局部变量 `t` 遮住了 i18n 的 `t`，菜单文案都放在上面两个函数里）：

```js
  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act !== 'menu') app.querySelector('.acts .menu')?.remove();
    if (['upload', 'rename', 'delete', 'delete-album'].includes(act) && !allowWrite()) return;
    const t = e.target.closest('.tile');
    if (t && !act) return onTile(t);
    if (!album) return;
    if (act === 'upload') input.click();
    else if (act === 'select' || act === 'cancel') {
      selecting = act === 'select';
      selected.clear();
      render();
    } else if (act === 'delete') removeSelected();
    else if (act === 'rename') rename();
    else if (act === 'menu') toggleMenu(e.target.closest('[data-act=menu]'));
    else if (act === 'delete-album') removeAlbum();
    else if (act === '3d') open(`#/a/${id}/3d`);
  }
```

`src/style.css`（`.crumb a:hover` 规则后）：

```css
.crumb-here {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-2);
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.menu-host {
  position: relative;
}

.menu-host .menu {
  left: 0;
  right: auto;
}

.btn.only-icon {
  width: 36px;
  padding: 0;
  justify-content: center;
}
```

并在 `.menu button` 规则里加 `color: var(--ink);`（`.menu .red` 仍用 `--danger` 覆盖）。

- [ ] **Step 7: 看大图品牌名与提示**

`src/lightbox.js`：

- 第 18 行 `<span class="lb-brand">${brandLogo()} Folio</span>` → `<span class="lb-brand">${brandLogo()} ${t('app')}</span>`
- 删除第 28 行 `<p class="lb-fit">${t('details-fit')}</p>`
- 删除第 72 行 `$('.lb-fit').textContent = t(p.kind === 'video' ? 'video-controls' : 'details-fit');`

`src/photo-view.css`：删除 `.lb-fit { … }` 规则，以及手机媒体查询里的 `.lb-fit { … }` 规则。

- [ ] **Step 8: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/album-polish.spec.cjs e2e/photo-details.spec.cjs e2e/photo-notes.spec.cjs e2e/video-playback.spec.cjs e2e/video-upload.spec.cjs e2e/desktop.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 9: 提交**

```bash
git add src/folder.js src/home.js src/album.js src/lightbox.js src/photo-view.css src/i18n.js src/style.css e2e/album-polish.spec.cjs
git commit -m "feat: album card counts, breadcrumb, album menu and lightbox brand fixes"
```

---

### Task 6: README 与全量验证

**Files:**
- Modify: `README.md`（「语言」一节之后）

- [ ] **Step 1: README 加「外观」一节**

在 `## 语言` 一节后插入：

```markdown
## 外观

导航栏右边的「☀ / ☾ / 自动」切换浅色、深色或跟随系统（默认自动），每台设备各自记住；手机上只显示当前项，点一下切到下一个。导入照片时也能切换。浏览器太旧（iOS 17.4 及以下）时只有浅色。照片带白边（深色下为深灰边）；相册页右侧的滑块调缩略图大小（小 / 中 / 大），手机上固定大小。
```

- [ ] **Step 2: 全量测试**

Run: `npm test && npm run build && npm run test:desktop`
Expected: 全部 PASS。若有既有测试因样式改动失败，读失败信息修正实现（不改测试意图）后重跑。

- [ ] **Step 3: 视觉对照**

用 `ALBUM_LIBRARY=$(mktemp -d) npm start` 启动，浏览器打开 `http://localhost:5180`，分别在浅色、深色下对照 `docs/superpowers/mockups/2026-11-02-folio-v2/design-1-wall-album.html` 看：相册墙、相册页、选择中、手机宽度（DevTools 390×844）。差异只允许在 S2–S7 范围内的部分（搜索、排序、日期范围、批量悬浮条、最近删除卡）。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: describe the appearance switch and thumbnail size"
```
