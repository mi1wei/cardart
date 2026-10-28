const { Tray, nativeImage } = require('electron');
const { join } = require('node:path');

function createTray({ assetRoot, showWindow }) {
  const image = nativeImage.createFromPath(join(assetRoot, process.platform === 'darwin' ? 'icons/trayTemplate.png' : 'favicon.ico'));
  if (image.isEmpty()) throw new Error('The Folio tray icon is missing');
  if (process.platform === 'darwin') image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setToolTip('Folio');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  return tray;
}
module.exports = { createTray };
