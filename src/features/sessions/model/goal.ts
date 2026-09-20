import { debugTurnPrompt } from "./debugMode";

/** A session objective the agent keeps pursuing until the user closes it. */
export type SessionGoal = {
  text: string;
  createdAt: number;
  completedAt?: number;
};

const GOAL_COMPLETED_RE = /^GOAL COMPLETED:\s*(.+)$/i;
const GOAL_PLACEHOLDER_RE = /^<.*>$/;

/**
 * Composes one turn prompt: Goal → Debug → mode → request. Native slash
 * commands skip the Goal and Debug blocks so the harness still executes them.
 */
export function composeTurnPrompt(input: {
  request: string;
  rawCommand: boolean;
  debug: boolean;
  goal?: SessionGoal;
  /** Already-composed Plan/Orchestrator wrapper; defaults to the request. */
  mode?: string;
}): string {
  const base = input.mode ?? input.request;
  const withDebug =
    input.debug && !input.rawCommand ? debugTurnPrompt(base) : base;
  return input.goal && !input.rawCommand
    ? goalTurnPrompt(input.goal, withDebug)
    : withDebug;
}

/** Keeps every turn pointed at the session's goal until it is achieved. */
export function goalTurnPrompt(goal: SessionGoal, request: string): string {
  return [
    "You are pursuing a goal the user set for this session. Keep every response focused on it.",
    "",
    "## Goal",
    "",
    goal.text.trim(),
    "",
    "Only after the goal is fully achieved, end your final reply with a last line exactly:",
    "GOAL COMPLETED: <one-line summary>",
    "Never emit that line while any part of the goal is still open.",
    "",
    "## Request",
    "",
    request.trim(),
  ].join("\n");
}

/** Reads the completion marker from the final non-empty line of a turn. */
export function goalCompleted(text: string): string | null {
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    const match = GOAL_COMPLETED_RE.exec(line);
    const summary = match?.[1]?.trim() ?? "";
    if (!summary || GOAL_PLACEHOLDER_RE.test(summary)) return null;
    return summary;
  }
  return null;
}

/** Chip label: one line, truncated so the composer stays compact. */
export function goalChipLabel(text: string, max = 40): string {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= max) return single;
  return `${single.slice(0, max - 1).trimEnd()}…`;
}

export function sanitizeSessionGoal(value: unknown): SessionGoal | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return undefined;
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : 0;
  const completedAt =
    typeof record.completedAt === "number" &&
    Number.isFinite(record.completedAt)
      ? record.completedAt
      : undefined;
  return { text, createdAt, ...(completedAt ? { completedAt } : {}) };
}
