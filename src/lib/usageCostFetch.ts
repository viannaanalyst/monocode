import { invoke } from "@tauri-apps/api/core";
import {
  parseUsageCostReport,
  type UsageCostReport,
} from "./usageCost";

export type UsageCostStatus = "idle" | "ok" | "unavailable" | "error";

export type UsageCostState = {
  status: UsageCostStatus;
  report: UsageCostReport | null;
  error: string | null;
  updatedAt: number;
};

/** ccusage pricing can move; a minute of staleness is invisible in the footer. */
export const USAGE_COST_POLL_MS = 60_000;
export const USAGE_COST_MIN_REFETCH_MS = 20_000;

type UsageCostFetch = {
  status: string;
  body?: string | null;
  error?: string | null;
};

export function idleUsageCost(): UsageCostState {
  return { status: "idle", report: null, error: null, updatedAt: 0 };
}

let inflight: Promise<UsageCostState> | null = null;
let latest: UsageCostState = idleUsageCost();

export function usageCostSnapshot(): UsageCostState {
  return latest;
}

export function shouldFetchUsageCost(
  state: UsageCostState,
  input: { force?: boolean; visible: boolean; now?: number },
): boolean {
  if (input.force) return true;
  if (!input.visible) return false;
  if (state.status === "unavailable") return false;
  if (state.updatedAt <= 0) return true;
  return (input.now ?? Date.now()) - state.updatedAt >= USAGE_COST_MIN_REFETCH_MS;
}

export function fetchUsageCost(force = false): Promise<UsageCostState> {
  if (inflight) return inflight;
  inflight = run(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(force: boolean): Promise<UsageCostState> {
  try {
    const result = await invoke<UsageCostFetch>("fetch_usage_cost", { force });
    if (result.status === "ok" && result.body) {
      const report = parseUsageCostReport(result.body);
      if (report) {
        latest = {
          status: "ok",
          report,
          error: null,
          updatedAt: Date.now(),
        };
        return latest;
      }
    }
    if (result.status === "unavailable") {
      latest = {
        status: "unavailable",
        report: null,
        error: result.error?.trim() || "Usage cost unavailable",
        updatedAt: Date.now(),
      };
      return latest;
    }
    return fail(result.error);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function fail(message: string | null | undefined): UsageCostState {
  const error = message?.trim() || "Usage cost unavailable";
  latest = {
    status: "error",
    report: latest.report,
    error,
    updatedAt: latest.report ? latest.updatedAt : Date.now(),
  };
  return latest;
}
