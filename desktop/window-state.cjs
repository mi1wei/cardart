// The window's size and place across launches (polish spec §6.5).
const DEFAULT = { width: 1180, height: 800 };
const MIN = { width: 720, height: 480 };
// Enough of the window's 56 px top bar must be on a display to grab it.
const BAR = 56;
const GRAB = { width: 100, height: 24 };

function validWindow(value) {
  return Boolean(value) && typeof value === 'object' &&
    ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(value[key])) &&
    value.width >= MIN.width && value.height >= MIN.height && typeof value.maximized === 'boolean';
}

// The saved place while its top bar can be grabbed on some display's work area; null means the
// default, centred (a monitor may have been unplugged since). Windows does not pull a title bar
// back on screen by itself.
function restoreBounds(saved, displays) {
  if (!validWindow(saved)) return null;
  const grabbable = ({ workArea: area }) =>
    Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x) >= GRAB.width &&
    Math.min(saved.y + BAR, area.y + area.height) - Math.max(saved.y, area.y) >= GRAB.height;
  return displays.some(grabbable) ? { ...saved } : null;
}

module.exports = { DEFAULT, MIN, validWindow, restoreBounds };
