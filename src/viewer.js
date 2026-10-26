import { mediaUrl } from './api.js';
import { createBook } from './book/book.js';
import { layoutPages, spreadOfPage } from './book/layout.js';
import { fullscreenTip, icon, toast } from './ui.js';

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
      <button class="ab-icon" type="button" data-act="fullscreen" aria-label="全屏" aria-pressed="false">${icon('fullscreen')}</button>
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
  const full = $('[data-act=fullscreen]');
  let book = null;
  let pages = [];
  let spread = 1;
  let sliding = false;

  // Full screen is the whole page, so the lightbox shows over the book too (spec §9). iPhone has no
  // Fullscreen API: the button explains the Home Screen, and opened from there it is not needed.
  const canFull = !!document.fullscreenEnabled;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  full.hidden = !canFull && (standalone || !/iPhone|iPod/.test(navigator.userAgent));

  function toggleFullscreen() {
    if (!canFull) toast(fullscreenTip(), 8000);
    else if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('当前浏览器不能全屏'));
  }

  function onFullscreen() {
    const on = !!document.fullscreenElement;
    full.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
    full.setAttribute('aria-label', on ? '退出全屏' : '全屏');
    full.setAttribute('aria-pressed', String(on));
  }

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
    // The menu and the slider keep their keys; so do the lightbox and confirmations above the book.
    if (e.target.closest?.('select, input') || document.querySelector('.lb, dialog[open]')) return;
    if (e.key === 'Escape') onClose();
    else if (KEYS[e.key] && book) book[KEYS[e.key]]();
    else return;
    e.preventDefault();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') onClose();
    else if (act === 'fullscreen') toggleFullscreen();
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
    document.removeEventListener('fullscreenchange', onFullscreen);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus?.();
  }

  root.addEventListener('click', onClick);
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
