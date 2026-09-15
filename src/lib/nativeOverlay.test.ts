import { afterEach, describe, expect, it, vi } from "vitest";
import {
  overlayIntersects,
  rectsIntersect,
  registerNativeOverlay,
  subscribeNativeOverlays,
} from "./nativeOverlay";

function element(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
  connected?: boolean;
}): HTMLElement {
  return {
    isConnected: rect.connected ?? true,
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nativeOverlay", () => {
  it("detects overlapping and disjoint rects", () => {
    const box = { left: 100, top: 100, right: 300, bottom: 300 };
    expect(rectsIntersect(box, { left: 200, top: 200, right: 400, bottom: 400 })).toBe(true);
    expect(rectsIntersect(box, { left: 0, top: 0, right: 99, bottom: 99 })).toBe(false);
    expect(rectsIntersect(box, { left: 300, top: 0, right: 400, bottom: 400 })).toBe(false);
  });

  it("tracks registered overlays and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNativeOverlays(listener);
    const release = registerNativeOverlay(
      element({ left: 0, top: 0, width: 50, height: 50 }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      overlayIntersects({ left: 10, top: 10, right: 20, bottom: 20 }),
    ).toBe(true);
    expect(
      overlayIntersects({ left: 60, top: 60, right: 90, bottom: 90 }),
    ).toBe(false);
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(
      overlayIntersects({ left: 10, top: 10, right: 20, bottom: 20 }),
    ).toBe(false);
    unsubscribe();
  });

  it("ignores detached and zero-sized overlays", () => {
    const release = registerNativeOverlay(
      element({ left: 0, top: 0, width: 50, height: 50, connected: false }),
    );
    expect(
      overlayIntersects({ left: 10, top: 10, right: 20, bottom: 20 }),
    ).toBe(false);
    release();
    const releaseEmpty = registerNativeOverlay(
      element({ left: 0, top: 0, width: 0, height: 0 }),
    );
    expect(
      overlayIntersects({ left: 10, top: 10, right: 20, bottom: 20 }),
    ).toBe(false);
    releaseEmpty();
  });
});
