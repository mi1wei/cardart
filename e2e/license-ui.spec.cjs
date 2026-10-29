const { test, expect } = require('@playwright/test');
const { readFile, writeFile } = require('node:fs/promises');
const { join, basename } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');

async function licensePage(fixture) {
  const { page, desktop } = await fixture.launch();
  await expect(page.locator('.nav .logo')).toBeVisible();
  await page.locator('.lang [data-lang=en]').click();
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/#/license`);
  await expect(page.locator('.license-page')).toBeVisible();
  return { page, desktop, origin };
}

test('file-first overview folds JSON and removes only the License page duplicate notice', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  try {
    const { page, origin } = await licensePage(fixture);
    await expect(page.locator('#license-json')).toBeHidden();
    await expect(page.locator('.license-status-title')).toHaveText('Not activated yet');
    await expect(page.locator('.license-bar')).toBeHidden();
    await expect(page.locator('.license-safety')).toHaveCount(1);
    await expect(page.locator('[data-act=choose-license]')).toBeVisible();
    await expect(page.locator('[data-act=activate-license]')).toBeDisabled();
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    expect((await page.request.post(`${origin}/api/albums`, { data: { title: 'Denied' } })).status()).toBe(403);
    await page.locator('.license-json-details summary').click();
    await expect(page.locator('#license-json')).toBeVisible();
    await page.goto(`${origin}/#/albums`);
    await expect(page.locator('.license-bar')).toBeVisible();
    await page.goto(`${origin}/#/license`);
    await expect(page.locator('.license-bar')).toBeHidden();
  } finally { await fixture.close(); }
});

for (const { name, options, title, badge, readonly } of [
  { name: 'expired trial', options: { license: 'expired' }, title: 'Trial expired', badge: 'Read-only', readonly: 'true' },
  { name: 'expired pro', options: { license: 'expired', plan: 'pro' }, title: 'License expired', badge: 'Read-only', readonly: 'true' },
  { name: 'active pro', options: { plan: 'pro' }, title: 'Folio is activated', badge: 'Editing enabled', readonly: 'false' },
  { name: 'active without editing permission', options: { plan: 'pro', features: [] }, title: 'View-only license', badge: 'Read-only', readonly: 'true' },
]) {
  test(`license overview distinguishes ${name} using the real signed status`, async () => {
    const fixture = await desktopFixture(options);
    try {
      const { page, origin } = await licensePage(fixture);
      await expect(page.locator('.license-status-title')).toHaveText(title);
      await expect(page.locator('.license-status-badge')).toHaveText(badge);
      await expect(page.locator('.license-expiry-date')).not.toBeEmpty();
      await expect(page.locator('.license-expiry-time')).not.toBeEmpty();
      await expect(page.locator('html')).toHaveAttribute('data-readonly', readonly);
      const state = await (await page.request.get(`${origin}/api/license`)).json();
      expect(state.plan).toBe(options.plan || 'trial');
      expect(state.canWrite).toBe(readonly === 'false');
    } finally { await fixture.close(); }
  });
}

test('file import rejects stale input and failed replacements, serializes submission and persists activation', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  let release;
  try {
    const { page, origin } = await licensePage(fixture);
    await expect(page.locator('#license-json')).toBeHidden();
    let posts = 0;
    page.on('request', (request) => { if (request.url() === `${origin}/api/license` && request.method() === 'POST') posts++; });
    const submit = page.locator('[data-act=activate-license]');
    const file = page.locator('#license-file');
    const disclosure = page.locator('.license-json-details');
    const input = page.locator('#license-json');
    await disclosure.locator('summary').click();
    await input.fill(JSON.stringify(fixture.envelope));
    await file.setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(8193, 32) });
    await expect(page.locator('.license-result')).toContainText('8 KiB');
    await expect(submit).toBeDisabled();
    await expect(input).toHaveValue('');
    await page.locator('.license-form').evaluate((form) => form.requestSubmit());
    await page.waitForLoadState('networkidle');
    expect(posts).toBe(0);
    expect((await (await page.request.get(`${origin}/api/license`)).json()).state).toBe('missing');

    await file.setInputFiles(fixture.licenseFile);
    await expect(page.locator('.license-selected-name')).toHaveText(basename(fixture.licenseFile));
    await expect(disclosure).not.toHaveAttribute('open', '');
    await disclosure.locator('summary').click();
    await expect(page.locator('.license-file-picked')).toBeVisible();
    await page.evaluate(() => {
      const original = File.prototype.text;
      window.restoreOwnedLicenseRead = () => { File.prototype.text = original; };
      File.prototype.text = () => Promise.reject(new Error('Owned read failure'));
    });
    await file.setInputFiles({ name: 'unreadable.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.envelope)) });
    await expect(page.locator('.license-result')).toContainText('could not be read');
    await expect(submit).toBeDisabled();
    await expect(page.locator('.license-file-picked')).toBeHidden();
    await page.evaluate(() => window.restoreOwnedLicenseRead());
    await file.setInputFiles(fixture.licenseFile);
    await expect(page.locator('.license-selected-name')).toHaveText(basename(fixture.licenseFile));
    await disclosure.locator('summary').click();
    await input.fill('not JSON');
    await expect(page.locator('.license-file-picked')).toBeHidden();
    await submit.click();
    await expect(page.locator('.license-result')).toHaveAttribute('data-result', 'error');
    expect(posts).toBe(0);
    await file.setInputFiles(fixture.licenseFile);
    await expect(submit).toBeEnabled();

    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(`${origin}/api/license`, async (route) => {
      if (route.request().method() === 'POST') { entered(); await held; }
      await route.continue();
    });
    await submit.click();
    await started;
    for (const control of [file, input, submit, page.locator('[data-act=choose-license]'), page.locator('[data-act=clear-license]')]) {
      await expect(control).toBeDisabled();
    }
    await page.locator('.license-form').evaluate((form) => form.requestSubmit());
    expect(posts).toBe(1);
    release();
    await expect(page.locator('.license-result')).toHaveAttribute('data-result', 'success');
    await expect(page.locator('.license-status-title')).toHaveText('Trial active');
    const saved = await readFile(join(fixture.profile, 'license.json'));
    expect(JSON.parse(saved)).toEqual(fixture.envelope);
    await disclosure.locator('summary').click();
    await input.fill('{"payload":"bad","signature":"bad"}');
    await submit.click();
    await expect(page.locator('.license-result')).toHaveAttribute('data-result', 'error');
    await expect(input).toHaveValue('{"payload":"bad","signature":"bad"}');
    await expect(page.locator('.license-status-title')).toHaveText('Trial active');
    expect(await readFile(join(fixture.profile, 'license.json'))).toEqual(saved);
    await fixture.stop();
    const reopened = await fixture.launch();
    await reopened.page.goto(`${new URL(reopened.page.url()).origin}/#/license`);
    await expect(reopened.page.locator('.license-status-title')).toHaveText('Trial active');
  } finally { release?.(); await fixture.close(); }
});

test('an unavailable status keeps the selected draft and can recover without changing the saved license', async () => {
  const fixture = await desktopFixture();
  try {
    const { page, origin } = await licensePage(fixture);
    await expect(page.locator('.license-status-title')).toHaveText('Trial active');
    await page.locator('#license-file').setInputFiles(fixture.licenseFile);
    await expect(page.locator('.license-selected-name')).toHaveText(basename(fixture.licenseFile));
    const before = await readFile(join(fixture.profile, 'license.json'));
    await page.route(`${origin}/api/license`, (route) => route.request().method() === 'GET' ? route.abort() : route.continue());
    await page.locator('[data-act=refresh-license]').click();
    await expect(page.locator('.license-status-title')).toHaveText('Status unavailable');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'true');
    await expect(page.locator('.license-selected-name')).toHaveText(basename(fixture.licenseFile));
    await expect(page.locator('.license-bar')).toBeHidden();
    await page.unroute(`${origin}/api/license`);
    await page.locator('[data-act=refresh-license]').click();
    await expect(page.locator('.license-status-title')).toHaveText('Trial active');
    await expect(page.locator('html')).toHaveAttribute('data-readonly', 'false');
    expect(await readFile(join(fixture.profile, 'license.json'))).toEqual(before);
    await page.route(`${origin}/api/license`, (route) => route.fulfill({ json: { state: 'development', canWrite: true } }));
    await page.locator('[data-act=refresh-license]').click();
    await expect(page.locator('.license-status-title')).toHaveText('Development mode');
    await expect(page.locator('.license-form')).toBeHidden();
    await expect(page.locator('.license-computer')).toContainText('development');
  } finally { await fixture.close(); }
});

test('invalid licenses retain the safe state and responsive import controls work in both languages', async () => {
  const fixture = await desktopFixture({ license: 'missing' });
  await writeFile(join(fixture.profile, 'license.json'), '{"payload":"bad","signature":"bad"}');
  try {
    const { page } = await licensePage(fixture);
    await expect(page.locator('.license-status-title')).toHaveText('License not valid');
    await expect(page.locator('.license-facts')).toBeHidden();
    for (const [lang, width] of [['en', 1440], ['zh', 390], ['en', 320]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(`.lang [data-lang=${lang}]`).click();
      await expect(page.locator('.license-status-title')).toHaveText(lang === 'zh' ? '许可证无效' : 'License not valid');
      await expect(page.locator('[data-act=choose-license]')).toBeVisible();
      await page.locator('#license-file').setInputFiles({
        name: 'owned-long-license-abcdefghijklmnopqrstuvwxyz-0123456789-abcdefghijklmnopqrstuvwxyz.json',
        mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.envelope)),
      });
      await expect(page.locator('.license-selected-name')).toContainText('owned-long-license');
      await page.locator('.license-json-details summary').click();
      await page.locator('#license-json').fill('x'.repeat(8193));
      await page.locator('[data-act=activate-license]').click();
      await expect(page.locator('.license-result')).toContainText('8 KiB');
      const bounds = await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        overflowing: [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
        status: document.querySelector('.license-status-panel').getBoundingClientRect().toJSON(),
        activation: document.querySelector('.license-activate-panel').getBoundingClientRect().toJSON(),
      }));
      expect(bounds.overflow, JSON.stringify(bounds)).toBe(false);
      if (width <= 760) expect(bounds.activation.y).toBeGreaterThanOrEqual(bounds.status.y + bounds.status.height - 1);
      else expect(bounds.activation.x).toBeGreaterThan(bounds.status.x);
    }
  } finally { await fixture.close(); }
});
