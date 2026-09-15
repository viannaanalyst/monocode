export const DEBUG_MODE_BODY = `You are in debug mode. Work like a systematic debugger:
- Read the error and the failing output completely before touching code.
- Reproduce the problem and gather evidence at each layer before proposing a change.
- State one hypothesis and the smallest experiment that tests it.
- Fix the root cause, never the symptom; do not stack speculative fixes.
- Verify the fix against the failing case and the adjacent tests, and report the evidence.
If the request is not a debugging task, say so briefly and work normally.`;

/** Wraps a turn so the answer follows the debugging posture above. */
export function debugTurnPrompt(request: string): string {
  return [DEBUG_MODE_BODY, "", "## Request", "", request.trim()].join("\n");
}
