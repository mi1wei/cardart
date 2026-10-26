import { CanvasTexture, SRGBColorSpace } from 'three';
import { DIM, POCKET, pocketX } from './layout.js';

// PVC palette from the original album.
const FILM = '#eef1f3';
const SEAM = '#f5f6f8';
const EDGE = 'rgba(255,255,255,0.9)';
const SHADE = 'rgba(24,31,40,0.16)';
const EMPTY = '#d5dbe1'; // a photo that has not arrived (or failed)
const PX = 4; // canvas pixels per mm

// Film, the full-page pocket with grey slots for the photos, and the ring holes.
function drawPage(ctx, face, page) {
  const x0 = pocketX(face);
  const y0 = DIM.top;
  ctx.fillStyle = FILM;
  ctx.fillRect(0, 0, DIM.W, DIM.H);

  // Welded seam around the pocket.
  const seam = [x0 - 1.6, y0 - 1.6, POCKET.w + 3.2, POCKET.h + 3.2];
  ctx.fillStyle = SEAM;
  ctx.fillRect(...seam);
  ctx.lineWidth = 0.22;
  ctx.strokeStyle = SHADE;
  ctx.strokeRect(...seam);
  ctx.fillStyle = FILM;
  ctx.fillRect(x0, y0, POCKET.w, POCKET.h);

  for (const r of page?.rects ?? []) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + POCKET.pad + r.x, y0 + POCKET.pad + r.y, r.w, r.h, 0.6);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 1.2 * PX; // shadow sizes are in canvas pixels
    ctx.shadowOffsetY = 0.25 * PX;
    ctx.fillStyle = EMPTY;
    ctx.fill();
    ctx.restore();
  }

  // Pocket mouth: a bright lip with a soft shade under it.
  ctx.fillStyle = SHADE;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x0, y0 + 2.38, POCKET.w, 0.5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = EDGE;
  ctx.fillRect(x0, y0 + 2.08, POCKET.w, 0.3);
  ctx.lineWidth = 0.22;
  ctx.strokeStyle = SHADE;
  ctx.strokeRect(x0, y0, POCKET.w, POCKET.h);

  const hx = face % 2 === 1 ? DIM.W - DIM.hole : DIM.hole;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = EDGE;
  for (const z of DIM.rings) {
    ctx.beginPath();
    ctx.arc(hx, DIM.H / 2 + z, DIM.holeR + 0.35, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const z of DIM.rings) {
    ctx.beginPath();
    ctx.arc(hx, DIM.H / 2 + z, DIM.holeR, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(0.3, 0.3, DIM.W - 0.6, DIM.H - 0.6);
}

// One album face. Photos are drawn into their slots as they arrive; the Image is then dropped.
// Backs are mirrored here, as sheet.js expects of every back map.
export function createPageTexture(face, page, photoUrl, onRedraw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DIM.W * PX);
  canvas.height = Math.round(DIM.H * PX);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / DIM.W, 0, 0, canvas.height / DIM.H, 0, 0);
  drawPage(ctx, face, page);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (face % 2 === 1) {
    texture.repeat.x = -1;
    texture.offset.x = 1;
  }
  let live = true;
  texture.addEventListener('dispose', () => (live = false));
  const x0 = pocketX(face) + POCKET.pad;
  const y0 = DIM.top + POCKET.pad;
  for (const r of page?.rects ?? []) {
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0 + r.x, y0 + r.y, r.w, r.h, 0.6);
      ctx.clip();
      ctx.drawImage(image, x0 + r.x, y0 + r.y, r.w, r.h);
      ctx.restore();
      texture.needsUpdate = true;
      onRedraw();
    };
    // 4 px/mm: a photo longer than 150 mm on the page needs more than the 600 image.
    image.src = photoUrl(r.i, Math.max(r.w, r.h) > 150 ? 1600 : 600);
  }
  return texture;
}
