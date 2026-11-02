# Folio v2 · S6 3D 增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 翻阅加上自动翻阅（▶ / ⏸ / 慢·中·快 / ✕）、扉页、照片备注图注和手机竖屏单页模式；顶栏「✕ 返回」带文字。

**Architecture:** 自动翻阅的计时放在新模块 `src/flip-player.js`（不碰 DOM，只调 `step()` 与 `onState()`），`src/viewer.js` 负责按钮、空格键、进度线和控件淡出。扉页是贴在封面内侧的一张透明画布贴图（`src/book/title-page.js` 生成文字与贴图，`binder.js` 挂到封面上）。图注画在页面贴图里（`textures.js`），有备注的照片在原格子里缩小、下面留一行字，分页算法不变。竖屏单页由 `book.js` 的 `single` 状态实现：相机只框住一页并在左右页之间平移，翻页按「页」计。

**Tech Stack:** 原生 JS（ES modules）+ Vite 8、three.js、Electron 45、Playwright 1.64（Electron 端到端）、Node 24 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-02-folio-v2-design.md`（本计划实现 §2 中的 S6 与 §8）；界面稿 `docs/superpowers/mockups/2026-11-02-folio-v2/design-3-book.html`。基于 S1（分支 `docs/folio-v2-design`）之上，在分支 `feat/folio-v2-s6-book` 上实现。

## Global Constraints

- 不新增 npm 依赖。
- 书本身的纸、环、翻页手感不变：`book.js` 的 `step()` 弹簧参数、`layout.js` 的分页算法不改。
- 每条新界面文字都要在 `src/i18n.js` 的 `zh` 和 `en` 里各写一份。
- 自动翻阅速度：慢 / 中 / 快 = 每步 8000 / 6000 / 4000 ms，默认「中」；存 `localStorage` 键 `flip-speed`（值 `slow` / `medium` / `fast`），存储不可用时只在本次有效、不报错。
- 自动翻阅只在 3D 里，不做幻灯片。空格 = 播放 / 暂停；Esc 先停止自动翻阅，再按一次才关闭 3D。
- 到最后一页（双页：最后一个跨页；单页：最后一页）再过一步时自动合上并停止。
- 竖屏判定与 CSS 用同一条媒体查询：`(max-width: 600px) and (orientation: portrait)`。取消「请横过手机」提示。
- 单页模式页码：扉页是第 1 页，共 `2G + 1` 页（`G` = 相册的叶数）；第 `q` 页属于跨页 `ceil(q / 2)`，奇数为左页、偶数为右页。
- 端到端测试跑的是 `dist/`：每次跑 Playwright 前先 `npm run build`。

## Review Focus

1. 自动翻阅中打开照片（点书里的照片，或直接改地址到 `/3d/p/<id>`）：应暂停，看大图期间不翻页，关掉后保持暂停。→ Task 1 测试「opening a photo pauses auto-flip…」。
2. 点了「▶」后焦点在「暂停」按钮上，再按空格：只切换一次（不能 keydown 切一次、按钮 click 又切回）。→ Task 1 测试「playing from the cover…」。
3. 照片都没有拍摄时间（截图、视频）：扉页只显示相册名和数量，不出现空日期行；很长的相册名缩成一行省略。→ Task 2 测试「title page text…」。
4. 备注很长、有换行、或只有空白：图注只占一行并以「…」结尾，空白备注不出图注、照片不缩小。→ Task 3 测试「a photo with a note…」。
5. 竖屏在最后一页继续「下一页」、在左页往左滑、横竖屏来回切：页码不越界，切回横屏时跨页号与当前位置一致。→ Task 4 测试「an upright phone…」。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/flip-player.js` | 建 | 自动翻阅的状态（off / playing / paused）、速度与计时 |
| `src/viewer.js` | 改 | 底部胶囊、播放中控件、进度线、淡出、空格键、扉页说明、竖屏单页切换 |
| `src/book/title-page.js` | 建 | 扉页文字（名称、日期范围、数量）与贴图 |
| `src/book/text.js` | 建 | 画布文字按宽度截断加「…」 |
| `src/book/binder.js` | 改 | 封面内侧挂扉页贴图 |
| `src/book/textures.js` | 改 | 图注；有备注的照片在格子里缩小 |
| `src/book/book.js` | 改 | 传扉页；单页模式（页码、左右平移、点按、滑动） |
| `src/book/scene.js` | 改 | `frame()` 可按单页宽度取景 |
| `src/ui.js` | 改 | 新图标 `pause` |
| `src/i18n.js` | 改 | 新文案；删 `rotate` |
| `src/style.css` | 改 | 返回按钮、胶囊、速度段、进度线、淡出、扉页说明；删竖屏提示 |
| `e2e/ui-helpers.cjs` | 改 | `seedBook()`：建相册、设每页张数、写备注 |
| `e2e/book-autoplay.spec.cjs` | 建 | Task 1 端到端 |
| `e2e/book-pages.spec.cjs` | 建 | Task 2–3 端到端 |
| `e2e/book-portrait.spec.cjs` | 建 | Task 4 端到端 |
| `README.md` | 改 | 「3D 翻阅」一节 |

---

### Task 1: 自动翻阅与底部胶囊

**Files:**
- Create: `src/flip-player.js`
- Modify: `src/viewer.js`（整份替换）、`src/ui.js`、`src/i18n.js`、`src/style.css`（Viewer overlay 一段）
- Modify: `e2e/ui-helpers.cjs`
- Test: `e2e/book-autoplay.spec.cjs`（新建）

**Interfaces:**
- Produces: `createFlipPlayer({ step, onState })` → `{ state(): 'off'|'playing'|'paused', play(), pause(), toggle(), stop(), restart(), setSpeed(name), dispose() }`；`SPEEDS`、`savedSpeed()`。
- Produces（DOM）：`.ab[data-autoplay=playing|paused]`、`.ab[data-idle]`、`.ab-turn [data-act=play]`、`.ab-shut [data-act=play]`、`.ab-player [data-act=pause|stop]`、`.ab-speed [data-speed]`、`.ab-progress`、`.ab-bar [data-act=close]` 带文字。
- Produces（测试）：`seedBook(page, origin, title, count, perPage, notes = {})` → 完整相册 JSON。
- Later tasks consume: viewer 的 `view`（`onChange` 收到的对象）与 `atEnd()`。

- [ ] **Step 1: 测试帮手**

`e2e/ui-helpers.cjs` 在 `setRange` 之后、`module.exports` 之前加：

```js
// An album for the 3D book: `count` photos at `perPage` a page, with optional notes by photo index.
async function seedBook(page, origin, title, count, perPage, notes = {}) {
  const album = await seed(page, origin, title, count);
  const res = await page.request.patch(`${origin}/api/albums/${album.id}`, { data: { perPage } });
  expect(res.ok()).toBe(true);
  let full = await res.json();
  for (const [i, note] of Object.entries(notes)) {
    const saved = await page.request.patch(`${origin}/api/albums/${album.id}/photos/${full.photos[i].id}/note`, { data: { note, previousNote: '' } });
    expect(saved.ok()).toBe(true);
    full = await saved.json();
  }
  return full;
}
```

`module.exports` 改为 `module.exports = { seed, seedBook, style, setRange };`。

- [ ] **Step 2: 写失败的测试**

新建 `e2e/book-autoplay.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Three photos at one a page: three pages, so spreads 1–3.
async function openBook(page) {
  const origin = new URL(page.url()).origin;
  const album = await seedBook(page, origin, 'Auto', 3, 1);
  await page.goto(`${origin}/#/a/${album.id}/3d`);
  await expect(page.locator('.ab-count')).toHaveText('1 / 3');
  return { origin, album };
}

test('auto-flip turns spreads at the chosen speed, closes the book at the end and remembers the speed', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    const count = page.locator('.ab-count');
    await expect(page.locator('.ab-bar [data-act=close]')).toHaveText(/Back|返回/);
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-turn')).toBeHidden();
    await expect(page.locator('.ab-progress')).toBeVisible();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
    const started = Date.now();
    await expect(count).toHaveText('2 / 3', { timeout: 6000 });
    expect(Date.now() - started).toBeGreaterThan(3000);
    await expect(count).toHaveText('3 / 3', { timeout: 6000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-progress')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('flip-speed'))).toBe('fast');
    await page.reload();
    await expect(count).toHaveText('1 / 3');
    await page.locator('.ab-turn [data-act=play]').click();
    await expect(page.locator('.ab-speed [data-speed=fast]')).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.close(); }
});

test('playing from the cover opens the book; Space pauses and resumes once; Escape stops before it closes', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await openBook(page);
    await page.locator('.ab-bar [data-act=cover]').click();
    await expect(page.locator('.ab-shut')).toBeVisible();
    await page.locator('.ab-shut [data-act=play]').click();
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await expect(page.locator('.ab-shut')).toBeHidden();
    await expect(page.locator('.ab-bar [data-act=cover]')).not.toHaveAttribute('hidden', '');
    await expect(page.locator('.ab-player [data-act=pause]')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await expect(page.locator('.ab-player [data-act=pause]')).toHaveAttribute('aria-label', /Resume|继续/);
    await page.locator('.ab-speed [data-speed=fast]').click();
    await page.waitForTimeout(4500);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
    await page.keyboard.press(' ');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
    await expect(page.locator('.ab-turn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ab')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('opening a photo pauses auto-flip, and moving the mouse brings the faded controls back', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const { album } = await openBook(page);
    await page.locator('.ab-turn [data-act=play]').click();
    await page.mouse.move(5, 5);
    await expect(page.locator('.ab')).toHaveAttribute('data-idle', '', { timeout: 5000 });
    await expect.poll(() => page.locator('.ab-bar').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    await page.mouse.move(300, 300);
    await expect(page.locator('.ab[data-idle]')).toHaveCount(0);
    await page.evaluate((hash) => { location.hash = hash; }, `#/a/${album.id}/3d/p/${album.photos[0].id}`);
    await expect(page.locator('.lb')).toBeVisible();
    await page.waitForTimeout(6500); // longer than one step at the default speed
    await page.locator('.lb [data-act=close]').click(); // Escape would close Details first
    await expect(page.locator('.lb')).toHaveCount(0);
    await expect(page.locator('.ab-count')).toHaveText('1 / 3');
    await expect(page.locator('.ab')).toHaveAttribute('data-autoplay', 'paused');
  } finally { await fixture.close(); }
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-autoplay.spec.cjs`
Expected: 3 个都 FAIL（没有「返回」文字、没有 `.ab-turn [data-act=play]`）。

- [ ] **Step 4: 计时模块**

新建 `src/flip-player.js`：

```js
// Auto-flip for the 3D book (v2 spec §8): one step per spread, or per page on an upright phone.
export const SPEEDS = { slow: 8000, medium: 6000, fast: 4000 };

export function savedSpeed() {
  try {
    const value = localStorage.getItem('flip-speed');
    return Object.hasOwn(SPEEDS, value ?? '') ? value : 'medium';
  } catch {
    return 'medium';
  }
}

// step() turns one page and returns false once the book has ended; onState hears every change.
export function createFlipPlayer({ step, onState }) {
  let state = 'off';
  let speed = savedSpeed();
  let timer = 0;

  function schedule() {
    clearTimeout(timer);
    timer = state === 'playing' ? setTimeout(tick, SPEEDS[speed]) : 0;
    onState({ state, speed, ms: SPEEDS[speed] });
  }

  function tick() {
    timer = 0;
    if (state !== 'playing') return;
    if (step()) schedule();
    else set('off');
  }

  function set(next) {
    state = next;
    schedule();
  }

  return {
    state: () => state,
    play: () => set('playing'),
    pause: () => state === 'playing' && set('paused'),
    toggle: () => set(state === 'playing' ? 'paused' : 'playing'),
    stop: () => state !== 'off' && set('off'),
    // A page turned by hand: the next step waits a full interval again.
    restart: () => state === 'playing' && schedule(),
    setSpeed(next) {
      if (!Object.hasOwn(SPEEDS, next)) return;
      speed = next;
      try {
        localStorage.setItem('flip-speed', next);
      } catch {}
      schedule();
    },
    dispose() {
      clearTimeout(timer);
      state = 'off';
    },
  };
}
```

- [ ] **Step 5: 图标与文案**

`src/ui.js` 的 `PATHS` 里 `play` 之后加：

```js
  pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/>',
```

`src/i18n.js`：`zh` 里 `'open-book'` 之后加：

```js
    back: '返回',
    autoplay: '自动翻阅',
    'autoplay-pause': '暂停',
    'autoplay-resume': '继续播放',
    'autoplay-stop': '停止自动翻阅',
    speed: '翻页速度',
    'speed-slow': '慢',
    'speed-medium': '中',
    'speed-fast': '快',
```

`en` 里 `'open-book'` 之后加：

```js
    back: 'Back',
    autoplay: 'Auto-flip',
    'autoplay-pause': 'Pause',
    'autoplay-resume': 'Resume',
    'autoplay-stop': 'Stop auto-flip',
    speed: 'Speed',
    'speed-slow': 'Slow',
    'speed-medium': 'Medium',
    'speed-fast': 'Fast',
```

- [ ] **Step 6: 看书界面**

整份替换 `src/viewer.js`：

```js
import { mediaUrl } from './api.js';
import { createBook } from './book/book.js';
import { layoutPages, spreadOfPage } from './book/layout.js';
import { createFlipPlayer, savedSpeed, SPEEDS } from './flip-player.js';
import { fullscreenTip, icon, toast } from './ui.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';

const KEYS = { ArrowLeft: 'prev', PageUp: 'prev', ArrowRight: 'next', PageDown: 'next' };
const DENSITY = [1, 2, 3];
const DRAWN = 20; // the slider shows once the album has more leaves than the book draws
const IDLE = 2500; // ms without input before auto-flip fades the controls

export function openViewer({ album, onOpenPhoto, onClose, onPerPage }) {
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'ab';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="ab-stage"></div>
    <div class="ab-progress" hidden><i></i></div>
    <header class="ab-bar">
      <button class="ab-back" type="button" data-act="close">${icon('close')}<span>${t('back')}</span></button>
      <h2 class="ab-title"></h2>
      <label class="ab-select"><span>${t('per-page')}</span><select data-write>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
      <button class="ab-icon" type="button" data-act="fullscreen" aria-label="${t('fullscreen')}" aria-pressed="false">${icon('fullscreen')}</button>
      <button class="ab-secondary" type="button" data-act="cover">${icon('bookClosed')}<span>${t('close-book')}</span></button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav ab-turn">
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="${t('prev-page')}">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="${t('next-page')}">${icon('next')}</button>
        <span class="ab-sep" aria-hidden="true"></span>
        <button class="ab-play" type="button" data-act="play">${icon('play')}<span>${t('autoplay')}</span></button>
      </div>
      <div class="ab-nav ab-player" hidden>
        <button class="ab-icon ab-round" type="button" data-act="pause"></button>
        <span class="ab-sep" aria-hidden="true"></span>
        <span class="ab-speed" role="group" aria-label="${t('speed')}">${Object.keys(SPEEDS).map((s) => `<button type="button" data-speed="${s}">${t(`speed-${s}`)}</button>`).join('')}</span>
        <span class="ab-sep" aria-hidden="true"></span>
        <button class="ab-icon ab-round" type="button" data-act="stop" aria-label="${t('autoplay-stop')}">${icon('close')}</button>
      </div>
      <input class="ab-slider" type="range" min="1" step="1" aria-label="${t('jump-spread')}" hidden>
      <div class="ab-nav ab-shut" hidden>
        <button class="ab-primary" type="button" data-act="cover">${icon('bookOpen')}${t('open-book')}</button>
        <button class="ab-secondary" type="button" data-act="play">${icon('play')}<span>${t('autoplay')}</span></button>
      </div>
      <p class="ab-hint">${t('hint-open')}</p>
    </footer>
    <p class="ab-message" hidden>${t('no-webgl')}</p>
    <div class="ab-rotate">${icon('phone')}<p>${t('rotate')}</p></div>`;
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.ab-stage');
  const slider = $('.ab-slider');
  const per = $('.ab-select select');
  const full = $('[data-act=fullscreen]');
  let book = null;
  let pages = [];
  let spread = 1;
  let sliding = false;
  let view = { spread: 1, spreads: 1, closed: false };
  let speed = savedSpeed();
  let stepping = false;
  let idleTimer = 0;
  const player = createFlipPlayer({ step, onState });

  // Full screen is the whole page, so the lightbox shows over the book too (spec §9). iPhone has no
  // Fullscreen API: the button explains the Home Screen, and opened from there it is not needed.
  const canFull = !!document.fullscreenEnabled;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  full.hidden = !canFull && (standalone || !/iPhone|iPod/.test(navigator.userAgent));

  function toggleFullscreen() {
    if (!canFull) toast(fullscreenTip(), 8000);
    else if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast(t('no-fullscreen')));
  }

  function onFullscreen() {
    const on = !!document.fullscreenElement;
    full.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
    full.setAttribute('aria-label', t(on ? 'fullscreen-exit' : 'fullscreen'));
    full.setAttribute('aria-pressed', String(on));
  }

  const photoUrl = (i, size) => mediaUrl(album.id, album.photos[i].id, size);
  const firstPhotoOf = (s) => (pages[2 * s - 3]?.rects[0] ?? pages[2 * s - 2]?.rects[0])?.i ?? 0;
  function spreadOf(i) {
    const p = pages.findIndex((page) => page.rects.some((r) => r.i === i));
    return p < 0 ? 1 : spreadOfPage(p);
  }
  const atEnd = () => view.spread === view.spreads;

  // Which bottom group shows: page turning, the auto-flip controls, or open / auto-flip on the cover.
  function paint() {
    const state = player.state();
    const on = state !== 'off';
    $('.ab-bar [data-act=cover]').hidden = view.closed;
    $('.ab-turn').hidden = view.closed || on;
    $('.ab-player').hidden = !on;
    $('.ab-shut').hidden = !view.closed || on;
    $('.ab-progress').hidden = state !== 'playing';
    if (on) root.dataset.autoplay = state;
    else delete root.dataset.autoplay;
    const pause = $('[data-act=pause]');
    pause.innerHTML = icon(state === 'playing' ? 'pause' : 'play');
    pause.setAttribute('aria-label', t(state === 'playing' ? 'autoplay-pause' : 'autoplay-resume'));
    for (const b of root.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(b.dataset.speed === speed));
  }

  function onChange(next) {
    view = next;
    const { spread: s, spreads, closed } = next;
    spread = s;
    $('.ab-count').textContent = `${s} / ${spreads}`;
    $('[data-act=next]').disabled = atEnd();
    slider.hidden = closed || spreads <= DRAWN + 1;
    slider.max = String(spreads);
    if (!sliding) slider.value = String(s);
    $('.ab-hint').textContent = t(closed ? 'hint-closed' : 'hint-open');
    if (!stepping && player.state() !== 'off') {
      if (closed) player.stop(); // closed by hand
      else player.restart(); // turned by hand: wait a full step from here
    }
    paint();
  }

  // One auto-flip step; false once the book has been closed at the end.
  function step() {
    if (!book) return false;
    // Never turn pages under the lightbox or a confirmation.
    if (document.querySelector('.lb, dialog[open]')) {
      player.pause();
      return true;
    }
    stepping = true;
    try {
      if (!view.closed && atEnd()) {
        book.toggleCover();
        return false;
      }
      book.next();
      return true;
    } finally {
      stepping = false;
    }
  }

  function onState({ state, speed: chosen, ms }) {
    speed = chosen;
    paint();
    const fill = $('.ab-progress i');
    fill.style.animation = 'none';
    if (state === 'playing') {
      void fill.offsetWidth; // start the line again for this step
      fill.style.animation = `ab-progress ${ms}ms linear forwards`;
    }
    wake();
  }

  // From the cover, auto-flip opens the book straight away.
  function startPlaying() {
    if (!book) return;
    if (view.closed) {
      stepping = true;
      book.next();
      stepping = false;
    }
    player.play();
    $('[data-act=pause]').focus();
  }

  function togglePlay() {
    if (player.state() === 'off') startPlaying();
    else player.toggle();
  }

  // While playing, the controls fade after a moment; any input brings them back.
  function wake() {
    root.removeAttribute('data-idle');
    clearTimeout(idleTimer);
    if (player.state() === 'playing') idleTimer = setTimeout(() => root.setAttribute('data-idle', ''), IDLE);
  }

  function onPointerDown(e) {
    // On a touch screen the first tap only brings the faded controls back.
    if (root.hasAttribute('data-idle') && e.pointerType !== 'mouse') {
      e.stopPropagation();
      e.preventDefault();
    }
    wake();
  }

  function fail() {
    root.dataset.error = '';
    $('.ab-message').hidden = false;
  }

  // (Re)builds the book from the album, opened at the spread that shows photo i.
  function build(i = 0) {
    player.stop();
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
        itemInfo: (i) => album.photos[i],
        insets,
        startSpread: spreadOf(i),
        onChange,
        onPhotoClick: (index) => {
          player.pause();
          onOpenPhoto(index);
        },
      });
    } catch (err) {
      if (err.message !== 'webgl') throw err;
      fail();
    }
  }

  function onKey(e) {
    // The menu and the slider keep their keys; so do the lightbox and confirmations above the book.
    if (e.target.closest?.('select, input') || document.querySelector('.lb, dialog[open]')) return;
    wake();
    if (e.key === 'Escape') {
      if (player.state() !== 'off') player.stop();
      else onClose();
    } else if (e.key === ' ') togglePlay(); // cancelling keydown also stops a focused button's click
    else if (KEYS[e.key] && book) book[KEYS[e.key]]();
    else return;
    e.preventDefault();
  }

  function onClick(e) {
    const target = e.target.closest('[data-act], [data-speed]');
    if (!target) return;
    const act = target.dataset.act;
    if (target.dataset.speed) player.setSpeed(target.dataset.speed);
    else if (act === 'close') onClose();
    else if (act === 'fullscreen') toggleFullscreen();
    else if (act === 'play') startPlaying();
    else if (act === 'pause') player.toggle();
    else if (act === 'stop') player.stop();
    else if (book) book[act === 'cover' ? 'toggleCover' : act]();
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
    if (!allowWrite()) { per.value = String(album.perPage); return; }
    const i = firstPhotoOf(spread);
    album = { ...album, perPage: Number(per.value) };
    build(i);
    per.blur(); // ← → turn pages again
    onPerPage(album.perPage);
  });

  function close() {
    player.dispose();
    clearTimeout(idleTimer);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus?.();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFullscreen);
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

- [ ] **Step 7: 样式**

`src/style.css` 的 Viewer overlay 部分：

1. `.ab-bar, .ab-foot { position: absolute; … pointer-events: none; }` 规则里加 `transition: opacity 0.4s var(--ease-out);`。
2. 在 `.ab-count { … }` 规则前插入：

```css
/* Turning, auto-flip and the cover share one capsule at the bottom (v2 spec §8). */
.ab-turn,
.ab-player {
  padding: 4px;
  border-radius: 999px;
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--line), 0 8px 22px -14px oklch(23.5% 0.02 255 / 0.45);
}

.ab-turn .ab-round,
.ab-player .ab-round {
  background: transparent;
  box-shadow: none;
}

.ab-sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--line);
}

.ab-play {
  height: 36px;
  padding: 0 14px 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.ab-play:hover {
  background: var(--hover);
}

.ab-play svg {
  width: 16px;
  height: 16px;
  color: var(--accent);
}

.ab-speed {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--track);
}

.ab-speed button {
  min-width: 36px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--ink-2);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ab-speed button[aria-pressed='true'] {
  background: var(--raised);
  color: var(--ink);
  box-shadow: 0 1px 2px oklch(23.5% 0.02 255 / 0.12), inset 0 0 0 1px var(--line);
}

.ab-progress {
  position: absolute;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 1;
  height: 3px;
  background: var(--track);
  pointer-events: none;
}

.ab-progress i {
  display: block;
  width: 0;
  height: 100%;
  background: var(--accent);
}

@keyframes ab-progress {
  to {
    width: 100%;
  }
}

/* While auto-flip plays and nothing moves, the controls fade; the progress line stays. */
.ab[data-idle] :is(.ab-bar, .ab-foot) {
  opacity: 0;
}

.ab[data-idle] :is(.ab-bar, .ab-foot) * {
  pointer-events: none;
}

.ab-back {
  height: 36px;
  margin-left: -8px;
  padding: 0 12px 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.ab-back:hover {
  background: var(--hover);
  color: var(--ink);
}

.ab-back svg {
  width: 18px;
  height: 18px;
}
```

3. `:is(.ab-icon, .ab-primary, .ab-secondary):focus-visible` 改为 `:is(.ab-icon, .ab-primary, .ab-secondary, .ab-back, .ab-play, .ab-speed button):focus-visible`。
4. 整段替换「Phone landscape」媒体查询（`@media (orientation: landscape) and (max-height: 519.98px) { … }`，即文件中 `.ab` 部分最后一段）为：

```css
/* Phone landscape (same query as viewer.js): compact bar; the capsule floats over the bottom of the book. */
@media (orientation: landscape) and (max-height: 519.98px) {
  .ab-bar {
    min-height: 44px;
    padding-top: calc(env(safe-area-inset-top, 0px) + 2px);
  }

  .ab-foot {
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
  }

  .ab-hint {
    display: none;
  }
}

/* Phones: the back and auto-flip buttons keep only their icons. */
@media (max-width: 600px) {
  .ab-back {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  :is(.ab-back, .ab-turn .ab-play) span {
    display: none;
  }

  .ab-turn .ab-play {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/book-autoplay.spec.cjs e2e/collection.spec.cjs e2e/video-book.spec.cjs e2e/theme.spec.cjs`
Expected: 全部 PASS（`collection` 覆盖「合上 / 打开相册」按钮对，`video-book` 覆盖书内点视频）。

- [ ] **Step 9: 提交**

```bash
git add src/flip-player.js src/viewer.js src/ui.js src/i18n.js src/style.css e2e/ui-helpers.cjs e2e/book-autoplay.spec.cjs
git commit -m "feat: auto-flip in the 3D book with speeds, pause and a back button"
```

---

### Task 2: 扉页

**Files:**
- Create: `src/book/text.js`、`src/book/title-page.js`
- Modify: `src/book/binder.js`、`src/book/book.js:14,17`、`src/viewer.js`、`src/style.css`
- Test: `e2e/book-pages.spec.cjs`（新建）

**Interfaces:**
- Produces: `fitText(ctx, text, max): string`（Task 3 也用）；`titlePageText(album): { title, dates, count }`；`drawTitlePage(ctx, text, w, h)`；`createTitleTexture(text, w, h): CanvasTexture`；`SERIF`。
- Produces: `createBinder({ sheets, title, titlePage = null })`；`createBook(container, { …, titlePage = null })`。
- Produces（DOM）：`.ab` 的 `aria-describedby="ab-about"`，`#ab-about` 文本 = `日期 · 数量`（无日期时只有数量）。

- [ ] **Step 1: 写失败的测试**

新建 `e2e/book-pages.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
const { posterBytes } = require('../tests/fixtures/video.cjs');

// Bundles one book module so a test can call it inside the page (same as video-book.spec).
async function serveModule(page, file, path) {
  const { build } = await import('vite');
  const root = join(__dirname, '..');
  const built = await build({ configFile: false, root, logLevel: 'silent',
    build: { lib: { entry: join(root, file), formats: ['es'] }, write: false, minify: false } });
  const outputs = Array.isArray(built) ? built : [built];
  const chunk = outputs.flatMap((output) => output.output).find((output) => output.type === 'chunk');
  await page.route(`**${path}`, (route) => route.fulfill({ contentType: 'text/javascript', body: chunk.code }));
}

async function darkPixels(page, box) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data, info } = await sharp(png).extract(box).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 120) n++;
  return n;
}

test('the title page names the album with its date range and count, inside the cover', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 1280, height: 860 });
    const album = await (await page.request.post(`${origin}/api/albums`, { data: { title: 'Summer by the sea' } })).json();
    const files = [
      await photoBytes({ width: 300, height: 200, exif: { IFD2: { DateTimeOriginal: '2026:07:15 18:00:00' } } }),
      await photoBytes({ width: 301, height: 200, exif: { IFD2: { DateTimeOriginal: '2026:07:02 09:00:00' } } }),
      await photoBytes({ width: 302, height: 200, exif: null }),
    ];
    for (const [i, data] of files.entries()) {
      const res = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=d${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data });
      expect(res.ok()).toBe(true);
    }
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await page.locator('.nav [data-lang=en]').evaluate((el) => el.click());
    await page.reload();
    await expect(page.locator('.ab')).toHaveAccessibleDescription(/^July 2\D+15, 2026 · 3 photos$/);
    // The left page at spread 1 is the inside of the cover: the title page puts dark text there.
    await expect.poll(() => darkPixels(page, { left: 200, top: 300, width: 320, height: 260 }), { timeout: 15000 }).toBeGreaterThan(80);
    await page.locator('.ab [data-act=next]').click();
    await expect(page.locator('.ab-count')).toHaveText('2 / 2'); // three photos at two a page
  } finally { await fixture.close(); }
});

test('title page text leaves out a missing date range and cuts a long name to one line', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/title-page.js', '/__folio-title-test.js');
    const result = await page.evaluate(async () => {
      const { titlePageText, drawTitlePage } = await import('/__folio-title-test.js');
      const plain = titlePageText({ title: 'Screens', photos: [{ kind: 'photo', metadata: { takenAt: null } }, { kind: 'video' }] });
      const labels = [];
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');
      const fillText = ctx.fillText.bind(ctx);
      ctx.fillText = (text, ...rest) => { labels.push({ text, width: ctx.measureText(text).width }); return fillText(text, ...rest); };
      drawTitlePage(ctx, { title: 'A very long album name '.repeat(8).trim(), dates: '', count: '2 photos' }, 150, 150);
      return { plain, labels };
    });
    expect(result.plain.dates).toBe('');
    expect(result.plain.count).toMatch(/1 (photo|张照片) · 1 (video|个视频|段视频)/);
    expect(result.labels).toHaveLength(2);
    expect(result.labels[0].text.endsWith('…')).toBe(true);
    expect(result.labels[0].width).toBeLessThanOrEqual(150 - 24);
    expect(result.labels[1].text).toBe('2 photos');
  } finally { await fixture.close(); }
});
```

注：`[data-lang=en]` 在 3D 覆盖层下面，用 `evaluate(el => el.click())` 切语言再 `reload`，避免点击被覆盖层挡住。

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs`
Expected: FAIL（`.ab` 没有 accessible description；`/__folio-title-test.js` 构建失败——`src/book/title-page.js` 不存在）。

- [ ] **Step 3: 截断文字**

新建 `src/book/text.js`：

```js
export const SERIF = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, "Times New Roman", serif';

// The longest start of `text` that fits `max` wide in the current font, with an ellipsis when cut.
export function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${chars.slice(0, mid).join('')}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}
```

- [ ] **Step 4: 扉页文字与贴图**

新建 `src/book/title-page.js`：

```js
import { CanvasTexture, SRGBColorSpace } from 'three';
import { lang, mediaCountText } from '../i18n.js';
import { mediaCounts } from '../../shared/media.js';
import { fitText, SERIF } from './text.js';

const PX = 6; // canvas pixels per mm

// The first left page when the book opens (v2 spec §8): name, a rule, the date range and the count.
export function titlePageText(album) {
  const days = album.photos
    .map((p) => p.metadata?.takenAt?.local?.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? ''))
    .sort();
  let dates = '';
  if (days.length) {
    const day = (d) => new Date(`${d}T00:00:00Z`);
    const format = new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const [first, last] = [days[0], days.at(-1)];
    dates = first === last ? format.format(day(first)) : format.formatRange(day(first), day(last));
  }
  return { title: album.title, dates, count: mediaCountText(mediaCounts(album.photos)) };
}

// Sizes are in mm; the context is already scaled.
export function drawTitlePage(ctx, { title, dates, count }, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#26323d';
  ctx.font = `600 11px ${SERIF}`;
  ctx.fillText(fitText(ctx, title, w - 24), w / 2, h / 2 - 8);
  ctx.fillStyle = 'rgba(38, 50, 61, 0.35)';
  ctx.fillRect(w / 2 - 14, h / 2 - 1.5, 28, 0.4);
  ctx.fillStyle = '#56636f';
  ctx.font = `4.2px system-ui, sans-serif`;
  let y = h / 2 + 7;
  for (const line of [dates, count]) {
    if (!line) continue;
    ctx.fillText(fitText(ctx, line, w - 24), w / 2, y);
    y += 6;
  }
}

export function createTitleTexture(text, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const ctx = canvas.getContext('2d');
  ctx.scale(PX, PX);
  drawTitlePage(ctx, text, w, h);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
```

- [ ] **Step 5: 贴到封面内侧**

`src/book/binder.js`：

顶部 import 加 `import { createTitleTexture } from './title-page.js';`。

`export function createBinder({ sheets, title }) {` → `export function createBinder({ sheets, title, titlePage = null }) {`。

在 `cover.add(label);` 之后加：

```js
  // The title page sits on the inside of the cover, which faces up once the book is open. Turned
  // half a turn in its own plane, it reads the right way round from the front (v2 spec §8).
  if (titlePage) {
    const pw = B - 28;
    const ph = H - 40;
    const inside = new Mesh(
      new PlaneGeometry(pw, ph).rotateZ(Math.PI).rotateX(Math.PI / 2),
      new MeshBasicMaterial({ map: createTitleTexture(titlePage, pw, ph), transparent: true, depthWrite: false }),
    );
    inside.position.set(16 + pw / 2, -CT / 2 - 0.05, 0);
    cover.add(inside);
  }
```

`src/book/book.js`：

- 第 14 行签名里 `{ title, pages, …` → `{ title, titlePage = null, pages, …`。
- 第 17 行 `createBinder({ sheets: S, title })` → `createBinder({ sheets: S, title, titlePage })`。

- [ ] **Step 6: 看书界面接上扉页**

`src/viewer.js`：

- import 加 `import { titlePageText } from './book/title-page.js';`。
- 模板里 `<p class="ab-message" hidden>…</p>` 之前加 `<p class="ab-about" id="ab-about"></p>`。
- `root.setAttribute('aria-modal', 'true');` 之后加 `root.setAttribute('aria-describedby', 'ab-about');`。
- `build()` 里 `root.setAttribute('aria-label', album.title);` 之后加：

```js
    // The canvas cannot be read aloud: the title page's lines describe the book instead.
    const about = titlePageText(album);
    $('.ab-about').textContent = [about.dates, about.count].filter(Boolean).join(' · ');
```

- `createBook(stage, { title: album.title,` → `createBook(stage, { title: album.title, titlePage: about,`。

`src/style.css`：在 `.ab-message, .ab-rotate {` 规则之前加：

```css
.ab-about {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- [ ] **Step 7: 运行，确认通过并目测方向**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs e2e/video-book.spec.cjs`
Expected: 全部 PASS。

另截一张 1280×860 刚翻开的图，确认扉页文字在左页、正向可读、不镜像不倒置。若镜像，把 `rotateZ(Math.PI)` 换成 `rotateY(Math.PI)`；若倒置，去掉 `rotateZ(Math.PI)`，重跑上面的测试。

- [ ] **Step 8: 提交**

```bash
git add src/book/text.js src/book/title-page.js src/book/binder.js src/book/book.js src/viewer.js src/style.css e2e/book-pages.spec.cjs
git commit -m "feat: a title page inside the cover of the 3D book"
```

---

### Task 3: 图注

**Files:**
- Modify: `src/book/textures.js`
- Test: `e2e/book-pages.spec.cjs`

**Interfaces:**
- Consumes: `fitText`、`SERIF`（Task 2，`src/book/text.js`）；`itemInfo(i)` 返回的照片对象带 `note`（服务端已有）。
- Produces: `createPageTexture(face, page, photoUrl, onRedraw, itemInfo)` 签名不变；有备注的照片画在格子上部，格子底部 6 mm 画一行图注。

- [ ] **Step 1: 写失败的测试**

在 `e2e/book-pages.spec.cjs` 末尾追加：

```js
test('a photo with a note gets a one-line caption under it; blank notes change nothing', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    await serveModule(page, 'src/book/textures.js', '/__folio-caption-test.js');
    const image = `data:image/jpeg;base64,${(await posterBytes()).toString('base64')}`;
    const long = `Long note ${'that keeps going '.repeat(12)}\nsecond line`;
    const result = await page.evaluate(async ({ image, long }) => {
      const { createPageTexture } = await import('/__folio-caption-test.js');
      const labels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { labels.push(text); return fillText.call(this, text, ...args); };
      const page = { rects: [{ i: 0, x: 0, y: 0, w: 60, h: 40 }, { i: 1, x: 80, y: 0, w: 60, h: 40 }, { i: 2, x: 0, y: 60, w: 60, h: 40 }] };
      const notes = ['Hi', long, ' \n '];
      let loaded;
      const ready = new Promise((resolve) => { loaded = resolve; });
      let paints = 0;
      const texture = createPageTexture(0, page, () => image, () => { if (++paints === 3) loaded(); }, (i) => ({ kind: 'photo', note: notes[i] }));
      await ready;
      CanvasRenderingContext2D.prototype.fillText = fillText;
      const canvas = texture.image;
      const context = canvas.getContext('2d');
      const pixel = (mmX, mmY) => [...context.getImageData(Math.round(mmX * canvas.width / 209.8), Math.round(mmY * canvas.height / 192.4), 1, 1).data];
      // Pocket origin on a front face: x 22 + 5, y 6.4 + 5 mm.
      const out = {
        labels,
        captionedCorner: pixel(27 + 1.5, 11.4 + 40 - 1),
        captionedTop: pixel(27 + 30, 11.4 + 10),
        blankCorner: pixel(27 + 1.5, 11.4 + 60 + 40 - 1),
      };
      texture.dispose();
      return out;
    }, { image, long });
    expect(result.labels).toContain('Hi');
    const cut = result.labels.find((text) => text.startsWith('Long note'));
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('\n');
    expect(result.labels).toHaveLength(2);
    expect(result.captionedCorner[0]).toBeGreaterThan(180); // the photo moved up and in: film shows
    expect(result.captionedTop[0]).toBeLessThan(80); // the photo is still there
    expect(result.blankCorner[0]).toBeLessThan(80); // a blank note keeps the full photo
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs -g "caption"`
Expected: FAIL（`labels` 里没有 `Hi`；`captionedCorner` 是照片的深色）。

- [ ] **Step 3: 实现**

`src/book/textures.js`：

顶部 import 加 `import { fitText, SERIF } from './text.js';`。

常量区（`const PX = 4;` 之后）加：

```js
const CAPTION = 6; // mm under a photo with a note (v2 spec §8)
const INK = '#4a5662';

const noteOf = (info) => (typeof info?.note === 'string' ? info.note.replace(/\s+/g, ' ').trim() : '');

// Where the photo sits in its slot: a note takes a line under it and the photo keeps its shape.
function photoBox(r, note) {
  if (!note) return r;
  const h = r.h - CAPTION;
  const w = (h * r.w) / r.h;
  return { x: r.x + (r.w - w) / 2, y: r.y, w, h };
}
```

`function drawPage(ctx, face, page) {` → `function drawPage(ctx, face, page, itemInfo) {`。其中画灰色占位的循环整段换成：

```js
  for (const r of page?.rects ?? []) {
    const note = noteOf(itemInfo(r.i));
    const box = photoBox(r, note);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + POCKET.pad + box.x, y0 + POCKET.pad + box.y, box.w, box.h, 0.6);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 1.2 * PX; // shadow sizes are in canvas pixels
    ctx.shadowOffsetY = 0.25 * PX;
    ctx.fillStyle = EMPTY;
    ctx.fill();
    ctx.restore();
    if (note) {
      ctx.save();
      ctx.font = `italic 3.4px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.fillText(fitText(ctx, note, r.w - 2), x0 + POCKET.pad + r.x + r.w / 2, y0 + POCKET.pad + r.y + r.h - 1.6);
      ctx.restore();
    }
  }
```

`createPageTexture` 里 `drawPage(ctx, face, page);` → `drawPage(ctx, face, page, itemInfo);`，并把末尾整个 `for (const r of page?.rects ?? []) { const image = new Image(); … }` 循环换成：

```js
  for (const r of page?.rects ?? []) {
    const info = itemInfo(r.i);
    const box = photoBox(r, noteOf(info));
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      const x = x0 + box.x;
      const y = y0 + box.y;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, box.w, box.h, 0.6);
      ctx.clip();
      ctx.drawImage(image, x, y, box.w, box.h);
      if (info?.kind === 'video') {
        const cx = x + box.w / 2;
        const cy = y + box.h / 2;
        const radius = Math.min(box.w, box.h) * 0.12;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.25, cy - radius * 0.45);
        ctx.lineTo(cx + radius * 0.5, cy);
        ctx.lineTo(cx - radius * 0.25, cy + radius * 0.45);
        ctx.fill();
        const duration = formatDuration(info.duration);
        if (duration) {
          ctx.font = '3px system-ui';
          ctx.textAlign = 'right';
          const width = ctx.measureText(duration).width + 4;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.beginPath();
          ctx.roundRect(x + box.w - width - 1, y + box.h - 6, width, 5, 0.7);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(duration, x + box.w - 3, y + box.h - 2);
        }
      }
      ctx.restore();
      texture.needsUpdate = true;
      onRedraw();
    };
    // 4 px/mm: a photo longer than 150 mm on the page needs more than the 600 image.
    image.src = photoUrl(r.i, Math.max(r.w, r.h) > 150 ? 1600 : 600);
  }
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/book-pages.spec.cjs e2e/video-book.spec.cjs`
Expected: 全部 PASS（`video-book` 确认视频标记仍画在照片中央）。

- [ ] **Step 5: 提交**

```bash
git add src/book/textures.js e2e/book-pages.spec.cjs
git commit -m "feat: one-line captions under photos with notes in the 3D book"
```

---

### Task 4: 手机竖屏单页

**Files:**
- Modify: `src/book/book.js`、`src/book/scene.js`（`frame`）、`src/viewer.js`、`src/i18n.js`、`src/style.css`
- Test: `e2e/book-portrait.spec.cjs`（新建）

**Interfaces:**
- Consumes: Task 1 的 `view`、`atEnd()`、`paint()`。
- Produces: `createBook(container, { …, single = false })`；返回对象新增 `setSingle(on: boolean)`；`next()` / `prev()` 在单页模式按页走；`onChange` 收到 `{ spread, spreads, closed, page, pages, single }`（`page` 合上时为 0）。
- Produces: `stage.frame(x, zoom, half = halfWidth)`。

- [ ] **Step 1: 写失败的测试**

新建 `e2e/book-portrait.spec.cjs`：

```js
const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { desktopFixture } = require('./fixtures.cjs');
const { seedBook } = require('./ui-helpers.cjs');

// Pixels in the middle column of the canvas that differ from the dark page colour (18, 20, 23).
async function bookHeight(page) {
  const png = await page.locator('.ab canvas').screenshot();
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    const i = (y * info.width + x) * info.channels;
    if (Math.abs(data[i] - 18) + Math.abs(data[i + 1] - 20) + Math.abs(data[i + 2] - 23) > 60) n++;
  }
  return n;
}

// Waits for the camera to finish gliding to the page first, so the drag starts on the page in view.
async function swipe(page, from, to) {
  await page.waitForTimeout(800);
  await page.mouse.move(from, 420);
  await page.mouse.down();
  await page.mouse.move(to, 420, { steps: 6 });
  await page.mouse.up();
}

test('an upright phone shows one page at a time, counts pages and goes back to spreads sideways', async () => {
  test.setTimeout(60_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const album = await seedBook(page, origin, 'Upright', 3, 1); // three pages plus the title page
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    const count = page.locator('.ab-count');
    const next = page.locator('.ab [data-act=next]');
    await expect(count).toHaveText('Page 2 of 5');
    await expect(page.locator('.ab-rotate')).toHaveCount(0);
    await expect(page.locator('.ab canvas')).toBeVisible();
    // One page fills the width, so the page is about twice as tall as in the two-page view.
    await expect.poll(() => bookHeight(page), { timeout: 15000 }).toBeGreaterThan(240);
    await swipe(page, 300, 60); // turns the leaf: its back is the next page
    await expect(count).toHaveText('Page 3 of 5');
    await swipe(page, 300, 60); // nothing left to turn on a left page: move to the right page
    await expect(count).toHaveText('Page 4 of 5');
    await swipe(page, 90, 330); // back to the left page
    await expect(count).toHaveText('Page 3 of 5');
    await next.click();
    await expect(count).toHaveText('Page 4 of 5');
    await next.click();
    await expect(count).toHaveText('Page 5 of 5');
    await expect(next).toBeDisabled();
    await page.locator('.ab [data-act=prev]').click();
    await expect(count).toHaveText('Page 4 of 5');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(count).toHaveText('2 / 3');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(count).toHaveText('Page 4 of 5');
  } finally { await fixture.close(); }
});

test('auto-flip on an upright phone steps one page at a time and closes after the last page', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    await page.setViewportSize({ width: 390, height: 844 });
    const album = await seedBook(page, origin, 'Upright play', 1, 1); // one page: title page + page 2 of 3
    await page.goto(`${origin}/#/a/${album.id}/3d`);
    await expect(page.locator('.ab-count')).toHaveText('Page 2 of 3');
    await page.locator('.ab-turn [data-act=play]').click();
    await page.locator('.ab-speed [data-speed=fast]').click();
    await expect(page.locator('.ab-count')).toHaveText('Page 3 of 3', { timeout: 6000 });
    await expect(page.locator('.ab-shut')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.ab[data-autoplay]')).toHaveCount(0);
  } finally { await fixture.close(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm run build && npx playwright test e2e/book-portrait.spec.cjs`
Expected: FAIL（计数为 `1 / 3`，`.ab-rotate` 存在）。

- [ ] **Step 3: 取景按单页宽度**

`src/book/scene.js` 的 `frame(x, zoom) {` → `frame(x, zoom, half = halfWidth) {`，其中 `const fitWidth = (halfWidth + (phone ? 5 : 12)) / (TAN * (width / height));` → `const fitWidth = (half + (phone ? 5 : 12)) / (TAN * (width / height));`。注释改为 `// Centre the view on x between the top and bottom bars (spec §11); \`half\` is the width to fit either side.`。

- [ ] **Step 4: 书的单页模式**

`src/book/book.js`：

1. 签名加 `single = false`：`{ title, titlePage = null, pages, photoUrl, itemInfo = () => null, insets, startSpread = 1, single = false, onChange, onPhotoClick }`。函数体内不另声明 `single`，参数即状态（下面会被 `setSingle` 改写）。
2. `let ringX = 0;` 之后加：

```js
  // Upright phones show one page (v2 spec §8): side −1 is the left page of the spread, 1 the right;
  // pan follows side so the camera glides between them. Page 1 is the title page.
  let side = 1;
  let pan = 1;
  const pageHalf = () => (binder.xb + binder.B) / 2;
```

3. `const report = () => onChange({ spread: spread(), spreads: G + 1, closed: k === 0 });` 换成：

```js
  const pageNo = () => (k === 0 ? 0 : 2 * spread() - (side < 0 ? 1 : 0));
  const report = () => onChange({ spread: spread(), spreads: G + 1, closed: k === 0, page: pageNo(), pages: 2 * G + 1, single });
```

4. `setSpread(s)` 里 `if (s > 0 && (next < 1 || next > S + 1)) return;` 之后加一行：

```js
    side = s > spread() ? -1 : 1; // forward lands on the new left page, back on the right one
```

5. `jump(s)` 改为接收落在哪一页，并让平移直接到位：

```js
  // Straight to an album spread, without turning pages.
  function jump(s, at = 1) {
    s = Math.max(1, Math.min(G + 1, Math.round(s)));
    pointer = drag = null;
    o = Math.max(0, Math.min(G - S, s - MIDDLE));
    k = s - o;
    side = s === G + 1 ? -1 : at; // the last spread has no right page
    pan = side;
    leaves.forEach((leaf, j) => Object.assign(leaf, idle(j, k)));
    report();
    refreshTextures();
  }
```

6. `const open = () => (o > 0 ? jump(1) : setSpread(1));` → `const open = () => (o > 0 ? jump(1, -1) : setSpread(1));`，并在其后加：

```js
  // One page on: across to the right page, or turn the leaf to the next left page.
  function nextPage() {
    if (k === 0) return open();
    if (side < 0 && spread() <= G) return look(1);
    setSpread(spread() + 1);
  }

  function prevPage() {
    if (k === 0) return;
    if (side > 0) return look(-1);
    setSpread(spread() - 1); // from the title page this closes the book
  }

  function look(next) {
    side = next;
    report();
    requestRender();
  }
```

7. `step(dt)` 里，`leaves.forEach(…)` 之后、`return moving;` 之前加：

```js
    if (reduced.matches) pan = side;
    else if (pan !== side) {
      pan += (side - pan) * (1 - Math.exp(-dt * 9));
      if (Math.abs(side - pan) < 1e-3) pan = side;
    }
    if (pan !== side) moving = true;
```

8. `place()` 最后一行 `stage.frame(…)` 换成：

```js
    const opened = smoothstep(c);
    const zoom = 1 + 0.15 * Math.sin(PI * c);
    if (single) stage.frame(binder.closedCenter * (1 - opened) + pan * pageHalf() * opened, zoom, pageHalf());
    else stage.frame(binder.closedCenter * (1 - opened), zoom);
```

9. `release(p, e)` 改为返回是否翻了页：最后一行换成

```js
    if (v > 0.9 || (progress > 0.22 && v >= -0.05)) {
      setLocal(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
      return true;
    }
    return false;
```

10. `tap(e, p)` 最后一行 `setSpread(spread() + (p.x < ringX ? -1 : 1));` 换成：

```js
    if (single) return p.x < pan * pageHalf() ? prevPage() : nextPage();
    setSpread(spread() + (p.x < ringX ? -1 : 1));
```

11. `onUp(e)` 里 `if (drag) { drag = null; release(p, e); }` 换成：

```js
    if (drag) {
      drag = null;
      // On one page a swipe that turns no leaf still moves a page: left page → right page and back.
      if (!release(p, e) && single && Math.abs(e.clientX - p.x0) > 40) (e.clientX < p.x0 ? nextPage : prevPage)();
    }
```

12. 返回对象：

```js
    next: () => (single ? nextPage() : k === 0 ? open() : setSpread(spread() + 1)),
    prev: () => (single ? prevPage() : setSpread(spread() - 1)),
    toggleCover: () => (k > 0 ? setSpread(0) : open()),
    jump,
    setSingle(on) {
      single = on;
      if (spread() === G + 1) side = -1;
      pan = side;
      report();
      requestRender();
    },
```

（`stats`、`dispose` 不变。）

- [ ] **Step 5: 看书界面切换单页**

`src/viewer.js`：

- 删除模板最后的 `<div class="ab-rotate">…</div>`。
- `const atEnd = () => view.spread === view.spreads;` → `const atEnd = () => (view.single ? view.page === view.pages : view.spread === view.spreads);`
- `onChange` 里 `$('.ab-count').textContent = \`${s} / ${spreads}\`;` → `$('.ab-count').textContent = next.single ? t('page-count', { n: next.page, total: next.pages }) : \`${s} / ${spreads}\`;`
- `const phoneLandscape = …` 之前加：

```js
  // Held upright, a phone shows one page at a time (same query as the CSS).
  const upright = matchMedia('(max-width: 600px) and (orientation: portrait)');
  const onTurn = () => book?.setSingle(upright.matches);
  upright.addEventListener('change', onTurn);
```

- `build()` 里 `createBook(stage, { …` 的选项加 `single: upright.matches,`。
- `close()` 第一行加 `upright.removeEventListener('change', onTurn);`。

`src/i18n.js`：

- 删除 `zh` 的 `rotate: '请横过手机查看相册',` 与 `en` 的 `rotate: 'Turn your phone sideways to view the album',`。
- `zh` 加 `'page-count': ({ n, total }) => \`${n} / ${total} 页\`,`；`en` 加 `'page-count': ({ n, total }) => \`Page ${n} of ${total}\`,`（放在 `back` 之后）。

`src/style.css`：

- `.ab-message, .ab-rotate {` → `.ab-message {`。
- 删除 `.ab-rotate { display: none; }`、`.ab-rotate svg { … }` 两条规则。
- 删除整段 `@media (max-width: 600px) and (orientation: portrait) { .ab-rotate … .ab-stage, .ab-foot { visibility: hidden; } }`。

- [ ] **Step 6: 运行，确认通过**

Run: `npm run build && npx playwright test e2e/book-portrait.spec.cjs e2e/book-autoplay.spec.cjs e2e/book-pages.spec.cjs e2e/collection.spec.cjs e2e/video-book.spec.cjs`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/book/book.js src/book/scene.js src/viewer.js src/i18n.js src/style.css e2e/book-portrait.spec.cjs
git commit -m "feat: one page at a time on an upright phone, counted by page"
```

---

### Task 5: README 与全量验证

**Files:**
- Modify: `README.md`（「外观」一节之后）

- [ ] **Step 1: README 加「3D 翻阅」一节**

在 `## 外观` 一节后插入：

```markdown
## 3D 翻阅

点相册页的「3D 翻阅」打开。翻开后第一个左页是扉页：相册名、拍摄日期范围（有拍摄时间的照片才有）和数量，自动生成。有备注的照片下方显示一行图注，太长时省略，点照片看全文。

底部「▶ 自动翻阅」按慢 / 中 / 快（每跨页 8 / 6 / 4 秒）自动翻页，每台设备记住速度；播放时控件几秒后淡出，移动鼠标或点一下屏幕就回来。空格键播放 / 暂停，Esc 先停止自动翻阅、再按一次关闭 3D。打开照片时自动暂停；翻到最后一页自动合上。相册合上时，「▶ 自动翻阅」从封面开始播放。

手机竖着拿时一次显示一页，左右滑动或点两侧翻页，页码按页计（扉页是第 1 页）；横过来恢复双页。
```

- [ ] **Step 2: 全量测试**

Run: `npm test && npm run build && npm run test:desktop`
Expected: 全部 PASS。

- [ ] **Step 3: 视觉对照**

用 `ALBUM_LIBRARY=$(mktemp -d) npm start` 启动，导入几张带拍摄时间的照片并给其中一张写备注，打开 3D，对照 `docs/superpowers/mockups/2026-11-02-folio-v2/design-3-book.html`：刚翻开（扉页 + 图注）、合上状态（打开相册 + 自动翻阅）、自动翻阅中（深色主题、进度线、控件淡出）、手机竖屏（DevTools 390×844）与横屏（844×390）。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: describe auto-flip, the title page, captions and the upright phone view"
```
