import { CanvasTexture, SRGBColorSpace } from 'three';
import { lang, mediaCountText } from '../i18n.js';
import { mediaCounts } from '../../shared/media.js';
import { formatRange } from '../../shared/dates.js';
import { fitText, SERIF } from './text.js';

const PX = 6; // canvas pixels per mm

// Dark ink on a light board; light ink (the dark theme's text colours) when the board shows a dark page.
const INK = {
  dark: { title: '#26323d', rule: 'rgba(38, 50, 61, 0.35)', small: '#56636f' },
  light: { title: '#e9ecef', rule: 'rgba(233, 236, 239, 0.35)', small: '#a7b0ba' },
};

// A see-through board (GPU) shows the page colour under it; the plain board (CPU) is always light.
export function titleInk(seeThrough) {
  if (!seeThrough) return INK.dark;
  const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? INK.light : INK.dark;
}

// The first left page when the book opens (v2 spec §8): name, a rule, the date range and the count.
export function titlePageText(album) {
  // formatRange(day) only skips capture times that cannot be read.
  const days = album.photos.map((p) => p.metadata?.takenAt?.local).filter((day) => formatRange(day)).sort();
  return {
    title: album.title,
    dates: formatRange(days[0], days.at(-1), { lang: lang() }),
    count: mediaCountText(mediaCounts(album.photos)),
  };
}

// Sizes are in mm; the context is already scaled.
export function drawTitlePage(ctx, { title, dates, count }, w, h, ink = INK.dark) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = ink.title;
  ctx.font = `600 11px ${SERIF}`;
  ctx.fillText(fitText(ctx, title, w - 24), w / 2, h / 2 - 8);
  ctx.fillStyle = ink.rule;
  ctx.fillRect(w / 2 - 14, h / 2 - 1.5, 28, 0.4);
  ctx.fillStyle = ink.small;
  ctx.font = `5.2px system-ui, sans-serif`;
  let y = h / 2 + 7;
  for (const line of [dates, count]) {
    if (!line) continue;
    ctx.fillText(fitText(ctx, line, w - 24), w / 2, y);
    y += 6;
  }
}

// paint(ink) redraws the page, e.g. when the theme changes under a see-through board.
export function createTitlePage(text, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const ctx = canvas.getContext('2d');
  ctx.scale(PX, PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const paint = (ink) => {
    drawTitlePage(ctx, text, w, h, ink);
    texture.needsUpdate = true;
  };
  return { texture, paint };
}
