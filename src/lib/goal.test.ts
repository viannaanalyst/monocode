import { describe, expect, it } from "vitest";
import {
  composeTurnPrompt,
  goalChipLabel,
  goalCompleted,
  goalTurnPrompt,
  sanitizeSessionGoal,
  type SessionGoal,
} from "./goal";

const goal: SessionGoal = { text: "Ship the login screen", createdAt: 1 };

describe("composeTurnPrompt", () => {
  it("wraps the mode with debug, then the goal outermost", () => {
    const prompt = composeTurnPrompt({
      request: "fix the parser",
      rawCommand: false,
      debug: true,
      goal,
      mode: "MODE: fix the parser",
    });
    expect(prompt.startsWith("You are pursuing a goal")).toBe(true);
    expect(prompt).toContain("Ship the login screen");
    expect(prompt.indexOf("You are in debug mode")).toBeGreaterThan(
      prompt.indexOf("## Goal"),
    );
    expect(prompt.indexOf("MODE: fix the parser")).toBeGreaterThan(
      prompt.indexOf("You are in debug mode"),
    );
    expect(prompt.trimEnd().endsWith("MODE: fix the parser")).toBe(true);
  });

  it("leaves raw native commands free of the goal and debug blocks", () => {
    expect(
      composeTurnPrompt({
        request: "/help",
        rawCommand: true,
        debug: true,
        goal,
        mode: "/help",
      }),
    ).toBe("/help");
  });

  it("passes the request through when no mode applies", () => {
    expect(
      composeTurnPrompt({
        request: "  just ask  ",
        rawCommand: false,
        debug: false,
      }),
    ).toBe("  just ask  ");
  });
});

describe("goalTurnPrompt", () => {
  it("carries the goal, the marker instruction, and the request", () => {
    const prompt = goalTurnPrompt(goal, "  add the form  ");
    expect(prompt).toContain("## Goal");
    expect(prompt).toContain("Ship the login screen");
    expect(prompt).toContain("GOAL COMPLETED: <one-line summary>");
    expect(prompt.trimEnd().endsWith("add the form")).toBe(true);
  });
});

describe("goalCompleted", () => {
  it("reads the marker from the last non-empty line", () => {
    expect(goalCompleted("Done.\n\nGOAL COMPLETED: login ships\n")).toBe(
      "login ships",
    );
    expect(goalCompleted("goal completed:   lowercase  ")).toBe("lowercase");
  });

  it("ignores missing, misplaced, and empty markers", () => {
    expect(goalCompleted("GOAL COMPLETED: early\nbut more work follows")).toBe(
      null,
    );
    expect(goalCompleted("still working")).toBe(null);
    expect(goalCompleted("GOAL COMPLETED:")).toBe(null);
    expect(goalCompleted("")).toBe(null);
  });

  it("rejects the echoed placeholder marker", () => {
    expect(goalCompleted("GOAL COMPLETED: <one-line summary>")).toBe(null);
    expect(goalCompleted("GOAL COMPLETED:  <one-line summary>  ")).toBe(null);
  });
});

describe("goalChipLabel", () => {
  it("collapses whitespace and truncates long goals", () => {
    expect(goalChipLabel("a\n b")).toBe("a b");
    const long = "x".repeat(80);
    const label = goalChipLabel(long);
    expect(label.length).toBe(40);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("sanitizeSessionGoal", () => {
  it("keeps a valid goal and drops junk", () => {
    expect(sanitizeSessionGoal({ text: " go ", createdAt: 2 })).toEqual({
      text: "go",
      createdAt: 2,
    });
    expect(
      sanitizeSessionGoal({ text: "go", createdAt: 2, completedAt: 3 }),
    ).toEqual({ text: "go", createdAt: 2, completedAt: 3 });
    expect(sanitizeSessionGoal({ text: "   ", createdAt: 2 })).toBeUndefined();
    expect(sanitizeSessionGoal(null)).toBeUndefined();
    expect(sanitizeSessionGoal("goal")).toBeUndefined();
  });
});
