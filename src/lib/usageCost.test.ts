import { describe, expect, it } from "vitest";
import {
  findSessionCost,
  formatCost,
  parseUsageCostReport,
  sessionCostMatches,
  supportsUsageCost,
} from "./usageCost";

const UNIFIED = JSON.stringify({
  session: [
    {
      agent: "claude",
      period: "1bebea1f-8bff-4a2c-baf5-84b33959ee9b",
      totalTokens: 117526561,
      totalCost: 118.21588095000001,
      modelsUsed: ["claude-opus-4-8"],
      modelBreakdowns: [
        {
          modelName: "claude-opus-4-8",
          cost: 118.08,
          inputTokens: 20334,
          outputTokens: 454686,
          cacheCreationTokens: 5129793,
          cacheReadTokens: 111303664,
        },
      ],
    },
    {
      agent: "codex",
      period:
        "2026/09/08/rollout-2026-09-08T09-36-33-01a08105-283d-7672-9250-ad38b5b48e53",
      totalTokens: 53629594,
      totalCost: 7.49,
      modelsUsed: ["gpt-5.6-luna"],
    },
    {
      agent: "opencode",
      period: "ses_f72a765fdffedL51L8yT11JBQ6",
      totalTokens: 407847,
      totalCost: 0.0178,
      modelsUsed: ["deepseek-v4.1-flash"],
    },
  ],
  totals: { totalTokens: 171563, totalCost: 125.72 },
});

describe("parseUsageCostReport", () => {
  it("normalizes the unified session report", () => {
    const report = parseUsageCostReport(UNIFIED);
    expect(report?.sessions).toHaveLength(3);
    const claude = report?.sessions[0];
    expect(claude?.period).toBe("1bebea1f-8bff-4a2c-baf5-84b33959ee9b");
    expect(claude?.totalCost).toBeCloseTo(118.21588);
    expect(claude?.models[0]).toEqual({
      model: "claude-opus-4-8",
      tokens: 116908477,
      cost: 118.08,
    });
  });

  it("reads totals from the report", () => {
    const report = parseUsageCostReport(UNIFIED);
    expect(report?.totalTokens).toBe(171563);
    expect(report?.totalCost).toBeCloseTo(125.72);
  });

  it("accepts the plural sessions shape with costUSD and a models map", () => {
    const body = JSON.stringify({
      sessions: [
        {
          sessionId:
            "2026/09/08/rollout-2026-09-08T09-36-33-01a08105-283d-7672-9250-ad38b5b48e53",
          costUSD: 7.49,
          totalTokens: 53629594,
          models: {
            "gpt-5.6-luna": { totalTokens: 28293111, inputTokens: 1117102 },
          },
        },
      ],
      totals: { totalTokens: 53629594, costUSD: 7.49 },
    });
    const report = parseUsageCostReport(body);
    expect(report?.sessions[0]?.totalCost).toBeCloseTo(7.49);
    expect(report?.sessions[0]?.models[0]?.model).toBe("gpt-5.6-luna");
    expect(report?.totalCost).toBeCloseTo(7.49);
  });

  it("rejects invalid JSON", () => {
    expect(parseUsageCostReport("not json")).toBeNull();
    expect(parseUsageCostReport("{}")).toEqual({
      sessions: [],
      totalTokens: 0,
      totalCost: 0,
    });
  });
});

describe("sessionCostMatches", () => {
  it("matches Claude uuids and opencode session ids exactly", () => {
    expect(sessionCostMatches("abc-123", "abc-123")).toBe(true);
    expect(sessionCostMatches("ses_1", "ses_1")).toBe(true);
  });

  it("matches the Codex path by suffix", () => {
    expect(
      sessionCostMatches(
        "2026/09/08/rollout-2026-09-08T09-36-33-01a08105-283d-7672-9250-ad38b5b48e53",
        "01a08105-283d-7672-9250-ad38b5b48e53",
      ),
    ).toBe(true);
  });

  it("does not match unrelated ids", () => {
    expect(sessionCostMatches("abc", "abcd")).toBe(false);
    expect(sessionCostMatches("", "abc")).toBe(false);
  });
});

describe("findSessionCost", () => {
  const report = parseUsageCostReport(UNIFIED);

  it("finds each provider's session", () => {
    expect(
      findSessionCost(report, "claude", "1bebea1f-8bff-4a2c-baf5-84b33959ee9b")
        ?.agent,
    ).toBe("claude");
    expect(
      findSessionCost(
        report,
        "codex",
        "01a08105-283d-7672-9250-ad38b5b48e53",
      )?.agent,
    ).toBe("codex");
    expect(
      findSessionCost(report, "opencode", "ses_f72a765fdffedL51L8yT11JBQ6")
        ?.agent,
    ).toBe("opencode");
  });

  it("returns null for unknown ids or harnesses without cost data", () => {
    expect(findSessionCost(report, "claude", "missing")).toBeNull();
    expect(findSessionCost(report, "pi", "ses_f72a765fdffedL51L8yT11JBQ6")).toBe(
      null,
    );
    expect(findSessionCost(report, "opencode", undefined)).toBeNull();
  });
});

describe("formatCost", () => {
  it("formats dollars compactly", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(-1)).toBe("$0.00");
    expect(formatCost(Number.NaN)).toBe("$0.00");
    expect(formatCost(0.005)).toBe("<$0.01");
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(118.219)).toBe("$118.22");
  });
});

describe("supportsUsageCost", () => {
  it("covers the harnesses ccusage can price", () => {
    expect(supportsUsageCost("claude")).toBe(true);
    expect(supportsUsageCost("codex")).toBe(true);
    expect(supportsUsageCost("opencode")).toBe(true);
    expect(supportsUsageCost("grok")).toBe(true);
    expect(supportsUsageCost("cursor")).toBe(false);
    expect(supportsUsageCost("pi")).toBe(false);
  });
});
