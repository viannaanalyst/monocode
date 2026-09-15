import { useState, type FormEvent } from "react";
import { CwdPicker } from "../chrome/CwdPicker";
import { AccessPicker } from "../chrome/AccessPicker";
import { ModelPicker } from "../chrome/ModelPicker";
import { t } from "../i18n";
import { type HarnessId, type RuntimeMode } from "../lib/session";
import { loadRecents } from "../lib/recents";
import { nextRunAt, WEEKDAYS, type ScheduleKind } from "../lib/automationSchedule";
import type { Automation } from "../lib/automationStore";

export function emptyAutomation(id: string, cwd: string): Automation {
  return {
    id,
    title: "",
    prompt: "",
    sessionId: null,
    cwd,
    harness: "claude",
    model: "",
    runtimeMode: "supervised",
    modelSettings: "{}",
    scheduleKind: "weekdays",
    intervalHours: 1,
    weekday: 1,
    hour: 9,
    minute: 0,
    nextRunAt: Date.now() + 3_600_000,
    enabled: true,
    consecutiveFailures: 0,
    failurePolicy: "pause_after_3",
    pausedReason: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const SCHEDULE_OPTIONS: { kind: ScheduleKind; label: string }[] = [
  { kind: "hourly", label: "Hourly" },
  { kind: "daily", label: "Daily" },
  { kind: "weekdays", label: "Weekdays" },
  { kind: "weekly", label: "Weekly" },
];

export function AutomationEditor({
  automation,
  cwd,
  onCancel,
  onSave,
}: {
  automation: Automation;
  cwd: string;
  onCancel: () => void;
  onSave: (next: Automation) => void;
}) {
  const [title, setTitle] = useState(automation.title);
  const [prompt, setPrompt] = useState(automation.prompt);
  const [projectCwd, setProjectCwd] = useState(automation.cwd || cwd);
  const [harness, setHarness] = useState<HarnessId>(automation.harness as HarnessId);
  const [model, setModel] = useState(automation.model);
  const [modelSettings, setModelSettings] = useState<Record<string, string>>(
    () => {
      try {
        return JSON.parse(automation.modelSettings) as Record<string, string>;
      } catch {
        return {};
      }
    },
  );
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(
    automation.runtimeMode as RuntimeMode,
  );
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(automation.scheduleKind);
  const [intervalHours, setIntervalHours] = useState(automation.intervalHours);
  const [weekday, setWeekday] = useState(automation.weekday);
  const [hour, setHour] = useState(automation.hour);
  const [minute, setMinute] = useState(automation.minute);
  const [failurePolicy, setFailurePolicy] = useState(automation.failurePolicy);
  const recents = useState(() => loadRecents())[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !prompt.trim() || projectCwd === "~") return;
    const schedule = { kind: scheduleKind, intervalHours, weekday, hour, minute };
    onSave({
      ...automation,
      title: title.trim(),
      prompt: prompt.trim(),
      cwd: projectCwd,
      harness,
      model,
      runtimeMode,
      modelSettings: JSON.stringify(modelSettings),
      scheduleKind,
      intervalHours,
      weekday,
      hour,
      minute,
      nextRunAt: nextRunAt(schedule, Date.now()),
      failurePolicy,
    });
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 border-t border-content/10 pt-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("Title")}
        className="h-8 rounded-md border border-content/10 bg-background-base/70 px-2.5 text-[13px] text-content outline-none placeholder:text-content/35"
      />
      <textarea
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={t("Prompt the automation should run")}
        className="resize-y rounded-md border border-content/10 bg-background-base/70 px-2.5 py-2 text-[13px] leading-5 text-content outline-none placeholder:text-content/35"
      />
      <div className="flex flex-wrap items-center gap-2">
        <CwdPicker cwd={projectCwd} recents={recents} onCwdChange={setProjectCwd} />
        <ModelPicker
          harness={harness}
          model={model}
          values={modelSettings}
          onChange={(nextHarness, nextModel) => {
            setHarness(nextHarness);
            setModel(nextModel);
          }}
          onSettingsChange={setModelSettings}
        />
        <AccessPicker value={runtimeMode} onChange={setRuntimeMode} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scheduleKind}
          onChange={(event) => setScheduleKind(event.target.value as ScheduleKind)}
          className="h-7 rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
        >
          {SCHEDULE_OPTIONS.map((option) => (
            <option key={option.kind} value={option.kind}>
              {t(option.label)}
            </option>
          ))}
        </select>
        {scheduleKind === "hourly" ? (
          <input
            type="number"
            min={1}
            max={24}
            value={intervalHours}
            onChange={(event) => setIntervalHours(Number(event.target.value))}
            className="h-7 w-16 rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
            aria-label={t("Hours")}
          />
        ) : null}
        {scheduleKind === "weekly" ? (
          <select
            value={weekday}
            onChange={(event) => setWeekday(Number(event.target.value))}
            className="h-7 rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
            aria-label={t("Weekday")}
          >
            {WEEKDAYS.map((label, index) => (
              <option key={label} value={index}>
                {t(label)}
              </option>
            ))}
          </select>
        ) : null}
        {scheduleKind !== "hourly" ? (
          <>
            <input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
              className="h-7 w-16 rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
              aria-label={t("Hour")}
            />
            <input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(event) => setMinute(Number(event.target.value))}
              className="h-7 w-16 rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
              aria-label={t("Minute")}
            />
          </>
        ) : null}
      </div>
      <select
        value={failurePolicy}
        onChange={(event) =>
          setFailurePolicy(event.target.value as Automation["failurePolicy"])
        }
        className="h-7 w-fit rounded-md border border-content/10 bg-background-base/70 px-2 text-[12px] text-content"
        aria-label={t("Failure policy")}
      >
        <option value="pause_after_1">{t("Pause after 1 failure")}</option>
        <option value="pause_after_3">{t("Pause after 3 failures")}</option>
        <option value="pause_after_5">{t("Pause after 5 failures")}</option>
        <option value="keep_running">{t("Keep running")}</option>
      </select>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!title.trim() || !prompt.trim() || projectCwd === "~"}
          className="inline-flex h-7 items-center rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:opacity-40"
        >
          {t("Save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-7 items-center rounded-md border border-content/15 px-2.5 text-[12px] text-content/75"
        >
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
