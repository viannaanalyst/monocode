import { useState, type ReactElement } from "react";
import { goalChipLabel, type SessionGoal } from "../lib/goal";
import { t } from "../i18n";
import { Bug, Check, Crosshair, X } from "./icons";
import { Popover, type PopoverAnchor } from "./Popover";

const ROW =
  "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-content hover:bg-content/10";

const CHIP =
  "flex h-6.5 shrink-0 items-center gap-1 rounded-full px-1.5 text-sm";

export function GoalMenuRow({
  goal,
  onEdit,
}: {
  goal?: SessionGoal;
  onEdit: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onEdit}
      className={ROW}
    >
      <Crosshair className="size-3.5 shrink-0 text-content/70" />
      <span className="min-w-0 truncate text-sm">{t("Goal")}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-content/40">
        {goal ? goalChipLabel(goal.text) : t("Set a goal to keep pursuing")}
      </span>
      {goal ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
    </button>
  );
}

export function DebugMenuRow({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={ROW}
    >
      <Bug className="size-3.5 shrink-0 text-content/70" />
      <span className="min-w-0 truncate text-sm">{t("Debug mode")}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-content/40">
        {t("Turn debug mode on")}
      </span>
      {active ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
    </button>
  );
}

export function GoalEditor({
  anchor,
  width,
  goal,
  onSave,
  onClear,
  onClose,
}: {
  anchor: PopoverAnchor;
  width?: number;
  goal?: SessionGoal;
  onSave: (text: string) => void;
  onClear: () => void;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(goal?.text ?? "");
  const save = () => {
    const text = draft.trim();
    if (!text) {
      onClear();
      return;
    }
    onSave(text);
  };
  return (
    <Popover
      anchor={anchor}
      side="top"
      align="start"
      width={width}
      onDismiss={onClose}
      className="p-2"
    >
      <p className="px-1 pb-1 text-2xs font-medium uppercase tracking-wide text-content/40">
        {t("Goal")}
      </p>
      <textarea
        value={draft}
        autoFocus
        rows={3}
        spellCheck={false}
        placeholder={t("Describe the goal for this session")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") onClose();
        }}
        className="w-full resize-none rounded-md border border-content/10 bg-content/5 p-2 text-sm text-content outline-none placeholder:text-content/35"
      />
      <div className="flex items-center justify-end gap-1 pt-1.5">
        {goal ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-xs text-content/60 hover:bg-content/10 hover:text-content"
          >
            {t("Clear")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          className="rounded-md bg-content/10 px-2 py-1 text-xs font-medium text-content hover:bg-content/15"
        >
          {t("Save")}
        </button>
      </div>
    </Popover>
  );
}

export function GoalChip({
  goal,
  onEdit,
  onClear,
  onResolve,
}: {
  goal?: SessionGoal;
  onEdit: () => void;
  onClear: () => void;
  onResolve: (action: "complete" | "keep") => void;
}): ReactElement | null {
  if (!goal) return null;
  const completed = Boolean(goal.completedAt);
  return (
    <span
      className={`${CHIP} ${
        completed
          ? "bg-emerald-400/10 text-emerald-200/90"
          : "bg-content/8 text-content/80"
      }`}
    >
      <Crosshair className="size-3.5 shrink-0" />
      <button
        type="button"
        title={t("Edit goal")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onEdit}
        className="max-w-56 truncate"
      >
        {goalChipLabel(goal.text)}
      </button>
      {completed ? (
        <>
          <button
            type="button"
            aria-label={t("Complete goal")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onResolve("complete")}
            className="rounded px-1 text-2xs font-medium hover:bg-emerald-400/15"
          >
            {t("Complete goal")}
          </button>
          <button
            type="button"
            aria-label={t("Keep pursuing")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onResolve("keep")}
            className="rounded px-1 text-2xs font-medium text-emerald-100/70 hover:bg-emerald-400/15"
          >
            {t("Keep pursuing")}
          </button>
        </>
      ) : null}
      <button
        type="button"
        aria-label={t("Clear goal")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        className="grid size-3.5 shrink-0 place-items-center rounded-full hover:bg-content/15"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function DebugChip({ onDisable }: { onDisable: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-label={t("Turn off Debug mode")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onDisable}
      className={`${CHIP} text-content/70 hover:bg-content/10`}
    >
      <Bug className="size-3.5" />
      {t("Debug")}
      <X className="size-3.5" />
    </button>
  );
}
