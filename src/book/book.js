import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createBinder } from './binder.js';
import { DIM, photoAt } from './layout.js';
import { createStage } from './scene.js';
import { createSheet, restHoleAngle } from './sheet.js';
import { createPageTexture } from './textures.js';

const { W, H, T } = DIM;
const PI = Math.PI;
const DRAWN = 20; // leaves drawn at once (spec §11)
const MIDDLE = 11; // local k with ten leaves on each side
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createBook(container, { title, pages, photoUrl, itemInfo = () => null, insets, startSpread = 1, onChange, onPhotoClick }) {
  const G = Math.max(1, Math.ceil(pages.length / 2)); // leaves in the whole album
  const S = Math.min(DRAWN, G); // leaves drawn
  const binder = createBinder({ sheets: S, title });
  const stage = createStage(container, binder.xb + binder.B, insets);
  const { scene, camera, renderer } = stage;
  const canvas = renderer.domElement;
  scene.add(binder.group);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const blank = [0, 1].map((face) => createPageTexture(face, null, photoUrl, () => {}, itemInfo));
  const textures = new Map(); // album face → texture, only around the current spread
  const sheets = [];
  for (let i = 0; i < S; i++) {
    const sheet = createSheet(blank[0], blank[1]);
    sheet.front.userData = { i, back: false };
    sheet.back.userData = { i, back: true };
    scene.add(sheet.group);
    sheets.push(sheet);
  }

  // Leaf 0 is the cover; leaf j ≥ 1 is drawn sheet j − 1 and shows album leaf o + j − 1.
  // Leaves j < k lie on the left. The album spread is o + k, or 0 when closed.
  const idle = (j, kk) => ({ th: j < kk ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 });
  const leaves = Array.from({ length: S + 1 }, (_, j) => idle(j, 1));
  let o = 0;
  let k = 1;
  let ringX = 0;
  let pointer = null;
  let drag = null;
  let raf = 0;
  let last = 0;
  let disposed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const atRest = (leaf) => leaf.w === 0 && leaf.b === 0 && leaf.bv === 0 && (leaf.th === 0 || leaf.th === PI);
  // At rest on the side it belongs to: a leaf told to turn but not yet moving is not settled.
  const settled = (leaf, j) => atRest(leaf) && leaf.wait === 0 && leaf.th === (j < k ? PI : 0);
  const spread = () => (k === 0 ? 0 : o + k);
  const report = () => onChange({ spread: spread(), spreads: G + 1, closed: k === 0 });

  // Real pages for the spreads around the current one; every other face shows the blank film.
  function refreshTextures() {
    const s = Math.max(1, spread());
    const want = new Set();
    for (let t = s - 2; t <= s + 2; t++) {
      for (const f of [2 * t - 3, 2 * t - 2]) if (f >= 0 && f < 2 * G) want.add(f);
    }
    for (const [f, texture] of textures) {
      if (want.has(f)) continue;
      texture.dispose();
      textures.delete(f);
    }
    for (const f of want) {
      if (textures.has(f)) continue;
      const texture = createPageTexture(f, pages[f] ?? null, photoUrl, requestRender, itemInfo);
      texture.anisotropy = anisotropy;
      textures.set(f, texture);
    }
    sheets.forEach((sheet, i) => {
      sheet.front.material.map = textures.get(2 * (o + i)) ?? blank[0];
      sheet.back.material.map = textures.get(2 * (o + i) + 1) ?? blank[1];
    });
    requestRender();
  }

  // Keeps the current spread in the middle of the drawn leaves (spec §11). Leaf states shift
  // with the window, so the visible spread stays put and the piles change by a sheet or so.
  function recenter() {
    if (drag || pointer) return;
    const target = Math.max(0, Math.min(G - S, spread() - MIDDLE));
    const d = target - o;
    if (!d) return;
    // Leaves that drop out: the bottom of the left pile (d > 0) or of the right pile (d < 0).
    const first = d > 0 ? 1 : Math.max(1, S + 1 + d);
    const lastOut = d > 0 ? Math.min(S, d) : S;
    for (let j = first; j <= lastOut; j++) if (!settled(leaves[j], j)) return;
    const kept = leaves.slice(1);
    const kNext = k === 0 ? 0 : k - d;
    for (let j = 1; j <= S; j++) leaves[j] = kept[j + d - 1] ?? idle(j, kNext);
    o = target;
    k = kNext;
    refreshTextures();
  }

  function setSpread(s) {
    s = Math.max(0, Math.min(G + 1, s));
    if (s === spread()) return;
    recenter();
    const next = s === 0 ? 0 : s - o;
    if (s > 0 && (next < 1 || next > S + 1)) return; // the drawn leaves cannot follow yet
    // Leaves that change side leave one after another, nearest to the current spread first.
    const order = next > k ? leaves.slice(k, next) : leaves.slice(next, k).reverse();
    order.forEach((leaf, i) => {
      leaf.wait = atRest(leaf) ? i * 0.06 : 0;
    });
    k = next;
    report();
    refreshTextures();
  }

  // Straight to an album spread, without turning pages.
  function jump(s) {
    s = Math.max(1, Math.min(G + 1, Math.round(s)));
    pointer = drag = null;
    o = Math.max(0, Math.min(G - S, s - MIDDLE));
    k = s - o;
    leaves.forEach((leaf, j) => Object.assign(leaf, idle(j, k)));
    report();
    refreshTextures();
  }

  // From the cover: if the window has not got back to the start yet, jump there.
  const open = () => (o > 0 ? jump(1) : setSpread(1));
  const setLocal = (kk) => setSpread(kk === 0 ? 0 : o + kk);

  // Advances every leaf by dt seconds; returns true while anything still moves.
  function step(dt) {
    let moving = false;
    leaves.forEach((leaf, j) => {
      const dragged = drag?.j === j;
      const goal = dragged ? drag.edge : j < k ? PI : 0;
      if (reduced.matches) {
        Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0, wait: 0 });
        return;
      }
      if (leaf.wait > 0 && !dragged) {
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
        if (dragged) {
          leaf.b = goal - leaf.th;
          leaf.bv = 0;
        } else {
          leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * h;
          leaf.b += leaf.bv * h;
        }
        leaf.b = Math.min(PI - leaf.th, Math.max(-leaf.th, leaf.b));
      }
      const still = Math.abs(leaf.w) < 1e-2 && Math.abs(leaf.b) < 1e-3 && Math.abs(leaf.bv) < 1e-2;
      if (!dragged && still && Math.abs(leaf.th - goal) < 1e-3) Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
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
    ringX = C[0];
    stage.frame(binder.closedCenter * (1 - smoothstep(c)), 1 + 0.15 * Math.sin(PI * c));
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    const moving = step(last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60);
    recenter();
    place();
    stage.render();
    last = moving || drag ? now : 0;
    if (last) requestRender(); // recenter() may have asked for this frame already: one loop only
  }

  function requestRender() {
    if (!disposed && !raf) raf = requestAnimationFrame(tick);
  }

  // Pointer input: drag a leaf, fling it, or tap a photo / either side.
  const raycaster = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const ndc = new Vector2();
  const hit = new Vector3();

  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    raycaster.setFromCamera(ndc, camera);
  }

  function pxPerMm() {
    const a = new Vector3(0, 0, 0).project(camera);
    const b = new Vector3(W, 0, 0).project(camera);
    return (Math.abs(b.x - a.x) * canvas.clientWidth) / 2 / W;
  }

  function onDown(e) {
    if (pointer || e.button !== 0) return;
    aim(e);
    const x = raycaster.ray.intersectPlane(floor, hit) ? hit.x : ringX;
    let j = k - 1;
    if (k === 0) j = 0;
    else if (x >= ringX) j = k <= S ? k : -1;
    const slop = e.pointerType === 'mouse' ? 5 : 9;
    pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x, j, fromRight: j >= k, slop, samples: [] };
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id || p.j < 0) return;
    const dx = e.clientX - p.x0;
    if (!drag) {
      if (Math.hypot(dx, e.clientY - p.y0) < p.slop) return;
      const leaf = leaves[p.j];
      p.edge0 = leaf.th + leaf.b;
      p.scale = pxPerMm();
      drag = p;
    }
    p.edge = Math.acos(Math.min(1, Math.max(-1, Math.cos(p.edge0) + dx / p.scale / W)));
    p.samples.push([e.timeStamp, e.clientX]);
    if (p.samples.length > 20) p.samples.shift();
    requestRender();
  }

  function release(p, e) {
    p.samples.push([e.timeStamp, e.clientX]);
    const [t0, x0] = p.samples.find(([t]) => e.timeStamp - t <= 100);
    const dt = (e.timeStamp - t0) / 1000;
    const vx = dt > 0 ? (e.clientX - x0) / p.scale / W / dt : 0; // sheet widths per second, rightwards
    const v = p.fromRight ? -vx : vx;
    const progress = p.fromRight ? p.edge / PI : 1 - p.edge / PI;
    if (v > 0.9 || (progress > 0.22 && v >= -0.05)) setLocal(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
  }

  function tap(e, p) {
    if (k === 0) return open();
    aim(e);
    const [first] = raycaster.intersectObjects(sheets.flatMap((s) => [s.front, s.back]), false);
    if (first) {
      const { i, back } = first.object.userData;
      const face = 2 * (o + i) + (back ? 1 : 0);
      const u = back ? 1 - first.uv.x : first.uv.x;
      const index = photoAt(pages[face], face, u * W, (1 - first.uv.y) * H);
      if (index >= 0) return onPhotoClick(index);
    }
    setSpread(spread() + (p.x < ringX ? -1 : 1));
  }

  function onUp(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id) return;
    pointer = null;
    if (drag) {
      drag = null;
      release(p, e);
    } else if (e.type === 'pointerup' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < p.slop) {
      tap(e, p); // a swipe that turned no leaf (e.g. past the last spread) is not a tap
    }
    requestRender();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const observer = new ResizeObserver(() => {
    stage.resize();
    requestRender();
  });
  observer.observe(container);
  stage.resize();
  jump(startSpread);
  place();

  return {
    next: () => (k === 0 ? open() : setSpread(spread() + 1)),
    prev: () => setSpread(spread() - 1),
    toggleCover: () => (k > 0 ? setSpread(0) : open()),
    jump,
    stats: () => ({ offset: o, textures: textures.size }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      sheets.forEach((s) => s.dispose());
      for (const texture of [...textures.values(), ...blank]) texture.dispose();
      binder.dispose();
      stage.dispose();
    },
  };
}
