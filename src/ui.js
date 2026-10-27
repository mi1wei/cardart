import { t } from './i18n.js';

const PATHS = {
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/>',
};

export const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

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
