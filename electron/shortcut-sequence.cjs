// Electron accelerators accept one non-modifier key. Scope the continuation
// shortcuts to a short, explicit Option/Alt+U sequence; no keyboard hook.
function registerSequence(shortcuts, { capture, copy, unavailable = () => {} }, timers = globalThis) {
  let phase = '', timer;
  const reset = () => { timers.clearTimeout(timer); phase = ''; shortcuts.unregister('Alt+I'); shortcuts.unregister('Alt+P'); };
  const arm = () => {
    reset(); phase = 'prefix';
    const i = shortcuts.register('Alt+I', () => {
      if (phase !== 'prefix') return;
      phase = 'capture'; timers.clearTimeout(timer);
      timer = timers.setTimeout(() => { reset(); capture(); }, 350);
    });
    const p = shortcuts.register('Alt+P', () => { if (phase === 'capture') { reset(); copy(); } });
    if (!i || !p) { reset(); unavailable(); return; }
    timer = timers.setTimeout(reset, 1500);
  };
  const registered = shortcuts.register('Alt+U', arm);
  return { registered, dispose() { reset(); shortcuts.unregister('Alt+U'); } };
}
module.exports = { registerSequence };
