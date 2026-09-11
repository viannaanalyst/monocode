import { describe, expect, it } from "vitest";
import type { Session } from "./session";
import { sessionActivity } from "./sessionActivity";

function sessionWith(blocks: Session["blocks"]): Session {
  return {
    id: "s",
    harness: "codex",
    model: "gpt-5.5",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Work",
    cwd: "/tmp/project",
    blocks,
  };
}

describe("sessionActivity", () => {
  it("collects commands, tests, commits, and edited files", () => {
    const activity = sessionActivity(
      sessionWith([
        {
          id: "t1",
          role: "tool",
          text: "npm test",
          tool: { kind: "execute", title: "npm test" },
        },
        {
          id: "t2",
          role: "tool",
          text: "git commit -m 'fix'",
          tool: { kind: "execute", title: "git commit" },
        },
        {
          id: "t3",
          role: "tool",
          text: "ls",
          tool: { kind: "execute", title: "ls" },
        },
        {
          id: "t4",
          role: "tool",
          text: "Edit src/app.ts",
          tool: {
            kind: "edit",
            title: "Edit",
            preview: { kind: "diff", path: "/tmp/project/src/app.ts" },
          },
        },
      ]),
    );
    expect(activity.commands).toEqual([
      "npm test",
      "git commit -m 'fix'",
      "ls",
    ]);
    expect(activity.tests).toEqual(["npm test"]);
    expect(activity.commits).toEqual(["git commit -m 'fix'"]);
    expect(activity.files).toEqual(["/tmp/project/src/app.ts"]);
  });

  it("deduplicates repeated commands", () => {
    const command = {
      id: "t",
      role: "tool" as const,
      text: "npm run build",
      tool: { kind: "execute", title: "npm run build" },
    };
    const activity = sessionActivity(
      sessionWith([
        command,
        { ...command, id: "t2" },
        { ...command, id: "t3" },
      ]),
    );
    expect(activity.commands).toEqual(["npm run build"]);
  });

  it("ignores non-tool blocks and non-execute tools", () => {
    const activity = sessionActivity(
      sessionWith([
        { id: "u", role: "user", text: "please run npm test" },
        { id: "r", role: "tool", text: "Read file", tool: { kind: "read" } },
      ]),
    );
    expect(activity.commands).toEqual([]);
    expect(activity.files).toEqual([]);
  });
});
