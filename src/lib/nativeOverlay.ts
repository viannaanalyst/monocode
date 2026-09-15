/**
 * Native browser webviews paint above the app's DOM, so an app overlay that
 * lands on one disappears behind it. Overlays register their element here and
 * a browser view hides its webview while any overlay rect intersects its box,
 * showing it again once the overlay closes.
 */
const overlays = new Set<HTMLElement>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function registerNativeOverlay(element: HTMLElement): () => void {
  overlays.add(element);
  notify();
  return () => {
    overlays.delete(element);
    notify();
  };
}

export function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function overlayIntersects(box: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): boolean {
  for (const element of overlays) {
    if (!element.isConnected) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rectsIntersect(rect, box)) return true;
  }
  return false;
}

export function subscribeNativeOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
