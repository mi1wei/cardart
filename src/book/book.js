import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createBinder } from './binder.js';
import { DIM, layoutPortraitPage, photoAt } from './layout.js';
import { createStage } from './scene.js';
import { createSheet, restHoleAngle } from './sheet.js';
import { createPageTexture } from './textures.js';
import { drawTitlePage } from './title-page.js';

const { W, H, T } = DIM;
const PI = Math.PI;
const DRAWN = 20; // leaves drawn at once (spec §11)
const MIDDLE = 11; // local k with ten leaves on each side
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createBook(container, { title, titlePage = null, pages, photoUrl, itemInfo = () => null, insets, startSpread = 1, startSide = 1, single = false, onChange, onPhotoClick, onBlankTap = () => false }) {
  const G = Math.max(1, Math.ceil(pages.length / 2)); // leaves in the whole album
  const S = Math.min(DRAWN, G); // leaves drawn
  const binder = createBinder({ sheets: S, title, titlePage });
  // Without WebGL there is no book; the binder already follows the theme, so let it go.
  let stage;
  try { stage = createStage(container, binder.xb + binder.B, insets, () => requestRender()); }
  catch (error) { binder.dispose(); throw error; }
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
  const portraitSheets = Array.from({ length: 2 }, () => {
    const sheet = createSheet(blank[0], blank[1]);
    sheet.front.userData = { portrait: true };
    sheet.group.visible = false;
    scene.add(sheet.group);
    return sheet;
  });
  const portraitTextures = new Map();
  let portraitHeight = H;
  let portraitTurn = null;

  // Leaf 0 is the cover; leaf j ≥ 1 is drawn sheet j − 1 and shows album leaf o + j − 1.
  // Leaves j < k lie on the left. The album spread is o + k, or 0 when closed.
  const idle = (j, kk) => ({ th: j < kk ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 });
  const leaves = Array.from({ length: S + 1 }, (_, j) => idle(j, 1));
  let o = 0;
  let k = 1;
  let ringX = 0;
  let side = 1;
  const pageHalf = () => (binder.xb + binder.B) / 2;
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
  const pageNo = () => (k === 0 ? 0 : 2 * spread() - (side < 0 ? 1 : 0));
  const report = () => onChange({ spread: spread(), spreads: G + 1, closed: k === 0, page: pageNo(), pages: 2 * G + 1, single });

  function portraitTexture(page, face = 0) {
    const key = face % 2 ? -page : page;
    if (!portraitTextures.has(key)) {
      const layout = layoutPortraitPage(pages[page - 2], portraitHeight);
      const texture = createPageTexture(face, layout ?? null, photoUrl, requestRender, itemInfo, portraitHeight);
      texture.anisotropy = anisotropy;
      if (page === 1) {
        const context = texture.image.getContext('2d');
        context.save();
        context.translate(22, 16);
        drawTitlePage(context, titlePage ?? { title, dates: '', count: '' }, W - 44, portraitHeight - 32);
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#eef1f3';
        context.fillRect(0, 0, W - 44, portraitHeight - 32);
        context.restore();
        texture.needsUpdate = true;
      }
      portraitTextures.set(key, texture);
    }
    return portraitTextures.get(key);
  }

  function refreshPortraitTextures() {
    const availableWidth = Math.max(1, container.clientWidth - 24);
    const availableHeight = Math.max(1, container.clientHeight - insets.top - insets.bottom - 44);
    // Match camera framing, which includes the board and spine as well as the sheet.
    const height = single ? Math.round(Math.max(H, 2 * pageHalf() * availableHeight * .8 / availableWidth) * 2) / 2 : H;
    if (portraitHeight !== height) {
      for (const texture of portraitTextures.values()) texture.dispose();
      portraitTextures.clear();
      portraitHeight = height;
    }
    const want = new Set();
    if (single && k > 0) {
      for (const page of [pageNo() - 1, pageNo(), pageNo() + 1, portraitTurn?.from, portraitTurn?.to]) {
        if (page >= 1 && page <= 2 * G + 1) want.add(page);
      }
    }
    if (single && (k === 0 || leaves[0].th < PI * .999)) {
      for (const face of textures.keys()) want.add(face % 2 ? -(face + 2) : face + 2);
    }
    for (const [page, texture] of portraitTextures) {
      if (want.has(page)) continue;
      texture.dispose();
      portraitTextures.delete(page);
    }
    for (const page of want) portraitTexture(Math.abs(page), page < 0 ? 1 : 0);
  }

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
    refreshPortraitTextures();
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
    side = s > spread() ? -1 : 1; // forward lands on the new left page, back on the right one
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
  function jump(s, at = 1, turn = null) {
    s = Math.max(1, Math.min(G + 1, Math.round(s)));
    pointer = drag = null;
    portraitTurn = turn;
    o = Math.max(0, Math.min(G - S, s - MIDDLE));
    k = s - o;
    side = s === G + 1 ? -1 : at; // the last spread has no right page
    leaves.forEach((leaf, j) => Object.assign(leaf, idle(j, k)));
    report();
    refreshTextures();
  }

  // From the cover: if the window has not got back to the start yet, jump there.
  const open = () => (o > 0 ? jump(1, -1) : setSpread(1));

  function preparePortraitTurn(direction) {
    const from = pageNo();
    const to = from + direction;
    if (to < 1 || to > 2 * G + 1) return null;
    const start = direction > 0 ? 0 : PI;
    return {
      from, to, direction, start, goal: start,
      leaf: { th: start, w: 0, b: 0, bv: 0, wait: 0 },
    };
  }

  function commitPortraitTurn() {
    const turn = portraitTurn;
    turn.goal = turn.direction > 0 ? PI : 0;
    jump(Math.floor((turn.to + 1) / 2), turn.to % 2 ? -1 : 1, turn);
  }

  function turnPortrait(direction) {
    portraitTurn = null;
    if (pageNo() === 1 && direction < 0) return setSpread(0);
    portraitTurn = preparePortraitTurn(direction);
    if (portraitTurn) commitPortraitTurn();
  }

  function nextPage() {
    if (k === 0) return open();
    turnPortrait(1);
  }

  function prevPage() {
    if (k === 0) return;
    turnPortrait(-1);
  }

  const setLocal = (kk) => setSpread(kk === 0 ? 0 : o + kk);

  function advanceLeaf(leaf, goal, dt, dragged, cover = false) {
    if (reduced.matches) {
      Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0, wait: 0 });
      return false;
    }
    const steps = Math.ceil(dt * 120);
    const interval = dt / steps;
    for (let count = 0; count < steps; count++) {
      leaf.w += (-81 * (leaf.th - goal) - 16.2 * leaf.w) * interval;
      leaf.th += leaf.w * interval;
      if (leaf.th < 0 || leaf.th > PI) {
        leaf.th = Math.min(PI, Math.max(0, leaf.th));
        leaf.w = 0;
      }
      if (cover) continue;
      if (dragged) {
        leaf.b = goal - leaf.th;
        leaf.bv = 0;
      } else {
        leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * interval;
        leaf.b += leaf.bv * interval;
      }
      leaf.b = Math.min(PI - leaf.th, Math.max(-leaf.th, leaf.b));
    }
    const still = Math.abs(leaf.w) < 1e-2 && Math.abs(leaf.b) < 1e-3 && Math.abs(leaf.bv) < 1e-2;
    if (!dragged && still && Math.abs(leaf.th - goal) < 1e-3) {
      Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
      return false;
    }
    return true;
  }

  // Advances every leaf by dt seconds; returns true while anything still moves.
  function step(dt) {
    let moving = false;
    leaves.forEach((leaf, j) => {
      const dragged = !drag?.portrait && drag?.j === j;
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
      if (advanceLeaf(leaf, goal, dt, dragged, j === 0)) moving = true;
    });
    if (portraitTurn) {
      const dragged = !!drag?.portrait;
      if (advanceLeaf(portraitTurn.leaf, dragged ? drag.edge : portraitTurn.goal, dt, dragged)) moving = true;
      else if (!dragged) portraitTurn = null;
    }
    return moving;
  }

  function place() {
    refreshPortraitTextures();
    const scale = single ? portraitHeight / H : 1;
    binder.group.scale.z = scale;
    for (const name of ['cover-title', 'title-page']) {
      const label = binder.group.getObjectByName(name);
      if (label) label.scale.z = 1 / scale;
    }
    const c = leaves[0].th / PI;
    const { C } = binder.pose(c);
    const portrait = single && k > 0 && c > .999;
    sheets.forEach((sheet, i) => {
      sheet.group.scale.z = scale;
      sheet.group.visible = !portrait;
      if (!portrait) {
        const face = 2 * (o + i);
        sheet.front.material.map = single && textures.has(face) ? portraitTexture(face + 2) : textures.get(face) ?? blank[0];
        sheet.back.material.map = single && textures.has(face + 1) ? portraitTexture(face + 3, 1) : textures.get(face + 1) ?? blank[1];
      }
      const { th, b } = leaves[i + 1];
      const psiR = restHoleAngle(C[1], binder.R, (S - i - 0.5) * T);
      const psiL = PI - restHoleAngle(C[1], binder.R, (i + 0.5) * T);
      sheet.update(C, binder.R, psiR + (th / PI) * (psiL - psiR), th, b);
    });
    portraitSheets[0].group.visible = portrait;
    portraitSheets[1].group.visible = portrait && !!portraitTurn;
    for (const sheet of portraitSheets) sheet.group.scale.z = scale;
    if (portrait) {
      const base = portraitSheets[0];
      const height = (S - .5) * T;
      base.front.material.map = portraitTexture(portraitTurn ? (portraitTurn.direction > 0 ? portraitTurn.to : portraitTurn.from) : pageNo());
      base.update(C, binder.R, restHoleAngle(C[1], binder.R, height), 0, 0);
      if (portraitTurn) {
        const turn = portraitSheets[1];
        const { th, b } = portraitTurn.leaf;
        turn.front.material.map = portraitTexture(portraitTurn.direction > 0 ? portraitTurn.from : portraitTurn.to);
        const psiR = restHoleAngle(C[1], binder.R, height + T * .2);
        const psiL = PI - restHoleAngle(C[1], binder.R, height + T * .2);
        turn.update(C, binder.R, psiR + (th / PI) * (psiL - psiR), th, b);
      }
    }
    ringX = C[0];
    const opened = smoothstep(c);
    const zoom = 1 + 0.15 * Math.sin(PI * c);
    if (single) stage.frame(binder.closedCenter * (1 - opened) + pageHalf() * opened, zoom, pageHalf(), portraitHeight + DIM.HB - H);
    else stage.frame(binder.closedCenter * (1 - opened), zoom);
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    // Keep slow frames in real time; step() already integrates them in 120 Hz substeps.
    const moving = step(last ? Math.min(1, (now - last) / 1000) : 1 / 60);
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
    if (single && k > 0) {
      portraitTurn = null;
      pointer.portrait = true;
      leaves.forEach((leaf, index) => Object.assign(leaf, idle(index, k)));
      requestRender();
    }
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0;
    if (p.portrait) {
      if (!drag && Math.hypot(dx, e.clientY - p.y0) < p.slop) return;
      if (!drag && (p.vertical || Math.abs(e.clientY - p.y0) >= Math.abs(dx))) {
        p.vertical = true;
        return;
      }
      const direction = dx < 0 ? 1 : -1;
      if (pageNo() === 1 && direction < 0) {
        portraitTurn = null;
        drag = null;
        p.samples = [];
        p.portrait = false;
        p.j = 0;
        p.fromRight = false;
      } else {
        if (!drag || portraitTurn?.direction !== direction) {
          portraitTurn = preparePortraitTurn(direction);
          p.fromRight = direction > 0;
          p.edge0 = direction > 0 ? 0 : PI;
          p.scale = pxPerMm();
        }
        drag = p;
        p.edge = Math.acos(Math.min(1, Math.max(-1, Math.cos(p.edge0) + dx / p.scale / W)));
        p.samples.push([e.timeStamp, e.clientX]);
        if (p.samples.length > 20) p.samples.shift();
        refreshPortraitTextures();
        requestRender();
        return;
      }
    }
    if (p.j < 0) return;
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

  function shouldTurn(p, e) {
    p.samples.push([e.timeStamp, e.clientX]);
    const [t0, x0] = p.samples.find(([t]) => e.timeStamp - t <= 100);
    const dt = (e.timeStamp - t0) / 1000;
    const vx = dt > 0 ? (e.clientX - x0) / p.scale / W / dt : 0; // sheet widths per second, rightwards
    const v = p.fromRight ? -vx : vx;
    const progress = p.fromRight ? p.edge / PI : 1 - p.edge / PI;
    return v > 0.9 || (progress > 0.22 && v >= -0.05);
  }

  function release(p, e) {
    if (shouldTurn(p, e)) {
      setLocal(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
      return true;
    }
    return false;
  }

  function tap(e, p) {
    if (k === 0) return open();
    aim(e);
    const targets = single ? [portraitSheets[0].front] : sheets.flatMap((s) => [s.front, s.back]);
    const [first] = raycaster.intersectObjects(targets, false);
    if (first) {
      const { i, back } = first.object.userData;
      const face = single ? pageNo() - 2 : 2 * (o + i) + (back ? 1 : 0);
      const u = back ? 1 - first.uv.x : first.uv.x;
      const layout = single ? layoutPortraitPage(pages[face], portraitHeight) : pages[face];
      const index = photoAt(layout, single ? 0 : face, u * W, (1 - first.uv.y) * (single ? portraitHeight : H));
      if (index >= 0) return onPhotoClick(index);
    }
    if (onBlankTap(e)) return;
    if (single) return p.x < pageHalf() ? prevPage() : nextPage();
    setSpread(spread() + (p.x < ringX ? -1 : 1));
  }

  function onUp(e) {
    const p = pointer;
    if (!p || e.pointerId !== p.id) return;
    pointer = null;
    if (drag) {
      drag = null;
      if (p.portrait) {
        if (portraitTurn) {
          if (e.type === 'pointerup' && shouldTurn(p, e)) commitPortraitTurn();
          else portraitTurn.goal = portraitTurn.start;
        }
      } else if (e.type === 'pointerup') release(p, e);
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
  jump(startSpread, startSide);
  place();

  return {
    next: () => (single ? nextPage() : k === 0 ? open() : setSpread(spread() + 1)),
    prev: () => (single ? prevPage() : setSpread(spread() - 1)),
    toggleCover: () => {
      portraitTurn = null;
      return k > 0 ? setSpread(0) : open();
    },
    jump,
    setSingle(on) {
      if (single === on) return;
      pointer = drag = null;
      portraitTurn = null;
      single = on;
      if (spread() === G + 1) side = -1;
      leaves.forEach((leaf, index) => Object.assign(leaf, idle(index, k)));
      refreshPortraitTextures();
      report();
      requestRender();
    },
    redraw: requestRender,
    stats: () => ({ offset: o, textures: textures.size + portraitTextures.size }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      sheets.forEach((s) => s.dispose());
      portraitSheets.forEach((sheet) => sheet.dispose());
      for (const texture of [...textures.values(), ...blank]) texture.dispose();
      for (const texture of portraitTextures.values()) texture.dispose();
      binder.dispose();
      stage.dispose();
    },
  };
}
