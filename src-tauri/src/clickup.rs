use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const CLICKUP_API: &str = "https://api.clickup.com/api/v2";
const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_LIMIT: u32 = 50;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpStatus {
    pub connected: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpAssignee {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTask {
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
    pub labels: Vec<ClickUpLabel>,
    pub assignees: Vec<ClickUpAssignee>,
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
pub struct ClickUpTaskDetails {
    pub body: String,
    pub author: String,
    pub author_avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTaskComment {
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
    pub replies: Vec<ClickUpTaskComment>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClickUpTaskThread {
    pub comments: Vec<ClickUpTaskComment>,
    pub truncated: bool,
    pub review_decision: String,
    pub base_ref_name: String,
    pub head_ref_name: String,
}

#[tauri::command(async)]
pub fn clickup_status(app: AppHandle) -> Result<ClickUpStatus, String> {
    Ok(ClickUpStatus {
        connected: read_token(&app)?.is_some(),
    })
}

#[tauri::command]
pub async fn clickup_set_token(app: AppHandle, token: String) -> Result<ClickUpStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = token.trim().to_string();
        if trimmed.is_empty() {
            delete_token(&app)?;
            return Ok(ClickUpStatus { connected: false });
        }
        clickup_get(&trimmed, "/user")?;
        write_token(&app, &trimmed)?;
        Ok(ClickUpStatus { connected: true })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clickup_list_tasks(
    app: AppHandle,
    assigned_to_me: bool,
    state: String,
    limit: Option<u32>,
) -> Result<Vec<ClickUpTask>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = require_token(&app)?;
        let user = clickup_get(&token, "/user")?;
        let user_id = user
            .get("user")
            .and_then(|user| user.get("id"))
            .and_then(value_to_string)
            .unwrap_or_default();
        let teams = clickup_get(&token, "/team")?;
        let team_rows = teams
            .get("teams")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let include_closed = state == "all";
        let max = limit.unwrap_or(DEFAULT_LIMIT).min(100);
        let mut out = Vec::new();
        for team in team_rows {
            let team_id = string_field(&team, "id").unwrap_or_default();
            let team_name = string_field(&team, "name").unwrap_or_default();
            if team_id.is_empty() {
                continue;
            }
            let mut path = format!(
                "/team/{}/task?include_closed={}&subtasks=true&order_by=updated&reverse=true&page=0",
                encode(&team_id),
                include_closed
            );
            if assigned_to_me && !user_id.is_empty() {
                path.push_str(&format!("&assignees[]={}", encode(&user_id)));
            }
            let data = clickup_get(&token, &path)?;
            let tasks = data
                .get("tasks")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for task in tasks.iter().take(max as usize) {
                out.push(task_from(task, &team_id, &team_name));
            }
        }
        Ok(out)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clickup_task_details(
    app: AppHandle,
    id: String,
) -> Result<ClickUpTaskDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = require_token(&app)?;
        let data = clickup_get(&token, &format!("/task/{}", encode(&id)))?;
        let creator = data.get("creator").cloned().unwrap_or(Value::Null);
        let body = string_field(&data, "description")
            .filter(|text| !text.is_empty())
            .or_else(|| string_field(&data, "text_content"))
            .unwrap_or_default();
        Ok(ClickUpTaskDetails {
            body,
            author: string_field(&creator, "username").unwrap_or_default(),
            author_avatar_url: string_field(&creator, "profilePicture").unwrap_or_default(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clickup_task_thread(app: AppHandle, id: String) -> Result<ClickUpTaskThread, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = require_token(&app)?;
        let data = clickup_get(&token, &format!("/task/{}/comment", encode(&id)))?;
        let rows = data
            .get("comments")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let comments = rows.iter().map(comment_from).collect();
        Ok(ClickUpTaskThread {
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
pub async fn clickup_task_comment(
    app: AppHandle,
    id: String,
    body: String,
    parent_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = require_token(&app)?;
        if body.trim().is_empty() {
            return Err("Comment is empty".into());
        }
        let mut payload = json!({ "comment_text": body.trim(), "notify_all": false });
        if let Some(parent) = parent_id.filter(|value| !value.trim().is_empty()) {
            payload["parent"] = json!(parent.trim());
        }
        clickup_post(&token, &format!("/task/{}/comment", encode(&id)), &payload)?;
        Ok(String::new())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn task_from(row: &Value, team_id: &str, team_name: &str) -> ClickUpTask {
    let status = row.get("status").cloned().unwrap_or(Value::Null);
    let list = row.get("list").cloned().unwrap_or(Value::Null);
    let project = row.get("project").cloned().unwrap_or(Value::Null);
    let id = string_field(row, "id").unwrap_or_default();
    let custom = string_field(row, "custom_id").filter(|value| !value.is_empty());
    let identifier = custom.clone().unwrap_or_else(|| id.clone());
    let labels = row
        .get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(|tag| string_field(tag, "name"))
                .map(|name| ClickUpLabel {
                    name,
                    color: String::new(),
                })
                .collect()
        })
        .unwrap_or_default();
    let assignees = row
        .get("assignees")
        .and_then(Value::as_array)
        .map(|people| {
            people
                .iter()
                .map(|person| ClickUpAssignee {
                    login: string_field(person, "username")
                        .or_else(|| string_field(person, "email"))
                        .unwrap_or_default(),
                    avatar_url: string_field(person, "profilePicture").unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();
    let repo = string_field(&list, "name")
        .or_else(|| string_field(&project, "name"))
        .unwrap_or_default();
    ClickUpTask {
        provider: "clickup".into(),
        kind: "clickup".into(),
        id,
        number: 0,
        identifier,
        title: string_field(row, "name").unwrap_or_default(),
        url: string_field(row, "url").unwrap_or_default(),
        state: string_field(&status, "status").unwrap_or_default(),
        state_type: string_field(&status, "type").unwrap_or_default(),
        updated_at: row
            .get("date_updated")
            .and_then(value_to_string)
            .unwrap_or_default(),
        labels,
        assignees,
        draft: false,
        repo,
        team_id: team_id.to_string(),
        team_name: team_name.to_string(),
        project_id: string_field(&project, "id").unwrap_or_default(),
        project_name: string_field(&project, "name").unwrap_or_default(),
        project_path: String::new(),
    }
}

fn comment_from(row: &Value) -> ClickUpTaskComment {
    let user = row.get("user").cloned().unwrap_or(Value::Null);
    let replies = row
        .get("replies")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().map(comment_from).collect())
        .unwrap_or_default();
    ClickUpTaskComment {
        id: string_field(row, "id").unwrap_or_default(),
        kind: "comment".into(),
        author: string_field(&user, "username")
            .or_else(|| string_field(&user, "email"))
            .unwrap_or_default(),
        author_avatar_url: string_field(&user, "profilePicture").unwrap_or_default(),
        body: string_field(row, "comment_text")
            .or_else(|| string_field(row, "comment"))
            .unwrap_or_default(),
        created_at: row
            .get("date")
            .and_then(value_to_string)
            .unwrap_or_default(),
        url: String::new(),
        state: String::new(),
        path: String::new(),
        line: None,
        resolved: row
            .get("resolved")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        thread_id: String::new(),
        replies,
    }
}

fn clickup_get(token: &str, path: &str) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let result = agent
        .get(&format!("{CLICKUP_API}{path}"))
        .set("Authorization", token)
        .set("Accept", "application/json")
        .call();
    clickup_response(result)
}

fn clickup_post(token: &str, path: &str, body: &Value) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let payload = serde_json::to_string(body).map_err(|error| error.to_string())?;
    let result = agent
        .post(&format!("{CLICKUP_API}{path}"))
        .set("Authorization", token)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .send_string(&payload);
    clickup_response(result)
}

fn clickup_response(result: Result<ureq::Response, ureq::Error>) -> Result<Value, String> {
    let response = match result {
        Ok(response) => response,
        Err(ureq::Error::Status(status, response)) => {
            let body = response.into_string().unwrap_or_default();
            return Err(clickup_http_error(status, &body));
        }
        Err(_) => return Err("Could not reach ClickUp".into()),
    };
    let status = response.status();
    let text = response
        .into_string()
        .map_err(|_| "ClickUp returned an unreadable response".to_string())?;
    if !(200..300).contains(&status) {
        return Err(clickup_http_error(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&text).map_err(|_| "ClickUp returned invalid JSON".to_string())
}

fn clickup_http_error(status: u16, body: &str) -> String {
    if status == 401 || status == 403 {
        return "ClickUp token is invalid".into();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
        if let Some(message) = parsed.get("err").and_then(Value::as_str) {
            if !message.trim().is_empty() {
                return message.to_string();
            }
        }
    }
    format!("ClickUp request failed ({status})")
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
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

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("clickup-token"))
}

fn read_token(app: &AppHandle) -> Result<Option<String>, String> {
    let path = token_path(app)?;
    match fs::read_to_string(&path) {
        Ok(raw) => {
            let token = raw.trim().to_string();
            if token.is_empty() {
                Ok(None)
            } else {
                Ok(Some(token))
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn require_token(app: &AppHandle) -> Result<String, String> {
    read_token(app)?.ok_or_else(|| "Connect ClickUp in Settings".to_string())
}

fn write_token(app: &AppHandle, token: &str) -> Result<(), String> {
    let path = token_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_secret_file(&path, token)
}

fn delete_token(app: &AppHandle) -> Result<(), String> {
    let path = token_path(app)?;
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
    fn task_uses_custom_id_when_present() {
        let row = json!({
            "id": "abc123",
            "custom_id": "CU-88",
            "name": "Refinar scroll",
            "status": { "status": "in progress", "type": "custom" },
            "list": { "name": "Backlog" },
            "tags": [{ "name": "frontend" }],
            "assignees": [{ "username": "gabriel" }]
        });
        let task = task_from(&row, "team-1", "Team");
        assert_eq!(task.identifier, "CU-88");
        assert_eq!(task.state, "in progress");
        assert_eq!(task.state_type, "custom");
        assert_eq!(task.repo, "Backlog");
        assert_eq!(task.labels[0].name, "frontend");
        assert_eq!(task.assignees[0].login, "gabriel");
    }

    #[test]
    fn comments_keep_nested_replies() {
        let row = json!({
            "id": "1",
            "comment_text": "root",
            "user": { "username": "a" },
            "replies": [{ "id": "2", "comment_text": "child", "user": { "username": "b" } }]
        });
        let comment = comment_from(&row);
        assert_eq!(comment.replies.len(), 1);
        assert_eq!(comment.replies[0].body, "child");
    }
}
