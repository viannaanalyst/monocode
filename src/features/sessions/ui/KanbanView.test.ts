import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KanbanView } from "./KanbanView";
import type { SessionSummary } from "../data/sessionStore";

function row(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    cwd: "/tmp/web",
    harness: "cursor",
    model: "auto",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function render(
  props: Partial<Parameters<typeof KanbanView>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(KanbanView, {
      cwd: "/tmp/web",
      rows: [],
      busyIds: new Set<string>(),
      approvalIds: new Set<string>(),
      unseenIds: new Set<string>(),
      now: 1_700_000_060_000,
      onClose: () => {},
      onOpenSession: () => {},
      onArchiveSession: () => {},
      ...props,
    }),
  );
}

describe("KanbanView", () => {
  it("renders the four columns with counts and empty hints", () => {
    const markup = render();
    expect(markup).toContain("Working");
    expect(markup).toContain("Needs you");
    expect(markup).toContain("Idle");
    expect(markup).toContain("Archived");
    expect(markup).toContain("No sessions here");
  });

  it("renders a working card with a spinner and a waiting card with its badge", () => {
    const markup = render({
      rows: [row("busy"), row("waiting", { updatedAt: 1_700_000_030_000 })],
      busyIds: new Set(["busy"]),
      approvalIds: new Set(["waiting"]),
    });
    expect(markup).toContain("busy");
    expect(markup).toContain("waiting");
    expect(markup).toContain("Waiting for you");
    expect(markup).toContain("animate-spin");
  });

  it("renders a finished badge for unseen finished sessions", () => {
    const markup = render({
      rows: [row("done")],
      unseenIds: new Set(["done"]),
    });
    expect(markup).toContain("Finished");
  });

  it("renders the status pill and the card menu for each column", () => {
    const markup = render({
      rows: [
        row("busy"),
        row("waiting"),
        row("plain"),
        row("old", { archived: true }),
      ],
      busyIds: new Set(["busy"]),
      approvalIds: new Set(["waiting"]),
    });
    expect(markup).toContain("Working");
    expect(markup).toContain("Waiting for you");
    expect(markup).toContain("Idle session");
    expect(markup).toContain("Archived session");
    expect(markup).toContain('aria-label="plain menu"');
  });

  it("shows project names only in the all-projects scope", () => {
    const rows = [row("a")];
    expect(render({ rows })).not.toContain(">web<");
    const all = render({ rows, initialScope: "all" });
    expect(all).toContain(">web<");
    expect(all).toContain("All projects");
  });
});
