# Automations (scheduled agent runs) — design

## Goal

Let the user schedule recurring agent runs — "every weekday at 9:00, inspect open PRs in this project" — with run history, pause/resume, and a consecutive-failure policy. Version 1 is attended: runs only execute while the app is open.

## Scope

In scope:

- **Dedicated automations**: each automation is a recipe (project, harness, model, runtime mode, prompt, schedule) that owns one dedicated session. The first run materializes the session; later runs continue it so context accumulates.
- **Schedule presets**, computed in the webview's local time: every N hours, daily, weekdays, weekly (day of week); each with an hour and minute.
- **Run lifecycle**: claim-before-dispatch, busy skip, missed-while-closed recording, terminal status via `onSettled`.
- **Failure policy**: pause the automation after 1, 3, or 5 consecutive failures, or keep running. A successful run resets the counter.
- **Surface**: a full-screen Automations view opened from a rail action directly below Kanban and from the View menu (in-app and native), mirroring the existing surface lifecycle.
- **Run history**: the last runs per automation with status, timing, and error, linking to the session transcript.

Out of scope (explicitly deferred):

- Heartbeat automations that continue an existing session.
- Natural-language stop conditions and schedule parsing.
- Running with the app closed (background/headless), catch-up runs, worktree isolation, and per-automation approvals beyond the normal runtime mode.

## Design

### Data model (Rust, `src-tauri/src/automations.rs`)

Two tables created by an unconditional `ensure_automations_table(conn)` called from `migrate` in `session_store.rs`, following the `notes`/`reminders` pattern:

- `automations`: `id`, `title`, `prompt`, `session_id` (nullable), `cwd`, `harness`, `model`, `runtime_mode`, `model_settings_json`, schedule fields (`schedule_kind` = `hourly | daily | weekdays | weekly`, `interval_hours`, `weekday` 0–6, `hour`, `minute`), `next_run_at` (epoch ms), `enabled`, `consecutive_failures`, `failure_policy` (`pause_after_1 | pause_after_3 | pause_after_5 | keep_running`), `paused_reason`, `created_at`, `updated_at`.
- `automation_runs`: `id`, `automation_id` (cascade delete), `scheduled_for`, `started_at`, `finished_at`, `status` (`running | completed | failed | cancelled | skipped_busy | missed`), `error`.

Commands mirror the reminders module (`automation_list`, `automation_upsert`, `automation_delete`, `automation_set_enabled`, `automation_runs`) and add two conditional mutations that make dispatch single-winner across windows and reloads:

- `automation_take_due(automation_id, expected_next_run_at, next_run_at, now)` — inserts a `running` run for the claimed slot and advances `next_run_at` only when the stored value still equals `expected_next_run_at`.
- `automation_record_missed(automation_id, expected_next_run_at, next_run_at)` — same conditional guard, records one `missed` run for `expected_next_run_at` and advances.

The backend only compares epoch milliseconds; all local-time math lives in the frontend, exactly like reminders.

### Schedule math and run policy (pure TS)

- `src/lib/automationSchedule.ts`: `nextRunAt(schedule, from, day)` computes the next local slot for every preset; `missedSlots(schedule, nextRunAt, now)` enumerates past slots that were never claimed; `describeSchedule(schedule)` produces the human label ("Dias úteis às 09:00"). For `hourly`, slots fall every N hours from local midnight at the configured minute (e.g. every 2 hours at :30).
- `src/lib/automations.ts`: types plus `applyRunOutcome(automation, outcome)` returning the next `consecutive_failures`, `enabled`, and `paused_reason` per the failure policy; `runStatusLabel` and `nextRunLabel` helpers.

### Dispatch (`src/hooks/useAutomations.ts`, wired in `App.tsx`)

- Refresh strategy mirrors `useSessionReminders`: a change event from the backend, a 30-second interval, and focus/visibility refresh, with a revision guard against stale responses.
- On each tick: a slot older than a short grace window (2 minutes) is recorded with `automation_record_missed` and the schedule advances; a slot inside the window is claimed with `automation_take_due` and dispatched. Missed slots are processed before the current one.
- Dispatch resolves the dedicated session: reuse `session_id` when the session is still open or loadable from history; otherwise create one with `newSession(harness, cwd, model, runtimeMode, modelSettings)` and persist the new `session_id` on the automation.
- If the session is busy, has queued messages, or is preparing a handoff, record `skipped_busy` and do not send. Otherwise call `onSubmit(sessionId, prompt, [], { onSettled })`, which is the single supported turn entry and gives block persistence, busy state, checkpoints, and the outcome.
- `onSettled(ControlOutcome)` closes the run: `completed` on success, `cancelled` on cancellation (does not count as a failure), `failed` otherwise. Failures increment `consecutive_failures`; a success resets it; the failure policy pauses the automation with a recorded reason when the threshold is reached.
- Deleting an automation deletes its history but never its session. An archived session does not disable the automation: the next run unarchives and reuses it, and only a session that no longer exists is recreated from the stored recipe.

### Surface (`src/surfaces/AutomationsView.tsx`)

- Full-screen surface following the existing pattern: a new `automationsViewOpen` flag with mutual exclusion against the other surfaces, keyboard guards, back handling, hidden/inert workspace, and usage-footer suppression.
- Entry points: a `RailAction` "Automations" directly below Kanban in `ProjectRail`, and an `open_automations` item in the View menu on both the in-app and native menus. The rail action shows a badge when any automation is paused by failures.
- List: cards with title, schedule label, next-run label ("em 3h", "pausada"), last-run status and failure count; actions **Rodar agora**, pause/resume, edit, and delete (confirmed).
- Editor: title, prompt, project (`CwdPicker`), harness/model/runtime mode (existing pickers), schedule preset with local time, and failure policy.
- History: expanding a card lists the last runs (slot, status, duration, error) and opens the session transcript.
- New strings go to the i18n keys with pt-BR translations.

## Testing and verification

- Vitest for `automationSchedule.ts`: next-slot math for every preset across day/week boundaries and the missed-slot enumeration; and for `automations.ts`: failure-policy transitions, labels.
- Rust tests for the conditional claim (only the matching `expected_next_run_at` advances and inserts a run), missed recording, cascade delete, and enable/pause transitions, following the reminders tests.
- Static markup test for the surface (list, paused state, empty state, editor fields).
- Manual verification: create an automation two minutes ahead, watch it fire and appear in the session transcript; trigger a busy skip; force a failure and confirm the pause at the configured threshold; reopen after a missed slot and confirm `missed`; use run-now, pause/resume, and history.
- Run `npm run check:web` and `npm run check:rust` before considering the phase done.
