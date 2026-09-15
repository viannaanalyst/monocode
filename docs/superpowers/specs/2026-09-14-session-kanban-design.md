# Session Kanban board — design

## Goal

Give sessions a live, full-screen Kanban view where columns reflect each session's real state (Working / Needs you / Idle / Archived). No manual status bookkeeping: the only user transition is archiving and unarchiving, by drag or card action.

## Scope

In scope:

- A new full-screen surface, `KanbanView`, opened from the sidebar rail directly below the Inbox action and from the View menu.
- Four automatic columns with precedence `archived → working → needs_you → idle`:
  - **Working** — sessions with a turn in flight (`busySessionIds`).
  - **Needs you** — sessions waiting on an approval or question (`approvalSessionIds`) or sessions that finished a turn while unfocused (`unseenFinishedIds`). Cards carry the reason (`waiting` or `finished`).
  - **Idle** — live or persisted sessions with none of the above.
  - **Archived** — persisted rows with `SessionSummary.archived`.
- Scope toggle: current project (default) or all projects. In all-projects mode cards show the project name.
- Click a card to open the session; hover actions to archive or unarchive.
- Drag a card to Archived to archive it, drag it out to unarchive it.
- Live updates while the board is open.

Out of scope:

- Manual statuses, manual ordering or WIP limits.
- Schema or persistence changes (archiving already exists through `session_set_archived`).
- Filters, search, and column collapse.
- Reusing or changing the sidebar's "show archived" preference: the board always shows the Archived column.

## Design

### Classification (`src/lib/sessionBoard.ts`, new)

Pure module, no React:

- `type BoardColumn = "working" | "needs_you" | "idle" | "archived"`.
- `type BoardCard = { session: SessionSummary; column: BoardColumn; needsYouReason?: "waiting" | "finished" }`.
- `classifySessionBoard({ rows, busyIds, approvalIds, unseenIds })` returns cards grouped by column plus per-column counts. Precedence: archived first (an archived row never lands in another column), then busy, then needs-you, then idle.
- Sorting inside a column uses `compareSessionSummaries` (pinned first, then `updatedAt` desc).
- Rows come from the canonical merged list (`allProjectsHistoryWithLiveSessions`), which already excludes ephemeral `inboxAsk` sessions and orchestration workers. Scope filtering (current project) compares `cwd` with `sameProjectPath`.
- Live sessions that are archived drop out of `sessions` and appear as persisted history rows, so the merged list keeps the card in the Archived column.

### Surface lifecycle (`src/App.tsx`)

Follow the existing surface pattern (Inbox/Notes):

- New `kanbanViewOpen` state plus a ref mirror.
- `onOpenKanban` clears the other surfaces (search, settings, inbox, notes) and vice versa: every existing opener also clears `kanbanViewOpen`.
- Render `KanbanView` in the center body after `<main>`, and include `kanbanViewOpen` in the condition that hides and inerts the workspace and hides `UsageFooter`.
- Include it in `canGoBack` and close it first in `onRailBack`.

### Entry points

- `src/chrome/ProjectRail.tsx`: a second `RailAction`, label `Kanban`, rendered in the top stack directly below the Inbox action. New props `onOpenKanban` and `kanbanActive`, wired from `App` through `Sidebar` like the Inbox props.
- `src/chrome/icons.tsx`: Hugeicons has no Kanban glyph; reuse the existing `LayoutTwoColumn` export for the rail and surface header.
- Menu: `open_kanban` item in the View menu for both the in-app `MenuBar` and the native macOS menu (`src-tauri/src/menu.rs`), with the usual listener in `App`.

### UI (`src/surfaces/KanbanView.tsx`, new)

- Header: title, scope toggle `Projeto atual / Todos`, and the error line when an archive call fails.
- Four columns, horizontally scrollable, each with a title, count, and a status dot; empty columns show a short hint.
- Card: title, project name (all-projects mode only), `repo/branch` label, harness icon, relative update time, and a status badge (`Aguardando você` / `Terminou` / spinner while working / pinned mark). Cards do not show diff stats: `additions`/`deletions` are always `0` from the store.
- Click a card to open the session and close the board, following the Inbox's related-session behavior (`onOpenInboxSession`: close the surface, then select the session).
- Card hover exposes archive/unarchive using the existing `onArchiveHistorySession(sessionId, archived)` callback.
- The scope toggle is view state only; it is not persisted across restarts.

### Drag and errors

- Mirror the session-card drag in `src/chrome/Sidebar.tsx`: `startDragGhost` on pointer move past a small threshold, hit-test with `document.elementFromPoint` against `[data-kanban-column]`, and suppress the click after a drop. Escape cancels.
- Dropping on Archived archives; dropping from Archived on any other column unarchives. Drops elsewhere are no-ops.
- Archive/unarchive failures set an error line at the top of the board; card state stays unchanged until the existing callback updates `history`.

## Testing and verification

- Vitest for `sessionBoard.ts`: precedence (archived beats busy, busy beats needs-you), both needs-you reasons, scope filter for current project vs all, sorting (pinned then recency), and exclusion of `inboxAsk`/orchestration workers.
- Static markup test for `KanbanView`: column titles and counts, status badges, empty-column hints, and all-projects cards showing the project name.
- Manual verification: open the board from the rail and menu, watch columns update while an agent works and finishes unfocused, click a card to open the session, archive by drag and unarchive by dragging back, confirm archived rows persist across restarts, and check the error line by simulating a failing archive.
- Run `npm run check:web` before considering the phase done.
