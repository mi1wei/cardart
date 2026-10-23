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
