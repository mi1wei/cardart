// Sizes in mm (1 scene unit = 1 mm), measured from the original album.
export const DIM = {
  W: 209.8, // sheet width: 22 + 2 × 89.4 + 3.4 + 5.6
  H: 192.4, // sheet height: 6.4 + 3 × 57.6 + 2 × 3.4 + 6.4
  cardW: 85.6,
  cardH: 54,
  cardR: 3.18,
  pocketW: 89.4,
  pocketH: 57.6,
  gap: 3.4,
  spine: 22, // margin on the ring side
  outer: 5.6, // margin on the outer side
  top: 6.4,
  hole: 9.2, // hole centre to the inner edge
  holeR: 3.1,
  rings: [-81, -27, 27, 81], // ring positions along the spine (z)
  T: 1.05, // sheet thickness
  CT: 1.6, // board thickness
  HB: 206.4, // board height: H + 14
  h: 5, // hinge arc length
  drop: 2.2, // spine drop when open
  wire: 1.6, // ring wire radius
};

// One full-page clear pocket per face (spec §10); photos sit inside with padding and gaps.
export const POCKET = { w: DIM.W - DIM.spine - DIM.outer, h: DIM.H - 2 * DIM.top, pad: 5, gap: 4, minSide: 30 };
const BOX_W = POCKET.w - 2 * POCKET.pad; // 172.2
const BOX_H = POCKET.h - 2 * POCKET.pad; // 169.6

// perPage → average photos per page and the most one page may hold.
export const PER_PAGE = { 1: { avg: 1, max: 1 }, 2: { avg: 2, max: 3 }, 3: { avg: 3, max: 4 } };

// Left edge of the pocket on a face as seen; fronts (even faces) have the rings on the left.
export const pocketX = (face) => (face % 2 === 0 ? DIM.spine : DIM.outer);

// Spread that shows page p: spread 1 is the inside of the cover and page 0.
export const spreadOfPage = (p) => Math.floor((p + 1) / 2) + 1;

// Every order-keeping split tree of photos s..e−1. At height h a tree is a·h + b wide, gaps included.
function trees(aspects, s, e, memo) {
  const key = s * 1024 + e;
  let out = memo.get(key);
  if (out) return out;
  out = [];
  if (e - s === 1) out.push({ i: s, a: aspects[s], b: 0 });
  else {
    for (let m = s + 1; m < e; m++) {
      for (const A of trees(aspects, s, m, memo)) {
        for (const B of trees(aspects, m, e, memo)) {
          out.push({ row: true, A, B, a: A.a + B.a, b: A.b + B.b + POCKET.gap });
          const a = 1 / (1 / A.a + 1 / B.a);
          out.push({ row: false, A, B, a, b: a * (A.b / A.a + B.b / B.a - POCKET.gap) });
        }
      }
    }
  }
  memo.set(key, out);
  return out;
}

// Top down: a row shares the height, a column shares the width.
function place(node, x, y, w, h, out) {
  if (node.i !== undefined) out.push({ i: node.i, x, y, w, h });
  else if (node.row) {
    const wA = node.A.a * h + node.A.b;
    place(node.A, x, y, wA, h, out);
    place(node.B, x + wA + POCKET.gap, y, w - wA - POCKET.gap, h, out);
  } else {
    const hA = (w - node.A.b) / node.A.a;
    place(node.A, x, y, w, hA, out);
    place(node.B, x, y + hA + POCKET.gap, w, h - hA - POCKET.gap, out);
  }
  return out;
}

// The fullest page for photos s..e−1, centred; shared pages keep every short side ≥ 30 mm.
function bestPage(aspects, s, e, memo, cache, boxHeight = BOX_H) {
  const key = s * 1024 + e;
  if (cache.has(key)) return cache.get(key);
  let best = null;
  for (const t of trees(aspects, s, e, memo)) {
    const h = Math.min(boxHeight, (BOX_W - t.b) / t.a);
    const w = t.a * h + t.b;
    if (!(w > 0 && h > 0)) continue;
    const rects = place(t, (BOX_W - w) / 2, (boxHeight - h) / 2, w, h, []);
    if (e - s > 1 && rects.some((r) => Math.min(r.w, r.h) < POCKET.minSide)) continue;
    const fill = rects.reduce((sum, r) => sum + r.w * r.h, 0) / (BOX_W * boxHeight);
    if (!best || fill > best.fill) best = { fill, rects };
  }
  cache.set(key, best);
  return best;
}

// Exactly P pages of at most `max` photos with the highest total fill (spec §10); P grows
// when the 30 mm rule makes it impossible. `before` (last chunk only) keeps the total even.
function layoutChunk(aspects, avg, max, before) {
  const n = aspects.length;
  const memo = new Map();
  const cache = new Map();
  let P = Math.max(Math.ceil(n / avg), Math.ceil(n / max));
  if (before !== null && (before + P) % 2 && P < n) P++;
  for (;; P++) {
    let cost = new Array(n + 1).fill(Infinity);
    cost[0] = 0;
    const from = [];
    for (let p = 0; p < P; p++) {
      const next = new Array(n + 1).fill(Infinity);
      const back = new Array(n + 1).fill(-1);
      for (let j = 1; j <= n; j++) {
        for (let k = 1; k <= Math.min(max, j); k++) {
          if (cost[j - k] === Infinity) continue;
          const page = bestPage(aspects, j - k, j, memo, cache);
          if (page && cost[j - k] + 1 - page.fill < next[j]) {
            next[j] = cost[j - k] + 1 - page.fill;
            back[j] = j - k;
          }
        }
      }
      cost = next;
      from.push(back);
    }
    if (cost[n] === Infinity) continue; // one photo per page always works, so this ends
    const pages = [];
    for (let p = P - 1, j = n; p >= 0; p--) {
      const s = from[p][j];
      pages.unshift(bestPage(aspects, s, j, memo, cache));
      j = s;
    }
    return pages;
  }
}

// The whole album as one run of pages, computed in chunks of 40 × avg photos.
export function layoutPages(aspects, perPage) {
  const { avg, max } = PER_PAGE[perPage] ?? PER_PAGE[2];
  const size = 40 * avg;
  const out = [];
  for (let start = 0; start < aspects.length; start += size) {
    const last = start + size >= aspects.length;
    for (const page of layoutChunk(aspects.slice(start, start + size), avg, max, last ? out.length : null)) {
      out.push({ fill: page.fill, rects: page.rects.map((r) => ({ ...r, i: r.i + start })) });
    }
  }
  return out;
}

export function layoutPortraitPage(page, height) {
  if (!page?.rects?.length) return page;
  const aspects = page.rects.map((rect) => rect.w / rect.h);
  const fitted = bestPage(aspects, 0, aspects.length, new Map(), new Map(), height - 2 * DIM.top - 2 * POCKET.pad);
  return { ...fitted, rects: fitted.rects.map((rect) => ({ ...rect, i: page.rects[rect.i].i })) };
}

// Photo index at (x, y) mm on a face that shows `page`, or −1.
export function photoAt(page, face, x, y) {
  const x0 = pocketX(face) + POCKET.pad;
  const y0 = DIM.top + POCKET.pad;
  for (const r of page?.rects ?? []) {
    if (x >= x0 + r.x && x <= x0 + r.x + r.w && y >= y0 + r.y && y <= y0 + r.y + r.h) return r.i;
  }
  return -1;
}
