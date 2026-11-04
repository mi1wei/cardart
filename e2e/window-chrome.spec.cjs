const { test, expect } = require('@playwright/test');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { desktopFixture } = require('./fixtures.cjs');

const mainWindow = (desktop, read) => desktop.evaluate(({ BrowserWindow }, read) => {
  const window = BrowserWindow.getAllWindows()[0];
  return read === 'bounds' ? window.getBounds() : read === 'normal' ? window.getNormalBounds() : window.isMaximized();
}, read);

test('the window comes back where it was left, maximized too, and to the default when that place is gone', async () => {
  test.setTimeout(90_000);
  const fixture = await desktopFixture();
  const file = join(fixture.profile, 'desktop.json');
  const saved = async () => JSON.parse(await readFile(file, 'utf8')).window;
  try {
    let { desktop } = await fixture.launch();
    const place = { x: 60, y: 80, width: 800, height: 560 };
    await desktop.evaluate(({ BrowserWindow }, place) => BrowserWindow.getAllWindows()[0].setBounds(place), place);
    await expect.poll(saved).toEqual({ ...place, maximized: false });
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    expect(await mainWindow(desktop, 'bounds')).toEqual(place);
    // Maximized at quit: maximized again, with the earlier size underneath.
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await expect.poll(async () => (await saved()).maximized).toBe(true);
    await fixture.stop();
    ({ desktop } = await fixture.launch());
    await expect.poll(() => mainWindow(desktop, 'maximized')).toBe(true);
    expect(await mainWindow(desktop, 'normal')).toEqual(place);
    await fixture.stop();
    // A place on a display that is no longer there: on screen again.
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), window: { x: -30000, y: -30000, width: 900, height: 600, maximized: false } }));
    ({ desktop } = await fixture.launch());
    const shown = await desktop.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      return bounds.x + bounds.width > area.x && bounds.x < area.x + area.width && bounds.y + bounds.height > area.y && bounds.y < area.y + area.height;
    });
    expect(shown).toBe(true);
  } finally { await fixture.close(); }
});
