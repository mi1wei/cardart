import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('../public/', import.meta.url)));
const source = await readFile(new URL('../src/assets/folio-mark.svg', import.meta.url), 'utf8');
const mark = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>')).trim();
const blue = '#1d5f80';

function svg(background, transform = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${background}
  <g fill="#fff"${transform ? ` transform="${transform}"` : ''}>${mark.replaceAll('currentColor', '#fff')}</g>
</svg>
`;
}

const web = svg(`<rect width="64" height="64" rx="16" fill="${blue}"/>`);
const touch = svg(`<rect width="64" height="64" fill="${blue}"/>`);
const mac = svg(
  `<rect x="4" y="4" width="56" height="56" rx="13" fill="${blue}"/>`,
  'translate(4 4) scale(.875)',
);
const png = (image, size) => sharp(Buffer.from(image)).resize(size).png().toBuffer();

async function windowsIcon() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map((size) => png(web, size)));
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
    const image = await png(mac, size);
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
  writeFile(join(output, 'favicon.svg'), web),
  windowsIcon().then((image) => writeFile(join(output, 'favicon.ico'), image)),
  png(touch, 180).then((image) => writeFile(join(output, 'apple-touch-icon.png'), image)),
  png(touch, 1024).then((image) => writeFile(join(output, 'icons/folio-1024.png'), image)),
  macIcon().then((image) => writeFile(join(output, 'icons/folio.icns'), image)),
]);
console.log(`Generated Folio icons in ${output}`);
