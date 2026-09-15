import { useMemo, useState } from "react";
import { OverlayNav } from "../chrome/TitleBar";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { LayoutTwoColumn, LoaderCircle, Pin } from "../chrome/icons";
import { t } from "../i18n";
import { projectName } from "../lib/paths";
import { IS_MAC } from "../lib/platform";
import {
  classifySessionBoard,
  BOARD_COLUMNS,
  type BoardCard,
  type BoardColumn,
  type BoardScope,
} from "../lib/sessionBoard";
import type { SessionSummary } from "../lib/sessionStore";

const COLUMN_LABELS: Record<BoardColumn, string> = {
  working: "Working",
  needs_you: "Needs you",
  idle: "Idle",
  archived: "Archived",
};

const COLUMN_DOTS: Record<BoardColumn, string> = {
  working: "bg-sky-400",
  needs_you: "bg-amber-400",
  idle: "bg-content/25",
  archived: "bg-content/20",
};

type Props = {
  cwd: string;
  rows: readonly SessionSummary[];
  busyIds: ReadonlySet<string>;
  approvalIds: ReadonlySet<string>;
  unseenIds: ReadonlySet<string>;
  /** Test seam and future deep-link hook; the toggle is view state. */
  initialScope?: BoardScope;
  /** Test seam for deterministic relative times. */
  now?: number;
  besideRail?: boolean;
  onClose: () => void;
  onToggleSidebar?: () => void;
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
};

export function KanbanView({
  cwd,
  rows,
  busyIds,
  approvalIds,
  unseenIds,
  initialScope = "project",
  now = Date.now(),
  besideRail = false,
  onClose,
  onToggleSidebar,
  onOpenSession,
  onArchiveSession,
}: Props) {
  const [scope, setScope] = useState<BoardScope>(initialScope);
  const board = useMemo(
    () =>
      classifySessionBoard({
        rows,
        busyIds,
        approvalIds,
        unseenIds,
        scope,
        projectCwd: cwd,
      }),
    [approvalIds, busyIds, cwd, rows, scope, unseenIds],
  );

  return (
    <div
      role="region"
      aria-label={t("Kanban")}
      data-app-kanban
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
          <span className="font-medium">{t("Kanban")}</span>
          <span className="text-content/40">
            {t("{count} sessions", { count: board.cards.length })}
          </span>
          <div
            role="group"
            aria-label={t("Board scope")}
            className="ml-auto flex items-center rounded-md border border-content/10 bg-content/[0.03] p-0.5"
          >
            {(["project", "all"] as BoardScope[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scope === option}
                onClick={() => setScope(option)}
                className={`rounded px-2.5 py-1 text-[11px] leading-none ${
                  scope === option
                    ? "bg-content/10 text-content"
                    : "text-content/45 hover:text-content/70"
                }`}
              >
                {option === "project" ? t("Current project") : t("All projects")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-none px-3 py-3">
        <div className="flex h-full min-h-0 items-stretch gap-3">
          {BOARD_COLUMNS.map((column) => (
            <section
              key={column}
              data-kanban-column={column}
              aria-label={t(COLUMN_LABELS[column])}
              className="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border border-content/10 bg-content/[0.03]"
            >
              <header className="flex h-9 shrink-0 items-center gap-2 border-b border-content/10 px-3">
                <span className={`size-1.5 rounded-full ${COLUMN_DOTS[column]}`} />
                <span className="text-[12px] font-medium">
                  {t(COLUMN_LABELS[column])}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-content/40">
                  {board.counts[column]}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-none p-2">
                {board.columns[column].length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-content/35">
                    {t("No sessions here")}
                  </p>
                ) : (
                  board.columns[column].map((card) => (
                    <KanbanCard
                      key={card.session.id}
                      card={card}
                      showProject={scope === "all"}
                      now={now}
                      onOpen={() => onOpenSession(card.session.id)}
                      onArchive={() => onArchiveSession(card.session.id, true)}
                      onUnarchive={() => onArchiveSession(card.session.id, false)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanCard({
  card,
  showProject,
  now,
  onOpen,
  onArchive,
  onUnarchive,
}: {
  card: BoardCard;
  showProject: boolean;
  now: number;
  onOpen: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const { session, needsYouReason, column } = card;
  return (
    <div
      data-kanban-card={session.id}
      className="group relative rounded-md border border-content/10 bg-background-base/60 p-2"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("Open {title}", { title: session.title })}
        className="flex w-full min-w-0 flex-col gap-1.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {column === "working" ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-sky-400" strokeWidth={1.75} />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[12px] text-content">
            {session.title}
          </span>
          {session.pinned ? (
            <Pin className="size-3 shrink-0 text-content/40" strokeWidth={1.75} />
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-content/45">
          <HarnessIcon harness={session.harness} className="size-3 shrink-0" />
          {showProject ? (
            <span className="truncate">{projectName(session.cwd)}</span>
          ) : null}
          {session.repo || session.branch ? (
            <span className="min-w-0 truncate">
              {[session.repo, session.branch].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 tabular-nums">
            {formatCardTime(session.updatedAt, now)}
          </span>
        </span>
        {needsYouReason ? (
          <span
            className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] ${
              needsYouReason === "waiting"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {needsYouReason === "waiting" ? t("Waiting for you") : t("Finished")}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        data-no-drag
        aria-label={
          column === "archived"
            ? t("Unarchive {title}", { title: session.title })
            : t("Archive {title}", { title: session.title })
        }
        onClick={column === "archived" ? onUnarchive : onArchive}
        className="absolute top-1.5 right-1.5 hidden rounded border border-content/10 bg-background-base px-1.5 py-0.5 text-[10px] text-content/60 hover:text-content group-hover:block group-focus-within:block"
      >
        {column === "archived" ? t("Unarchive") : t("Archive")}
      </button>
    </div>
  );
}

function formatCardTime(updatedAt: number, now: number): string {
  const delta = Math.round((updatedAt - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let value = delta;
  for (const [unit, span] of units) {
    if (Math.abs(value) < span) return formatter.format(Math.round(value), unit);
    value /= span;
  }
  return "";
}
