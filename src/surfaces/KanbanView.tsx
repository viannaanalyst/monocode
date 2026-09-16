import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
import { ExplorerMenu } from "../chrome/ExplorerMenu";
import {
  Archive,
  Check,
  Clock,
  LayoutTwoColumn,
  LoaderCircle,
  MoreHorizontal,
  Pin,
} from "../chrome/icons";
import { t } from "../i18n";
import { setGrabbing, suppressTextSelection } from "../lib/drag";
import { startDragGhost, type DragGhost } from "../lib/dragGhost";
import { boardDropOutcome, kanbanColumnFromPoint } from "../lib/kanbanDrag";
import { ModelBrandIcon } from "../chrome/ModelBrandIcon";
import { resolveModel } from "../lib/models";
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

const COLUMN_BADGES: Record<BoardColumn, string> = {
  working: "bg-sky-500/15 text-sky-300",
  needs_you: "bg-amber-500/15 text-amber-300",
  idle: "bg-content/10 text-content/55",
  archived: "bg-content/10 text-content/55",
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<BoardColumn | null>(null);
  const [cardMenu, setCardMenu] = useState<{
    x: number;
    y: number;
    card: BoardCard;
  } | null>(null);
  const skipClickUntil = useRef(0);

  const onCardPointerDown = useCallback(
    (session: SessionSummary, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest?.("[data-no-drag]")) return;
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let ghost: DragGhost | null = null;
      let lastColumn: BoardColumn | null = null;
      let lastX = startX;
      let lastY = startY;
      const restoreSelection = suppressTextSelection();

      const onMove = (moveEvent: PointerEvent) => {
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        if (!active) {
          if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
          active = true;
          // Capture only once the drag is real, so a plain click keeps
          // targeting the card's inner button.
          try {
            handle.setPointerCapture(pointerId);
          } catch {
            /* capture unsupported */
          }
          setGrabbing(true);
          setDraggingId(session.id);
          ghost = startDragGhost(handle, lastX, lastY);
        }
        ghost?.move(lastX, lastY);
        const column = kanbanColumnFromPoint(lastX, lastY);
        if (column !== lastColumn) {
          lastColumn = column;
          setDropColumn(column);
        }
      };

      const finish = (commit: boolean) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("keydown", onKey);
        restoreSelection();
        setGrabbing(false);
        setDraggingId(null);
        setDropColumn(null);
        ghost?.end();
        ghost = null;
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        if (!active) return;
        skipClickUntil.current = performance.now() + 400;
        if (!commit) return;
        const outcome = boardDropOutcome(!!session.archived, lastColumn);
        if (outcome === "archive") onArchiveSession(session.id, true);
        if (outcome === "unarchive") onArchiveSession(session.id, false);
      };

      const onUp = () => finish(true);
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        finish(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("keydown", onKey);
    },
    [onArchiveSession],
  );

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
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm">
          <LayoutTwoColumn className="size-3.5 shrink-0 text-content/45" strokeWidth={1.75} />
          <span className="font-display text-display text-content">{t("Kanban")}</span>
          <span className="text-xs text-content/40">
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
                className={`rounded px-2.5 py-1 text-xs leading-none ${
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
        {IS_MAC ? null : <WindowControls />}
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-none px-3 py-3">
        <div className="flex h-full min-h-0 items-stretch gap-3">
          {BOARD_COLUMNS.map((column) => (
            <section
              key={column}
              data-kanban-column={column}
              aria-label={t(COLUMN_LABELS[column])}
              className="flex h-full min-h-0 w-72 shrink-0 flex-col"
            >
              <header className="flex h-8 shrink-0 items-center gap-2 px-0.5">
                <span className={`size-1.5 rounded-full ${COLUMN_DOTS[column]}`} />
                <span className="text-sm font-semibold">
                  {t(COLUMN_LABELS[column])}
                </span>
                <span
                  className={`ml-auto grid h-5 min-w-5 place-items-center rounded-md px-1 text-2xs font-medium tabular-nums ${COLUMN_BADGES[column]} ${
                    dropColumn === column ? "ring-1 ring-accent/60" : ""
                  }`}
                >
                  {board.counts[column]}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-none px-0.5 pb-2 pt-2.5">
                {board.columns[column].length === 0 ? (
                  <p className="px-1 py-2 text-xs text-content/35">
                    {t("No sessions here")}
                  </p>
                ) : (
                  board.columns[column].map((card) => (
                    <KanbanCard
                      key={card.session.id}
                      card={card}
                      showProject={scope === "all"}
                      now={now}
                      dragging={draggingId === card.session.id}
                      dropTarget={dropColumn === card.column}
                      onPointerDown={(event) => onCardPointerDown(card.session, event)}
                      onOpen={() => {
                        if (performance.now() < skipClickUntil.current) return;
                        onOpenSession(card.session.id);
                      }}
                      onMenu={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setCardMenu({
                          x: rect.left,
                          y: rect.bottom + 4,
                          card,
                        });
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      {cardMenu ? (
        <ExplorerMenu
          x={cardMenu.x}
          y={cardMenu.y}
          ariaLabel={t("{name} menu", { name: cardMenu.card.session.title })}
          items={[
            { kind: "item", id: "open", label: t("Open") },
            { kind: "sep" },
            cardMenu.card.column === "archived"
              ? { kind: "item", id: "unarchive", label: t("Unarchive") }
              : { kind: "item", id: "archive", label: t("Archive") },
          ]}
          onPick={(id) => {
            if (id === "open") onOpenSession(cardMenu.card.session.id);
            if (id === "archive") onArchiveSession(cardMenu.card.session.id, true);
            if (id === "unarchive") onArchiveSession(cardMenu.card.session.id, false);
            setCardMenu(null);
          }}
          onClose={() => setCardMenu(null)}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ card }: { card: BoardCard }) {
  const { column, needsYouReason } = card;
  if (column === "working") {
    return (
      <Pill className="bg-sky-500/15 text-sky-300">
        <LoaderCircle className="size-3 shrink-0 animate-spin" strokeWidth={2} />
        {t("Working")}
      </Pill>
    );
  }
  if (column === "needs_you") {
    return needsYouReason === "finished" ? (
      <Pill className="bg-emerald-500/15 text-emerald-300">
        <Check className="size-3 shrink-0" strokeWidth={2.25} />
        {t("Finished")}
      </Pill>
    ) : (
      <Pill className="bg-amber-500/15 text-amber-300">
        <Clock className="size-3 shrink-0" strokeWidth={1.75} />
        {t("Waiting for you")}
      </Pill>
    );
  }
  return column === "archived" ? (
    <Pill className="bg-content/10 text-content/45">
      <Archive className="size-3 shrink-0" strokeWidth={1.75} />
      {t("Archived session")}
    </Pill>
  ) : (
    <Pill className="bg-content/10 text-content/55">
      <Clock className="size-3 shrink-0" strokeWidth={1.75} />
      {t("Idle session")}
    </Pill>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium leading-none ${className}`}
    >
      {children}
    </span>
  );
}

function KanbanCard({
  card,
  showProject,
  now,
  dragging,
  dropTarget,
  onPointerDown,
  onOpen,
  onMenu,
}: {
  card: BoardCard;
  showProject: boolean;
  now: number;
  dragging: boolean;
  dropTarget: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpen: () => void;
  onMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const { session } = card;
  const model = resolveModel(session.harness, session.model);
  const meta = [
    showProject ? projectName(session.cwd) : null,
    session.repo,
    session.branch,
  ].filter(Boolean);
  return (
    <div
      data-kanban-card={session.id}
      onPointerDown={onPointerDown}
      className={`group relative rounded-lg border p-3 ${
        dragging
          ? "opacity-40"
          : dropTarget
            ? "border-accent/50 bg-accent/[0.06]"
            : "border-content/10 bg-content/[0.04] hover:border-content/20 hover:bg-content/[0.06]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <StatusPill card={card} />
        <button
          type="button"
          data-no-drag
          data-no-tooltip
          aria-label={t("{name} menu", { name: session.title })}
          aria-haspopup="menu"
          onClick={onMenu}
          className="pointer-events-none ml-auto grid size-6 shrink-0 place-items-center rounded-md text-content/45 opacity-0 transition-opacity hover:bg-content/10 hover:text-content group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <button
        type="button"
        data-no-tooltip
        onClick={onOpen}
        aria-label={t("Open {title}", { title: session.title })}
        className="mt-1.5 flex w-full min-w-0 flex-col gap-1.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content">
            {session.title}
          </span>
          {session.pinned ? (
            <Pin className="size-3.5 shrink-0 text-content/40" strokeWidth={1.75} />
          ) : null}
        </span>
        {meta.length > 0 ? (
          <span className="min-w-0 truncate text-[12px] text-content/50">
            {meta.join(" · ")}
          </span>
        ) : null}
      </button>
      <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-content/10 pt-2 text-[12px] text-content/45">
        <ModelBrandIcon model={model} className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{model.name}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatCardTime(session.updatedAt, now)}
        </span>
      </div>
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
