// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { startDragGhost } from "./dragGhost";

describe("startDragGhost", () => {
  it("clones the source, follows the pointer, and cleans up", () => {
    const source = document.createElement("div");
    source.textContent = "Session";
    document.body.appendChild(source);

    const ghost = startDragGhost(source, 40, 50);
    const el = document.querySelector<HTMLElement>("[data-drag-ghost]");
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("Session");
    expect(el?.style.pointerEvents).toBe("none");

    ghost.move(100, 120);
    expect(el?.style.transform).toContain("translate");
    expect(el?.style.transform).toContain("scale(1.02)");

    ghost.end();
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
  });
});
