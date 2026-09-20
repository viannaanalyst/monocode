// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../data/sessionStore";
import { ProjectRail } from "../../../app/shell/ProjectRail";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({
    root: "/work/one",
    commonDir: null,
    remote: "https://github.com/person/one.git",
  })),
  convertFileSrc: (path: string) => path,
}));
vi.mock("../../source-control/hooks/useProjectDiffStats", () => ({
  useProjectDiffStats: () => null,
}));

let container: HTMLDivElement;
let root: Root;

function session(): SessionSummary {
  return {
    id: "session-1",
    cwd: "/work/one",
    harness: "codex",
    model: "gpt-5",
    runtimeMode: "supervised",
    title: "Check newlex session status",
    createdAt: 1,
    updatedAt: 2,
  };
}

function pointer(
  target: EventTarget,
  type: string,
  clientX: number,
  clientY: number,
) {
  act(() =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX,
        clientY,
      }),
    ),
  );
}

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("project rail session drag", () => {
  it("places a session on the pane below the pointer", () => {
    const onPlaceSessionOnPane = vi.fn();
    act(() =>
      root.render(
        createElement(ProjectRail, {
          cwd: "/work/one",
          recents: [{ path: "/work/one", openedAt: 1 }],
          sessions: [session()],
          onSelectProject: vi.fn(),
          onOpenProject: vi.fn(),
          onSelectSession: vi.fn(),
          onPlaceSessionOnPane,
        }),
      ),
    );

    const pane = document.createElement("div");
    pane.dataset.paneId = "pane-1";
    document.body.append(pane);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(pane);
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const target = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Check newlex session status"),
    );
    expect(target).not.toBeNull();

    pointer(target!, "pointerdown", 10, 10);
    pointer(window, "pointermove", 400, 300);
    pointer(window, "pointerup", 400, 300);

    expect(onPlaceSessionOnPane).toHaveBeenCalledWith(
      "session-1",
      "pane-1",
      expect.any(String),
    );
  });
});
