// Interior Modal's short opacity transition, adapted to native window visibility.
// https://www.interior.dev/docs/modal (MIT). Keep capture geometry stationary.
const pending = new WeakMap();
const scripts = {
  show: `(() => {
    window.__canvasPilotWindowAnimation?.cancel();
    const animation = document.documentElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150, easing: 'cubic-bezier(.22,1,.36,1)' });
    window.__canvasPilotWindowAnimation = animation;
    return animation.finished.catch(() => {});
  })()`,
  hide: `(() => {
    window.__canvasPilotWindowAnimation?.cancel();
    const animation = document.documentElement.animate([{ opacity: 1 }, { opacity: 0 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    window.__canvasPilotWindowAnimation = animation;
    return animation.finished.catch(() => {});
  })()`,
};
function trackWindowMotion(window) {
  window.on('show', () => {
    if (pending.has(window)) return;
    void window.webContents.executeJavaScript(scripts.show).catch(() => {});
  });
}
function showWindow(window) {
  if (!window || window.isDestroyed()) return;
  pending.delete(window);
  window.show();
  // macOS nonactivating panels do not reliably emit show on reuse.
  void window.webContents.executeJavaScript(scripts.show).catch(() => {});
}
async function hideWindow(window) {
  if (!window || window.isDestroyed() || !window.isVisible()) return;
  if (pending.has(window)) return pending.get(window);
  const operation = (async () => {
    let timeout;
    try {
      await Promise.race([window.webContents.executeJavaScript(scripts.hide).catch(() => {}), new Promise(resolve => { timeout = setTimeout(resolve, 300); })]);
      if (!window.isDestroyed() && pending.get(window) === operation) window.hide();
    } finally { clearTimeout(timeout); if (pending.get(window) === operation) pending.delete(window); }
  })();
  pending.set(window, operation);
  return operation;
}
module.exports = { trackWindowMotion, hideWindow, showWindow };
