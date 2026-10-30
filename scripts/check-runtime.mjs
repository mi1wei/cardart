import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

try {
  const { values } = parseArgs({ options: { platform: { type: 'string' }, arch: { type: 'string' } } });
  const platform = values.platform ?? process.platform;
  const arch = values.arch ?? process.arch;
  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(`Target ${platform}-${arch} does not match host ${process.platform}-${process.arch}; build on the native runner.`);
  }
  if (Number(process.versions.node.split('.')[0]) < 24 || Number(process.versions.napi) < 9) {
    throw new Error('Node 24 or newer with Node-API 9 is required.');
  }
  const { info } = await sharp(fileURLToPath(new URL('../src/assets/folio-mark.svg', import.meta.url)))
    .resize(32, 32).raw().toBuffer({ resolveWithObject: true });
  console.log(JSON.stringify({ platform, arch, node: process.versions.node, napi: process.versions.napi, image: info }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
