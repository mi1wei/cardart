import { mediaUrl } from './api.js';
import { mediaCountText, t } from './i18n.js';
import { open } from './router.js';
import { icon } from './ui.js';
import { dateRange } from './collection-text.js';

// The see-through pocket (spec §7): up to three photos peek out, the cover in front; blank cards fill
// the empty slots. Thumbnails load lazily, so a big library does not fetch them all at once.
export function pocket(albumId, previews) {
  const pics = previews.map((p) => `<img alt="" loading="lazy" draggable="false" src="${mediaUrl(albumId, p.id, 600)}">`).reverse();
  while (pics.length < 3) pics.unshift('<i class="ghost"></i>');
  return `<span class="back"></span>${pics.join('')}<span class="front"></span><span class="notch"></span>`;
}

export function folder(a, { menu = false } = {}) {
  const el = document.createElement('article');
  el.className = 'folder';
  el.dataset.id = a.id;
  el.innerHTML = `
    <a class="pocket" href="#/a/${a.id}">${pocket(a.id, a.previews)}</a>
    <div class="meta"><h3></h3><span class="n"></span>${
      menu ? `<button class="ibtn" type="button" data-act="menu" aria-label="${t('more')}">${icon('more')}</button>` : ''
    }</div>`;
  el.querySelector('h3').textContent = a.title;
  el.querySelector('.n').textContent = a.count ? mediaCountText(a) : t('album-empty');
  el.querySelector('.pocket').setAttribute('aria-label', a.title);
  const dates = dateRange(a.dateRange, true);
  if (dates) {
    const text = document.createElement('span');
    text.className = 'folder-dates';
    text.textContent = dates;
    el.append(text);
  }
  // A photo that cannot be read becomes a blank card, not a broken image.
  for (const img of el.querySelectorAll('.pocket img')) {
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('i'), { className: 'ghost' }));
  }
  return el;
}

// A click anywhere on a card, except on its menu, opens the album.
export function folderClick(e) {
  const card = e.target.closest('.folder');
  if (!card || e.target.closest('[data-act=menu], .menu')) return false;
  e.preventDefault();
  open(`#/a/${card.dataset.id}`);
  return true;
}
