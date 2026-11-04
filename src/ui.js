import brandMark from './assets/folio-mark.svg?raw';
import { t } from './i18n.js';

const PATHS = {
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 7 3v5c0 5-7 10-7 10S5 16 5 11V6Z"/>',
  shieldCheck: '<path d="m12 3 7 3v5c0 5-7 10-7 10S5 16 5 11V6Z"/><path d="m8.5 11.5 2.5 2.5 4.5-5"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M8.5 12h7M8.5 16h5"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  refresh: '<path d="M19 8a7.5 7.5 0 1 0 .4 7M19 3v5h-5"/>',
  bookClosed: '<path d="M5 17.5v-11a2 2 0 0 1 2-2h12v11H7a2 2 0 0 0-2 2z"/><path d="M5 17.5a2 2 0 0 0 2 2h12"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  play: '<path d="m9 6 9 6-9 6z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 16v4h16v-4"/>',
  move: '<path d="M5 19 19 5M8 5h11v11"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  select: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  gear: '<path d="M18.2 10.3L20.3 10.7L20.3 13.3L18.2 13.7L17.5 15.2L18.8 16.9L16.9 18.8L15.2 17.5L13.7 18.2L13.3 20.3L10.7 20.3L10.3 18.2L8.8 17.5L7.1 18.8L5.2 16.9L6.5 15.2L5.8 13.7L3.7 13.3L3.7 10.7L5.8 10.3L6.5 8.8L5.2 7.1L7.1 5.2L8.8 6.5L10.3 5.8L10.7 3.7L13.3 3.7L13.7 5.8L15.2 6.5L16.9 5.2L18.8 7.1L17.5 8.8Z"/><circle cx="12" cy="12" r="2.6"/>',
  gridSmall: '<path d="M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z"/>',
  gridLarge: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.2"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.2"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.2"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.2"/>',
  layout1: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="8" y="8.5" width="8" height="7" rx="1" fill="currentColor" stroke="none"/>',
  layout2: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="6.8" y="8.5" width="4.6" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="12.6" y="8.5" width="4.6" height="7" rx="1" fill="currentColor" stroke="none"/>',
  layout3: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="6.8" y="8.5" width="5" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="8.5" width="4.2" height="3" rx=".8" fill="currentColor" stroke="none"/><rect x="13" y="12.5" width="4.2" height="3" rx=".8" fill="currentColor" stroke="none"/>',
};

// Full-colour app illustration for brand spots; the single-colour mark stays for icon buttons.
export const brandLogo = () => '<img class="brand-logo" src="/icons/folio-logo.png" alt="" width="28" height="28" draggable="false">';

export const icon = (name) =>
  name === 'book'
    ? brandMark
    : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

// The way back to the album wall from the album, Recently Deleted and License pages (polish spec §3.5).
export const backLink = () => `<a class="back-link" href="#/albums">${icon('prev')}<span>${t('all-albums')}</span></a>`;

// iPhone browsers cannot go full screen; a Home Screen web app opens without browser bars (spec §9).
export const fullscreenTip = () => t(/MicroMessenger/i.test(navigator.userAgent) ? 'tip-wechat' : 'tip-iphone');

let toastEl = null;
export function toast(text, ms = 3000) {
  toastEl ??= Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
  if (!toastEl.isConnected) document.body.append(toastEl);
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => (toastEl.hidden = true), ms);
}

// Native modal <dialog>. With `value` it shows a text field and resolves to the trimmed text,
// otherwise to true. Cancel, Esc or an empty field resolve to null.
export function dialog({ title, text = '', value = null, ok = t('ok'), danger = false }) {
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.innerHTML = `
    <form method="dialog">
      <h3></h3>
      <p class="dlg-text"></p>
      <input class="dlg-input" maxlength="50" autocomplete="off">
      <div class="dlg-acts">
        <button class="btn" type="button" data-act="cancel">${t('cancel')}</button>
        <button class="btn ${danger ? 'danger' : 'pri'}" value="ok"></button>
      </div>
    </form>`;
  d.querySelector('h3').textContent = title;
  d.querySelector('.dlg-text').textContent = text;
  d.querySelector('.dlg-text').hidden = !text;
  const input = d.querySelector('.dlg-input');
  input.hidden = value === null;
  input.value = value ?? '';
  d.querySelector('[value=ok]').textContent = ok;
  d.querySelector('[data-act=cancel]').onclick = () => d.close();
  document.body.append(d);
  d.showModal();
  if (value !== null) input.select();
  return new Promise((resolve) => {
    d.addEventListener('close', () => {
      d.remove();
      if (d.returnValue !== 'ok') return resolve(null);
      resolve(value === null ? true : input.value.trim() || null);
    });
  });
}
