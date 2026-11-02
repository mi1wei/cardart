// Auto-flip for the 3D book (v2 spec §8): one step per spread, or per page on an upright phone.
export const SPEEDS = { slow: 8000, medium: 6000, fast: 4000 };

export function savedSpeed() {
  try {
    const value = localStorage.getItem('flip-speed');
    return Object.hasOwn(SPEEDS, value ?? '') ? value : 'medium';
  } catch {
    return 'medium';
  }
}

// step() turns one page and returns false once the book has ended; onState hears every change.
export function createFlipPlayer({ step, onState }) {
  let state = 'off';
  let speed = savedSpeed();
  let timer = 0;

  function schedule() {
    clearTimeout(timer);
    timer = state === 'playing' ? setTimeout(tick, SPEEDS[speed]) : 0;
    onState({ state, speed, ms: SPEEDS[speed] });
  }

  function tick() {
    timer = 0;
    if (state !== 'playing') return;
    if (step()) schedule();
    else set('off');
  }

  function set(next) {
    state = next;
    schedule();
  }

  return {
    state: () => state,
    play: () => set('playing'),
    pause: () => state === 'playing' && set('paused'),
    toggle: () => set(state === 'playing' ? 'paused' : 'playing'),
    stop: () => state !== 'off' && set('off'),
    // A page turned by hand: the next step waits a full interval again.
    restart: () => state === 'playing' && schedule(),
    setSpeed(next) {
      if (!Object.hasOwn(SPEEDS, next)) return;
      speed = next;
      try {
        localStorage.setItem('flip-speed', next);
      } catch {}
      schedule();
    },
    dispose() {
      clearTimeout(timer);
      state = 'off';
    },
  };
}
