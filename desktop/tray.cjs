const { Tray, nativeImage } = require('electron');
const { join } = require('node:path');

function createTray({ assetRoot, showWindow }) {
  const isMac = process.platform === 'darwin';
  const image = isMac ? nativeImage.createEmpty() : nativeImage.createFromPath(join(assetRoot, 'favicon.ico'));
  if (!isMac && image.isEmpty()) throw new Error('The Folio tray icon is missing');
  const tray = new Tray(image);
  if (isMac) tray.setTitle('Folio');
  tray.setToolTip('Folio');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  return tray;
}
module.exports = { createTray };
