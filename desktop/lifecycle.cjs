function createLifecycle({ canHide, hide, show, stop, onFirstHide, onState }) {
  let state = 'running';
  let reason;
  let shutdown;
  let notified = false;
  function transition(next) {
    if (state === next) return;
    state = next;
    onState?.(state);
  }
  function showMainWindow() {
    if (state === 'quitting') return;
    show();
    if (state !== 'draining') transition('running');
  }
  return {
    get state() { return state; },
    get reason() { return reason; },
    showMainWindow,
    onClose(event) {
      if (state === 'quitting') return;
      event.preventDefault();
      if (state === 'draining') return;
      if (!canHide()) { showMainWindow(); return; }
      hide();
      transition('hidden');
      if (!notified) { notified = true; onFirstHide?.(); }
    },
    requestShutdown({ reason: requested } = {}) {
      if (!['quit', 'update'].includes(requested)) return Promise.reject(new Error('Invalid shutdown reason'));
      if (shutdown) {
        if (reason !== requested) return Promise.reject(Object.assign(new Error('Shutdown is already in progress'), { code: 'SHUTDOWN_IN_PROGRESS' }));
        return shutdown;
      }
      reason = requested;
      transition('draining');
      shutdown = Promise.resolve().then(stop).then(() => { transition('quitting'); });
      return shutdown;
    },
  };
}
module.exports = { createLifecycle };
