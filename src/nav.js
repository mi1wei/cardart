import { lang, setLang, t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { nextTheme, setTheme, theme, themeSupported } from './theme.js';
import { brandLogo, icon } from './ui.js';

const compact = matchMedia('(max-width: 600px)');
const THEMES = [['light', () => icon('sun')], ['dark', () => icon('moon')], ['auto', () => t('theme-auto')]];

// The bar on top of every page (spec §5). `onLang` re-opens the current page in the new language.
export function createNav(onLang) {
  const el = document.createElement('nav');
  el.className = 'nav';
  let page = 'home';

  function render() {
    el.setAttribute('aria-label', t('app'));
    el.innerHTML = `
      <a class="logo" href="#/albums">${brandLogo()}<span>${t('app')}</span></a>
      <a class="nl" href="#/albums" data-page="albums">${t('albums')}</a>
      ${onComputer ? `<a class="nl" href="#/license" data-page="license">${t('license-manage')}</a>` : ''}
      <span class="sp"></span>
      ${onComputer ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
      ${themeSupported() ? `<span class="theme" role="group" aria-label="${t('theme')}">${THEMES.map(([mode, label]) =>
        `<button type="button" data-theme-mode="${mode}" aria-label="${t(`theme-${mode}`)}" title="${t(`theme-${mode}`)}">${label()}</button>`).join('')}</span>` : ''}
      <span class="lang" role="group" aria-label="${t('language')}"><button type="button" data-lang="zh" lang="zh-CN">中</button><button type="button" data-lang="en" lang="en">EN</button></span>`;
    update(page);
  }

  function update(next) {
    page = next;
    for (const a of el.querySelectorAll('.nl')) {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    for (const b of el.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
    for (const b of el.querySelectorAll('[data-theme-mode]')) b.setAttribute('aria-pressed', String(b.dataset.themeMode === theme()));
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-page=license]') && document.documentElement.hasAttribute('data-busy')) { e.preventDefault(); return; }
    if (e.target.closest('[data-act=phone]')) return openPhoneDialog();
    const mode = e.target.closest('[data-theme-mode]')?.dataset.themeMode;
    if (mode) {
      // On phones only the current mode shows; tapping it moves on to the next one.
      setTheme(mode === theme() && compact.matches ? nextTheme(mode) : mode);
      update(page);
      return;
    }
    const next = e.target.closest('[data-lang]')?.dataset.lang;
    // While photos import, the page must not be rebuilt: the rest of the queue would be lost (spec §10).
    if (!next || next === lang() || document.documentElement.hasAttribute('data-busy')) return;
    setLang(next);
    render();
    onLang();
  });
  render();
  return { el, update };
}
