const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { expect } = require('@playwright/test');
const { Readable } = require('node:stream');
const { photoBytes } = require('../tests/fixtures/photo-metadata.cjs');
const { posterBytes, nativeVideo, request, videoOptions } = require('../tests/fixtures/video.cjs');

async function serveVideoModules(page) {
  for (const path of ['/src/video-probe.js', '/src/api.js', '/shared/media.js']) {
    const body = await readFile(join(__dirname, '..', path.slice(1)), 'utf8');
    await page.route(`**${path}`, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  }
}
async function launchProbe(fixture) {
  const launched = await fixture.launch();
  await expect(launched.page.locator('.nav .logo')).toBeVisible();
  await launched.page.goto(`${new URL(launched.page.url()).origin}/#/license`);
  await serveVideoModules(launched.page);
  return launched;
}
async function seedMixed(fixture, { note = '' } = {}) {
  const { openLibrary } = await import('../server/library.js');
  const { importPhoto } = await import('../server/importer.js');
  const { importVideo } = await import('../server/video-importer.js');
  const lib = await openLibrary(fixture.library);
  try {
    const album = await lib.create('Owned mixed-media album');
    await importPhoto(lib, album.id, Readable.from([await photoBytes({ exif: null, width: 1200, height: 800 })]), 'photo.jpg');
    const poster = await posterBytes({ width: 320, height: 180 });
    const { photo } = await importVideo(lib, album.id, request(poster, await nativeVideo()), 'clip.mp4',
      videoOptions(poster, { w: 320, h: 180, duration: 2, lastModified: 1577934245000 }));
    if (note) await lib.updatePhotoNote(album.id, photo.id, { note, previousNote: '' });
    return lib.get(album.id);
  } finally { await lib.close(); }
}
async function openAlbum(fixture, album, { lang = 'en', suffix = '' } = {}) {
  const launched = await fixture.launch();
  await expect(launched.page.locator('.nav .logo')).toBeVisible();
  await launched.page.evaluate((value) => localStorage.setItem('lang', value), lang);
  await launched.page.reload();
  const origin = new URL(launched.page.url()).origin;
  await launched.page.goto(`${origin}/#/a/${album.id}${suffix}`);
  return { ...launched, origin };
}
module.exports = { serveVideoModules, launchProbe, seedMixed, openAlbum };
