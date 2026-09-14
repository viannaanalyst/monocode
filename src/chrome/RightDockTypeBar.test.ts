// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightDockTypeBar } from "./RightDockTypeBar";

const roots: ReturnType<typeof createRoot>[] = [];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe("RightDockTypeBar", () => {
  it("shows every open surface as a tab", () => {
    const onSelect = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        createElement(RightDockTypeBar, {
          tabs: ["terminal", "explorer"],
          active: "explorer",
          onSelect,
          onAdd: () => undefined,
          onClose: () => undefined,
          onExpand: () => undefined,
          onTogglePanel: () => undefined,
        }),
      );
    });
    const labels = [...host.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    expect(labels).toContain("Terminal");
    expect(labels).toContain("Explorer");
    const explorer = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Explorer"),
    );
    act(() => explorer?.click());
    expect(onSelect).toHaveBeenCalledWith("explorer");
  });

  it("closes a type tab from the hover control", () => {
    const onClose = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        createElement(RightDockTypeBar, {
          tabs: ["terminal", "explorer"],
          active: "terminal",
          onSelect: () => undefined,
          onAdd: () => undefined,
          onClose,
          onExpand: () => undefined,
          onTogglePanel: () => undefined,
        }),
      );
    });
    const close = host.querySelector('[aria-label="Close Terminal"]');
    act(() => (close as HTMLElement | null)?.click());
    expect(onClose).toHaveBeenCalledWith("terminal");
  });

  it("toggles the right panel from the Painel control", () => {
    const onTogglePanel = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        createElement(RightDockTypeBar, {
          tabs: ["terminal"],
          active: "terminal",
          onSelect: () => undefined,
          onAdd: () => undefined,
          onClose: () => undefined,
          onExpand: () => undefined,
          onTogglePanel,
        }),
      );
    });
    const toggle = [...host.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Panels",
    );
    act(() => toggle?.click());
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
  });
});
