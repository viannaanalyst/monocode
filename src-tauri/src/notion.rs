use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const NOTION_API: &str = "https://api.notion.com/v1";
const NOTION_VERSION: &str = "2022-06-28";
const HTTP_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionStatus {
    pub connected: bool,
    pub database_id: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionAssignee {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionTask {
    pub provider: String,
    pub kind: String,
    pub id: String,
    pub identifier: String,
    pub number: i64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub state_type: String,
    pub updated_at: String,
    pub labels: Vec<NotionLabel>,
    pub assignees: Vec<NotionAssignee>,
    pub draft: bool,
    pub repo: String,
    pub team_id: String,
    pub team_name: String,
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionTaskDetails {
    pub body: String,
    pub author: String,
    pub author_avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionTaskComment {
    pub id: String,
    pub kind: String,
    pub author: String,
    pub author_avatar_url: String,
    pub body: String,
    pub created_at: String,
    pub url: String,
    pub state: String,
    pub path: String,
    pub line: Option<i64>,
    pub resolved: bool,
    pub thread_id: String,
    pub replies: Vec<NotionTaskComment>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionTaskThread {
    pub comments: Vec<NotionTaskComment>,
    pub truncated: bool,
    pub review_decision: String,
    pub base_ref_name: String,
    pub head_ref_name: String,
}

#[derive(Clone)]
struct NotionConfig {
    token: String,
    database_id: String,
}

#[tauri::command(async)]
pub fn notion_status(app: AppHandle) -> Result<NotionStatus, String> {
    Ok(match read_config(&app)? {
        Some(config) => NotionStatus {
            connected: true,
            database_id: config.database_id,
        },
        None => NotionStatus {
            connected: false,
            database_id: String::new(),
        },
    })
}

#[tauri::command]
pub async fn notion_set_config(
    app: AppHandle,
    token: String,
    database_id: String,
) -> Result<NotionStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = token.trim().to_string();
        if token.is_empty() {
            delete_config(&app)?;
            return Ok(NotionStatus {
                connected: false,
                database_id: String::new(),
            });
        }
        let database_id = normalize_database_id(&database_id);
        if database_id.is_empty() {
            return Err("Enter the Notion database id".into());
        }
        let config = NotionConfig { token, database_id };
        notion_request(
            &config,
            "POST",
            &format!("/databases/{}/query", config.database_id),
            Some(json!({ "page_size": 1 })),
        )?;
        write_config(&app, &config)?;
        Ok(NotionStatus {
            connected: true,
            database_id: config.database_id,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn notion_list_tasks(app: AppHandle, state: String) -> Result<Vec<NotionTask>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let open_only = state != "all";
        let payload = json!({
            "page_size": 100,
            "sorts": [{ "timestamp": "last_edited_time", "direction": "descending" }]
        });
        let data = notion_request(
            &config,
            "POST",
            &format!("/databases/{}/query", config.database_id),
            Some(payload),
        )?;
        let rows = data
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut out: Vec<NotionTask> = rows.iter().map(task_from).collect();
        if open_only {
            out.retain(|task| task.state_type.to_lowercase() != "complete");
        }
        Ok(out)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn notion_task_details(app: AppHandle, id: String) -> Result<NotionTaskDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let data = notion_request(
            &config,
            "GET",
            &format!("/blocks/{}/children?page_size=100", encode(&id)),
            None,
        )?;
        let rows = data
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut body = String::new();
        for block in &rows {
            blocks_to_markdown(block, &mut body);
        }
        Ok(NotionTaskDetails {
            body: collapse_blank_lines(body.trim()),
            author: String::new(),
            author_avatar_url: String::new(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn notion_task_thread(app: AppHandle, id: String) -> Result<NotionTaskThread, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let data = notion_request(
            &config,
            "GET",
            &format!("/comments?block_id={}", encode(&id)),
            None,
        )?;
        let rows = data
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let comments = rows.iter().map(comment_from).collect();
        Ok(NotionTaskThread {
            comments,
            truncated: false,
            review_decision: String::new(),
            base_ref_name: String::new(),
            head_ref_name: String::new(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn notion_task_comment(
    app: AppHandle,
    id: String,
    body: String,
    parent_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = parent_id;
        let config = require_config(&app)?;
        if body.trim().is_empty() {
            return Err("Comment is empty".into());
        }
        let payload = json!({
            "parent": { "page_id": id },
            "rich_text": [{ "type": "text", "text": { "content": body.trim() } }]
        });
        let created = notion_request(&config, "POST", "/comments", Some(payload))?;
        Ok(string_field(&created, "id").unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn task_from(row: &Value) -> NotionTask {
    let id = string_field(row, "id").unwrap_or_default();
    let properties = row.get("properties").cloned().unwrap_or(Value::Null);
    let mut title = String::new();
    let mut state = String::new();
    let mut state_type = String::new();
    let mut labels = Vec::new();
    let mut assignees = Vec::new();
    if let Some(map) = properties.as_object() {
        for value in map.values() {
            match value.get("type").and_then(Value::as_str).unwrap_or("") {
                "title" => {
                    if title.is_empty() {
                        title = rich_text_plain(value.get("title"));
                    }
                }
                "status" => {
                    let status = value.get("status").cloned().unwrap_or(Value::Null);
                    state = string_field(&status, "name").unwrap_or_default();
                    state_type = string_field(&status, "group").unwrap_or_default();
                }
                "select" if state.is_empty() => {
                    let select = value.get("select").cloned().unwrap_or(Value::Null);
                    state = string_field(&select, "name").unwrap_or_default();
                }
                "people" if assignees.is_empty() => {
                    if let Some(people) = value.get("people").and_then(Value::as_array) {
                        assignees = people
                            .iter()
                            .map(|person| NotionAssignee {
                                login: string_field(person, "name")
                                    .or_else(|| string_field(person, "id"))
                                    .unwrap_or_default(),
                                avatar_url: string_field(person, "avatar_url").unwrap_or_default(),
                            })
                            .collect();
                    }
                }
                "multi_select" if labels.is_empty() => {
                    if let Some(options) = value.get("multi_select").and_then(Value::as_array) {
                        labels = options
                            .iter()
                            .filter_map(|option| string_field(option, "name"))
                            .map(|name| NotionLabel {
                                name,
                                color: String::new(),
                            })
                            .collect();
                    }
                }
                _ => {}
            }
        }
    }
    let short = id.replace('-', "");
    let identifier = short.chars().take(8).collect::<String>();
    NotionTask {
        provider: "notion".into(),
        kind: "notion".into(),
        id,
        identifier,
        number: 0,
        title,
        url: string_field(row, "url").unwrap_or_default(),
        state,
        state_type,
        updated_at: string_field(row, "last_edited_time").unwrap_or_default(),
        labels,
        assignees,
        draft: false,
        repo: String::new(),
        team_id: String::new(),
        team_name: String::new(),
        project_id: String::new(),
        project_name: String::new(),
        project_path: String::new(),
    }
}

fn comment_from(row: &Value) -> NotionTaskComment {
    let created_by = row.get("created_by").cloned().unwrap_or(Value::Null);
    NotionTaskComment {
        id: string_field(row, "id").unwrap_or_default(),
        kind: "comment".into(),
        author: string_field(&created_by, "name")
            .or_else(|| string_field(&created_by, "id"))
            .unwrap_or_default(),
        author_avatar_url: string_field(&created_by, "avatar_url").unwrap_or_default(),
        body: rich_text_plain(row.get("rich_text")),
        created_at: string_field(row, "created_time").unwrap_or_default(),
        url: String::new(),
        state: String::new(),
        path: String::new(),
        line: None,
        resolved: false,
        thread_id: String::new(),
        replies: Vec::new(),
    }
}

fn rich_text_plain(value: Option<&Value>) -> String {
    let Some(items) = value.and_then(Value::as_array) else {
        return String::new();
    };
    items
        .iter()
        .map(|item| {
            let text = string_field(item, "plain_text")
                .or_else(|| {
                    item.get("text")
                        .and_then(|text| string_field(text, "content"))
                })
                .unwrap_or_default();
            let Some(annotations) = item.get("annotations") else {
                return text;
            };
            let mut out = text;
            if annotations.get("code").and_then(Value::as_bool) == Some(true) {
                out = format!("`{out}`");
            }
            if annotations.get("bold").and_then(Value::as_bool) == Some(true) {
                out = format!("**{out}**");
            }
            if annotations.get("italic").and_then(Value::as_bool) == Some(true) {
                out = format!("*{out}*");
            }
            if annotations.get("strikethrough").and_then(Value::as_bool) == Some(true) {
                out = format!("~~{out}~~");
            }
            out
        })
        .collect::<Vec<_>>()
        .join("")
}

fn blocks_to_markdown(block: &Value, out: &mut String) {
    let kind = block.get("type").and_then(Value::as_str).unwrap_or("");
    let payload = block.get(kind).cloned().unwrap_or(Value::Null);
    let text = rich_text_plain(payload.get("rich_text"));
    match kind {
        "paragraph" => out.push_str(&format!("{text}\n\n")),
        "heading_1" | "heading_2" | "heading_3" => {
            let level = kind
                .chars()
                .last()
                .and_then(|c| c.to_digit(10))
                .unwrap_or(1);
            out.push_str(&"#".repeat(level as usize));
            out.push(' ');
            out.push_str(&format!("{text}\n\n"));
        }
        "bulleted_list_item" => out.push_str(&format!("- {text}\n")),
        "numbered_list_item" => out.push_str(&format!("1. {text}\n")),
        "to_do" => {
            let checked = payload
                .get("checked")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            out.push_str(&format!("- [{}] {text}\n", if checked { "x" } else { " " }));
        }
        "code" => {
            let language = string_field(&payload, "language").unwrap_or_default();
            out.push_str(&format!("```{language}\n{text}\n```\n\n"));
        }
        "quote" => out.push_str(&format!("> {text}\n\n")),
        "callout" => out.push_str(&format!("{text}\n\n")),
        "divider" => out.push_str("---\n\n"),
        "toggle" => out.push_str(&format!("{text}\n")),
        "child_page" => {
            let title = string_field(&payload, "title").unwrap_or_default();
            out.push_str(&format!("{title}\n\n"));
        }
        "image" => {
            if let Some(url) = payload
                .get("external")
                .or_else(|| payload.get("file"))
                .and_then(|source| string_field(source, "url"))
            {
                out.push_str(&format!("![image]({url})\n\n"));
            }
        }
        _ => {
            if !text.is_empty() {
                out.push_str(&format!("{text}\n\n"));
            }
        }
    }
}

fn collapse_blank_lines(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut newlines = 0;
    for ch in text.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines > 2 {
                continue;
            }
        } else {
            newlines = 0;
        }
        out.push(ch);
    }
    out.trim().to_string()
}

fn normalize_database_id(value: &str) -> String {
    let trimmed = value.trim();
    let candidate = trimmed
        .split('?')
        .next()
        .unwrap_or(trimmed)
        .trim_end_matches('/');
    let last = candidate.rsplit('/').next().unwrap_or(candidate);
    // A bare uuid keeps its dashes; anything else (a Notion URL slug) drops to
    // the trailing 32 hex characters of the id.
    if last.len() == 36 && last.chars().filter(|ch| *ch == '-').count() == 4 {
        return last.to_lowercase();
    }
    let hex: String = last.chars().filter(|ch| ch.is_ascii_hexdigit()).collect();
    if hex.len() >= 32 {
        hex[hex.len() - 32..].to_lowercase()
    } else {
        hex.to_lowercase()
    }
}

fn notion_request(
    config: &NotionConfig,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let url = format!("{NOTION_API}{path}");
    let request = match method {
        "GET" => agent.get(&url),
        "POST" => agent.post(&url),
        _ => return Err("Unsupported Notion request".into()),
    };
    let request = request
        .set("Authorization", &format!("Bearer {}", config.token))
        .set("Notion-Version", NOTION_VERSION)
        .set("Accept", "application/json");
    let result = match body {
        Some(payload) => {
            let text = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
            request
                .set("Content-Type", "application/json")
                .send_string(&text)
        }
        None => request.call(),
    };
    let response = match result {
        Ok(response) => response,
        Err(ureq::Error::Status(status, response)) => {
            let body = response.into_string().unwrap_or_default();
            return Err(notion_http_error(status, &body));
        }
        Err(_) => return Err("Could not reach Notion".into()),
    };
    let status = response.status();
    let text = response
        .into_string()
        .map_err(|_| "Notion returned an unreadable response".to_string())?;
    if !(200..300).contains(&status) {
        return Err(notion_http_error(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&text).map_err(|_| "Notion returned invalid JSON".to_string())
}

fn notion_http_error(status: u16, body: &str) -> String {
    if status == 401 {
        return "Notion token is invalid".into();
    }
    if status == 404 {
        return "Notion database not found or not shared with the integration".into();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
        if let Some(message) = parsed.get("message").and_then(Value::as_str) {
            if !message.trim().is_empty() {
                return message.to_string();
            }
        }
    }
    format!("Notion request failed ({status})")
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
}

fn encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("notion-config"))
}

fn read_config(app: &AppHandle) -> Result<Option<NotionConfig>, String> {
    let path = config_path(app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let parsed: Value =
        serde_json::from_str(raw.trim()).map_err(|_| "Notion config is unreadable".to_string())?;
    let token = string_field(&parsed, "token").unwrap_or_default();
    let database_id = string_field(&parsed, "databaseId").unwrap_or_default();
    if token.is_empty() || database_id.is_empty() {
        return Ok(None);
    }
    Ok(Some(NotionConfig { token, database_id }))
}

fn require_config(app: &AppHandle) -> Result<NotionConfig, String> {
    read_config(app)?.ok_or_else(|| "Connect Notion in Settings".to_string())
}

fn write_config(app: &AppHandle, config: &NotionConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string(&json!({
        "token": config.token,
        "databaseId": config.database_id,
    }))
    .map_err(|error| error.to_string())?;
    write_secret_file(&path, &raw)
}

fn delete_config(app: &AppHandle) -> Result<(), String> {
    let path = config_path(app)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn write_secret_file(path: &Path, contents: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| error.to_string())?;
        file.write_all(contents.as_bytes())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_database_id_accepts_urls_and_uuids() {
        let url = "https://www.notion.so/team/Tarefas-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d?v=1";
        assert_eq!(
            normalize_database_id(url),
            "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
        );
        assert_eq!(
            normalize_database_id(" 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d "),
            "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
        );
    }

    #[test]
    fn task_from_reads_common_properties() {
        let row = json!({
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "url": "https://notion.so/x",
            "last_edited_time": "2026-09-11T00:00:00.000Z",
            "properties": {
                "Name": { "type": "title", "title": [{ "plain_text": "Spec de voz" }] },
                "Status": { "type": "status", "status": { "name": "Em progresso", "group": "in_progress" } },
                "Tags": { "type": "multi_select", "multi_select": [{ "name": "frontend" }] }
            }
        });
        let task = task_from(&row);
        assert_eq!(task.title, "Spec de voz");
        assert_eq!(task.state, "Em progresso");
        assert_eq!(task.state_type, "in_progress");
        assert_eq!(task.labels[0].name, "frontend");
        assert_eq!(task.identifier, "aaaaaaaa");
    }

    #[test]
    fn blocks_render_as_markdown() {
        let block = json!({
            "type": "heading_2",
            "heading_2": { "rich_text": [{ "plain_text": "Título", "annotations": {} }] }
        });
        let mut out = String::new();
        blocks_to_markdown(&block, &mut out);
        assert_eq!(out.trim(), "## Título");
    }
}
