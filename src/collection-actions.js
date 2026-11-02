import { api, mediaUrl } from './api.js';
import { c } from './collection-text.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';
import { dialog } from './ui.js';

export async function chooseAlbum(sourceId, mode = 'move') {
  const albums = await api.albums();
  const d = document.createElement('dialog');
  d.className = 'dlg album-picker';
  const title = document.createElement('h3');
  title.textContent = c('pickAlbum');
  d.append(title);
  const operation = document.createElement('select');
  operation.className = 'transfer-mode';
  operation.setAttribute('aria-label', c('move'));
  for (const value of ['move', 'copy']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = c(value);
    operation.append(option);
  }
  operation.value = mode;
  d.append(operation);
  for (const album of albums.filter((a) => a.id !== sourceId)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn album-target';
    button.dataset.target = album.id;
    button.textContent = album.title;
    d.append(button);
  }
  const actions = document.createElement('div');
  actions.className = 'dlg-acts';
  for (const [act, text] of [['new', c('newAlbum')], ['cancel', t('cancel')]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.dataset.action = act;
    button.textContent = text;
    actions.append(button);
  }
  d.append(actions);
  document.body.append(d);
  d.showModal();
  const choice = await new Promise((resolve) => {
    d.addEventListener('click', (event) => {
      const b = event.target.closest('button');
      if (b) d.close(b.dataset.target ?? b.dataset.action);
    });
    d.addEventListener('close', () => { resolve(d.returnValue); d.remove(); }, { once: true });
  });
  if (choice === 'new') {
    const name = await dialog({ title: t('new-album'), value: t('new-album-name'), ok: t('create') });
    if (!name || !allowWrite()) return null;
    return { id: (await api.createAlbum(name)).id, mode: operation.value };
  }
  return choice && choice !== 'cancel' ? { id: choice, mode: operation.value } : null;
}

export async function downloadPhotos(album, ids) {
  const photos = album.photos.filter((p) => ids.includes(p.id));
  if (!photos.length) throw new Error(t('album-missing'));
  const link = document.createElement('a');
  // Let the browser stream to disk: a multi-video ZIP must not be buffered in renderer memory.
  link.href = photos.length === 1
    ? `${mediaUrl(album.id, photos[0].id, 'original')}?download=1`
    : `/api/albums/${album.id}/photos/download?${new URLSearchParams({ ids: ids.join(',') })}`;
  link.download = photos.length === 1 ? photos[0].name : `${album.title}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
}
