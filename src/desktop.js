import { onThemeChange, theme } from './theme.js';

// The desktop app's window (polish spec §6.1): full screen hides the traffic lights, so their gap
// closes; the appearance chosen here also colours the window, its title bar and native dialogs.
export function initDesktop({ onCommand, getContext } = {}, desktop = window.folioDesktop) {
  if (!desktop) return;
  // Changes come as state; a page loaded in full screen (another library, a reload) asks.
  const setFullscreen = (state) => {
    if (typeof state?.fullscreen === 'boolean') document.documentElement.toggleAttribute('data-fullscreen', state.fullscreen);
  };
  desktop.onState(setFullscreen);
  desktop.info().then(setFullscreen).catch(() => {});
  const send = () => { desktop.setAppearance(theme()).catch(() => {}); };
  send();
  onThemeChange(send);
  // The photo viewer is always dark: Windows then draws its window buttons on dark colours too.
  let surface;
  const report = () => {
    const next = document.querySelector('body > .lb') ? 'dark' : 'page';
    if (next === surface) return;
    surface = next;
    desktop.setSurface(next).catch(() => {});
  };
  new MutationObserver(report).observe(document.body, { childList: true });
  report();
  desktop.onCommand((name) => { void onCommand?.(name); });
  let context;
  const reportContext = () => {
    const next = getContext?.();
    if (!next || JSON.stringify(next) === context) return;
    context = JSON.stringify(next);
    desktop.setContext(next).catch(() => {});
  };
  new MutationObserver(reportContext).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-density'],
  });
  new MutationObserver(reportContext).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-busy', 'data-theme'],
  });
  onThemeChange(reportContext);
  reportContext();
}
