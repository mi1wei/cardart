import { onThemeChange, theme } from './theme.js';

// The desktop app's window (polish spec §6.1): full screen hides the traffic lights, so their gap
// closes; the appearance chosen here also colours the window, its title bar and native dialogs.
export function initDesktop(desktop = window.folioDesktop) {
  if (!desktop) return;
  desktop.onState((state) => {
    if (typeof state?.fullscreen === 'boolean') document.documentElement.toggleAttribute('data-fullscreen', state.fullscreen);
  });
  const send = () => { desktop.setAppearance(theme()).catch(() => {}); };
  send();
  onThemeChange(send);
}
