// The window's own title bar merges into Folio's 56 px top bar (polish spec §6.1).
const BAR = 56;
const OVERLAY = { light: { color: '#f7f9fb', symbolColor: '#4e5a66' }, dark: { color: '#121417', symbolColor: '#a7b0ba' } };
const BACKGROUND = { light: '#f7f9fb', dark: '#121417' };

// Windows draws its window buttons on these colours: dark in the dark appearance and over the
// photo viewer, which is always dark.
function overlay(dark, surface = 'page') {
  return { ...OVERLAY[dark || surface === 'dark' ? 'dark' : 'light'], height: BAR };
}

function windowChrome(platform, dark) {
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } };
  if (platform === 'win32') return { titleBarStyle: 'hidden', titleBarOverlay: overlay(dark) };
  return {};
}

const background = (dark) => BACKGROUND[dark ? 'dark' : 'light'];
// Folio's "auto" is the system's choice.
const themeSource = (mode) => (mode === 'light' || mode === 'dark' ? mode : 'system');

module.exports = { BAR, OVERLAY, background, overlay, themeSource, windowChrome };
