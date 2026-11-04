import { lang, setLang, t } from './i18n.js';
import { licenseExpiry, licenseKind } from './license.js';
import { onComputer } from './phone.js';
import { open } from './router.js';
import { setTheme, theme, themeSupported } from './theme.js';
import { icon, toast } from './ui.js';

const THEMES = [['light', 'sun'], ['dark', 'moon'], ['auto', null]];
const busy = () => document.documentElement.hasAttribute('data-busy');

// Settings (polish spec §3.3): what is set once and then left alone. Appearance and language are kept
// per device; on the computer the license row shows its state and leads to the License page.
export function openSettings({ onLang }) {
  if (document.querySelector('dialog.settings')) return;
  const d = document.createElement('dialog');
  d.className = 'dlg settings';
  d.setAttribute('aria-labelledby', 'settings-title');

  function render() {
    d.innerHTML = `
      <form method="dialog">
        <h3 id="settings-title">${t('settings')}</h3>
        ${themeSupported() ? `
        <div class="set-row"><span class="set-k" id="set-theme">${t('theme')}</span><span class="set-v"></span>
          <span class="theme" role="group" aria-labelledby="set-theme">${THEMES.map(([mode, name]) =>
            `<button type="button" data-theme-mode="${mode}">${name ? icon(name) : ''}<span>${t(`theme-${mode}`)}</span></button>`).join('')}</span></div>` : ''}
        <div class="set-row"><span class="set-k" id="set-lang">${t('language')}</span><span class="set-v"><small class="set-note">${t('lang-busy')}</small></span>
          <span class="lang" role="group" aria-labelledby="set-lang"><button type="button" data-lang="zh" lang="zh-CN">中文</button><button type="button" data-lang="en" lang="en">English</button></span></div>
        ${onComputer ? `
        <div class="set-row"><span class="set-k">${t('license-manage')}</span><span class="set-v"><b class="set-license"></b><small class="set-expiry"></small></span>
          <button class="btn" type="button" data-act="license">${t('license-open')}</button></div>` : ''}
        <div class="dlg-acts"><button class="btn pri" value="done" data-act="done">${t('settings-done')}</button></div>
      </form>`;
    sync();
  }

  function sync() {
    const locked = busy();
    for (const b of d.querySelectorAll('[data-theme-mode]')) b.setAttribute('aria-pressed', String(b.dataset.themeMode === theme()));
    for (const b of d.querySelectorAll('[data-lang]')) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
      b.disabled = locked;
    }
    d.querySelector('.set-note').hidden = !locked;
    const state = d.querySelector('.set-license');
    if (!state) return;
    const kind = licenseKind();
    const expiry = licenseExpiry();
    state.textContent = t(`license-state-${kind}`);
    const label = t(['expired', 'trial-expired'].includes(kind) ? 'license-expired-on' : 'license-expires-on');
    d.querySelector('.set-expiry').textContent = expiry
      ? `${label} ${new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' }).format(expiry)}`
      : '';
    const manage = d.querySelector('[data-act=license]');
    if (locked) manage.setAttribute('aria-disabled', 'true');
    else manage.removeAttribute('aria-disabled');
  }

  d.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-theme-mode]')?.dataset.themeMode;
    if (mode) {
      setTheme(mode);
      sync();
      return;
    }
    const code = e.target.closest('[data-lang]')?.dataset.lang;
    if (code) {
      // While photos import, the page must not be rebuilt: the rest of the queue would be lost (spec §10).
      if (code === lang() || busy()) return;
      setLang(code);
      render();
      onLang();
      d.querySelector(`[data-lang=${code}]`).focus();
      return;
    }
    if (e.target.closest('[data-act=license]')) {
      if (busy()) {
        toast(t('license-wait-upload'));
        return;
      }
      d.close();
      open('#/license');
    }
  });

  // An import can start or end while the dialog is open; the license state can change too.
  const watch = new MutationObserver(sync);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-busy'] });
  window.addEventListener('folio-license-state', sync);
  d.addEventListener('close', () => {
    watch.disconnect();
    window.removeEventListener('folio-license-state', sync);
    d.remove();
  });
  document.body.append(d);
  render();
  d.showModal();
}
