import { describe, expect, it } from "vitest";
import { classifySessionBoard } from "./sessionBoard";
import type { SessionSummary } from "./sessionStore";

function row(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    cwd: "/tmp/web",
    harness: "cursor",
    model: "auto",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const none = new Set<string>();

describe("classifySessionBoard", () => {
  it("puts archived rows in the archived column even when busy", () => {
    const board = classifySessionBoard({
      rows: [row("a", { archived: true })],
      busyIds: new Set(["a"]),
      approvalIds: none,
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.archived.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.columns.working).toEqual([]);
  });

  it("prefers working over needs-you and idle", () => {
    const board = classifySessionBoard({
      rows: [row("a"), row("b")],
      busyIds: new Set(["a"]),
      approvalIds: new Set(["a", "b"]),
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.working.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.columns.needs_you.map((card) => card.session.id)).toEqual(["b"]);
    expect(board.columns.needs_you[0]?.needsYouReason).toBe("waiting");
  });

  it("labels unseen finished sessions as finished", () => {
    const board = classifySessionBoard({
      rows: [row("a")],
      busyIds: none,
      approvalIds: none,
      unseenIds: new Set(["a"]),
      scope: "all",
    });
    expect(board.columns.needs_you[0]?.needsYouReason).toBe("finished");
  });

  it("filters to the current project when scope is project", () => {
    const board = classifySessionBoard({
      rows: [row("a"), row("b", { cwd: "/tmp/other" })],
      busyIds: none,
      approvalIds: none,
      unseenIds: none,
      scope: "project",
      projectCwd: "/tmp/web",
    });
    expect(board.columns.idle.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.counts.idle).toBe(1);
  });

  it("sorts pinned first then by recency", () => {
    const board = classifySessionBoard({
      rows: [
        row("old", { updatedAt: 1 }),
        row("new", { updatedAt: 5 }),
        row("pinned", { updatedAt: 2, pinned: true }),
      ],
      busyIds: none,
      approvalIds: none,
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.idle.map((card) => card.session.id)).toEqual([
      "pinned",
      "new",
      "old",
    ]);
  });

  it("skips orchestration worker rows", () => {
    const board = classifySessionBoard({
      rows: [row("lead"), row("worker", { orchestrationLeadId: "lead" })],
      busyIds: new Set(["worker"]),
      approvalIds: none,
      unseenIds: none,
      scope: "all",
    });
    expect(board.cards.map((card) => card.session.id)).toEqual(["lead"]);
  });
});
