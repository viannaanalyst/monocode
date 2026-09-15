import { describe, expect, it } from "vitest";
import { debugTurnPrompt } from "./debugMode";

describe("debugTurnPrompt", () => {
  it("carries the systematic posture and the request", () => {
    const prompt = debugTurnPrompt("  the preview errors  ");
    expect(prompt).toContain("systematic debugger");
    expect(prompt).toContain("root cause");
    expect(prompt).toContain("Verify the fix");
    expect(prompt.trimEnd().endsWith("the preview errors")).toBe(true);
  });
});
