// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("settings inbox page", () => {
  it("renders the project notifications block and its anchor id", async () => {
    await act(async () =>
      root.render(
        createElement(SettingsView, {
          section: "inbox",
          cwd: "/repo",
          sessions: [],
          onClose: vi.fn(),
          onOpenSession: vi.fn(),
          onArchiveSession: vi.fn(),
          onDeleteSession: vi.fn(),
          onOpenWhatsNew: vi.fn(),
        }),
      ),
    );

    const block = container.querySelector("#settings-project-notifications");
    expect(block).not.toBeNull();
    expect(block!.textContent).toContain("Project notifications");
    expect(
      container.querySelector('[aria-label="Project notifications"]'),
    ).not.toBeNull();
  });
});
