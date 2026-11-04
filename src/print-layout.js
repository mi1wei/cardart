import { DIM, POCKET, layoutPages, pocketX } from './book/layout.js';
import { formatRange } from '../shared/dates.js';

export function normalizePdfOptions(album, options = {}) {
  return {
    paper: options.paper === 'Letter' ? 'Letter' : 'A4',
    perPage: [1, 2, 3].includes(Number(options.perPage)) ? Number(options.perPage) : ([1, 2, 3].includes(album.perPage) ? album.perPage : 2),
    quality: options.quality === 'high' ? 'high' : 'standard',
    cover: options.cover !== false,
    captions: options.captions !== false,
  };
}

export function buildPrintModel(album, options = {}, language = 'en') {
  options = normalizePdfOptions(album, options);
  const photos = album.photos.map((photo) => ({
    ...photo,
    video: photo.kind === 'video',
    caption: options.captions ? photo.note || '' : '',
    url: `/media/${encodeURIComponent(album.id)}/${encodeURIComponent(photo.id)}/${options.quality === 'high' && photo.kind !== 'video' && /\.(jpe?g|png|webp|avif)$/i.test(photo.file || '') ? 'original' : '1600'}`,
  }));
  const aspects = photos.map((photo) => {
    const aspect = photo.w / photo.h;
    return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  });
  const dates = photos.map((photo) => photo.metadata?.takenAt?.local).filter((day) => formatRange(day)).sort();
  const range = album.dateRange || (dates.length ? { from: dates[0], to: dates.at(-1) } : null);
  const pages = layoutPages(aspects, options.perPage).map((page, face) => ({
    kind: 'photos', face, rects: page.rects, photos: page.rects.map((rect) => photos[rect.i]),
  }));
  if (options.cover) pages.unshift({ kind: 'cover', photo: photos.find((photo) => photo.id === album.cover) || photos[0] });
  return {
    title: album.title,
    dateRange: formatRange(range?.from, range?.to, { lang: language }),
    options, pages, paper: options.paper === 'Letter' ? { width: 279.4, height: 215.9 } : { width: 297, height: 210 },
  };
}

export function renderPrintPage(model, page, videoLabel = 'Video') {
  const sheet = document.createElement('section');
  sheet.className = `print-sheet ${page.kind === 'cover' ? 'print-cover' : 'print-photos'}`;
  sheet.style.width = `${model.paper.width}mm`;
  sheet.style.height = `${model.paper.height}mm`;
  if (page.kind === 'cover') {
    if (page.photo) {
      const image = document.createElement('img');
      image.src = page.photo.url;
      image.alt = '';
      sheet.append(image);
      if (page.photo.video) {
        const label = document.createElement('span');
        label.className = 'print-cover-video';
        label.textContent = videoLabel;
        sheet.append(label);
      }
    }
    const title = document.createElement('h1');
    title.textContent = model.title;
    const dates = document.createElement('p');
    dates.textContent = model.dateRange;
    sheet.append(title, dates);
    return sheet;
  }
  const face = document.createElement('div');
  face.className = 'print-face';
  face.style.left = `${(model.paper.width - DIM.W) / 2}mm`;
  face.style.top = `${(model.paper.height - DIM.H) / 2}mm`;
  page.rects.forEach((rect, index) => {
    const photo = page.photos[index];
    const figure = document.createElement('figure');
    figure.style.cssText = `left:${pocketX(page.face) + POCKET.pad + rect.x}mm;top:${DIM.top + POCKET.pad + rect.y}mm;width:${rect.w}mm;height:${rect.h}mm`;
    const image = document.createElement('img');
    image.src = photo.url;
    image.alt = '';
    figure.append(image);
    if (photo.video) {
      const label = document.createElement('span');
      label.className = 'print-video';
      label.textContent = videoLabel;
      figure.append(label);
    }
    if (photo.caption) {
      const caption = document.createElement('figcaption');
      caption.textContent = photo.caption;
      figure.append(caption);
    }
    face.append(figure);
  });
  sheet.append(face);
  return sheet;
}

export async function waitForPrintImages(root, signal) {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map((image) => image.decode()));
  await document.fonts.ready;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
