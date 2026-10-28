const { parentPort, workerData } = require('node:worker_threads');
const { stat, readFile } = require('node:fs/promises');

(async () => {
  const { file, maxBytes, maxPixels } = workerData;
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw Object.assign(new Error('HEIC file exceeds the input limit'), { code: 'HEIC_TOO_LARGE' });
  const bytes = await readFile(file);
  if (bytes.length > maxBytes || bytes.toString('ascii', 4, 8) !== 'ftyp' ||
    !['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx'].includes(bytes.toString('ascii', 8, 12))) throw new Error('Invalid HEIC image');
  const libheif = require('libheif-js/wasm-bundle');
  await libheif.ready;
  const decoder = new libheif.HeifDecoder();
  let images = [];
  try {
    images = decoder.decode(bytes);
    const primary = images.find((image) => image.is_primary());
    if (!primary) throw new Error('HEIC primary image is missing');
    const width = primary.get_width();
    const height = primary.get_height();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > maxPixels) {
      throw Object.assign(new Error('HEIC dimensions exceed the pixel limit'), { code: 'HEIC_TOO_LARGE' });
    }
    const data = new Uint8ClampedArray(width * height * 4);
    await new Promise((resolve, reject) => primary.display({ data, width, height }, (image) => image ? resolve() : reject(new Error('HEIC decompression failed'))));
    const pixels = new Uint8Array(data.buffer);
    parentPort.postMessage({ width, height, pixels }, [pixels.buffer]);
  } finally {
    for (const image of images) image.free();
    decoder.decoder?.delete();
  }
})().catch((error) => {
  parentPort.postMessage({ error: {
    code: error.code === 'HEIC_TOO_LARGE' ? error.code : 'HEIC_DECODE_FAILED',
    message: error.code === 'HEIC_TOO_LARGE' ? error.message : 'Unable to decode this HEIC image',
  } });
});
