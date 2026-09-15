# GitHub pull request write actions (Inbox) — design

## Goal

Let the Inbox act on GitHub pull requests, not just read them: merge, submit a review (approve / comment / request changes) with inline comments, close/reopen, edit labels/assignees/reviewers, and post inline diff comments as real GitHub review comments. Phase 1 of a three-phase plan (later: session Kanban board, automations).

## Scope

In scope, for GitHub pull requests only:

- Merge with method choice (squash default, merge commit, rebase) and optional branch deletion.
- Review submission with a pending draft: accumulate inline comments locally, publish once with `COMMENT`, `APPROVE`, or `REQUEST_CHANGES` and an optional body.
- Close and reopen.
- Add/remove labels, assignees, and reviewers.
- Inline comments on the Inbox PR diff (Code tab) tied to the pending review.

Out of scope:

- GitLab merge requests (read-only today), issue write actions, PR title/body/base editing, auto-merge and merge queue, teams as reviewers, review thread resolution, editing an already-submitted review.
- No new GitHub authentication path: everything keeps using the locally authenticated `gh` CLI.

## Backend

All commands live in `src-tauri/src/fs.rs` and are registered in `src-tauri/src/lib.rs`, following the existing `gh` patterns (`gh_checked`, `gh_stdout`, `gh_run`, `valid_github_node_id`).

- `git_github_pr_merge(cwd, number, method, deleteBranch)` → `gh pr merge <number> --squash|--merge|--rebase [--delete-branch]`.
- `git_github_pr_review(cwd, number, event, body, comments)` → one GraphQL `addPullRequestReview` mutation:
  - `pullRequestId` resolved from the PR node id (already returned by the details query).
  - `event`: `APPROVE | COMMENT | REQUEST_CHANGES`; `body` optional; `comments[]`: `{ path, line, side, body }` with `side = RIGHT` for added/context lines and `LEFT` for deleted lines.
- `git_github_pr_state(cwd, number, close)` → `gh pr close <number>` / `gh pr reopen <number>`.
- `git_github_pr_edit(cwd, number, add/remove labels, assignees, reviewers)` → `gh pr edit` flags for labels and assignees, `gh api` for reviewers.
- `git_github_repo_meta(cwd)` → cached per repo: available labels (`gh label list`), assignable users (`gh api repos/{owner}/{repo}/assignees`), collaborators for reviewers (`gh api repos/{owner}/{repo}/collaborators`), and the authenticated `viewerLogin`.

The existing `git_github_work_item_details` query is extended with: `id`, `state`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `viewerPermission`, `author.login`, `labels`, `assignees`, and `reviewRequests`. These fields drive enable/disable gating with reasons.

## Frontend

- `src/lib/githubTasks.ts`: types and `invoke` wrappers for the new commands, plus cache invalidation (details, thread, PR diff, list) after every mutation.
- `src/lib/prReview.ts` (new): pending review as pure functions — add/update/remove comment, validation (comment and request-changes require a body; approve does not), payload builder, and summary counts. No UI, fully unit-testable.
- Inbox PR detail header gains an action bar:
  - Merge as a split button: the primary action always merges with squash; the menu picks squash / merge commit / rebase and a "delete branch" checkbox. A native confirmation names the chosen method and whether the branch will be deleted before running.
  - Approve and Request changes submit the pending review (they open the submit dialog when there are draft comments).
  - Close/Reopen in an overflow menu.
  - Label, assignee, and reviewer chips become editable: click opens a searchable multi-select popover with optimistic update and rollback on error.
- Diff (Code tab): hovering a line shows a `+` affordance; click opens an inline composer. Submitted-to-draft comments render as cards under the line, and a review bar shows "N comments · Submit review" with a discard action. Reuses the visual pattern from `src/surfaces/DiffCommentComposer.tsx`, but publishes to GitHub instead of sending to chat.

## Permissions and error handling

- `viewerPermission = READ` hides all write actions.
- Merge disabled (with tooltip reason) when the PR is closed, draft, conflicting, or `mergeStateStatus` is `BLOCKED`/`UNKNOWN`.
- Approve disabled on the viewer's own PR; Request changes requires a body.
- `gh` failures go through the existing `classifyInboxError`, with explicit mapping for branch protection/required checks, merge conflicts, missing permission, self-approve, already merged, and head SHA changed.

## State and refresh

- The pending review lives in memory keyed by `cwd + number`, survives view switches, and clears only on submit, explicit discard, or leaving the PR.
- After a successful mutation, force-refresh details, thread, and list; show the new state immediately (review status, labels, assignees, reviewers, merged/closed).
- New user-facing strings are added to the i18n locale files.

## Testing and verification

- Vitest: `src/lib/prReview.test.ts` for draft logic and validation; `src/surfaces/InboxView.test.ts` for action gating, submit flow, and inline comment drafting; cache-invalidation coverage where practical.
- Rust: `#[cfg(test)]` tests for command argument/payload construction (merge method flags, review mutation payload, edit deltas, repo-meta parsing), following the existing tests in `fs.rs`.
- Manual end-to-end on a scratch repository PR: each merge method, approve/request changes, close/reopen, label/assignee/reviewer edits, inline comments on added/context/deleted lines, and a blocked merge to confirm the error is surfaced.
- Run `npm run check:web` and `cargo test` before considering the phase done.
