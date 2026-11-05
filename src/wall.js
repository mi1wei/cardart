import { api } from './api.js';
import { folder, folderClick } from './folder.js';
import { albumTitle, collectDrop, pickedFolder } from './folder-files.js';
import { t } from './i18n.js';
import { createImporter } from './import-files.js';
import { onComputer } from './phone.js';
import { open } from './router.js';
import { dialog, icon, toast } from './ui.js';
import { allowWrite } from './license.js';
import { c, preference } from './collection-text.js';
import { showUndo } from './undo.js';
import { bindContextMenu } from './context-menu.js';

export function renderWall(app) {
  let alive = true;
  let loaded = false;
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
        <span class="wall-tools">
          <input class="wall-search" type="search" aria-label="${c('searchAlbums')}" placeholder="${c('searchAlbums')}">
          <label class="sort-label"><span>${c('sortBy')}</span><select class="wall-sort">${['updated', 'created', 'name'].map((value) => `<option value="${value}">${c(value)}</option>`).join('')}</select></label>
        </span>
        <button class="btn pri" type="button" data-write data-act="new" aria-label="${t('new-album')}">${icon('plus')}<span>${t('new-album')}</span></button>
      </header>
      <div class="folders">${'<div class="folder-skel" aria-hidden="true"><i></i><b></b></div>'.repeat(4)}</div>
      <div class="empty search-empty" hidden><p>${c('noResults')}</p><button class="btn" type="button" data-act="clear-search">${c('clear')}</button></div>
      <section class="welcome" aria-labelledby="welcome-title" hidden>
        <h2 id="welcome-title">${t('welcome-title')}</h2>
        <p class="welcome-lead">${t(onComputer ? 'welcome-lead' : 'welcome-lead-phone')}</p>
        <div class="welcome-panel">
          <span class="welcome-icon">${icon(onComputer ? 'upload' : 'bookOpen')}</span>
          ${onComputer ? `<h3 class="welcome-drop">${t('welcome-drop')}</h3><p class="welcome-drop-hint">${t('welcome-drop-hint')}</p>` : ''}
          <div class="welcome-acts">
            <button class="btn pri" type="button" data-write data-act="new">${icon('plus')}<span>${t('new-album')}</span></button>
            ${onComputer ? `<button class="btn" type="button" data-write data-act="import-folder">${icon('folder')}<span>${t('import-folder')}</span></button>` : ''}
          </div>
          <p class="welcome-formats">${t('formats')}</p>
        </div>
        <a class="welcome-trash" href="#/trash" hidden></a>
      </section>
      ${onComputer ? `<input class="folder-input" type="file" webkitdirectory hidden><div class="drop-hint" hidden><span>${icon('upload')}<b>${t('drop-hint')}</b></span></div>` : ''}
    </main>`;
  const wall = app.querySelector('.folders');
  const sub = app.querySelector('.sub');
  const importer = createImporter(app.querySelector('.page'), { finish: 'toast', onDone: load });
  const folderInput = app.querySelector('.folder-input');
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
      loaded = true;
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
    // An empty library gets the welcome page instead of an empty grid (polish spec §3.2).
    const empty = loaded && albums.length === 0;
    if (empty && query) {
      query = '';
      app.querySelector('.wall-search').value = '';
    }
    app.querySelector('.wall-tools').hidden = empty;
    const list = albums.filter((a) => a.title.toLocaleLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      return (sort === 'created' ? b.createdAt : b.updatedAt ?? b.createdAt).localeCompare(sort === 'created' ? a.createdAt : a.updatedAt ?? a.createdAt);
    });
    wall.replaceChildren(...list.map((a) => folder(a, { menu: true })));
    if (entries.length && !empty) {
      const card = document.createElement('a');
      card.className = 'trash-card';
      card.href = '#/trash';
      card.innerHTML = `${icon('trash')}<strong>${c('trash')}</strong><span>${c('trashCount', { n: entries.length })}</span>`;
      wall.append(card);
    }
    app.querySelector('.search-empty').hidden = !query || list.length > 0;
    app.querySelector('.welcome').hidden = !empty;
    const trashLink = app.querySelector('.welcome-trash');
    trashLink.hidden = !entries.length;
    trashLink.textContent = `${c('trash')} · ${c('trashCount', { n: entries.length })}`;
  }

  // Imports wait for other changes; one already running takes more files (polish spec §5).
  function canImport() {
    if (!allowWrite()) return false;
    if (mutating || (document.documentElement.hasAttribute('data-busy') && !importer.active)) { toast(c('busy')); return false; }
    return true;
  }

  // One album per folder, named after it and created when its turn comes; a folder with nothing to
  // import gets no album.
  function importFolders(groups) {
    const counted = (group) => group.files.length || group.unsupported || group.unreadable;
    const empty = groups.filter((group) => !counted(group));
    if (empty.length) toast(t('folder-empty', { names: empty.map((group) => group.name) }));
    for (const group of groups) {
      if (counted(group)) importInto(albumTitle(group.name, t('new-album-name')), group);
    }
  }

  // The new cards come with the summary (onDone), not as empty cards while their photos come in.
  function importInto(title, { files, skipped, unsupported = 0, unreadable }) {
    importer.add({
      album: async () => (await api.createAlbum(title)).id,
      label: title,
      files,
      notMedia: skipped,
      unsupported,
      unreadable,
    });
  }

  const closeMenu = () => app.querySelector('.menu')?.remove();

  async function runAction(action, a) {
    if (action === 'open' || action === '3d') return open(`#/a/${a.id}${action === '3d' ? '/3d' : ''}`);
    if (!['new', 'rename', 'delete', 'pdf'].includes(action) || !allowWrite()) return;
    if (mutating || document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
    let writing = false;
    let destination;
    try {
      if (action === 'pdf') {
        const album = await api.album(a.id);
        const { openPdfExport } = await import('./pdf-export.js');
        if (alive) openPdfExport(album);
        return;
      }
      let title;
      if (action === 'new') title = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
      else if (action === 'rename') title = await dialog({ title: t('rename-album'), value: a.title, ok: t('save') });
      else if (!await dialog({ title: t('delete-album'), text: t('delete-album-text', { name: a.title }), ok: t('delete'), danger: true })) return;
      if (action !== 'delete' && (!title || title === a?.title)) return;
      if (!alive || !allowWrite()) return;
      if (mutating || document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
      writing = true;
      mutating = true;
      document.documentElement.setAttribute('data-busy', '');
      if (action === 'new') destination = (await api.createAlbum(title)).id;
      else if (action === 'rename') await api.updateAlbum(a.id, { title });
      else {
        const result = await api.deleteAlbum(a.id);
        showUndo(result.trashId, load);
      }
      if (action !== 'new') await load();
    } finally {
      if (writing) { mutating = false; document.documentElement.removeAttribute('data-busy'); }
    }
    if (destination && alive) open(`#/a/${destination}`);
  }

  async function onClick(e) {
    const target = e.target.closest('[data-act]');
    const act = target?.dataset.act;
    if (act === 'clear-search') {
      query = '';
      app.querySelector('.wall-search').value = '';
      render();
      return;
    }
    if (act === 'import-folder') {
      if (canImport()) folderInput.click();
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
      } else await runAction(act, a);
    } catch (err) {
      toast(t('failed', { reason: err.message }));
    }
  }

  const closeContext = bindContextMenu(wall, '.folder', (element) => {
    const a = albums.find((album) => album.id === element.dataset.id);
    if (!a) return [];
    return [
      { id: 'open', label: t('context-open'), run: () => runAction('open', a) },
      { id: '3d', label: t('flip-3d'), disabled: !a.count, run: () => runAction('3d', a) },
      null,
      { id: 'rename', label: t('rename-album'), write: true, disabled: mutating, run: () => runAction('rename', a) },
      ...(onComputer ? [{ id: 'pdf', label: c('pdf'), write: true, disabled: mutating, run: () => runAction('pdf', a) }] : []),
      null,
      { id: 'delete', label: t('delete-album'), write: true, disabled: mutating, danger: true, run: () => runAction('delete', a) },
    ];
  });

  const onFocus = () => load();
  const onKey = (event) => { if (event.key === 'Escape') closeMenu(); };
  folderInput?.addEventListener('change', () => {
    const group = pickedFolder(folderInput.files);
    folderInput.value = '';
    if (!canImport()) return;
    if (group) importFolders([group]);
    else toast(t('folder-picked-empty'));
  });

  // Files dragged in from the computer (polish spec §5): each folder becomes an album, loose photos
  // get one album, named before anything is imported.
  const hint = app.querySelector('.drop-hint');
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  function onDragOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (document.querySelector('dialog[open]')) return;
    hint.hidden = false;
    clearTimeout(hint.timer);
    hint.timer = setTimeout(() => (hint.hidden = true), 150);
  }
  async function onDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    clearTimeout(hint.timer);
    hint.hidden = true;
    if (document.querySelector('dialog[open]') || !canImport()) return;
    const { folders, loose } = await collectDrop(e.dataTransfer); // takes the items before it awaits
    if (!alive) return;
    if (loose.files.length || loose.unreadable) {
      const n = loose.files.length + loose.unreadable;
      const title = await dialog({ title: t('new-album'), text: t('loose-new-album', { n }), value: t('new-album-name'), ok: t('create') });
      // Cancelling drops everything, the folders too.
      if (!title || !alive || !canImport()) return;
      importInto(albumTitle(title, t('new-album-name')), loose);
    } else if (!folders.length) {
      toast(t('nothing-to-import'));
      return;
    }
    importFolders(folders);
  }
  if (onComputer) {
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
  }
  app.addEventListener('click', onClick);
  window.addEventListener('focus', onFocus);
  window.addEventListener('keydown', onKey);
  window.addEventListener('folio-library-changed', onFocus);
  load();
  return {
    command(name) {
      if (name === 'new-album') app.querySelector('[data-act=new]').click();
      else if (name === 'import-folder' && canImport()) folderInput?.click();
    },
    // An import keeps the wall open (polish spec §5).
    canLeave() {
      if (!importer.active && !mutating) return true;
      toast(c('busy'));
      return false;
    },
    destroy() {
      closeContext();
      alive = false;
      importer.destroy();
      clearTimeout(hint?.timer);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('folio-library-changed', onFocus);
    },
  };
}
