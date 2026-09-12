import { describe, expect, it } from "vitest";
import type { Block, Session } from "../lib/session";
import { largeContextSize } from "./LargeContextNudge";

function session(overrides: Record<string, unknown>): Session {
  return overrides as unknown as Session;
}

function textBlock(length: number): Block {
  return { id: "b", text: "x".repeat(length) } as unknown as Block;
}

describe("largeContextSize", () => {
  it("stays quiet while the reported window still has room", () => {
    expect(
      largeContextSize(
        session({ context: { used: 50_000, window: 200_000 }, blocks: [] }),
      ),
    ).toBeNull();
  });

  it("reports the used tokens once the window is nearly full", () => {
    expect(
      largeContextSize(
        session({ context: { used: 160_000, window: 200_000 }, blocks: [] }),
      ),
    ).toBe(160_000);
  });

  it("ignores a huge transcript when the reported window is roomy", () => {
    expect(
      largeContextSize(
        session({
          context: { used: 10_000, window: 200_000 },
          blocks: [textBlock(500_000)],
        }),
      ),
    ).toBeNull();
  });

  it("falls back to counting characters without a reported window", () => {
    expect(
      largeContextSize(session({ context: { used: 10_000 }, blocks: [] })),
    ).toBeNull();
    expect(largeContextSize(session({ blocks: [textBlock(120_000)] }))).toBe(
      120_000,
    );
  });
});
