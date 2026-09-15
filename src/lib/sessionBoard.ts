import { sameProjectPath } from "./recents";
import { compareSessionSummaries } from "./sessionHistory";
import type { SessionSummary } from "./sessionStore";

export type BoardColumn = "working" | "needs_you" | "idle" | "archived";
export type BoardScope = "project" | "all";
export type NeedsYouReason = "waiting" | "finished";

export type BoardCard = {
  session: SessionSummary;
  column: BoardColumn;
  needsYouReason?: NeedsYouReason;
};

export type SessionBoard = {
  cards: BoardCard[];
  columns: Record<BoardColumn, BoardCard[]>;
  counts: Record<BoardColumn, number>;
};

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  "working",
  "needs_you",
  "idle",
  "archived",
];

export function classifySessionBoard(input: {
  rows: readonly SessionSummary[];
  busyIds: ReadonlySet<string>;
  approvalIds: ReadonlySet<string>;
  unseenIds: ReadonlySet<string>;
  scope: BoardScope;
  projectCwd?: string;
}): SessionBoard {
  const { rows, busyIds, approvalIds, unseenIds, scope, projectCwd } = input;
  const columns: Record<BoardColumn, BoardCard[]> = {
    working: [],
    needs_you: [],
    idle: [],
    archived: [],
  };
  const cards: BoardCard[] = [];
  for (const session of rows) {
    if (
      scope === "project" &&
      projectCwd &&
      !sameProjectPath(session.cwd, projectCwd)
    ) {
      continue;
    }
    const card: BoardCard = {
      session,
      ...columnForSession(session, busyIds, approvalIds, unseenIds),
    };
    cards.push(card);
    columns[card.column].push(card);
  }
  for (const column of BOARD_COLUMNS) {
    columns[column].sort((a, b) =>
      compareSessionSummaries(a.session, b.session),
    );
  }
  return {
    cards,
    columns,
    counts: {
      working: columns.working.length,
      needs_you: columns.needs_you.length,
      idle: columns.idle.length,
      archived: columns.archived.length,
    },
  };
}

function columnForSession(
  session: SessionSummary,
  busyIds: ReadonlySet<string>,
  approvalIds: ReadonlySet<string>,
  unseenIds: ReadonlySet<string>,
): { column: BoardColumn; needsYouReason?: NeedsYouReason } {
  if (session.archived) return { column: "archived" };
  if (busyIds.has(session.id)) return { column: "working" };
  if (approvalIds.has(session.id)) {
    return { column: "needs_you", needsYouReason: "waiting" };
  }
  if (unseenIds.has(session.id)) {
    return { column: "needs_you", needsYouReason: "finished" };
  }
  return { column: "idle" };
}
