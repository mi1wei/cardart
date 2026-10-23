import { CanvasTexture, SRGBColorSpace } from 'three';
import { DIM, cardPlacement, pocketRect } from './layout.js';

// PVC palette from the original album.
const FILM = '#eef1f3';
const SEAM = '#f5f6f8';
const EDGE = 'rgba(255,255,255,0.9)';
const SHADE = 'rgba(24,31,40,0.16)';
const PX = 4; // canvas pixels per mm

function drawCard(ctx, index, card, image) {
  const { cardW: w, cardH: h } = DIM;
  const p = cardPlacement(index);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, DIM.cardR);
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 1.2 * PX; // shadow sizes are in canvas pixels
  ctx.shadowOffsetY = 0.25 * PX;
  ctx.fillStyle = card.color || '#888';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  if (image) {
    const s = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const iw = image.naturalWidth * s;
    const ih = image.naturalHeight * s;
    ctx.drawImage(image, -iw / 2, -ih / 2, iw, ih);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '500 4.5px system-ui, sans-serif';
    ctx.fillText(`No.${String(index + 1).padStart(2, '0')}`, -w / 2 + 6, -h / 2 + 10);
    ctx.fillStyle = '#fff';
    ctx.font = '600 6px system-ui, sans-serif';
    ctx.fillText(card.title ?? '', -w / 2 + 6, h / 2 - 7);
  }
  ctx.restore();
}

export function createFaceTexture(face, cards, onRedraw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DIM.W * PX);
  canvas.height = Math.round(DIM.H * PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const images = new Map();
  const back = face % 2 === 1;

  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / DIM.W, 0, 0, canvas.height / DIM.H, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = FILM;
    ctx.fillRect(0, 0, DIM.W, DIM.H);

    // Welded seams around the pockets.
    const seam = [
      (back ? DIM.outer : DIM.spine) - 1.6,
      DIM.top - 1.6,
      2 * DIM.pocketW + DIM.gap + 3.2,
      3 * DIM.pocketH + 2 * DIM.gap + 3.2,
    ];
    ctx.fillStyle = SEAM;
    ctx.fillRect(...seam);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = SHADE;
    ctx.strokeRect(...seam);

    for (let slot = 0; slot < 6; slot++) {
      const r = pocketRect(face, slot);
      const index = face * 6 + slot;
      ctx.fillStyle = FILM;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (cards[index]) drawCard(ctx, index, cards[index], images.get(index));
      // Pocket mouth: a bright lip with a soft shade under it.
      ctx.fillStyle = SHADE;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(r.x, r.y + 2.38, r.w, 0.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = EDGE;
      ctx.fillRect(r.x, r.y + 2.08, r.w, 0.3);
      ctx.lineWidth = 0.22;
      ctx.strokeStyle = SHADE;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    const hx = back ? DIM.W - DIM.hole : DIM.hole;
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
  };

  draw();
  for (let slot = 0; slot < 6; slot++) {
    const index = face * 6 + slot;
    const src = cards[index]?.src;
    if (!src) continue;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      images.set(index, image);
      draw();
      texture.needsUpdate = true;
      onRedraw();
    };
    image.src = src;
  }
  return texture;
}
