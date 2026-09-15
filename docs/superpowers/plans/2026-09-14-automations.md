# Automations (Scheduled Agent Runs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated automations that run an agent prompt on a local-time schedule while the app is open, with run history, busy-skip, missed-run recording, and a consecutive-failure pause policy.

**Architecture:** A new Rust module stores `automations` and `automation_runs` (created from `migrate` like `notes`/`reminders`) and exposes plain CRUD plus three conditional mutations (claim due, record missed, record result) so dispatch is single-winner. Local-time schedule math lives in pure TypeScript modules; a `useAutomations` hook ticks, claims, and dispatches through `onSubmit(..., { onSettled })`. A full-screen `AutomationsView` mirrors the existing surface lifecycle and is opened from a rail action below Kanban and the View menu.

**Tech Stack:** Rust + rusqlite (existing `SessionStore`), React + TypeScript, vitest (`renderToStaticMarkup` for components, happy-dom where DOM is needed), existing pickers (`CwdPicker`, `AccessPicker`, `ModelPicker`).

## Global Constraints

- No new dependencies and no schema changes to existing tables; create both automation tables from an unconditional `ensure_automations_table(conn)` in `session_store.rs::migrate`, next to `crate::reminders::ensure_table(conn)`.
- The backend only compares epoch milliseconds; all local-time math stays in the webview, like reminders.
- Turns are dispatched only through App's `onSubmit(sessionId, text, attachments, options)` with `onSettled`; never call a harness adapter directly.
- The automation session is a normal session (no FK on `session_id`); deleting an automation deletes its history, never its session.
- Run ids are deterministic: `${automationId}:${scheduledFor}` in both Rust and TS.
- English strings are the i18n keys; add pt-BR entries for every new user-facing string.
- Commit messages follow the repo style: imperative sentence ending with a period.
- Run `npx vitest run <file>` while iterating and `npm run check:web` / `npm run check:rust` before considering the phase done.

**Execution order:** Task 5 lands the `automationStore.ts` types that Task 4 imports, and Task 8 lands `AutomationEditor` that Task 7 renders. Dispatch Task 5 before Task 4 and Task 8 before Task 7 (or land the prerequisite file in the same session).

---

### Task 1: Rust automations module — tables, types, and CRUD

**Files:**
- Create: `src-tauri/src/automations.rs`
- Modify: `src-tauri/src/lib.rs` (module declaration near `mod reminders;`, command registration in the existing `generate_handler!` list)
- Modify: `src-tauri/src/session_store.rs:611` (add `crate::automations::ensure_automations_table(conn)?;` after the reminders line)

**Interfaces:**
- Consumes: `crate::session_store::{now_millis, validate_id, SessionStore}` (reminders.rs:9 pattern).
- Produces (used by Tasks 2, 5, 9): `Automation`, `AutomationInput`, `AutomationRun`, `CHANGED`, `ensure_automations_table`, and commands `automation_list`, `automation_upsert`, `automation_delete`, `automation_set_enabled`, `automation_set_session`, `automation_runs`. Field names serialize camelCase.

- [ ] **Step 1: Write the failing tests**

Add at the bottom of `src-tauri/src/automations.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_automations_table(&conn).unwrap();
        conn
    }

    fn input(id: &str) -> AutomationInput {
        AutomationInput {
            id: id.to_string(),
            title: "Review PRs".into(),
            prompt: "Inspect open PRs and summarize.".into(),
            session_id: None,
            cwd: "/tmp/web".into(),
            harness: "claude".into(),
            model: "".into(),
            runtime_mode: "supervised".into(),
            model_settings: "{}".into(),
            schedule_kind: "weekdays".into(),
            interval_hours: 1,
            weekday: 1,
            hour: 9,
            minute: 0,
            next_run_at: 1_700_000_000_000,
            enabled: true,
            failure_policy: "pause_after_3".into(),
        }
    }

    #[test]
    fn upsert_inserts_then_updates_and_list_round_trips() {
        let mut conn = memory();
        let created = upsert(&mut conn, &input("a1")).unwrap();
        assert_eq!(created.title, "Review PRs");
        assert!(created.created_at > 0);
        let mut changed = input("a1");
        changed.title = "Renamed".into();
        changed.next_run_at = 1_700_000_060_000;
        let updated = upsert(&mut conn, &changed).unwrap();
        assert_eq!(updated.title, "Renamed");
        assert_eq!(updated.next_run_at, 1_700_000_060_000);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn upsert_rejects_invalid_schedule_and_empty_fields() {
        let mut conn = memory();
        let mut bad = input("a1");
        bad.schedule_kind = "sometimes".into();
        assert!(upsert(&mut conn, &bad).is_err());
        let mut bad = input("a1");
        bad.hour = 24;
        assert!(upsert(&mut conn, &bad).is_err());
        let mut bad = input("a1");
        bad.prompt = "   ".into();
        assert!(upsert(&mut conn, &bad).is_err());
        let mut bad = input("a1");
        bad.failure_policy = "forever".into();
        assert!(upsert(&mut conn, &bad).is_err());
    }

    #[test]
    fn delete_cascades_runs_and_set_enabled_resets_failures() {
        let mut conn = memory();
        upsert(&mut conn, &input("a1")).unwrap();
        conn.execute(
            "INSERT INTO automation_runs (id, automation_id, scheduled_for, status)
             VALUES ('a1:1', 'a1', 1, 'missed')",
            [],
        )
        .unwrap();
        set_enabled(&conn, "a1", false).unwrap();
        let row = get(&conn, "a1").unwrap().unwrap();
        assert!(!row.enabled);
        assert_eq!(row.consecutive_failures, 0);
        delete(&mut conn, "a1").unwrap();
        let runs: i64 = conn
            .query_row("SELECT COUNT(*) FROM automation_runs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(runs, 0);
        assert!(list(&conn).unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml automations::tests`
Expected: FAIL to compile (`automations` module does not exist).

- [ ] **Step 3: Implement tables, types, CRUD, and commands**

```rust
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::session_store::{now_millis, validate_id, SessionStore};

pub(crate) const CHANGED: &str = "monocode:automations-changed";

const SCHEDULE_KINDS: [&str; 4] = ["hourly", "daily", "weekdays", "weekly"];
const FAILURE_POLICIES: [&str; 4] = [
    "pause_after_1",
    "pause_after_3",
    "pause_after_5",
    "keep_running",
];

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub session_id: Option<String>,
    pub cwd: String,
    pub harness: String,
    pub model: String,
    pub runtime_mode: String,
    pub model_settings: String,
    pub schedule_kind: String,
    pub interval_hours: i64,
    pub weekday: i64,
    pub hour: i64,
    pub minute: i64,
    pub next_run_at: i64,
    pub enabled: bool,
    pub consecutive_failures: i64,
    pub failure_policy: String,
    pub paused_reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationInput {
    pub id: String,
    pub title: String,
    pub prompt: String,
    #[serde(default)]
    pub session_id: Option<String>,
    pub cwd: String,
    pub harness: String,
    pub model: String,
    pub runtime_mode: String,
    #[serde(default)]
    pub model_settings: String,
    pub schedule_kind: String,
    #[serde(default)]
    pub interval_hours: i64,
    #[serde(default)]
    pub weekday: i64,
    pub hour: i64,
    pub minute: i64,
    pub next_run_at: i64,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub failure_policy: String,
}

fn default_enabled() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRun {
    pub id: String,
    pub automation_id: String,
    pub scheduled_for: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub status: String,
    pub error: Option<String>,
}

pub(crate) fn ensure_automations_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS automations (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           prompt TEXT NOT NULL,
           session_id TEXT,
           cwd TEXT NOT NULL,
           harness TEXT NOT NULL,
           model TEXT NOT NULL DEFAULT '',
           runtime_mode TEXT NOT NULL,
           model_settings_json TEXT NOT NULL DEFAULT '{}',
           schedule_kind TEXT NOT NULL,
           interval_hours INTEGER NOT NULL DEFAULT 1,
           weekday INTEGER NOT NULL DEFAULT 1,
           hour INTEGER NOT NULL DEFAULT 9,
           minute INTEGER NOT NULL DEFAULT 0,
           next_run_at INTEGER NOT NULL,
           enabled INTEGER NOT NULL DEFAULT 1,
           consecutive_failures INTEGER NOT NULL DEFAULT 0,
           failure_policy TEXT NOT NULL DEFAULT 'pause_after_3',
           paused_reason TEXT,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS automations_next_run
         ON automations (next_run_at) WHERE enabled = 1;
         CREATE TABLE IF NOT EXISTS automation_runs (
           id TEXT PRIMARY KEY,
           automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
           scheduled_for INTEGER NOT NULL,
           started_at INTEGER,
           finished_at INTEGER,
           status TEXT NOT NULL,
           error TEXT
         );
         CREATE INDEX IF NOT EXISTS automation_runs_history
         ON automation_runs (automation_id, scheduled_for DESC);",
    )
}

fn validate_input(input: &AutomationInput) -> Result<(), String> {
    validate_id(&input.id, "automation")?;
    if input.title.trim().is_empty() {
        return Err("Give the automation a title.".into());
    }
    if input.prompt.trim().is_empty() {
        return Err("Write the prompt the automation should run.".into());
    }
    if input.cwd.trim().is_empty() || input.cwd.trim() == "~" {
        return Err("Choose a project folder for the automation.".into());
    }
    if input.harness.trim().is_empty() || input.runtime_mode.trim().is_empty() {
        return Err("Choose a provider and access mode.".into());
    }
    if !SCHEDULE_KINDS.contains(&input.schedule_kind.as_str()) {
        return Err("Unknown schedule.".into());
    }
    if !FAILURE_POLICIES.contains(&input.failure_policy.as_str()) {
        return Err("Unknown failure policy.".into());
    }
    if !(0..=23).contains(&input.hour) || !(0..=59).contains(&input.minute) {
        return Err("Choose a valid time.".into());
    }
    if !(0..=6).contains(&input.weekday) {
        return Err("Choose a valid weekday.".into());
    }
    if !(1..=24).contains(&input.interval_hours) {
        return Err("Choose an interval between 1 and 24 hours.".into());
    }
    if input.next_run_at <= 0 {
        return Err("Choose a time in the future.".into());
    }
    Ok(())
}

fn row_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<Automation> {
    Ok(Automation {
        id: row.get(0)?,
        title: row.get(1)?,
        prompt: row.get(2)?,
        session_id: row.get(3)?,
        cwd: row.get(4)?,
        harness: row.get(5)?,
        model: row.get(6)?,
        runtime_mode: row.get(7)?,
        model_settings: row.get(8)?,
        schedule_kind: row.get(9)?,
        interval_hours: row.get(10)?,
        weekday: row.get(11)?,
        hour: row.get(12)?,
        minute: row.get(13)?,
        next_run_at: row.get(14)?,
        enabled: row.get(15)?,
        consecutive_failures: row.get(16)?,
        failure_policy: row.get(17)?,
        paused_reason: row.get(18)?,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
    })
}

const SELECT: &str = "SELECT id, title, prompt, session_id, cwd, harness, model,
     runtime_mode, model_settings_json, schedule_kind, interval_hours, weekday,
     hour, minute, next_run_at, enabled, consecutive_failures, failure_policy,
     paused_reason, created_at, updated_at FROM automations";

fn get(conn: &Connection, id: &str) -> Result<Option<Automation>, String> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], row_from)
        .optional()
        .map_err(|error| error.to_string())
}

fn list(conn: &Connection) -> Result<Vec<Automation>, String> {
    let mut statement = conn
        .prepare(&format!("{SELECT} ORDER BY created_at, id"))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], row_from)
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn upsert(conn: &mut Connection, input: &AutomationInput) -> Result<Automation, String> {
    validate_input(input)?;
    if let Some(session_id) = input.session_id.as_deref() {
        validate_id(session_id, "session")?;
    }
    let now = now_millis();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO automations (
           id, title, prompt, session_id, cwd, harness, model, runtime_mode,
           model_settings_json, schedule_kind, interval_hours, weekday, hour,
           minute, next_run_at, enabled, consecutive_failures, failure_policy,
           paused_reason, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                   ?15, ?16, 0, ?17, NULL, ?18, ?18)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           prompt = excluded.prompt,
           session_id = excluded.session_id,
           cwd = excluded.cwd,
           harness = excluded.harness,
           model = excluded.model,
           runtime_mode = excluded.runtime_mode,
           model_settings_json = excluded.model_settings_json,
           schedule_kind = excluded.schedule_kind,
           interval_hours = excluded.interval_hours,
           weekday = excluded.weekday,
           hour = excluded.hour,
           minute = excluded.minute,
           next_run_at = excluded.next_run_at,
           enabled = excluded.enabled,
           failure_policy = excluded.failure_policy,
           updated_at = excluded.updated_at",
        params![
            input.id,
            input.title.trim(),
            input.prompt.trim(),
            input.session_id,
            input.cwd.trim(),
            input.harness,
            input.model,
            input.runtime_mode,
            input.model_settings,
            input.schedule_kind,
            input.interval_hours,
            input.weekday,
            input.hour,
            input.minute,
            input.next_run_at,
            input.enabled as i64,
            input.failure_policy,
            now,
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    get(conn, &input.id)?.ok_or_else(|| "Automation disappeared after save".into())
}

fn delete(conn: &mut Connection, id: &str) -> Result<(), String> {
    validate_id(id, "automation")?;
    conn.execute("DELETE FROM automations WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn set_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), String> {
    validate_id(id, "automation")?;
    conn.execute(
        "UPDATE automations
         SET enabled = ?2, paused_reason = NULL, consecutive_failures = 0,
             updated_at = ?3
         WHERE id = ?1",
        params![id, enabled as i64, now_millis()],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn set_session(conn: &Connection, id: &str, session_id: &str) -> Result<(), String> {
    validate_id(id, "automation")?;
    validate_id(session_id, "session")?;
    conn.execute(
        "UPDATE automations SET session_id = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, session_id, now_millis()],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn runs(conn: &Connection, automation_id: &str, limit: i64) -> Result<Vec<AutomationRun>, String> {
    validate_id(automation_id, "automation")?;
    let limit = limit.clamp(1, 100);
    let mut statement = conn
        .prepare(
            "SELECT id, automation_id, scheduled_for, started_at, finished_at, status, error
             FROM automation_runs WHERE automation_id = ?1
             ORDER BY scheduled_for DESC LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![automation_id, limit], |row| {
            Ok(AutomationRun {
                id: row.get(0)?,
                automation_id: row.get(1)?,
                scheduled_for: row.get(2)?,
                started_at: row.get(3)?,
                finished_at: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn automation_list(store: State<'_, SessionStore>) -> Result<Vec<Automation>, String> {
    let conn = store.lock_conn()?;
    list(&conn)
}

#[tauri::command(async)]
pub fn automation_upsert(
    app: AppHandle,
    store: State<'_, SessionStore>,
    input: AutomationInput,
) -> Result<Automation, String> {
    let mut conn = store.lock_conn()?;
    let automation = upsert(&mut conn, &input)?;
    drop(conn);
    let _ = app.emit(CHANGED, ());
    Ok(automation)
}

#[tauri::command(async)]
pub fn automation_delete(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
) -> Result<(), String> {
    let mut conn = store.lock_conn()?;
    delete(&mut conn, &id)?;
    drop(conn);
    let _ = app.emit(CHANGED, ());
    Ok(())
}

#[tauri::command(async)]
pub fn automation_set_enabled(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = store.lock_conn()?;
    set_enabled(&conn, &id, enabled)?;
    drop(conn);
    let _ = app.emit(CHANGED, ());
    Ok(())
}

#[tauri::command(async)]
pub fn automation_set_session(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    session_id: String,
) -> Result<(), String> {
    let conn = store.lock_conn()?;
    set_session(&conn, &id, &session_id)?;
    drop(conn);
    let _ = app.emit(CHANGED, ());
    Ok(())
}

#[tauri::command(async)]
pub fn automation_runs(
    store: State<'_, SessionStore>,
    id: String,
    limit: Option<i64>,
) -> Result<Vec<AutomationRun>, String> {
    let conn = store.lock_conn()?;
    runs(&conn, &id, limit.unwrap_or(20))
}
```

In `src-tauri/src/lib.rs`:

1. Add `mod automations;` next to `mod reminders;`.
2. Register after the reminders commands (`lib.rs:254-260`):

```rust
            automations::automation_list,
            automations::automation_upsert,
            automations::automation_delete,
            automations::automation_set_enabled,
            automations::automation_set_session,
            automations::automation_runs,
```

In `session_store.rs`, inside `migrate`, add after `crate::reminders::ensure_table(conn)?;`:

```rust
    crate::automations::ensure_automations_table(conn)?;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml automations::tests` and `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS and clean check.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/automations.rs src-tauri/src/lib.rs src-tauri/src/session_store.rs
git commit -m "Add automations storage and commands."
```

---

### Task 2: Rust conditional mutations — claim, missed, result

**Files:**
- Modify: `src-tauri/src/automations.rs` (helpers + commands + tests)
- Modify: `src-tauri/src/lib.rs` (register the three commands after Task 1's block)

**Interfaces:**
- Consumes: Task 1's `ensure_automations_table`, `Automation`, `AutomationRun`, `get`, `row_from`, `CHANGED`.
- Produces (used by Task 6): `automation_take_due(automation_id, expected_next_run_at, next_run_at, now) -> bool`, `automation_record_missed(automation_id, expected_next_run_at, next_run_at) -> bool`, `automation_record_result(automation_id, run_id, status, error, consecutive_failures, enabled, paused_reason) -> Automation`.

- [ ] **Step 1: Write the failing tests**

Add to the existing `mod tests`:

```rust
    #[test]
    fn take_due_advances_only_for_the_expected_slot_and_records_one_run() {
        let mut conn = memory();
        upsert(&mut conn, &input("a1")).unwrap();
        let slot = 1_700_000_000_000;
        let next = 1_700_003_600_000;
        assert!(take_due(&mut conn, "a1", slot, next, slot + 1000).unwrap());
        assert!(!take_due(&mut conn, "a1", slot, next, slot + 2000).unwrap());
        let stored = get(&conn, "a1").unwrap().unwrap();
        assert_eq!(stored.next_run_at, next);
        let history = runs(&conn, "a1", 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, "running");
        assert_eq!(history[0].scheduled_for, slot);
        assert_eq!(history[0].id, format!("a1:{slot}"));
    }

    #[test]
    fn take_due_skips_paused_automations() {
        let mut conn = memory();
        upsert(&mut conn, &input("a1")).unwrap();
        set_enabled(&conn, "a1", false).unwrap();
        let slot = 1_700_000_000_000;
        assert!(!take_due(&mut conn, "a1", slot, slot + 1000, slot).unwrap());
        let stored = get(&conn, "a1").unwrap().unwrap();
        assert_eq!(stored.next_run_at, slot);
    }

    #[test]
    fn record_missed_advances_and_marks_the_slot() {
        let mut conn = memory();
        upsert(&mut conn, &input("a1")).unwrap();
        let slot = 1_700_000_000_000;
        let next = 1_700_003_600_000;
        assert!(record_missed(&mut conn, "a1", slot, next).unwrap());
        assert!(!record_missed(&mut conn, "a1", slot, next).unwrap());
        let stored = get(&conn, "a1").unwrap().unwrap();
        assert_eq!(stored.next_run_at, next);
        let history = runs(&conn, "a1", 10).unwrap();
        assert_eq!(history[0].status, "missed");
        assert_eq!(history[0].scheduled_for, slot);
    }

    #[test]
    fn record_result_closes_the_run_and_applies_counters() {
        let mut conn = memory();
        upsert(&mut conn, &input("a1")).unwrap();
        let slot = 1_700_000_000_000;
        take_due(&mut conn, "a1", slot, slot + 60_000, slot).unwrap();
        let run_id = format!("a1:{slot}");
        let updated = record_result(
            &mut conn,
            "a1",
            &run_id,
            "failed",
            Some("boom"),
            2,
            true,
            None,
        )
        .unwrap();
        assert_eq!(updated.consecutive_failures, 2);
        assert!(updated.enabled);
        let history = runs(&conn, "a1", 10).unwrap();
        assert_eq!(history[0].status, "failed");
        assert_eq!(history[0].error.as_deref(), Some("boom"));
        assert!(history[0].finished_at.is_some());
        let paused = record_result(
            &mut conn,
            "a1",
            "a1:1",
            "failed",
            None,
            3,
            false,
            Some("failures"),
        )
        .unwrap();
        assert!(!paused.enabled);
        assert_eq!(paused.paused_reason.as_deref(), Some("failures"));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml automations::tests`
Expected: FAIL to compile (`take_due`, `record_missed`, `record_result` not found).

- [ ] **Step 3: Implement the three mutations and commands**

```rust
fn take_due(
    conn: &mut Connection,
    id: &str,
    expected_next_run_at: i64,
    next_run_at: i64,
    now: i64,
) -> Result<bool, String> {
    validate_id(id, "automation")?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let updated = tx
        .execute(
            "UPDATE automations SET next_run_at = ?3, updated_at = ?4
             WHERE id = ?1 AND enabled = 1 AND next_run_at = ?2",
            params![id, expected_next_run_at, next_run_at, now],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Ok(false);
    }
    let run_id = format!("{id}:{expected_next_run_at}");
    tx.execute(
        "INSERT OR IGNORE INTO automation_runs
           (id, automation_id, scheduled_for, started_at, status)
         VALUES (?1, ?2, ?3, ?4, 'running')",
        params![run_id, id, expected_next_run_at, now],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(true)
}

fn record_missed(
    conn: &mut Connection,
    id: &str,
    expected_next_run_at: i64,
    next_run_at: i64,
) -> Result<bool, String> {
    validate_id(id, "automation")?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let updated = tx
        .execute(
            "UPDATE automations SET next_run_at = ?3, updated_at = ?4
             WHERE id = ?1 AND next_run_at = ?2",
            params![id, expected_next_run_at, next_run_at, now_millis()],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Ok(false);
    }
    tx.execute(
        "INSERT OR IGNORE INTO automation_runs
           (id, automation_id, scheduled_for, status)
         VALUES (?1, ?2, ?3, 'missed')",
        params![format!("{id}:{expected_next_run_at}"), id, expected_next_run_at],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(true)
}

#[allow(clippy::too_many_arguments)]
fn record_result(
    conn: &mut Connection,
    id: &str,
    run_id: &str,
    status: &str,
    error: Option<&str>,
    consecutive_failures: i64,
    enabled: bool,
    paused_reason: Option<&str>,
) -> Result<Automation, String> {
    validate_id(id, "automation")?;
    if !["completed", "failed", "cancelled", "skipped_busy"].contains(&status) {
        return Err("Unknown run status.".into());
    }
    let now = now_millis();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE automation_runs
         SET status = ?3, error = ?4, finished_at = ?5
         WHERE id = ?1 AND automation_id = ?2",
        params![run_id, id, status, error, now],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE automations
         SET consecutive_failures = ?2, enabled = ?3, paused_reason = ?4,
             updated_at = ?5
         WHERE id = ?1",
        params![id, consecutive_failures, enabled as i64, paused_reason, now],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    get(conn, id)?.ok_or_else(|| "Automation not found".into())
}

#[tauri::command(async)]
pub fn automation_take_due(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    expected_next_run_at: i64,
    next_run_at: i64,
    now: i64,
) -> Result<bool, String> {
    let mut conn = store.lock_conn()?;
    let claimed = take_due(&mut conn, &id, expected_next_run_at, next_run_at, now)?;
    drop(conn);
    if claimed {
        let _ = app.emit(CHANGED, ());
    }
    Ok(claimed)
}

#[tauri::command(async)]
pub fn automation_record_missed(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    expected_next_run_at: i64,
    next_run_at: i64,
) -> Result<bool, String> {
    let mut conn = store.lock_conn()?;
    let recorded = record_missed(&mut conn, &id, expected_next_run_at, next_run_at)?;
    drop(conn);
    if recorded {
        let _ = app.emit(CHANGED, ());
    }
    Ok(recorded)
}

#[tauri::command(async)]
pub fn automation_record_result(
    app: AppHandle,
    store: State<'_, SessionStore>,
    automation_id: String,
    run_id: String,
    status: String,
    error: Option<String>,
    consecutive_failures: i64,
    enabled: bool,
    paused_reason: Option<String>,
) -> Result<Automation, String> {
    let mut conn = store.lock_conn()?;
    let automation = record_result(
        &mut conn,
        &automation_id,
        &run_id,
        &status,
        error.as_deref(),
        consecutive_failures,
        enabled,
        paused_reason.as_deref(),
    )?;
    drop(conn);
    let _ = app.emit(CHANGED, ());
    Ok(automation)
}
```

Register the three commands in `lib.rs` after Task 1's block:

```rust
            automations::automation_take_due,
            automations::automation_record_missed,
            automations::automation_record_result,
```

- [ ] **Step 4: Run tests and check**

Run: `cargo test --manifest-path src-tauri/Cargo.toml automations::tests` and `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS and clean check.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/automations.rs src-tauri/src/lib.rs
git commit -m "Add automation run claiming and results."
```

---

### Task 3: Schedule math (`automationSchedule.ts`)

**Files:**
- Create: `src/lib/automationSchedule.ts`
- Create: `src/lib/automationSchedule.test.ts`

**Interfaces:**
- Produces (used by Tasks 4, 6, 8): `ScheduleKind`, `AutomationSchedule`, `WEEKDAYS`, `nextRunAt(schedule, from)`, `missedSlots(schedule, from, now)`, `describeSchedule(schedule)`, `scheduleOf(automation)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automationSchedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  missedSlots,
  nextRunAt,
  scheduleOf,
  type AutomationSchedule,
} from "./automationSchedule";

function schedule(overrides: Partial<AutomationSchedule> = {}): AutomationSchedule {
  return { kind: "daily", intervalHours: 1, weekday: 1, hour: 9, minute: 0, ...overrides };
}

const at = (iso: string) => new Date(iso).getTime();

describe("nextRunAt", () => {
  it("returns today when the time has not passed", () => {
    const from = at("2026-09-14T07:00:00");
    expect(new Date(nextRunAt(schedule(), from)).getHours()).toBe(9);
    expect(new Date(nextRunAt(schedule(), from)).getDate()).toBe(14);
  });

  it("rolls to tomorrow when the time has passed", () => {
    const from = at("2026-09-14T10:00:00");
    expect(new Date(nextRunAt(schedule(), from)).getDate()).toBe(15);
  });

  it("skips the weekend for weekdays", () => {
    const from = at("2026-09-18T10:00:00"); // Friday after 9:00
    const next = new Date(nextRunAt(schedule({ kind: "weekdays" }), from));
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(21);
  });

  it("finds the selected weekday for weekly", () => {
    const from = at("2026-09-14T10:00:00"); // Monday after 9:00
    const next = new Date(nextRunAt(schedule({ kind: "weekly", weekday: 1 }), from));
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(21);
  });

  it("steps hourly slots from local midnight", () => {
    const from = at("2026-09-14T06:10:00");
    const next = new Date(nextRunAt(schedule({ kind: "hourly", intervalHours: 2, minute: 30 }), from));
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(30);
    expect(next.getDate()).toBe(14);
  });
});

describe("missedSlots", () => {
  it("lists every slot before now", () => {
    const from = at("2026-09-14T09:00:00");
    const now = at("2026-09-16T10:00:00");
    const slots = missedSlots(schedule(), from, now);
    expect(slots.map((slot) => new Date(slot).getDate())).toEqual([14, 15, 16]);
  });

  it("returns nothing when the next slot is ahead", () => {
    expect(missedSlots(schedule(), at("2026-09-14T09:00:00"), at("2026-09-14T08:00:00"))).toEqual([]);
  });
});

describe("describeSchedule", () => {
  it("labels presets and reads the schedule off an automation", () => {
    expect(describeSchedule(schedule())).toContain("09:00");
    expect(describeSchedule(schedule({ kind: "weekdays" }))).toContain("09:00");
    expect(describeSchedule(schedule({ kind: "hourly", intervalHours: 3 }))).toContain("3");
    const automation = { scheduleKind: "daily" as const, intervalHours: 1, weekday: 1, hour: 8, minute: 5 };
    expect(scheduleOf(automation)).toEqual({
      kind: "daily",
      intervalHours: 1,
      weekday: 1,
      hour: 8,
      minute: 5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automationSchedule.test.ts`
Expected: FAIL with `Cannot find module './automationSchedule'`.

- [ ] **Step 3: Implement `automationSchedule.ts`**

```ts
export type ScheduleKind = "hourly" | "daily" | "weekdays" | "weekly";

export type AutomationSchedule = {
  kind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function scheduleOf(automation: {
  scheduleKind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
}): AutomationSchedule {
  return {
    kind: automation.scheduleKind,
    intervalHours: automation.intervalHours,
    weekday: automation.weekday,
    hour: automation.hour,
    minute: automation.minute,
  };
}

function startOfDay(from: number): Date {
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Local wall-clock slot on the given day offset, optionally pushed to a weekday. */
function slotOn(from: number, dayOffset: number, schedule: AutomationSchedule): number {
  const day = startOfDay(from);
  day.setDate(day.getDate() + dayOffset);
  day.setHours(schedule.hour, schedule.minute, 0, 0);
  return day.getTime();
}

export function nextRunAt(schedule: AutomationSchedule, from: number): number {
  if (schedule.kind === "hourly") {
    const interval = Math.min(24, Math.max(1, Math.round(schedule.intervalHours)));
    const base = startOfDay(from).getTime() + schedule.minute * 60_000;
    const step = interval * 3_600_000;
    const index = from < base ? 1 : Math.floor((from - base) / step) + 1;
    return base + index * step;
  }
  if (schedule.kind === "daily") {
    const today = slotOn(from, 0, schedule);
    return today > from ? today : slotOn(from, 1, schedule);
  }
  if (schedule.kind === "weekdays") {
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = slotOn(from, offset, schedule);
      const weekday = new Date(candidate).getDay();
      if (candidate > from && weekday !== 0 && weekday !== 6) return candidate;
    }
    return slotOn(from, 8, schedule);
  }
  const weekly = slotOn(from, 0, schedule);
  const target = ((schedule.weekday % 7) + 7) % 7;
  const shifted = new Date(weekly);
  shifted.setDate(shifted.getDate() + ((target - shifted.getDay() + 7) % 7));
  const candidate = shifted.getTime();
  if (candidate > from) return candidate;
  shifted.setDate(shifted.getDate() + 7);
  return shifted.getTime();
}

export function missedSlots(
  schedule: AutomationSchedule,
  from: number,
  now: number,
): number[] {
  const slots: number[] = [];
  let cursor = from;
  for (let guard = 0; guard < 50; guard += 1) {
    if (cursor >= now) break;
    slots.push(cursor);
    cursor = nextRunAt(schedule, cursor);
  }
  return slots;
}

export function formatScheduleTime(schedule: AutomationSchedule): string {
  const hour = String(Math.min(23, Math.max(0, schedule.hour))).padStart(2, "0");
  const minute = String(Math.min(59, Math.max(0, schedule.minute))).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function describeSchedule(schedule: AutomationSchedule): string {
  const time = formatScheduleTime(schedule);
  if (schedule.kind === "hourly") {
    const interval = Math.min(24, Math.max(1, Math.round(schedule.intervalHours)));
    return `Every ${interval}h at :${String(schedule.minute).padStart(2, "0")}`;
  }
  if (schedule.kind === "daily") return `Daily at ${time}`;
  if (schedule.kind === "weekdays") return `Weekdays at ${time}`;
  const weekday = WEEKDAYS[((schedule.weekday % 7) + 7) % 7];
  return `Weekly on ${weekday} at ${time}`;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/automationSchedule.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automationSchedule.ts src/lib/automationSchedule.test.ts
git commit -m "Add automation schedule math."
```

---

### Task 4: Run policy and tick planning (`automations.ts`)

**Files:**
- Create: `src/lib/automations.ts`
- Create: `src/lib/automations.test.ts`

**Interfaces:**
- Consumes: `Automation`, `AutomationRun`, `AutomationRunStatus` from Task 5's store types (created in the same commit order: write both types in Task 5 first if running tasks out of order; this plan creates the store module in Task 5, so **Task 5 runs before this task's import can resolve** — implementers must run tasks in order, or add the missing type imports only if Task 5 is not yet done; the type names below are fixed).
- Produces (used by Tasks 6, 7, 8): `RunOutcome`, `failureLimit`, `applyRunOutcome`, `automationTickPlan`, `nextRunLabel`, `runStatusLabel`, `automationStatusLabel`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/automations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyRunOutcome,
  automationTickPlan,
  failureLimit,
  nextRunLabel,
  runStatusLabel,
} from "./automations";
import type { Automation } from "./automationStore";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    title: "Review PRs",
    prompt: "Review",
    sessionId: null,
    cwd: "/tmp/web",
    harness: "claude",
    model: "",
    runtimeMode: "supervised",
    modelSettings: "{}",
    scheduleKind: "daily",
    intervalHours: 1,
    weekday: 1,
    hour: 9,
    minute: 0,
    nextRunAt: 1_700_000_000_000,
    enabled: true,
    consecutiveFailures: 0,
    failurePolicy: "pause_after_3",
    pausedReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("failure policy", () => {
  it("maps policies to limits", () => {
    expect(failureLimit("pause_after_1")).toBe(1);
    expect(failureLimit("pause_after_3")).toBe(3);
    expect(failureLimit("pause_after_5")).toBe(5);
    expect(failureLimit("keep_running")).toBeNull();
  });

  it("resets on success and counts failures", () => {
    const failed = applyRunOutcome(automation({ consecutiveFailures: 1 }), "failed");
    expect(failed.consecutiveFailures).toBe(2);
    expect(failed.enabled).toBe(true);
    const completed = applyRunOutcome(automation({ consecutiveFailures: 2 }), "completed");
    expect(completed.consecutiveFailures).toBe(0);
    const cancelled = applyRunOutcome(automation({ consecutiveFailures: 2 }), "cancelled");
    expect(cancelled.consecutiveFailures).toBe(2);
  });

  it("pauses at the threshold with a reason code", () => {
    const paused = applyRunOutcome(automation({ consecutiveFailures: 2 }), "failed");
    expect(paused.enabled).toBe(false);
    expect(paused.pausedReason).toBe("failures");
  });

  it("keeps running when the policy says so", () => {
    const kept = applyRunOutcome(
      automation({ consecutiveFailures: 9, failurePolicy: "keep_running" }),
      "failed",
    );
    expect(kept.enabled).toBe(true);
    expect(kept.consecutiveFailures).toBe(10);
  });
});

describe("automationTickPlan", () => {
  it("separates old slots from the current one", () => {
    const base = 1_700_000_000_000;
    const plan = automationTickPlan(automation({ nextRunAt: base }), base + 3 * 86_400_000, 120_000);
    expect(plan.missed).toHaveLength(3);
    expect(plan.due).toBe(base + 3 * 86_400_000);
  });

  it("treats a slot inside the grace window as due", () => {
    const base = 1_700_000_000_000;
    const plan = automationTickPlan(automation({ nextRunAt: base }), base + 60_000, 120_000);
    expect(plan.missed).toEqual([]);
    expect(plan.due).toBe(base);
  });

  it("does nothing when the next slot is ahead", () => {
    const base = 1_700_000_000_000;
    const plan = automationTickPlan(automation({ nextRunAt: base }), base - 60_000, 120_000);
    expect(plan.missed).toEqual([]);
    expect(plan.due).toBeNull();
  });
});

describe("labels", () => {
  it("labels next-run states and statuses", () => {
    const now = 1_700_000_000_000;
    expect(nextRunLabel(automation({ nextRunAt: now + 3_600_000 }), now)).toContain("1");
    expect(nextRunLabel(automation({ enabled: false, pausedReason: "failures", consecutiveFailures: 3 }), now)).toContain("3");
    expect(runStatusLabel("skipped_busy")).toBe("Skipped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automations.test.ts`
Expected: FAIL with `Cannot find module './automations'` (and `./automationStore` until Task 5 lands; run Task 5 first if needed).

- [ ] **Step 3: Implement `automations.ts`**

```ts
import { nextRunAt, scheduleOf, type AutomationSchedule } from "./automationSchedule";
import type { Automation, AutomationRunStatus } from "./automationStore";

export type RunOutcome = "completed" | "failed" | "cancelled";

export function failureLimit(policy: Automation["failurePolicy"]): number | null {
  if (policy === "pause_after_1") return 1;
  if (policy === "pause_after_3") return 3;
  if (policy === "pause_after_5") return 5;
  return null;
}

export function applyRunOutcome(
  automation: Pick<
    Automation,
    "consecutiveFailures" | "enabled" | "pausedReason" | "failurePolicy"
  >,
  outcome: RunOutcome,
): { consecutiveFailures: number; enabled: boolean; pausedReason: string | null } {
  if (outcome === "completed") {
    return { consecutiveFailures: 0, enabled: automation.enabled, pausedReason: null };
  }
  if (outcome === "cancelled") {
    return {
      consecutiveFailures: automation.consecutiveFailures,
      enabled: automation.enabled,
      pausedReason: automation.pausedReason,
    };
  }
  const failures = automation.consecutiveFailures + 1;
  const limit = failureLimit(automation.failurePolicy);
  if (limit != null && failures >= limit) {
    return { consecutiveFailures: failures, enabled: false, pausedReason: "failures" };
  }
  return { consecutiveFailures: failures, enabled: automation.enabled, pausedReason: automation.pausedReason };
}

export function automationTickPlan(
  automation: Automation,
  now: number,
  graceMs = 120_000,
): { missed: number[]; due: number | null } {
  const schedule = scheduleOf(automation);
  const missed: number[] = [];
  let cursor = automation.nextRunAt;
  for (let guard = 0; guard < 50; guard += 1) {
    if (cursor > now) break;
    if (now - cursor > graceMs) {
      missed.push(cursor);
      cursor = nextRunAt(schedule, cursor);
      continue;
    }
    return { missed, due: cursor };
  }
  return { missed, due: null };
}

export function nextSchedule(schedule: AutomationSchedule, slot: number): number {
  return nextRunAt(schedule, slot);
}

export function nextRunLabel(automation: Automation, now: number): string {
  if (!automation.enabled) {
    if (automation.pausedReason === "failures") {
      return `Paused after ${automation.consecutiveFailures} failures`;
    }
    return "Paused";
  }
  const ms = automation.nextRunAt - now;
  if (ms <= 0) return "Due now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function runStatusLabel(status: AutomationRunStatus): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "skipped_busy") return "Skipped";
  return "Missed";
}

export function automationStatusLabel(automation: Automation): string {
  if (automation.enabled) return "Active";
  return automation.pausedReason === "failures" ? "Paused" : "Disabled";
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/automations.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations.ts src/lib/automations.test.ts
git commit -m "Add automation run policy and tick planning."
```

Note: this task imports `Automation` from `./automationStore` (Task 5). If executing in order, do Task 5 first; the plan orders Task 5 before this task in the file for that reason — treat Task 5 as a prerequisite.

---

### Task 5: Frontend API store (`automationStore.ts`)

**Files:**
- Create: `src/lib/automationStore.ts`
- Create: `src/lib/automationStore.test.ts`

**Interfaces:**
- Consumes: the Task 1-2 commands (camelCase arguments).
- Produces (used by Tasks 4, 6-9): `Automation`, `AutomationRun`, `AutomationRunStatus`, `AutomationInput`, `AUTOMATIONS_CHANGED`, `listAutomations`, `upsertAutomation`, `deleteAutomation`, `setAutomationEnabled`, `setAutomationSession`, `listAutomationRuns`, `takeDueAutomation`, `recordMissedAutomation`, `recordAutomationResult`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/automationStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  listAutomations,
  recordAutomationResult,
  takeDueAutomation,
  upsertAutomation,
} from "./automationStore";

describe("automation store wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("passes take-due arguments through unchanged", async () => {
    await takeDueAutomation("a1", 10, 20, 30);
    expect(invoke).toHaveBeenCalledWith("automation_take_due", {
      id: "a1",
      expectedNextRunAt: 10,
      nextRunAt: 20,
      now: 30,
    });
  });

  it("sends result counters through", async () => {
    await recordAutomationResult({
      automationId: "a1",
      runId: "a1:10",
      status: "failed",
      error: "boom",
      consecutiveFailures: 2,
      enabled: true,
      pausedReason: null,
    });
    expect(invoke).toHaveBeenCalledWith("automation_record_result", {
      automationId: "a1",
      runId: "a1:10",
      status: "failed",
      error: "boom",
      consecutiveFailures: 2,
      enabled: true,
      pausedReason: null,
    });
  });

  it("lists and upserts", async () => {
    invoke.mockResolvedValueOnce([]);
    await listAutomations();
    expect(invoke).toHaveBeenCalledWith("automation_list");
    await upsertAutomation({
      id: "a1",
      title: "T",
      prompt: "P",
      sessionId: null,
      cwd: "/tmp/web",
      harness: "claude",
      model: "",
      runtimeMode: "supervised",
      modelSettings: "{}",
      scheduleKind: "daily",
      intervalHours: 1,
      weekday: 1,
      hour: 9,
      minute: 0,
      nextRunAt: 1,
      enabled: true,
      failurePolicy: "pause_after_3",
    });
    expect(invoke).toHaveBeenCalledWith("automation_upsert", {
      input: expect.objectContaining({ id: "a1", scheduleKind: "daily" }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/automationStore.test.ts`
Expected: FAIL with `Cannot find module './automationStore'`.

- [ ] **Step 3: Implement `automationStore.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { ScheduleKind } from "./automationSchedule";

export const AUTOMATIONS_CHANGED = "monocode:automations-changed";

export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped_busy"
  | "missed";

export type Automation = {
  id: string;
  title: string;
  prompt: string;
  sessionId: string | null;
  cwd: string;
  harness: string;
  model: string;
  runtimeMode: string;
  modelSettings: string;
  scheduleKind: ScheduleKind;
  intervalHours: number;
  weekday: number;
  hour: number;
  minute: number;
  nextRunAt: number;
  enabled: boolean;
  consecutiveFailures: number;
  failurePolicy: "pause_after_1" | "pause_after_3" | "pause_after_5" | "keep_running";
  pausedReason: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationInput = Omit<
  Automation,
  "consecutiveFailures" | "pausedReason" | "createdAt" | "updatedAt"
>;

export type AutomationRun = {
  id: string;
  automationId: string;
  scheduledFor: number;
  startedAt: number | null;
  finishedAt: number | null;
  status: AutomationRunStatus;
  error: string | null;
};

export function listAutomations(): Promise<Automation[]> {
  return invoke<Automation[]>("automation_list");
}

export function upsertAutomation(input: AutomationInput): Promise<Automation> {
  return invoke<Automation>("automation_upsert", { input });
}

export function deleteAutomation(id: string): Promise<void> {
  return invoke<void>("automation_delete", { id });
}

export function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  return invoke<void>("automation_set_enabled", { id, enabled });
}

export function setAutomationSession(id: string, sessionId: string): Promise<void> {
  return invoke<void>("automation_set_session", { id, sessionId });
}

export function listAutomationRuns(id: string, limit = 20): Promise<AutomationRun[]> {
  return invoke<AutomationRun[]>("automation_runs", { id, limit });
}

export function takeDueAutomation(
  id: string,
  expectedNextRunAt: number,
  nextRunAt: number,
  now: number,
): Promise<boolean> {
  return invoke<boolean>("automation_take_due", {
    id,
    expectedNextRunAt,
    nextRunAt,
    now,
  });
}

export function recordMissedAutomation(
  id: string,
  expectedNextRunAt: number,
  nextRunAt: number,
): Promise<boolean> {
  return invoke<boolean>("automation_record_missed", {
    id,
    expectedNextRunAt,
    nextRunAt,
  });
}

export function recordAutomationResult(input: {
  automationId: string;
  runId: string;
  status: Exclude<AutomationRunStatus, "running" | "missed">;
  error: string | null;
  consecutiveFailures: number;
  enabled: boolean;
  pausedReason: string | null;
}): Promise<Automation> {
  return invoke<Automation>("automation_record_result", input);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/automationStore.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automationStore.ts src/lib/automationStore.test.ts
git commit -m "Add automation API wrappers."
```

---

### Task 6: `useAutomations` hook — tick, claim, dispatch

**Files:**
- Create: `src/hooks/useAutomations.ts`

**Interfaces:**
- Consumes: Tasks 3-5 (`automationTickPlan`, `applyRunOutcome`, `nextSchedule`, store wrappers), plus a dispatch callback supplied by App in Task 9.
- Produces (used by Task 9): `useAutomations(callbacks: { dispatch: (automation: Automation) => Promise<RunOutcome | "skipped"> })` returning `{ automations, runs, error, refresh, runNow, toggle, remove, loadRuns }`.

- [ ] **Step 1: Implement the hook**

There is no meaningful unit test for the timer/dispatch orchestration without mocking the whole store; the pure pieces (`automationTickPlan`, `applyRunOutcome`) are covered in Task 4, and the integration is verified manually in Task 11. Implement:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  applyRunOutcome,
  automationTickPlan,
  nextSchedule,
  type RunOutcome,
} from "../lib/automations";
import { nextRunAt, scheduleOf } from "../lib/automationSchedule";
import {
  AUTOMATIONS_CHANGED,
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  recordAutomationResult,
  recordMissedAutomation,
  setAutomationEnabled,
  takeDueAutomation,
  type Automation,
  type AutomationRun,
} from "../lib/automationStore";

const TICK_MS = 30_000;

export function useAutomations(callbacks: {
  dispatch: (automation: Automation) => Promise<RunOutcome | "skipped">;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const automationsRef = useRef(automations);
  automationsRef.current = automations;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const activeRuns = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const items = await listAutomations();
      if (request !== revision.current) return;
      setAutomations(items);
      setError(null);
    } catch (err) {
      if (request === revision.current) setError(String(err));
    }
  }, []);

  const loadRuns = useCallback(async (id: string) => {
    try {
      const history = await listAutomationRuns(id);
      setRuns((current) => ({ ...current, [id]: history }));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const tick = useCallback(async () => {
    const now = Date.now();
    for (const automation of automationsRef.current) {
      if (!automation.enabled || activeRuns.current.has(automation.id)) continue;
      const plan = automationTickPlan(automation, now);
      for (const slot of plan.missed) {
        const next = nextRunAt(scheduleOf(automation), slot);
        await recordMissedAutomation(automation.id, slot, next).catch(() => false);
      }
      if (plan.missed.length > 0) await refresh();
      if (plan.due == null) continue;
      activeRuns.current.add(automation.id);
      try {
        const next = nextRunAt(scheduleOf(automation), plan.due);
        const claimed = await takeDueAutomation(automation.id, plan.due, next, now);
        if (!claimed) continue;
        await refresh();
        const outcome = await callbacksRef.current.dispatch({
          ...automation,
          nextRunAt: next,
        });
        const applied =
          outcome === "skipped"
            ? {
                consecutiveFailures: automation.consecutiveFailures,
                enabled: automation.enabled,
                pausedReason: automation.pausedReason,
              }
            : applyRunOutcome(automation, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${plan.due}`,
          status: outcome === "skipped" ? "skipped_busy" : outcome,
          error: null,
          ...applied,
        });
        await refresh();
      } catch (err) {
        setError(String(err));
      } finally {
        activeRuns.current.delete(automation.id);
      }
    }
  }, [refresh]);

  const runNow = useCallback(
    async (automation: Automation) => {
      if (activeRuns.current.has(automation.id)) return;
      const now = Date.now();
      const slot = automation.nextRunAt;
      const next = nextSchedule(scheduleOf(automation), slot);
      const claimed = await takeDueAutomation(automation.id, slot, next, now);
      if (!claimed) {
        await refresh();
        return;
      }
      activeRuns.current.add(automation.id);
      try {
        await refresh();
        const outcome = await callbacksRef.current.dispatch({ ...automation, nextRunAt: next });
        const applied =
          outcome === "skipped"
            ? {
                consecutiveFailures: automation.consecutiveFailures,
                enabled: automation.enabled,
                pausedReason: automation.pausedReason,
              }
            : applyRunOutcome(automation, outcome);
        await recordAutomationResult({
          automationId: automation.id,
          runId: `${automation.id}:${slot}`,
          status: outcome === "skipped" ? "skipped_busy" : outcome,
          error: null,
          ...applied,
        });
        await refresh();
      } finally {
        activeRuns.current.delete(automation.id);
      }
    },
    [refresh],
  );

  const toggle = useCallback(
    async (automation: Automation) => {
      await setAutomationEnabled(automation.id, !automation.enabled);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (automation: Automation) => {
      await deleteAutomation(automation.id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void tick();
    }, TICK_MS);
    const subscriptions: Array<() => void> = [];
    void listen(AUTOMATIONS_CHANGED, () => {
      void refresh();
      void tick();
    }).then((unlisten) => subscriptions.push(unlisten));
    const onFocus = () => {
      void refresh().then(() => tick());
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, [refresh, tick]);

  return { automations, runs, error, refresh, runNow, toggle, remove, loadRuns };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAutomations.ts
git commit -m "Add the automations tick hook."
```

---

### Task 7: Automations surface — list, history, actions

**Files:**
- Create: `src/surfaces/AutomationsView.tsx`
- Create: `src/surfaces/AutomationsView.test.ts`

**Interfaces:**
- Consumes: `Automation`, `AutomationRun` (Task 5); `describeSchedule` (Task 3); `automationStatusLabel`, `nextRunLabel`, `runStatusLabel` (Task 4); `OverlayNav` (`../chrome/TitleBar`), `WindowControls` (`../chrome/WindowControls`), `LayoutTwoColumn`/`Plus`/`Play`/`Pause`/`Trash2`/`Pencil` icons, `HarnessIcon`.
- Produces (used by Tasks 8-9): `AutomationsView` with the props below and an exported `AutomationEditor` in the same file (Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/surfaces/AutomationsView.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationsView } from "./AutomationsView";
import type { Automation } from "../lib/automationStore";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    title: "Review PRs",
    prompt: "Review open PRs",
    sessionId: null,
    cwd: "/tmp/web",
    harness: "claude",
    model: "",
    runtimeMode: "supervised",
    modelSettings: "{}",
    scheduleKind: "weekdays",
    intervalHours: 1,
    weekday: 1,
    hour: 9,
    minute: 0,
    nextRunAt: 1_700_000_000_000,
    enabled: true,
    consecutiveFailures: 0,
    failurePolicy: "pause_after_3",
    pausedReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function render(overrides: Partial<Parameters<typeof AutomationsView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AutomationsView, {
      automations: [],
      runs: {},
      now: 1_700_000_000_000,
      cwd: "/tmp/web",
      besideRail: true,
      onClose: () => {},
      onCreate: () => {},
      onSave: () => {},
      onRunNow: () => {},
      onToggle: () => {},
      onDelete: () => {},
      onLoadRuns: () => {},
      onOpenSession: () => {},
      ...overrides,
    }),
  );
}

describe("AutomationsView", () => {
  it("shows an empty state", () => {
    expect(render()).toContain("No automations yet");
  });

  it("renders an automation with schedule and status", () => {
    const markup = render({ automations: [automation()] });
    expect(markup).toContain("Review PRs");
    expect(markup).toContain("Weekdays at 09:00");
    expect(markup).toContain("Active");
    expect(markup).toContain("Run now");
  });

  it("shows the failure pause state", () => {
    const markup = render({
      automations: [
        automation({ enabled: false, pausedReason: "failures", consecutiveFailures: 3 }),
      ],
    });
    expect(markup).toContain("Paused");
    expect(markup).toContain("3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/surfaces/AutomationsView.test.ts`
Expected: FAIL with `Cannot find module './AutomationsView'`.

- [ ] **Step 3: Implement the list surface**

```tsx
import { useState, type FormEvent } from "react";
import { OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
import { HarnessIcon } from "../chrome/HarnessIcon";
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
import { IS_MAC } from "../lib/platform";
import type { HarnessId } from "../lib/session";
import { describeSchedule, scheduleOf } from "../lib/automationSchedule";
import {
  automationStatusLabel,
  nextRunLabel,
  runStatusLabel,
} from "../lib/automations";
import type { Automation, AutomationRun } from "../lib/automationStore";

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
                  <p className="mt-1 text-[11px] text-content/50">
                    {t(describeSchedule(scheduleOf(automation)))}
                    {" · "}
                    {t(nextRunLabel(automation, now))}
                  </p>
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
```

`AutomationEditor` and `emptyAutomation` are implemented in Task 8; Task 7 imports both from the same file. Execution order: Task 8 before Task 7, or implement both files before running the test. Do not commit a stub.

- [ ] **Step 4: Run test**

Run: `npx vitest run src/surfaces/AutomationsView.test.ts`
Expected: PASS once Task 8's `AutomationEditor` exists (execution order: Task 8 before Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/surfaces/AutomationsView.tsx src/surfaces/AutomationsView.test.ts
git commit -m "Add the automations surface."
```

---

### Task 8: Automation editor

**Files:**
- Modify: `src/surfaces/AutomationsView.tsx` (add the exported `AutomationEditor`)
- Modify: `src/surfaces/AutomationsView.test.ts` (add editor tests)

**Interfaces:**
- Consumes: Task 3 (`nextRunAt`, `ScheduleKind`, `describeSchedule`), `CwdPicker`, `AccessPicker`, `ModelPicker`, `HARNESSES`/`type HarnessId`, `type RuntimeMode`, `type Recents`.
- Produces: `AutomationEditor({ automation, cwd, onCancel, onSave })` where `onSave` receives an `AutomationInput`-shaped object with `id`, schedule fields, and `nextRunAt` computed at save time.

- [ ] **Step 1: Add editor tests**

In `src/surfaces/AutomationsView.test.ts` add:

```ts
import { AutomationEditor } from "./AutomationsView";

describe("AutomationEditor", () => {
  it("renders prompt, schedule, and policy fields", () => {
    const markup = renderToStaticMarkup(
      createElement(AutomationEditor, {
        automation: automation(),
        cwd: "/tmp/web",
        onCancel: () => {},
        onSave: () => {},
      }),
    );
    expect(markup).toContain("Review open PRs");
    expect(markup).toContain("Weekdays");
    expect(markup).toContain("Pause after 3 failures");
  });
});
```

- [ ] **Step 2: Implement `AutomationEditor`**

Add to `src/surfaces/AutomationsView.tsx`:

```tsx
import { CwdPicker } from "../chrome/CwdPicker";
import { AccessPicker } from "../chrome/AccessPicker";
import { ModelPicker } from "../chrome/ModelPicker";
import { type HarnessId, type RuntimeMode } from "../lib/session";
import { loadRecents } from "../lib/recents";
import { nextRunAt, WEEKDAYS, type ScheduleKind } from "../lib/automationSchedule";

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
```

Add `WEEKDAYS` to the `automationSchedule` import and confirm `loadRecents` exists in `src/lib/recents.ts` (it does, at `src/lib/recents.ts:32`).

- [ ] **Step 3: Run tests and typecheck**

Run: `npx vitest run src/surfaces/AutomationsView.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/surfaces/AutomationsView.tsx src/surfaces/AutomationsView.test.ts
git commit -m "Add the automation editor."
```

---

### Task 9: App wiring, rail action, and dispatch

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/chrome/ProjectRail.tsx`
- Modify: `src/chrome/Sidebar.tsx`
- Modify: `src/chrome/ProjectRail.test.ts` (extend)

**Interfaces:**
- Consumes: `AutomationsView` (Tasks 7-8), `useAutomations` (Task 6), `upsertAutomation`/`setAutomationSession` (Task 5), `newSession` (`src/lib/session.ts:403`), `ensureOpenSession` (`App.tsx:3382`), `onSubmit` (`App.tsx:4818`), `onArchiveHistorySession`, `onSelectHistorySession`.
- Produces: `automationsViewOpen` surface + `onOpenAutomations` opener; `onOpenAutomations`/`automationsActive` props on `ProjectRail`/`Sidebar`.

- [ ] **Step 1: Extend the rail test**

In `src/chrome/ProjectRail.test.ts`, add:

```ts
  it("renders Automations below Kanban when wired", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectRail, {
        cwd: "/tmp/web",
        recents: [],
        onSelectProject: () => {},
        onOpenProject: () => {},
        onOpenInbox: () => {},
        onOpenKanban: () => {},
        onOpenAutomations: () => {},
      }),
    );
    expect(markup.indexOf("Automations")).toBeGreaterThan(markup.indexOf("Kanban"));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/ProjectRail.test.ts`
Expected: FAIL (no Automations label while `onOpenAutomations` is unknown).

- [ ] **Step 3: Wire the rail and the surface**

In `src/chrome/ProjectRail.tsx`:
1. Add `CalendarClock`-style icon: Hugeicons has no automations glyph; reuse `History` (already exported in `icons.tsx`) or add it to the import list.
2. Add optional props `onOpenAutomations?: () => void; automationsActive?: boolean; automationsPaused?: boolean;` and destructure them.
3. Render below the Kanban action:

```tsx
            {onOpenAutomations ? (
              <RailAction
                label={t("Automations")}
                icon={History}
                active={automationsActive}
                dot={automationsPaused}
                onClick={onOpenAutomations}
              />
            ) : null}
```

In `src/chrome/Sidebar.tsx`, forward `onOpenAutomations`, `automationsActive`, `automationsPaused` next to the Kanban props.

In `src/App.tsx`:

1. Import `AutomationsView` and `useAutomations`; import `newSession` (already imported), `upsertAutomation`, `setAutomationSession`, `type Automation` from `./lib/automationStore`, and `type HarnessId`/`type RuntimeMode` if not already imported.
2. Add state next to `kanbanViewOpen` (`App.tsx:868`):

```tsx
  const [automationsViewOpen, setAutomationsViewOpen] = useState(false);
```

3. Add the opener/leaver/session-opener and clear the new surface everywhere a screen-taking action closes Kanban (the same list as the Kanban wiring; include `kanbanViewOpen`'s opener):

```tsx
  const onOpenAutomations = useCallback(() => {
    setFilePickerOpen(false);
    setSettingsOpen(false);
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setKanbanViewOpen(false);
    setAutomationsViewOpen(true);
  }, []);

  const onLeaveAutomations = useCallback(() => {
    setAutomationsViewOpen(false);
  }, []);

  const onOpenAutomationSession = useCallback(
    (sessionId: string) => {
      setAutomationsViewOpen(false);
      setSidebarTab("sessions");
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );
```

4. Add `setAutomationsViewOpen(false)` to every handler that already closes `kanbanViewOpen` (find them with `grep -n "setKanbanViewOpen(false)" src/App.tsx`), and add `automationsViewOpen` to: the `kanbanViewOpenRef`-style ref (add `automationsViewOpenRef` next to it, used in the same three keyboard guards), `canGoBack`, `onRailBack` (before `onVisitBack`), `onRailForward`, the hidden/`aria-hidden`/`inert` group, and the footer condition.
5. Add the dispatch materializer and hook:

```tsx
  const dispatchAutomationRun = useCallback(
    async (automation: Automation): Promise<"completed" | "failed" | "cancelled" | "skipped"> => {
      let session = automation.sessionId
        ? sessionsRef.current.find((entry) => entry.id === automation.sessionId)
        : undefined;
      if (!session && automation.sessionId) {
        session = (await ensureOpenSession(automation.sessionId)) ?? undefined;
        if (!session) {
          const archivedRow = historyRef.current.find(
            (entry) => entry.id === automation.sessionId,
          );
          if (archivedRow?.archived) {
            await onArchiveHistorySession(automation.sessionId, false);
            session = (await ensureOpenSession(automation.sessionId)) ?? undefined;
          }
        }
      }
      if (!session) {
        const fresh = newSession(
          automation.harness as HarnessId,
          automation.cwd,
          automation.model,
          automation.runtimeMode as RuntimeMode,
          parseModelSettings(automation.modelSettings),
        );
        setSessions((current) => [...current, fresh]);
        await setAutomationSession(automation.id, fresh.id);
        session = fresh;
      }
      const current = sessionsRef.current.find((entry) => entry.id === session?.id) ?? session;
      if (!current) return "skipped";
      if (current.busy || (current.queuedMessages?.length ?? 0) > 0) return "skipped";
      return new Promise((resolve) => {
        onSubmit(current.id, automation.prompt, [], {
          onSettled: (outcome) => resolve(outcome.status),
        });
      });
    },
    [ensureOpenSession, onArchiveHistorySession, onSubmit],
  );

  const automations = useAutomations({ dispatch: dispatchAutomationRun });
```

Add a module-level helper next to the imports:

```ts
function parseModelSettings(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
```

Add `historyRef` if one does not already exist next to `sessionsRef`:

```tsx
  const historyRef = useRef(history);
  historyRef.current = history;
```

6. Render the surface after the Kanban block (`App.tsx:7813`):

```tsx
            {automationsViewOpen ? (
              <AutomationsView
                automations={automations.automations}
                runs={automations.runs}
                now={Date.now()}
                cwd={sidebarCwd}
                besideRail={projectRailOpen}
                onClose={onLeaveAutomations}
                onToggleSidebar={onToggleSidebar}
                onCreate={() => setNewAutomationId(crypto.randomUUID())}
                creatingId={newAutomationId}
                onCancelCreate={() => setNewAutomationId(null)}
                onSave={(input) => void upsertAutomation(input)}
                onRunNow={(automation) => void automations.runNow(automation)}
                onToggle={(automation) => void automations.toggle(automation)}
                onDelete={(automation) => void automations.remove(automation)}
                onLoadRuns={(id) => void automations.loadRuns(id)}
                onOpenSession={onOpenAutomationSession}
              />
            ) : null}
```

Add the create state next to `automationsViewOpen`:

```tsx
  const [newAutomationId, setNewAutomationId] = useState<string | null>(null);
```

7. Pass the rail props in the `Sidebar` render next to the Kanban props:

```tsx
            onOpenAutomations={onOpenAutomations}
            automationsActive={automationsViewOpen}
            automationsPaused={automations.automations.some(
              (automation) => !automation.enabled && automation.pausedReason === "failures",
            )}
```

8. Add `onOpenAutomations` to both `actions` ref objects.

- [ ] **Step 4: Test and typecheck**

Run: `npx vitest run src/chrome/ProjectRail.test.ts src/surfaces/AutomationsView.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/chrome/ProjectRail.tsx src/chrome/Sidebar.tsx src/chrome/ProjectRail.test.ts src/surfaces/AutomationsView.tsx
git commit -m "Wire automations into the app and rail."
```

---

### Task 10: Menu entries

**Files:**
- Modify: `src/chrome/MenuBar.tsx`
- Modify: `src-tauri/src/menu.rs`
- Modify: `src/App.tsx` (listener)

**Interfaces:**
- Consumes: `onOpenAutomations` from Task 9.
- Produces: `open_automations` handled on both menus.

- [ ] **Step 1: Web menu**

In `src/chrome/MenuBar.tsx`: add `onOpenAutomations?: () => void;` to `Props`, destructure it, add `case "open_automations": onOpenAutomations?.(); break;` to `handlePick`, and add the View item after Kanban:

```tsx
          { kind: "item", id: "open_automations", label: t("Automations") },
```

- [ ] **Step 2: Native menu**

In `src-tauri/src/menu.rs`: add `"Automations" => "Automações",` to `tr`, build next to `open_kanban`:

```rust
    let open_automations =
        MenuItemBuilder::with_id("open_automations", tr("Automations")).build(app)?;
```

add `.item(&open_automations)` after `.item(&open_kanban)` in the View submenu, and add `"open_automations"` to the dispatch allowlist arm.

- [ ] **Step 3: App listener**

In `src/App.tsx`, next to `listen("open_kanban", ...)`:

```tsx
      listen("open_automations", () => actions.current.onOpenAutomations()),
```

and pass `onOpenAutomations={onOpenAutomations}` to `<MenuBar>`.

- [ ] **Step 4: Check and commit**

Run: `npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: clean.

```bash
git add src/chrome/MenuBar.tsx src-tauri/src/menu.rs src/App.tsx
git commit -m "Add automations menu entries."
```

---

### Task 11: i18n, full checks, and manual verification

**Files:**
- Modify: `src/i18n/pt-BR.ts`

- [ ] **Step 1: Add pt-BR entries**

Add entries for every new key: `Automations`, `{count} scheduled`, `New automation`, `No automations yet`, `Run now`, `Pause`, `Resume`, `History`, `No runs yet`, `Delete this automation? Its session is kept.`, `Title`, `Prompt the automation should run`, `Hourly`, `Daily`, `Weekdays`, `Weekly`, `Hours`, `Weekday`, `Hour`, `Minute`, `Failure policy`, `Pause after 1 failure`, `Pause after 3 failures`, `Pause after 5 failures`, `Keep running`, `Paused after {count} failures`, `Paused`, `Disabled`, `Active`, `Running`, `Completed`, `Failed`, `Cancelled`, `Skipped`, `Missed`, `Due now`, `in {minutes} min`, `in {hours}h`, `in {days}d`, `Every {count}h at :{minute}`, `Daily at {time}`, `Weekdays at {time}`, `Weekly on {weekday} at {time}`, `Open session`, plus the weekday names if not already present. Reuse existing `Edit`, `Save`, `Cancel`, `Delete`.

- [ ] **Step 2: Run the full web suite**

Run: `npm run check:web`
Expected: all vitest files pass and `tsc --noEmit` is clean.

- [ ] **Step 3: Run the Rust checks**

Run: `npm run check:rust`
Expected: fmt clean, clippy clean, all tests pass.

- [ ] **Step 4: Manual verification**

With the app in dev mode:

1. Create an automation two minutes ahead on a scratch project; confirm the card shows the schedule and the countdown.
2. Watch the run start at the slot: the session appears (or is created), the transcript shows the prompt, and the history records `running` → `completed`.
3. Archive the automation's session, then run again: it unarchives/reuses the same session, not a new one.
4. Delete the session from history, run again: a fresh session is created and `session_id` is updated.
5. Start a long turn in the automation's session and trigger Run now: the run records `Skipped`.
6. Break the prompt (e.g. point the automation at an invalid cwd) until it fails; confirm the pause after the configured threshold and the rail dot.
7. Close the app past a slot, reopen: the history records `missed` and the schedule advances.
8. Pause/resume, run-now, edit, and delete (confirm the session survives) all behave; the surface opens from the rail and from View → Automations on both menus.
9. Restart the app: automations persist and the schedule continues.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/pt-BR.ts
git commit -m "Translate automations."
```

---

## Self-review notes

- Spec coverage: tables and CRUD (Task 1), conditional claim/missed/result (Task 2), schedule math (Task 3), policy and tick planning (Task 4), API wrappers (Task 5), hook (Task 6), surface list/history (Task 7), editor (Task 8), App wiring and rail (Task 9), menus (Task 10), i18n and manual verification (Task 11).
- Task order note: Task 4 imports `Automation` from Task 5's module; execute Task 5 before Task 4, or merge the two commits. The plan lists Task 4 before Task 5 for narrative order — implementers must run Task 5 first.
- Deviation from the spec's first draft, already in the spec: failure policy counters are computed in TypeScript (`applyRunOutcome`) and persisted through one result command; the backend never reinterprets the policy.
- Type consistency: `Automation`, `AutomationInput`, `AutomationRun`, `AutomationRunStatus`, `RunOutcome`, `automationTickPlan`, `applyRunOutcome`, `nextRunAt`, `scheduleOf`, `describeSchedule`, and the command argument names are identical across tasks.
