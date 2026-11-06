import { t } from './i18n.js';
import { lt } from './lightbox-text.js';

export function createFilmstrip(root, media, navigate) {
  const strip = document.createElement('nav');
  strip.className = 'lb-filmstrip';
  strip.setAttribute('aria-label', lt('filmstrip'));
  root.querySelector('.lb-preview').append(strip);
  const events = new AbortController();
  let timer;
  let key;
  const reveal = () => {
    root.classList.remove('lb-idle');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!strip.contains(document.activeElement)) root.classList.add('lb-idle');
    }, 2000);
  };
  for (const name of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin', 'input']) {
    root.addEventListener(name, reveal, { passive: true, signal: events.signal });
  }
  strip.addEventListener('focusout', reveal, { signal: events.signal });
  strip.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (button) navigate(Number(button.dataset.index));
  }, { signal: events.signal });
  reveal();
  return {
    reveal,
    set(photos, index) {
      const nextKey = photos.map((photo) => `${photo.id}/${photo.sha256}/${photo.name}`).join('|');
      if (key !== nextKey) {
        key = nextKey;
        strip.replaceChildren(...photos.map((photo, i) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.index = String(i);
          button.dataset.kind = photo.kind === 'video' ? 'video' : 'photo';
          button.setAttribute('aria-label', `${i + 1} · ${photo.name}${photo.kind === 'video' ? ` · ${t('video')}` : ''}`);
          const image = new Image();
          image.src = media(photo, 600);
          image.alt = '';
          image.draggable = false;
          image.loading = 'lazy';
          button.append(image);
          if (photo.kind === 'video') {
            const marker = document.createElement('span');
            marker.className = 'lb-film-play';
            marker.textContent = '▶';
            marker.setAttribute('aria-hidden', 'true');
            button.append(marker);
          }
          return button;
        }));
      }
      for (const [i, button] of [...strip.children].entries()) button.setAttribute('aria-current', String(i === index));
      strip.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center' });
      reveal();
    },
    dispose() { clearTimeout(timer); events.abort(); strip.remove(); },
  };
}
