// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferences } from "../lib/notificationPreferences";
import { rememberNotificationProjects } from "../lib/notificationProjects";
import { ProjectRail } from "./ProjectRail";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({
    root: "/work/private",
    commonDir: null,
    remote: "https://github.com/person/private.git",
  })),
  convertFileSrc: (path: string) => path,
}));
vi.mock("../hooks/useProjectDiffStats", () => ({
  useProjectDiffStats: () => null,
}));

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

async function render() {
  await act(async () =>
    root.render(
      createElement(ProjectRail, {
        cwd: "/work/private",
        recents: [],
        onSelectProject: vi.fn(),
        onOpenProject: vi.fn(),
      }),
    ),
  );
}

describe("rail project mute indicator", () => {
  it("marks a muted project and clears the mark when resumed", async () => {
    rememberNotificationProjects([
      {
        id: "local:/work/private",
        name: "person/private",
        detail: "github.com",
        kind: "repository",
        paths: ["/work/private"],
      },
    ]);
    updateNotificationPreferences(["local:/work/private"], {
      mutedUntil: null,
    });
    await render();

    const indicator = container.querySelector(
      '[role="img"][aria-label="Muted until resumed"]',
    );
    expect(indicator).not.toBeNull();
    const project = container.querySelector('button[aria-current="true"]')!;
    expect(project.getAttribute("aria-label")).toContain("Muted until resumed");

    updateNotificationPreferences(["local:/work/private"], {
      mutedUntil: undefined,
    });
    await act(async () => {});
    expect(
      container.querySelector('[role="img"][aria-label="Muted until resumed"]'),
    ).toBeNull();
  });
});
