const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { expect } = require('@playwright/test');

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
module.exports = { serveVideoModules, launchProbe };
