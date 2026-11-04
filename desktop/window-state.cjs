// The window's size and place across launches (polish spec §6.5).
const DEFAULT = { width: 1180, height: 800 };
const MIN = { width: 720, height: 480 };
// Enough of the window must stay on a display to grab its top bar.
const VISIBLE = { width: 100, height: 56 };

function validWindow(value) {
  return Boolean(value) && typeof value === 'object' &&
    ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(value[key])) &&
    value.width >= MIN.width && value.height >= MIN.height && typeof value.maximized === 'boolean';
}

// The saved place while enough of it meets a display's work area; null means the default, centred
// (a monitor may have been unplugged since).
function restoreBounds(saved, displays) {
  if (!validWindow(saved)) return null;
  const shows = ({ workArea: area }) =>
    Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x) >= VISIBLE.width &&
    Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y) >= VISIBLE.height;
  return displays.some(shows) ? { ...saved } : null;
}

module.exports = { DEFAULT, MIN, validWindow, restoreBounds };
