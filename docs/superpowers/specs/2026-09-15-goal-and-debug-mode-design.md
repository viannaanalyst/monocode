# Goal and Debug mode — design

## Goal

Add two composer modes in the Synara "Add" menu: a session **Goal** the agent keeps pursuing until it signals completion (the user confirms), and a **Debug mode** that makes every turn follow a systematic-debugging posture.

## Evidence

- Synara's Add menu (screenshot, 2026-09-15): the "Add" header, Files and folders, Attach window (Capture an open app window), Goal (Set a goal to keep pursuing), Plan mode (Turn plan mode on), Debug mode (Turn debug mode on), Fast mode (Turn fast mode on). MonoCode's Add menu today has Files and folders, Plan mode and Orchestrator v1; the app note recorded that Goal/Fast/Debug/Attach window were left out because they do not exist here.
- The existing mode pattern: `planSelected` in the Composer (`src/chrome/Composer.tsx`) feeds `intent: "plan"` in the send payload, `planTurnPrompt` (`src/lib/plan.ts`) wraps the turn, chips render above the input (`Plan ×`, `Orchestrator ×`, `src/chrome/Composer.tsx:1661-1686`), and the mode resets after a send (`setPlanSelected(false)`, `src/chrome/Composer.tsx:1179`).
- Persistence pattern for per-session structured data: `linked_work_item_json` — `ensure_session_column` in `src-tauri/src/session_store.rs:605`, the column in the upsert list (`session_store.rs:794-815`) and the list SELECTs (`session_store.rs:1109`), plus the field in the TS `Session`, the store mapping and the snapshot round-trip. (`inbox_ask` is vestigial: Ask sessions are never persisted.)
- Built-in prompt bodies live as constants in `src/lib` (`inAppBrowserSkill.ts`, `createSkill.ts`), so the Debug posture can live in `src/lib/debugMode.ts`.
- Decisions from the design Q&A: Goal = persistent session objective, editable, injected every turn, closed only by user confirmation after the agent signals completion; Debug = prompt posture, sticky until turned off; the Goal text is written in a popover with a text field.

## Scope

In scope:

- `SessionGoal` on the session, persisted and restored, injected into every turn while active.
- Goal UI: Add-menu row showing the current goal truncated, a popover editor, a chip above the input with edit/clear, and a completed state with Concluir/Continuar.
- Debug mode: Add-menu toggle, chip, sticky within the session, prompt posture.
- Completion signal: a `GOAL COMPLETED: <summary>` line the agent is instructed to emit; the app detects it in the final assistant message of a goal turn.

Out of scope:

- Progress tracking or percentages, per-project goals, goals in Inbox Ask sessions.
- Hiding the marker line from the transcript (v1 keeps it visible).
- Attach window, Fast mode, and any new runtime mode.
- Changing Plan/Orchestrator behavior beyond composing with the new blocks.

## Design

### Data and persistence

- `export type SessionGoal = { text: string; createdAt: number; completedAt?: number }` and `Session.goal?: SessionGoal` in `src/lib/session.ts`.
- Persistence mirrors `linked_work_item_json`: `ensure_session_column(conn, "goal_json", "TEXT")`, the column in the upsert and in the list SELECTs of `src-tauri/src/session_store.rs`, a `goal` field on `SessionUpsert`, and the TS store mapping plus the `workspaceSnapshot` round-trip (goal sessions stay exportable, unlike Ask).
- `completedAt` persists so the "Concluir?" chip survives a restart.

### Prompts and the completion signal

- New `src/lib/goal.ts`:
  - `goalTurnPrompt(goal: SessionGoal, request: string): string` — a `## Goal` block plus: keep every response focused on the goal; only after the goal is fully achieved, end the final reply with a last line exactly `GOAL COMPLETED: <one-line summary>`; never emit it while anything is still open.
  - `goalCompleted(text: string): string | null` — returns the summary when the last non-empty line matches `/^GOAL COMPLETED:\s*(.+)$/i`.
- New `src/lib/debugMode.ts`: `debugTurnPrompt(request: string): string` — read the error fully, reproduce it, gather evidence before changing anything, state one hypothesis and the smallest test that proves it, fix the root cause rather than the symptom, verify the fix and report the evidence; if the request is not a debugging task, say so briefly and work normally.
- Turn composition order: **Goal → Debug → (Plan | Orchestrator) → request**, applied where `turnPrompt` is built in `src/App.tsx`.

### UI

- Add-menu order (Synara's): Files and folders, **Goal**, Plan mode, **Debug mode**, Orchestrator v1. The Goal row shows the goal text truncated when set; the Debug row is a checkable toggle like Plan mode.
- Goal editor: the Goal row opens a `Popover` anchored to the "+" button with a textarea (Enter saves, Shift+Enter inserts a newline) and Salvar/Limpar actions. Saving a trimmed empty text clears the goal.
- Chips above the input, next to the existing Plan/Orchestrator chips:
  - `Goal: <text truncated to 40 characters> ×` — clicking the label reopens the editor; × clears the goal.
  - Completed state: the chip turns emerald and shows **Concluir** (clears the goal) and **Continuar** (drops only `completedAt`).
  - `Debug ×` — like the Plan chip, but sticky: sending a turn does not clear it; the user turns it off from the chip or the Add menu.
- Icons: add `Crosshair` (Goal) and `Bug` (Debug) to `src/chrome/icons.tsx` through the existing `wrap` helper.

### App wiring

- The Composer's send payload gains `debug: boolean` next to `intent`; `debugSelected` is Composer state that survives sends and is cleared only when the user turns it off.
- `src/App.tsx`: `turnPrompt` gains the Debug and Goal blocks; while a goal is active and not yet completed, the turn's `message.delta` events accumulate into a `goalText` buffer, and on the turn's end `goalCompleted(buffer)` runs; a match sets `goal.completedAt` and persists through the existing session update path (`setSessions` plus the store write).
- Detection only runs with an active, incomplete goal, so no other session can produce a false positive.

### Error handling and edge cases

- Empty or whitespace-only goal → not saved; over-long text truncates in the chip but stays whole in the editor and the prompt.
- Clearing the goal mid-turn applies from the next turn; the in-flight turn keeps the block it was sent with.
- A restored session keeps its goal; an already-completed goal restores the "Concluir?" chip.
- Debug + Plan + Goal compose (Goal outermost); Debug alone wraps like a posture.
- The marker line stays visible in the transcript in v1.

## Testing

- `src/lib/goal.test.ts`: the prompt block content, marker parsing (final line, casing, trailing spaces), negatives (marker mid-message, missing marker, empty goal).
- `src/lib/debugMode.test.ts`: the block carries the posture and the request.
- Session store and snapshot: goal round-trip (persist, restore, export/import).
- `npm run check:web` and the typography guard stay green.
