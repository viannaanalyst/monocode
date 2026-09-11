use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::dirs_home;
use crate::harness::{apply_gui_env, resolve_gui_binary};

/// Cold runs include an npm download; warm runs finish in a couple of seconds.
const RUN_TIMEOUT: Duration = Duration::from_secs(90);
/// Collapse the polling of several windows into a single ccusage invocation.
const CACHE_TTL: Duration = Duration::from_secs(30);
const MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageCostFetch {
    pub status: String,
    pub body: Option<String>,
    pub error: Option<String>,
}

struct CacheEntry {
    stored_at: Instant,
    body: String,
}

static CACHE: Mutex<Option<CacheEntry>> = Mutex::new(None);

/// Per-session token/cost totals from the local `ccusage` CLI.
///
/// `ccusage` reads the usage files the harnesses already write (Claude Code,
/// Codex, opencode, …) and prices them with models.dev. We shell out instead
/// of re-implementing per-provider log parsing and a pricing table.
#[tauri::command]
pub async fn fetch_usage_cost(force: Option<bool>) -> Result<UsageCostFetch, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_usage_cost_sync(force.unwrap_or(false)))
        .await
        .map_err(|error| error.to_string())
}

fn fetch_usage_cost_sync(force: bool) -> UsageCostFetch {
    if !force {
        if let Some(body) = cached_body() {
            return ok(body);
        }
    }

    let (program, args) = match resolve_runner() {
        Some(runner) => runner,
        None => {
            return unavailable("ccusage not found (Node/npx required)");
        }
    };

    let home = dirs_home();
    match run_captured(&program, &args, home.as_deref()) {
        Ok(body) => {
            store_cache(&body);
            ok(body)
        }
        Err(error) => error_cost(error),
    }
}

fn resolve_runner() -> Option<(std::path::PathBuf, Vec<String>)> {
    if let Some(path) = resolve_gui_binary("ccusage") {
        return Some((path, vec!["session".into(), "--json".into()]));
    }
    let npx = resolve_gui_binary("npx")?;
    Some((
        npx,
        vec![
            "-y".into(),
            "ccusage@latest".into(),
            "session".into(),
            "--json".into(),
        ],
    ))
}

fn run_captured(program: &Path, args: &[String], cwd: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_gui_env(&mut cmd);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("Could not run ccusage: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let out_handle = std::thread::spawn(move || read_limited(stdout, MAX_STDOUT_BYTES));
    let err_handle = std::thread::spawn(move || read_limited(stderr, MAX_STDERR_BYTES));

    let started = Instant::now();
    let mut timed_out = false;
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if started.elapsed() > RUN_TIMEOUT => {
                timed_out = true;
                let _ = child.kill();
                let _ = child.wait();
                break false;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => return Err(format!("ccusage failed: {error}")),
        }
    };

    let stdout = out_handle.join().unwrap_or_default();
    let stderr = err_handle.join().unwrap_or_default();

    if timed_out {
        return Err("ccusage timed out".into());
    }
    if !success && stdout.trim().is_empty() {
        let message = stderr.trim();
        return Err(if message.is_empty() {
            "ccusage returned no data".into()
        } else {
            message.to_string()
        });
    }
    if serde_json::from_str::<serde_json::Value>(&stdout).is_err() {
        return Err("ccusage returned invalid JSON".into());
    }
    Ok(stdout)
}

fn read_limited<R: Read>(reader: Option<R>, limit: usize) -> String {
    let Some(mut reader) = reader else {
        return String::new();
    };
    let mut buffer = [0u8; 8192];
    let mut collected = Vec::new();
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = limit.saturating_sub(collected.len());
                if remaining == 0 {
                    break;
                }
                collected.extend_from_slice(&buffer[..count.min(remaining)]);
                if collected.len() >= limit {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&collected).into_owned()
}

fn cached_body() -> Option<String> {
    let guard = CACHE.lock().ok()?;
    let entry = guard.as_ref()?;
    if entry.stored_at.elapsed() <= CACHE_TTL {
        Some(entry.body.clone())
    } else {
        None
    }
}

fn store_cache(body: &str) {
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(CacheEntry {
            stored_at: Instant::now(),
            body: body.to_string(),
        });
    }
}

fn ok(body: String) -> UsageCostFetch {
    UsageCostFetch {
        status: "ok".into(),
        body: Some(body),
        error: None,
    }
}

fn unavailable(error: &str) -> UsageCostFetch {
    UsageCostFetch {
        status: "unavailable".into(),
        body: None,
        error: Some(error.into()),
    }
}

fn error_cost(error: String) -> UsageCostFetch {
    UsageCostFetch {
        status: "error".into(),
        body: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_limited_stops_at_limit() {
        let data = b"0123456789".to_vec();
        assert_eq!(read_limited(Some(std::io::Cursor::new(data)), 4), "0123");
    }

    #[test]
    fn read_limited_reads_all_without_limit() {
        let data = b"abc".to_vec();
        assert_eq!(read_limited(Some(std::io::Cursor::new(data)), 99), "abc");
        let empty: Vec<u8> = Vec::new();
        assert_eq!(read_limited(Some(std::io::Cursor::new(empty)), 99), "");
    }
}
