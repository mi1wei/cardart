// Icon resampling in plain JavaScript. libvips resizes alpha images in floating point whose
// rounding differs between x64 and arm64, so committed icons would not be byte-identical on
// every CI runner. JavaScript arithmetic and Math.sin give the same results everywhere.

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos3 = (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0);

// Weights are rounded to multiples of 1/2^14 that sum exactly to one, so a last-bit difference
// in Math.sin between JavaScript engines cannot change any output pixel.
const UNIT = 1 << 14;

function weights(from, to) {
  const scale = from / to;
  const stretch = Math.max(scale, 1);
  const taps = [];
  for (let i = 0; i < to; i++) {
    const centre = (i + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.ceil(centre - 3 * stretch));
    const end = Math.min(from - 1, Math.floor(centre + 3 * stretch));
    const raw = [];
    let total = 0;
    for (let j = start; j <= end; j++) {
      const value = lanczos3((j - centre) / stretch);
      raw.push(value);
      total += value;
    }
    const units = raw.map((value) => Math.round(value / total * UNIT));
    let peak = 0;
    for (let k = 1; k < units.length; k++) if (units[k] > units[peak]) peak = k;
    units[peak] += UNIT - units.reduce((sum, value) => sum + value, 0);
    taps.push({ start, values: units.map((value) => value / UNIT) });
  }
  return taps;
}

const clamp = (value) => (value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value));

// Square RGBA resize with premultiplied alpha, so transparent pixels never tint visible edges.
export function resizeRgba(data, from, to) {
  const taps = weights(from, to);
  const premultiplied = new Float64Array(from * from * 4);
  for (let i = 0; i < from * from; i++) {
    const alpha = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) premultiplied[i * 4 + c] = data[i * 4 + c] * alpha;
    premultiplied[i * 4 + 3] = data[i * 4 + 3];
  }
  const rows = new Float64Array(to * from * 4);
  for (let y = 0; y < from; y++) {
    for (let x = 0; x < to; x++) {
      const { start, values } = taps[x];
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = 0; k < values.length; k++) sum += premultiplied[(y * from + start + k) * 4 + c] * values[k];
        rows[(y * to + x) * 4 + c] = sum;
      }
    }
  }
  const out = new Uint8Array(to * to * 4);
  for (let y = 0; y < to; y++) {
    const { start, values } = taps[y];
    for (let x = 0; x < to; x++) {
      const sum = [0, 0, 0, 0];
      for (let k = 0; k < values.length; k++) {
        const offset = ((start + k) * to + x) * 4;
        for (let c = 0; c < 4; c++) sum[c] += rows[offset + c] * values[k];
      }
      const alpha = clamp(sum[3]);
      const i = (y * to + x) * 4;
      out[i + 3] = alpha;
      if (alpha) for (let c = 0; c < 3; c++) out[i + c] = clamp(sum[c] * 255 / sum[3]);
    }
  }
  return out;
}

// Unsharp mask on fully opaque pixels whose 3x3 neighbourhood is opaque, so the silhouette
// edge keeps its antialiasing and never gains a halo.
export function sharpenRgba(data, size, amount) {
  const out = Uint8Array.from(data);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = (y * size + x) * 4;
      let opaque = true;
      for (let dy = -1; dy <= 1 && opaque; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (data[i + (dy * size + dx) * 4 + 3] !== 255) { opaque = false; break; }
      }
      if (!opaque) continue;
      for (let c = 0; c < 3; c++) {
        let blur = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) blur += data[i + (dy * size + dx) * 4 + c] * (dx ? 1 : 2) * (dy ? 1 : 2);
        }
        out[i + c] = clamp(data[i + c] + amount * (data[i + c] - blur / 16));
      }
    }
  }
  return out;
}
