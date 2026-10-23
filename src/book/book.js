import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createBinder } from './binder.js';
import { DIM, cardAt, sheetCount } from './layout.js';
import { createStage } from './scene.js';
import { createSheet, restHoleAngle } from './sheet.js';
import { createFaceTexture } from './textures.js';

const { W, H, T } = DIM;
const PI = Math.PI;
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createBook(container, { album, insets, onChange, onCardClick }) {
  const { cards } = album;
  const S = sheetCount(cards.length);
  const binder = createBinder({ sheets: S, title: album.title });
  const stage = createStage(container, binder.xb + binder.B, insets);
  const { scene, camera, renderer } = stage;
  const canvas = renderer.domElement;
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
    sheet.front.userData.face = 2 * i;
    sheet.back.userData.face = 2 * i + 1;
    scene.add(sheet.group);
    sheets.push(sheet);
  }

  // Leaf 0 is the cover, leaf j ≥ 1 is sheet j − 1. Leaves j < k lie on the left.
  const leaves = Array.from({ length: S + 1 }, (_, j) => ({ th: j === 0 ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 }));
  let k = 1;
  let ringX = 0;
  let pointer = null;
  let drag = null;
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
    const moving = step(last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60);
    place();
    stage.render();
    last = moving || drag ? now : 0;
    if (last) raf = requestAnimationFrame(tick);
  }

  function requestRender() {
    if (!disposed && !raf) raf = requestAnimationFrame(tick);
  }

  // Pointer input: drag a leaf, fling it, or tap a card / either side.
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
    if (v > 0.9 || (progress > 0.22 && v >= -0.05)) setK(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
  }

  function tap(e, p) {
    if (k === 0) return setK(1);
    aim(e);
    const [first] = raycaster.intersectObjects(sheets.flatMap((s) => [s.front, s.back]), false);
    if (first) {
      const { face } = first.object.userData;
      const u = face % 2 ? 1 - first.uv.x : first.uv.x;
      const index = cardAt(face, u * W, (1 - first.uv.y) * H, cards.length);
      if (index >= 0) return onCardClick({ ...cards[index], index });
    }
    setK(p.x < ringX ? k - 1 : k + 1);
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
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      sheets.forEach((s) => s.dispose());
      binder.dispose();
      stage.dispose();
    },
  };
}
