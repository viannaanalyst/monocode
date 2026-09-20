// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectRail } from "../../../app/shell/ProjectRail";

describe("ProjectRail board entry", () => {
  it("renders the Kanban action below Inbox when wired", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onOpenInbox: () => {},
        onOpenKanban: () => {},
      }),
    );
    const inbox = markup.indexOf("Inbox");
    const kanban = markup.indexOf("Kanban");
    expect(kanban).toBeGreaterThan(inbox);
  });

  it("renders Automations below Kanban when wired", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onOpenInbox: () => {},
        onOpenKanban: () => {},
        onOpenAutomations: () => {},
      }),
    );
    expect(markup.indexOf("Automations")).toBeGreaterThan(markup.indexOf("Kanban"));
  });

  it("offers new session on unpinned projects too", () => {
    localStorage.clear();
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [{ path: "/tmp/other", openedAt: 1 }],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onNewInProject: () => {},
      }),
    );
    expect(markup).toContain("other");
    expect(markup).toContain('aria-label="New session"');
  });

  it("always titles the rail MonoCode and wires search and notes", () => {
    const bare = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
      }),
    );
    expect(bare).toContain(">MonoCode</span>");
    expect(bare).not.toContain('aria-label="Search"');
    expect(bare).not.toContain('aria-label="Notes"');

    const wired = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onSearch: () => {},
        onOpenNotes: () => {},
      }),
    );
    expect(wired).toContain('aria-label="Search"');
    expect(wired).toContain('aria-label="Notes"');
  });
});
