import { api } from './api.js';
import { c } from './collection-text.js';
import { mediaCountText, t } from './i18n.js';
import { allowWrite } from './license.js';
import { openLightbox } from './lightbox.js';
import { dialog, icon, toast } from './ui.js';
import { mediaCounts } from '../shared/media.js';

export function renderTrash(app) {
  let alive = true;
  let entries = [];
  let busy = false;
  let preview = null;
  let request = 0;
  const selected = new Set();
  app.innerHTML = `<main class="page trash-page">
    <p class="crumb"><a href="#/albums">${t('albums')}</a><span>/</span><b>${c('trash')}</b></p>
    <header class="ph"><h1 class="t1">${c('trash')}</h1><span class="sp"></span><button class="btn danger" data-write data-act="purge-all" type="button">${c('purgeAll')}</button></header>
    <p class="trash-info">${c('trashInfo')}</p>
    <div class="trash-groups"></div><p class="empty trash-empty" hidden>${c('trashEmpty')}</p>
    <div class="batch-bar" hidden><span class="picked"></span><button class="btn" data-act="restore" data-write type="button">${c('restore')}</button><button class="btn danger" data-act="purge" data-write type="button">${c('purge')}</button></div>
    </main>`;
  const $ = (s) => app.querySelector(s);
  document.title = `${c('trash')} · ${t('app')}`;
  const photosOf = (entry) => entry.photos ?? entry.album?.photos ?? [];
  const urlOf = (entry, photo, size) => `/trash-media/${entry.id}/${photo.id}/${size}`;

  function renderSelection() {
    $('.batch-bar').hidden = !selected.size;
    $('.picked').textContent = t('selected', { n: selected.size });
    for (const button of app.querySelectorAll('button[data-act]')) button.disabled = busy || (!entries.length && button.dataset.act === 'purge-all');
  }

  function render() {
    const groups = $('.trash-groups');
    groups.replaceChildren();
    for (const [kind, title] of [['album', c('albumGroup')], ['photos', c('mediaGroup')]]) {
      const list = entries.filter((entry) => entry.kind === kind);
      if (!list.length) continue;
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = title;
      section.append(heading);
      for (const entry of list) {
        const row = document.createElement('article');
        row.className = 'trash-item';
        row.dataset.id = entry.id;
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected.has(entry.id);
        checkbox.setAttribute('aria-label', entry.albumTitle);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(entry.id);
          else selected.delete(entry.id);
          renderSelection();
        });
        const description = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = entry.albumTitle;
        const text = document.createElement('small');
        const remaining = Math.max(0, Math.ceil((Date.parse(entry.deletedAt) + 30 * 86400000 - Date.now()) / 86400000));
        text.textContent = `${mediaCountText(mediaCounts(photosOf(entry)))} · ${c('expires', { n: remaining })}`;
        description.append(name, text);
        label.append(checkbox, description);
        const photos = document.createElement('div');
        photos.className = 'trash-photos';
        photosOf(entry).forEach((photo, index) => {
          const button = document.createElement('button');
          button.className = 'trash-preview';
          button.type = 'button';
          button.setAttribute('aria-label', photo.name);
          const image = document.createElement('img');
          image.src = urlOf(entry, photo, 600);
          image.alt = '';
          image.loading = 'lazy';
          button.append(image);
          if (photo.kind === 'video') button.insertAdjacentHTML('beforeend', icon('play'));
          button.onclick = () => openPreview(entry, index);
          photos.append(button);
        });
        row.append(label, photos);
        section.append(row);
      }
      groups.append(section);
    }
    $('.trash-empty').hidden = entries.length > 0;
    for (const id of selected) if (!entries.some((entry) => entry.id === id)) selected.delete(id);
    renderSelection();
  }

  async function load() {
    const revision = ++request;
    try {
      const next = await api.trash();
      if (!alive || request !== revision) return;
      entries = next;
      render();
    } catch (error) { if (alive) toast(t('load-failed', { reason: error.message })); }
  }

  async function operate(action, ids, all = false, confirmed = false) {
    if (!allowWrite()) return false;
    if (busy || document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return false; }
    if (action === 'purge' && !confirmed && !(await dialog({
      title: c(all ? 'purgeAll' : 'purge'), text: c(all ? 'purgeAllConfirm' : 'purgeConfirm'),
      ok: c('purge'), danger: true,
    }))) return false;
    if (!alive || !allowWrite()) return false;
    if (busy || document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return false; }
    busy = true;
    document.documentElement.setAttribute('data-busy', '');
    renderSelection();
    try {
      if (action === 'restore') await api.restoreTrash(ids);
      else await api.purgeTrash(ids, all);
      preview?.close();
      preview = null;
      selected.clear();
      await load();
      window.dispatchEvent(new Event('folio-library-changed'));
      return true;
    } catch (error) { toast(t('failed', { reason: error.message })); return false; }
    finally {
      busy = false;
      document.documentElement.removeAttribute('data-busy');
      if (alive) renderSelection();
    }
  }

  function openPreview(entry, index) {
    preview?.close();
    preview = openLightbox({
      album: { id: entry.albumId, title: entry.albumTitle, photos: photosOf(entry) },
      index,
      onClose: () => { preview?.close(); preview = null; },
      onIndex: () => {},
      onAlbum: () => {},
      media: (photo, size) => urlOf(entry, photo, size),
      trashActions: { restore: () => operate('restore', [entry.id]), purge: () => operate('purge', [entry.id], false, true) },
    });
  }

  function onClick(event) {
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (action === 'restore') void operate('restore', [...selected]);
    else if (action === 'purge') void operate('purge', [...selected]);
    else if (action === 'purge-all') void operate('purge', [], true);
  }
  app.addEventListener('click', onClick);
  window.addEventListener('focus', load);
  load();
  return {
    canLeave() { if (busy) { toast(c('busy')); return false; } return true; },
    destroy() {
      alive = false;
      preview?.close();
      app.removeEventListener('click', onClick);
      window.removeEventListener('focus', load);
    },
  };
}
