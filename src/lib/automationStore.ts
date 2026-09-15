import { invoke } from "@tauri-apps/api/core";
import type { ScheduleKind } from "./automationSchedule";

export const AUTOMATIONS_CHANGED = "monocode:automations-changed";

export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped_busy"
  | "missed";

export type Automation = {
  id: string;
  title: string;
  prompt: string;
  sessionId: string | null;
  cwd: string;
  harness: string;
  model: string;
  runtimeMode: string;
  modelSettings: string;
  scheduleKind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
  nextRunAt: number;
  enabled: boolean;
  consecutiveFailures: number;
  failurePolicy: "pause_after_1" | "pause_after_3" | "pause_after_5" | "keep_running";
  pausedReason: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationInput = Omit<
  Automation,
  "consecutiveFailures" | "pausedReason" | "createdAt" | "updatedAt"
>;

export type AutomationRun = {
  id: string;
  automationId: string;
  scheduledFor: number;
  startedAt: number | null;
  finishedAt: number | null;
  status: AutomationRunStatus;
  error: string | null;
};

export function listAutomations(): Promise<Automation[]> {
  return invoke<Automation[]>("automation_list");
}

export function upsertAutomation(input: AutomationInput): Promise<Automation> {
  return invoke<Automation>("automation_upsert", { input });
}

export function deleteAutomation(id: string): Promise<void> {
  return invoke<void>("automation_delete", { id });
}

export function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  return invoke<void>("automation_set_enabled", { id, enabled });
}

export function setAutomationSession(id: string, sessionId: string): Promise<void> {
  return invoke<void>("automation_set_session", { id, sessionId });
}

export function listAutomationRuns(id: string, limit = 20): Promise<AutomationRun[]> {
  return invoke<AutomationRun[]>("automation_runs", { id, limit });
}

export function takeDueAutomation(
  id: string,
  expectedNextRunAt: number,
  nextRunAt: number,
  now: number,
): Promise<boolean> {
  return invoke<boolean>("automation_take_due", {
    id,
    expectedNextRunAt,
    nextRunAt,
    now,
  });
}

export function recordMissedAutomation(
  id: string,
  expectedNextRunAt: number,
  nextRunAt: number,
): Promise<boolean> {
  return invoke<boolean>("automation_record_missed", {
    id,
    expectedNextRunAt,
    nextRunAt,
  });
}

export function recordAutomationResult(input: {
  automationId: string;
  runId: string;
  status: Exclude<AutomationRunStatus, "running" | "missed">;
  error: string | null;
  consecutiveFailures: number;
  enabled: boolean;
  pausedReason: string | null;
}): Promise<Automation> {
  return invoke<Automation>("automation_record_result", input);
}
