import { createBook } from './book/book.js';

const PATHS = {
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

const HINT_OPEN = '拖动页面或点击两侧翻页；点击卡片查看详情';
const HINT_CLOSED = '点击封面或向左拖动打开';
const KEYS = { ArrowLeft: 'prev', PageUp: 'prev', ArrowRight: 'next', PageDown: 'next' };

export function openViewer(album) {
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'ab';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', album.title);
  root.innerHTML = `
    <div class="ab-stage"></div>
    <header class="ab-bar">
      <h2 class="ab-title"></h2>
      <button class="ab-icon" type="button" data-act="cover" aria-label="合上卡册" aria-pressed="false">${icon('book')}</button>
      <button class="ab-icon" type="button" data-act="close" aria-label="关闭">${icon('close')}</button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav" data-open>
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="上一页">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="下一页">${icon('next')}</button>
      </div>
      <div class="ab-nav" data-closed hidden>
        <button class="ab-primary" type="button" data-act="cover">${icon('bookOpen')}打开卡册</button>
      </div>
      <p class="ab-hint">${HINT_OPEN}</p>
    </footer>
    <div class="ab-panel-wrap" hidden>
      <aside class="ab-panel" aria-label="卡片详情">
        <div class="ab-panel-head">
          <button class="ab-icon" type="button" data-act="panel" aria-label="关闭详情">${icon('close')}</button>
        </div>
        <div class="ab-panel-body">
          <div class="ab-panel-img" aria-hidden="true"></div>
          <h3 class="ab-panel-title"></h3>
          <p class="ab-panel-meta"></p>
        </div>
      </aside>
    </div>
    <p class="ab-message" hidden>当前浏览器无法显示 3D 卡册（WebGL 不可用）</p>
    <div class="ab-rotate">${icon('phone')}<p>请横过手机查看卡册</p></div>`;
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.ab-stage');
  const panel = $('.ab-panel-wrap');
  $('.ab-title').textContent = album.title;

  let book = null;

  function onChange({ spread, spreads, closed }) {
    $('[data-open]').hidden = closed;
    $('[data-closed]').hidden = !closed;
    $('.ab-count').textContent = `${spread} / ${spreads}`;
    $('[data-act=next]').disabled = spread === spreads;
    const cover = $('.ab-bar [data-act=cover]');
    cover.innerHTML = icon(closed ? 'bookOpen' : 'book');
    cover.setAttribute('aria-label', closed ? '打开卡册' : '合上卡册');
    cover.setAttribute('aria-pressed', String(closed));
    $('.ab-hint').textContent = closed ? HINT_CLOSED : HINT_OPEN;
  }

  function showCard(card) {
    const art = $('.ab-panel-img');
    art.style.background = card.color || '#888';
    art.textContent = card.title ?? ''; // shows through if the image fails
    if (card.src) {
      const image = new Image();
      image.alt = '';
      image.onerror = () => image.remove();
      image.src = card.src;
      art.append(image);
    }
    $('.ab-panel-title').textContent = card.title ?? '';
    $('.ab-panel-meta').textContent = `第 ${card.index + 1} 张，共 ${album.cards.length} 张`;
    panel.hidden = false;
  }

  function fail() {
    root.dataset.error = '';
    $('.ab-message').hidden = false;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (panel.hidden) close();
      else panel.hidden = true;
    } else if (KEYS[e.key] && book) {
      book[KEYS[e.key]]();
    } else {
      return;
    }
    e.preventDefault();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'panel') panel.hidden = true;
    else if (act && book) book[act === 'cover' ? 'toggleCover' : act]();
  }

  function close() {
    window.removeEventListener('keydown', onKey);
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus();
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
  try {
    book = createBook(stage, { album, insets, onChange, onCardClick: showCard });
  } catch (err) {
    if (err.message !== 'webgl') throw err;
    fail();
  }
  return close;
}
