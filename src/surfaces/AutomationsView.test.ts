import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Automation } from "../lib/automationStore";
import { AutomationEditor, AutomationsView } from "./AutomationsView";

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

function render(overrides: Partial<Parameters<typeof AutomationsView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AutomationsView, {
      automations: [],
      runs: {},
      now: 1_700_000_000_000,
      cwd: "/tmp/web",
      besideRail: true,
      onClose: () => {},
      onCreate: () => {},
      onSave: () => {},
      onRunNow: () => {},
      onToggle: () => {},
      onDelete: () => {},
      onLoadRuns: () => {},
      onOpenSession: () => {},
      ...overrides,
    }),
  );
}

describe("AutomationsView", () => {
  it("shows an empty state", () => {
    expect(render()).toContain("No automations yet");
  });

  it("renders an automation with schedule and status", () => {
    const markup = render({ automations: [automation()] });
    expect(markup).toContain("Review PRs");
    expect(markup).toContain("Weekdays at 09:00");
    expect(markup).toContain("Active");
    expect(markup).toContain("Run now");
  });

  it("shows the failure pause state", () => {
    const markup = render({
      automations: [
        automation({ enabled: false, pausedReason: "failures", consecutiveFailures: 3 }),
      ],
    });
    expect(markup).toContain("Paused");
    expect(markup).toContain("3");
  });
});
