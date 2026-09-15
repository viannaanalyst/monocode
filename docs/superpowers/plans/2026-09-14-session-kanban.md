# Session Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen Kanban board where session cards sit in automatic columns (Working / Needs you / Idle / Archived) and archiving/unarchiving happens by drag or card action.

**Architecture:** A pure classifier (`src/lib/sessionBoard.ts`) turns the canonical session list plus live signal sets into four sorted columns. A new surface (`src/surfaces/KanbanView.tsx`) renders them, wired into the existing App surface pattern and opened from a rail action below Inbox and from the View menu. Drag reuses the pointer-gesture pattern from the sidebar session card (`startDragGhost` + hit-testing) with a pure drop-decision helper (`src/lib/kanbanDrag.ts`). No schema or persistence changes: archiving already exists.

**Tech Stack:** React + TypeScript, vitest (with `happy-dom` where DOM is needed), existing `RailAction`/`OverlayNav`/`HarnessIcon` primitives, existing `onArchiveHistorySession` callback.

## Global Constraints

- No new dependencies and no schema/persistence changes; archive/unarchive goes through the existing `onArchiveHistorySession` callback.
- English strings are the i18n keys; add pt-BR entries in `src/i18n/pt-BR.ts` for every new user-facing string.
- Board rows come from the canonical merged list (`allProjectsHistoryWithLiveSessions` via `sidebarHistory`), which already excludes `inboxAsk` sessions and orchestration workers.
- Project path comparisons use `sameProjectPath` from `src/lib/recents`.
- Column precedence is `archived → working → needs_you → idle`; within a column use `compareSessionSummaries`.
- The scope toggle is view state only and is not persisted.
- Commit messages follow the repo style: imperative sentence ending with a period.
- Run `npx vitest run <file>` while iterating and `npm run check:web` before considering the phase done.

---

### Task 1: Board classifier (`sessionBoard.ts`)

**Files:**
- Create: `src/lib/sessionBoard.ts`
- Create: `src/lib/sessionBoard.test.ts`

**Interfaces:**
- Consumes: `SessionSummary` (`src/lib/sessionStore.ts:30`), `compareSessionSummaries` (`src/lib/sessionHistory.ts:18`), `sameProjectPath` (`src/lib/recents`).
- Produces (used by Tasks 3-5): `BoardColumn`, `BoardScope`, `NeedsYouReason`, `BoardCard`, `SessionBoard`, `BOARD_COLUMNS`, `classifySessionBoard(input)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sessionBoard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifySessionBoard } from "./sessionBoard";
import type { SessionSummary } from "./sessionStore";

function row(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    cwd: "/tmp/web",
    harness: "cursor",
    model: "auto",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const none = new Set<string>();

describe("classifySessionBoard", () => {
  it("puts archived rows in the archived column even when busy", () => {
    const board = classifySessionBoard({
      rows: [row("a", { archived: true })],
      busyIds: new Set(["a"]),
      approvalIds: none,
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.archived.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.columns.working).toEqual([]);
  });

  it("prefers working over needs-you and idle", () => {
    const board = classifySessionBoard({
      rows: [row("a"), row("b")],
      busyIds: new Set(["a"]),
      approvalIds: new Set(["a", "b"]),
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.working.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.columns.needs_you.map((card) => card.session.id)).toEqual(["b"]);
    expect(board.columns.needs_you[0]?.needsYouReason).toBe("waiting");
  });

  it("labels unseen finished sessions as finished", () => {
    const board = classifySessionBoard({
      rows: [row("a")],
      busyIds: none,
      approvalIds: none,
      unseenIds: new Set(["a"]),
      scope: "all",
    });
    expect(board.columns.needs_you[0]?.needsYouReason).toBe("finished");
  });

  it("filters to the current project when scope is project", () => {
    const board = classifySessionBoard({
      rows: [row("a"), row("b", { cwd: "/tmp/other" })],
      busyIds: none,
      approvalIds: none,
      unseenIds: none,
      scope: "project",
      projectCwd: "/tmp/web",
    });
    expect(board.columns.idle.map((card) => card.session.id)).toEqual(["a"]);
    expect(board.counts.idle).toBe(1);
  });

  it("sorts pinned first then by recency", () => {
    const board = classifySessionBoard({
      rows: [
        row("old", { updatedAt: 1 }),
        row("new", { updatedAt: 5 }),
        row("pinned", { updatedAt: 2, pinned: true }),
      ],
      busyIds: none,
      approvalIds: none,
      unseenIds: none,
      scope: "all",
    });
    expect(board.columns.idle.map((card) => card.session.id)).toEqual([
      "pinned",
      "new",
      "old",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sessionBoard.test.ts`
Expected: FAIL with `Cannot find module './sessionBoard'`.

- [ ] **Step 3: Implement `sessionBoard.ts`**

```ts
import { sameProjectPath } from "./recents";
import { compareSessionSummaries } from "./sessionHistory";
import type { SessionSummary } from "./sessionStore";

export type BoardColumn = "working" | "needs_you" | "idle" | "archived";
export type BoardScope = "project" | "all";
export type NeedsYouReason = "waiting" | "finished";

export type BoardCard = {
  session: SessionSummary;
  column: BoardColumn;
  needsYouReason?: NeedsYouReason;
};

export type SessionBoard = {
  cards: BoardCard[];
  columns: Record<BoardColumn, BoardCard[]>;
  counts: Record<BoardColumn, number>;
};

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  "working",
  "needs_you",
  "idle",
  "archived",
];

export function classifySessionBoard(input: {
  rows: readonly SessionSummary[];
  busyIds: ReadonlySet<string>;
  approvalIds: ReadonlySet<string>;
  unseenIds: ReadonlySet<string>;
  scope: BoardScope;
  projectCwd?: string;
}): SessionBoard {
  const { rows, busyIds, approvalIds, unseenIds, scope, projectCwd } = input;
  const columns: Record<BoardColumn, BoardCard[]> = {
    working: [],
    needs_you: [],
    idle: [],
    archived: [],
  };
  const cards: BoardCard[] = [];
  for (const session of rows) {
    if (
      scope === "project" &&
      projectCwd &&
      !sameProjectPath(session.cwd, projectCwd)
    ) {
      continue;
    }
    const card: BoardCard = {
      session,
      ...columnForSession(session, busyIds, approvalIds, unseenIds),
    };
    cards.push(card);
    columns[card.column].push(card);
  }
  for (const column of BOARD_COLUMNS) {
    columns[column].sort((a, b) =>
      compareSessionSummaries(a.session, b.session),
    );
  }
  return {
    cards,
    columns,
    counts: {
      working: columns.working.length,
      needs_you: columns.needs_you.length,
      idle: columns.idle.length,
      archived: columns.archived.length,
    },
  };
}

function columnForSession(
  session: SessionSummary,
  busyIds: ReadonlySet<string>,
  approvalIds: ReadonlySet<string>,
  unseenIds: ReadonlySet<string>,
): { column: BoardColumn; needsYouReason?: NeedsYouReason } {
  if (session.archived) return { column: "archived" };
  if (busyIds.has(session.id)) return { column: "working" };
  if (approvalIds.has(session.id)) {
    return { column: "needs_you", needsYouReason: "waiting" };
  }
  if (unseenIds.has(session.id)) {
    return { column: "needs_you", needsYouReason: "finished" };
  }
  return { column: "idle" };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/sessionBoard.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionBoard.ts src/lib/sessionBoard.test.ts
git commit -m "Add session board classifier."
```

---

### Task 2: Drop-target helpers (`kanbanDrag.ts`)

**Files:**
- Create: `src/lib/kanbanDrag.ts`
- Create: `src/lib/kanbanDrag.test.ts`

**Interfaces:**
- Consumes: `BoardColumn` from Task 1.
- Produces (used by Task 4): `kanbanColumnFromPoint(x, y, hitTest?)` and `boardDropOutcome(archived, column)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kanbanDrag.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { boardDropOutcome, kanbanColumnFromPoint } from "./kanbanDrag";

describe("kanbanColumnFromPoint", () => {
  it("reads the data attribute from the closest column element", () => {
    const column = document.createElement("div");
    column.setAttribute("data-kanban-column", "archived");
    const card = document.createElement("div");
    column.appendChild(card);
    expect(kanbanColumnFromPoint(1, 1, () => card)).toBe("archived");
  });

  it("returns null outside a column or for unknown values", () => {
    expect(kanbanColumnFromPoint(1, 1, () => null)).toBeNull();
    const stray = document.createElement("div");
    stray.setAttribute("data-kanban-column", "nope");
    expect(kanbanColumnFromPoint(1, 1, () => stray)).toBeNull();
  });
});

describe("boardDropOutcome", () => {
  it("archives when moving an active card onto archived", () => {
    expect(boardDropOutcome(false, "archived")).toBe("archive");
  });

  it("unarchives when moving an archived card anywhere else", () => {
    expect(boardDropOutcome(true, "idle")).toBe("unarchive");
    expect(boardDropOutcome(true, "working")).toBe("unarchive");
    expect(boardDropOutcome(true, "needs_you")).toBe("unarchive");
  });

  it("does nothing for same-column drops or drops outside a column", () => {
    expect(boardDropOutcome(true, "archived")).toBeNull();
    expect(boardDropOutcome(false, "idle")).toBeNull();
    expect(boardDropOutcome(false, null)).toBeNull();
    expect(boardDropOutcome(true, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/kanbanDrag.test.ts`
Expected: FAIL with `Cannot find module './kanbanDrag'`.

- [ ] **Step 3: Implement `kanbanDrag.ts`**

```ts
import { BOARD_COLUMNS, type BoardColumn } from "./sessionBoard";

export function kanbanColumnFromPoint(
  x: number,
  y: number,
  hitTest: (x: number, y: number) => Element | null = (px, py) =>
    document.elementFromPoint(px, py),
): BoardColumn | null {
  const element = hitTest(x, y);
  const column = element?.closest?.("[data-kanban-column]") ?? null;
  const value = column?.getAttribute("data-kanban-column") ?? "";
  return BOARD_COLUMNS.find((candidate) => candidate === value) ?? null;
}

/** The archive transition a drop implies, or null when nothing changes. */
export function boardDropOutcome(
  archived: boolean,
  column: BoardColumn | null,
): "archive" | "unarchive" | null {
  if (!column) return null;
  if (archived) return column === "archived" ? null : "unarchive";
  return column === "archived" ? "archive" : null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/kanbanDrag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kanbanDrag.ts src/lib/kanbanDrag.test.ts
git commit -m "Add Kanban drop-target helpers."
```

---

### Task 3: Kanban surface UI (`KanbanView.tsx`)

**Files:**
- Create: `src/surfaces/KanbanView.tsx`
- Create: `src/surfaces/KanbanView.test.ts`

**Interfaces:**
- Consumes: `classifySessionBoard`, `BoardCard`, `BoardColumn`, `BoardScope` from Task 1; `OverlayNav` (`src/chrome/TitleBar.tsx:280`); `HarnessIcon` (`src/chrome/HarnessIcon.tsx:55`); `LayoutTwoColumn`, `Pin` from `src/chrome/icons`; `projectName` (`src/lib/paths.ts:200`); `IS_MAC` (`src/lib/platform`).
- Produces (used by Tasks 4-5): `KanbanView` with `Props` below. Task 4 adds drag props to the same component; Task 5 passes them from `App`.

- [ ] **Step 1: Write the failing test**

Create `src/surfaces/KanbanView.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KanbanView } from "./KanbanView";
import type { SessionSummary } from "../lib/sessionStore";

function row(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    cwd: "/tmp/web",
    harness: "cursor",
    model: "auto",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function render(
  props: Partial<Parameters<typeof KanbanView>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(KanbanView, {
      cwd: "/tmp/web",
      rows: [],
      busyIds: new Set<string>(),
      approvalIds: new Set<string>(),
      unseenIds: new Set<string>(),
      now: 1_700_000_060_000,
      onClose: () => {},
      onOpenSession: () => {},
      onArchiveSession: () => {},
      ...props,
    }),
  );
}

describe("KanbanView", () => {
  it("renders the four columns with counts and empty hints", () => {
    const markup = render();
    expect(markup).toContain("Working");
    expect(markup).toContain("Needs you");
    expect(markup).toContain("Idle");
    expect(markup).toContain("Archived");
    expect(markup).toContain("No sessions here");
  });

  it("renders a working card with a spinner and a waiting card with its badge", () => {
    const markup = render({
      rows: [row("busy"), row("waiting", { updatedAt: 1_700_000_030_000 })],
      busyIds: new Set(["busy"]),
      approvalIds: new Set(["waiting"]),
    });
    expect(markup).toContain("busy");
    expect(markup).toContain("waiting");
    expect(markup).toContain("Waiting for you");
    expect(markup).toContain("animate-spin");
  });

  it("renders a finished badge for unseen finished sessions", () => {
    const markup = render({
      rows: [row("done")],
      unseenIds: new Set(["done"]),
    });
    expect(markup).toContain("Finished");
  });

  it("shows project names only in the all-projects scope", () => {
    const rows = [row("a")];
    expect(render({ rows })).not.toContain(">web<");
    const all = render({ rows, initialScope: "all" });
    expect(all).toContain(">web<");
    expect(all).toContain("All projects");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/surfaces/KanbanView.test.ts`
Expected: FAIL with `Cannot find module './KanbanView'`.

- [ ] **Step 3: Implement `KanbanView.tsx`**

```tsx
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
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
        {IS_MAC ? null : <WindowControls />}
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
```

The card action button appears on hover and keyboard focus (`group-hover:block group-focus-within:block`); keep `data-no-drag` on it so a drag never starts from the archive control.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/surfaces/KanbanView.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/surfaces/KanbanView.tsx src/surfaces/KanbanView.test.ts
git commit -m "Add Kanban board surface."
```

---

### Task 4: Drag-to-archive gesture

**Files:**
- Modify: `src/surfaces/KanbanView.tsx`
- Test: `src/lib/kanbanDrag.test.ts` already covers the decision helpers from Task 2

**Interfaces:**
- Consumes: `kanbanColumnFromPoint`, `boardDropOutcome` from Task 2; `startDragGhost`, `type DragGhost` (`src/lib/dragGhost`); `setGrabbing`, `suppressTextSelection` (`src/lib/drag`).
- Produces: card drag wiring inside `KanbanView`; no new exports.

- [ ] **Step 1: Add drag state and gesture to `KanbanView`**

At the top of the component (after `const [scope, ...]`):

```tsx
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<BoardColumn | null>(null);
  const skipClickUntil = useRef(0);

  const onCardPointerDown = useCallback(
    (session: SessionSummary, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let ghost: DragGhost | null = null;
      let lastColumn: BoardColumn | null = null;
      let lastX = startX;
      let lastY = startY;
      handle.setPointerCapture(pointerId);
      const restoreSelection = suppressTextSelection();

      const onMove = (moveEvent: PointerEvent) => {
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        if (!active) {
          if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
          active = true;
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
```

Add the imports:

```tsx
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { setGrabbing, suppressTextSelection } from "../lib/drag";
import { startDragGhost, type DragGhost } from "../lib/dragGhost";
import { boardDropOutcome, kanbanColumnFromPoint } from "../lib/kanbanDrag";
```

Pass drag props into the card:

```tsx
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
                      onArchive={() => onArchiveSession(card.session.id, true)}
                      onUnarchive={() => onArchiveSession(card.session.id, false)}
                    />
```

- [ ] **Step 2: Extend `KanbanCard` with the drag props**

Add to its props type and destructuring: `dragging: boolean; dropTarget: boolean; onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;`.

Apply the handlers and highlight on the wrapper:

```tsx
    <div
      data-kanban-card={session.id}
      onPointerDown={onPointerDown}
      className={`group relative rounded-md border p-2 ${
        dragging
          ? "opacity-40"
          : dropTarget
            ? "border-accent/60 bg-accent/5"
            : "border-content/10 bg-background-base/60"
      }`}
    >
```

- [ ] **Step 3: Test and typecheck**

Run: `npx vitest run src/surfaces/KanbanView.test.ts src/lib/kanbanDrag.test.ts && npx tsc --noEmit`
Expected: PASS. The pointer gesture itself is verified manually in Task 7: drag a card onto Archived archives it, drag it back out unarchives it, Escape cancels, and a plain click still opens the session.

- [ ] **Step 4: Commit**

```bash
git add src/surfaces/KanbanView.tsx
git commit -m "Add drag-to-archive on the Kanban board."
```

---

### Task 5: App surface wiring and rail action

**Files:**
- Modify: `src/App.tsx` (surface flags, openers, render, hidden/inert condition, back handling, actions ref)
- Modify: `src/chrome/ProjectRail.tsx` (rail action below Inbox)
- Modify: `src/chrome/Sidebar.tsx` (forward the new props)
- Create: `src/chrome/ProjectRail.test.ts`

**Interfaces:**
- Consumes: `KanbanView` from Tasks 3-4; `sidebarHistory`, `busySessionIds`, `approvalSessionIds`, `unseenFinishedIds`, `onArchiveHistorySession` in `App`.
- Produces: `onOpenKanban`/`onLeaveKanban` in `App`; `onOpenKanban` and `kanbanActive` props on `ProjectRail` and `Sidebar`.

- [ ] **Step 1: Write the failing rail test**

Create `src/chrome/ProjectRail.test.ts`:

```ts
// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectRail } from "./ProjectRail";

describe("ProjectRail board entry", () => {
  it("renders the Kanban action below Inbox when wired", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onOpenInbox: () => {},
        onOpenKanban: () => {},
      }),
    );
    const inbox = markup.indexOf("Inbox");
    const kanban = markup.indexOf("Kanban");
    expect(kanban).toBeGreaterThan(inbox);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/ProjectRail.test.ts`
Expected: FAIL because `onOpenKanban` is not a known prop / the label is absent.

- [ ] **Step 3: Wire the rail action**

In `src/chrome/ProjectRail.tsx`:

1. Add `LayoutTwoColumn` to the icons import (alphabetical, after `Inbox`):

```tsx
  Inbox,
  LayoutTwoColumn,
  MoreHorizontal,
```

2. Add to `Props` after `inboxActive`:

```tsx
  onOpenKanban?: () => void;
  kanbanActive?: boolean;
```

3. Destructure `onOpenKanban` and `kanbanActive = false` next to `inboxActive`.

4. Render the second action directly below Inbox in the top stack (`ProjectRail.tsx:432-441`):

```tsx
          <div className="flex shrink-0 flex-col gap-px px-2 pb-2 pt-0.5">
            {onOpenInbox ? (
              <RailAction
                label={t("Inbox")}
                icon={Inbox}
                onClick={onOpenInbox}
                ariaLabel={inboxUnseen ? t("Inbox, new items") : t("Inbox")}
              />
            ) : null}
            {onOpenKanban ? (
              <RailAction
                label={t("Kanban")}
                icon={LayoutTwoColumn}
                active={kanbanActive}
                onClick={onOpenKanban}
              />
            ) : null}
          </div>
```

In `src/chrome/Sidebar.tsx`, forward the props next to the Inbox ones (`Sidebar.tsx:1691-1692`):

```tsx
          onOpenKanban={onOpenKanban}
          kanbanActive={kanbanActive}
```

- [ ] **Step 4: Wire the surface in `src/App.tsx`**

1. Import `KanbanView` next to `NotesView` (`App.tsx:408`).

2. Add state next to the other surface flags (`App.tsx:859-866`):

```tsx
  const [kanbanViewOpen, setKanbanViewOpen] = useState(false);
```

3. Add `setKanbanViewOpen(false)` to every opener that clears surfaces (`onGoToFile`, `onFindInProject`, `onOpenSearch`, `onOpenInbox`, `onOpenLinkedWorkItem`, `onOpenNotes`, `openSettings`, `onRailForward`), and clear the other surfaces in the new opener:

```tsx
  const onOpenKanban = useCallback(() => {
    setFilePickerOpen(false);
    setSettingsOpen(false);
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setKanbanViewOpen(true);
  }, []);

  const onLeaveKanban = useCallback(() => {
    setKanbanViewOpen(false);
  }, []);

  const onOpenKanbanSession = useCallback(
    (sessionId: string) => {
      setKanbanViewOpen(false);
      setSidebarTab("sessions");
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );
```

4. `onRailBack`: add the branch before `onVisitBack()` and to the deps:

```tsx
    if (kanbanViewOpen) {
      setKanbanViewOpen(false);
      return;
    }
```

5. `canGoBack` (`App.tsx:7248`): add `kanbanViewOpen`.

6. Hidden/inert condition (`App.tsx:7305-7319`): include `kanbanViewOpen` in all three expressions.

7. Render the surface after the Inbox block (`App.tsx:7723-7739`):

```tsx
            {kanbanViewOpen ? (
              <KanbanView
                cwd={sidebarCwd}
                rows={sidebarHistory}
                busyIds={busySessionIds}
                approvalIds={approvalSessionIds}
                unseenIds={unseenFinishedIds}
                besideRail={projectRailOpen}
                onClose={onLeaveKanban}
                onToggleSidebar={onToggleSidebar}
                onOpenSession={onOpenKanbanSession}
                onArchiveSession={onArchiveHistorySession}
              />
            ) : null}
```

8. Add `onOpenKanban` to both `actions` ref objects (`App.tsx:6828-6883`) and wire the rail props in the `Sidebar` render (`App.tsx:7281-7291`):

```tsx
            onOpenKanban={onOpenKanban}
            kanbanActive={kanbanViewOpen}
```

- [ ] **Step 5: Test and typecheck**

Run: `npx vitest run src/chrome/ProjectRail.test.ts src/surfaces/KanbanView.test.ts && npx tsc --noEmit`
Expected: PASS. `Sidebar`'s new props are optional, so no other call site needs changes; `tsc` catches any missed prop forwarding.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/chrome/ProjectRail.tsx src/chrome/ProjectRail.test.ts src/chrome/Sidebar.tsx
git commit -m "Wire the Kanban surface into the app and rail."
```

---

### Task 6: Menu entries (web and native)

**Files:**
- Modify: `src/chrome/MenuBar.tsx` (View items + pick handling + prop)
- Modify: `src-tauri/src/menu.rs` (menu item, View submenu, dispatch allowlist, `tr` map)
- Modify: `src/App.tsx` (menu listener + MenuBar prop)

**Interfaces:**
- Consumes: `onOpenKanban` from Task 5.
- Produces: `open_kanban` menu id handled on both menus; no new exports.

- [ ] **Step 1: Add the web menu item**

In `src/chrome/MenuBar.tsx`:

1. Add `onOpenKanban?: () => void;` to `Props` and destructure it.
2. Add the case near `open_notes` in `handlePick`:

```tsx
        case "open_kanban":
          onOpenKanban?.();
          break;
```

3. Add the item to the `view` list after the Notes entry:

```tsx
          { kind: "item", id: "open_kanban", label: t("Kanban") },
```

- [ ] **Step 2: Add the native menu item**

In `src-tauri/src/menu.rs`:

1. Add to the `tr` match:

```rust
        "Kanban" => "Kanban",
```

2. Build the item next to `open_notes` (`menu.rs:141-142`):

```rust
    let open_kanban = MenuItemBuilder::with_id("open_kanban", tr("Kanban")).build(app)?;
```

3. Add it to the View submenu after `.item(&open_notes)` (`menu.rs:240-257`):

```rust
        .item(&open_kanban)
```

4. Add `"open_kanban"` to the dispatch allowlist array (`menu.rs:82-91`).

- [ ] **Step 3: Listen in the app**

In `src/App.tsx`, add next to the other listeners (`App.tsx:7106-7113`):

```tsx
      listen("open_kanban", () => actions.current.onOpenKanban()),
```

and pass `onOpenKanban={onOpenKanban}` to `<MenuBar>` (`App.tsx:7321+`).

- [ ] **Step 4: Test and check**

Run: `npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: clean. Manual check in Task 7: the item appears in the View menu on both platforms and opens the board.

- [ ] **Step 5: Commit**

```bash
git add src/chrome/MenuBar.tsx src-tauri/src/menu.rs src/App.tsx
git commit -m "Add Kanban menu entries."
```

---

### Task 7: i18n, full checks, and manual verification

**Files:**
- Modify: `src/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: every new English string from Tasks 3-6.
- Produces: pt-BR translations; a green `npm run check:web` and `npm run check:rust`.

- [ ] **Step 1: Add pt-BR entries**

Add entries in `src/i18n/pt-BR.ts` for: `Kanban`, `{count} sessions`, `Board scope`, `Current project`, `All projects`, `Working`, `Needs you`, `Idle`, `Archived`, `Waiting for you`, `Finished`, `No sessions here`, `Open {title}`, `Archive {title}`, `Unarchive {title}`, and confirm `Archive`/`Unarchive` already exist (they are used by the sidebar).

- [ ] **Step 2: Run the full web suite**

Run: `npm run check:web`
Expected: all vitest files pass and `tsc --noEmit` is clean.

- [ ] **Step 3: Run the Rust checks**

Run: `npm run check:rust`
Expected: fmt clean, clippy clean, all tests pass.

- [ ] **Step 4: Manual verification**

With the app in dev mode:

1. Open the board from the rail (below Inbox) and from View → Kanban; the rail action shows as active while the board is open.
2. Start a turn in a session and watch its card move to Working with a spinner; let it finish unfocused and see it move to Needs you with the "Finished" badge.
3. Trigger an approval or question and confirm the card shows "Waiting for you".
4. Click a card: the board closes and the session opens.
5. Drag an active card onto Archived; confirm it archives and the card moves; drag it back out to unarchive.
6. Press Escape mid-drag to cancel, and confirm a plain click still opens the session after a drag.
7. Toggle "All projects" and confirm project names appear and cards from other projects show up.
8. Restart the app and confirm archived sessions remain in the Archived column.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/pt-BR.ts
git commit -m "Translate the Kanban board."
```

---

## Self-review notes

- Spec coverage: automatic columns and precedence (Task 1), needs-you reasons (Task 1), scope toggle (Task 3), surface lifecycle and back handling (Task 5), rail entry below Inbox (Task 5), web + native menu (Task 6), card content and click behavior (Task 3), hover archive/unarchive (Task 3), drag archive/unarchive with Escape and click suppression (Task 4), i18n and manual verification (Task 7).
- Deliberate deviation from the spec's first draft, already reflected in the committed spec: there is no board-level error line; archive failures keep the app's existing native dialog and the card does not change until `history` updates.
- Type consistency: `BoardColumn`, `BoardScope`, `BoardCard`, `classifySessionBoard`, `kanbanColumnFromPoint`, `boardDropOutcome`, and the `KanbanView` prop names are identical across Tasks 1-6.
