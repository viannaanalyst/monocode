// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  tabCopy,
  tabStripOverflow,
  TitleBar,
  titleTabContextCloseIds,
  titleTabClosable,
  type Tab,
} from "./TitleBar";
import type { AgentModel } from "../lib/models";

vi.mock("./WindowControls", () => ({ WindowControls: () => null }));

const roots: ReturnType<typeof createRoot>[] = [];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

function tab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "t1",
    project: "agent-terminal",
    title: "",
    more: [],
    sessionCount: 1,
    harnesses: [],
    models: [],
    busyHarnesses: [],
    files: [],
    ...overrides,
  };
}

describe("tabCopy", () => {
  it("layers conversation and file when split across panes", () => {
    const focusedSession = tabCopy(
      tab({
        multiPane: true,
        title: "Add custom project logos",
        files: ["opencodeAdapter.ts"],
      }),
    );
    expect(focusedSession).toEqual({
      headline: "Add custom project logos",
      meta: "opencodeAdapter.ts",
      tooltip:
        "agent-terminal · Add custom project logos · opencodeAdapter.ts",
    });

    const focusedFile = tabCopy(
      tab({
        multiPane: true,
        fileFocused: true,
        title: "Add custom project logos",
        files: ["opencodeAdapter.ts"],
      }),
    );
    expect(focusedFile).toEqual({
      headline: "opencodeAdapter.ts",
      meta: "Add custom project logos",
      tooltip:
        "agent-terminal · Add custom project logos · opencodeAdapter.ts",
    });
  });

  it("layers two conversations in split panes", () => {
    const copy = tabCopy(
      tab({
        multiPane: true,
        title: "First chat",
        more: ["Second chat"],
        sessionCount: 2,
      }),
    );
    expect(copy.headline).toBe("First chat");
    expect(copy.meta).toBe("Second chat");
  });

  it("keeps a single-line title for one pane with only a conversation", () => {
    const copy = tabCopy(
      tab({
        title: "Only chat",
        project: "agent-terminal",
      }),
    );
    expect(copy.headline).toBe("Only chat");
    expect(copy.meta).toBe("");
  });

  it("labels an empty tab New session", () => {
    const copy = tabCopy(tab({ project: "agent-terminal" }));
    expect(copy.headline).toBe("New session");
    expect(copy.meta).toBe("");
  });
});

describe("tabStripOverflow", () => {
  it("hides both chevrons when the strip fits", () => {
    expect(tabStripOverflow(0, 400, 400)).toEqual({ left: false, right: false });
  });

  it("shows only the right chevron at the start", () => {
    expect(tabStripOverflow(0, 400, 800)).toEqual({ left: false, right: true });
  });

  it("shows both chevrons in the middle", () => {
    expect(tabStripOverflow(200, 400, 800)).toEqual({ left: true, right: true });
  });

  it("shows only the left chevron at the end", () => {
    expect(tabStripOverflow(400, 400, 800)).toEqual({ left: true, right: false });
  });
});

describe("titleTabClosable", () => {
  it("hides close on a sole blank tab", () => {
    expect(titleTabClosable(tab({ blank: true }), 1)).toBe(false);
  });

  it("shows close on a sole tab once it has a conversation", () => {
    expect(titleTabClosable(tab({ blank: false }), 1)).toBe(true);
  });

  it("allows a blank tab to be removed when another tab remains", () => {
    expect(titleTabClosable(tab({ blank: true }), 2)).toBe(true);
  });
});

describe("titleTabContextCloseIds", () => {
  const tabs = [
    tab({ id: "a" }),
    tab({ id: "b" }),
    tab({ id: "c" }),
    tab({ id: "d" }),
  ];

  it("finds every tab except the context tab", () => {
    expect(titleTabContextCloseIds(tabs, "b", "others")).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("finds tabs on either side in visual order", () => {
    expect(titleTabContextCloseIds(tabs, "c", "left")).toEqual(["a", "b"]);
    expect(titleTabContextCloseIds(tabs, "b", "right")).toEqual(["c", "d"]);
  });

  it("returns no ids for an edge or missing tab", () => {
    expect(titleTabContextCloseIds(tabs, "a", "left")).toEqual([]);
    expect(titleTabContextCloseIds(tabs, "d", "right")).toEqual([]);
    expect(titleTabContextCloseIds(tabs, "missing", "others")).toEqual([]);
  });
});

describe("TitleBar session brand", () => {
  it("shows the model vendor mark instead of the harness icon", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        createElement(TitleBar, {
          tabs: [
            tab({
              harnesses: ["codex"],
              models: [
                {
                  id: "codex:gpt-5.5",
                  harness: "codex",
                  name: "GPT-5.5",
                  nativeId: "gpt-5.5",
                } satisfies AgentModel,
              ],
            }),
          ],
          activeId: "t1",
          cwd: "/workspace/monocode",
          onToggleSidebar: () => {},
          onSelect: () => {},
          onNew: () => {},
          onNewTerminal: () => {},
          onClose: () => {},
          onCloseMany: () => {},
          onReorder: () => {},
        }),
      );
    });

    // The vendor mark is drawn by ModelBrandIcon, not the harness-icon path.
    const brand = container.querySelector("[data-model-brand]");
    expect(brand).not.toBeNull();
  });
});

describe("TitleBar terminal action", () => {
  it("keeps its label and enabled pointer cursor when a callback is supplied", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        createElement(TitleBar, {
          tabs: [tab()],
          activeId: "t1",
          cwd: "/workspace/monocode",
          onToggleSidebar: () => {},
          onSelect: () => {},
          onNew: () => {},
          onNewTerminal: () => {},
          onClose: () => {},
          onCloseMany: () => {},
          onReorder: () => {},
        }),
      );
    });

    const terminalAction = container.querySelector<HTMLButtonElement>(
      '[aria-label="Terminal (Ctrl+`)"]',
    );
    expect(terminalAction).not.toBeNull();
    expect(terminalAction?.getAttribute("aria-label")).toBe(
      "Terminal (Ctrl+`)",
    );
    expect(terminalAction?.getAttribute("aria-disabled")).not.toBe("true");
    expect(terminalAction?.className).toContain("cursor-pointer");
    expect(terminalAction?.className).toContain("[&_*]:pointer-events-none");
  });

  it("shows a browser action next to the terminal action", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        createElement(TitleBar, {
          tabs: [tab()],
          activeId: "t1",
          cwd: "/workspace/monocode",
          onToggleSidebar: () => {},
          onSelect: () => {},
          onNew: () => {},
          onNewTerminal: () => {},
          onNewBrowser: () => {},
          onClose: () => {},
          onCloseMany: () => {},
          onReorder: () => {},
        }),
      );
    });

    const browserAction = container.querySelector<HTMLButtonElement>(
      '[aria-label="Browser"]',
    );
    expect(browserAction).not.toBeNull();
    expect(browserAction?.className).toContain("cursor-pointer");
  });
});
