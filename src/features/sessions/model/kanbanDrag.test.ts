// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { boardDropOutcome, kanbanColumnFromPoint } from "./kanbanDrag";

describe("kanbanColumnFromPoint", () => {
  it("reads the data attribute from the closest column element", () => {
    const column = document.createElement("div");
    column.setAttribute("data-kanban-column", "archived");
    const card = document.createElement("div");
    column.appendChild(card);
    expect(kanbanColumnFromPoint(1, 1, () => card)).toBe("archived");
  });

  it("returns null outside a column or for unknown values", () => {
    expect(kanbanColumnFromPoint(1, 1, () => null)).toBeNull();
    const stray = document.createElement("div");
    stray.setAttribute("data-kanban-column", "nope");
    expect(kanbanColumnFromPoint(1, 1, () => stray)).toBeNull();
  });
});

describe("boardDropOutcome", () => {
  it("archives when moving an active card onto archived", () => {
    expect(boardDropOutcome(false, "archived")).toBe("archive");
  });

  it("unarchives when moving an archived card anywhere else", () => {
    expect(boardDropOutcome(true, "idle")).toBe("unarchive");
    expect(boardDropOutcome(true, "working")).toBe("unarchive");
    expect(boardDropOutcome(true, "needs_you")).toBe("unarchive");
  });

  it("does nothing for same-column drops or drops outside a column", () => {
    expect(boardDropOutcome(true, "archived")).toBeNull();
    expect(boardDropOutcome(false, "idle")).toBeNull();
    expect(boardDropOutcome(false, null)).toBeNull();
    expect(boardDropOutcome(true, null)).toBeNull();
  });
});
