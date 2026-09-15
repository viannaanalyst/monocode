import { useState, type FormEvent } from "react";
import { CwdPicker } from "../chrome/CwdPicker";
import { AccessPicker } from "../chrome/AccessPicker";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { ModelPicker } from "../chrome/ModelPicker";
import { OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
import {
  LayoutTwoColumn,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "../chrome/icons";
import { t } from "../i18n";
import { type HarnessId, type RuntimeMode } from "../lib/session";
import { loadRecents } from "../lib/recents";
import {
  describeSchedule,
  nextRunAt,
  scheduleOf,
  WEEKDAYS,
  type ScheduleKind,
} from "../lib/automationSchedule";
import {
  automationStatusLabel,
  nextRunLabel,
  runStatusLabel,
} from "../lib/automations";
import type { Automation, AutomationRun } from "../lib/automationStore";
import { IS_MAC } from "../lib/platform";

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

type Props = {
  automations: readonly Automation[];
  runs: Record<string, AutomationRun[]>;
  now: number;
  cwd: string;
  besideRail?: boolean;
  busyId?: string | null;
  onClose: () => void;
  onToggleSidebar?: () => void;
  onCreate: () => void;
  onSave: (input: Automation) => void;
  onRunNow: (automation: Automation) => void;
  onToggle: (automation: Automation) => void;
  onDelete: (automation: Automation) => void;
  onLoadRuns: (id: string) => void;
  onOpenSession: (sessionId: string) => void;
  creatingId?: string | null;
  onCancelCreate?: () => void;
};

export function AutomationsView({
  automations,
  runs,
  now,
  cwd,
  besideRail = false,
  busyId = null,
  onClose,
  onToggleSidebar,
  onCreate,
  onSave,
  onRunNow,
  onToggle,
  onDelete,
  onLoadRuns,
  onOpenSession,
  creatingId = null,
  onCancelCreate,
}: Props) {
  const [editing, setEditing] = useState<Automation | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div
      role="region"
      aria-label={t("Automations")}
      data-app-automations
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-content/10"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <LayoutTwoColumn className="size-3.5 shrink-0 text-content/45" strokeWidth={1.75} />
          <span className="font-medium">{t("Automations")}</span>
          <span className="text-content/40">
            {t("{count} scheduled", { count: automations.length })}
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mr-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          {t("New automation")}
        </button>
        {IS_MAC ? null : <WindowControls />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none px-3 py-3">
        {creatingId ? (
          <AutomationEditor
            automation={emptyAutomation(creatingId, cwd)}
            cwd={cwd}
            onCancel={() => onCancelCreate?.()}
            onSave={(next) => {
              onSave(next);
              onCancelCreate?.();
            }}
          />
        ) : null}
        {automations.length === 0 ? (
          <p className="px-1 py-6 text-[13px] text-content/45">
            {t("No automations yet")}
          </p>
        ) : (
          <ul className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {automations.map((automation) => {
              const history = runs[automation.id] ?? [];
              const active = busyId === automation.id;
              return (
                <li
                  key={automation.id}
                  className="rounded-lg border border-content/10 bg-content/[0.03] p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <HarnessIcon
                      harness={automation.harness as HarnessId}
                      className="size-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {automation.title}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        automation.enabled
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {t(automationStatusLabel(automation))}
                    </span>
                  </div>
                  {(() => {
                    const schedule = describeSchedule(scheduleOf(automation));
                    const next = nextRunLabel(automation, now);
                    const scheduleVars =
                      schedule.vars && typeof schedule.vars.weekday === "string"
                        ? { ...schedule.vars, weekday: t(schedule.vars.weekday) }
                        : schedule.vars;
                    return (
                      <p className="mt-1 text-[11px] text-content/50">
                        {t(schedule.key, scheduleVars)}
                        {" · "}
                        {t(next.key, next.vars)}
                      </p>
                    );
                  })()}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={active}
                      onClick={() => onRunNow(automation)}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-content/15 px-2 text-[11px] text-content/75 disabled:opacity-40"
                    >
                      {active ? (
                        <LoaderCircle className="size-3 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <Play className="size-3" strokeWidth={1.75} />
                      )}
                      {t("Run now")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(automation)}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-content/15 px-2 text-[11px] text-content/75"
                    >
                      <Pause className="size-3" strokeWidth={1.75} />
                      {automation.enabled ? t("Pause") : t("Resume")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(automation)}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-content/15 px-2 text-[11px] text-content/75"
                    >
                      <Pencil className="size-3" strokeWidth={1.75} />
                      {t("Edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = expanded === automation.id ? null : automation.id;
                        setExpanded(next);
                        if (next) onLoadRuns(automation.id);
                      }}
                      className="inline-flex h-6 items-center rounded-md border border-content/15 px-2 text-[11px] text-content/75"
                    >
                      {t("History")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(automation.id)}
                      className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-rose-300/90 hover:bg-rose-500/10"
                    >
                      <Trash2 className="size-3" strokeWidth={1.75} />
                      {t("Delete")}
                    </button>
                  </div>
                  {confirming === automation.id ? (
                    <div className="mt-2 flex items-center gap-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">
                      {t("Delete this automation? Its session is kept.")}
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(automation);
                          setConfirming(null);
                        }}
                        className="ml-auto rounded bg-rose-500/20 px-2 py-0.5"
                      >
                        {t("Delete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded border border-content/15 px-2 py-0.5"
                      >
                        {t("Cancel")}
                      </button>
                    </div>
                  ) : null}
                  {expanded === automation.id ? (
                    history.length === 0 ? (
                      <p className="mt-2 text-[11px] text-content/40">{t("No runs yet")}</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-1">
                        {history.map((run) => (
                          <li
                            key={run.id}
                            className="flex items-center gap-2 rounded bg-content/5 px-2 py-1 text-[11px] text-content/70"
                          >
                            <span className="tabular-nums">
                              {new Date(run.scheduledFor).toLocaleString()}
                            </span>
                            <span>{t(runStatusLabel(run.status))}</span>
                            {run.error ? (
                              <span className="min-w-0 flex-1 truncate text-rose-300/90">
                                {run.error}
                              </span>
                            ) : null}
                            {automation.sessionId ? (
                              <button
                                type="button"
                                onClick={() => onOpenSession(automation.sessionId as string)}
                                className="ml-auto shrink-0 text-content/50 hover:text-content"
                              >
                                {t("Open session")}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                  {editing?.id === automation.id ? (
                    <AutomationEditor
                      automation={editing}
                      cwd={cwd}
                      onCancel={() => setEditing(null)}
                      onSave={(next) => {
                        onSave(next);
                        setEditing(null);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
