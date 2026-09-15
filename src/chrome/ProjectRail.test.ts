// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectRail } from "./ProjectRail";

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
});
