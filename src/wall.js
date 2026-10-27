import { api, mediaUrl } from './api.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';
import { t } from './i18n.js';
import { openPhoneDialog } from './phone.js';

// Phone access is set up on the computer only (spec §12).
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function renderWall(app) {
  let alive = true;
  let albums = [];
  document.title = `${t('albums')} · ${t('app')}`;
  app.innerHTML = `
    <main class="mgr">
      <header class="bar">
        <h1 class="brand"><span class="logo">${icon('book')}</span>${t('albums')}</h1>
        <span class="sp"></span>
        ${local ? `<button class="btn" type="button" data-act="phone">${icon('phone')}<span>${t('phone-access')}</span></button>` : ''}
        <button class="btn pri" type="button" data-act="new" aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span></button>
      </header>
      <div class="wall"></div>
      <p class="empty" hidden>${t('no-albums')}</p>
    </main>`;
  const wall = app.querySelector('.wall');

  async function load() {
    try {
      const list = await api.albums();
      if (!alive) return;
      albums = list;
      wall.replaceChildren(...albums.map(card));
      app.querySelector('.empty').hidden = albums.length > 0;
    } catch (err) {
      if (alive) toast(t('load-failed', { reason: err.message }));
    }
  }

  function card(a) {
    const el = document.createElement('article');
    el.className = 'album';
    el.dataset.id = a.id;
    el.innerHTML = `
      <a class="cover" href="#/a/${a.id}" data-act="open">${a.previews[0] ? `<img alt="" src="${mediaUrl(a.id, a.previews[0].id, 600)}">` : icon('book')}</a>
      <div class="meta">
        <div class="names"><h2></h2><p>${t('photos', { n: a.count })}</p></div>
        <button class="ibtn" type="button" data-act="menu" aria-label="${t('more')}">${icon('more')}</button>
      </div>`;
    el.querySelector('h2').textContent = a.title;
    return el;
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    const a = albums.find((x) => x.id === e.target.closest('.album')?.dataset.id);
    if (act !== 'menu') closeMenu();
    try {
      if (act === 'open') {
        e.preventDefault();
        open(`#/a/${a.id}`);
      } else if (act === 'menu') {
        const shown = target.parentElement.querySelector('.menu');
        closeMenu();
        if (!shown) {
          target.insertAdjacentHTML(
            'afterend',
            `<div class="menu" role="menu"><button type="button" data-act="rename">${t('rename')}</button><button type="button" class="red" data-act="delete">${t('delete-album')}</button></div>`,
          );
        }
      } else if (act === 'phone') {
        openPhoneDialog();
      } else if (act === 'new') {
        const title = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
        if (title) open(`#/a/${(await api.createAlbum(title)).id}`);
      } else if (act === 'rename') {
        const title = await dialog({ title: t('rename-album'), value: a.title, ok: t('save') });
        if (title && title !== a.title) await api.updateAlbum(a.id, { title });
        load();
      } else if (act === 'delete') {
        const text = t('delete-album-text', { name: a.title });
        if (await dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })) await api.deleteAlbum(a.id);
        load();
      }
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
  }

  const onFocus = () => load();
  app.addEventListener('click', onClick);
  window.addEventListener('focus', onFocus);
  load();
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', onFocus);
    },
  };
}
