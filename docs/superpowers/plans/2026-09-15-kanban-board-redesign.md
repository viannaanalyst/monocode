# Kanban board redesign — implementation plan

Reference: `docs/superpowers/specs/2026-09-15-kanban-board-redesign-design.md`

## Architecture

`src/surfaces/KanbanView.tsx` is self-contained: the board, the columns and the card live in that one file, with drag helpers in `src/lib/kanbanDrag.ts` and classification in `src/lib/sessionBoard.ts`. The redesign touches only the render of `KanbanView` and `KanbanCard`, adds two i18n keys, and updates the surface test — no lib, drag, or classification changes.

## Task 1: Rebuild the columns and cards

**Files:** `src/surfaces/KanbanView.tsx`, `src/surfaces/KanbanView.test.ts`, `src/i18n/pt-BR.ts`

1. Column: remove the border/background/header-border box; header becomes dot + `text-sm font-semibold` title + tinted count badge (`h-5 min-w-5 rounded-md px-1 text-2xs font-medium tabular-nums`) that gains `ring-1 ring-accent/60` while the column is the drop target.
2. Card: status pill row with the hover `…` menu (`ExplorerMenu`: Open / Archive / Unarchive), title row with the pin glyph, meta line (project in all-projects scope, then `repo · branch`), dashed divider, footer with `HarnessIcon` + `HARNESS_LABEL` + relative time.
3. Add the "Idle session" / "Archived session" pt-BR keys.
4. Tests: keep the existing four cases green and add the pill and menu-label assertions.

**Verification:** `npx vitest run src/surfaces/KanbanView.test.ts src/typography.test.ts`; `npm run check:web`; then the app build for the human visual pass.
