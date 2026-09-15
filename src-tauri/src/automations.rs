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
