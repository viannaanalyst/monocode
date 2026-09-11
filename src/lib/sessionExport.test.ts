import { describe, expect, it } from "vitest";
import type { Session } from "./session";
import {
  parseImportedSession,
  sessionToExportJson,
  sessionToMarkdown,
  SESSION_EXPORT_FORMAT,
  suggestExportFilename,
} from "./sessionExport";

function makeSession(): Session {
  return {
    id: "abc",
    harness: "codex",
    model: "gpt-5.5",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Fix the bug",
    cwd: "/tmp/project",
    providerSessionId: "thread-1",
    blocks: [
      { id: "u1", role: "user", text: "Please fix it" },
      { id: "a1", role: "assistant", text: "Done." },
      {
        id: "t1",
        role: "tool",
        text: "",
        tool: {
          title: "Bash",
          status: "completed",
          preview: { kind: "output", output: "npm test" },
        },
      },
      { id: "s1", role: "system", text: "Compacted context" },
    ],
  };
}

describe("sessionToMarkdown", () => {
  it("renders the header and each block", () => {
    const md = sessionToMarkdown(makeSession());
    expect(md).toContain("# Fix the bug");
    expect(md).toContain("harness: codex");
    expect(md).toContain("## You");
    expect(md).toContain("Please fix it");
    expect(md).toContain("## codex");
    expect(md).toContain("### Tool · Bash (completed)");
    expect(md).toContain("npm test");
    expect(md).toContain("> Compacted context");
  });

  it("widens the fence when the body contains backticks", () => {
    const session = makeSession();
    session.blocks = [
      {
        id: "t1",
        role: "tool",
        text: "",
        tool: { title: "Bash", preview: { kind: "output", output: "```\nhi\n```" } },
      },
    ];
    const md = sessionToMarkdown(session);
    expect(md).toContain("````");
  });
});

describe("parseImportedSession", () => {
  it("round-trips a session export", () => {
    const restored = parseImportedSession(sessionToExportJson(makeSession()));
    expect(restored).not.toBeNull();
    expect(restored?.id).not.toBe("abc");
    expect(restored?.harness).toBe("codex");
    expect(restored?.model).toBe("gpt-5.5");
    expect(restored?.title).toBe("Fix the bug");
    expect(restored?.cwd).toBe("/tmp/project");
    expect(restored?.providerSessionId).toBeUndefined();
    expect(restored?.blocks).toHaveLength(4);
    expect(restored?.blocks[0]?.text).toBe("Please fix it");
  });

  it("rejects anything that is not a MonoCode export", () => {
    expect(parseImportedSession("not json")).toBeNull();
    expect(parseImportedSession("{}")).toBeNull();
    expect(
      parseImportedSession(JSON.stringify({ format: "other", session: {} })),
    ).toBeNull();
    expect(
      parseImportedSession(
        JSON.stringify({
          format: SESSION_EXPORT_FORMAT,
          session: { harness: "codex", model: "", cwd: "/tmp", blocks: [] },
        }),
      ),
    ).toBeNull();
  });

  it("drops an unknown harness", () => {
    const envelope = JSON.parse(sessionToExportJson(makeSession()));
    envelope.session.harness = "not-a-harness";
    expect(parseImportedSession(JSON.stringify(envelope))).toBeNull();
  });
});

describe("suggestExportFilename", () => {
  it("slugifies the title", () => {
    const session = makeSession();
    expect(suggestExportFilename(session)).toBe("fix-the-bug");
    session.title = "!!!";
    expect(suggestExportFilename(session)).toBe("codex");
  });
});
