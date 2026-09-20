import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestOutgoingHandoff, HANDOFF_TIMEOUT_MS } from "./handoffTurn";

const sendHarnessTurn = vi.fn();
const cancelHarnessTurn = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../integrations/harness/core/registry", () => ({
  sendHarnessTurn: (...args: unknown[]) => sendHarnessTurn(...args),
  cancelHarnessTurn: (...args: unknown[]) => cancelHarnessTurn(...args),
  respondHarnessApproval: vi.fn(),
  respondHarnessQuestion: vi.fn(),
}));

describe("requestOutgoingHandoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendHarnessTurn.mockReset();
    cancelHarnessTurn.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not wait forever if the outgoing agent never finishes the recap", async () => {
    sendHarnessTurn.mockReturnValue(new Promise(() => {}));

    const pending = requestOutgoingHandoff({
      harness: "cursor",
      sessionId: "s1",
      cwd: "/tmp",
      model: "cursor:grok-4.6",
      userRequest: "continue in another model",
    });

    await vi.advanceTimersByTimeAsync(HANDOFF_TIMEOUT_MS);
    await expect(pending).resolves.toBe("");
    expect(cancelHarnessTurn).toHaveBeenCalledWith("cursor", "s1");
  });
});
