import { invoke } from "@tauri-apps/api/core";

export type JiraStatus = {
  connected: boolean;
  site: string;
};

export type JiraIssue = {
  provider: "jira";
  kind: "jira";
  id: string;
  identifier: string;
  number: number;
  title: string;
  url: string;
  state: string;
  stateType: string;
  updatedAt: string;
  labels: { name: string; color: string }[];
  assignees: { login: string; avatarUrl?: string }[];
  draft: boolean;
  repo: string;
  teamId: string;
  teamName: string;
  projectId: string;
  projectName: string;
  projectPath: string;
};

export type JiraIssueDetails = {
  body: string;
  author: string;
  authorAvatarUrl?: string;
};

export type JiraIssueComment = {
  id: string;
  kind: string;
  author: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  url: string;
  state: string;
  path: string;
  line: number | null;
  resolved: boolean;
  threadId: string;
  replies: JiraIssueComment[];
};

export type JiraIssueThread = {
  comments: JiraIssueComment[];
  truncated: boolean;
  reviewDecision: string;
  baseRefName: string;
  headRefName: string;
};

export const JIRA_CHANGE_EVENT = "monocode:jira-change";

const detailsById = new Map<string, JiraIssueDetails>();
const threadById = new Map<string, JiraIssueThread>();
const threadInflight = new Map<string, Promise<JiraIssueThread>>();

export function jiraConnected(): Promise<JiraStatus> {
  return invoke<JiraStatus>("jira_status");
}

export function saveJiraConfig(
  site: string,
  email: string,
  token: string,
): Promise<JiraStatus> {
  return invoke<JiraStatus>("jira_set_config", {
    site: site.trim(),
    email: email.trim(),
    token: token.trim(),
  });
}

export function disconnectJira(): Promise<JiraStatus> {
  return invoke<JiraStatus>("jira_set_config", {
    site: "",
    email: "",
    token: "",
  });
}

export function listJiraIssues(query: {
  assignedToMe: boolean;
  state: "open" | "all";
  limit?: number;
}): Promise<JiraIssue[]> {
  return invoke<JiraIssue[]>("jira_list_issues", {
    assignedToMe: query.assignedToMe,
    state: query.state,
    limit: query.limit,
  });
}

export function peekJiraIssueDetails(id: string): JiraIssueDetails | null {
  return detailsById.get(id) ?? null;
}

export async function jiraIssueDetails(id: string): Promise<JiraIssueDetails> {
  const details = await invoke<JiraIssueDetails>("jira_issue_details", { id });
  detailsById.set(id, details);
  return details;
}

export function peekJiraIssueThread(id: string): JiraIssueThread | null {
  return threadById.get(id) ?? null;
}

export async function jiraIssueThread(
  id: string,
  options?: { force?: boolean },
): Promise<JiraIssueThread> {
  if (options?.force) {
    threadById.delete(id);
    threadInflight.delete(id);
  }
  const pending = threadInflight.get(id);
  if (pending) return pending;
  const promise = invoke<JiraIssueThread>("jira_issue_thread", { id })
    .then((thread) => {
      threadById.set(id, thread);
      return thread;
    })
    .finally(() => {
      if (threadInflight.get(id) === promise) threadInflight.delete(id);
    });
  threadInflight.set(id, promise);
  return promise;
}

export async function jiraIssueComment(
  id: string,
  body: string,
  options?: { parentId?: string },
): Promise<string> {
  const url = await invoke<string>("jira_issue_comment", {
    id,
    body: body.trim(),
    parentId: options?.parentId?.trim() ?? "",
  });
  threadById.delete(id);
  threadInflight.delete(id);
  return url;
}

export function clearJiraCache() {
  detailsById.clear();
  threadById.clear();
  threadInflight.clear();
}

export function notifyJiraChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(JIRA_CHANGE_EVENT));
}
