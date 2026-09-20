import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../data/sessionStore";
import {
  groupSessionsByProject,
  loadCollapsedProjects,
  saveCollapsedProjects,
} from "./sessionProjects";

function summary(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: overrides.id ?? "s",
    cwd: overrides.cwd ?? "/repo/a",
    harness: "claude",
    model: "m",
    runtimeMode: "full-access",
    title: "t",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as SessionSummary;
}

describe("groupSessionsByProject", () => {
  it("groups sessions by cwd, preserving first-seen order", () => {
    const groups = groupSessionsByProject([
      summary({ id: "1", cwd: "/repo/monocode" }),
      summary({ id: "2", cwd: "/repo/synara" }),
      summary({ id: "3", cwd: "/repo/monocode" }),
    ]);
    expect(groups.map((group) => [group.name, group.sessions.map((s) => s.id)])).toEqual([
      ["monocode", ["1", "3"]],
      ["synara", ["2"]],
    ]);
  });

  it("keeps same-named projects in different folders apart", () => {
    const groups = groupSessionsByProject([
      summary({ id: "1", cwd: "/cortex/agentbase" }),
      summary({ id: "2", cwd: "/cortex-finance/agentbase" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.key)).toEqual([
      "/cortex/agentbase",
      "/cortex-finance/agentbase",
    ]);
    expect(groups.every((group) => group.name === "agentbase")).toBe(true);
  });

  it("treats trailing slashes and a blank cwd as one project", () => {
    const groups = groupSessionsByProject([
      summary({ id: "1", cwd: "/repo/app/" }),
      summary({ id: "2", cwd: "/repo/app" }),
      summary({ id: "3", cwd: "" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["1", "2"]);
    expect(groups[1].name).toBe("~");
  });

  it("returns an empty list for no sessions", () => {
    expect(groupSessionsByProject([])).toEqual([]);
  });
});

describe("collapsed project groups", () => {
  it("round-trips the collapsed set", () => {
    saveCollapsedProjects(new Set(["/repo/a", "/repo/b"]));
    expect([...loadCollapsedProjects()].sort()).toEqual(
      ["/repo/a", "/repo/b"].sort(),
    );
  });

  it("ignores malformed stored values", () => {
    localStorage.setItem("monocode.collapsedProjectGroups", "not json");
    expect(loadCollapsedProjects().size).toBe(0);
  });
});
