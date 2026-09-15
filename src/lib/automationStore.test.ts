import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  listAutomations,
  recordAutomationResult,
  takeDueAutomation,
  upsertAutomation,
} from "./automationStore";

describe("automation store wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("passes take-due arguments through unchanged", async () => {
    await takeDueAutomation("a1", 10, 20, 30);
    expect(invoke).toHaveBeenCalledWith("automation_take_due", {
      id: "a1",
      expectedNextRunAt: 10,
      nextRunAt: 20,
      now: 30,
    });
  });

  it("sends result counters through", async () => {
    await recordAutomationResult({
      automationId: "a1",
      runId: "a1:10",
      status: "failed",
      error: "boom",
      consecutiveFailures: 2,
      enabled: true,
      pausedReason: null,
    });
    expect(invoke).toHaveBeenCalledWith("automation_record_result", {
      automationId: "a1",
      runId: "a1:10",
      status: "failed",
      error: "boom",
      consecutiveFailures: 2,
      enabled: true,
      pausedReason: null,
    });
  });

  it("lists and upserts", async () => {
    invoke.mockResolvedValueOnce([]);
    await listAutomations();
    expect(invoke).toHaveBeenCalledWith("automation_list");
    await upsertAutomation({
      id: "a1",
      title: "T",
      prompt: "P",
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
      nextRunAt: 1,
      enabled: true,
      failurePolicy: "pause_after_3",
    });
    expect(invoke).toHaveBeenCalledWith("automation_upsert", {
      input: expect.objectContaining({ id: "a1", scheduleKind: "daily" }),
    });
  });
});
