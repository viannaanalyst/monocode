import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_ORDER_KEY,
  getProviderOrderSnapshot,
  loadProviderOrder,
  mergeProviderOrder,
  moveProvider,
  orderedHarnesses,
  saveProviderOrder,
  subscribeProviderOrder,
} from "./providerOrder";
import { HARNESSES } from "./session";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mergeProviderOrder", () => {
  it("keeps the saved order and appends new providers at the end", () => {
    expect(
      mergeProviderOrder(["grok", "claude"], ["claude", "codex", "grok", "pi"]),
    ).toEqual(["grok", "claude", "codex", "pi"]);
  });

  it("drops unknown and duplicate ids", () => {
    expect(
      mergeProviderOrder(["nope", "pi", "pi", 7, null], ["claude", "pi"]),
    ).toEqual(["pi", "claude"]);
  });

  it("returns the default order when nothing is saved", () => {
    expect(mergeProviderOrder([], HARNESSES)).toEqual([...HARNESSES]);
  });
});

describe("persistence", () => {
  it("round-trips through localStorage and notifies subscribers", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeProviderOrder(() =>
      seen.push(getProviderOrderSnapshot()),
    );
    saveProviderOrder(["pi", "fx", "claude"]);
    unsubscribe();
    expect(JSON.parse(localStorage.getItem(PROVIDER_ORDER_KEY) ?? "[]")).toEqual(
      [
        "pi",
        "fx",
        "claude",
        "codex",
        "cursor",
        "grok",
        "opencode",
        "omp",
        "hermes",
        "antigravity",
      ],
    );
    expect(loadProviderOrder()).toEqual([
      "pi",
      "fx",
      "claude",
      "codex",
      "cursor",
      "grok",
      "opencode",
      "omp",
      "hermes",
      "antigravity",
    ]);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("falls back to the default order for garbage values", () => {
    localStorage.setItem(PROVIDER_ORDER_KEY, "{not json");
    expect(loadProviderOrder()).toEqual([...HARNESSES]);
    localStorage.setItem(PROVIDER_ORDER_KEY, JSON.stringify({ a: 1 }));
    expect(loadProviderOrder()).toEqual([...HARNESSES]);
  });
});

describe("moveProvider", () => {
  it("moves within bounds and clamps at the ends", () => {
    expect(moveProvider(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveProvider(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveProvider(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("orderedHarnesses", () => {
  it("preserves the user order and honors the availability filter", () => {
    saveProviderOrder(["omp", "codex", "claude"]);
    expect(orderedHarnesses((id) => id === "claude" || id === "codex")).toEqual([
      "codex",
      "claude",
    ]);
  });
});
