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
