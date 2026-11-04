# Folio 打磨 · S4a 窗口与设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面版看起来像一个原生 App：
- 系统标题栏和 Folio 顶栏合成一层。
- 外观选择同时作用于窗口、标题栏和系统对话框。
- 设置里能看到相册库和版本，并能直接操作。
- 记住窗口的大小和位置。

**Architecture:**
- 主进程逻辑拆成三个纯模块，可以在 Node 里测试：
  - `desktop/window-state.cjs`：窗口位置的校验与恢复。
  - `desktop/window-chrome.cjs`：标题栏与颜色。
  - `desktop/desktop-info.cjs`：设置里显示的信息。
- `desktop/main.cjs` 负责接线。
- preload 新增冻结的 `window.folioDesktop`，只走固定的 IPC 通道；主进程校验调用方必须是主窗口里的 App 页面。
- 页面侧：
  - `public/theme-boot.js` 在首屏前加上 `data-desktop`。
  - 新模块 `src/desktop.js` 同步全屏状态和外观。
  - `src/settings.js` 加「相册库」「版本」两行。

**Tech Stack:** Electron 45（`BrowserWindow`、`nativeTheme`、`screen`、`ipcMain`、`contextBridge`）、原生 JS（ES modules）、Node 24 `node --test`、Playwright 1.64（Electron 端到端）。

**Spec:** `docs/superpowers/specs/2026-11-03-folio-polish-design.md` 的以下几节：
- §6.1 标题栏合一与外观同步
- §6.4 设置里的桌面部分（不含菜单命令：`setContext`、`onCommand`、⌘, 归 S4b）
- §6.5 记住窗口
- §8 错误处理
- §9 测试：`window-chrome.spec.cjs`

对比稿：
- `docs/superpowers/mockups/2026-11-03-folio-polish/img/c9-after-window.png`：红黄绿按钮放进顶栏。
- `docs/superpowers/mockups/2026-11-03-folio-polish/img/c2-after-settings.png`：设置的行：外观、语言、相册库、许可证、版本。

## 范围

- S4 拆成两个 PR：S4a 和 S4b。
  - **S4a（本计划）：** 标题栏、外观同步、`folioDesktop`（`platform`、`info`、`revealLibrary`、`chooseLibrary`、`updateAction`、`setAppearance`、`onState`）、设置里的相册库与版本、窗口记忆。
  - **S4b：** 应用菜单与快捷键表、菜单命令通道（`setContext`、`onCommand`、⌘,）、右键菜单。
- **分支：** `feat/folio-polish-s4a`，工作区 `.worktrees/folio-polish-s4a`。
  - 叠在 `feat/folio-polish-s3`（PR #25）上，因为两者都改 `i18n.js` 和 `style.css`。
  - S3 合并后，PR 目标改为 `main`。

## 开始之前

- **依赖：** `npm ci --include=optional`，再用 `npx --no-install electron --version` 解出 Electron。每次跑 Playwright 前先 `npm run build`；长时间运行的命令用 `caffeinate -di` 包起来。
- **测试夹具：** `e2e/fixtures.cjs` 的 `desktopFixture()`。
  - `fixture.launch()` 返回 `{ desktop, page }`；`desktop.evaluate(({ BrowserWindow, nativeTheme, shell, dialog }) => …)` 可以在主进程里读状态或替换系统调用。
  - `fixture.stop()` 之后可以再 `fixture.launch()`，模拟重启。
  - 桌面设置文件在 `join(fixture.profile, 'desktop.json')`。
  - 夹具关掉了 Playwright 的焦点模拟，所以真实窗口焦点会影响页面；本机有人操作时偶发的失败见 S2、S3 的账本。
- **现有代码（只改动下面列出的地方）：**
  - `desktop/main.cjs`：
    - `settings` 在 `boot()` 里被整体重写为 `{ version: 1, libraryDir, preferredPort }`。新增的 `window`、`appearance` 字段必须保留。
    - `setMenu()` 里的更新菜单项有自己的点击逻辑，要抽成 `runUpdate()` 与设置共用。
    - `chooseAnotherLibrary()` 已经包含「导入中不能换库」的拦截。
    - `openPath()` 打开文件夹。
  - `desktop/settings.cjs`：`validate()` 校验 `version`、`libraryDir`、`preferredPort`；`loadSettings()` 遇到无法解析的 JSON 抛 `SETTINGS_CORRUPT`；`saveSettings()` 会先备份损坏的文件。
  - `desktop/security.cjs`：`isAppURL(target, origin)`。
  - `desktop/pdf-export.cjs` 的 IPC 已经按「`event.sender` 是主窗口、`senderFrame` 是主框架、URL 是 App 源」校验，新通道沿用同样的规则。
- **端到端测试在 Electron 里会把视口改成手机宽度**（320、390px）。真实桌面窗口不会窄于 720px，所以标题栏的留白放在 `@media (min-width: 720px)` 里，不影响这些用例。

## Global Constraints

- **只在桌面 App 里生效：** 浏览器和手机不变，判断依据是页面上有没有 `window.folioDesktop`。
- **macOS 标题栏：**
  - `titleBarStyle: 'hiddenInset'`，红黄绿按钮在 56px 高的顶栏里垂直居中（`trafficLightPosition` 设为 `{ x: 20, y: 20 }`），顶栏左侧留出约 78px。
  - 全屏时去掉这段留白：主进程转发 `enter-full-screen` / `leave-full-screen`。
- **Windows 标题栏：** `titleBarStyle: 'hidden'` 加 `titleBarOverlay`，高度 56。
  - 浅色：底色 `#f7f9fb`，符号色 `#4e5a66`。
  - 深色：底色 `#121417`，符号色 `#a7b0ba`。
  - 顶栏右侧按 `env(titlebar-area-*)` 留出系统按钮的位置。
- **拖动区：** 顶栏，以及看大图和 3D 的顶栏，都可以拖动窗口；其中的按钮、链接、输入框不参与拖动。
- **外观同步：**
  - 页面把外观选择告诉主进程，主进程设置 `nativeTheme.themeSource`（`auto` 对应 `system`）。
  - 同时更新窗口底色和 Windows 标题栏颜色。
  - 外观保存在 `desktop.json`，下次启动时直接按它设置窗口底色，避免启动时闪白。
- **`folioDesktop`：** 用 `Object.freeze` 冻结，只调用固定的通道，参数都在主进程校验；回调只收到状态，不把 IPC 事件对象交给页面。
- **设置里的「相册库」行：**
  - 路径中的主目录缩写成 `~`。Windows 不用 `~` 的写法，保留完整路径。
  - 显示相册数和照片数，取自 `/api/albums`。
  - 按钮：「在 Finder 中显示」（Windows 上为「在资源管理器中显示」）和「更换…」（沿用 `chooseAnotherLibrary`）。
- **设置里的「版本」行：**
  - 显示版本号和更新状态。
  - 按钮文字随状态变化：检查更新 / 下载更新 / 重新启动以安装。
  - macOS 目前没有应用内更新（沿用已隐藏菜单更新入口的决定），不显示按钮。
- **窗口记忆：**
  - `desktop.json` 新增 `window: { x, y, width, height, maximized }`，都是有限整数，宽高不小于 720×480。
  - 移动或缩放后 500ms 防抖保存，关闭和退出前再保存一次；全屏和最小化状态不保存。
  - 启动时，保存的位置与所有显示器工作区的可见交集至少要有 100×56（能抓到顶栏），否则退回默认的 1180×800 居中。
- **设置文件里只有 `window` 或 `appearance` 无效时：** 只丢掉这个字段、用默认值，相册库等其他设置照常保留。整个文件无法解析时，仍按 `SETTINGS_CORRUPT` 原有的方式处理。
- **文案：** 中英文两套都要有（`src/i18n.js`）。

## Review Focus

1. **外接显示器拔掉后启动**：保存的位置在不存在的显示器上，或只露出一小条，窗口应回到主显示器可见的位置。→ Task 1 的 Node 测试与端到端测试（位置设为 -30000）。
2. **`boot()` 重写设置后窗口位置和外观不能丢**，包括换相册库（`chooseAnotherLibrary` 再走一次 `boot()`）之后。→ Task 1、Task 3 都要重启后验证。
3. **最大化后退出，再启动**：仍是最大化，取消最大化后回到之前的大小，而不是全屏大小。→ Task 1 的端到端测试（`getNormalBounds()`）。
4. **页面以外的调用方不能使用 `folioDesktop` 的通道**：子框架、其他窗口、其他源都应该被拒绝。→ Task 2 的 Node 测试（`isAppSender`）。
5. **手机宽度的视口和浏览器访问**：没有 `folioDesktop` 时没有任何桌面样式；窄于 720px 时不留标题栏空白、不产生横向滚动。→ Task 3 的端到端测试，加上全量运行时现有的 320 / 390px 用例。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `desktop/window-state.cjs` | 建 | 窗口位置的校验与恢复（纯函数） |
| `desktop/window-state.test.cjs` | 建 | 上面模块的 Node 测试 |
| `desktop/window-chrome.cjs` | 建 | 各平台的标题栏选项、窗口底色、外观对应的 `themeSource`（纯函数） |
| `desktop/window-chrome.test.cjs` | 建 | 上面模块的 Node 测试 |
| `desktop/desktop-info.cjs` | 建 | 设置里显示的路径（`~` 缩写）与信息对象（纯函数） |
| `desktop/desktop-info.test.cjs` | 建 | 上面模块的 Node 测试 |
| `desktop/settings.cjs` | 改 | 新增可选字段 `window`、`appearance`：读取时宽松（无效就丢掉），保存时严格 |
| `desktop/settings.test.cjs` | 改 | 新字段的保存、读取与丢弃 |
| `desktop/security.cjs` | 改 | `isAppSender(event, window, origin)` |
| `desktop/security.test.cjs` | 改 | 调用方校验 |
| `desktop/preload.cjs` | 改 | `window.folioDesktop` |
| `desktop/main.cjs` | 改 | 窗口位置、标题栏、外观、`folioDesktop` 的处理函数、状态推送 |
| `public/theme-boot.js` | 改 | 首屏前加 `data-desktop` |
| `src/desktop.js` | 建 | 全屏状态与外观同步 |
| `src/main.js` | 改 | 启动时调用 `initDesktop()` |
| `src/settings.js` | 改 | 「相册库」「版本」两行 |
| `src/i18n.js` | 改 | 新文案 |
| `src/style.css` | 改 | 拖动区、标题栏留白、设置行里的按钮组 |
| `e2e/window-chrome.spec.cjs` | 建 | 窗口记忆、标题栏、外观、设置里的桌面行 |
| `README.md` | 改 | 桌面版说明 |

---

### Task 1: 记住窗口的大小和位置

**Files:**
- Create: `desktop/window-state.cjs`
- Create: `desktop/window-state.test.cjs`
- Modify: `desktop/settings.cjs`
- Modify: `desktop/settings.test.cjs`
- Modify: `desktop/main.cjs`
- Create: `e2e/window-chrome.spec.cjs`

**Interfaces:**
- Produces:
  - `DEFAULT = { width: 1180, height: 800 }`，`MIN = { width: 720, height: 480 }`
  - `validWindow(value): boolean`
  - `restoreBounds(saved, displays): { x, y, width, height, maximized } | null`
    - `displays` 是 `screen.getAllDisplays()` 的结果，每项带 `workArea: { x, y, width, height }`。
  - `settings.window`（可选）、`loadSettings()` 丢弃无效的 `window`、`saveSettings()` 拒绝无效的 `window`。
  - 主进程的 `saveSoon()`：把设置排队保存，后面 Task 3 的外观也用它。

- [ ] **Step 1: 写失败的 Node 测试**

`desktop/window-state.test.cjs`：

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEFAULT, MIN, restoreBounds, validWindow } = require('./window-state.cjs');

const main = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const right = { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };

test('a saved window needs whole-number bounds of at least 720 × 480 and a maximized flag', () => {
  assert.equal(validWindow({ x: 10, y: 40, width: 900, height: 600, maximized: false }), true);
  assert.equal(validWindow({ x: -1200, y: 40, width: 720, height: 480, maximized: true }), true);
  for (const bad of [null, {}, { x: 10, y: 40, width: 700, height: 600, maximized: false }, { x: 10, y: 40, width: 900, height: 479, maximized: false },
    { x: 10.5, y: 40, width: 900, height: 600, maximized: false }, { x: 10, y: 40, width: 900, height: 600 }, { x: '10', y: 40, width: 900, height: 600, maximized: false },
    { x: Infinity, y: 40, width: 900, height: 600, maximized: false }]) {
    assert.equal(validWindow(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual([DEFAULT, MIN], [{ width: 1180, height: 800 }, { width: 720, height: 480 }]);
});

test('the saved place comes back while enough of the top bar is on a display', () => {
  const saved = { x: 100, y: 80, width: 900, height: 600, maximized: true };
  assert.deepEqual(restoreBounds(saved, [main]), saved);
  assert.deepEqual(restoreBounds({ ...saved, x: 2000 }, [main, right]), { ...saved, x: 2000 }); // the second display
  // A sliver of 40 px is not enough to grab the window.
  assert.equal(restoreBounds({ ...saved, x: 1440 - 40 }, [main]), null);
});

test('a place on a display that is gone, or nothing saved, gives the default', () => {
  assert.equal(restoreBounds({ x: -30000, y: -30000, width: 900, height: 600, maximized: false }, [main]), null);
  assert.equal(restoreBounds({ x: 2000, y: 100, width: 900, height: 600, maximized: false }, [main]), null); // the right display was unplugged
  assert.equal(restoreBounds(undefined, [main]), null);
  assert.equal(restoreBounds({ x: 0, y: 0, width: 10, height: 10, maximized: false }, [main]), null);
});
```

在 `desktop/settings.test.cjs` 末尾追加：

```js
test('the window place is kept with the settings; an invalid one is dropped without losing the rest', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-settings-window-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'desktop.json');
  const window = { x: 40, y: 60, width: 1000, height: 700, maximized: false };
  await saveSettings(file, { version: 1, libraryDir: dir, window });
  assert.deepEqual((await loadSettings(file)).window, window);
  await writeFile(file, JSON.stringify({ version: 1, libraryDir: dir, window: { x: 1, y: 2, width: 10, height: 10, maximized: false } }));
  const loaded = await loadSettings(file);
  assert.equal(loaded.libraryDir, dir);
  assert.equal(loaded.window, undefined);
  await assert.rejects(saveSettings(file, { version: 1, libraryDir: dir, window: { x: 1, y: 2, width: 10, height: 10, maximized: false } }), { code: 'SETTINGS_CORRUPT' });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test desktop/window-state.test.cjs desktop/settings.test.cjs`
Expected:
- `window-state.test.cjs` 失败：`Cannot find module './window-state.cjs'`。
- 新的设置用例失败：`window` 被保存后读回为 `undefined`，或无效的 `window` 没有被拒绝，取决于当前 `validate` 的行为。

- [ ] **Step 3: 实现 `desktop/window-state.cjs`**

```js
// The window's size and place across launches (polish spec §6.5).
const DEFAULT = { width: 1180, height: 800 };
const MIN = { width: 720, height: 480 };
// Enough of the window must stay on a display to grab its top bar.
const VISIBLE = { width: 100, height: 56 };

function validWindow(value) {
  return Boolean(value) && typeof value === 'object' &&
    ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(value[key])) &&
    value.width >= MIN.width && value.height >= MIN.height && typeof value.maximized === 'boolean';
}

// The saved place while enough of it meets a display's work area; null means the default, centred
// (a monitor may have been unplugged since).
function restoreBounds(saved, displays) {
  if (!validWindow(saved)) return null;
  const shows = ({ workArea: area }) =>
    Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x) >= VISIBLE.width &&
    Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y) >= VISIBLE.height;
  return displays.some(shows) ? { ...saved } : null;
}

module.exports = { DEFAULT, MIN, validWindow, restoreBounds };
```

- [ ] **Step 4: 设置文件接受 `window`**

`desktop/settings.cjs`：

1. 顶部引入：`const { validWindow } = require('./window-state.cjs');`
2. `validate(value)` 的条件里加上（与其他条件用 `||` 并列）：
   ```js
   (value.window !== undefined && !validWindow(value.window)) ||
   ```
3. `loadSettings()` 改成先丢掉无效的可选字段，再校验：
   ```js
   // An invalid window place is dropped, not the whole file: the library choice must survive it.
   function lenient(value) {
     if (value && typeof value === 'object' && value.window !== undefined && !validWindow(value.window)) delete value.window;
     return value;
   }

   async function loadSettings(file) {
     try { return validate(lenient(JSON.parse(await readFile(file, 'utf8')))); }
   ```
   其余部分不变。

- [ ] **Step 5: 运行 Node 测试，确认通过**

Run: `node --test desktop/window-state.test.cjs desktop/settings.test.cjs`
Expected: 全部通过。

- [ ] **Step 6: 写失败的端到端测试**

`e2e/window-chrome.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');

const mainWindow = (desktop, read) => desktop.evaluate(({ BrowserWindow }, read) => {
  const window = BrowserWindow.getAllWindows()[0];
  return read === 'bounds' ? window.getBounds() : read === 'normal' ? window.getNormalBounds() : window.isMaximized();
}, read);

test('the window comes back where it was left, maximized too, and to the default when that place is gone', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  const file = join(fixture.profile, 'desktop.json');
  const saved = async () => JSON.parse(await readFile(file, 'utf8')).window;
  try {
    let { desktop } = await fixture.launch();
    const place = { x: 60, y: 80, width: 800, height: 560 };
    await desktop.evaluate(({ BrowserWindow }, place) => BrowserWindow.getAllWindows()[0].setBounds(place), place);
    await expect.poll(saved).toEqual({ ...place, maximized: false });
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    expect(await mainWindow(desktop, 'bounds')).toEqual(place);
    // Maximized at quit: maximized again, with the earlier size underneath.
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await expect.poll(async () => (await saved()).maximized).toBe(true);
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    await expect.poll(() => mainWindow(desktop, 'maximized')).toBe(true);
    expect(await mainWindow(desktop, 'normal')).toEqual(place);
    await fixture.stop();
    // A place on a display that is no longer there: on screen again.
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), window: { x: -30000, y: -30000, width: 900, height: 600, maximized: false } }));
    ({ desktop } = await fixture.launch());
    const shown = await desktop.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      return bounds.x + bounds.width > area.x && bounds.x < area.x + area.width && bounds.y + bounds.height > area.y && bounds.y < area.y + area.height;
    });
    expect(shown).toBe(true);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/window-chrome.spec.cjs`
Expected: FAIL，`desktop.json` 里没有 `window`（`expect.poll(saved)` 得到 `undefined`）。

- [ ] **Step 8: 主进程接上**

`desktop/main.cjs`：

1. 第一行的 `require('electron')` 加上 `screen`。在 `const { createPdfExporter } = …` 后加：
   ```js
   const { DEFAULT, MIN, restoreBounds, validWindow } = require('./window-state.cjs');
   ```
2. 在 `let metadata;` 后加：
   ```js
   // Settings are written one at a time; the window place and the appearance share this queue.
   let saving = Promise.resolve();
   let flushWindow = async () => {};
   function saveSoon() {
     saving = saving.then(() => saveSettings(settingsFile, settings)).catch((error) => log(`SETTINGS_SAVE ${error.message}`));
     return saving;
   }
   ```
3. `lifecycle` 的 `stop()` 里，在 `await backend?.stop();` 之前加 `await flushWindow();`。
4. `boot()` 里的
   ```js
   settings = { version: 1, libraryDir: dir, preferredPort: Number(new URL(origin).port || 80) };
   ```
   改成保留其他字段：
   ```js
   settings = { ...settings, version: 1, libraryDir: dir, preferredPort: Number(new URL(origin).port || 80) };
   ```
5. 创建窗口处，把 `width: 1180, height: 800, minWidth: 720, minHeight: 480,` 换成：
   ```js
   ...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : DEFAULT),
   minWidth: MIN.width, minHeight: MIN.height,
   ```
   并在 `window = new BrowserWindow({` 前一行加：
   ```js
   const place = restoreBounds(settings.window, screen.getAllDisplays());
   ```
6. 在 `window.on('close', lifecycle.onClose);` 前加：
   ```js
   // Size and place are kept for the next launch (polish spec §6.5); full screen is not a place.
   let rememberTimer;
   function rememberWindow() {
     clearTimeout(rememberTimer);
     if (window.isDestroyed() || window.isFullScreen() || window.isMinimized()) return Promise.resolve();
     const { x, y, width, height } = window.getNormalBounds();
     const next = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), maximized: window.isMaximized() };
     if (!validWindow(next) || JSON.stringify(next) === JSON.stringify(settings.window)) return Promise.resolve();
     settings = { ...settings, window: next };
     return saveSoon();
   }
   const rememberSoon = () => { clearTimeout(rememberTimer); rememberTimer = setTimeout(rememberWindow, 500); };
   for (const event of ['move', 'resize', 'maximize', 'unmaximize']) window.on(event, rememberSoon);
   window.on('close', () => { void rememberWindow(); });
   flushWindow = async () => { await rememberWindow(); await saving; };
   ```
7. `window.once('ready-to-show', showWindow);` 改成（最大化放在显示之前，避免先闪一个小窗口）：
   ```js
   window.once('ready-to-show', () => {
     if (place?.maximized) window.maximize();
     showWindow();
   });
   ```

- [ ] **Step 9: 运行，确认通过**

Run: `npm test && npm run build && caffeinate -di npx playwright test e2e/window-chrome.spec.cjs e2e/lifecycle.spec.cjs e2e/library-switch.spec.cjs e2e/desktop.spec.cjs`
Expected: 全部通过。换库和退出流程不受影响。

- [ ] **Step 10: 提交**

```bash
git add desktop/window-state.cjs desktop/window-state.test.cjs desktop/settings.cjs desktop/settings.test.cjs desktop/main.cjs e2e/window-chrome.spec.cjs
git commit -m "feat: the desktop window remembers its size and place"
```

---

### Task 2: `folioDesktop` 与设置里的相册库、版本

**Files:**
- Create: `desktop/desktop-info.cjs`
- Create: `desktop/desktop-info.test.cjs`
- Modify: `desktop/security.cjs`
- Modify: `desktop/security.test.cjs`
- Modify: `desktop/preload.cjs`
- Modify: `desktop/main.cjs`
- Modify: `src/settings.js`
- Modify: `src/i18n.js`
- Modify: `src/style.css`
- Test: `e2e/window-chrome.spec.cjs`

**Interfaces:**
- Consumes: Task 1 的 `saveSoon()`（这里不用）。
- Produces:
  - `displayPath(path, home, platform): string`：非 Windows 把主目录缩写成 `~`。
  - `desktopInfo({ version, libraryDir, home, platform, update }) → { version, library, update }`
  - `isAppSender(event, window, origin): boolean`
  - `window.folioDesktop`（冻结）：
    - `platform: 'mac' | 'win' | 'linux'`
    - `info(): Promise<{ version, library, update }>`
    - `revealLibrary(): Promise<void>`
    - `chooseLibrary(): Promise<void>`
    - `updateAction(): Promise<void>`
    - `onState(callback): () => void`：`callback` 收到 `{ update }`（Task 3 再加 `{ fullscreen }`）。
  - 主进程的 `runUpdate()`：菜单和设置共用。
  - 主进程的 `sendState(state)`：发给页面的 `folio:desktop:state`。

- [ ] **Step 1: 写失败的 Node 测试**

`desktop/desktop-info.test.cjs`：

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { desktopInfo, displayPath } = require('./desktop-info.cjs');

test('the library path shows the home folder as ~, except on Windows where ~ is not a convention', () => {
  assert.equal(displayPath('/Users/mi/Pictures/相册库', '/Users/mi', 'darwin'), '~/Pictures/相册库');
  assert.equal(displayPath('/Users/mi', '/Users/mi', 'darwin'), '~');
  assert.equal(displayPath('/Users/mia/Pictures', '/Users/mi', 'darwin'), '/Users/mia/Pictures'); // only whole folder names
  assert.equal(displayPath('/Volumes/Photos/相册库', '/Users/mi', 'darwin'), '/Volumes/Photos/相册库');
  assert.equal(displayPath('C:\\Users\\mi\\Pictures\\相册库', 'C:\\Users\\mi', 'win32'), 'C:\\Users\\mi\\Pictures\\相册库');
});

test('the settings info carries the version, the library as shown and the update state', () => {
  assert.deepEqual(
    desktopInfo({ version: '0.1.0', libraryDir: '/home/mi/相册库', home: '/home/mi', platform: 'linux', update: { phase: 'idle' } }),
    { version: '0.1.0', library: '~/相册库', update: { phase: 'idle' } },
  );
});
```

在 `desktop/security.test.cjs` 末尾追加（文件顶部已引入 `assert` 和 `test`；从 `./security.cjs` 再取 `isAppSender`）：

```js
test('desktop calls are taken only from the app page in the main window', () => {
  const { isAppSender } = require('./security.cjs');
  const origin = 'http://localhost:5180';
  const mainFrame = { url: `${origin}/#/albums` };
  const webContents = { mainFrame };
  const window = { isDestroyed: () => false, webContents };
  assert.equal(isAppSender({ sender: webContents, senderFrame: mainFrame }, window, origin), true);
  assert.equal(isAppSender({ sender: webContents, senderFrame: { url: `${origin}/` } }, window, origin), false); // a sub-frame
  assert.equal(isAppSender({ sender: {}, senderFrame: mainFrame }, window, origin), false); // another window
  assert.equal(isAppSender({ sender: webContents, senderFrame: mainFrame }, window, 'http://localhost:5181'), false);
  assert.equal(isAppSender({ sender: webContents, senderFrame: mainFrame }, { ...window, isDestroyed: () => true }, origin), false);
  assert.equal(isAppSender({ sender: webContents, senderFrame: mainFrame }, null, origin), false);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test desktop/desktop-info.test.cjs desktop/security.test.cjs`
Expected: FAIL，找不到 `desktop-info.cjs`；`isAppSender is not a function`。

- [ ] **Step 3: 实现两个纯函数**

`desktop/desktop-info.cjs`：

```js
// What Settings shows about the desktop app (polish spec §6.4).

// The library path as people know it: the home folder written as ~, a Unix habit Windows does not share.
function displayPath(path, home, platform) {
  if (platform === 'win32' || !home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function desktopInfo({ version, libraryDir, home, platform, update }) {
  return { version, library: displayPath(libraryDir, home, platform), update };
}

module.exports = { desktopInfo, displayPath };
```

`desktop/security.cjs` 在 `module.exports` 前加，并把它加进导出：

```js
// Only the app page in the main window may use the desktop channels (polish spec §6.4).
function isAppSender(event, window, origin) {
  return Boolean(window) && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && isAppURL(event.senderFrame?.url, origin);
}
```

- [ ] **Step 4: 运行 Node 测试，确认通过**

Run: `node --test desktop/desktop-info.test.cjs desktop/security.test.cjs`
Expected: 全部通过。

- [ ] **Step 5: 写失败的端到端测试**

`e2e/window-chrome.spec.cjs` 顶部加 `const { openSettings, seed } = require('./ui-helpers.cjs');`，末尾追加：

```js
test('Settings shows the library and the version in the desktop app, and its buttons reach the app', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await seed(page, origin, 'One', 2);
    await page.reload();
    expect(await page.evaluate(() => Object.isFrozen(window.folioDesktop))).toBe(true);
    await desktop.evaluate(({ shell, dialog }) => {
      shell.openPath = async (path) => { global.folioTestOpened = path; return ''; };
      dialog.showOpenDialog = async () => { global.folioTestChose = true; return { canceled: true, filePaths: [] }; };
      dialog.showMessageBox = async (...args) => { global.folioTestUpdateDialog = args.at(-1); return { response: 0 }; };
    });
    const settings = await openSettings(page);
    const rows = await settings.locator('.set-row .set-k').allTextContents();
    expect(rows.filter((text) => ['Library', 'License', 'Version'].includes(text))).toEqual(['Library', 'License', 'Version']);
    const library = settings.locator('.set-library');
    await expect(library.locator('.set-library-path')).toHaveText(/相册库 with spaces$/);
    await expect(library.locator('.set-library-count')).toHaveText('1 album · 2 photos');
    await expect(library.locator('[data-act=reveal-library]')).toHaveText(process.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder');
    await library.locator('[data-act=reveal-library]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestOpened || '')).toMatch(/相册库 with spaces$/);
    await library.locator('[data-act=choose-library]').click();
    await expect.poll(() => desktop.evaluate(() => global.folioTestChose === true)).toBe(true);
    const { version } = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf8'));
    await expect(settings.locator('.set-version-name')).toHaveText(`Folio ${version}`);
    const update = settings.locator('[data-act=update]');
    if (process.platform === 'darwin') await expect(update).toBeHidden();
    else {
      await expect(update).toHaveText('Check for Updates');
      await update.click();
      await expect.poll(() => desktop.evaluate(() => global.folioTestUpdateDialog?.message || '')).toBe('Online updates are disabled in development');
    }
  } finally { await fixture.close(); }
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/window-chrome.spec.cjs -g "Settings shows the library"`
Expected: FAIL，`Object.isFrozen(window.folioDesktop)` 为 `false`（`folioDesktop` 还不存在）。

- [ ] **Step 7: preload 暴露 `folioDesktop`**

`desktop/preload.cjs` 末尾追加：

```js
// The desktop app's own controls (polish spec §6.4): fixed channels, every argument checked in the
// main process; callbacks get the state alone, never the IPC event.
contextBridge.exposeInMainWorld('folioDesktop', Object.freeze({
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux',
  info: () => ipcRenderer.invoke('folio:desktop:info'),
  revealLibrary: () => ipcRenderer.invoke('folio:desktop:reveal-library'),
  chooseLibrary: () => ipcRenderer.invoke('folio:desktop:choose-library'),
  updateAction: () => ipcRenderer.invoke('folio:desktop:update'),
  onState(callback) {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('folio:desktop:state', listener);
    return () => ipcRenderer.removeListener('folio:desktop:state', listener);
  },
}));
```

- [ ] **Step 8: 主进程的处理函数**

`desktop/main.cjs`：

1. 引入：`const { isAppURL, isAllowedPermission, isOriginalURL, isAppSender } = require('./security.cjs');`，以及 `const { desktopInfo } = require('./desktop-info.cjs');`。
2. 把 `updateMenu()` 里 `click` 的逻辑抽出来，放在 `function updateMenu()` 前：
   ```js
   // The update menu item and Settings' Version row do the same: check, download or install.
   function runUpdate() {
     const state = updates?.status() || { phase: 'idle' };
     const download = state.phase === 'available' || (state.phase === 'error' && state.retry === 'download');
     const run = state.phase === 'downloaded' ? updates.install() : download ? updates.download() : updates.check();
     return run.catch((error) => { void log(error.message); });
   }
   ```
   菜单项的 `click` 改成 `click: () => { void runUpdate(); },`。
3. 在 `createUpdateController({ … onChange(status) { … } })` 的 `onChange` 里，`setMenu();` 后加 `sendState({ update: status });`，并在 `updates = createUpdateController(` 前加：
   ```js
   function sendState(state) {
     if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('folio:desktop:state', state);
   }
   ```
4. 在 `function setMenu()` 前加处理函数：
   ```js
   // folioDesktop (polish spec §6.4): only the app page in the main window may call these.
   function handle(channel, run) {
     ipcMain.handle(channel, (event, ...args) => {
       if (!isAppSender(event, window, origin)) throw new Error('Denied desktop sender');
       return run(...args);
     });
   }
   handle('folio:desktop:info', () => desktopInfo({
     version: metadata.version, libraryDir: settings.libraryDir, home: app.getPath('home'), platform: process.platform, update: updates.status(),
   }));
   handle('folio:desktop:reveal-library', () => { openPath(settings.libraryDir); });
   handle('folio:desktop:choose-library', () => chooseAnotherLibrary());
   handle('folio:desktop:update', () => runUpdate());
   ```

- [ ] **Step 9: 设置里的两行**

`src/i18n.js` 中文部分，在 `'license-open'` 一行后加（若该键名不同，加在许可证相关文案之后）：

```js
    library: '相册库',
    'library-reveal': '在 Finder 中显示',
    'library-reveal-win': '在资源管理器中显示',
    'library-choose': '更换…',
    version: '版本',
    'update-check': '检查更新',
    'update-download': '下载更新',
    'update-install': '重新启动以安装',
    'update-checking': '正在检查更新…',
    'update-available': ({ version }) => `有新版本 ${version}`,
    'update-downloading': ({ percent }) => `正在下载 ${percent}%`,
    'update-ready': ({ version }) => `${version} 已下载`,
    'update-failed': '更新没有完成，可以重试',
```

英文部分对应位置：

```js
    library: 'Library',
    'library-reveal': 'Show in Finder',
    'library-reveal-win': 'Show in Explorer',
    'library-choose': 'Change…',
    version: 'Version',
    'update-check': 'Check for Updates',
    'update-download': 'Download Update',
    'update-install': 'Restart to Install',
    'update-checking': 'Checking for updates…',
    'update-available': ({ version }) => `Version ${version} is available`,
    'update-downloading': ({ percent }) => `Downloading ${percent}%`,
    'update-ready': ({ version }) => `${version} is ready to install`,
    'update-failed': 'The update did not finish. Try again.',
```

`src/settings.js`：

1. 引入 `import { api } from './api.js';`；在 `const busy = …` 后加 `const desktop = window.folioDesktop;`。
2. 模板里：
   - 在语言行之后、许可证行之前加相册库行：
     ```js
             ${desktop ? `
             <div class="set-row set-library"><span class="set-k">${t('library')}</span><span class="set-v"><b class="set-library-path"></b><small class="set-library-count"></small></span>
               <span class="set-acts"><button class="btn" type="button" data-act="reveal-library">${t(desktop.platform === 'win' ? 'library-reveal-win' : 'library-reveal')}</button><button class="btn" type="button" data-act="choose-library">${t('library-choose')}</button></span></div>` : ''}
     ```
   - 在许可证行之后、`dlg-acts` 之前加版本行：
     ```js
             ${desktop ? `
             <div class="set-row set-version"><span class="set-k">${t('version')}</span><span class="set-v"><b class="set-version-name"></b><small class="set-update"></small></span>
               <button class="btn" type="button" data-act="update" hidden></button></div>` : ''}
     ```
3. 在 `function sync()` 前加：
   ```js
   // The desktop rows (polish spec §6.4): the library as shown, its counts, the version and the update.
   let info = null;
   let albums = null;
   function updateRow(update) {
     const button = d.querySelector('[data-act=update]');
     const note = d.querySelector('.set-update');
     if (!button) return;
     const { phase, version, percent, retry, terminal } = update ?? {};
     note.textContent = phase === 'checking' ? t('update-checking') : phase === 'available' ? t('update-available', { version })
       : phase === 'downloading' ? t('update-downloading', { percent: Math.floor(percent || 0) }) : phase === 'downloaded' ? t('update-ready', { version })
         : phase === 'error' ? t('update-failed') : '';
     const label = phase === 'downloaded' ? 'update-install' : phase === 'available' || (phase === 'error' && retry === 'download') ? 'update-download' : 'update-check';
     button.textContent = t(label);
     // macOS has no in-app updates for now; its menu entry is hidden too.
     button.hidden = !phase || phase === 'manual';
     button.disabled = ['checking', 'downloading', 'installing'].includes(phase) || Boolean(terminal);
   }
   function desktopRows() {
     if (!desktop) return;
     if (info) {
       d.querySelector('.set-library-path').textContent = info.library;
       d.querySelector('.set-version-name').textContent = `Folio ${info.version}`;
       updateRow(info.update);
     }
     if (albums) {
       d.querySelector('.set-library-count').textContent = t('stats', { a: albums.length,
         p: albums.reduce((n, a) => n + (a.photoCount ?? a.count - (a.videoCount ?? 0)), 0),
         v: albums.reduce((n, a) => n + (a.videoCount ?? 0), 0) });
     }
   }
   ```
   在 `render()` 末尾的 `sync();` 后加 `desktopRows();`。
4. 点击处理里，在许可证分支之前加：
   ```js
   const act = e.target.closest('[data-act]')?.dataset.act;
   if (act === 'reveal-library') { void desktop.revealLibrary(); return; }
   if (act === 'choose-library') { void desktop.chooseLibrary(); return; }
   if (act === 'update') { void desktop.updateAction(); return; }
   ```
5. 在 `document.body.append(d);` 前加：
   ```js
   const stopState = desktop?.onState((state) => {
     if (state?.update && info) { info = { ...info, update: state.update }; updateRow(state.update); }
   });
   if (desktop) {
     desktop.info().then((value) => { info = value; desktopRows(); }).catch(() => {});
     api.albums().then((value) => { albums = value; desktopRows(); }).catch(() => {});
   }
   ```
   在 `close` 监听里加 `stopState?.();`。

`src/style.css` 在设置行样式（`.set-row`）附近加：

```css
.set-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 10: 运行，确认通过**

Run: `npm test && npm run build && caffeinate -di npx playwright test e2e/window-chrome.spec.cjs e2e/settings.spec.cjs e2e/updates.spec.cjs e2e/library-switch.spec.cjs`
Expected: 全部通过。如果 `settings.spec.cjs` 的窄屏用例（320px）因为新增两行超出对话框，就让按钮组换行，不要改断言。

- [ ] **Step 11: 提交**

```bash
git add desktop/desktop-info.cjs desktop/desktop-info.test.cjs desktop/security.cjs desktop/security.test.cjs desktop/preload.cjs desktop/main.cjs src/settings.js src/i18n.js src/style.css e2e/window-chrome.spec.cjs
git commit -m "feat: Settings shows the library and version in the desktop app"
```

---

### Task 3: 标题栏合一与外观同步

**Files:**
- Create: `desktop/window-chrome.cjs`
- Create: `desktop/window-chrome.test.cjs`
- Modify: `desktop/settings.cjs`
- Modify: `desktop/settings.test.cjs`
- Modify: `desktop/preload.cjs`
- Modify: `desktop/main.cjs`
- Modify: `public/theme-boot.js`
- Create: `src/desktop.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Test: `e2e/window-chrome.spec.cjs`

**Interfaces:**
- Consumes:
  - Task 1 的 `saveSoon()`
  - Task 2 的 `handle()`、`sendState()`、`folioDesktop`
- Produces:
  - `windowChrome(platform, dark)`：BrowserWindow 的标题栏选项。
  - `background(dark)`：窗口底色。
  - `OVERLAY`：Windows 标题栏颜色。
  - `BAR = 56`
  - `themeSource(mode)`：`'light' | 'dark' | 'system'`。
  - `settings.appearance`（可选，`'light' | 'dark' | 'auto'`）。
  - `folioDesktop.setAppearance(mode)`。
  - 状态 `{ fullscreen: boolean }`。
  - `html[data-desktop="mac|win"]`、`html[data-fullscreen]`。

- [ ] **Step 1: 写失败的 Node 测试**

`desktop/window-chrome.test.cjs`：

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BAR, background, themeSource, windowChrome } = require('./window-chrome.cjs');

test('the title bar merges into the 56 px top bar: inset traffic lights on macOS, an overlay on Windows', () => {
  assert.deepEqual(windowChrome('darwin', false), { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } });
  assert.deepEqual(windowChrome('win32', false), { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f9fb', symbolColor: '#4e5a66', height: BAR } });
  assert.deepEqual(windowChrome('win32', true), { titleBarStyle: 'hidden', titleBarOverlay: { color: '#121417', symbolColor: '#a7b0ba', height: BAR } });
  assert.deepEqual(windowChrome('linux', true), {});
  assert.equal(BAR, 56);
});

test('the window colour and the native theme follow the appearance', () => {
  assert.deepEqual([background(false), background(true)], ['#f7f9fb', '#121417']);
  assert.deepEqual(['light', 'dark', 'auto', undefined, 'neon'].map(themeSource), ['light', 'dark', 'system', 'system', 'system']);
});
```

在 `desktop/settings.test.cjs` 末尾追加：

```js
test('the appearance is kept with the settings; an unknown one is dropped', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-settings-appearance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'desktop.json');
  await saveSettings(file, { version: 1, libraryDir: dir, appearance: 'dark' });
  assert.equal((await loadSettings(file)).appearance, 'dark');
  await writeFile(file, JSON.stringify({ version: 1, libraryDir: dir, appearance: 'neon' }));
  const loaded = await loadSettings(file);
  assert.equal(loaded.appearance, undefined);
  assert.equal(loaded.libraryDir, dir);
  await assert.rejects(saveSettings(file, { version: 1, libraryDir: dir, appearance: 'neon' }), { code: 'SETTINGS_CORRUPT' });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test desktop/window-chrome.test.cjs desktop/settings.test.cjs`
Expected: FAIL，找不到 `window-chrome.cjs`；`appearance` 读回为 `undefined`，或无效值没有被拒绝。

- [ ] **Step 3: 实现**

`desktop/window-chrome.cjs`：

```js
// The window's own title bar merges into Folio's 56 px top bar (polish spec §6.1).
const BAR = 56;
const OVERLAY = { light: { color: '#f7f9fb', symbolColor: '#4e5a66' }, dark: { color: '#121417', symbolColor: '#a7b0ba' } };
const BACKGROUND = { light: '#f7f9fb', dark: '#121417' };

function windowChrome(platform, dark) {
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } };
  if (platform === 'win32') return { titleBarStyle: 'hidden', titleBarOverlay: { ...OVERLAY[dark ? 'dark' : 'light'], height: BAR } };
  return {};
}

const background = (dark) => BACKGROUND[dark ? 'dark' : 'light'];
// Folio's "auto" is the system's choice.
const themeSource = (mode) => (mode === 'light' || mode === 'dark' ? mode : 'system');

module.exports = { BAR, OVERLAY, background, themeSource, windowChrome };
```

`desktop/settings.cjs`：
- `validate()` 的条件里再加 `(value.appearance !== undefined && !['light', 'dark', 'auto'].includes(value.appearance)) ||`。
- `lenient()` 里再加一行：
  ```js
  if (value && typeof value === 'object' && value.appearance !== undefined && !['light', 'dark', 'auto'].includes(value.appearance)) delete value.appearance;
  ```

- [ ] **Step 4: 运行 Node 测试，确认通过**

Run: `node --test desktop/window-chrome.test.cjs desktop/settings.test.cjs`
Expected: 全部通过。

- [ ] **Step 5: 写失败的端到端测试**

`e2e/window-chrome.spec.cjs` 末尾追加：

```js
const appRegion = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const style = getComputedStyle(el);
  return style.getPropertyValue('-webkit-app-region') || style.getPropertyValue('app-region');
});

test('the top bar is the title bar in the desktop app, and full screen closes the traffic-light gap', async () => {
  const platform = { darwin: 'mac', win32: 'win' }[process.platform];
  test.skip(!platform, 'Linux keeps the system title bar');
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { desktop, page } = await fixture.launch();
    await expect(page.locator('html')).toHaveAttribute('data-desktop', platform);
    expect(await appRegion(page, '.nav')).toBe('drag');
    expect(await appRegion(page, '.nav .logo')).toBe('no-drag');
    expect(await appRegion(page, '.nav [data-act=settings]')).toBe('no-drag');
    const left = () => page.locator('.nav').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    if (platform === 'mac') {
      expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition())).toEqual({ x: 20, y: 20 });
      expect(await left()).toBeGreaterThanOrEqual(78);
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', '', { timeout: 10_000 });
      expect(await left()).toBeLessThan(78);
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
      await expect(page.locator('html')).not.toHaveAttribute('data-fullscreen', '', { timeout: 10_000 });
    } else {
      // The system buttons sit over the right end of the bar.
      expect(await page.locator('.nav').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight))).toBeGreaterThan(100);
    }
    // A phone-width view keeps the page as it was: no gap, no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await left()).toBeLessThan(78);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await fixture.close(); }
});

test('the appearance chosen in Settings sets the native theme and the window colour, also on the next launch', async () => {
  const fixture = await desktopFixture();
  try {
    let { desktop, page } = await fixture.launch();
    await (await openSettings(page)).locator('[data-theme-mode=dark]').click();
    await expect.poll(() => desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await fixture.stop();
    ({ desktop, page } = await fixture.launch());
    expect((await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())).toLowerCase()).toBe('#121417');
    expect(await desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await (await openSettings(page)).locator('[data-theme-mode=auto]').click();
    await expect.poll(() => desktop.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
  } finally { await fixture.close(); }
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/window-chrome.spec.cjs -g "title bar|appearance chosen"`
Expected:
- 第一个用例在 macOS、Windows 上失败：没有 `data-desktop`。
- 第二个用例失败：`themeSource` 仍为 `system`。

- [ ] **Step 7: 主进程的标题栏与外观**

`desktop/main.cjs`：

1. 第一行的 `require('electron')` 加上 `nativeTheme`；引入：
   ```js
   const { BAR, OVERLAY, background, themeSource, windowChrome } = require('./window-chrome.cjs');
   ```
2. 在 `const place = restoreBounds(…)` 前加：
   ```js
   // The saved appearance colours the window before the page paints (polish spec §6.1).
   nativeTheme.themeSource = themeSource(settings.appearance);
   const dark = nativeTheme.shouldUseDarkColors;
   ```
   `BrowserWindow` 的选项里，把 `backgroundColor: '#f7f9fb'` 换成 `backgroundColor: background(dark), ...windowChrome(process.platform, dark),`。
3. 在 `handle('folio:desktop:update', …)` 后加：
   ```js
   // The page's appearance also sets native dialogs and menus, the window colour and the Windows title bar.
   function applyChrome() {
     if (window.isDestroyed()) return;
     const darkNow = nativeTheme.shouldUseDarkColors;
     window.setBackgroundColor(background(darkNow));
     if (process.platform === 'win32') window.setTitleBarOverlay({ ...OVERLAY[darkNow ? 'dark' : 'light'], height: BAR });
   }
   nativeTheme.on('updated', applyChrome);
   handle('folio:desktop:appearance', (mode) => {
     if (!['light', 'dark', 'auto'].includes(mode)) throw new Error('Invalid appearance');
     nativeTheme.themeSource = themeSource(mode);
     applyChrome();
     if (settings.appearance !== mode) {
       settings = { ...settings, appearance: mode };
       void saveSoon();
     }
   });
   window.on('enter-full-screen', () => sendState({ fullscreen: true }));
   window.on('leave-full-screen', () => sendState({ fullscreen: false }));
   ```

`desktop/preload.cjs` 的 `folioDesktop` 里，在 `updateAction` 后加：
```js
  setAppearance: (mode) => ipcRenderer.invoke('folio:desktop:appearance', mode),
```

- [ ] **Step 8: 页面接上**

`public/theme-boot.js` 末尾追加：

```js
// In the desktop app the top bar is the window's title bar (polish spec §6.1); mark it before painting.
try {
  const platform = window.folioDesktop?.platform;
  if (platform === 'mac' || platform === 'win') document.documentElement.dataset.desktop = platform;
} catch {}
```

新建 `src/desktop.js`：

```js
import { onThemeChange, theme } from './theme.js';

// The desktop app's window (polish spec §6.1): full screen hides the traffic lights, so their gap
// closes; the appearance chosen here also colours the window, its title bar and native dialogs.
export function initDesktop(desktop = window.folioDesktop) {
  if (!desktop) return;
  desktop.onState((state) => {
    if (typeof state?.fullscreen === 'boolean') document.documentElement.toggleAttribute('data-fullscreen', state.fullscreen);
  });
  const send = () => { desktop.setAppearance(theme()).catch(() => {}); };
  send();
  onThemeChange(send);
}
```

`src/main.js`：引入 `import { initDesktop } from './desktop.js';`，在 `lang();` 一行后调用 `initDesktop();`。

`src/style.css` 在 `.nav { … }` 规则后加：

```css
/* The desktop app (polish spec §6.1): the top bars are the window's title bar. Real windows are at
   least 720 px wide; narrower views are phone emulation and keep the page as it is. */
@media (min-width: 720px) {
  [data-desktop] :is(.nav, .lb-bar, .ab-bar) {
    -webkit-app-region: drag;
  }

  [data-desktop] :is(.nav, .lb-bar, .ab-bar) :is(a, button, input, select, label, [role='button'], [role='menu']) {
    -webkit-app-region: no-drag;
  }

  /* 78 px for the traffic lights, then the bar's own space. */
  [data-desktop='mac']:not([data-fullscreen]) :is(.nav, .lb-bar, .ab-bar) {
    padding-left: 96px;
  }

  /* The minimize, maximize and close buttons sit over the right end. */
  [data-desktop='win'] :is(.nav, .lb-bar, .ab-bar) {
    padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 24px);
  }
}
```

- [ ] **Step 9: 运行，确认通过**

Run: `npm test && npm run build && caffeinate -di npx playwright test e2e/window-chrome.spec.cjs e2e/theme.spec.cjs e2e/settings.spec.cjs e2e/lightbox-v2.spec.cjs e2e/book-pages.spec.cjs e2e/album-polish.spec.cjs`
Expected: 全部通过。如果看大图或 3D 的用例断言了顶栏按钮的确切位置，在账本里写一条 Ruling，按新的留白更新断言。

- [ ] **Step 10: 提交**

```bash
git add desktop/window-chrome.cjs desktop/window-chrome.test.cjs desktop/settings.cjs desktop/settings.test.cjs desktop/preload.cjs desktop/main.cjs public/theme-boot.js src/desktop.js src/main.js src/style.css e2e/window-chrome.spec.cjs
git commit -m "feat: one bar for the title and the app; the appearance reaches the window"
```

---

### Task 4: 文档、全量验证与交付

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

在「## 桌面内测开发与分发」第一段之后加一段：

```markdown
桌面版的系统标题栏与 Folio 顶栏合成一层：macOS 的红黄绿按钮、Windows 的最小化 / 最大化 / 关闭按钮都在顶栏里，顶栏空白处可以拖动窗口，看大图和 3D 翻阅时也一样。外观（浅色 / 深色 / 自动）同时作用于窗口、标题栏和系统对话框。「设置」里能看到相册库位置和照片数（可在 Finder / 资源管理器中显示，或更换），以及版本和更新状态。窗口会记住大小、位置和是否最大化；上次所在的显示器不在时回到主显示器。
```

- [ ] **Step 2: 全量测试**

Run: `caffeinate -di bash -o pipefail -c 'npm test && npm run build && npm run test:desktop'`
Expected:
- Node 测试比 S3 多 10 个，全部通过。
- Electron 端到端比 S3 多 4 个，全部通过（Linux 上标题栏用例跳过）。

- [ ] **Step 3: 视觉对照**

- 截取真实 macOS 窗口，与 `c9-after-window.png` 对照：红黄绿按钮在 56px 顶栏内垂直居中，Logo 在按钮右侧。
  - 截图方式：主进程里用 `BrowserWindow.capturePage()` 只能截到页面，红黄绿按钮要用 `screencapture -l <窗口号>` 截整个窗口。
  - 截不了时，在账本里记录，并以 `getWindowButtonPosition()` 断言为准。
- 中文浅色、英文深色各截一张设置对话框，与 `c2-after-settings.png` 对照。
- Windows 标题栏颜色只能在 Windows 上目测，交付说明里注明。

- [ ] **Step 4: 整分支评审与交付**

- 用 `review-package` 生成评审包，`MERGE_BASE` = `feat/folio-polish-s3` 的末尾提交。
- 派一个全新的评审代理，交给它 Review Focus 原文和账本里的 Ruling 行。
- Critical 和 Important 级别的问题一轮修完，每个修复都先写出失败的测试。
- 推送，开 PR：
  - S3 已合并时，目标分支是 `main`。
  - S3 未合并时，目标分支是 `feat/folio-polish-s3`，并在描述里注明叠在 #25 上。
- 盯 CI。
