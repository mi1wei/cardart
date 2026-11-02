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

module.exports = { seed, style, setRange };
