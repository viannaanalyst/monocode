// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newTerminalFile } from "../lib/layout";
import { SurfaceTabs } from "./SurfaceTabs";

const roots: ReturnType<typeof createRoot>[] = [];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe("SurfaceTabs compact", () => {
  it("uses fit-content tabs and labels the new-tab button", () => {
    const file = newTerminalFile("/repo", "Terminal 1");
    const onNewTab = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        createElement(SurfaceTabs, {
          files: [file],
          activeFileId: file.id,
          dirtyFileIds: new Set<string>(),
          fileErrorCounts: new Map<string, number>(),
          onSelectFile: () => {},
          onCloseFile: () => {},
          onCloseOtherFiles: () => {},
          onReorder: () => {},
          compact: true,
          onNewTab,
          newTabLabel: "Novo terminal",
        }),
      );
    });

    const tab = host.querySelector('[role="tab"]');
    const item = tab?.closest(".reorder-item");
    expect(item?.className).toContain("max-w-[11rem]");
    expect(item?.parentElement?.parentElement?.className).toContain("h-8");

    const plus = host.querySelector('button[title="Novo terminal"]');
    expect(plus).not.toBeNull();
    act(() => (plus as HTMLButtonElement).click());
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it("keeps the wide tabs when compact is off", () => {
    const file = newTerminalFile("/repo", "Terminal 1");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        createElement(SurfaceTabs, {
          files: [file],
          activeFileId: file.id,
          dirtyFileIds: new Set<string>(),
          fileErrorCounts: new Map<string, number>(),
          onSelectFile: () => {},
          onCloseFile: () => {},
          onCloseOtherFiles: () => {},
          onReorder: () => {},
        }),
      );
    });

    const tab = host.querySelector('[role="tab"]');
    const item = tab?.closest(".reorder-item");
    expect(item?.className).toContain("w-52");
  });
});
