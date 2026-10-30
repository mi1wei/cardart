import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { resizeRgba, sharpenRgba } from './icon-raster.js';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('../public/', import.meta.url)));
// Full-colour illustration for app, Dock, browser and Windows icons.
const app = await readFile(new URL('../src/assets/folio-app-icon.png', import.meta.url));
// Monochrome vector mark: menu-bar templates must be a single-colour silhouette.
const mark = await readFile(new URL('../src/assets/folio-mark.svg', import.meta.url), 'utf8');

// Pixels are resampled in JavaScript (see icon-raster.js) and libvips only decodes and encodes
// PNG, so the committed icons are byte-identical on every CI architecture.
const { data: source, info } = await sharp(app).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== info.height) throw new Error('folio-app-icon.png must be square');
const resized = new Map();
const resize = (size) => {
  if (!resized.has(size)) resized.set(size, resizeRgba(source, info.width, size));
  return resized.get(size);
};
const encode = (data, size, channels = 4) => sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {
  raw: { width: size, height: size, channels },
}).png().toBuffer();

function scaled(size) {
  // Small frames lose edge contrast when downsampled; restore it gently.
  return encode(size <= 64 ? sharpenRgba(resize(size), size, 0.5) : resize(size), size);
}

// Opaque square of the tile at `size`: the transparent corners and side bands are filled by
// extending the tile's own edge colours outward, so a tighter mask never reveals a seam.
function fullBleed(size, smoothing) {
  const art = resize(size);
  const pixels = size * size;
  const backdrop = new Uint8Array(pixels * 3);
  const known = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    if (art[i * 4 + 3] !== 255) continue;
    known[i] = 1;
    for (let c = 0; c < 3; c++) backdrop[i * 3 + c] = art[i * 4 + c];
  }
  const filled = known.slice();
  const neighbours = (i) => {
    const x = i % size;
    return [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i >= size ? i - size : -1, i + size < pixels ? i + size : -1];
  };
  for (let progress = true; progress;) {
    progress = false;
    const next = filled.slice();
    for (let i = 0; i < pixels; i++) {
      if (filled[i]) continue;
      const sum = [0, 0, 0];
      let count = 0;
      for (const j of neighbours(i)) {
        if (j < 0 || !filled[j]) continue;
        for (let c = 0; c < 3; c++) sum[c] += backdrop[j * 3 + c];
        count++;
      }
      if (!count) continue;
      for (let c = 0; c < 3; c++) backdrop[i * 3 + c] = Math.round(sum[c] / count);
      next[i] = 1;
      progress = true;
    }
    filled.set(next);
  }
  // Soften the streaks the edge extension leaves, touching only the filled pixels.
  for (let pass = 0; pass < smoothing; pass++) {
    const source = backdrop.slice();
    for (let i = 0; i < pixels; i++) {
      if (known[i]) continue;
      const sum = [0, 0, 0];
      let count = 0;
      for (const j of [i, ...neighbours(i)]) {
        if (j < 0) continue;
        for (let c = 0; c < 3; c++) sum[c] += source[j * 3 + c];
        count++;
      }
      for (let c = 0; c < 3; c++) backdrop[i * 3 + c] = Math.round(sum[c] / count);
    }
  }
  const opaque = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const alpha = art[i * 4 + 3];
    for (let c = 0; c < 3; c++) {
      opaque[i * 3 + c] = Math.round((art[i * 4 + c] * alpha + backdrop[i * 3 + c] * (255 - alpha)) / 255);
    }
  }
  return opaque;
}

// iOS requires an opaque square and applies its own, tighter corner mask.
const touchIcon = (size) => encode(fullBleed(size, 8), size, 3);

// macOS 26 shrinks icons that do not fill Apple's grid onto a grey plate. The grid is an
// 824/1024 rounded square inset 100/1024; its continuous corners are a superellipse
// (exponent 2.8) spanning 238/824 of the side, fitted to the system template.
const GRID = 824;
let macArt;
function macTile(size) {
  const inset = Math.round(size * 100 / 1024);
  const side = size - 2 * inset;
  macArt ??= fullBleed(GRID, 37);
  let art = new Uint8Array(side * side * 4);
  if (side === GRID) {
    for (let i = 0; i < side * side; i++) art.set([...macArt.subarray(i * 3, i * 3 + 3), 255], i * 4);
  } else {
    const rgba = new Uint8Array(GRID * GRID * 4).fill(255);
    for (let i = 0; i < GRID * GRID; i++) rgba.set(macArt.subarray(i * 3, i * 3 + 3), i * 4);
    art = resizeRgba(rgba, GRID, side);
  }
  if (size <= 64) art = sharpenRgba(art, side, 0.5);
  const corner = side * 238 / GRID;
  const inside = (u, v) => {
    const x = Math.max(corner - u, u - (side - corner), 0) / corner;
    const y = Math.max(corner - v, v - (side - corner), 0) / corner;
    return x ** 2.8 + y ** 2.8 <= 1;
  };
  const frame = new Uint8Array(size * size * 4);
  const samples = 4;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) hits += inside(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples);
      }
      if (!hits) continue;
      const i = ((y + inset) * size + x + inset) * 4;
      frame.set(art.subarray((y * side + x) * 4, (y * side + x) * 4 + 3), i);
      frame[i + 3] = Math.round(hits * 255 / (samples * samples));
    }
  }
  return encode(frame, size);
}

const tray = (size, density) => sharp(Buffer.from(mark.replaceAll('currentColor', '#000')))
  .resize(size).withMetadata({ density }).png().toBuffer();

async function windowsIcon() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map((size) => scaled(size)));
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16;
    directory[entry] = directory[entry + 1] = sizes[i] % 256;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(images[i].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  }
  return Buffer.concat([directory, ...images]);
}

async function macIcon() {
  // ICNS types distinguish standard and Retina representations of the same pixel size.
  const types = [
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128],
    ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
  ];
  const chunks = await Promise.all(types.map(async ([type, size]) => {
    const image = await macTile(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([header, image]);
  }));
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

await mkdir(join(output, 'icons'), { recursive: true });
await Promise.all([
  rm(join(output, 'favicon.svg'), { force: true }),
  windowsIcon().then((image) => writeFile(join(output, 'favicon.ico'), image)),
  touchIcon(180).then((image) => writeFile(join(output, 'apple-touch-icon.png'), image)),
  writeFile(join(output, 'icons/folio-1024.png'), app),
  // Page brand logo: shown at 22-28 CSS px, so 96px stays sharp on 3x displays.
  scaled(96).then((image) => writeFile(join(output, 'icons/folio-logo.png'), image)),
  macIcon().then((image) => writeFile(join(output, 'icons/folio.icns'), image)),
  tray(16, 72).then((image) => writeFile(join(output, 'icons/trayTemplate.png'), image)),
  tray(32, 144).then((image) => writeFile(join(output, 'icons/trayTemplate@2x.png'), image)),
]);
console.log(`Generated Folio icons in ${output}`);
