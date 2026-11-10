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

export function openViewer({ album, startIndex = 0, onOpenPhoto, onClose, onPerPage }) {
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
      <span class="ab-layout" role="group" aria-label="${t('per-page')}"><span class="ab-layout-k" aria-hidden="true">${t('per-page')}</span>${DENSITY.map((v) => `<button type="button" data-write data-per="${v}" aria-pressed="false">${icon(`layout${v}`)}<span>${t(`per-${v}`)}</span></button>`).join('')}</span>
      <label class="ab-select"><span>${t('per-page')}</span><select data-write>${DENSITY.map((v) => `<option value="${v}">${t(`per-${v}`)}</option>`).join('')}</select></label>
      <button class="ab-icon" type="button" data-act="fullscreen" aria-label="${t('fullscreen')}" aria-pressed="false">${icon('fullscreen')}</button>
      <button class="ab-secondary" type="button" data-act="cover" aria-label="${t('close-book')}">${icon('bookClosed')}<span>${t('close-book')}</span></button>
    </header>
    <footer class="ab-foot">
      <button class="ab-fullscreen" type="button" data-act="view-fullscreen">${icon('rotatePhone')}<span>${t('fullscreen-view')}</span></button>
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
  const fullscreenHint = $('.ab-fullscreen');
  let book = null;
  let pages = [];
  let spread = 1;
  let sliding = false;
  let view = { spread: 1, spreads: 1, closed: false };
  let speed = savedSpeed();
  let stepping = false;
  let playState = 'off';
  let idleTimer = 0;
  const phoneLandscape = matchMedia('(orientation: landscape) and (max-height: 519.98px)');
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
    if (on && document.activeElement === fullscreenHint) full.focus();
    paint();
    // Full screen shows only the album: the bars float over it and fade like during auto-flip.
    wake();
    book?.redraw();
  }

  const photoUrl = (i, size) => mediaUrl(album.id, album.photos[i].id, size);
  const firstPhotoOf = (s) => (pages[2 * s - 3]?.rects[0] ?? pages[2 * s - 2]?.rects[0])?.i ?? 0;
  function spreadOf(i) {
    const p = pages.findIndex((page) => page.rects.some((r) => r.i === i));
    return p < 0 ? 1 : spreadOfPage(p);
  }
  // The photo in view: on an upright phone the page shown, otherwise the spread's first photo.
  const shownPhoto = () => (view.single && view.page > 1 ? pages[view.page - 2]?.rects[0]?.i : undefined) ?? firstPhotoOf(spread);
  const onTitlePage = () => view.single && view.page === 1;
  const atEnd = () => (view.single ? view.page === view.pages : view.spread === view.spreads);

  // Which bottom group shows: page turning, the auto-flip controls, or open / auto-flip on the cover.
  function paint() {
    const state = player.state();
    const on = state !== 'off';
    fullscreenHint.hidden = full.hidden || standalone || !!document.fullscreenElement || view.closed || on;
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
    // Timer steps reschedule with the same state: only a real change shows the faded controls.
    const changed = state !== playState || chosen !== speed;
    const focused = $('.ab-player').contains(document.activeElement);
    playState = state;
    speed = chosen;
    paint();
    // The player controls hide when auto-flip ends: keep focus inside the dialog.
    if (state === 'off' && focused) $(view.closed ? '.ab-shut [data-act=cover]' : '.ab-turn [data-act=play]').focus();
    const fill = $('.ab-progress i');
    fill.style.animation = 'none';
    if (state === 'playing') {
      void fill.offsetWidth; // start the line again for this step
      fill.style.animation = `ab-progress ${ms}ms linear forwards`;
    }
    if (changed) wake();
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

  // Full screen and a phone held sideways show only the album; auto-flip fades the controls too.
  const albumOnly = () => !!document.fullscreenElement || phoneLandscape.matches;

  // The controls fade after a moment; input brings them back.
  function wake() {
    root.removeAttribute('data-idle');
    clearTimeout(idleTimer);
    if (player.state() === 'playing' || albumOnly()) idleTimer = setTimeout(() => root.setAttribute('data-idle', ''), IDLE);
  }

  // A finger moving is a swipe, and a layout change moves no mouse but still sends a move at the cursor.
  let mouseAt = '';
  function onPointerMove(e) {
    if (e.pointerType !== 'mouse' || `${e.clientX},${e.clientY}` === mouseAt) return;
    mouseAt = `${e.clientX},${e.clientY}`;
    wake();
  }

  function onPointerDown(e) {
    player.restart(); // a page held or dragged gets a full step before auto-flip turns it
    if (e.pointerType === 'mouse' || !root.hasAttribute('data-idle')) wake();
    // Faded during auto-flip, the first tap only brings the controls back. With only the album
    // showing, a swipe turns the page and a tap on empty space brings them back (onBlankTap).
    else if (!albumOnly()) {
      e.stopPropagation();
      e.preventDefault();
      wake();
    }
  }

  function fail() {
    player.stop();
    root.dataset.error = '';
    $('.ab-message').hidden = false;
  }

  // (Re)builds the book from the album, opened at the page that shows photo i (or the title page).
  function build(i = 0, titlePage = false) {
    player.stop();
    book?.dispose();
    book = null;
    pages = layoutPages(album.photos.map((p) => p.w / p.h), album.perPage ?? 2);
    syncPerPage();
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
        startSpread: titlePage ? 1 : spreadOf(i),
        startSide: titlePage || pages.findIndex((page) => page.rects.some((r) => r.i === i)) % 2 === 1 ? -1 : 1,
        single: upright.matches,
        onChange,
        onBlankTap: (e) => {
          if (e.pointerType === 'mouse' || !root.hasAttribute('data-idle')) return false;
          wake();
          return true;
        },
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
    const target = e.target.closest('[data-act], [data-speed], [data-per]');
    if (!target) return;
    const act = target.dataset.act;
    if (target.dataset.per) setPerPage(Number(target.dataset.per));
    else if (target.dataset.speed) player.setSpeed(target.dataset.speed);
    else if (act === 'close') onClose();
    else if (act === 'fullscreen' || act === 'view-fullscreen') toggleFullscreen();
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
    setPerPage(Number(per.value));
    per.blur(); // ← → turn pages again
  });

  function close() {
    upright.removeEventListener('change', onTurn);
    player.dispose();
    clearTimeout(idleTimer);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    phoneLandscape.removeEventListener('change', wake);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus?.();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('pointermove', onPointerMove);
  phoneLandscape.addEventListener('change', wake);
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

  // Read live so the framing follows rotation; in phone landscape and full screen the bars float over the book.
  const insets = {
    get top() {
      return document.fullscreenElement ? 0 : $('.ab-bar').offsetHeight;
    },
    get bottom() {
      return phoneLandscape.matches || document.fullscreenElement ? 0 : $('.ab-foot').offsetHeight;
    },
  };
  build(startIndex);
  wake();

  return {
    close,
    refresh(next) {
      const old = shownPhoto();
      const title = onTitlePage();
      const keep = album.photos[old]?.id;
      album = next;
      if (!album.photos.length) return onClose();
      const i = album.photos.findIndex((p) => p.id === keep);
      build(i >= 0 ? i : Math.min(old, album.photos.length - 1), title);
    },
  };
}
