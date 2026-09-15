# Kanban board redesign — design

## Goal

Rebuild the Kanban surface after the Hublite Kanban Board reference the user picked: drop the full-height bordered column boxes so a column reads as a header plus floating cards, and give each card the reference's anatomy (status pill, overflow menu, title, meta line, dashed divider, footer).

## Evidence

- Hublite Kanban Board (Dribbble shot 25661958, screenshot shared 2026-09-15): columns are only a `+`, a 600-weight title and a saturated count badge; cards are white, rounded, 1px border, with small pills on top (`…` on the right), a title, an ID line, a dashed divider and a footer row.
- 21st.dev "Kanban" (TomIsLoading): shadcn component with `framer-motion` + `react-icons`, license unknown, light-only and its own drag layer. MonoCode already has drag (`lib/kanbanDrag`, `lib/dragGhost`) and its own reorder motion, so only the reference's motion language is inspiration — no code or dependency is adopted.

## Design

### Column

- `section[data-kanban-column]` keeps `w-72`, full height and drop hit-testing, but loses `rounded-lg border border-content/10 bg-content/[0.03]` and the header's `border-b`: a column is a header plus a scrolling card list on the surface background.
- Header: status dot (`size-1.5`), title `text-sm font-semibold`, and a count badge on the right (`h-5 min-w-5 rounded-md px-1 text-2xs font-medium tabular-nums`), tinted per status: working `bg-sky-500/15 text-sky-300`, needs_you `bg-amber-500/15 text-amber-300`, idle/archived `bg-content/10 text-content/55`.
- Drop feedback moves to the count badge (`ring-1 ring-accent/60`) so empty columns show a target without a container.
- The empty state stays a muted `text-xs text-content/35` line, now floating with no box.

### Card

- Container: `rounded-lg border border-content/10 bg-content/[0.04] p-3`; hover `border-content/20 bg-content/[0.06]`; drag keeps `opacity-40`; drop target `border-accent/50 bg-accent/[0.06]`.
- Row 1: status pill (`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium leading-none`) with a `size-3` icon:
  - working: LoaderCircle spinning + "Working" (`bg-sky-500/15 text-sky-300`)
  - needs_you: Clock + "Waiting for you" (amber) or Check + "Finished" (emerald)
  - idle: Clock + "Idle session" (neutral `bg-content/10 text-content/55`)
  - archived: Archive + "Archived session" (neutral `bg-content/10 text-content/45`)
- Row 1 right: hover/focus-revealed `…` (`MoreHorizontal`, `size-3.5`) opening an `ExplorerMenu` with "Open" and "Archive"/"Unarchive" — replaces the old hover Archive button.
- Row 2: title `text-sm font-semibold` truncated, plus the `Pin` glyph when pinned.
- Row 3: meta line `text-[12px] text-content/50` — project name only in the all-projects scope, then `repo · branch`.
- Divider: `border-t border-dashed border-content/10`.
- Row 4: `HarnessIcon size-3.5` + `HARNESS_LABEL[harness]` (`text-[12px] text-content/45`) with the relative time on the right, tabular.

### i18n

- Two new keys: "Idle session": "Ociosa" and "Archived session": "Arquivada" (the column labels are plural). Everything else reuses existing keys.

### Out of scope

- Drag/drop logic (`kanbanDrag`, `dragGhost`), session classification (`sessionBoard`), the scope toggle, the surface header, and archive behavior (only the affordance moves into the menu).

## Testing

- `KanbanView.test.ts` keeps its current assertions and adds the pill labels and the card menu's aria label (`{name} menu`).
