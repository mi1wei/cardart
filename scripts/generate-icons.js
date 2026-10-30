import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('../public/', import.meta.url)));
// Full-colour illustration for app, Dock, browser and Windows icons.
const app = await readFile(new URL('../src/assets/folio-app-icon.png', import.meta.url));
// Monochrome vector mark: menu-bar templates must be a single-colour silhouette.
const mark = await readFile(new URL('../src/assets/folio-mark.svg', import.meta.url), 'utf8');

function scaled(size, inset = 0) {
  let image = sharp(app).resize(size - 2 * inset, size - 2 * inset, { kernel: 'lanczos3' });
  // Small frames lose edge contrast when downsampled; restore it gently.
  if (size <= 64) image = image.sharpen({ sigma: 0.5, m1: 0.2, m2: 0.8 });
  if (inset) image = image.extend({ top: inset, bottom: inset, left: inset, right: inset, background: '#0000' });
  return image.png().toBuffer();
}

// iOS requires an opaque square and applies its own, tighter corner mask. Fill the transparent
// corners by extending the tile's own edge colours outward so the mask never reveals a seam.
async function touchIcon(size) {
  const grid = 128;
  const { data } = await sharp(app).resize(grid, grid).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const known = new Uint8Array(grid * grid);
  for (let i = 0; i < known.length; i++) known[i] = data[i * 4 + 3] === 255 ? 1 : 0;
  for (let progress = true; progress;) {
    progress = false;
    const next = known.slice();
    for (let i = 0; i < known.length; i++) {
      if (known[i]) continue;
      const x = i % grid;
      const sum = [0, 0, 0];
      let count = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < grid - 1 ? i + 1 : -1, i - grid, i + grid]) {
        if (j < 0 || j >= known.length || !known[j]) continue;
        for (let c = 0; c < 3; c++) sum[c] += data[j * 4 + c];
        count++;
      }
      if (!count) continue;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(sum[c] / count);
      data[i * 4 + 3] = 255;
      next[i] = 1;
      progress = true;
    }
    known.set(next);
  }
  const backdrop = await sharp(data, { raw: { width: grid, height: grid, channels: 4 } })
    .resize(1024, 1024, { kernel: 'cubic' }).blur(6).png().toBuffer();
  const full = await sharp(backdrop).composite([{ input: app }]).png().toBuffer();
  return sharp(full).resize(size, size, { kernel: 'lanczos3' }).removeAlpha().png().toBuffer();
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
    // A transparent margin of 1/16 per side keeps the Dock tile the same size as other apps.
    const image = await scaled(size, size / 16);
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
  macIcon().then((image) => writeFile(join(output, 'icons/folio.icns'), image)),
  tray(16, 72).then((image) => writeFile(join(output, 'icons/trayTemplate.png'), image)),
  tray(32, 144).then((image) => writeFile(join(output, 'icons/trayTemplate@2x.png'), image)),
]);
console.log(`Generated Folio icons in ${output}`);
