const { test, expect } = require('@playwright/test');
const { mkdir, rename, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');

async function blockLog(fixture) {
  const file = join(fixture.profile, 'logs/desktop.log');
  await rename(file, `${file}.saved`);
  await mkdir(file);
  return async () => { await rm(file, { recursive: true, force: true }); await rename(`${file}.saved`, file); };
}

test('diagnostic disk errors cannot turn an otherwise successful explicit quit into a shutdown hang', async () => {
  const fixture = await desktopFixture();
  let restore;
  let desktop;
  let child;
  try {
    ({ desktop } = await fixture.launch());
    child = desktop.process();
    restore = await blockLog(fixture);
    await desktop.evaluate(() => { process.on('unhandledRejection', () => {}); });
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    await desktop.evaluate(({ app }) => { app.quit(); });
    await closed;
    await expect.poll(() => child.exitCode).toBe(0);
    const { openLibrary } = await import('../server/library.js');
    const lib = await openLibrary(fixture.library);
    await lib.close();
  } finally {
    await restore?.();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = desktop.waitForEvent('close', { timeout: 5000 }).catch(() => {});
      await desktop.evaluate(({ app }) => { app.exit(1); }).catch(() => {});
      await closed;
    }
    await fixture.close();
  }
});

test('a genuine shutdown failure still offers recovery when logs fail, and a later explicit force quit is not latched out', async () => {
  const fixture = await desktopFixture();
  let restore;
  let desktop;
  let child;
  try {
    ({ desktop } = await fixture.launch({ args: ['--fixture-stop-failure'] }));
    child = desktop.process();
    restore = await blockLog(fixture);
    await desktop.evaluate(({ dialog }) => {
      process.on('unhandledRejection', () => {});
      global.folioTestFailNextStop = true;
      global.folioTestRecoveryDialogs = 0;
      dialog.showMessageBox = async () => ({ response: ++global.folioTestRecoveryDialogs >= 2 ? 1 : 0 });
    });
    await desktop.evaluate(({ app }) => { app.quit(); });
    await expect.poll(() => desktop.evaluate(() => global.folioTestRecoveryDialogs)).toBe(1);
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    await desktop.evaluate(({ app }) => { app.quit(); });
    await closed;
    await expect.poll(() => child.exitCode).toBe(1);
  } finally {
    await restore?.();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = desktop.waitForEvent('close', { timeout: 5000 }).catch(() => {});
      await desktop.evaluate(({ app }) => { app.exit(1); }).catch(() => {});
      await closed;
    }
    await fixture.close();
  }
});
