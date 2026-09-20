import { BOARD_COLUMNS, type BoardColumn } from "./sessionBoard";

export function kanbanColumnFromPoint(
  x: number,
  y: number,
  hitTest: (x: number, y: number) => Element | null = (px, py) =>
    document.elementFromPoint(px, py),
): BoardColumn | null {
  const element = hitTest(x, y);
  const column = element?.closest?.("[data-kanban-column]") ?? null;
  const value = column?.getAttribute("data-kanban-column") ?? "";
  return BOARD_COLUMNS.find((candidate) => candidate === value) ?? null;
}

/** The archive transition a drop implies, or null when nothing changes. */
export function boardDropOutcome(
  archived: boolean,
  column: BoardColumn | null,
): "archive" | "unarchive" | null {
  if (!column) return null;
  if (archived) return column === "archived" ? null : "unarchive";
  return column === "archived" ? "archive" : null;
}
