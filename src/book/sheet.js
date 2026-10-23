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
