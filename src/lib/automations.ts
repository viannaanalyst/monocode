import { nextRunAt, scheduleOf, type AutomationSchedule } from "./automationSchedule";
import type { Automation, AutomationRunStatus } from "./automationStore";

export type RunOutcome = "completed" | "failed" | "cancelled";

export function failureLimit(policy: Automation["failurePolicy"]): number | null {
  if (policy === "pause_after_1") return 1;
  if (policy === "pause_after_3") return 3;
  if (policy === "pause_after_5") return 5;
  return null;
}

export function applyRunOutcome(
  automation: Pick<
    Automation,
    "consecutiveFailures" | "enabled" | "pausedReason" | "failurePolicy"
  >,
  outcome: RunOutcome,
): { consecutiveFailures: number; enabled: boolean; pausedReason: string | null } {
  if (outcome === "completed") {
    return { consecutiveFailures: 0, enabled: automation.enabled, pausedReason: null };
  }
  if (outcome === "cancelled") {
    return {
      consecutiveFailures: automation.consecutiveFailures,
      enabled: automation.enabled,
      pausedReason: automation.pausedReason,
    };
  }
  const failures = automation.consecutiveFailures + 1;
  const limit = failureLimit(automation.failurePolicy);
  if (limit != null && failures >= limit) {
    return { consecutiveFailures: failures, enabled: false, pausedReason: "failures" };
  }
  return { consecutiveFailures: failures, enabled: automation.enabled, pausedReason: automation.pausedReason };
}

export function automationTickPlan(
  automation: Automation,
  now: number,
  graceMs = 120_000,
): { missed: number[]; due: number | null } {
  const schedule = scheduleOf(automation);
  const missed: number[] = [];
  let cursor = automation.nextRunAt;
  for (let guard = 0; guard < 50; guard += 1) {
    if (cursor > now) break;
    if (now - cursor > graceMs) {
      missed.push(cursor);
      cursor = nextRunAt(schedule, cursor);
      continue;
    }
    return { missed, due: cursor };
  }
  return { missed, due: null };
}

export function nextSchedule(schedule: AutomationSchedule, slot: number): number {
  return nextRunAt(schedule, slot);
}

export function nextRunLabel(automation: Automation, now: number): string {
  if (!automation.enabled) {
    if (automation.pausedReason === "failures") {
      return `Paused after ${automation.consecutiveFailures} failures`;
    }
    return "Paused";
  }
  const ms = automation.nextRunAt - now;
  if (ms <= 0) return "Due now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function runStatusLabel(status: AutomationRunStatus): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "skipped_busy") return "Skipped";
  return "Missed";
}

export function automationStatusLabel(automation: Automation): string {
  if (automation.enabled) return "Active";
  return automation.pausedReason === "failures" ? "Paused" : "Disabled";
}
