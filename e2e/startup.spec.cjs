const { test, expect } = require('@playwright/test');
const { desktopFixture } = require('./fixtures.cjs');

test('cancelling the first window load through explicit quit exits normally instead of reporting a startup failure', async () => {
  const fixture = await desktopFixture();
  try {
    const { desktop } = await fixture.launch({ args: ['--fixture-hold-initial-load'], waitForReady: false });
    const process = desktop.process();
    await expect.poll(() => desktop.evaluate(() => typeof global.folioTestInitialLoadReject)).toBe('function');
    const closed = desktop.waitForEvent('close', { timeout: 5000 });
    await desktop.evaluate(({ app }) => { app.quit(); global.folioTestInitialLoadReject(); });
    await closed;
    await expect.poll(() => process.exitCode).toBe(0);
    const { openLibrary } = await import('../server/library.js');
    const lib = await openLibrary(fixture.library);
    await lib.close();
  } finally { await fixture.close(); }
});
