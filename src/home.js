import posterUrl from './assets/home-book.jpg';
import videoUrl from './assets/home-book.mp4';
import { api } from './api.js';
import { folder, folderClick } from './folder.js';
import { t } from './i18n.js';
import { onComputer, openPhoneDialog } from './phone.js';
import { icon, toast } from './ui.js';

const still = matchMedia('(prefers-reduced-motion: reduce)');
const FEATURES = [['laptop', 'f1'], ['bookOpen', 'f2'], ['layout', 'f3'], ['phone', 'f4']];

// The home page (spec §6): what the app is for, the recorded book, and the newest albums.
export function renderHome(app) {
  let alive = true;
  document.title = t('app');
  // The title's line break is for phones only; on wider screens CSS hides it.
  const title = t('hero-title').replace('\n', '<br>');
  app.innerHTML = `
    <main class="home">
      <section class="hero">
        <p class="eyebrow"><span class="dot"></span><b>${t('local-albums')}</b><span>·</span><span>${t('no-upload')}</span><span class="stats" hidden><span class="rule"></span><span class="n"></span></span></p>
        <h1 class="h1">${title}</h1>
        <p class="lead">${t('hero-lead')}</p>
        <div class="ctas">
          <a class="cta dark" href="#/albums">${t('open-albums')}${icon('arrow')}</a>
          ${onComputer ? `<button class="cta text" type="button" data-act="phone">${t('view-on-phone')}</button>` : ''}
        </div>
        ${
          still.matches
            ? `<img class="home-book" alt="" src="${posterUrl}">`
            : `<video class="home-book" src="${videoUrl}" poster="${posterUrl}" muted loop playsinline autoplay aria-hidden="true"></video>`
        }
      </section>
      <section class="sec">
        <h2>${t('what-it-does')}</h2>
        <div class="feats">${FEATURES.map(([ic, k]) => `<div class="feat"><span class="ic">${icon(ic)}</span><h3>${t(`${k}-title`)}</h3><p>${t(`${k}-text`)}</p></div>`).join('')}</div>
      </section>
      <section class="sec recent" hidden>
        <div class="sec-h"><h2>${t('recent')}</h2><a class="more" href="#/albums">${t('all-albums')} →</a></div>
        <div class="folders"></div>
      </section>
      <footer class="sec"><div class="foot"><span class="logo"><i>${icon('book')}</i>${t('app')}</span><span>${t('footer')}</span></div></footer>
    </main>`;
  app.querySelector('video')?.play().catch(() => {});

  api.albums().then(
    (list) => {
      if (!alive || !list.length) return;
      app.querySelector('.stats .n').textContent = t('stats', { a: list.length, p: list.reduce((n, a) => n + a.count, 0) });
      app.querySelector('.stats').hidden = false;
      app.querySelector('.recent .folders').replaceChildren(...list.slice(0, 4).map((a) => folder(a)));
      app.querySelector('.recent').hidden = false;
    },
    (err) => alive && toast(t('load-failed', { reason: err.message })),
  );

  function onClick(e) {
    if (folderClick(e)) return;
    if (e.target.closest('[data-act=phone]')) openPhoneDialog();
  }
  app.addEventListener('click', onClick);
  return {
    destroy() {
      alive = false;
      app.removeEventListener('click', onClick);
    },
  };
}
