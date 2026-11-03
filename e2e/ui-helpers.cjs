const { expect } = require('@playwright/test');
const sharp = require('sharp');

async function seed(page, origin, title, count) {
  const album = await (await page.request.post(`${origin}/api/albums`, { data: { title } })).json();
  for (let i = 0; i < count; i++) {
    // Different sizes give different bytes, so the importer never skips one as a duplicate.
    const jpeg = await sharp({ create: { width: 30 + i, height: 20, channels: 3, background: '#a32f2f' } }).jpeg().toBuffer();
    const res = await page.request.post(`${origin}/api/albums/${album.id}/photos?name=p${i}.jpg`, { headers: { 'X-Album-Upload': '1' }, data: jpeg });
    expect(res.ok()).toBe(true);
  }
  return album;
}

const style = (page, selector, prop) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el)[p], prop);

// Playwright cannot fill a range input: set it and fire the event the page listens to.
const setRange = (locator, value) => locator.evaluate((el, v) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

// An album for the 3D book: `count` photos at `perPage` a page, with optional notes by photo index.
async function seedBook(page, origin, title, count, perPage, notes = {}) {
  const album = await seed(page, origin, title, count);
  const res = await page.request.patch(`${origin}/api/albums/${album.id}`, { data: { perPage } });
  expect(res.ok()).toBe(true);
  let full = await res.json();
  for (const [i, note] of Object.entries(notes)) {
    const saved = await page.request.patch(`${origin}/api/albums/${album.id}/photos/${full.photos[i].id}/note`, { data: { note, previousNote: '' } });
    expect(saved.ok()).toBe(true);
    full = await saved.json();
  }
  return full;
}

// The app opens on the album wall, so going there again is a same-document no-op that keeps the
// albums loaded at launch. Reload to show albums created through the API since (polish spec §3.1).
async function openWall(page, origin) {
  await page.goto(`${origin}/#/albums`);
  await page.reload();
}

module.exports = { seed, seedBook, style, setRange, openWall };
