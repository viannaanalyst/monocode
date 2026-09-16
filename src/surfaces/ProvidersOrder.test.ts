import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvidersOrderList } from "./SettingsView";
import { HARNESS_TITLE } from "../lib/session";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
  localStorage.setItem(
    "monocode.providerOrder",
    JSON.stringify(["pi", "claude", "codex"]),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProvidersOrderList", () => {
  it("renders providers in the saved order with an animated-reorder grip", () => {
    const markup = renderToStaticMarkup(createElement(ProvidersOrderList));
    const pi = markup.indexOf(HARNESS_TITLE.pi);
    const claude = markup.indexOf(HARNESS_TITLE.claude);
    expect(pi).toBeGreaterThan(-1);
    expect(pi).toBeLessThan(claude);
    expect(markup).toContain(`aria-label="Reorder ${HARNESS_TITLE.pi}"`);
    expect(markup).toContain("reorder-item");
    expect(markup).not.toContain("Move ");
    expect(markup).not.toContain('title="Reorder');
  });
});
