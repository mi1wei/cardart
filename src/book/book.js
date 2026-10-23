import { createBinder } from './binder.js';
import { DIM, sheetCount } from './layout.js';
import { createStage } from './scene.js';
import { createSheet, restHoleAngle } from './sheet.js';
import { createFaceTexture } from './textures.js';

const { T } = DIM;
const PI = Math.PI;
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createBook(container, { album, insets, onChange }) {
  const { cards } = album;
  const S = sheetCount(cards.length);
  const binder = createBinder({ sheets: S, title: album.title });
  const stage = createStage(container, binder.xb + binder.B, insets);
  const { scene, renderer } = stage;
  scene.add(binder.group);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sheets = [];
  for (let i = 0; i < S; i++) {
    const [front, back] = [2 * i, 2 * i + 1].map((face) => {
      const texture = createFaceTexture(face, cards, requestRender);
      texture.anisotropy = anisotropy;
      return texture;
    });
    const sheet = createSheet(front, back);
    scene.add(sheet.group);
    sheets.push(sheet);
  }

  // Leaf 0 is the cover, leaf j ≥ 1 is sheet j − 1. Leaves j < k lie on the left.
  const leaves = Array.from({ length: S + 1 }, (_, j) => ({ th: j === 0 ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 }));
  let k = 1;
  let raf = 0;
  let last = 0;
  let disposed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const atRest = (leaf) => leaf.w === 0 && leaf.b === 0 && leaf.bv === 0 && (leaf.th === 0 || leaf.th === PI);

  function setK(next) {
    next = Math.max(0, Math.min(S + 1, next));
    if (next === k) return;
    // Leaves that change side leave one after another, nearest to the current spread first.
    const order = next > k ? leaves.slice(k, next) : leaves.slice(next, k).reverse();
    order.forEach((leaf, i) => {
      leaf.wait = atRest(leaf) ? i * 0.06 : 0;
    });
    k = next;
    onChange({ spread: k, spreads: S + 1, closed: k === 0 });
    requestRender();
  }

  // Advances every leaf by dt seconds; returns true while anything still moves.
  function step(dt) {
    let moving = false;
    leaves.forEach((leaf, j) => {
      const goal = j < k ? PI : 0;
      if (reduced.matches) {
        Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0, wait: 0 });
        return;
      }
      if (leaf.wait > 0) {
        leaf.wait = Math.max(0, leaf.wait - dt);
        moving = true;
        return;
      }
      const n = Math.ceil(dt * 120);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        leaf.w += (-81 * (leaf.th - goal) - 16.2 * leaf.w) * h;
        leaf.th += leaf.w * h;
        if (leaf.th < 0 || leaf.th > PI) {
          leaf.th = Math.min(PI, Math.max(0, leaf.th));
          leaf.w = 0;
        }
        if (j === 0) continue; // the cover does not bend
        leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * h;
        leaf.b += leaf.bv * h;
        leaf.b = Math.min(PI - leaf.th, Math.max(-leaf.th, leaf.b));
      }
      const still = Math.abs(leaf.w) < 1e-2 && Math.abs(leaf.b) < 1e-3 && Math.abs(leaf.bv) < 1e-2;
      if (still && Math.abs(leaf.th - goal) < 1e-3) Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
      else moving = true;
    });
    return moving;
  }

  function place() {
    const c = leaves[0].th / PI;
    const { C } = binder.pose(c);
    sheets.forEach((sheet, i) => {
      const { th, b } = leaves[i + 1];
      const psiR = restHoleAngle(C[1], binder.R, (S - i - 0.5) * T);
      const psiL = PI - restHoleAngle(C[1], binder.R, (i + 0.5) * T);
      sheet.update(C, binder.R, psiR + (th / PI) * (psiL - psiR), th, b);
    });
    stage.frame(binder.closedCenter * (1 - smoothstep(c)), 1 + 0.15 * Math.sin(PI * c));
  }

  function tick(now) {
    raf = 0;
    const moving = step(last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60);
    place();
    stage.render();
    last = moving ? now : 0;
    if (last) raf = requestAnimationFrame(tick);
  }

  function requestRender() {
    if (!disposed && !raf) raf = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(() => {
    stage.resize();
    requestRender();
  });
  observer.observe(container);
  stage.resize();
  place();
  requestRender();
  onChange({ spread: k, spreads: S + 1, closed: false });

  return {
    next: () => setK(k + 1),
    prev: () => setK(k - 1),
    toggleCover: () => setK(k > 0 ? 0 : 1),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      sheets.forEach((s) => s.dispose());
      binder.dispose();
      stage.dispose();
    },
  };
}
