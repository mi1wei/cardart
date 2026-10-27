import { api } from './api.js';
import { folder, folderClick, pocket } from './folder.js';
import { t } from './i18n.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';

export function renderWall(app) {
  let alive = true;
  let albums = [];
  document.title = `${t('albums')} · ${t('app')}`;
  app.innerHTML = `
    <main class="page">
      <header class="ph">
        <div><h1 class="t1">${t('albums')}</h1><p class="sub" hidden></p></div>
        <span class="sp"></span>
        <button class="btn pri" type="button" data-act="new" aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span></button>
      </header>
      <div class="folders"></div>
      <div class="empty" hidden>
        <div class="pocket">${pocket('', [])}</div>
        <p>${t('no-albums')}</p>
        <button class="btn pri" type="button" data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
      </div>
    </main>`;
  const wall = app.querySelector('.folders');
  const sub = app.querySelector('.sub');

  async function load() {
    try {
      const list = await api.albums();
      if (!alive) return;
      albums = list;
      wall.replaceChildren(...albums.map((a) => folder(a, { menu: true })));
      sub.textContent = t('stats', { a: albums.length, p: albums.reduce((n, a) => n + a.count, 0) });
      sub.hidden = albums.length === 0;
      app.querySelector('.empty').hidden = albums.length > 0;
    } catch (err) {
      if (alive) toast(t('load-failed', { reason: err.message }));
    }
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    const a = albums.find((x) => x.id === e.target.closest('.folder')?.dataset.id);
    if (act !== 'menu') closeMenu();
    if (!act && folderClick(e)) return;
    try {
      if (act === 'menu') {
        const shown = target.parentElement.querySelector('.menu');
        closeMenu();
        if (!shown) {
          target.insertAdjacentHTML(
            'afterend',
            `<div class="menu" role="menu"><button type="button" data-act="rename">${t('rename')}</button><button type="button" class="red" data-act="delete">${t('delete-album')}</button></div>`,
          );
        }
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
