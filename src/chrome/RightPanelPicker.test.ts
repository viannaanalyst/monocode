// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightPanelPicker } from "./RightPanelPicker";

const roots: ReturnType<typeof createRoot>[] = [];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe("RightPanelPicker", () => {
  it("lists Terminal, Browser and Explorer", () => {
    const onPick = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(createElement(RightPanelPicker, { onPick }));
    });
    const labels = [...host.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(["Terminal", "Browser", "Explorer"]);
    act(() => host.querySelector("button")?.click());
    expect(onPick).toHaveBeenCalledWith("terminal");
  });
});
