import type { Session } from "./session";

export type SessionTurnStats = {
  /** 0..1 fraction of prompt tokens served from cache, or null. */
  cacheHit: number | null;
  /** Output tokens per second across the thread, or null. */
  speed: number | null;
};

/**
 * Running cache-hit and speed for the whole conversation. Uses the token
 * totals the harnesses accumulate plus the per-turn durations already shown
 * on the transcript.
 */
export function sessionTurnStats(session: Session): SessionTurnStats | null {
  const stats = session.tokenStats;
  if (!stats) return null;

  const prompt = stats.input + stats.cached;
  const cacheHit = prompt > 0 ? stats.cached / prompt : null;

  const workedMs = session.blocks.reduce(
    (sum, block) =>
      block.role === "user" ? sum + (block.durationMs ?? 0) : sum,
    0,
  );
  const speed = workedMs > 0 ? stats.output / (workedMs / 1000) : null;

  if (cacheHit === null && speed === null) return null;
  return { cacheHit, speed };
}

/** Whole tokens-per-second, e.g. 47. */
export function formatSpeed(tokensPerSecond: number): number {
  return Math.max(0, Math.round(tokensPerSecond));
}
