import { mediaUrl } from './api.js';
import { createBook } from './book/book.js';
import { layoutPages, spreadOfPage } from './book/layout.js';
import { titlePageText } from './book/title-page.js';
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
  root.setAttribute('aria-describedby', 'ab-about');
  root.innerHTML = `
    <div class="ab-stage"></div>
    <div class="ab-progress" hidden><i></i></div>
    <header class="ab-bar">
      <button class="ab-back" type="button" data-act="close" aria-label="${t('back')}">${icon('close')}<span>${t('back')}</span></button>
      <h2 class="ab-title"></h2>
      <label class="ab-select"><span>${t('per-page')}</span><select data-write>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
      <button class="ab-icon" type="button" data-act="fullscreen" aria-label="${t('fullscreen')}" aria-pressed="false">${icon('fullscreen')}</button>
      <button class="ab-secondary" type="button" data-act="cover" aria-label="${t('close-book')}">${icon('bookClosed')}<span>${t('close-book')}</span></button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav ab-turn">
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="${t('prev-page')}">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="${t('next-page')}">${icon('next')}</button>
        <span class="ab-sep" aria-hidden="true"></span>
        <button class="ab-play" type="button" data-act="play" aria-label="${t('autoplay')}">${icon('play')}<span>${t('autoplay')}</span></button>
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
    <p class="ab-about" id="ab-about"></p>
    <p class="ab-message" hidden>${t('no-webgl')}</p>`;
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
  const atEnd = () => (view.single ? view.page === view.pages : view.spread === view.spreads);

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
    $('.ab-count').textContent = next.single ? t('page-count', { n: next.page, total: next.pages }) : `${s} / ${spreads}`;
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
    // The canvas cannot be read aloud: the title page's lines describe the book instead.
    const about = titlePageText(album);
    $('.ab-about').textContent = [about.dates, about.count].filter(Boolean).join(' · ');
    try {
      book = createBook(stage, {
        title: album.title,
        titlePage: about,
        pages,
        photoUrl,
        itemInfo: (i) => album.photos[i],
        insets,
        startSpread: spreadOf(i),
        single: upright.matches,
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
    upright.removeEventListener('change', onTurn);
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

  // Held upright, a phone shows one page at a time (same query as the CSS).
  const upright = matchMedia('(max-width: 600px) and (orientation: portrait)');
  const onTurn = () => book?.setSingle(upright.matches);
  upright.addEventListener('change', onTurn);

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
