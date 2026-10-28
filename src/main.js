import '@fontsource-variable/geist';
import './style.css';
import { renderAlbum } from './album.js';
import { renderHome } from './home.js';
import { lang, t } from './i18n.js';
import { createNav } from './nav.js';
import { start, swap } from './router.js';
import { fullscreenTip, icon, toast } from './ui.js';
import { renderWall } from './wall.js';
import { initLicense, renderLicense, refreshLicense } from './license.js';

lang(); // the cookie tells the server our language before the first request
const app = document.querySelector('#app');
let view = null;
let route = null;

// A language switch re-opens the current page (spec §10).
const nav = createNav(() => { show(route, true); void refreshLicense(); });
document.body.prepend(nav.el);
initLicense(nav.el);

// WeChat's browser cannot go full screen: point to Safari and the Home Screen (spec §9).
if (/MicroMessenger/i.test(navigator.userAgent)) {
  const tip = document.createElement('p');
  tip.className = 'wx-tip';
  tip.innerHTML = `<span>${fullscreenTip()}</span><button class="ibtn" type="button" aria-label="${t('close')}">${icon('close')}</button>`;
  tip.querySelector('button').onclick = () => tip.remove();
  document.body.prepend(tip);
}

function show(next, again = false, previousHash) {
  if (next.page === 'license' && document.documentElement.hasAttribute('data-busy')) {
    swap(previousHash || '#/albums');
    toast(t('license-wait-upload'));
    return;
  }
  route = next;
  const key = next.album ?? next.page;
  if (again || view?.key !== key) {
    view?.destroy();
    const page = next.album ? renderAlbum(app, next.album) : next.page === 'albums' ? renderWall(app) : next.page === 'license' ? renderLicense(app) : renderHome(app);
    view = { key, ...page };
    if (!again) scrollTo(0, 0);
  }
  view.update?.(next);
  nav.update(next.album ? 'albums' : next.page);
}

start((next, previousHash) => show(next, false, previousHash));
