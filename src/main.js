import '@fontsource-variable/geist';
import './style.css';
import './collection.css';
import { renderAlbum } from './album.js';
import { lang, t } from './i18n.js';
import { createNav } from './nav.js';
import { initDesktop } from './desktop.js';
import { start, swap, open } from './router.js';
import { fullscreenTip, icon, toast, dialog } from './ui.js';
import { renderWall } from './wall.js';
import { renderTrash } from './trash.js';
import { initLicense, renderLicense, refreshLicense, canWrite, allowWrite } from './license.js';
import { api } from './api.js';
import { theme, setTheme } from './theme.js';
import { commandAllowed } from '../shared/commands.js';
import { openShortcuts, initShortcuts } from './shortcuts.js';

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
  if (view?.canLeave && !view.canLeave(next, again)) {
    if (previousHash) swap(previousHash);
    return;
  }
  route = next;
  const key = next.album ?? next.page;
  if (again || view?.key !== key) {
    view?.destroy();
    const page = next.album ? renderAlbum(app, next.album) : next.page === 'trash' ? renderTrash(app) : next.page === 'license' ? renderLicense(app) : renderWall(app);
    view = { key, ...page };
    if (!again) scrollTo(0, 0);
  }
  view.update?.(next);
}

function desktopContext() {
  return {
    page: route?.page ?? 'albums',
    busy: document.documentElement.hasAttribute('data-busy'),
    appearance: theme(), density: view?.desktopContext?.().density ?? 'm',
  };
}

async function command(name) {
  if (!commandAllowed(name, desktopContext(), canWrite())) return;
  if (document.querySelector('dialog[open]') && !name.startsWith('appearance-')) return;
  try {
    if (name.startsWith('appearance-')) setTheme(name.slice('appearance-'.length));
    else if (name === 'settings') nav.settings();
    else if (name === 'shortcuts') openShortcuts();
    else if (name === 'license') open('#/license');
    else if (name === 'import-folder') {
      if (route?.page !== 'albums') open('#/albums');
      if (route?.page === 'albums') view?.command?.(name);
    } else if (name === 'new-album' && route?.page !== 'albums') {
      const next = { page: 'albums', album: null, photo: null, three: false };
      if (view?.canLeave && !view.canLeave(next, false)) return;
      const title = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
      if (!title || !allowWrite() || desktopContext().busy || (view?.canLeave && !view.canLeave(next, false))) return;
      open(`#/a/${(await api.createAlbum(title)).id}`);
    } else view?.command?.(name);
  } catch (error) { toast(t('failed', { reason: error.message })); }
}

initDesktop({ onCommand: command, getContext: desktopContext });
initShortcuts();
start((next, previousHash) => show(next, false, previousHash));
