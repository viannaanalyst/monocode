import { asRecord } from "./harness/codexProtocol";
import type { HarnessId } from "./session";

/**
 * Estimated session cost, sourced from the local `ccusage` CLI.
 *
 * ccusage reads the usage files each harness already writes and prices them
 * with models.dev, so MonoCode does not need a bundled pricing table. This is
 * an equivalent-API-list-price estimate, not the user's subscription bill.
 */
export type UsageCostModel = {
  model: string;
  tokens: number;
  cost: number;
};

export type SessionCost = {
  agent: string;
  /** Provider session id / ccusage "period" used to match the live session. */
  period: string;
  totalTokens: number;
  totalCost: number;
  models: UsageCostModel[];
};

export type UsageCostReport = {
  sessions: SessionCost[];
  totalTokens: number;
  totalCost: number;
};

/** Harnesses whose sessions ccusage can price locally. */
const HARNESS_AGENT: Partial<Record<HarnessId, string>> = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  grok: "grok",
};

export function usageCostAgent(harness: HarnessId): string | null {
  return HARNESS_AGENT[harness] ?? null;
}

export function supportsUsageCost(harness: HarnessId): boolean {
  return usageCostAgent(harness) != null;
}

export function parseUsageCostReport(body: string): UsageCostReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root) return null;
  const rows = arrayField(root, "session") ?? arrayField(root, "sessions") ?? [];
  const sessions = rows.flatMap((row) => {
    const session = sessionCostFrom(row);
    return session ? [session] : [];
  });
  const totals = asRecord(root.totals);
  const totalTokens =
    numberField(totals, "totalTokens") ??
    sessions.reduce((sum, session) => sum + session.totalTokens, 0);
  const totalCost =
    numberField(totals, "totalCost") ??
    numberField(totals, "costUSD") ??
    sessions.reduce((sum, session) => sum + session.totalCost, 0);
  return { sessions, totalTokens, totalCost };
}

function sessionCostFrom(value: unknown): SessionCost | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const period =
    stringField(rec, "period") ??
    stringField(rec, "sessionId") ??
    stringField(rec, "sessionFile");
  if (!period) return null;
  const agent = stringField(rec, "agent") ?? "";
  return {
    agent,
    period,
    totalTokens: numberField(rec, "totalTokens") ?? 0,
    totalCost:
      numberField(rec, "totalCost") ?? numberField(rec, "costUSD") ?? 0,
    models: modelsFrom(rec),
  };
}

function modelsFrom(rec: Record<string, unknown>): UsageCostModel[] {
  const breakdowns = arrayField(rec, "modelBreakdowns");
  if (breakdowns) {
    return breakdowns.flatMap((entry) => {
      const row = asRecord(entry);
      const model = row ? stringField(row, "modelName") : undefined;
      if (!row || !model) return [];
      return [
        {
          model,
          tokens: numberField(row, "totalTokens") ?? tokensFrom(row),
          cost: numberField(row, "cost") ?? 0,
        },
      ];
    });
  }
  const models = asRecord(rec.models);
  if (models) {
    return Object.entries(models).flatMap(([model, entry]) => {
      const row = asRecord(entry);
      if (!row) return [];
      return [
        {
          model,
          tokens: numberField(row, "totalTokens") ?? tokensFrom(row),
          cost: 0,
        },
      ];
    });
  }
  return (arrayField(rec, "modelsUsed") ?? []).flatMap((entry) =>
    typeof entry === "string" ? [{ model: entry, tokens: 0, cost: 0 }] : [],
  );
}

function tokensFrom(rec: Record<string, unknown>): number {
  return (
    (numberField(rec, "inputTokens") ?? 0) +
    (numberField(rec, "outputTokens") ?? 0) +
    (numberField(rec, "cacheCreationTokens") ?? 0) +
    (numberField(rec, "cacheReadTokens") ?? 0)
  );
}

/**
 * ccusage reports a Claude session as its bare uuid, opencode as `ses_…`, and
 * Codex as `YYYY/MM/DD/rollout-…-<thread-id>`. Matching on the suffix keeps all
 * three working without a per-harness parser.
 */
export function sessionCostMatches(
  period: string,
  providerSessionId: string,
): boolean {
  if (!period || !providerSessionId) return false;
  if (period === providerSessionId) return true;
  return period.endsWith(providerSessionId);
}

export function findSessionCost(
  report: UsageCostReport | null,
  harness: HarnessId,
  providerSessionId: string | undefined,
): SessionCost | null {
  if (!report || !providerSessionId) return null;
  const agent = usageCostAgent(harness);
  if (!agent) return null;
  return (
    report.sessions.find(
      (session) =>
        session.agent === agent &&
        sessionCostMatches(session.period, providerSessionId),
    ) ?? null
  );
}

/** Compact dollar estimate: "$0.42", "<$0.01", "$0.00". */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function arrayField(
  rec: Record<string, unknown>,
  key: string,
): unknown[] | null {
  const value = rec[key];
  return Array.isArray(value) ? value : null;
}

function stringField(
  rec: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = rec[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(
  rec: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = rec?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
