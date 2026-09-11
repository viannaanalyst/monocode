use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_LIMIT: u32 = 50;
const ISSUE_FIELDS: &str =
    "summary,status,priority,issuetype,labels,updated,assignee,project,reporter";

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraStatus {
    pub connected: bool,
    pub site: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraAssignee {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssue {
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
    pub labels: Vec<JiraLabel>,
    pub assignees: Vec<JiraAssignee>,
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
pub struct JiraIssueDetails {
    pub body: String,
    pub author: String,
    pub author_avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueComment {
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
    pub replies: Vec<JiraIssueComment>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueThread {
    pub comments: Vec<JiraIssueComment>,
    pub truncated: bool,
    pub review_decision: String,
    pub base_ref_name: String,
    pub head_ref_name: String,
}

#[derive(Clone)]
struct JiraConfig {
    site: String,
    email: String,
    token: String,
}

impl JiraConfig {
    fn base(&self) -> String {
        format!("https://{}", self.site)
    }
}

#[tauri::command(async)]
pub fn jira_status(app: AppHandle) -> Result<JiraStatus, String> {
    Ok(match read_config(&app)? {
        Some(config) => JiraStatus {
            connected: true,
            site: config.site,
        },
        None => JiraStatus {
            connected: false,
            site: String::new(),
        },
    })
}

#[tauri::command]
pub async fn jira_set_config(
    app: AppHandle,
    site: String,
    email: String,
    token: String,
) -> Result<JiraStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = token.trim().to_string();
        if token.is_empty() {
            delete_config(&app)?;
            return Ok(JiraStatus {
                connected: false,
                site: String::new(),
            });
        }
        let site = normalize_site(&site);
        let email = email.trim().to_string();
        if site.is_empty() {
            return Err("Enter your Jira site (e.g. yourteam.atlassian.net)".into());
        }
        if email.is_empty() {
            return Err("Enter the e-mail for your Atlassian account".into());
        }
        let config = JiraConfig { site, email, token };
        jira_request(&config, "GET", "/rest/api/3/myself", None)?;
        write_config(&app, &config)?;
        Ok(JiraStatus {
            connected: true,
            site: config.site,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_list_issues(
    app: AppHandle,
    assigned_to_me: bool,
    state: String,
    limit: Option<u32>,
) -> Result<Vec<JiraIssue>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let open_only = state != "all";
        let jql = build_jql(assigned_to_me, open_only);
        let max = limit.unwrap_or(DEFAULT_LIMIT).min(200);
        let path = format!(
            "/rest/api/3/search?jql={}&fields={}&maxResults={}",
            encode(&jql),
            encode(ISSUE_FIELDS),
            max
        );
        let data = jira_request(&config, "GET", &path, None)?;
        Ok(parse_issues(&config, &data))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_issue_details(app: AppHandle, id: String) -> Result<JiraIssueDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let path = format!(
            "/rest/api/3/issue/{}?fields=description,reporter",
            encode(&id)
        );
        let data = jira_request(&config, "GET", &path, None)?;
        let fields = data.get("fields").cloned().unwrap_or(Value::Null);
        let reporter = fields.get("reporter").cloned().unwrap_or(Value::Null);
        Ok(JiraIssueDetails {
            body: adf_to_text(fields.get("description").unwrap_or(&Value::Null)),
            author: string_field(&reporter, "displayName").unwrap_or_default(),
            author_avatar_url: avatar_url(&reporter),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_issue_thread(app: AppHandle, id: String) -> Result<JiraIssueThread, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let path = format!("/rest/api/3/issue/{}/comment?maxResults=100", encode(&id));
        let data = jira_request(&config, "GET", &path, None)?;
        let rows = data
            .get("comments")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let comments = nest_comments(&rows);
        Ok(JiraIssueThread {
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
pub async fn jira_issue_comment(
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
        let path = format!("/rest/api/3/issue/{}/comment", encode(&id));
        let text = adf_paragraph(body.trim());
        // Replies are newer protocol; fall back to a flat comment if the
        // instance rejects `parentId` instead of failing the whole post.
        if let Some(parent) = parent_id.filter(|value| !value.trim().is_empty()) {
            let payload = json!({ "body": text.clone(), "parentId": parent.trim() });
            if let Ok(created) = jira_request(&config, "POST", &path, Some(payload)) {
                return Ok(string_field(&created, "self").unwrap_or_default());
            }
        }
        let created = jira_request(&config, "POST", &path, Some(json!({ "body": text })))?;
        Ok(string_field(&created, "self").unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn build_jql(assigned_to_me: bool, open_only: bool) -> String {
    let mut clauses: Vec<&str> = Vec::new();
    if assigned_to_me {
        clauses.push("assignee = currentUser()");
    }
    if open_only {
        clauses.push("statusCategory != Done");
    }
    if clauses.is_empty() {
        clauses.push("created is not EMPTY");
    }
    format!("{} ORDER BY updated DESC", clauses.join(" AND "))
}

fn parse_issues(config: &JiraConfig, data: &Value) -> Vec<JiraIssue> {
    data.get("issues")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().map(|row| issue_from(config, row)).collect())
        .unwrap_or_default()
}

fn issue_from(config: &JiraConfig, row: &Value) -> JiraIssue {
    let fields = row.get("fields").cloned().unwrap_or(Value::Null);
    let status = fields.get("status").cloned().unwrap_or(Value::Null);
    let status_category = status.get("statusCategory").cloned().unwrap_or(Value::Null);
    let project = fields.get("project").cloned().unwrap_or(Value::Null);
    let key = string_field(row, "key").unwrap_or_default();
    let labels = fields
        .get("labels")
        .and_then(Value::as_array)
        .map(|labels| {
            labels
                .iter()
                .filter_map(|label| label.as_str())
                .map(|name| JiraLabel {
                    name: name.to_string(),
                    color: String::new(),
                })
                .collect()
        })
        .unwrap_or_default();
    let assignees = fields
        .get("assignee")
        .filter(|value| !value.is_null())
        .map(|assignee| {
            vec![JiraAssignee {
                login: string_field(assignee, "displayName").unwrap_or_default(),
                avatar_url: avatar_url(assignee),
            }]
        })
        .unwrap_or_default();
    JiraIssue {
        provider: "jira".into(),
        kind: "jira".into(),
        id: string_field(row, "id").unwrap_or_default(),
        number: key
            .rsplit('-')
            .next()
            .and_then(|part| part.parse::<i64>().ok())
            .unwrap_or(0),
        identifier: key.clone(),
        title: string_field(&fields, "summary").unwrap_or_default(),
        url: format!("{}/browse/{}", config.base(), key),
        state: string_field(&status, "name").unwrap_or_default(),
        state_type: string_field(&status_category, "key")
            .or_else(|| string_field(&status_category, "name"))
            .unwrap_or_default(),
        updated_at: string_field(&fields, "updated").unwrap_or_default(),
        labels,
        assignees,
        draft: false,
        repo: string_field(&project, "key").unwrap_or_default(),
        team_id: string_field(&project, "id").unwrap_or_default(),
        team_name: string_field(&project, "name").unwrap_or_default(),
        project_id: String::new(),
        project_name: String::new(),
        project_path: String::new(),
    }
}

/// Nest replies under their parent when the provider reports `parentId`.
fn nest_comments(rows: &[Value]) -> Vec<JiraIssueComment> {
    let nodes: Vec<(Option<String>, JiraIssueComment)> = rows
        .iter()
        .map(|row| (string_field(row, "parentId"), comment_from(row)))
        .collect();
    let mut index: HashMap<&str, usize> = HashMap::new();
    for (position, (_, comment)) in nodes.iter().enumerate() {
        if !comment.id.is_empty() {
            index.insert(comment.id.as_str(), position);
        }
    }
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); nodes.len()];
    let mut roots: Vec<usize> = Vec::new();
    for (position, (parent, _)) in nodes.iter().enumerate() {
        match parent.as_deref().and_then(|id| index.get(id).copied()) {
            Some(parent_index) => children[parent_index].push(position),
            None => roots.push(position),
        }
    }
    fn build(
        position: usize,
        nodes: &[(Option<String>, JiraIssueComment)],
        children: &[Vec<usize>],
    ) -> JiraIssueComment {
        let mut comment = nodes[position].1.clone();
        comment.replies = children[position]
            .iter()
            .map(|&child| build(child, nodes, children))
            .collect();
        comment
    }
    roots
        .iter()
        .map(|&position| build(position, &nodes, &children))
        .collect()
}

fn comment_from(row: &Value) -> JiraIssueComment {
    let author = row.get("author").cloned().unwrap_or(Value::Null);
    JiraIssueComment {
        id: string_field(row, "id").unwrap_or_default(),
        kind: "comment".into(),
        author: string_field(&author, "displayName").unwrap_or_default(),
        author_avatar_url: avatar_url(&author),
        body: adf_to_text(row.get("body").unwrap_or(&Value::Null)),
        created_at: string_field(row, "created").unwrap_or_default(),
        url: String::new(),
        state: String::new(),
        path: String::new(),
        line: None,
        resolved: false,
        thread_id: String::new(),
        replies: Vec::new(),
    }
}

fn avatar_url(record: &Value) -> String {
    record
        .get("avatarUrls")
        .and_then(|urls| urls.get("48x48"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn jira_request(
    config: &JiraConfig,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let url = format!("{}{}", config.base(), path);
    let authorization = basic_auth(&config.email, &config.token);
    let request = match method {
        "GET" => agent.get(&url),
        "POST" => agent.post(&url),
        _ => return Err("Unsupported Jira request".into()),
    };
    let request = request
        .set("Authorization", &authorization)
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
            let text = response.into_string().unwrap_or_default();
            return Err(jira_http_error(status, &text));
        }
        Err(_) => return Err("Could not reach Jira".into()),
    };
    let status = response.status();
    let text = response
        .into_string()
        .map_err(|_| "Jira returned an unreadable response".to_string())?;
    if !(200..300).contains(&status) {
        return Err(jira_http_error(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&text).map_err(|_| "Jira returned invalid JSON".to_string())
}

fn basic_auth(email: &str, token: &str) -> String {
    format!("Basic {}", STANDARD.encode(format!("{email}:{token}")))
}

fn jira_http_error(status: u16, body: &str) -> String {
    if status == 401 || status == 403 {
        return "Jira credentials are invalid".into();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(body) {
        if let Some(messages) = parsed.get("errorMessages").and_then(Value::as_array) {
            let joined = messages
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" ");
            if !joined.is_empty() {
                return joined;
            }
        }
    }
    format!("Jira request failed ({status})")
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
}

/// Convert Atlassian Document Format into Markdown so the transcript renderer
/// keeps headings, lists, code, links, and emphasis.
fn adf_to_text(value: &Value) -> String {
    let mut out = String::new();
    adf_walk(value, &mut out);
    collapse_blank_lines(out.trim())
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

fn adf_walk(value: &Value, out: &mut String) {
    match value {
        Value::String(text) => out.push_str(text),
        Value::Array(items) => {
            for item in items {
                adf_walk(item, out);
            }
        }
        Value::Object(record) => adf_node(record, out),
        _ => {}
    }
}

fn adf_node(record: &serde_json::Map<String, Value>, out: &mut String) {
    let kind = record.get("type").and_then(Value::as_str).unwrap_or("");
    let children = record.get("content").cloned().unwrap_or(Value::Null);
    let attrs = record.get("attrs").cloned().unwrap_or(Value::Null);
    match kind {
        "text" => out.push_str(&adf_text(record)),
        "hardBreak" => out.push('\n'),
        "paragraph" => {
            adf_walk(&children, out);
            out.push_str("\n\n");
        }
        "heading" => {
            let level = attrs
                .get("level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6);
            out.push_str(&"#".repeat(level as usize));
            out.push(' ');
            adf_walk(&children, out);
            out.push_str("\n\n");
        }
        "bulletList" => adf_list(record, out, false),
        "orderedList" => adf_list(record, out, true),
        "codeBlock" => {
            let language = attrs.get("language").and_then(Value::as_str).unwrap_or("");
            out.push_str("```");
            out.push_str(language);
            out.push('\n');
            adf_walk(&children, out);
            if !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str("```\n\n");
        }
        "blockquote" => {
            let mut inner = String::new();
            adf_walk(&children, &mut inner);
            for line in inner.trim_end().lines() {
                out.push_str("> ");
                out.push_str(line);
                out.push('\n');
            }
            out.push('\n');
        }
        "rule" => out.push_str("---\n\n"),
        "mention" => {
            out.push('@');
            out.push_str(
                attrs
                    .get("text")
                    .or_else(|| attrs.get("displayName"))
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            );
        }
        "emoji" => out.push_str(
            attrs
                .get("text")
                .or_else(|| attrs.get("shortName"))
                .and_then(Value::as_str)
                .unwrap_or(""),
        ),
        "inlineCard" | "blockCard" | "embedCard" => {
            if let Some(url) = attrs.get("url").and_then(Value::as_str) {
                out.push_str(url);
            } else {
                adf_walk(&children, out);
            }
        }
        "table" => adf_table(&children, out),
        _ => adf_walk(&children, out),
    }
}

fn adf_list(record: &serde_json::Map<String, Value>, out: &mut String, ordered: bool) {
    let Some(items) = record.get("content").and_then(Value::as_array) else {
        return;
    };
    for (index, item) in items.iter().enumerate() {
        let marker = if ordered {
            format!("{}. ", index + 1)
        } else {
            "- ".to_string()
        };
        let mut inner = String::new();
        adf_walk(item, &mut inner);
        let mut lines = inner.trim_end().lines();
        if let Some(first) = lines.next() {
            out.push_str(&marker);
            out.push_str(first);
            out.push('\n');
        }
        for line in lines {
            out.push_str("  ");
            out.push_str(line);
            out.push('\n');
        }
    }
    out.push('\n');
}

fn adf_table(content: &Value, out: &mut String) {
    let Some(rows) = content.as_array() else {
        return;
    };
    for row in rows {
        let Some(cells) = row.get("content").and_then(Value::as_array) else {
            continue;
        };
        out.push('|');
        for cell in cells {
            let mut inner = String::new();
            adf_walk(cell, &mut inner);
            out.push(' ');
            out.push_str(&inner.trim().replace('\n', " "));
            out.push_str(" |");
        }
        out.push('\n');
    }
    out.push('\n');
}

fn adf_text(record: &serde_json::Map<String, Value>) -> String {
    let mut text = record
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let Some(marks) = record.get("marks").and_then(Value::as_array) else {
        return text;
    };
    let has = |name: &str| {
        marks
            .iter()
            .any(|mark| mark.get("type").and_then(Value::as_str) == Some(name))
    };
    if has("code") {
        text = format!("`{text}`");
    }
    if has("strong") {
        text = format!("**{text}**");
    }
    if has("em") {
        text = format!("*{text}*");
    }
    if has("strike") {
        text = format!("~~{text}~~");
    }
    if let Some(link) = marks
        .iter()
        .find(|mark| mark.get("type").and_then(Value::as_str) == Some("link"))
    {
        let href = link
            .get("attrs")
            .and_then(|attrs| attrs.get("href"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if !href.is_empty() {
            text = format!("[{text}]({href})");
        }
    }
    text
}

fn adf_paragraph(text: &str) -> Value {
    json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{ "type": "text", "text": text }]
        }]
    })
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

fn normalize_site(site: &str) -> String {
    let trimmed = site.trim().trim_end_matches('/');
    let stripped = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    stripped.trim_end_matches('/').to_string()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jira-config"))
}

fn read_config(app: &AppHandle) -> Result<Option<JiraConfig>, String> {
    let path = config_path(app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let parsed: Value =
        serde_json::from_str(raw.trim()).map_err(|_| "Jira config is unreadable".to_string())?;
    let site = string_field(&parsed, "site").unwrap_or_default();
    let email = string_field(&parsed, "email").unwrap_or_default();
    let token = string_field(&parsed, "token").unwrap_or_default();
    if site.is_empty() || token.is_empty() {
        return Ok(None);
    }
    Ok(Some(JiraConfig { site, email, token }))
}

fn require_config(app: &AppHandle) -> Result<JiraConfig, String> {
    read_config(app)?.ok_or_else(|| "Connect Jira in Settings".to_string())
}

fn write_config(app: &AppHandle, config: &JiraConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string(&json!({
        "site": config.site,
        "email": config.email,
        "token": config.token,
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
    fn normalize_site_strips_scheme_and_slash() {
        assert_eq!(
            normalize_site("https://team.atlassian.net/"),
            "team.atlassian.net"
        );
        assert_eq!(normalize_site("team.atlassian.net"), "team.atlassian.net");
        assert_eq!(normalize_site(" http://x/ "), "x");
    }

    #[test]
    fn build_jql_combines_filters() {
        assert_eq!(
            build_jql(true, true),
            "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
        );
        assert_eq!(
            build_jql(false, false),
            "created is not EMPTY ORDER BY updated DESC"
        );
    }

    #[test]
    fn adf_flattens_paragraphs_and_lists() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] },
                { "type": "bulletList", "content": [
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "First" }] }
                    ] }
                ] }
            ]
        });
        let text = adf_to_text(&doc);
        assert!(text.contains("Hello"));
        assert!(text.contains("- First"));
    }

    #[test]
    fn adf_keeps_formatting_as_markdown() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Title" }] },
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "bold", "marks": [{ "type": "strong" }] },
                    { "type": "text", "text": " and " },
                    { "type": "text", "text": "link", "marks": [{ "type": "link", "attrs": { "href": "https://x" } }] }
                ] }
            ]
        });
        let text = adf_to_text(&doc);
        assert!(text.contains("## Title"), "{text}");
        assert!(text.contains("**bold**"), "{text}");
        assert!(text.contains("[link](https://x)"), "{text}");
    }

    #[test]
    fn nest_comments_groups_replies() {
        let rows = vec![
            json!({ "id": "1", "body": { "type": "doc", "content": [] } }),
            json!({ "id": "2", "parentId": "1", "body": { "type": "doc", "content": [] } }),
        ];
        let comments = nest_comments(&rows);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].replies.len(), 1);
        assert_eq!(comments[0].replies[0].id, "2");
    }

    #[test]
    fn encode_escapes_reserved_characters() {
        assert_eq!(encode("a b=c"), "a%20b%3Dc");
    }
}
