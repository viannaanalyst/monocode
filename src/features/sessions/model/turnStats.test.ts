import { describe, expect, it } from "vitest";
import { newSession, type Block } from "./session";
import { formatSpeed, sessionTurnStats } from "./turnStats";

function userTurn(id: string, durationMs: number): Block {
  return { id, role: "user", text: "hi", durationMs };
}

describe("sessionTurnStats", () => {
  it("returns null until the harness reports token totals", () => {
    const session = newSession("opencode", "/tmp/project");
    expect(sessionTurnStats(session)).toBeNull();
  });

  it("computes cache hit and tokens per second across the thread", () => {
    const session = newSession("opencode", "/tmp/project");
    session.tokenStats = { input: 20_000, cached: 80_000, output: 1_000 };
    session.blocks = [userTurn("u1", 5_000), userTurn("u2", 15_000)];

    const stats = sessionTurnStats(session);
    expect(stats?.cacheHit).toBeCloseTo(0.8);
    expect(stats?.speed).toBe(50);
  });

  it("reports speed alone when no prompt tokens were recorded", () => {
    const session = newSession("opencode", "/tmp/project");
    session.tokenStats = { input: 0, cached: 0, output: 200 };
    session.blocks = [userTurn("u1", 4_000)];

    const stats = sessionTurnStats(session);
    expect(stats?.cacheHit).toBeNull();
    expect(stats?.speed).toBe(50);
  });
});

describe("formatSpeed", () => {
  it("rounds and never goes negative", () => {
    expect(formatSpeed(47.4)).toBe(47);
    expect(formatSpeed(-3)).toBe(0);
  });
});
