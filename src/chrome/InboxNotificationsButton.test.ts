// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxNotificationsButton } from "./InboxNotificationsButton";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ connected: false })),
  convertFileSrc: (path: string) => path,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("inbox notifications button", () => {
  it("toggles the inbox actions menu", async () => {
    await act(async () =>
      root.render(
        createElement(InboxNotificationsButton, {
          projectPaths: ["/repos/work"],
          onOpenSettings: vi.fn(),
        }),
      ),
    );

    const bell = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Notifications"]',
    );
    expect(bell).not.toBeNull();
    await act(async () => bell!.click());
    expect(
      document.querySelector('[role="menu"][aria-label="Inbox actions"]'),
    ).not.toBeNull();
    expect(bell!.getAttribute("aria-expanded")).toBe("true");
    await act(async () => bell!.click());
    expect(
      document.querySelector('[role="menu"][aria-label="Inbox actions"]'),
    ).toBeNull();
    expect(bell!.getAttribute("aria-expanded")).toBe("false");
  });
});
