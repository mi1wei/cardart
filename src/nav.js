import { t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { openSettings } from './settings.js';
import { brandLogo, icon } from './ui.js';

// The bar on top of every page (polish spec §3.3): the logo, phone access and Settings.
// `onLang` re-opens the current page in the new language.
export function createNav(onLang) {
  const el = document.createElement('nav');
  el.className = 'nav';

  function render() {
    el.setAttribute('aria-label', t('app'));
    el.innerHTML = `
      <a class="logo" href="#/albums">${brandLogo()}<span>${t('app')}</span></a>
      <span class="sp"></span>
      ${onComputer ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
      <button class="btn only-icon nav-settings" type="button" data-act="settings" aria-haspopup="dialog" aria-label="${t('settings')}" title="${t('settings')}">${icon('gear')}</button>`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=phone]')) openPhoneDialog();
    else if (e.target.closest('[data-act=settings]')) openSettings({ onLang: () => { render(); onLang(); } });
  });
  render();
  return { el };
}
