// @vitest-environment happy-dom
// Keep this as .ts because the project test glob intentionally excludes .test.tsx.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitsFetch = vi.hoisted(() => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
  fetchClaudeRateLimits: vi.fn(),
  fetchCodexRateLimits: vi.fn(),
  fetchOpencodeGoRateLimits: vi.fn(),
  fetchCursorRateLimits: vi.fn(),
}));

vi.mock("../lib/rateLimitsFetch", () => rateLimitsFetch);
vi.mock("../lib/harness/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/harness/auth")>()),
}));

import type { ProviderRateLimits } from "../lib/rateLimits";
import { UsageFooter } from "./UsageFooter";

let container: HTMLDivElement;
let root: Root;

function opencodeLimits(): ProviderRateLimits {
  const now = Date.now();
  return {
    provider: "opencode",
    session: { usedPercent: 19, windowMinutes: 5 * 60, resetsAt: now + 3_600_000 },
    weekly: {
      usedPercent: 42,
      windowMinutes: 7 * 24 * 60,
      resetsAt: now + 5 * 86_400_000,
    },
    monthly: {
      usedPercent: 61,
      windowMinutes: 30 * 24 * 60,
      resetsAt: now + 20 * 86_400_000,
    },
    resetCredits: null,
    updatedAt: now,
    error: null,
    status: "ok",
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  rateLimitsFetch.fetchClaudeRateLimits.mockReset();
  rateLimitsFetch.fetchCodexRateLimits.mockReset();
  rateLimitsFetch.fetchOpencodeGoRateLimits
    .mockReset()
    .mockResolvedValue(opencodeLimits());
  rateLimitsFetch.fetchCursorRateLimits.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("opencode usage chip", () => {
  it("keeps the inline windows and opens the details popover on click", async () => {
    await act(async () =>
      root.render(
        createElement(UsageFooter, {
          providers: ["opencode"],
        }),
      ),
    );

    // The inline summary stays: three windows with their percentages.
    expect(container.textContent).toContain("19%");
    expect(container.textContent).toContain("42%");
    expect(container.textContent).toContain("61%");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const chip = container.querySelector<HTMLButtonElement>(
      'button[aria-label="OpenCode usage details"]',
    );
    expect(chip).not.toBeNull();
    await act(async () => chip!.click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("OpenCode usage");
    expect(dialog!.textContent).toContain("Account in this project");
    expect(dialog!.textContent).toContain("5-hour limit");
    expect(dialog!.textContent).toContain("Weekly limit");
    expect(dialog!.textContent).toContain("Monthly limit");
  });

  it("opens the account list even without usage windows", async () => {
    rateLimitsFetch.fetchOpencodeGoRateLimits.mockResolvedValue({
      ...opencodeLimits(),
      session: null,
      weekly: null,
      monthly: null,
    });
    await act(async () =>
      root.render(
        createElement(UsageFooter, {
          providers: ["opencode"],
        }),
      ),
    );

    const chip = container.querySelector<HTMLButtonElement>(
      'button[aria-label="OpenCode usage details"]',
    );
    expect(chip).not.toBeNull();
    await act(async () => chip!.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("Add account");
  });
});
