import { api } from './api.js';
import { folder, folderClick, pocket } from './folder.js';
import { t } from './i18n.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';
import { allowWrite } from './license.js';
import { c, preference } from './collection-text.js';
import { showUndo } from './undo.js';

export function renderWall(app) {
  let alive = true;
  let albums = [];
  let entries = [];
  let request = 0;
  let mutating = false;
  let query = '';
  let sort = preference('album-sort', ['updated', 'created', 'name'], 'updated');
  document.title = `${t('albums')} · ${t('app')}`;
  app.innerHTML = `
    <main class="page">
      <header class="ph">
        <div><h1 class="t1">${t('albums')}</h1><p class="sub" hidden></p></div>
        <span class="sp"></span>
        <input class="wall-search" type="search" aria-label="${c('searchAlbums')}" placeholder="${c('searchAlbums')}">
        <select class="wall-sort" aria-label="${c('wallSort')}">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select>
        <button class="btn pri" type="button" data-write data-act="new" aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span></button>
      </header>
      <div class="folders">${'<div class="folder-skel" aria-hidden="true"><i></i><b></b></div>'.repeat(4)}</div>
      <div class="empty search-empty" hidden><p>${c('noResults')}</p><button class="btn" type="button" data-act="clear-search">${c('clear')}</button></div>
      <div class="empty" hidden>
        <div class="pocket">${pocket('', [])}</div>
        <p>${t('no-albums')}</p>
        <button class="btn pri" type="button" data-write data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
      </div>
    </main>`;
  const wall = app.querySelector('.folders');
  const sub = app.querySelector('.sub');
  app.querySelector('.wall-sort').value = sort;
  app.querySelector('.wall-sort').addEventListener('change', (event) => {
    sort = event.target.value;
    try { localStorage.setItem('album-sort', sort); } catch {}
    render();
  });
  app.querySelector('.wall-search').addEventListener('input', (event) => {
    query = event.target.value.trim().toLocaleLowerCase();
    render();
  });

  async function load() {
    const revision = ++request;
    try {
      const [list, trash] = await Promise.all([api.albums(), api.trash()]);
      if (!alive || request !== revision) return;
      albums = list;
      entries = trash;
      render();
      sub.textContent = t('stats', { a: albums.length,
        p: albums.reduce((n, a) => n + (a.photoCount ?? a.count - (a.videoCount ?? 0)), 0),
        v: albums.reduce((n, a) => n + (a.videoCount ?? 0), 0) });
      sub.hidden = albums.length === 0;
    } catch (err) {
      if (!alive) return;
      wall.querySelectorAll('.folder-skel').forEach((node) => node.remove());
      toast(t('load-failed', { reason: err.message }));
    }
  }

  function render() {
    const list = albums.filter((a) => a.title.toLocaleLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      return (sort === 'created' ? b.createdAt : b.updatedAt ?? b.createdAt).localeCompare(sort === 'created' ? a.createdAt : a.updatedAt ?? a.createdAt);
    });
    wall.replaceChildren(...list.map((a) => folder(a, { menu: true })));
    if (entries.length) {
      const card = document.createElement('a');
      card.className = 'trash-card';
      card.href = '#/trash';
      card.innerHTML = `${icon('trash')}<strong>${c('trash')}</strong><span>${c('trashCount', { n: entries.length })}</span>`;
      wall.append(card);
    }
    app.querySelector('.search-empty').hidden = !query || list.length > 0;
    app.querySelector('.empty:not(.search-empty)').hidden = albums.length > 0 || !!query || entries.length > 0;
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    if (act === 'clear-search') {
      query = '';
      app.querySelector('.wall-search').value = '';
      render();
      return;
    }
    if (['new', 'rename', 'delete'].includes(act) && !allowWrite()) return;
    if (['new', 'rename', 'delete'].includes(act) && (mutating || document.documentElement.hasAttribute('data-busy'))) { toast(c('busy')); return; }
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
            `<div class="menu" role="menu"><button type="button" data-write data-act="rename">${t('rename')}</button><button type="button" data-write class="red" data-act="delete">${t('delete-album')}</button></div>`,
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
        if (!(await dialog({ title: t('delete-album'), text, ok: t('delete'), danger: true })) || !alive || !allowWrite()) return;
        if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
        mutating = true;
        const result = await api.deleteAlbum(a.id);
        showUndo(result.trashId, load);
        load();
      }
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    } finally { mutating = false; }
  }

  const onFocus = () => load();
  const onKey = (event) => { if (event.key === 'Escape') closeMenu(); };
  app.addEventListener('click', onClick);
  window.addEventListener('focus', onFocus);
  window.addEventListener('keydown', onKey);
  window.addEventListener('folio-library-changed', onFocus);
  load();
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('folio-library-changed', onFocus);
    },
  };
}
