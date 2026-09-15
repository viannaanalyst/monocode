import { describe, expect, it } from "vitest";
import {
  applyRunOutcome,
  automationTickPlan,
  failureLimit,
  nextRunLabel,
  runStatusLabel,
} from "./automations";
import type { Automation } from "./automationStore";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    title: "Review PRs",
    prompt: "Review",
    sessionId: null,
    cwd: "/tmp/web",
    harness: "claude",
    model: "",
    runtimeMode: "supervised",
    modelSettings: "{}",
    scheduleKind: "daily",
    intervalHours: 1,
    weekday: 1,
    hour: 9,
    minute: 0,
    nextRunAt: 1_700_000_000_000,
    enabled: true,
    consecutiveFailures: 0,
    failurePolicy: "pause_after_3",
    pausedReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("failure policy", () => {
  it("maps policies to limits", () => {
    expect(failureLimit("pause_after_1")).toBe(1);
    expect(failureLimit("pause_after_3")).toBe(3);
    expect(failureLimit("pause_after_5")).toBe(5);
    expect(failureLimit("keep_running")).toBeNull();
  });

  it("resets on success and counts failures", () => {
    const failed = applyRunOutcome(automation({ consecutiveFailures: 1 }), "failed");
    expect(failed.consecutiveFailures).toBe(2);
    expect(failed.enabled).toBe(true);
    const completed = applyRunOutcome(automation({ consecutiveFailures: 2 }), "completed");
    expect(completed.consecutiveFailures).toBe(0);
    const cancelled = applyRunOutcome(automation({ consecutiveFailures: 2 }), "cancelled");
    expect(cancelled.consecutiveFailures).toBe(2);
  });

  it("pauses at the threshold with a reason code", () => {
    const paused = applyRunOutcome(automation({ consecutiveFailures: 2 }), "failed");
    expect(paused.enabled).toBe(false);
    expect(paused.pausedReason).toBe("failures");
  });

  it("keeps running when the policy says so", () => {
    const kept = applyRunOutcome(
      automation({ consecutiveFailures: 9, failurePolicy: "keep_running" }),
      "failed",
    );
    expect(kept.enabled).toBe(true);
    expect(kept.consecutiveFailures).toBe(10);
  });
});

describe("automationTickPlan", () => {
  it("separates old slots from the current one", () => {
    const base = new Date(2023, 10, 14, 9, 0, 0, 0).getTime();
    const plan = automationTickPlan(automation({ nextRunAt: base }), base + 3 * 86_400_000, 120_000);
    expect(plan.missed).toHaveLength(3);
    expect(plan.due).toBe(base + 3 * 86_400_000);
  });

  it("treats a slot inside the grace window as due", () => {
    const base = 1_700_000_000_000;
    const plan = automationTickPlan(automation({ nextRunAt: base }), base + 60_000, 120_000);
    expect(plan.missed).toEqual([]);
    expect(plan.due).toBe(base);
  });

  it("does nothing when the next slot is ahead", () => {
    const base = 1_700_000_000_000;
    const plan = automationTickPlan(automation({ nextRunAt: base }), base - 60_000, 120_000);
    expect(plan.missed).toEqual([]);
    expect(plan.due).toBeNull();
  });
});

describe("labels", () => {
  it("labels next-run states and statuses", () => {
    const now = 1_700_000_000_000;
    expect(nextRunLabel(automation({ nextRunAt: now + 3_600_000 }), now)).toContain("1");
    expect(nextRunLabel(automation({ enabled: false, pausedReason: "failures", consecutiveFailures: 3 }), now)).toContain("3");
    expect(runStatusLabel("skipped_busy")).toBe("Skipped");
  });
});
