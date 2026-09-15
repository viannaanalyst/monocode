# PR Write Actions (Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Inbox merge, review (approve / request changes / comment with inline comments), close/reopen, and edit labels/assignees/reviewers on GitHub pull requests.

**Architecture:** New Tauri commands in `src-tauri/src/fs.rs` wrap the authenticated `gh` CLI (REST flags for merge/state/edit, one GraphQL mutation for review submission). The frontend adds typed wrappers in `src/lib/githubTasks.ts`, a pure-logic module `src/lib/prReview.ts` for the pending review draft and action gating, and focused UI components (`PrActions`, `PrMetadataEditor`, `PrReviewBar`) wired into `InboxDetail`. The existing per-line comment affordance in `UnifiedDiffView` becomes pluggable so Inbox comments join the pending review instead of the chat.

**Tech Stack:** Rust (Tauri commands, serde), React + TypeScript, vitest (`renderToStaticMarkup`), `gh` CLI.

## Global Constraints

- Every GitHub mutation goes through the existing `gh` patterns in `fs.rs` (`gh_checked`, `gh_stdout`, `valid_github_node_id`); no new auth, no new dependencies.
- Pull requests only. Issues, GitLab MRs, Jira, Linear, ClickUp, and Notion flows stay unchanged.
- English strings are the i18n keys; add pt-BR entries to `src/i18n/pt-BR.ts` for every new user-facing string.
- Rust tests live in the existing `#[cfg(test)] mod tests` at `src-tauri/src/fs.rs:4589`. Web tests run with `npx vitest run <file>`.
- Commit messages follow the repo style: imperative sentence ending with a period (e.g. `Add PR merge action.`).
- Validation happens in Rust: reject unknown merge methods, invalid numbers, invalid node ids, and empty review payloads before calling `gh`.

---

### Task 1: Rust merge command

**Files:**
- Modify: `src-tauri/src/fs.rs` (command near `git_github_pr_diff`, `fs.rs:1063`; helper near `gh_checked`, `fs.rs:3152`; tests in `mod tests`, `fs.rs:4589`)
- Modify: `src-tauri/src/lib.rs:292` (register after `fs::git_github_pr_diff`)

**Interfaces:**
- Consumes: `gh_checked(root, args)` from `fs.rs:3156`.
- Produces: `git_github_pr_merge(cwd: String, number: i64, method: String, delete_branch: bool) -> Result<(), String>`; internal `pr_merge_args(number: i64, method: &str, delete_branch: bool) -> Result<Vec<String>, String>`.

- [ ] **Step 1: Write the failing test**

Add to `mod tests` in `fs.rs`:

```rust
#[test]
fn pr_merge_args_builds_method_and_branch_flags() {
    assert_eq!(
        pr_merge_args(42, "squash", true).unwrap(),
        vec!["pr", "merge", "42", "--squash", "--delete-branch"]
    );
    assert_eq!(
        pr_merge_args(7, "merge", false).unwrap(),
        vec!["pr", "merge", "7", "--merge"]
    );
    assert_eq!(
        pr_merge_args(7, "rebase", true).unwrap(),
        vec!["pr", "merge", "7", "--rebase", "--delete-branch"]
    );
    assert!(pr_merge_args(42, "fast-forward", false).is_err());
    assert!(pr_merge_args(0, "squash", false).is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_merge_args_builds_method_and_branch_flags`
Expected: FAIL with `cannot find function pr_merge_args`.

- [ ] **Step 3: Implement the helper and command**

In `fs.rs`, next to `gh_checked`:

```rust
/// Build `gh pr merge` arguments. Rejects anything `gh` would not accept.
fn pr_merge_args(number: i64, method: &str, delete_branch: bool) -> Result<Vec<String>, String> {
    if number <= 0 {
        return Err("Invalid pull request number".into());
    }
    let flag = match method.trim().to_lowercase().as_str() {
        "squash" => "--squash",
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => return Err("Unknown merge method".into()),
    };
    let mut args = vec![
        "pr".to_string(),
        "merge".to_string(),
        number.to_string(),
        flag.to_string(),
    ];
    if delete_branch {
        args.push("--delete-branch".into());
    }
    Ok(args)
}

fn git_github_pr_merge_for(
    root: &Path,
    number: i64,
    method: &str,
    delete_branch: bool,
) -> Result<(), String> {
    let args = pr_merge_args(number, method, delete_branch)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    gh_checked(root, &refs)?;
    Ok(())
}
```

Next to `git_github_pr_diff` (`fs.rs:1063`), add the command:

```rust
/// Merge a pull request with an explicit method, optionally deleting its branch.
#[tauri::command]
pub async fn git_github_pr_merge(
    cwd: String,
    number: i64,
    method: String,
    delete_branch: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_github_pr_merge_for(&expand_home(&cwd), number, &method, delete_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}
```

- [ ] **Step 4: Register the command**

In `src-tauri/src/lib.rs`, after `fs::git_github_pr_diff,` (line 292):

```rust
            fs::git_github_pr_merge,
```

- [ ] **Step 5: Run the test and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_merge_args_builds_method_and_branch_flags && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS and clean check.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/fs.rs src-tauri/src/lib.rs
git commit -m "Add GitHub PR merge command."
```

---

### Task 2: Rust close/reopen, metadata edit, and repo meta

**Files:**
- Modify: `src-tauri/src/fs.rs` (commands near `git_github_pr_diff`, helpers near `gh_checked`, tests in `mod tests`)
- Modify: `src-tauri/src/lib.rs` (registrations after the Task 1 line)

**Interfaces:**
- Consumes: `gh_checked`, `gh_stdout`, `git_github_repo_for`, `split_github_repo`, `GitHubLabel` (`fs.rs:841` region).
- Produces:
  - `git_github_pr_state(cwd: String, number: i64, close: bool) -> Result<(), String>`
  - `git_github_pr_edit(cwd: String, number: i64, input: GitHubPrEditInput) -> Result<(), String>`
  - `git_github_repo_meta(cwd: String) -> Result<GitHubRepoMeta, String>`
  - `GitHubPrEditInput { add_labels, remove_labels, add_assignees, remove_assignees, add_reviewers, remove_reviewers: Vec<String> }`
  - `GitHubRepoMeta { viewer_login: String, labels: Vec<GitHubLabel>, assignees: Vec<String>, reviewers: Vec<String> }`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests`:

```rust
#[test]
fn pr_edit_flags_join_values_and_skip_empty_lists() {
    let input = GitHubPrEditInput {
        add_labels: vec!["bug".into(), " ui ".into()],
        remove_labels: vec!["".into()],
        add_assignees: vec![],
        remove_assignees: vec!["octocat".into()],
        add_reviewers: vec!["alice".into(), "bob".into()],
        remove_reviewers: vec![],
    };
    assert_eq!(
        pr_edit_flags(&input),
        vec![
            "--add-label".to_string(),
            "bug,ui".to_string(),
            "--remove-assignee".to_string(),
            "octocat".to_string(),
            "--add-reviewer".to_string(),
            "alice,bob".to_string(),
        ]
    );
}

#[test]
fn pr_state_args_choose_close_or_reopen() {
    assert_eq!(
        pr_state_args(9, true).unwrap(),
        vec!["pr", "close", "9"]
    );
    assert_eq!(
        pr_state_args(9, false).unwrap(),
        vec!["pr", "reopen", "9"]
    );
    assert!(pr_state_args(0, true).is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_edit_flags_join_values_and_skip_empty_lists pr_state_args_choose_close_or_reopen`
Expected: FAIL with missing `GitHubPrEditInput` / `pr_edit_flags` / `pr_state_args`.

- [ ] **Step 3: Implement helpers and commands**

In `fs.rs`:

```rust
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrEditInput {
    #[serde(default)]
    pub add_labels: Vec<String>,
    #[serde(default)]
    pub remove_labels: Vec<String>,
    #[serde(default)]
    pub add_assignees: Vec<String>,
    #[serde(default)]
    pub remove_assignees: Vec<String>,
    #[serde(default)]
    pub add_reviewers: Vec<String>,
    #[serde(default)]
    pub remove_reviewers: Vec<String>,
}

fn push_list_flag(args: &mut Vec<String>, flag: &str, values: &[String]) {
    let cleaned: Vec<&str> = values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect();
    if cleaned.is_empty() {
        return;
    }
    args.push(flag.to_string());
    args.push(cleaned.join(","));
}

fn pr_edit_flags(input: &GitHubPrEditInput) -> Vec<String> {
    let mut args = Vec::new();
    push_list_flag(&mut args, "--add-label", &input.add_labels);
    push_list_flag(&mut args, "--remove-label", &input.remove_labels);
    push_list_flag(&mut args, "--add-assignee", &input.add_assignees);
    push_list_flag(&mut args, "--remove-assignee", &input.remove_assignees);
    push_list_flag(&mut args, "--add-reviewer", &input.add_reviewers);
    push_list_flag(&mut args, "--remove-reviewer", &input.remove_reviewers);
    args
}

fn pr_state_args(number: i64, close: bool) -> Result<Vec<String>, String> {
    if number <= 0 {
        return Err("Invalid pull request number".into());
    }
    Ok(vec![
        "pr".to_string(),
        if close { "close" } else { "reopen" }.to_string(),
        number.to_string(),
    ])
}

fn git_github_pr_state_for(root: &Path, number: i64, close: bool) -> Result<(), String> {
    let args = pr_state_args(number, close)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    gh_checked(root, &refs)?;
    Ok(())
}

fn git_github_pr_edit_for(
    root: &Path,
    number: i64,
    input: &GitHubPrEditInput,
) -> Result<(), String> {
    if number <= 0 {
        return Err("Invalid pull request number".into());
    }
    let mut args = vec!["pr".to_string(), "edit".to_string(), number.to_string()];
    args.extend(pr_edit_flags(input));
    if args.len() == 3 {
        return Err("No pull request changes requested".into());
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    gh_checked(root, &refs)?;
    Ok(())
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoMeta {
    pub viewer_login: String,
    pub labels: Vec<GitHubLabel>,
    pub assignees: Vec<String>,
    pub reviewers: Vec<String>,
}

fn gh_login_list(root: &Path, path: &str) -> Vec<String> {
    gh_stdout(root, &["api", path, "--jq", ".[].login"])
        .map(|text| {
            text.lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn git_github_repo_meta_for(root: &Path) -> Result<GitHubRepoMeta, String> {
    let repo = git_github_repo_for(root)?;
    let (owner, name) = split_github_repo(&repo)?;
    let viewer_login = gh_checked(root, &["api", "user", "--jq", ".login"])?
        .trim()
        .to_string();
    let labels = gh_checked(root, &["label", "list", "--json", "name,color", "--limit", "100"])
        .ok()
        .and_then(|json| parse_github_labels(&json).ok())
        .unwrap_or_default();
    let assignees = gh_login_list(root, &format!("repos/{owner}/{name}/assignees?per_page=100"));
    let reviewers = gh_login_list(root, &format!("repos/{owner}/{name}/collaborators?per_page=100"));
    Ok(GitHubRepoMeta {
        viewer_login,
        labels,
        assignees,
        reviewers,
    })
}
```

If `parse_github_labels` does not exist, add it next to `parse_github_work_item_details`:

```rust
fn parse_github_labels(json: &str) -> Result<Vec<GitHubLabel>, String> {
    #[derive(Deserialize)]
    struct Row {
        name: String,
        #[serde(default)]
        color: String,
    }
    let rows: Vec<Row> = serde_json::from_str(json).map_err(|error| error.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| GitHubLabel {
            name: row.name,
            color: row.color,
        })
        .collect())
}
```

Add the three commands next to `git_github_pr_merge`:

```rust
/// Close or reopen a pull request without merging it.
#[tauri::command]
pub async fn git_github_pr_state(
    cwd: String,
    number: i64,
    close: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_github_pr_state_for(&expand_home(&cwd), number, close)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Add or remove labels, assignees, and reviewers on a pull request.
#[tauri::command]
pub async fn git_github_pr_edit(
    cwd: String,
    number: i64,
    input: GitHubPrEditInput,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_github_pr_edit_for(&expand_home(&cwd), number, &input)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Labels, assignable users, collaborators, and the authenticated login for a repo.
#[tauri::command]
pub async fn git_github_repo_meta(cwd: String) -> Result<GitHubRepoMeta, String> {
    tauri::async_runtime::spawn_blocking(move || git_github_repo_meta_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}
```

- [ ] **Step 4: Register the commands**

In `src-tauri/src/lib.rs`, after the Task 1 registration:

```rust
            fs::git_github_pr_state,
            fs::git_github_pr_edit,
            fs::git_github_repo_meta,
```

- [ ] **Step 5: Run tests and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_edit_flags_join_values_and_skip_empty_lists pr_state_args_choose_close_or_reopen && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS and clean check.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/fs.rs src-tauri/src/lib.rs
git commit -m "Add GitHub PR close, reopen, and metadata commands."
```

---

### Task 3: Rust review submission (GraphQL)

**Files:**
- Modify: `src-tauri/src/fs.rs` (mutation constant near `GITHUB_REVIEW_REPLY_MUTATION`, `fs.rs:2214`; helper near `git_github_review_reply_for`; tests in `mod tests`)
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `gh_checked`, `valid_github_node_id`, `with_temp_markdown` pattern (temp file), `split_github_repo` (unused here).
- Produces:
  - `git_github_pr_review(cwd: String, number: i64, pr_id: String, event: String, body: String, comments: Vec<GitHubPrReviewCommentInput>) -> Result<String, String>`
  - `GitHubPrReviewCommentInput { path: String, line: i64, side: String, body: String }`
  - internal `pr_review_payload(pr_id, event, body, comments) -> Result<String, String>` returning the JSON body for `gh api graphql --input`.

- [ ] **Step 1: Write the failing test**

Add to `mod tests`:

```rust
#[test]
fn pr_review_payload_builds_graphql_variables() {
    let comments = vec![GitHubPrReviewCommentInput {
        path: "src/app.ts".into(),
        line: 12,
        side: "left".into(),
        body: "  needs a guard  ".into(),
    }];
    let payload = pr_review_payload("PR_kwDOA", "request-changes", "  please fix  ", &comments).unwrap();
    let json: serde_json::Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(json["variables"]["event"], "REQUEST_CHANGES");
    assert_eq!(json["variables"]["body"], "please fix");
    assert_eq!(json["variables"]["comments"][0]["path"], "src/app.ts");
    assert_eq!(json["variables"]["comments"][0]["line"], 12);
    assert_eq!(json["variables"]["comments"][0]["side"], "LEFT");
    assert_eq!(json["variables"]["comments"][0]["body"], "needs a guard");
    assert!(json["query"].as_str().unwrap().contains("addPullRequestReview"));
}

#[test]
fn pr_review_payload_rejects_bad_input() {
    assert!(pr_review_payload("PR_x", "approve", "", &[]).is_ok());
    assert!(pr_review_payload("", "approve", "", &[]).is_err());
    assert!(pr_review_payload("PR_x", "bless", "", &[]).is_err());
    assert!(pr_review_payload("PR_x", "request-changes", "", &[]).is_err());
    let bad = vec![GitHubPrReviewCommentInput {
        path: "".into(),
        line: 0,
        side: "right".into(),
        body: "x".into(),
    }];
    assert!(pr_review_payload("PR_x", "comment", "", &bad).is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_review_payload_builds_graphql_variables`
Expected: FAIL with missing `pr_review_payload`.

- [ ] **Step 3: Implement the mutation, payload builder, command, and result parser**

In `fs.rs`, after `GITHUB_REVIEW_REPLY_MUTATION`:

```rust
const GITHUB_REVIEW_SUBMIT_MUTATION: &str = r#"
mutation InboxSubmitReview(
  $pullRequestId: ID!
  $event: PullRequestReviewEvent!
  $body: String
  $comments: [DraftPullRequestReviewComment!]
) {
  addPullRequestReview(input: {
    pullRequestId: $pullRequestId
    event: $event
    body: $body
    comments: $comments
  }) {
    pullRequestReview { url state }
  }
}
"#;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrReviewCommentInput {
    pub path: String,
    pub line: i64,
    pub side: String,
    pub body: String,
}

fn pr_review_payload(
    pr_id: &str,
    event: &str,
    body: &str,
    comments: &[GitHubPrReviewCommentInput],
) -> Result<String, String> {
    if !valid_github_node_id(pr_id) {
        return Err("Invalid pull request id".into());
    }
    let event = match event.trim().to_lowercase().as_str() {
        "comment" => "COMMENT",
        "approve" => "APPROVE",
        "request-changes" => "REQUEST_CHANGES",
        _ => return Err("Unknown review event".into()),
    };
    let body = body.trim();
    let mut rows = Vec::with_capacity(comments.len());
    for comment in comments {
        let path = comment.path.trim();
        let text = comment.body.trim();
        if path.is_empty() || text.is_empty() || comment.line <= 0 {
            return Err("Review comments need a path, a line, and a body".into());
        }
        let side = if comment.side.trim().eq_ignore_ascii_case("left") {
            "LEFT"
        } else {
            "RIGHT"
        };
        rows.push(serde_json::json!({
            "path": path,
            "line": comment.line,
            "side": side,
            "body": text,
        }));
    }
    if event != "APPROVE" && body.is_empty() && rows.is_empty() {
        return Err("Add a review body or at least one line comment".into());
    }
    let payload = serde_json::json!({
        "query": GITHUB_REVIEW_SUBMIT_MUTATION,
        "variables": {
            "pullRequestId": pr_id.trim(),
            "event": event,
            "body": body,
            "comments": rows,
        },
    });
    serde_json::to_string(&payload).map_err(|error| error.to_string())
}

fn parse_github_review_url(json: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|error| error.to_string())?;
    if let Some(errors) = value.get("errors").and_then(|errors| errors.as_array()) {
        let message = errors
            .iter()
            .find_map(|error| error.get("message").and_then(|message| message.as_str()))
            .unwrap_or("GitHub rejected the review");
        return Err(message.to_string());
    }
    value
        .get("data")
        .and_then(|data| data.get("addPullRequestReview"))
        .and_then(|review| review.get("pullRequestReview"))
        .and_then(|review| review.get("url"))
        .and_then(|url| url.as_str())
        .map(str::to_string)
        .ok_or_else(|| "GitHub did not return a review URL".to_string())
}

fn git_github_pr_review_for(
    root: &Path,
    pr_id: &str,
    event: &str,
    body: &str,
    comments: &[GitHubPrReviewCommentInput],
) -> Result<String, String> {
    let payload = pr_review_payload(pr_id, event, body, comments)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("monocode-review-{stamp}.json"));
    std::fs::write(&path, payload).map_err(|error| error.to_string())?;
    let result = gh_checked(
        root,
        &["api", "graphql", "--input", &path.to_string_lossy()],
    );
    let _ = std::fs::remove_file(&path);
    parse_github_review_url(&result?)
}
```

Note: `number` is accepted by the command for symmetry and validation but the GraphQL call keys off `pr_id`; reject `number <= 0` in the wrapper.

Command next to the other PR commands:

```rust
/// Submit one pending review: COMMENT, APPROVE, or REQUEST_CHANGES.
#[tauri::command]
pub async fn git_github_pr_review(
    cwd: String,
    number: i64,
    pr_id: String,
    event: String,
    body: String,
    comments: Vec<GitHubPrReviewCommentInput>,
) -> Result<String, String> {
    if number <= 0 {
        return Err("Invalid pull request number".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        git_github_pr_review_for(&expand_home(&cwd), &pr_id, &event, &body, &comments)
    })
    .await
    .map_err(|e| e.to_string())?
}
```

- [ ] **Step 4: Register the command**

In `src-tauri/src/lib.rs`:

```rust
            fs::git_github_pr_review,
```

- [ ] **Step 5: Run tests and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pr_review_payload && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS and clean check.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/fs.rs src-tauri/src/lib.rs
git commit -m "Add GitHub PR review submission."
```

---

### Task 4: Extend PR details with gating fields

**Files:**
- Modify: `src-tauri/src/fs.rs:2071-2121` (`git_github_work_item_details_for` and `parse_github_work_item_details`)
- Modify: `src-tauri/src/fs.rs:946-955` (`GitHubWorkItemDetails` struct)
- Tests: `mod tests`

**Interfaces:**
- Consumes: `gh_checked(root, &[kind, "view", number, "--json", fields])`.
- Produces: `GitHubWorkItemDetails` with new camelCase-serialized fields: `id`, `state`, `draft`, `mergeable`, `mergeStateStatus`, `labels`, `assignees`, `reviewRequests`. Task 5 mirrors this type in TypeScript.

- [ ] **Step 1: Write the failing test**

Add to `mod tests`:

```rust
#[test]
fn parse_pr_details_reads_merge_gating_fields() {
    let json = r#"{
        "body": "hello",
        "author": { "login": "octocat" },
        "baseRefName": "main",
        "headRefName": "feat/x",
        "reviewDecision": "APPROVED",
        "id": "PR_kwDOA",
        "state": "OPEN",
        "isDraft": false,
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "labels": [{ "name": "bug", "color": "ff0000" }],
        "assignees": [{ "login": "alice" }],
        "reviewRequests": [
            { "__typename": "User", "login": "bob" },
            { "__typename": "Team", "name": "reviews" }
        ]
    }"#;
    let parsed = parse_github_work_item_details(json).unwrap();
    assert_eq!(parsed.id, "PR_kwDOA");
    assert_eq!(parsed.state, "OPEN");
    assert!(!parsed.draft);
    assert_eq!(parsed.mergeable, "MERGEABLE");
    assert_eq!(parsed.merge_state_status, "CLEAN");
    assert_eq!(parsed.labels.len(), 1);
    assert_eq!(parsed.assignees[0].login, "alice");
    assert_eq!(parsed.review_requests, vec!["bob", "reviews"]);
}

#[test]
fn parse_issue_details_defaults_new_fields() {
    let parsed = parse_github_work_item_details(r#"{"body": "hi"}"#).unwrap();
    assert!(parsed.id.is_empty());
    assert!(parsed.labels.is_empty());
    assert!(parsed.review_requests.is_empty());
    assert!(parsed.mergeable.is_empty());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parse_pr_details_reads_merge_gating_fields`
Expected: FAIL to compile: no field `id` on `GitHubWorkItemDetails`.

- [ ] **Step 3: Extend the struct, query fields, and parser**

Replace `GitHubWorkItemDetails` (`fs.rs:948`):

```rust
pub struct GitHubWorkItemDetails {
    pub body: String,
    pub author: String,
    pub author_avatar_url: String,
    pub base_ref_name: String,
    pub head_ref_name: String,
    pub review_decision: String,
    pub id: String,
    pub state: String,
    pub draft: bool,
    pub mergeable: String,
    pub merge_state_status: String,
    pub labels: Vec<GitHubLabel>,
    pub assignees: Vec<GitHubAssignee>,
    pub review_requests: Vec<String>,
}
```

In `git_github_work_item_details_for` (`fs.rs:2081`), change the PR fields:

```rust
    let fields = if kind == "pr" {
        "body,author,baseRefName,headRefName,reviewDecision,id,state,isDraft,\
mergeable,mergeStateStatus,labels,assignees,reviewRequests"
    } else {
        "body,author"
    };
```

In `parse_github_work_item_details`, extend `Row` and the returned struct:

```rust
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ReviewRequest {
        #[serde(default, rename = "__typename")]
        kind: String,
        #[serde(default)]
        login: String,
        #[serde(default)]
        name: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Row {
        #[serde(default)]
        body: String,
        #[serde(default)]
        author: Option<Author>,
        #[serde(default)]
        base_ref_name: String,
        #[serde(default)]
        head_ref_name: String,
        #[serde(default)]
        review_decision: Option<String>,
        #[serde(default)]
        id: String,
        #[serde(default)]
        state: String,
        #[serde(default)]
        is_draft: bool,
        #[serde(default)]
        mergeable: String,
        #[serde(default)]
        merge_state_status: String,
        #[serde(default)]
        labels: Vec<GitHubLabel>,
        #[serde(default)]
        assignees: Vec<GitHubAssignee>,
        #[serde(default)]
        review_requests: Vec<ReviewRequest>,
    }
```

and in the `Ok(GitHubWorkItemDetails { .. })` construction add:

```rust
        id: row.id,
        state: row.state,
        draft: row.is_draft,
        mergeable: row.mergeable,
        merge_state_status: row.merge_state_status,
        labels: row.labels,
        assignees: row.assignees,
        review_requests: row
            .review_requests
            .into_iter()
            .map(|request| {
                if request.kind == "Team" && request.login.is_empty() {
                    request.name
                } else {
                    request.login
                }
            })
            .filter(|login| !login.is_empty())
            .collect(),
```

Register the updated command output requires no `lib.rs` change.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parse_pr_details_reads_merge_gating_fields parse_issue_details_defaults_new_fields`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/fs.rs
git commit -m "Expose PR merge state and metadata in Inbox details."
```

---

### Task 5: Frontend command wrappers and cache invalidation

**Files:**
- Modify: `src/lib/githubTasks.ts` (types near line 88; wrappers near `githubWorkItemComment`, line 471)

**Interfaces:**
- Consumes: the Task 1-4 commands.
- Produces (exact signatures used by Tasks 6-9):
  - Types `GithubWorkItemDetails` extended with `id: string; state: string; draft: boolean; mergeable: string; mergeStateStatus: string; labels: GithubLabel[]; assignees: GithubAssignee[]; reviewRequests: string[]`
  - `GithubRepoMeta { viewerLogin: string; labels: GithubLabel[]; assignees: string[]; reviewers: string[] }`
  - `GithubPrEditInput { addLabels: string[]; removeLabels: string[]; addAssignees: string[]; removeAssignees: string[]; addReviewers: string[]; removeReviewers: string[] }`
  - `githubRepoMeta(cwd: string): Promise<GithubRepoMeta>`
  - `githubPrMerge(cwd, number, method: "squash" | "merge" | "rebase", deleteBranch: boolean): Promise<void>`
  - `githubPrState(cwd, number, close: boolean): Promise<void>`
  - `githubPrEdit(cwd, number, input: GithubPrEditInput): Promise<void>`
  - `githubPrReview(cwd, number, prId, event: "comment" | "approve" | "request-changes", body, comments: { path; line; side: "left" | "right"; body }[]): Promise<string>`
  - `invalidateGithubItem(cwd, kind, number): void` clearing details, thread, and the list cache

- [ ] **Step 1: Write the failing test**

Create `src/lib/githubTasks.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn(async (command: string) => {
  if (command === "git_github_work_item_details") {
    return {
      body: "",
      author: "me",
      authorAvatarUrl: "",
      baseRefName: "main",
      headRefName: "feat/x",
      reviewDecision: "",
      id: "PR_1",
      state: "OPEN",
      draft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      labels: [],
      assignees: [],
      reviewRequests: [],
    };
  }
  return undefined;
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { githubPrEdit, githubPrReview, githubWorkItemDetails } from "./githubTasks";

describe("PR write wrappers", () => {
  beforeEach(() => invoke.mockClear());

  it("passes review payload through unchanged", async () => {
    await githubPrReview("/tmp/repo", 7, "PR_1", "request-changes", "fix", [
      { path: "a.ts", line: 3, side: "right", body: "nit" },
    ]);
    expect(invoke).toHaveBeenCalledWith("git_github_pr_review", {
      cwd: "/tmp/repo",
      number: 7,
      prId: "PR_1",
      event: "request-changes",
      body: "fix",
      comments: [{ path: "a.ts", line: 3, side: "right", body: "nit" }],
    });
  });

  it("drops empty edit lists before invoking", async () => {
    await githubPrEdit("/tmp/repo", 7, {
      addLabels: ["bug"],
      removeLabels: [],
      addAssignees: [],
      removeAssignees: [],
      addReviewers: [],
      removeReviewers: [],
    });
    expect(invoke).toHaveBeenCalledWith("git_github_pr_edit", {
      cwd: "/tmp/repo",
      number: 7,
      input: {
        addLabels: ["bug"],
        removeLabels: [],
        addAssignees: [],
        removeAssignees: [],
        addReviewers: [],
        removeReviewers: [],
      },
    });
  });

  it("keeps new details fields", async () => {
    const details = await githubWorkItemDetails("/tmp/repo", "pr", 7);
    expect(details.id).toBe("PR_1");
    expect(details.mergeStateStatus).toBe("CLEAN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/githubTasks.test.ts`
Expected: FAIL with `githubPrReview is not a function` / missing type fields.

- [ ] **Step 3: Implement types and wrappers**

Extend the types in `src/lib/githubTasks.ts`:

```ts
export type GithubWorkItemDetails = {
  body: string;
  author: string;
  authorAvatarUrl?: string;
  baseRefName?: string;
  headRefName?: string;
  reviewDecision?: string;
  id: string;
  state: string;
  draft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  labels: GithubLabel[];
  assignees: GithubAssignee[];
  reviewRequests: string[];
};

export type GithubRepoMeta = {
  viewerLogin: string;
  labels: GithubLabel[];
  assignees: string[];
  reviewers: string[];
};

export type GithubPrEditInput = {
  addLabels: string[];
  removeLabels: string[];
  addAssignees: string[];
  removeAssignees: string[];
  addReviewers: string[];
  removeReviewers: string[];
};

export type GithubPrReviewEvent = "comment" | "approve" | "request-changes";

export type GithubPrReviewComment = {
  path: string;
  line: number;
  side: "left" | "right";
  body: string;
};
```

Add the wrappers after `githubWorkItemComment` (`githubTasks.ts:489`):

```ts
export function invalidateGithubItem(
  cwd: string,
  kind: GithubTaskKind,
  number: number,
): void {
  const key = detailsCacheKey(cwd, kind, number);
  detailsByKey.delete(key);
  threadByKey.delete(key);
  threadInflight.delete(key);
  inboxListCache = null;
}

export function githubRepoMeta(cwd: string): Promise<GithubRepoMeta> {
  return invoke<GithubRepoMeta>("git_github_repo_meta", { cwd });
}

export async function githubPrMerge(
  cwd: string,
  number: number,
  method: "squash" | "merge" | "rebase",
  deleteBranch: boolean,
): Promise<void> {
  await invoke<void>("git_github_pr_merge", {
    cwd,
    number,
    method,
    deleteBranch,
  });
  invalidateGithubItem(cwd, "pr", number);
}

export async function githubPrState(
  cwd: string,
  number: number,
  close: boolean,
): Promise<void> {
  await invoke<void>("git_github_pr_state", { cwd, number, close });
  invalidateGithubItem(cwd, "pr", number);
}

export async function githubPrEdit(
  cwd: string,
  number: number,
  input: GithubPrEditInput,
): Promise<void> {
  await invoke<void>("git_github_pr_edit", { cwd, number, input });
  invalidateGithubItem(cwd, "pr", number);
}

export async function githubPrReview(
  cwd: string,
  number: number,
  prId: string,
  event: GithubPrReviewEvent,
  body: string,
  comments: readonly GithubPrReviewComment[],
): Promise<string> {
  const url = await invoke<string>("git_github_pr_review", {
    cwd,
    number,
    prId,
    event,
    body,
    comments,
  });
  invalidateGithubItem(cwd, "pr", number);
  return url;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/githubTasks.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/githubTasks.ts src/lib/githubTasks.test.ts
git commit -m "Add frontend wrappers for PR write actions."
```

---

### Task 6: Pending review logic and gating (`prReview.ts`)

**Files:**
- Create: `src/lib/prReview.ts`
- Create: `src/lib/prReview.test.ts`

**Interfaces:**
- Consumes: `GithubWorkItemDetails` from Task 5.
- Produces (used by Tasks 7-9):
  - `type PrReviewEvent = "comment" | "approve" | "request-changes"`
  - `type PrReviewComment = { id: string; path: string; line: number; side: "left" | "right"; body: string }`
  - `type PrReviewDraft = { comments: PrReviewComment[] }`
  - `addReviewComment(draft, input: Omit<PrReviewComment, "id">): PrReviewDraft`
  - `updateReviewComment(draft, id, body): PrReviewDraft`
  - `removeReviewComment(draft, id): PrReviewDraft`
  - `reviewCommentCount(draft): number`
  - `canSubmitReview(draft, event): boolean`
  - `prMergeAvailability(details): { enabled: boolean; reason: string }`
  - `prApproveAvailability(details, viewerLogin): { enabled: boolean; reason: string }`
  - `prEventDelta(current: readonly string[], next: readonly string[]): { add: string[]; remove: string[] }`
  - Draft persistence: `reviewDraftKey(cwd, number)`, `peekReviewDraft(key)`, `saveReviewDraft(key, draft)`, `clearReviewDraft(key)`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/prReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addReviewComment,
  canSubmitReview,
  emptyReviewDraft,
  prApproveAvailability,
  prEventDelta,
  prMergeAvailability,
  removeReviewComment,
  reviewCommentCount,
  updateReviewComment,
  type PrReviewComment,
} from "./prReview";
import type { GithubWorkItemDetails } from "./githubTasks";

function details(overrides: Partial<GithubWorkItemDetails> = {}): GithubWorkItemDetails {
  return {
    body: "",
    author: "me",
    baseRefName: "main",
    headRefName: "feat/x",
    reviewDecision: "",
    id: "PR_1",
    state: "OPEN",
    draft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    labels: [],
    assignees: [],
    reviewRequests: [],
    ...overrides,
  };
}

describe("review draft", () => {
  it("adds, replaces, updates, and removes comments", () => {
    const input = { path: "a.ts", line: 3, side: "right" as const, body: "nit" };
    let draft = addReviewComment(emptyReviewDraft(), input);
    draft = addReviewComment(draft, { ...input, body: "nit 2" });
    expect(reviewCommentCount(draft)).toBe(1);
    expect(draft.comments[0]?.body).toBe("nit 2");

    const id = draft.comments[0]!.id;
    draft = updateReviewComment(draft, id, "updated");
    expect(draft.comments[0]?.body).toBe("updated");

    draft = removeReviewComment(draft, id);
    expect(reviewCommentCount(draft)).toBe(0);
  });

  it("requires content except for approve", () => {
    const draft = emptyReviewDraft();
    expect(canSubmitReview(draft, "approve")).toBe(true);
    expect(canSubmitReview(draft, "comment")).toBe(false);
    expect(canSubmitReview(draft, "request-changes")).toBe(false);
    const withComment = addReviewComment(draft, {
      path: "a.ts",
      line: 1,
      side: "right",
      body: "x",
    });
    expect(canSubmitReview(withComment, "comment")).toBe(true);
    expect(canSubmitReview(withComment, "request-changes")).toBe(true);
  });
});

describe("gating", () => {
  it("blocks merge when closed, draft, conflicting, blocked, or unknown", () => {
    expect(prMergeAvailability(details()).enabled).toBe(true);
    expect(prMergeAvailability(details({ state: "MERGED" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ draft: true })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeable: "CONFLICTING" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeStateStatus: "BLOCKED" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeable: "UNKNOWN" })).enabled).toBe(false);
  });

  it("blocks approving your own pull request", () => {
    expect(prApproveAvailability(details({ author: "other" }), "me").enabled).toBe(true);
    const own = prApproveAvailability(details({ author: "me" }), "me");
    expect(own.enabled).toBe(false);
    expect(own.reason.length).toBeGreaterThan(0);
  });
});

describe("entity delta", () => {
  it("computes adds and removes", () => {
    expect(prEventDelta(["bug", "ui"], ["ui", "api"])).toEqual({
      add: ["api"],
      remove: ["bug"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/prReview.test.ts`
Expected: FAIL with `Cannot find module './prReview'`.

- [ ] **Step 3: Implement `prReview.ts`**

```ts
import type { GithubWorkItemDetails } from "./githubTasks";

export type PrReviewEvent = "comment" | "approve" | "request-changes";

export type PrReviewComment = {
  id: string;
  path: string;
  line: number;
  side: "left" | "right";
  body: string;
};

export type PrReviewDraft = { comments: PrReviewComment[] };

export function emptyReviewDraft(): PrReviewDraft {
  return { comments: [] };
}

export function reviewCommentId(
  path: string,
  line: number,
  side: "left" | "right",
): string {
  return `${side}:${path.trim()}:${line}`;
}

export function addReviewComment(
  draft: PrReviewDraft,
  input: Omit<PrReviewComment, "id">,
): PrReviewDraft {
  const id = reviewCommentId(input.path, input.line, input.side);
  const comment: PrReviewComment = { id, ...input, body: input.body.trim() };
  return {
    comments: [...draft.comments.filter((entry) => entry.id !== id), comment],
  };
}

export function updateReviewComment(
  draft: PrReviewDraft,
  id: string,
  body: string,
): PrReviewDraft {
  return {
    comments: draft.comments.map((entry) =>
      entry.id === id ? { ...entry, body } : entry,
    ),
  };
}

export function removeReviewComment(
  draft: PrReviewDraft,
  id: string,
): PrReviewDraft {
  return { comments: draft.comments.filter((entry) => entry.id !== id) };
}

export function reviewCommentCount(draft: PrReviewDraft): number {
  return draft.comments.length;
}

export function canSubmitReview(
  draft: PrReviewDraft,
  event: PrReviewEvent,
): boolean {
  if (event === "approve") return true;
  return reviewCommentCount(draft) > 0;
}

export function prMergeAvailability(
  details: GithubWorkItemDetails,
): { enabled: boolean; reason: string } {
  if (details.state.trim().toUpperCase() !== "OPEN") {
    return { enabled: false, reason: "Pull request is not open" };
  }
  if (details.draft) {
    return { enabled: false, reason: "Draft pull requests cannot be merged" };
  }
  const mergeable = details.mergeable.trim().toUpperCase();
  if (mergeable === "CONFLICTING") {
    return { enabled: false, reason: "Resolve merge conflicts first" };
  }
  if (mergeable === "UNKNOWN") {
    return { enabled: false, reason: "Mergeability is still being computed" };
  }
  const status = details.mergeStateStatus.trim().toUpperCase();
  if (status === "BLOCKED") {
    return { enabled: false, reason: "Required checks or reviews are blocking" };
  }
  if (status === "DIRTY") {
    return { enabled: false, reason: "The branch has conflicts" };
  }
  return { enabled: true, reason: "" };
}

export function prApproveAvailability(
  details: GithubWorkItemDetails,
  viewerLogin: string,
): { enabled: boolean; reason: string } {
  if (details.state.trim().toUpperCase() !== "OPEN") {
    return { enabled: false, reason: "Pull request is not open" };
  }
  const viewer = viewerLogin.trim().toLowerCase();
  if (viewer && details.author.trim().toLowerCase() === viewer) {
    return { enabled: false, reason: "You cannot approve your own pull request" };
  }
  return { enabled: true, reason: "" };
}

export function prEventDelta(
  current: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const before = new Set(current.map((value) => value.trim()).filter(Boolean));
  const after = new Set(next.map((value) => value.trim()).filter(Boolean));
  return {
    add: [...after].filter((value) => !before.has(value)),
    remove: [...before].filter((value) => !after.has(value)),
  };
}

const drafts = new Map<string, PrReviewDraft>();

export function reviewDraftKey(cwd: string, number: number): string {
  return `${cwd.trim()}:${number}`;
}

export function peekReviewDraft(key: string): PrReviewDraft | null {
  return drafts.get(key) ?? null;
}

export function saveReviewDraft(key: string, draft: PrReviewDraft): void {
  drafts.set(key, draft);
}

export function clearReviewDraft(key: string): void {
  drafts.delete(key);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/prReview.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prReview.ts src/lib/prReview.test.ts
git commit -m "Add pending review logic and PR gating helpers."
```

---

### Task 7: PR action bar (merge, review, close/reopen)

**Files:**
- Create: `src/chrome/PrActions.tsx`
- Create: `src/chrome/PrActions.test.ts`
- Modify: `src/surfaces/InboxView.tsx` (`InboxDetail` props at `1342-1362`; handlers near `postComment`; action row at `2006-2090`)

**Interfaces:**
- Consumes: `prMergeAvailability`, `prApproveAvailability`, `canSubmitReview`, `type PrReviewEvent` from Task 6; `githubPrMerge`, `githubPrState`, `githubRepoMeta` from Task 5. Native confirm uses `ask` from `@tauri-apps/plugin-dialog` (same as `GitChangesPanel.tsx:77`).
- Produces: `PrActions` component with `onSubmitReview(event: PrReviewEvent)`; `InboxDetail` gains prop `onMutated?: () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/chrome/PrActions.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GithubWorkItemDetails } from "../lib/githubTasks";
import { PrActions } from "./PrActions";

function details(overrides: Partial<GithubWorkItemDetails> = {}): GithubWorkItemDetails {
  return {
    body: "",
    author: "other",
    baseRefName: "main",
    headRefName: "feat/x",
    reviewDecision: "",
    id: "PR_1",
    state: "OPEN",
    draft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    labels: [],
    assignees: [],
    reviewRequests: [],
    ...overrides,
  };
}

function render(value: GithubWorkItemDetails, viewerLogin = "me") {
  return renderToStaticMarkup(
    createElement(PrActions, {
      details: value,
      viewerLogin,
      busy: null,
      onSubmitReview: () => {},
      onToggleState: () => {},
      onMerge: () => {},
    }),
  );
}

describe("PrActions", () => {
  it("renders merge and review actions for an open pull request", () => {
    const markup = render(details());
    expect(markup).toContain("Merge");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Request changes");
    expect(markup).toContain("Close pull request");
  });

  it("explains why merge is blocked", () => {
    const markup = render(details({ mergeStateStatus: "BLOCKED" }));
    expect(markup).toContain("Required checks or reviews are blocking");
  });

  it("disables approve on your own pull request", () => {
    const markup = render(details({ author: "me" }));
    expect(markup).toContain("You cannot approve your own pull request");
  });

  it("offers reopen on a closed pull request", () => {
    const markup = render(details({ state: "CLOSED" }));
    expect(markup).toContain("Reopen pull request");
    expect(markup).not.toContain("Close pull request");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/PrActions.test.ts`
Expected: FAIL with `Cannot find module './PrActions'`.

- [ ] **Step 3: Implement `PrActions.tsx`**

```tsx
import { useState } from "react";
import { Check, ChevronDown, LoaderCircle, RotateCcw, X } from "./icons";
import {
  prApproveAvailability,
  prMergeAvailability,
  type PrReviewEvent,
} from "../lib/prReview";
import type { GithubWorkItemDetails } from "../lib/githubTasks";
import { t } from "../i18n";

export type PrMergeMethod = "squash" | "merge" | "rebase";

const ACTION_FILLED =
  "inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:cursor-default disabled:opacity-40";
const ACTION_OUTLINE =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-content/15 px-2.5 text-[12px] text-content/80 hover:bg-content/5 disabled:cursor-default disabled:opacity-40";

const METHOD_LABELS: Record<PrMergeMethod, string> = {
  squash: "Squash and merge",
  merge: "Create a merge commit",
  rebase: "Rebase and merge",
};

export function PrActions({
  details,
  viewerLogin,
  busy,
  onSubmitReview,
  onToggleState,
  onMerge,
}: {
  details: GithubWorkItemDetails;
  viewerLogin: string;
  busy: string | null;
  onSubmitReview: (event: PrReviewEvent) => void;
  onToggleState: (close: boolean) => void;
  onMerge: (method: PrMergeMethod) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const merge = prMergeAvailability(details);
  const approve = prApproveAvailability(details, viewerLogin);
  const closed = details.state.trim().toUpperCase() !== "OPEN";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex">
        <button
          type="button"
          disabled={busy != null || !merge.enabled}
          title={merge.reason}
          onClick={() => onMerge("squash")}
          className={`${ACTION_FILLED} rounded-r-none`}
        >
          {busy === "merge" ? (
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Check className="size-3.5" strokeWidth={1.75} />
          )}
          {t("Merge")}
        </button>
        <button
          type="button"
          aria-label={t("Merge options")}
          disabled={busy != null || !merge.enabled}
          onClick={() => setMenuOpen((open) => !open)}
          className={`${ACTION_FILLED} rounded-l-none border-l border-background-base/10 px-1.5`}
        >
          <ChevronDown className="size-3.5" strokeWidth={2} />
        </button>
        {menuOpen ? (
          <div className="absolute top-full left-0 z-30 mt-1 min-w-52 rounded-md border border-content/10 bg-background-base py-1 shadow-lg">
            {(Object.keys(METHOD_LABELS) as PrMergeMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onMerge(method);
                }}
                className="flex h-7 w-full items-center px-3 text-left text-[12px] text-content hover:bg-content/10"
              >
                {t(METHOD_LABELS[method])}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy != null || !approve.enabled}
        title={approve.reason}
        onClick={() => onSubmitReview("approve")}
        className={ACTION_OUTLINE}
      >
        {t("Approve")}
      </button>
      <button
        type="button"
        disabled={busy != null || closed}
        onClick={() => onSubmitReview("request-changes")}
        className={ACTION_OUTLINE}
      >
        {t("Request changes")}
      </button>
      <button
        type="button"
        disabled={busy != null}
        onClick={() => onToggleState(!closed)}
        className={ACTION_OUTLINE}
      >
        {closed ? (
          <RotateCcw className="size-3.5" strokeWidth={1.75} />
        ) : (
          <X className="size-3.5" strokeWidth={1.75} />
        )}
        {closed ? t("Reopen pull request") : t("Close pull request")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/chrome/PrActions.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `InboxDetail`**

In `src/surfaces/InboxView.tsx`:

1. Add imports: `PrActions, type PrMergeMethod` from `../chrome/PrActions`; `githubPrMerge, githubPrState, githubRepoMeta, invalidateGithubItem, type GithubRepoMeta` from `../lib/githubTasks`.
2. Add `onMutated?: () => void` to the `InboxDetail` props type and destructuring (`InboxView.tsx:1342-1362`).
3. Add state near the other detail state (`InboxView.tsx:1440`):

```tsx
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<GithubRepoMeta | null>(null);
```

4. Fetch repo meta for GitHub PRs:

```tsx
  useEffect(() => {
    if (!isPr || item.provider !== "github") {
      setRepoMeta(null);
      return;
    }
    let cancelled = false;
    void githubRepoMeta(item.projectPath)
      .then((meta) => {
        if (!cancelled) setRepoMeta(meta);
      })
      .catch(() => {
        if (!cancelled) setRepoMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPr, item.projectPath, item.provider, revision]);
```

5. Add handlers next to the existing `postComment` handler:

```tsx
  const refreshDetails = async () => {
    if (!githubKind) return;
    invalidateGithubItem(item.projectPath, githubKind, item.number);
    const next = await githubWorkItemDetails(
      item.projectPath,
      githubKind,
      item.number,
    );
    setDetails(next);
    onMutated?.();
  };

  const runAction = async (key: string, work: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(key);
    setActionError(null);
    try {
      await work();
      await refreshDetails();
    } catch (error) {
      setActionError(inboxErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const confirmPr = (message: string, okLabel: string) =>
    ask(message, { title: t("MonoCode"), kind: "warning", okLabel });

  const onMerge = (method: PrMergeMethod) =>
    runAction("merge", async () => {
      const ok = await confirmPr(
        t("Merge pull request #{number} with {method}?", {
          number: item.number,
          method: t(METHOD_LABELS_FOR_CONFIRM[method]),
        }),
        t("Merge"),
      );
      if (!ok) return;
      await githubPrMerge(item.projectPath, item.number, method, false);
    });

  const onToggleState = (close: boolean) =>
    runAction("state", async () => {
      if (close) {
        const ok = await confirmPr(
          t("Close pull request #{number}?", { number: item.number }),
          t("Close pull request"),
        );
        if (!ok) return;
      }
      await githubPrState(item.projectPath, item.number, close);
    });

  const onSubmitReview = (event: PrReviewEvent) =>
    runAction("review", async () => {
      if (!details?.id) throw new Error("Missing pull request id");
      await githubPrReview(item.projectPath, item.number, details.id, event, "", []);
    });
```

Define `METHOD_LABELS_FOR_CONFIRM` in this task as a local map `{ squash: "Squash and merge", merge: "Create a merge commit", rebase: "Rebase and merge" }: Record<PrMergeMethod, string>`, and add `import { ask } from "@tauri-apps/plugin-dialog";`. Do not add review-draft state here; Task 9 adds it and replaces the direct `onSubmitReview` submission with review-bar-driven submission.

6. Render the bar in the action row (`InboxView.tsx:2006`) when `isPr && item.provider === "github" && details`:

```tsx
              {isPr && item.provider === "github" && details ? (
                <PrActions
                  details={details}
                  viewerLogin={repoMeta?.viewerLogin ?? ""}
                  busy={busyAction}
                  onSubmitReview={onSubmitReview}
                  onToggleState={onToggleState}
                  onMerge={onMerge}
                />
              ) : null}
```

7. Show `actionError` next to `startError` (`InboxView.tsx:2091`):

```tsx
            {actionError ? (
              <p className="text-[12px] text-red-400/90">{actionError}</p>
            ) : null}
```

8. In `InboxView`, pass `onMutated={() => setRefresh((value) => value + 1)}` where `InboxDetail` is rendered.

- [ ] **Step 6: Test and typecheck**

Run: `npx vitest run src/chrome/PrActions.test.ts src/surfaces/InboxView.test.ts && npx tsc --noEmit`
Expected: PASS. Note: `InboxView.test.ts` renders with `renderToStaticMarkup`, so effects never run; existing assertions must be unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/chrome/PrActions.tsx src/chrome/PrActions.test.ts src/surfaces/InboxView.tsx
git commit -m "Add PR action bar to Inbox details."
```

---

### Task 8: Label, assignee, and reviewer editing

**Files:**
- Create: `src/chrome/PrMetadataEditor.tsx`
- Create: `src/chrome/PrMetadataEditor.test.ts`
- Modify: `src/surfaces/InboxView.tsx` (render editor near the label chips at `InboxView.tsx:2159-2165`)

**Interfaces:**
- Consumes: `prEventDelta` from Task 6; `githubPrEdit`, `GithubRepoMeta`, `GithubWorkItemDetails` from Task 5.
- Produces: `PrMetadataEditor` with props `{ details, meta, busy, onApply(input: GithubPrEditInput): void }`; `details.labels` / `details.assignees` / `details.reviewRequests` drive current values, `meta.labels` / `meta.assignees` / `meta.reviewers` drive options.

- [ ] **Step 1: Write the failing test**

Create `src/chrome/PrMetadataEditor.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GithubWorkItemDetails, GithubRepoMeta } from "../lib/githubTasks";
import { PrMetadataEditor } from "./PrMetadataEditor";

const details: GithubWorkItemDetails = {
  body: "",
  author: "me",
  baseRefName: "main",
  headRefName: "feat/x",
  reviewDecision: "",
  id: "PR_1",
  state: "OPEN",
  draft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  labels: [{ name: "bug", color: "ff0000" }],
  assignees: [{ login: "alice" }],
  reviewRequests: ["bob"],
};

const meta: GithubRepoMeta = {
  viewerLogin: "me",
  labels: [
    { name: "bug", color: "ff0000" },
    { name: "ui", color: "00ff00" },
  ],
  assignees: ["alice", "carol"],
  reviewers: ["bob", "dave"],
};

describe("PrMetadataEditor", () => {
  it("renders current labels, assignees, and reviewers", () => {
    const markup = renderToStaticMarkup(
      createElement(PrMetadataEditor, {
        details,
        meta,
        busy: null,
        onApply: () => {},
      }),
    );
    expect(markup).toContain("bug");
    expect(markup).toContain("alice");
    expect(markup).toContain("bob");
    expect(markup).toContain("Edit labels");
    expect(markup).toContain("Edit assignees");
    expect(markup).toContain("Edit reviewers");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/PrMetadataEditor.test.ts`
Expected: FAIL with `Cannot find module './PrMetadataEditor'`.

- [ ] **Step 3: Implement `PrMetadataEditor.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Check, Pencil, Search } from "./icons";
import { Popover } from "./Popover";
import { prEventDelta } from "../lib/prReview";
import type {
  GithubPrEditInput,
  GithubRepoMeta,
  GithubWorkItemDetails,
} from "../lib/githubTasks";
import { t } from "../i18n";

type Field = "labels" | "assignees" | "reviewers";

function currentValues(
  details: GithubWorkItemDetails,
  field: Field,
): string[] {
  if (field === "labels") return details.labels.map((label) => label.name);
  if (field === "assignees") return details.assignees.map((person) => person.login);
  return [...details.reviewRequests];
}

function optionsFor(meta: GithubRepoMeta, field: Field): string[] {
  if (field === "labels") return meta.labels.map((label) => label.name);
  if (field === "assignees") return [...meta.assignees];
  return [...meta.reviewers];
}

function toEditInput(field: Field, add: string[], remove: string[]): GithubPrEditInput {
  return {
    addLabels: field === "labels" ? add : [],
    removeLabels: field === "labels" ? remove : [],
    addAssignees: field === "assignees" ? add : [],
    removeAssignees: field === "assignees" ? remove : [],
    addReviewers: field === "reviewers" ? add : [],
    removeReviewers: field === "reviewers" ? remove : [],
  };
}

export function PrMetadataEditor({
  details,
  meta,
  busy,
  onApply,
}: {
  details: GithubWorkItemDetails;
  meta: GithubRepoMeta;
  busy: string | null;
  onApply: (input: GithubPrEditInput) => void;
}) {
  const [open, setOpen] = useState<Field | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>([]);

  const active = open;
  const current = useMemo(
    () => (active ? currentValues(details, active) : []),
    [active, details],
  );
  const options = useMemo(
    () => (active ? optionsFor(meta, active) : []),
    [active, meta],
  );
  const filtered = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const startEdit = (field: Field, element: HTMLElement) => {
    setDraft(currentValues(details, field));
    setQuery("");
    setAnchor(element);
    setOpen(field);
  };

  const apply = () => {
    if (!active) return;
    const { add, remove } = prEventDelta(current, draft);
    setOpen(null);
    if (add.length > 0 || remove.length > 0) {
      onApply(toEditInput(active, add, remove));
    }
  };

  const fields: { field: Field; label: string; values: string[] }[] = [
    { field: "labels", label: "Edit labels", values: currentValues(details, "labels") },
    { field: "assignees", label: "Edit assignees", values: currentValues(details, "assignees") },
    { field: "reviewers", label: "Edit reviewers", values: currentValues(details, "reviewers") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fields.map(({ field, label, values }) => (
        <button
          key={field}
          type="button"
          disabled={busy != null}
          onClick={(event) => startEdit(field, event.currentTarget)}
          title={t(label)}
          aria-label={t(label)}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-content/20 px-1.5 py-0.5 text-[11px] text-content/70 hover:bg-content/5 disabled:opacity-40"
        >
          <Pencil className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="max-w-52 truncate">
            {values.length > 0 ? values.join(", ") : t(field === "labels" ? "No labels" : "None")}
          </span>
        </button>
      ))}
      {open ? (
        <Popover
          anchor={anchor}
          side="bottom"
          align="start"
          gap={6}
          width={260}
          onDismiss={() => setOpen(null)}
          className="p-2"
        >
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-content/5 px-2">
            <Search className="size-3 shrink-0 text-content/40" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Filter…")}
              className="h-7 w-full bg-transparent text-[12px] text-content outline-none placeholder:text-content/35"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((option) => {
              const selected = draft.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setDraft((values) =>
                      selected
                        ? values.filter((value) => value !== option)
                        : [...values, option],
                    )
                  }
                  className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] text-content/85 hover:bg-content/10"
                >
                  <span className="grid size-3.5 shrink-0 place-items-center">
                    {selected ? <Check className="size-3" strokeWidth={2} /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={apply}
            className="mt-1.5 h-7 w-full rounded-md bg-content text-[12px] font-medium text-background-base"
          >
            {t("Apply")}
          </button>
        </Popover>
      ) : null}
    </div>
  );
}
```

The `Popover` component accepts an `HTMLElement` as its `anchor` (`src/chrome/Popover.tsx:22`), which is why `startEdit` stores `event.currentTarget`.

- [ ] **Step 4: Run test**

Run: `npx vitest run src/chrome/PrMetadataEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `InboxDetail`**

In `InboxView.tsx`, in the GitHub PR branch near the label chips (`InboxView.tsx:2159`):

```tsx
          {isPr && item.provider === "github" && details && repoMeta ? (
            <PrMetadataEditor
              details={details}
              meta={repoMeta}
              busy={busyAction}
              onApply={(input) =>
                runAction("metadata", () =>
                  githubPrEdit(item.projectPath, item.number, input),
                )
              }
            />
          ) : null}
```

Add the import for `PrMetadataEditor` and `GithubPrEditInput` if needed for the callback type.

- [ ] **Step 6: Test and typecheck**

Run: `npx vitest run src/chrome/PrMetadataEditor.test.ts src/surfaces/InboxView.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/chrome/PrMetadataEditor.tsx src/chrome/PrMetadataEditor.test.ts src/surfaces/InboxView.tsx
git commit -m "Add label, assignee, and reviewer editing to Inbox PRs."
```

---

### Task 9: Inline review comments and submit dialog

**Files:**
- Modify: `src/surfaces/DiffCommentComposer.tsx` (add `submitLabel` and `onSubmit` props)
- Modify: `src/surfaces/UnifiedDiffView.tsx` (add `onLineComment` prop; `UnifiedDiffView.tsx:65-103`, `VirtualRows` at `536`, composer at `793`)
- Modify: `src/surfaces/InboxPrDiff.tsx` (pass `onLineComment`)
- Create: `src/chrome/PrReviewBar.tsx`
- Create: `src/chrome/PrReviewBar.test.ts`
- Modify: `src/surfaces/InboxView.tsx` (draft state, dialog, diff wiring)

**Interfaces:**
- Consumes: `addReviewComment`, `removeReviewComment`, `updateReviewComment`, `canSubmitReview`, `reviewCommentCount`, `reviewDraftKey`, `peekReviewDraft`, `saveReviewDraft`, `clearReviewDraft`, `type PrReviewComment`, `type PrReviewEvent` from Task 6; `githubPrReview` from Task 5; `UnifiedLine` type from `../lib/unifiedDiff`.
- Produces: `UnifiedDiffView.onLineComment?: (comment: { filePath: string; line: UnifiedLine; body: string }) => void`; `PrReviewBar` with props `{ draft, busy, onSubmit(event: PrReviewEvent, body: string): void, onDiscard(): void, onEdit(id, body): void, onRemove(id): void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/chrome/PrReviewBar.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrReviewBar } from "./PrReviewBar";

const draft = {
  comments: [
    { id: "right:a.ts:3", path: "a.ts", line: 3, side: "right" as const, body: "nit" },
    { id: "left:b.ts:9", path: "b.ts", line: 9, side: "left" as const, body: "drop this" },
  ],
};

describe("PrReviewBar", () => {
  it("lists pending comments with locations", () => {
    const markup = renderToStaticMarkup(
      createElement(PrReviewBar, {
        draft,
        busy: null,
        onSubmit: () => {},
        onDiscard: () => {},
        onEdit: () => {},
        onRemove: () => {},
      }),
    );
    expect(markup).toContain("2 review comments");
    expect(markup).toContain("a.ts:3");
    expect(markup).toContain("b.ts:9");
    expect(markup).toContain("Submit review");
    expect(markup).toContain("Discard review");
  });

  it("disables submit while empty", () => {
    const markup = renderToStaticMarkup(
      createElement(PrReviewBar, {
        draft: { comments: [] },
        busy: null,
        onSubmit: () => {},
        onDiscard: () => {},
        onEdit: () => {},
        onRemove: () => {},
      }),
    );
    expect(markup).toContain("No pending comments");
    expect(markup).toMatch(/disabled/);
  });
});
```

Add to `src/surfaces/InboxView.test.ts`:

```ts
  it("keeps the GitHub PR detail markup free of review bar chrome without a draft", () => {
    const markup = renderDetail(item({ kind: "pr" }));
    expect(markup).not.toContain("Submit review");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/chrome/PrReviewBar.test.ts`
Expected: FAIL with `Cannot find module './PrReviewBar'`.

- [ ] **Step 3: Make `DiffCommentComposer` pluggable**

In `src/surfaces/DiffCommentComposer.tsx`, add props and route submission:

```tsx
export function DiffCommentComposer({
  path,
  target,
  onDismiss,
  submitLabel,
  onSubmit,
}: {
  path: string;
  target: DiffCommentComposerTarget;
  onDismiss: () => void;
  submitLabel?: string;
  onSubmit?: (body: string) => void;
}) {
  const [comment, setComment] = useState("");
  const location = diffCommentLocation({ path, line: target.line });
  const submit = () => {
    const body = comment.trim();
    if (!body) return;
    if (onSubmit) {
      onSubmit(body);
    } else {
      const text = formatDiffComment({ path, line: target.line }, comment);
      if (!text) return;
      requestAddToChat(text, "plain");
    }
    onDismiss();
  };
```

Change the form `onSubmit` and the meta+enter handler to call `submit()`, and the submit button label to `{submitLabel ?? t("Add to chat")}`.

- [ ] **Step 4: Plumb `onLineComment` through `UnifiedDiffView` and `InboxPrDiff`**

In `UnifiedDiffView.tsx`:

1. Add to `Props` (after `onStageHunk`):

```ts
  /** When set, line comments go here instead of the chat. */
  onLineComment?: (comment: {
    filePath: string;
    line: UnifiedLine;
    body: string;
  }) => void;
```

2. Destructure `onLineComment` in the component and pass it to `FileSection`.
3. Add `onLineComment?: Props["onLineComment"]` to `FileSectionProps`, destructure it, and pass to `VirtualRows`.
4. Add `onLineComment?: Props["onLineComment"]` to `VirtualRows` props and use it at the composer (`UnifiedDiffView.tsx:793`):

```tsx
      {commentTarget ? (
        <DiffCommentComposer
          path={filePath}
          target={commentTarget}
          onDismiss={() => setCommentTarget(null)}
          {...(onLineComment
            ? {
                submitLabel: t("Add to review"),
                onSubmit: (body: string) =>
                  onLineComment({
                    filePath,
                    line: commentTarget.line,
                    body,
                  }),
              }
            : {})}
        />
      ) : null}
```

5. Add the `onLineComment` to the `FileSection` memo comparison (`equalFileSectionProps`, `UnifiedDiffView.tsx:453`) so a changed callback re-renders.

In `InboxPrDiff.tsx`, accept and forward the prop:

```tsx
type Props = {
  diff: GithubPrDiff;
  fullFile?: boolean;
  onLineComment?: (comment: {
    filePath: string;
    line: UnifiedLine;
    body: string;
  }) => void;
};

export function InboxPrDiff({ diff, fullFile = false, onLineComment }: Props) {
```

and pass `onLineComment={onLineComment}` to `UnifiedDiffView`.

- [ ] **Step 5: Implement `PrReviewBar.tsx`**

```tsx
import { useState } from "react";
import { GitPullRequest, Trash2 } from "./icons";
import {
  canSubmitReview,
  type PrReviewComment,
  type PrReviewDraft,
  type PrReviewEvent,
} from "../lib/prReview";
import { t } from "../i18n";

export function PrReviewBar({
  draft,
  busy,
  onSubmit,
  onDiscard,
  onEdit,
  onRemove,
}: {
  draft: PrReviewDraft;
  busy: string | null;
  onSubmit: (event: PrReviewEvent, body: string) => void;
  onDiscard: () => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<PrReviewEvent>("comment");
  const count = draft.comments.length;

  return (
    <div className="rounded-md border border-content/15 bg-content/[0.03] p-3">
      <div className="flex items-center gap-2">
        <GitPullRequest className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-[12px] text-content/80">
          {count === 1
            ? t("1 review comment")
            : t("{count} review comments", { count })}
        </span>
        <button
          type="button"
          disabled={busy != null}
          onClick={onDiscard}
          className="text-[11px] text-content/50 hover:text-content disabled:opacity-40"
        >
          {t("Discard review")}
        </button>
        <button
          type="button"
          disabled={busy != null || (event !== "approve" && !canSubmitReview(draft, event))}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:opacity-40"
        >
          {t("Submit review")}
        </button>
      </div>
      {count > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {draft.comments.map((comment: PrReviewComment) => (
            <li
              key={comment.id}
              className="flex items-start gap-2 rounded bg-content/5 px-2 py-1.5"
            >
              <span className="shrink-0 font-mono text-[11px] text-content/50">
                {comment.path}:{comment.line}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-content/80">
                {comment.body}
              </span>
              <button
                type="button"
                title={t("Edit comment")}
                onClick={() => {
                  const next = window.prompt(t("Edit comment"), comment.body);
                  if (next != null) onEdit(comment.id, next);
                }}
                className="shrink-0 text-[11px] text-content/50 hover:text-content"
              >
                {t("Edit")}
              </button>
              <button
                type="button"
                aria-label={t("Remove comment")}
                onClick={() => onRemove(comment.id)}
                className="shrink-0 text-content/50 hover:text-content"
              >
                <Trash2 className="size-3" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-content/45">{t("No pending comments")}</p>
      )}
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            rows={3}
            value={body}
            onChange={(input) => setBody(input.target.value)}
            placeholder={t("Review summary (optional for approve)")}
            className="w-full resize-y rounded-md border border-content/10 bg-background-base/70 px-2.5 py-2 text-[13px] leading-5 text-content outline-none placeholder:text-content/35"
          />
          <div className="flex items-center gap-1.5">
            {(["comment", "approve", "request-changes"] as PrReviewEvent[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={event === option}
                onClick={() => setEvent(option)}
                className={`rounded-md px-2 py-1 text-[11px] ${
                  event === option
                    ? "bg-content/15 text-content"
                    : "text-content/50 hover:text-content/80"
                }`}
              >
                {option === "comment"
                  ? t("Comment")
                  : option === "approve"
                    ? t("Approve")
                    : t("Request changes")}
              </button>
            ))}
            <button
              type="button"
              disabled={
                busy != null || (event !== "approve" && !canSubmitReview(draft, event))
              }
              onClick={() => onSubmit(event, body.trim())}
              className="ml-auto inline-flex h-7 items-center rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:opacity-40"
            >
              {t("Publish review")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

`Trash2` already exists in `src/chrome/icons.tsx:281`, so no icon changes are needed. The old conditional note about the Popover anchor is resolved by the `anchor` state above.

- [ ] **Step 6: Wire draft state into `InboxDetail`**

In `InboxView.tsx`:

1. Import the review helpers and `PrReviewBar`.
2. Add state seeded from the persisted draft (`peekReviewDraft(reviewDraftKey(item.projectPath, item.number))`):

```tsx
  const draftKey = reviewDraftKey(item.projectPath, item.number);
  const [reviewDraft, setReviewDraft] = useState<PrReviewDraft>(
    () => peekReviewDraft(draftKey) ?? emptyReviewDraft(),
  );

  useEffect(() => {
    setReviewDraft(peekReviewDraft(draftKey) ?? emptyReviewDraft());
  }, [draftKey]);

  const updateDraft = (next: PrReviewDraft) => {
    setReviewDraft(next);
    saveReviewDraft(draftKey, next);
  };
```

3. Replace the Task 7 `onSubmitReview` handler with a shared publisher plus header gating:

```tsx
  const publishReview = (event: PrReviewEvent, body: string) =>
    runAction("review", async () => {
      if (!details?.id) throw new Error("Missing pull request id");
      await githubPrReview(
        item.projectPath,
        item.number,
        details.id,
        event,
        body,
        reviewDraft.comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          side: comment.side,
          body: comment.body,
        })),
      );
      clearReviewDraft(draftKey);
      updateDraft(emptyReviewDraft());
    });

  const onSubmitReview = (event: PrReviewEvent) => {
    if (event !== "approve" && reviewDraft.comments.length === 0) {
      setActionError(t("Add a review comment before requesting changes"));
      return;
    }
    void publishReview(event, "");
  };
```

4. Render the bar in the Code tab above the diff (`InboxView.tsx:2166`):

```tsx
          {isPr && item.provider === "github" && tab === "code" ? (
            <PrReviewBar
              draft={reviewDraft}
              busy={busyAction}
              onSubmit={publishReview}
              onDiscard={() => {
                clearReviewDraft(draftKey);
                updateDraft(emptyReviewDraft());
              }}
              onEdit={(id, body) => updateDraft(updateReviewComment(reviewDraft, id, body))}
              onRemove={(id) => updateDraft(removeReviewComment(reviewDraft, id))}
            />
          ) : null}
```

5. Pass the inline handler to the diff (`InboxView.tsx:2177`):

```tsx
              <InboxPrDiff
                key={`${item.projectPath}:${item.number}:${revision}:${diffMode}`}
                diff={prDiff}
                fullFile={fullFile}
                onLineComment={({ filePath, line, body }) => {
                  const lineNumber = line.newNumber ?? line.oldNumber;
                  if (lineNumber == null) return;
                  updateDraft(
                    addReviewComment(reviewDraft, {
                      path: filePath,
                      line: lineNumber,
                      side: line.kind === "del" ? "left" : "right",
                      body,
                    }),
                  );
                }}
              />
```

- [ ] **Step 7: Run all affected tests and typecheck**

Run: `npx vitest run src/chrome/PrReviewBar.test.ts src/chrome/PrActions.test.ts src/surfaces/InboxView.test.ts src/lib/prReview.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/surfaces/DiffCommentComposer.tsx src/surfaces/UnifiedDiffView.tsx src/surfaces/InboxPrDiff.tsx src/chrome/PrReviewBar.tsx src/chrome/PrReviewBar.test.ts src/surfaces/InboxView.tsx
git commit -m "Add pending review comments to Inbox PR diffs."
```

---

### Task 10: i18n, full checks, and manual verification

**Files:**
- Modify: `src/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: every new English string introduced in Tasks 5-9.
- Produces: pt-BR translations; a green `npm run check:web` and `cargo test`.

- [ ] **Step 1: Add pt-BR entries**

Add entries in `src/i18n/pt-BR.ts` for at least: `Merge`, `Merge options`, `Squash and merge`, `Create a merge commit`, `Rebase and merge`, `Approve`, `Request changes`, `Close pull request`, `Reopen pull request`, `Merge pull request #{number} with {method}?`, `Close pull request #{number}?`, `Edit labels`, `Edit assignees`, `Edit reviewers`, `Apply`, `Filter…`, `Add to review`, `Add a review comment before requesting changes`, `Submit review`, `Discard review`, `Publish review`, `Comment`, `Review summary (optional for approve)`, `No pending comments`, `{count} review comments`, `1 review comment`, `Edit comment`, `Remove comment`, `Pull request is not open`, `Draft pull requests cannot be merged`, `Resolve merge conflicts first`, `Mergeability is still being computed`, `Required checks or reviews are blocking`, `The branch has conflicts`, `You cannot approve your own pull request`, `No labels`.

- [ ] **Step 2: Run the web suite and typecheck**

Run: `npm run check:web`
Expected: all vitest files pass, `tsc --noEmit` clean.

- [ ] **Step 3: Run the Rust checks**

Run: `npm run check:rust`
Expected: clean fmt, no clippy warnings, all tests pass.

- [ ] **Step 4: Manual end-to-end on a scratch PR**

Verify, in order:

1. Merge with squash, merge commit, and rebase on three scratch PRs; confirm the dialog names the method.
2. Blocked merge (required check failing) shows the gh error, not a crash.
3. Approve from a second account; confirm self-approve is disabled with the tooltip.
4. Request changes with a body and with only a line comment.
5. Close and reopen.
6. Add and remove a label, an assignee, and a reviewer; confirm GitHub reflects each.
7. Comment on added, context, and deleted lines from the Code tab; confirm they appear in one published review on GitHub.
8. Switch tabs with pending comments, come back, and confirm the draft survived.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/pt-BR.ts
git commit -m "Translate PR write actions."
```

---

## Self-review notes

- Spec coverage: merge (Task 1), review with pending draft (Tasks 3, 6, 9), close/reopen and metadata (Tasks 2, 8), inline comments (Task 9), details/gating fields (Tasks 4, 6), permissions/errors (Tasks 6, 7), i18n and verification (Task 10).
- Deviation from spec: inline draft cards were replaced by the review bar plus gutter marking (recorded in the spec); `viewerPermission` was replaced by `viewerLogin` from repo meta because `gh pr view --json` does not expose viewer permission.
- Type consistency: `PrReviewEvent`, `PrReviewComment`, `PrReviewDraft`, `GithubPrEditInput`, `GithubRepoMeta`, and `onLineComment` keep the same names across Tasks 5-9.
