# 3D 卡册翻页查看器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地复刻 cardart.cc「Flip through in 3D」的四环活页卡册：入口页加全屏 3D 查看器。支持拖拽、甩动、点击和键盘翻页，点卡看详情，开合封面。

**Architecture:** 入口页 `src/main.js` 读取 `public/cards.json`，点击按钮后懒加载 `src/viewer.js`，由它负责覆盖层 UI 和键盘。查看器调用 `src/book/book.js` 的 `createBook`，组装五个模块：`layout`（纯尺寸计算）、`sheet`（活页截面与顶点）、`binder`（活页夹与封面姿态）、`textures`（每面的 Canvas 贴图）、`scene`（渲染器、灯光、环境、镜头）。每一叶的翻转角由弹簧驱动，只在有东西在动时才渲染。

**Tech Stack:** Vite 8.3、three 0.186（WebGL、`MeshPhysicalMaterial`、VSM 阴影）、原生 JS ES 模块、CSS。检查脚本需要 Node ≥ 22（用到全局 `fetch` 和 `WebSocket`，本机为 v26），并通过 DevTools 协议驱动无头 Google Chrome（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）。

**Spec:** `docs/superpowers/specs/2026-10-23-album-book-design.md`

## Global Constraints

- Vite 8 + three 0.186，原生 JS ES 模块；不用 TypeScript，不用 UI 框架；运行时依赖只有 three。
- 单位：1 个场景单位 = 1 mm；y 轴向上，书脊沿 z 轴，z 正向朝观察者（屏幕下方）。
- 尺寸常量取 spec §7；弹簧、交互阈值、材质、灯光、镜头参数取 spec §9–§11。
- 数据：`public/cards.json` 为 `{ title, cards: [{ id, title, color, src? }] }`；S = max(1, ceil(n / 12))，跨页数为 S + 1。
- 界面文案逐字使用：「3D 翻阅」「打开卡册」「合上卡册」「关闭」「上一页」「下一页」「关闭详情」「拖动页面或点击两侧翻页；点击卡片查看详情」「点击封面或向左拖动打开」「请横过手机查看卡册」「当前浏览器无法显示 3D 卡册（WebGL 不可用）」「相册数据加载失败」「第 i 张，共 n 张」；入口页数量写作「N 张卡片」。
- 覆盖层背景 #f7f9fb，主按钮 #1d5f80，详情栏宽 360 px。
- 不写单元测试，仓库里不放测试文件。检查脚本放在 `/tmp/album-checks/`，截图放在 `/tmp/album-shots/`，都不提交。
- 所有命令都在项目根目录 `/Users/miwei/PyCharmMiscProject/cardart` 下执行；检查脚本按当前目录加载 `src/book/*.js`。
- 每次提交都带 trailer：`Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。

## Review Focus

1. 快速连续输入（连按 → 或 ←、连续甩动、反向甩回）：k 始终在 [0, S + 1] 内，不越界，也不会停在半翻状态。→ Task 4 `viewer-check` 的「rapid next stops at the last spread」「rapid prev closes the album」；Task 5 `pointer-check` 的「quick fling flips forward」「flinging back cancels the turn」。
2. 翻页途中关闭查看器再打开：不报错，旧画布被移除，重新从 1 / 6 打开。→ Task 4 `viewer-check` 的「closing mid-turn removes the viewer」「reopens at spread 1」。
3. 卡片数不是 12 的整数倍（0、1、7、12、13 张）：活页数和跨页数正确，最后一个跨页正常显示空袋和封底，空卡袋不弹详情。→ Task 1 `check-layout` 的 `sheetCount` 与 `cardAt` 越界断言；Task 6 `edge-check` 的「N cards: …」。
4. 屏幕方向变化：手机竖屏时显示横屏提示；转成横屏后，书完整地显示在顶栏和底栏之间。→ Task 6 `edge-check` 的「portrait phone: rotate hint」「landscape phone: book shown」。
5. 图片 404 或加载慢：页面上先显示占位卡，图片到达后再替换；详情栏的大图失败时露出占位。→ Task 6 `edge-check` 的「images: …」。

---

### Task 1: 项目脚手架与布局计算

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `package-lock.json`（由 `npm install` 生成）
- Create: `src/book/layout.js`
- Test: `/tmp/album-checks/check-layout.mjs`（仓库外）

**Interfaces:**
- Consumes: 无。
- Produces（`src/book/layout.js`）：
  - `DIM`：spec §7 中不随 S 变化的常量。字段为 `W, H, cardW, cardH, cardR, pocketW, pocketH, gap, spine, outer, top, hole, holeR, rings, T, CT, HB, h, drop, wire`，单位 mm；`rings` 是 `[-81, -27, 27, 81]`，其余都是 number。
  - `sheetCount(n: number) → number`
  - `pocketRect(face: number, slot: number) → { x, y, w, h }`：面内坐标，按「看到的样子」给出，原点在左上角。
  - `cardPlacement(index: number) → { x, y, rot }`：卡中心（面内 mm）和旋转（rad），含确定性抖动。
  - `cardAt(face: number, x: number, y: number, n: number) → number`：(x, y) 落在有卡的卡袋内时返回卡号，否则返回 −1。

- [ ] **Step 1: 建 package.json 和 .gitignore，安装依赖**

`package.json`：

```json
{
  "name": "cardart-album",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "^0.186.1"
  },
  "devDependencies": {
    "vite": "^8.3.5"
  }
}
```

`.gitignore`：

```text
node_modules
dist
```

Run: `npm install`
Expected: `added … packages`，没有 `npm ERR!`，并生成 `package-lock.json`。

- [ ] **Step 2: 写检查脚本**

Run: `mkdir -p /tmp/album-checks`

`/tmp/album-checks/check-layout.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-layout.mjs
import assert from 'node:assert/strict';

const { DIM, sheetCount, pocketRect, cardPlacement, cardAt } = await import(`${process.cwd()}/src/book/layout.js`);
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} !≈ ${b}`);

near(DIM.spine + 2 * DIM.pocketW + DIM.gap + DIM.outer, DIM.W);
near(2 * DIM.top + 3 * DIM.pocketH + 2 * DIM.gap, DIM.H);
near(DIM.HB, DIM.H + 14);
assert.deepEqual([0, 1, 7, 12, 13, 57].map(sheetCount), [1, 1, 1, 1, 2, 5]);

const front = pocketRect(0, 5);
near(front.x + front.w, DIM.W - DIM.outer);
near(front.y + front.h, DIM.H - DIM.top);
const back = pocketRect(1, 1);
near(back.x + back.w, DIM.W - DIM.spine); // the back is seen mirrored

assert.equal(cardAt(0, 30, 20, 57), 0);
assert.equal(cardAt(0, 10, 20, 57), -1); // ring margin
assert.equal(cardAt(9, 30, 20, 57), 54);
assert.equal(cardAt(9, 30, 140, 57), -1); // past the last card
assert.equal(cardAt(0, 30, 20, 0), -1); // empty album

for (let i = 0; i < 57; i++) {
  const p = cardPlacement(i);
  const r = pocketRect(Math.floor(i / 6), i % 6);
  assert.ok(Math.abs(p.x - (r.x + r.w / 2)) <= 0.7, `card ${i} x`);
  assert.ok(Math.abs(p.y - (r.y + r.h / 2)) <= 0.97, `card ${i} y`);
  assert.ok(Math.abs(p.rot) <= 0.003, `card ${i} rot`);
}
console.log('layout ok');
```

- [ ] **Step 3: 运行，确认失败**

Run: `node /tmp/album-checks/check-layout.mjs`
Expected: FAIL，`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/cardart/src/book/layout.js' imported from …/album-checks/check-layout.mjs`

- [ ] **Step 4: 实现 layout.js**

`src/book/layout.js`：

```js
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

export const sheetCount = (n) => Math.max(1, Math.ceil(n / 12));

// Pocket rectangle on a face, in face coordinates as seen (origin top-left).
export function pocketRect(face, slot) {
  const left = face % 2 === 0 ? DIM.spine : DIM.outer;
  return {
    x: left + (slot % 2) * (DIM.pocketW + DIM.gap),
    y: DIM.top + Math.floor(slot / 2) * (DIM.pocketH + DIM.gap),
    w: DIM.pocketW,
    h: DIM.pocketH,
  };
}

const noise = (x) => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Card centre and tilt inside its pocket, with a small deterministic jitter.
export function cardPlacement(index) {
  const r = pocketRect(Math.floor(index / 6), index % 6);
  return {
    x: r.x + r.w / 2 + (noise(index) - 0.5) * 1.4,
    y: r.y + r.h / 2 + (noise(index + 7.13) - 0.6) * 1.6,
    rot: (noise(index + 3.7) - 0.5) * 0.006,
  };
}

// Index of the card whose pocket contains (x, y) on a face, or -1.
export function cardAt(face, x, y, n) {
  for (let slot = 0; slot < 6; slot++) {
    const r = pocketRect(face, slot);
    const index = face * 6 + slot;
    if (index < n && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return index;
  }
  return -1;
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `node /tmp/album-checks/check-layout.mjs`
Expected: `layout ok`

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json .gitignore src/book/layout.js
git commit -m "feat: scaffold the album project and add layout math" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: 活页几何

**Files:**
- Create: `src/book/sheet.js`
- Test: `/tmp/album-checks/check-sheet.mjs`

**Interfaces:**
- Consumes: `DIM`（Task 1）。
- Produces（`src/book/sheet.js`）：
  - `arc(phi: number, turn: number, len: number) → [dx, dy]`：spec §8 的圆弧位移函数，逆时针转角为正。
  - `restHoleAngle(cy: number, R: number, y: number) → number`：静止孔角 ψ（rad），见 spec §9。
  - `restEdgeX(C: [x, y], R: number, y: number) → number`：活页平铺在右堆高度 y 时外边的 x。
  - `createSheet(frontMap: Texture, backMap: Texture) → { group: Group, front: Mesh, back: Mesh, update(C, R, psi, theta, b), dispose() }`
    - `front` 和 `back` 共用一个 80 顶点（40 列 × 2 行）的几何。`update` 改写顶点，然后重算法线和包围球。
    - 会把 `backMap.repeat.x` 设为 −1、`backMap.offset.x` 设为 1。`dispose()` 同时释放两张贴图。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-sheet.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-sheet.mjs
import assert from 'node:assert/strict';

const { DIM } = await import(`${process.cwd()}/src/book/layout.js`);
const { arc, restHoleAngle, restEdgeX, createSheet } = await import(`${process.cwd()}/src/book/sheet.js`);
const near = (a, b, e) => assert.ok(Math.abs(a - b) < e, `${a} !≈ ${b}`);
const fakeTexture = () => ({ repeat: { x: 1 }, offset: { x: 0 }, dispose() {} });

near(arc(0, 0, 5)[0], 5, 1e-9);
near(arc(Math.PI, -Math.PI / 2, 5)[0], -3.183, 1e-3);

// Open binder with 5 sheets: ring centre C = (0, 13.3), R = 13 (spec §7–§9).
const S = 5;
const R = 13;
const C = [0, 13.3];
const heights = Array.from({ length: S }, (_, i) => (S - i - 0.5) * DIM.T);
const psiR = heights.map((y) => restHoleAngle(C[1], R, y));
assert.ok(psiR.every((psi) => psi > -0.67 && psi < -0.42), `ψR ${psiR}`);
const openEdges = heights.map((y) => restEdgeX(C, R, y));
assert.ok(openEdges.every((x) => x > 209.4 && x < 212), `open edges ${openEdges}`);
const closedEdges = heights.map((y) => restEdgeX([33.62, 17.88], R, y));
assert.ok(closedEdges.every((x) => x > 238.6 && x < 242.9), `closed edges ${closedEdges}`);

const sheet = createSheet(fakeTexture(), fakeTexture());
const geometry = sheet.front.geometry;
const pos = geometry.attributes.position;
assert.equal(pos.count, 80);
assert.equal(sheet.back.geometry, geometry);

// Resting on the right: the whole page lies flat at its stack height, front up.
const y = heights[0];
sheet.update(C, R, restHoleAngle(C[1], R, y), 0, 0);
near(pos.getX(39), restEdgeX(C, R, y), 1e-3);
near(pos.getY(39), y, 1e-3);
near(pos.getY(10), y, 1e-3);
near(pos.getZ(0), -DIM.H / 2, 1e-4);
near(pos.getZ(40), DIM.H / 2, 1e-4);
near(geometry.attributes.normal.getY(30), 1, 1e-4);

// Resting on the left: the mirror image.
const yl = 0.5 * DIM.T;
sheet.update(C, R, Math.PI - restHoleAngle(C[1], R, yl), Math.PI, 0);
near(pos.getX(39), -restEdgeX(C, R, yl), 1e-3);
near(pos.getY(39), yl, 1e-3);

const uv = geometry.attributes.uv;
near(uv.getX(1), 13.5 / DIM.W, 1e-6);
near(uv.getX(39), 1, 1e-6);
near(uv.getY(0), 1, 1e-6);
sheet.dispose();
console.log('sheet ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-sheet.mjs`
Expected: FAIL，`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/cardart/src/book/sheet.js' imported from …/album-checks/check-sheet.mjs`

- [ ] **Step 3: 实现 sheet.js**

`src/book/sheet.js`：

```js
import { BackSide, DoubleSide, Group, Mesh, MeshPhysicalMaterial, PlaneGeometry } from 'three';
import { DIM } from './layout.js';

// Cross-section of a sheet from its inner edge: [length, vertex steps] per segment.
// Segment turns: hole strip 0, seam θ − ψ, inner column 0.2b, column hinge 0.6b, outer column 0.2b.
const SEGMENTS = [[13.5, 1], [6.9, 8], [89.5, 12], [6.4, 6], [93.5, 12]];
const SEAM = 13.5 + 6.9;

const STATIONS = [0];
let start = 0;
for (const [len, steps] of SEGMENTS) {
  for (let i = 1; i <= steps; i++) STATIONS.push(start + (len * i) / steps);
  start += len;
}

// Displacement after walking `len` from direction `phi` while turning by `turn` (CCW positive).
export function arc(phi, turn, len) {
  if (Math.abs(turn) < 1e-5) return [len * Math.cos(phi), len * Math.sin(phi)];
  const r = len / turn;
  return [r * (Math.sin(phi + turn) - Math.sin(phi)), r * (Math.cos(phi) - Math.cos(phi + turn))];
}

function section(out, C, R, psi, theta, b) {
  const turns = [0, theta - psi, 0.2 * b, 0.6 * b, 0.2 * b];
  let x = C[0] + (R - DIM.hole) * Math.cos(psi);
  let y = C[1] + (R - DIM.hole) * Math.sin(psi);
  let dir = psi;
  let k = 0;
  out[k++] = x;
  out[k++] = y;
  SEGMENTS.forEach(([len, steps], i) => {
    const turn = turns[i] / steps;
    for (let j = 0; j < steps; j++) {
      const [dx, dy] = arc(dir, turn, len / steps);
      x += dx;
      y += dy;
      dir += turn;
      out[k++] = x;
      out[k++] = y;
    }
  });
}

// End of the seam hinge for a sheet resting on the right (θ = 0).
function seamEnd(C, R, psi) {
  const r = R - DIM.hole + 13.5;
  const [dx, dy] = arc(psi, -psi, 6.9);
  return [C[0] + r * Math.cos(psi) + dx, C[1] + r * Math.sin(psi) + dy];
}

// Hole angle ψ at which a sheet resting on the right lies flat at height y.
export function restHoleAngle(cy, R, y) {
  let lo = -Math.PI / 2 + 0.02;
  let hi = Math.PI / 2 - 0.02;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (seamEnd([0, cy], R, mid)[1] < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Outer edge x of a sheet resting flat on the right at height y.
export function restEdgeX(C, R, y) {
  return seamEnd(C, R, restHoleAngle(C[1], R, y))[0] + DIM.W - SEAM;
}

export function createSheet(frontMap, backMap) {
  backMap.repeat.x = -1; // the back is seen mirrored: u' = 1 − u
  backMap.offset.x = 1;
  const n = STATIONS.length;
  const geometry = new PlaneGeometry(1, 1, n - 1, 1);
  const uv = geometry.attributes.uv;
  STATIONS.forEach((s, i) => {
    uv.setX(i, s / DIM.W);
    uv.setX(i + n, s / DIM.W);
  });
  const pvc = {
    roughness: 0.48,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    ior: 1.54,
    specularIntensity: 0.6,
    alphaTest: 0.5,
    shadowSide: DoubleSide,
  };
  const front = new Mesh(geometry, new MeshPhysicalMaterial({ ...pvc, map: frontMap }));
  const back = new Mesh(geometry, new MeshPhysicalMaterial({ ...pvc, map: backMap, side: BackSide }));
  front.castShadow = true;
  front.receiveShadow = true;
  back.receiveShadow = true;
  const group = new Group();
  group.add(front, back);
  const position = geometry.attributes.position;
  const points = new Float64Array(n * 2);

  return {
    group,
    front,
    back,
    update(C, R, psi, theta, b) {
      section(points, C, R, psi, theta, b);
      for (let i = 0; i < n; i++) {
        position.setXYZ(i, points[2 * i], points[2 * i + 1], -DIM.H / 2);
        position.setXYZ(i + n, points[2 * i], points[2 * i + 1], DIM.H / 2);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    },
    dispose() {
      geometry.dispose();
      for (const m of [front.material, back.material]) {
        m.map.dispose();
        m.dispose();
      }
    },
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/check-sheet.mjs`
Expected: `sheet ok`

- [ ] **Step 5: 提交**

```bash
git add src/book/sheet.js
git commit -m "feat: add the sheet cross-section and mesh" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: 活页夹与封面姿态

**Files:**
- Create: `src/book/binder.js`
- Test: `/tmp/album-checks/check-binder.mjs`

**Interfaces:**
- Consumes: `DIM`（Task 1）；`arc`、`restEdgeX`（Task 2）。
- Produces（`src/book/binder.js`）：
  - `binderPose(c: number, D: number, xb: number) → { p0, p1, p2, p3, phiS, phiF, n, sink, m, C }`：各点都是 `[x, y]`；c = 0 为合上，c = 1 为打开。
  - `binderSize(S: number) → { R, D, xb, B, closedCenter }`
  - `createBinder({ sheets: number, title: string }) → { group: Group, R, B, xb, closedCenter, pose(c) → { C: [x, y] }, dispose() }`
    - 封面标题和接触阴影用 `document.createElement('canvas')` 绘制，所以只能在浏览器里运行。node 检查脚本自带一个假的 `document`。

- [ ] **Step 1: 写检查脚本**

`/tmp/album-checks/check-binder.mjs`：

```js
// Run from the project root: node /tmp/album-checks/check-binder.mjs
import assert from 'node:assert/strict';

// binder.js draws its title and contact shadow on canvases; node has no DOM, so stub one.
const context = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { binderPose, binderSize, createBinder } = await import(`${process.cwd()}/src/book/binder.js`);
const near = (a, b, e) => assert.ok(Math.abs(a - b) < e, `${a} !≈ ${b}`);

const s = binderSize(5);
near(s.R, 13, 1e-9);
near(s.xb, 20.5, 1e-9);
near(s.B, 229.3, 0.05);
near(s.closedCenter, 132.8, 0.05);

const open = binderPose(1, s.D, s.xb);
near(open.C[0], 0, 1e-9);
near(open.C[1], 13.3, 1e-9);
near(open.p3[0], -20.5, 1e-9);
near(open.phiF, Math.PI, 1e-12);
const closed = binderPose(0, s.D, s.xb);
near(closed.C[0], 33.62, 0.01);
near(closed.C[1], 17.88, 0.01);
near(closed.p3[1], 36.57, 0.01); // the cover lies above the rings
near(closed.phiF, 0, 1e-12);
near(binderPose(0.5, s.D, s.xb).phiF, Math.PI / 2, 1e-12); // cover upright half-way

const binder = createBinder({ sheets: 5, title: '图书馆借书卡' });
let meshes = 0;
binder.group.traverse((o) => o.isMesh && meshes++);
assert.equal(meshes, 15); // 3 boards, 2 hinges, seat, 2 rivets, 4 rings, title, 2 contact shadows
for (const c of [0, 0.25, 0.5, 0.75, 1]) {
  const { C } = binder.pose(c);
  const ref = binderPose(c, s.D, s.xb).C;
  near(C[0], ref[0], 1e-9);
  near(C[1], ref[1], 1e-9);
}
binder.dispose();
console.log('binder ok');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node /tmp/album-checks/check-binder.mjs`
Expected: FAIL，`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/cardart/src/book/binder.js' imported from …/album-checks/check-binder.mjs`

- [ ] **Step 3: 实现 binder.js**

`src/book/binder.js`：

```js
import {
  BoxGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM } from './layout.js';
import { arc, restEdgeX } from './sheet.js';

const { H, T, CT, HB, h, drop } = DIM;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

// Cross-section pose for cover progress c (0 closed, 1 open), spec §8.
export function binderPose(c, D, xb) {
  const a1 = (Math.PI / 2) * (1 - clamp01(2 * c - 1));
  const a2 = (Math.PI / 2) * (1 - clamp01(2 * c));
  const p0 = [xb, -CT / 2];
  const d1 = arc(Math.PI, -a1, h);
  const p1 = [p0[0] + d1[0], p0[1] + d1[1]];
  const phiS = Math.PI - a1;
  const u = [Math.cos(phiS), Math.sin(phiS)];
  const n = [Math.sin(phiS), -Math.cos(phiS)]; // inner normal of the spine
  const p2 = [p1[0] + 2 * D * u[0], p1[1] + 2 * D * u[1]];
  const d2 = arc(phiS, -a2, h);
  const p3 = [p2[0] + d2[0], p2[1] + d2[1]];
  const sink = drop * (1 - a1 / (Math.PI / 2)) ** 2;
  const m = [p1[0] + D * u[0] - n[0] * sink, p1[1] + D * u[1] - n[1] * sink];
  const C = [m[0] + n[0] * (CT / 2 + D), m[1] + n[1] * (CT / 2 + D)];
  return { p0, p1, p2, p3, phiS, phiF: phiS - a2, n, sink, m, C };
}

export function binderSize(S) {
  const R = Math.max(13, 8 + 0.65 * S);
  const D = R + 2.5;
  const xb = D + h;
  let edge = 0;
  for (const c of [0, 1]) {
    const { C } = binderPose(c, D, xb);
    for (let i = 0; i < S; i++) edge = Math.max(edge, restEdgeX(C, R, (S - i - 0.5) * T));
  }
  const B = edge - xb + 7;
  const closedCenter = (binderPose(0, D, xb).p1[0] - CT + xb + B) / 2;
  return { R, D, xb, B, closedCenter };
}

// Rounded board lying along +x from the origin, CT thick, HB long in z.
function boardGeometry(length) {
  const r = 2.6;
  const z = HB / 2;
  const shape = new Shape();
  shape.absarc(r, -z + r, r, Math.PI, 1.5 * Math.PI);
  shape.absarc(length - r, -z + r, r, 1.5 * Math.PI, 2 * Math.PI);
  shape.absarc(length - r, z - r, r, 0, 0.5 * Math.PI);
  shape.absarc(r, z - r, r, 0.5 * Math.PI, Math.PI);
  return new ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 4 })
    .translate(0, 0, -CT / 2)
    .rotateX(Math.PI / 2);
}

function titleTexture(title, width) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * 8);
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.scale(8, 8);
  ctx.font = '600 7.2px system-ui, sans-serif';
  for (const [color, d] of [['rgba(20,30,40,0.35)', 0.2], ['#fff', 0]]) {
    ctx.fillStyle = color;
    ctx.fillRect(d, 15 + d, 9, 0.7);
    ctx.fillText(title, d, 25 + d);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function contactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff';
  for (const [blur, alpha, rect] of [
    [12, 0.45, [22, 18, 212, 220, 14]],
    [2.5, 1, [19, 16, 218, 224, 6]],
  ]) {
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(...rect);
    ctx.fill();
  }
  return new CanvasTexture(canvas);
}

export function createBinder({ sheets, title }) {
  const { R, D, xb, B, closedCenter } = binderSize(sheets);
  const group = new Group();
  const frost = new MeshPhysicalMaterial({
    color: '#e9eef2',
    transmission: 1,
    roughness: 0.6,
    thickness: 1.6,
    ior: 1.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.4,
    specularIntensity: 0.45,
  });
  const steel = new MeshPhysicalMaterial({ color: '#b8bec5', metalness: 1, roughness: 0.3, clearcoat: 0.3 });
  const add = (geometry, material, parent = group) => {
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = material === steel;
    parent.add(mesh);
    return mesh;
  };

  const back = add(boardGeometry(B), frost);
  back.position.set(xb, -CT / 2, 0);
  const cover = add(boardGeometry(B), frost);
  const hinge = new BoxGeometry(1, CT, HB).translate(0.5, 0, 0);
  const hinges = [add(hinge, frost), add(hinge, frost)];

  // Spine group: origin at the sunk spine middle, local x along the spine, local y = inner normal.
  const spine = new Group();
  group.add(spine);
  add(boardGeometry(2 * D), frost, spine).position.x = -D;
  const seat = H - 18;
  add(new RoundedBoxGeometry(Math.max(11, 0.85 * R), 3.2, seat, 3, 1.2), steel, spine).position.y = CT / 2 + 1.6;
  const rivet = new SphereGeometry(2.4, 16, 8, 0, 2 * Math.PI, 0, Math.PI / 2);
  for (const side of [-1, 1]) {
    const mesh = add(rivet, steel, spine);
    mesh.position.set(0, CT / 2 + 3.2, side * (seat / 2 - 7));
    mesh.scale.y = 0.45;
  }
  const ring = new TorusGeometry(R, DIM.wire, 12, 64);
  for (const z of DIM.rings) add(ring, steel, spine).position.set(0, CT / 2 + D, z);

  const tw = Math.min(B - 44, 150);
  const label = new Mesh(
    new PlaneGeometry(tw, 30).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: titleTexture(title, tw), transparent: true, opacity: 0.7, depthWrite: false }),
  );
  label.position.set(24 + tw / 2, CT / 2 + 0.05, HB / 2 - 37);
  cover.add(label);

  const shadowMaterial = new MeshBasicMaterial({
    color: 0x000000,
    alphaMap: contactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.32,
  });
  const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const [, leftShadow] = [1, -1].map((side) => {
    const mesh = new Mesh(plane, side > 0 ? shadowMaterial : shadowMaterial.clone());
    mesh.scale.set((xb + B) * 1.16, 1, H * 1.14);
    mesh.position.set((side * (xb + B)) / 2 + 4, -(CT + drop + 0.01), 5);
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  });

  const span = (mesh, a, b) => {
    mesh.position.set(a[0], a[1], 0);
    mesh.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    mesh.scale.x = Math.hypot(b[0] - a[0], b[1] - a[1]);
  };

  return {
    group,
    R,
    B,
    xb,
    closedCenter,
    pose(c) {
      const p = binderPose(c, D, xb);
      const sunk = (q) => [q[0] - p.n[0] * p.sink, q[1] - p.n[1] * p.sink];
      span(hinges[0], p.p0, sunk(p.p1));
      span(hinges[1], sunk(p.p2), p.p3);
      spine.position.set(p.m[0], p.m[1], 0);
      spine.rotation.z = p.phiS + Math.PI;
      cover.position.set(p.p3[0], p.p3[1], 0);
      cover.rotation.z = p.phiF;
      leftShadow.material.opacity = 0.32 * smoothstep(clamp01(1 - (Math.PI - p.phiF) / 0.26));
      return { C: p.C };
    },
    dispose() {
      const items = new Set();
      group.traverse((o) => {
        if (o.isMesh) items.add(o.geometry).add(o.material);
      });
      for (const item of items) {
        item.map?.dispose();
        item.alphaMap?.dispose();
        item.dispose();
      }
    },
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/check-binder.mjs`
Expected: `binder ok`

- [ ] **Step 5: 提交**

```bash
git add src/book/binder.js
git commit -m "feat: add the binder boards, rings and cover pose" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: 入口页与 3D 查看器（键盘和按钮）

**Files:**
- Create: `index.html`
- Create: `public/cards.json`（脚本生成）
- Create: `src/main.js`
- Create: `src/style.css`
- Create: `src/book/textures.js`
- Create: `src/book/scene.js`
- Create: `src/book/book.js`
- Create: `src/viewer.js`
- Test: `/tmp/album-checks/cdp.mjs`、`/tmp/album-checks/viewer-check.mjs`

**Interfaces:**
- Consumes: Task 1–3 的全部导出。
- Produces：
  - `src/book/textures.js`：`createFaceTexture(face: number, cards: Card[], onRedraw: () => void) → CanvasTexture`。图片到达后重绘贴图并调用 `onRedraw`。
  - `src/book/scene.js`：`createStage(container: HTMLElement, halfWidth: number, insets: { top, bottom }) → { scene, camera, renderer, frame(x, zoom), render(), resize(), dispose() }`。WebGL 不可用时抛出 `Error('webgl')`。
  - `src/book/book.js`：`createBook(container, { album, insets, onChange }) → { next(), prev(), toggleCover(), dispose() }`。`onChange({ spread, spreads, closed })` 在创建时调用一次，之后每次 k 变化时调用。Task 5 再加入第四个选项 `onCardClick`。
  - `src/viewer.js`：`openViewer(album) → close()`。它已经把 `onCardClick: showCard` 传给 `createBook`，但 Task 4 的 book.js 还不会调用它。
  - 检查脚本依赖的 DOM 钩子（改名会让检查失败）：`.page .ab-primary`、`.page-count`、`.page-error`、`.ab-count`、`[data-closed]`、`[data-act=prev|next|cover|close|panel]`、`.ab-foot .ab-primary`、`.ab-bar [data-act=cover]`、`.ab-panel-wrap`、`.ab-panel-title`、`.ab-panel-meta`、`.ab-panel-img`、`.ab-message`、`.ab-rotate`、`canvas`。

- [ ] **Step 1: 写浏览器驱动 cdp.mjs**

`launch()` 用临时配置目录启动一个无头 Chrome。`check(name, expected, settle)` 等待 `settle` 毫秒，读取页面状态（`STATE`），与 `expected` 中的字段逐一比较：一致时打印 PASS，不一致时打印 FAIL 并附上实际状态。`close()` 打印 console 问题和汇总，返回退出码。

`/tmp/album-checks/cdp.mjs`：

```js
// Drives headless Chrome over the DevTools protocol; Node 22+ provides fetch and WebSocket.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KEY_CODES = { ArrowLeft: 37, ArrowRight: 39, Escape: 27, PageUp: 33, PageDown: 34 };
let port = 9333;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const steps = (from, to, n) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

const STATE = `(() => {
  const $ = (s) => document.querySelector(s);
  const shown = (s) => ($(s) ? !$(s).hidden : null);
  const panel = $('.ab-panel-wrap');
  return {
    pageCount: $('.page-count')?.textContent ?? null,
    pageError: $('.page-error')?.textContent ?? null,
    count: $('.ab-count')?.textContent ?? null,
    closed: shown('[data-closed]'),
    nextDisabled: $('[data-act=next]')?.disabled ?? null,
    panel: panel && !panel.hidden ? $('.ab-panel-title').textContent + ' | ' + $('.ab-panel-meta').textContent : null,
    panelImage: Boolean($('.ab-panel-img img')?.naturalWidth),
    message: shown('.ab-message'),
    rotateHint: $('.ab-rotate') ? getComputedStyle($('.ab-rotate')).display !== 'none' : null,
    canvases: document.querySelectorAll('canvas').length,
  };
})()`;

// `allow` matches console messages that are expected and not reported as problems.
export async function launch({ args = [], allow = null } = {}) {
  const debugPort = port++;
  const profile = mkdtempSync(`${tmpdir()}/album-cdp-`);
  const chrome = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', ...args, 'about:blank'],
    { stdio: 'ignore' },
  );
  let targets = null;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      .then((res) => res.json())
      .catch(() => null);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

  let nextId = 0;
  let failures = 0;
  const pending = new Map();
  const problems = [];
  const report = (text) => allow?.test(text) || problems.push(text);
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      report(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      report(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
      report(msg.params.entry.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const mouse = (type, x, y) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  await send('Runtime.enable');
  await send('Log.enable');

  return {
    async emulate({ width = 1280, height = 720, mobile = false, reducedMotion = false } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }],
      });
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(1500);
    },
    click: (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    async key(name) {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: KEY_CODES[name] });
      }
    },
    async tap(x, y) {
      await mouse('mousePressed', x, y);
      await mouse('mouseReleased', x, y);
    },
    // Drags along y = 360 through the given x positions, one move every `gap` ms.
    async drag(xs, { gap = 25, hold = 0, mid } = {}) {
      await mouse('mousePressed', xs[0], 360);
      for (const x of xs.slice(1)) {
        await sleep(gap);
        await mouse('mouseMoved', x, 360);
      }
      if (mid) await mid();
      await sleep(hold);
      await mouse('mouseReleased', xs.at(-1), 360);
    },
    async shot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    // Waits `settle` ms, then compares the given fields of the page state.
    async check(name, expected, settle = 1600) {
      await sleep(settle);
      const actual = await evaluate(STATE);
      const ok = Object.entries(expected).every(([key, value]) => actual[key] === value);
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(actual)}`}`);
    },
    // Prints the summary, quits Chrome and returns the exit code.
    async close() {
      console.log(problems.length ? `CONSOLE PROBLEMS:\n${problems.join('\n')}` : 'console: clean');
      console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
      ws.close();
      chrome.kill();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true });
      return failures || problems.length ? 1 : 0;
    },
  };
}
```

- [ ] **Step 2: 写 viewer-check.mjs**

`/tmp/album-checks/viewer-check.mjs`：

```js
// Keyboard and button checks against the 57 demo cards at 1280×720.
// Usage: node viewer-check.mjs [url] [screenshot-dir]
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? '/tmp/album-shots';
mkdirSync(OUT, { recursive: true });

const b = await launch();
try {
  await b.emulate();
  await b.goto(URL);
  await b.check('entry page lists the cards', { pageCount: '57 张卡片' }, 0);
  await b.click('.page .ab-primary');
  await b.check('opens at spread 1', { count: '1 / 6', closed: false, nextDisabled: false, canvases: 1 });
  await b.shot(`${OUT}/spread-1.png`);

  await b.key('ArrowRight');
  await b.check('ArrowRight turns forward', { count: '2 / 6' });
  await b.key('PageDown');
  await b.check('PageDown turns forward', { count: '3 / 6' });
  await b.shot(`${OUT}/spread-3.png`);
  await b.key('PageUp');
  await b.check('PageUp turns back', { count: '2 / 6' });
  await b.click('[data-act=next]');
  await b.check('next button', { count: '3 / 6' });
  await b.click('[data-act=prev]');
  await b.check('prev button', { count: '2 / 6' });

  for (let i = 0; i < 10; i++) await b.key('ArrowRight');
  await b.check('rapid next stops at the last spread', { count: '6 / 6', nextDisabled: true }, 3000);
  await b.shot(`${OUT}/spread-6.png`);
  for (let i = 0; i < 10; i++) await b.key('ArrowLeft');
  await b.check('rapid prev closes the album', { closed: true }, 3000);
  await b.shot(`${OUT}/closed.png`);
  await b.click('.ab-foot .ab-primary');
  await b.check('open button', { count: '1 / 6', closed: false }, 2500);
  await b.click('.ab-bar [data-act=cover]');
  await b.check('cover button closes', { closed: true }, 2500);
  await b.click('.ab-bar [data-act=cover]');
  await b.check('cover button opens', { count: '1 / 6', closed: false }, 2500);

  await b.key('ArrowRight');
  await sleep(100);
  await b.click('[data-act=close]');
  await b.check('closing mid-turn removes the viewer', { count: null, canvases: 0 }, 300);
  await b.click('.page .ab-primary');
  await b.check('reopens at spread 1', { count: '1 / 6', closed: false, canvases: 1 });
  await b.key('Escape');
  await b.check('Esc closes the viewer', { count: null, canvases: 0 }, 300);
} finally {
  process.exitCode = await b.close();
}
```

- [ ] **Step 3: 启动 dev server，运行检查，确认失败**

在单独的终端或后台启动 dev server，并一直运行到 Task 6 结束：

Run: `npm run dev -- --port 5173 --strictPort`
Expected: 输出含 `Local:   http://localhost:5173/`。如果 5173 被占用，换一个空闲端口，并把该 URL 作为第一个参数传给之后的每条浏览器检查，例如 `node /tmp/album-checks/viewer-check.mjs http://localhost:5174/`（`edge-check` 的 URL 是第二个参数）。

Run: `node /tmp/album-checks/viewer-check.mjs`
Expected: FAIL。此时还没有 `index.html`，Vite 返回 404，输出以下列内容开头和结尾，退出码为 1：

```text
FAIL entry page lists the cards {"pageCount":null,"pageError":null,"count":null,...}
...
CONSOLE PROBLEMS:
Failed to load resource: the server responded with a status of 404 ()
13 FAILED
```

- [ ] **Step 4: 生成 57 张占位卡数据**

```bash
mkdir -p public
node -e '
const colors = ["#c9a46a", "#7f9cb0", "#b47a6d", "#8aa38b", "#a08cb5", "#c28e5c", "#6f8fa6", "#b5a07a"];
const cards = Array.from({ length: 57 }, (_, i) => ({ id: `c${String(i + 1).padStart(2, "0")}`, title: `卡片 ${i + 1}`, color: colors[i % 8] }));
require("node:fs").writeFileSync("public/cards.json", JSON.stringify({ title: "图书馆借书卡", cards }, null, 2) + "\n");
'
```

Run: `node -p "require('./public/cards.json').cards.length"`
Expected: `57`

- [ ] **Step 5: 写 index.html**

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>3D 卡册</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 6: 写入口页 src/main.js**

`src/main.js`：

```js
import './style.css';

const app = document.querySelector('#app');

async function loadAlbum() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}cards.json`);
    const album = res.ok ? await res.json() : null;
    return Array.isArray(album?.cards) ? album : null;
  } catch {
    return null;
  }
}

loadAlbum().then((album) => {
  if (!album) {
    app.innerHTML = '<p class="page-error">相册数据加载失败</p>';
    return;
  }
  app.innerHTML = `
    <main class="page">
      <h1></h1>
      <p class="page-count"></p>
      <button class="ab-primary" type="button">3D 翻阅</button>
    </main>`;
  app.querySelector('h1').textContent = album.title;
  app.querySelector('.page-count').textContent = `${album.cards.length} 张卡片`;
  app.querySelector('button').addEventListener('click', async () => {
    const { openViewer } = await import('./viewer.js');
    openViewer(album);
  });
});
```

- [ ] **Step 7: 写样式 src/style.css**

`src/style.css`：

```css
:root {
  --bg: #f7f9fb;
  --raised: #fff;
  --ink: oklch(23.5% 0.02 255);
  --ink-2: oklch(46.5% 0.022 248);
  --ink-3: oklch(52.5% 0.016 248);
  --line: oklch(92.2% 0.007 245);
  --hover: oklch(95.5% 0.007 242);
  --accent: #1d5f80;
  --accent-hover: oklch(40.5% 0.085 240);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --font: system-ui, -apple-system, 'PingFang SC', 'Noto Sans CJK SC', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/20px var(--font);
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  color: inherit;
}

/* Entry page */
.page {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
}

.page h1 {
  margin: 0;
  font-size: 28px;
  line-height: 36px;
  font-weight: 600;
}

.page-count {
  margin: 0 0 8px;
  color: var(--ink-2);
}

.page-error {
  margin: 40px;
  color: var(--ink-2);
  text-align: center;
}

/* Viewer overlay */
.ab {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--bg);
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  overscroll-behavior: contain;
}

.ab-stage {
  position: absolute;
  inset: 0;
}

.ab-gl {
  position: absolute;
  inset: 0;
  display: block;
  touch-action: none;
  cursor: grab;
}

.ab-gl:active {
  cursor: grabbing;
}

.ab-bar,
.ab-foot {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}

.ab-bar button,
.ab-foot button {
  pointer-events: auto;
}

.ab-bar {
  top: 0;
  min-height: 56px;
  padding: 8px 10px 0 clamp(20px, 4vw, 40px);
  display: flex;
  align-items: center;
  gap: 12px;
}

.ab-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-foot {
  bottom: 0;
  padding: 0 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.ab-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ab-count {
  min-width: 72px;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.ab-hint {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--ink-3);
  text-align: center;
}

/* Buttons */
.ab-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-2);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background-color 0.15s var(--ease-out);
}

.ab-round {
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
}

.ab-icon:not(:disabled):hover,
.ab-icon[aria-pressed='true'] {
  background: var(--hover);
}

.ab-icon:disabled {
  opacity: 0.4;
  cursor: default;
}

.ab-primary {
  height: 36px;
  padding: 0 16px 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.ab-primary:hover {
  background: var(--accent-hover);
}

.ab-primary svg {
  width: 16px;
  height: 16px;
}

:is(.ab-icon, .ab-primary):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Card detail panel */
.ab-panel-wrap {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 360px;
  padding: 0 12px 12px 0;
  pointer-events: none;
}

.ab-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  background: var(--raised);
  box-shadow: 0 0 0 1px var(--line), 0 12px 32px -12px oklch(23.5% 0.02 255 / 0.28);
  pointer-events: auto;
  animation: ab-panel-in 0.36s var(--ease-out);
}

@keyframes ab-panel-in {
  from {
    opacity: 0;
    translate: 24px;
  }
}

.ab-panel-head {
  display: flex;
  justify-content: flex-end;
  padding: 6px 6px 0;
}

.ab-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 20px 20px;
}

.ab-panel-img {
  position: relative;
  aspect-ratio: 85.6 / 54;
  overflow: hidden;
  border-radius: 4.5% / 7.1%;
  padding: 16px;
  display: flex;
  align-items: flex-end;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 6px 18px -8px oklch(23.5% 0.02 255 / 0.35);
}

.ab-panel-img img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ab-panel-title {
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}

.ab-panel-meta {
  margin: 0;
  color: var(--ink-2);
}

/* Errors and portrait hint */
.ab-message,
.ab-rotate {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  color: var(--ink-2);
  pointer-events: none;
}

.ab-rotate {
  display: none;
}

.ab-rotate svg {
  width: 44px;
  height: 44px;
  color: var(--ink-3);
}

.ab[data-error] .ab-stage,
.ab[data-error] .ab-foot {
  display: none;
}

@media (max-width: 600px) {
  .ab-panel-wrap {
    left: 0;
    width: auto;
    padding: 0 12px 12px;
  }
}

@media (max-width: 600px) and (orientation: portrait) {
  .ab-rotate {
    display: flex;
  }

  .ab-stage,
  .ab-foot,
  .ab-panel-wrap {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ab-panel {
    animation: none;
  }
}
```

- [ ] **Step 8: 写每面贴图 src/book/textures.js**

`src/book/textures.js`：

```js
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
```

- [ ] **Step 9: 写渲染舞台 src/book/scene.js**

`src/book/scene.js`：

```js
import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  VSMShadowMap,
  WebGLRenderer,
} from 'three';
import { DIM } from './layout.js';

const TAN = Math.tan((12 * Math.PI) / 180); // half of the 24° fov
const TILT = (9 * Math.PI) / 180;

// The original's studio: a dim gradient dome and three soft boxes, which give
// the steel and PVC their crisp highlights. It is modelled z-up like the original.
function studio() {
  const rig = new Group();
  const dome = new SphereGeometry(10, 48, 24);
  const { position } = dome.attributes;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = position.getZ(i) / 10;
    const v = t > 0 ? 0.16 + 0.1 * t : 0.16 * (1 + t) + 0.03;
    colors.set([v, v * 1.01, v * 1.04], i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  rig.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  for (const [w, h, dir, v] of [
    [5.2, 3.6, [-0.5, 0.45, 0.74], 7],
    [1.2, 6, [0.85, -0.15, 0.5], 2.2],
    [7, 1.2, [0.1, -0.9, 0.42], 0.9],
  ]) {
    const box = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(v, v, v * 0.98), side: DoubleSide }));
    box.position.set(...dir).normalize().multiplyScalar(8);
    box.lookAt(0, 0, 0);
    rig.add(box);
  }
  rig.rotation.x = -Math.PI / 2; // z-up to y-up, applied after lookAt
  return new Scene().add(rig);
}

// Ground shadow that fades out within 16 mm of the open book's footprint, like the original.
function groundMaterial(halfWidth) {
  const material = new ShadowMaterial({ opacity: 0.16 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec2 vGround;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvGround = position.xz;',
    )}`;
    shader.fragmentShader = `varying vec2 vGround;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `vec2 outside = max(abs(vGround) - vec2(${halfWidth.toFixed(2)}, ${(DIM.H / 2).toFixed(2)}), 0.0);
      gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( 0.0, 16.0, length( outside ) ) ) );`,
    )}`;
  };
  return material;
}

export function createStage(container, halfWidth, insets) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    throw new Error('webgl');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.domElement.className = 'ab-gl';
  container.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#f7f9fb');
  const pmrem = new PMREMGenerator(renderer);
  const env = studio();
  const envMap = pmrem.fromScene(env, 0.02);
  env.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.6;

  const small = Math.min(screen.width, screen.height) < 600;
  const sun = new DirectionalLight(0xffffff, 1.35);
  sun.position.set(-290, 420, -75);
  sun.castShadow = true;
  const { shadow } = sun;
  shadow.mapSize.setScalar(small ? 1024 : 2048);
  shadow.radius = small ? 8 : 14;
  shadow.blurSamples = small ? 10 : 16;
  shadow.intensity = 0.7;
  shadow.bias = -8e-4;
  shadow.normalBias = 1.5;
  Object.assign(shadow.camera, { left: -(halfWidth + 50), right: halfWidth + 50, top: 220, bottom: -220, near: 100, far: 1000 });
  shadow.camera.up.set(0, 0, -1); // keep the shadow frustum's width along x
  scene.add(sun, sun.target, new HemisphereLight(0xffffff, 0xd9dee2, 0.18));

  const ground = new Mesh(new PlaneGeometry(1600, 1000).rotateX(-Math.PI / 2), groundMaterial(halfWidth));
  ground.position.y = -(DIM.CT + DIM.drop + 0.02);
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new PerspectiveCamera(24, 1, 50, 4000);
  let width = 1;
  let height = 1;

  return {
    scene,
    camera,
    renderer,
    resize() {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
    },
    // Centre the view on x between the top and bottom bars (spec §11).
    frame(x, zoom) {
      const band = Math.max(0.3, (height - insets.top - insets.bottom) / height);
      const s = Math.max((halfWidth + 12) / (TAN * (width / height)), (DIM.H + 30) / 2 / (TAN * band)) * zoom;
      camera.position.set(x, 4 + s * Math.cos(TILT), s * Math.sin(TILT));
      camera.lookAt(x, 4, 0);
      camera.setViewOffset(width, height, 0, (insets.bottom - insets.top) / 2, width, height);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      envMap.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      // Free the GL context now; browsers cap how many can stay alive.
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
```

- [ ] **Step 10: 写 src/book/book.js（先不含指针交互）**

`src/book/book.js`：

```js
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
```

- [ ] **Step 11: 写查看器 src/viewer.js**

`src/viewer.js`：

```js
import { createBook } from './book/book.js';

const PATHS = {
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

const HINT_OPEN = '拖动页面或点击两侧翻页；点击卡片查看详情';
const HINT_CLOSED = '点击封面或向左拖动打开';
const KEYS = { ArrowLeft: 'prev', PageUp: 'prev', ArrowRight: 'next', PageDown: 'next' };

export function openViewer(album) {
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'ab';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', album.title);
  root.innerHTML = `
    <div class="ab-stage"></div>
    <header class="ab-bar">
      <h2 class="ab-title"></h2>
      <button class="ab-icon" type="button" data-act="cover" aria-label="合上卡册" aria-pressed="false">${icon('book')}</button>
      <button class="ab-icon" type="button" data-act="close" aria-label="关闭">${icon('close')}</button>
    </header>
    <footer class="ab-foot">
      <div class="ab-nav" data-open>
        <button class="ab-icon ab-round" type="button" data-act="prev" aria-label="上一页">${icon('prev')}</button>
        <span class="ab-count" aria-live="polite"></span>
        <button class="ab-icon ab-round" type="button" data-act="next" aria-label="下一页">${icon('next')}</button>
      </div>
      <div class="ab-nav" data-closed hidden>
        <button class="ab-primary" type="button" data-act="cover">${icon('bookOpen')}打开卡册</button>
      </div>
      <p class="ab-hint">${HINT_OPEN}</p>
    </footer>
    <div class="ab-panel-wrap" hidden>
      <aside class="ab-panel" aria-label="卡片详情">
        <div class="ab-panel-head">
          <button class="ab-icon" type="button" data-act="panel" aria-label="关闭详情">${icon('close')}</button>
        </div>
        <div class="ab-panel-body">
          <div class="ab-panel-img" aria-hidden="true"></div>
          <h3 class="ab-panel-title"></h3>
          <p class="ab-panel-meta"></p>
        </div>
      </aside>
    </div>
    <p class="ab-message" hidden>当前浏览器无法显示 3D 卡册（WebGL 不可用）</p>
    <div class="ab-rotate">${icon('phone')}<p>请横过手机查看卡册</p></div>`;
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.ab-stage');
  const panel = $('.ab-panel-wrap');
  $('.ab-title').textContent = album.title;

  let book = null;

  function onChange({ spread, spreads, closed }) {
    $('[data-open]').hidden = closed;
    $('[data-closed]').hidden = !closed;
    $('.ab-count').textContent = `${spread} / ${spreads}`;
    $('[data-act=next]').disabled = spread === spreads;
    const cover = $('.ab-bar [data-act=cover]');
    cover.innerHTML = icon(closed ? 'bookOpen' : 'book');
    cover.setAttribute('aria-label', closed ? '打开卡册' : '合上卡册');
    cover.setAttribute('aria-pressed', String(closed));
    $('.ab-hint').textContent = closed ? HINT_CLOSED : HINT_OPEN;
  }

  function showCard(card) {
    const art = $('.ab-panel-img');
    art.style.background = card.color || '#888';
    art.textContent = card.title ?? ''; // shows through if the image fails
    if (card.src) {
      const image = new Image();
      image.alt = '';
      image.onerror = () => image.remove();
      image.src = card.src;
      art.append(image);
    }
    $('.ab-panel-title').textContent = card.title ?? '';
    $('.ab-panel-meta').textContent = `第 ${card.index + 1} 张，共 ${album.cards.length} 张`;
    panel.hidden = false;
  }

  function fail() {
    root.dataset.error = '';
    $('.ab-message').hidden = false;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (panel.hidden) close();
      else panel.hidden = true;
    } else if (KEYS[e.key] && book) {
      book[KEYS[e.key]]();
    } else {
      return;
    }
    e.preventDefault();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'panel') panel.hidden = true;
    else if (act && book) book[act === 'cover' ? 'toggleCover' : act]();
  }

  function close() {
    window.removeEventListener('keydown', onKey);
    stage.removeEventListener('webglcontextlost', fail, true);
    book?.dispose();
    book = null;
    root.remove();
    opener?.focus();
  }

  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  stage.addEventListener('webglcontextlost', fail, true); // the event does not bubble
  document.body.append(root);
  root.focus();

  const insets = { top: $('.ab-bar').offsetHeight, bottom: $('.ab-foot').offsetHeight };
  try {
    book = createBook(stage, { album, insets, onChange, onCardClick: showCard });
  } catch (err) {
    if (err.message !== 'webgl') throw err;
    fail();
  }
  return close;
}
```

- [ ] **Step 12: 运行检查，确认通过**

Run: `node /tmp/album-checks/viewer-check.mjs`
Expected: 15 行 PASS，然后是 `console: clean` 和 `ALL PASSED`，退出码 0。截图保存在 `/tmp/album-shots/`。

- [ ] **Step 13: 构建**

Run: `npm run build`
Expected: `✓ built in …`。唯一的警告是 `(!) Some chunks are larger than 500 kB after minification.`：three 使 viewer chunk 约为 580 kB，可以接受。

- [ ] **Step 14: 与原站截图对比**

原站截图是 REA 抓取的会话文件，不在仓库里，位于 `/Users/miwei/.copilot/session-state/671e265d-8a07-4c24-a810-2e5aa094f578/files/`。逐对并排查看：

- `/tmp/album-shots/spread-1.png` 对 `step3_after_open.png`（1 / 6）；
- `/tmp/album-shots/spread-3.png` 对 `step7_after_next2.png`（3 / 6）；
- `/tmp/album-shots/closed.png` 对 `step8_closed.png`（合上）。

原站前两张是 1280×800，本地是 1280×720，所以只比较比例，不比较像素。以下各项应一致：

- 三板结构、四环与环座；
- 2×3 卡布局；
- 磨砂封面：合上时透出模糊的卡面，左下角有压印标题；
- 阴影；
- 底栏与提示；
- 书在画面中的位置和比例接近。

如果有明显差异，回到 spec §7–§11 核对参数：尺寸看 `layout.js`，结构看 `binder.js`，光影和取景看 `scene.js`，贴图看 `textures.js`。修正后重跑 Step 12。

- [ ] **Step 15: 提交**

```bash
git add index.html public/cards.json src/main.js src/style.css src/viewer.js src/book/textures.js src/book/scene.js src/book/book.js
git commit -m "feat: render the 3D album viewer with keyboard and button navigation" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: 指针交互（拖拽、甩动、点击）

**Files:**
- Modify: `src/book/book.js`（导入、`createBook` 的选项、活页的面编号、指针状态变量 `ringX`/`pointer`/`drag`、`step`、`place`、`tick`、新增的指针一节、`dispose`）
- Test: `/tmp/album-checks/pointer-check.mjs`

**Interfaces:**
- Consumes: `cardAt`（Task 1）；`binder.pose(c).C`（Task 3）；`createStage(...)` 返回的 `camera` 和 `renderer.domElement`（Task 4）。
- Produces: `createBook(container, { album, insets, onChange, onCardClick })`。点中有卡的卡袋时调用 `onCardClick({ ...card, index })`。返回值不变。

- [ ] **Step 1: 写 pointer-check.mjs**

`/tmp/album-checks/pointer-check.mjs`：

```js
// Pointer checks (drag, fling, taps) against the 57 demo cards at 1280×720.
// Usage: node pointer-check.mjs [url] [screenshot-dir]
import { mkdirSync } from 'node:fs';
import { launch, steps } from './cdp.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? '/tmp/album-shots';
mkdirSync(OUT, { recursive: true });

const b = await launch();
try {
  await b.emulate();
  await b.goto(URL);
  await b.click('.page .ab-primary');
  await b.check('opens at spread 1', { count: '1 / 6', closed: false, canvases: 1 });

  await b.drag(steps(1000, 300, 20), { hold: 200, mid: () => b.shot(`${OUT}/drag-mid.png`) });
  await b.check('slow drag past 22% flips forward', { count: '2 / 6' });
  await b.drag(steps(1000, 960, 8), { hold: 200 });
  await b.check('short slow drag springs back', { count: '2 / 6' });
  await b.drag(steps(1000, 920, 4), { gap: 12 });
  await b.check('quick fling flips forward', { count: '3 / 6' });
  await b.drag([...steps(1000, 700, 15), 740, 780]);
  await b.check('flinging back cancels the turn', { count: '3 / 6' });
  await b.drag(steps(300, 1000, 20), { hold: 200 });
  await b.check('dragging the left page turns back', { count: '2 / 6' });

  await b.tap(800, 200);
  await b.check('tapping a right card shows details', { panel: '卡片 13 | 第 13 张，共 57 张' }, 300);
  await b.key('Escape');
  await b.check('Esc closes details, viewer stays', { panel: null, count: '2 / 6' }, 300);
  await b.tap(480, 200);
  await b.check('tapping a left card shows details', { panel: '卡片 8 | 第 8 张，共 57 张' }, 300);
  await b.click('[data-act=panel]');
  await b.check('details close button', { panel: null }, 300);
  await b.tap(1215, 360);
  await b.check('tapping the right margin turns forward', { count: '3 / 6' });
  await b.tap(65, 360);
  await b.check('tapping the left margin turns back', { count: '2 / 6' });

  await b.click('.ab-bar [data-act=cover]');
  await b.check('cover button closes', { closed: true }, 2500);
  await b.drag(steps(800, 300, 20), { hold: 200 });
  await b.check('dragging the cover left opens it', { count: '1 / 6', closed: false }, 2500);
  await b.click('.ab-bar [data-act=cover]');
  await b.check('cover button closes again', { closed: true }, 2500);
  await b.tap(640, 360);
  await b.check('tapping the closed cover opens it', { count: '1 / 6', closed: false }, 2500);
} finally {
  process.exitCode = await b.close();
}
```

- [ ] **Step 2: 运行，确认失败**

dev server 仍在运行。

Run: `node /tmp/album-checks/pointer-check.mjs`
Expected: FAIL，退出码 1：

```text
PASS opens at spread 1
FAIL slow drag past 22% flips forward {"pageCount":"57 张卡片",...,"count":"1 / 6",...}
...
14 FAILED
```

后面的失败是连锁反应：没有打开详情栏时，脚本里的 Esc 会直接关闭查看器。

- [ ] **Step 3: 给 book.js 加指针交互**

改动要点（spec §10）：

- pointerdown：射线与 y = 0 平面求交，按交点在环心哪一侧选叶；合上时抓封面。
- 移动超过 5 px（鼠标）或 9 px（触摸）才进入拖拽。外缘角 θe = acos(cos θe0 + Δx/W)，Δx 用起拖时测得的每毫米像素数换算。
- 拖拽中，该叶的弹簧目标为 θe，并令 b = θe − θ。
- 松手时，按最近 100 ms 的速度和进度决定翻过去还是回弹。
- 没有拖动时当作点击：合上时打开封面；点中卡时调用 `onCardClick`；否则按点击位置在环心左侧还是右侧翻页。

应用以下补丁：

```bash
git apply <<'PATCH'
--- a/src/book/book.js
+++ b/src/book/book.js
@@ -1,19 +1,21 @@
+import { Plane, Raycaster, Vector2, Vector3 } from 'three';
 import { createBinder } from './binder.js';
-import { DIM, sheetCount } from './layout.js';
+import { DIM, cardAt, sheetCount } from './layout.js';
 import { createStage } from './scene.js';
 import { createSheet, restHoleAngle } from './sheet.js';
 import { createFaceTexture } from './textures.js';
 
-const { T } = DIM;
+const { W, H, T } = DIM;
 const PI = Math.PI;
 const smoothstep = (t) => t * t * (3 - 2 * t);
 
-export function createBook(container, { album, insets, onChange }) {
+export function createBook(container, { album, insets, onChange, onCardClick }) {
   const { cards } = album;
   const S = sheetCount(cards.length);
   const binder = createBinder({ sheets: S, title: album.title });
   const stage = createStage(container, binder.xb + binder.B, insets);
-  const { scene, renderer } = stage;
+  const { scene, camera, renderer } = stage;
+  const canvas = renderer.domElement;
   scene.add(binder.group);
 
   const anisotropy = renderer.capabilities.getMaxAnisotropy();
@@ -25,6 +27,8 @@ export function createBook(container, { album, insets, onChange }) {
       return texture;
     });
     const sheet = createSheet(front, back);
+    sheet.front.userData.face = 2 * i;
+    sheet.back.userData.face = 2 * i + 1;
     scene.add(sheet.group);
     sheets.push(sheet);
   }
@@ -32,6 +36,9 @@ export function createBook(container, { album, insets, onChange }) {
   // Leaf 0 is the cover, leaf j ≥ 1 is sheet j − 1. Leaves j < k lie on the left.
   const leaves = Array.from({ length: S + 1 }, (_, j) => ({ th: j === 0 ? PI : 0, w: 0, b: 0, bv: 0, wait: 0 }));
   let k = 1;
+  let ringX = 0;
+  let pointer = null;
+  let drag = null;
   let raf = 0;
   let last = 0;
   let disposed = false;
@@ -56,12 +63,13 @@ export function createBook(container, { album, insets, onChange }) {
   function step(dt) {
     let moving = false;
     leaves.forEach((leaf, j) => {
-      const goal = j < k ? PI : 0;
+      const dragged = drag?.j === j;
+      const goal = dragged ? drag.edge : j < k ? PI : 0;
       if (reduced.matches) {
         Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0, wait: 0 });
         return;
       }
-      if (leaf.wait > 0) {
+      if (leaf.wait > 0 && !dragged) {
         leaf.wait = Math.max(0, leaf.wait - dt);
         moving = true;
         return;
@@ -76,12 +84,17 @@ export function createBook(container, { album, insets, onChange }) {
           leaf.w = 0;
         }
         if (j === 0) continue; // the cover does not bend
-        leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * h;
-        leaf.b += leaf.bv * h;
+        if (dragged) {
+          leaf.b = goal - leaf.th;
+          leaf.bv = 0;
+        } else {
+          leaf.bv += (-196 * (leaf.b + 0.06 * leaf.w) - 15.4 * leaf.bv) * h;
+          leaf.b += leaf.bv * h;
+        }
         leaf.b = Math.min(PI - leaf.th, Math.max(-leaf.th, leaf.b));
       }
       const still = Math.abs(leaf.w) < 1e-2 && Math.abs(leaf.b) < 1e-3 && Math.abs(leaf.bv) < 1e-2;
-      if (still && Math.abs(leaf.th - goal) < 1e-3) Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
+      if (!dragged && still && Math.abs(leaf.th - goal) < 1e-3) Object.assign(leaf, { th: goal, w: 0, b: 0, bv: 0 });
       else moving = true;
     });
     return moving;
@@ -96,6 +109,7 @@ export function createBook(container, { album, insets, onChange }) {
       const psiL = PI - restHoleAngle(C[1], binder.R, (i + 0.5) * T);
       sheet.update(C, binder.R, psiR + (th / PI) * (psiL - psiR), th, b);
     });
+    ringX = C[0];
     stage.frame(binder.closedCenter * (1 - smoothstep(c)), 1 + 0.15 * Math.sin(PI * c));
   }
 
@@ -104,7 +118,7 @@ export function createBook(container, { album, insets, onChange }) {
     const moving = step(last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60);
     place();
     stage.render();
-    last = moving ? now : 0;
+    last = moving || drag ? now : 0;
     if (last) raf = requestAnimationFrame(tick);
   }
 
@@ -112,6 +126,94 @@ export function createBook(container, { album, insets, onChange }) {
     if (!disposed && !raf) raf = requestAnimationFrame(tick);
   }
 
+  // Pointer input: drag a leaf, fling it, or tap a card / either side.
+  const raycaster = new Raycaster();
+  const floor = new Plane(new Vector3(0, 1, 0), 0);
+  const ndc = new Vector2();
+  const hit = new Vector3();
+
+  function aim(e) {
+    const r = canvas.getBoundingClientRect();
+    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
+    raycaster.setFromCamera(ndc, camera);
+  }
+
+  function pxPerMm() {
+    const a = new Vector3(0, 0, 0).project(camera);
+    const b = new Vector3(W, 0, 0).project(camera);
+    return (Math.abs(b.x - a.x) * canvas.clientWidth) / 2 / W;
+  }
+
+  function onDown(e) {
+    if (pointer || e.button !== 0) return;
+    aim(e);
+    const x = raycaster.ray.intersectPlane(floor, hit) ? hit.x : ringX;
+    let j = k - 1;
+    if (k === 0) j = 0;
+    else if (x >= ringX) j = k <= S ? k : -1;
+    const slop = e.pointerType === 'mouse' ? 5 : 9;
+    pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x, j, fromRight: j >= k, slop, samples: [] };
+    canvas.setPointerCapture(e.pointerId);
+  }
+
+  function onMove(e) {
+    const p = pointer;
+    if (!p || e.pointerId !== p.id || p.j < 0) return;
+    const dx = e.clientX - p.x0;
+    if (!drag) {
+      if (Math.hypot(dx, e.clientY - p.y0) < p.slop) return;
+      const leaf = leaves[p.j];
+      p.edge0 = leaf.th + leaf.b;
+      p.scale = pxPerMm();
+      drag = p;
+    }
+    p.edge = Math.acos(Math.min(1, Math.max(-1, Math.cos(p.edge0) + dx / p.scale / W)));
+    p.samples.push([e.timeStamp, e.clientX]);
+    if (p.samples.length > 20) p.samples.shift();
+    requestRender();
+  }
+
+  function release(p, e) {
+    p.samples.push([e.timeStamp, e.clientX]);
+    const [t0, x0] = p.samples.find(([t]) => e.timeStamp - t <= 100);
+    const dt = (e.timeStamp - t0) / 1000;
+    const vx = dt > 0 ? (e.clientX - x0) / p.scale / W / dt : 0; // sheet widths per second, rightwards
+    const v = p.fromRight ? -vx : vx;
+    const progress = p.fromRight ? p.edge / PI : 1 - p.edge / PI;
+    if (v > 0.9 || (progress > 0.22 && v >= -0.05)) setK(p.fromRight ? Math.max(k, p.j + 1) : Math.min(k, p.j));
+  }
+
+  function tap(e, p) {
+    if (k === 0) return setK(1);
+    aim(e);
+    const [first] = raycaster.intersectObjects(sheets.flatMap((s) => [s.front, s.back]), false);
+    if (first) {
+      const { face } = first.object.userData;
+      const u = face % 2 ? 1 - first.uv.x : first.uv.x;
+      const index = cardAt(face, u * W, (1 - first.uv.y) * H, cards.length);
+      if (index >= 0) return onCardClick({ ...cards[index], index });
+    }
+    setK(p.x < ringX ? k - 1 : k + 1);
+  }
+
+  function onUp(e) {
+    const p = pointer;
+    if (!p || e.pointerId !== p.id) return;
+    pointer = null;
+    if (drag) {
+      drag = null;
+      release(p, e);
+    } else if (e.type === 'pointerup') {
+      tap(e, p);
+    }
+    requestRender();
+  }
+
+  canvas.addEventListener('pointerdown', onDown);
+  canvas.addEventListener('pointermove', onMove);
+  canvas.addEventListener('pointerup', onUp);
+  canvas.addEventListener('pointercancel', onUp);
+
   const observer = new ResizeObserver(() => {
     stage.resize();
     requestRender();
@@ -130,6 +232,10 @@ export function createBook(container, { album, insets, onChange }) {
       disposed = true;
       cancelAnimationFrame(raf);
       observer.disconnect();
+      canvas.removeEventListener('pointerdown', onDown);
+      canvas.removeEventListener('pointermove', onMove);
+      canvas.removeEventListener('pointerup', onUp);
+      canvas.removeEventListener('pointercancel', onUp);
       sheets.forEach((s) => s.dispose());
       binder.dispose();
       stage.dispose();
PATCH
```

Run: `git diff --shortstat`
Expected: ` 1 file changed, 116 insertions(+), 10 deletions(-)`

- [ ] **Step 4: 运行，确认通过**

Run: `node /tmp/album-checks/pointer-check.mjs`
Expected: 16 行 PASS，然后是 `console: clean` 和 `ALL PASSED`，退出码 0。查看 `/tmp/album-shots/drag-mid.png`：右页被拖到半空，外缘滞后形成弯曲。

Run: `node /tmp/album-checks/viewer-check.mjs`
Expected: `ALL PASSED`（键盘和按钮没有回归）。

- [ ] **Step 5: 提交**

```bash
git add src/book/book.js
git commit -m "feat: add drag, fling and tap input to the album" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: 边界情况与验收

**Files:**
- Test: `/tmp/album-checks/edge-check.mjs`
- Modify: 只在检查失败时修改对应的文件（见 Step 2 的对照表）。

**Interfaces:**
- Consumes: 完整的应用（Task 1–5）；`public/cards.json`（脚本运行时临时改写，结束时恢复）。
- Produces: 无新接口。

- [ ] **Step 1: 写 edge-check.mjs**

`/tmp/album-checks/edge-check.mjs`：

```js
// Edge cases: card counts, broken data and images, no WebGL, reduced motion, phone orientation.
// Usage: node edge-check.mjs <public-dir> [url] [screenshot-dir]
// Rewrites <public-dir>/cards.json while it runs and restores it afterwards.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';

const PUBLIC = process.argv[2];
const URL = process.argv[3] ?? 'http://localhost:5173/';
const OUT = process.argv[4] ?? '/tmp/album-shots';
mkdirSync(OUT, { recursive: true });

const dataFile = `${PUBLIC}/cards.json`;
const sampleFile = `${PUBLIC}/check-sample.svg`;
const original = readFileSync(dataFile, 'utf8');
const { title, cards } = JSON.parse(original);
const write = (list) => writeFileSync(dataFile, JSON.stringify({ title, cards: list }));
writeFileSync(
  sampleFile,
  '<svg xmlns="http://www.w3.org/2000/svg" width="856" height="540"><rect width="856" height="540" fill="#1d6fd8"/><circle cx="640" cy="170" r="110" fill="#ffd23f"/></svg>',
);

const b = await launch();
try {
  await b.emulate();
  for (const n of [0, 1, 7, 12, 13]) {
    const spreads = Math.max(1, Math.ceil(n / 12)) + 1;
    write(cards.slice(0, n));
    await b.goto(URL);
    await b.check(`${n} cards: page count`, { pageCount: `${n} 张卡片` }, 0);
    await b.click('.page .ab-primary');
    await b.check(`${n} cards: opens`, { count: `1 / ${spreads}`, closed: false, canvases: 1 });
    if (n > 0) {
      await b.tap(800, 200);
      await b.check(`${n} cards: first card details`, { panel: `卡片 1 | 第 1 张，共 ${n} 张` }, 300);
      await b.key('Escape');
    }
    for (let i = 0; i < 4; i++) await b.key('ArrowRight');
    await b.check(`${n} cards: last spread`, { count: `${spreads} / ${spreads}`, nextDisabled: true }, 2500);
    await b.shot(`${OUT}/cards-${n}.png`);
    await b.key('Escape');
    await b.check(`${n} cards: Esc closes the viewer`, { count: null, canvases: 0 }, 300);
  }

  write([{ ...cards[0], src: 'check-sample.svg' }, { ...cards[1], src: 'missing-image.png' }, cards[2]]);
  await b.goto(URL);
  await b.click('.page .ab-primary');
  await b.check('images: opens', { count: '1 / 2' }, 2500);
  await b.shot(`${OUT}/images.png`);
  await b.tap(800, 200);
  await b.check('images: details show the image', { panel: '卡片 1 | 第 1 张，共 3 张', panelImage: true }, 800);
  await b.key('Escape');
  await b.tap(1030, 200);
  await b.check('images: a broken image falls back to the title', { panel: '卡片 2 | 第 2 张，共 3 张', panelImage: false }, 800);

  writeFileSync(dataFile, '{');
  await b.goto(URL);
  await b.check('broken cards.json shows an error', { pageError: '相册数据加载失败' }, 0);
  writeFileSync(dataFile, original);

  await b.emulate({ reducedMotion: true });
  await b.goto(URL);
  await b.click('.page .ab-primary');
  await b.check('reduced motion: opens', { count: '1 / 6' });
  await b.key('ArrowRight');
  await b.check('reduced motion: turns without animating', { count: '2 / 6' }, 100);
  await b.shot(`${OUT}/reduced-motion.png`);

  await b.emulate({ width: 390, height: 844, mobile: true });
  await b.goto(URL);
  await b.click('.page .ab-primary');
  await b.check('portrait phone: rotate hint', { rotateHint: true, canvases: 1 });
  await b.shot(`${OUT}/portrait.png`);
  await b.emulate({ width: 844, height: 390, mobile: true });
  await b.check('landscape phone: book shown', { rotateHint: false, count: '1 / 6' });
  await b.shot(`${OUT}/landscape.png`);
} finally {
  writeFileSync(dataFile, original);
  rmSync(sampleFile, { force: true });
  process.exitCode = await b.close();
}

// three.js logs the failed context itself before the viewer shows its message.
const plain = await launch({ args: ['--disable-3d-apis'], allow: /WebGL/ });
try {
  await plain.emulate();
  await plain.goto(URL);
  await plain.click('.page .ab-primary');
  await plain.check('no WebGL: shows the message', { message: true, canvases: 0 }, 500);
} finally {
  const code = await plain.close();
  process.exitCode ||= code;
}
```

- [ ] **Step 2: 运行**

Run: `node /tmp/album-checks/edge-check.mjs public`
Expected: 先是 32 行 PASS、`console: clean`、`ALL PASSED`；然后是 `PASS no WebGL: shows the message`、`console: clean`、`ALL PASSED`；退出码 0。

这些行为已在 Task 4–5 中实现，所以这一步没有「先失败」。如果某行 FAIL，按下表到对应的文件修正，然后重跑本检查以及 `viewer-check`、`pointer-check`：

| 失败的检查 | 对应代码 |
|---|---|
| `N cards: …` | `layout.js` 的 `sheetCount` 和 `cardAt`；`book.js` 的叶数与 k 的范围；`textures.js` 的空卡袋 |
| `images: opens`，或截图中的卡面不对 | `textures.js` 的图片加载与重绘 |
| `images: details show the image`、`images: a broken image falls back to the title` | `viewer.js` 的 `showCard` |
| `broken cards.json …` | `main.js` 的 `loadAlbum` |
| `reduced motion …` | `book.js` 的 `step`（reduced motion 分支） |
| `portrait phone …`、`landscape phone …` | `style.css` 中 `.ab-rotate` 的媒体查询；`scene.js` 的 `frame` |
| `no WebGL …` | `scene.js` 的 `createStage`（try/catch）；`viewer.js` 的 `fail` |

- [ ] **Step 3: 确认数据已恢复**

Run: `git status --short`
Expected: 没有输出。脚本已恢复 `public/cards.json`，并删除了 `public/check-sample.svg`。

- [ ] **Step 4: 查看截图**

`/tmp/album-shots/` 下应看到：

- `cards-0.png`：2 / 2，左页是空卡袋（唯一一张活页的背面），右边是封底；
- `cards-13.png`：3 / 3，左页是空卡袋（第 2 张活页的背面），右边是封底；
- `images.png`：第 1 张卡显示蓝底黄圆的示例图，第 2 张（图片 404）和第 3 张显示占位卡；
- `reduced-motion.png`：直接停在 2 / 6，没有翻到一半的页；
- `portrait.png`：显示横屏提示；
- `landscape.png`：书完整地显示在顶栏和底栏之间。

- [ ] **Step 5: 最终构建**

Run: `npm run build`
Expected: `✓ built in …`，只有 chunk 体积警告。

Run: `cat src/*.js src/book/*.js | wc -l && wc -l < src/style.css`
Expected: `1086` 和 `358`（spec §14 的规模：JS 约 1100 行、CSS 约 360 行）。如果验收时修正过代码，数字会略有变化，接近即可。

- [ ] **Step 6: 手动清单（脚本覆盖不到的部分）**

- 真机触摸：停掉 dev server，用 `npm run dev -- --port 5173 --strictPort --host` 重启，在同一局域网的手机上打开输出中 `Network:` 那一行的地址。横屏时拖拽翻页、快甩、点卡看详情、点两侧翻页都正常，页面本身不滚动。
- Safari：书下接触阴影的边缘是柔和的（依赖 Canvas 的 `ctx.filter`）。如果边缘发硬，记录下来作为后续改进，不阻塞验收。
- 错峰动画：按 → 三次到 4 / 6，再点右上角的书本图标。活页从当前跨页开始依次合上，相邻约 60 ms，最后封面盖上。
- 桌面窗口缩放：拖动浏览器窗口改变宽高，书始终完整地居中在两栏之间，没有拉伸。

如果这里修正了代码，重跑 Step 2 以及 `viewer-check`、`pointer-check`，全部 `ALL PASSED` 后再继续。

- [ ] **Step 7: 收尾**

停掉 dev server（在它的终端按 Ctrl-C，或结束后台进程），然后：

Run: `rm -rf /tmp/album-checks /tmp/album-shots`

- [ ] **Step 8: 提交（只在修正过代码时）**

Run: `git status --short`
Expected: 没有输出时，不需要提交，计划完成。

如果 Step 2 或 Step 6 中修正过代码：

```bash
git add -A index.html public src
git commit -m "fix: album edge cases found during acceptance" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
