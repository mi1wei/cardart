const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');
const { seed, seedBook, setLang } = require('./ui-helpers.cjs');

test('on the computer, adding photos is called adding, not uploading', async () => {
  const fixture = await desktopFixture();
  try {
    const { page } = await fixture.launch();
    const origin = new URL(page.url()).origin;
    const album = await seed(page, origin, 'Words', 1);
    await page.goto(`${origin}/#/a/${album.id}`);
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('Add photos');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('Date added');
    await setLang(page, 'zh');
    await expect(page.locator('.acts.normal [data-act=upload]')).toHaveText('添加照片');
    await expect(page.locator('.photo-sort option[value=added]')).toHaveText('添加时间');
    expect(await page.locator('main').innerText()).not.toContain('上传');
  } finally { await fixture.close(); }
});
