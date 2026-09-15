import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Automation } from "../lib/automationStore";
import { AutomationEditor } from "./AutomationsView";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    title: "Review PRs",
    prompt: "Review open PRs",
    sessionId: null,
    cwd: "/tmp/web",
    harness: "claude",
    model: "",
    runtimeMode: "supervised",
    modelSettings: "{}",
    scheduleKind: "weekdays",
    intervalHours: 1,
    weekday: 1,
    hour: 9,
    minute: 0,
    nextRunAt: 1_700_000_000_000,
    enabled: true,
    consecutiveFailures: 0,
    failurePolicy: "pause_after_3",
    pausedReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("AutomationEditor", () => {
  it("renders prompt, schedule, and policy fields", () => {
    const markup = renderToStaticMarkup(
      createElement(AutomationEditor, {
        automation: automation(),
        cwd: "/tmp/web",
        onCancel: () => {},
        onSave: () => {},
      }),
    );
    expect(markup).toContain("Review open PRs");
    expect(markup).toContain("Weekdays");
    expect(markup).toContain("Pause after 3 failures");
  });
});
