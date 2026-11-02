import { CanvasTexture, SRGBColorSpace } from 'three';
import { lang, mediaCountText } from '../i18n.js';
import { mediaCounts } from '../../shared/media.js';
import { fitText, SERIF } from './text.js';

const PX = 6; // canvas pixels per mm

// The first left page when the book opens (v2 spec §8): name, a rule, the date range and the count.
export function titlePageText(album) {
  const days = album.photos
    .map((p) => p.metadata?.takenAt?.local?.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? ''))
    .sort();
  let dates = '';
  if (days.length) {
    const day = (d) => new Date(`${d}T00:00:00Z`);
    const format = new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const [first, last] = [days[0], days.at(-1)];
    dates = first === last ? format.format(day(first)) : format.formatRange(day(first), day(last));
  }
  return { title: album.title, dates, count: mediaCountText(mediaCounts(album.photos)) };
}

// Sizes are in mm; the context is already scaled.
export function drawTitlePage(ctx, { title, dates, count }, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#26323d';
  ctx.font = `600 11px ${SERIF}`;
  ctx.fillText(fitText(ctx, title, w - 24), w / 2, h / 2 - 8);
  ctx.fillStyle = 'rgba(38, 50, 61, 0.35)';
  ctx.fillRect(w / 2 - 14, h / 2 - 1.5, 28, 0.4);
  ctx.fillStyle = '#56636f';
  ctx.font = `4.2px system-ui, sans-serif`;
  let y = h / 2 + 7;
  for (const line of [dates, count]) {
    if (!line) continue;
    ctx.fillText(fitText(ctx, line, w - 24), w / 2, y);
    y += 6;
  }
}

export function createTitleTexture(text, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const ctx = canvas.getContext('2d');
  ctx.scale(PX, PX);
  drawTitlePage(ctx, text, w, h);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
