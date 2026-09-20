import { invoke } from "@tauri-apps/api/core";

export type ClickUpStatus = {
  connected: boolean;
};

export type ClickUpTask = {
  provider: "clickup";
  kind: "clickup";
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

export type ClickUpTaskDetails = {
  body: string;
  author: string;
  authorAvatarUrl?: string;
};

export type ClickUpTaskComment = {
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
  replies: ClickUpTaskComment[];
};

export type ClickUpTaskThread = {
  comments: ClickUpTaskComment[];
  truncated: boolean;
  reviewDecision: string;
  baseRefName: string;
  headRefName: string;
};

export const CLICKUP_CHANGE_EVENT = "monocode:clickup-change";

const detailsById = new Map<string, ClickUpTaskDetails>();
const threadById = new Map<string, ClickUpTaskThread>();
const threadInflight = new Map<string, Promise<ClickUpTaskThread>>();

export function clickUpConnected(): Promise<ClickUpStatus> {
  return invoke<ClickUpStatus>("clickup_status");
}

export function saveClickUpToken(token: string): Promise<ClickUpStatus> {
  return invoke<ClickUpStatus>("clickup_set_token", { token: token.trim() });
}

export function disconnectClickUp(): Promise<ClickUpStatus> {
  return invoke<ClickUpStatus>("clickup_set_token", { token: "" });
}

export function listClickUpTasks(query: {
  assignedToMe: boolean;
  state: "open" | "all";
  limit?: number;
}): Promise<ClickUpTask[]> {
  return invoke<ClickUpTask[]>("clickup_list_tasks", {
    assignedToMe: query.assignedToMe,
    state: query.state,
    limit: query.limit,
  });
}

export function peekClickUpTaskDetails(id: string): ClickUpTaskDetails | null {
  return detailsById.get(id) ?? null;
}

export async function clickUpTaskDetails(
  id: string,
): Promise<ClickUpTaskDetails> {
  const details = await invoke<ClickUpTaskDetails>("clickup_task_details", {
    id,
  });
  detailsById.set(id, details);
  return details;
}

export function peekClickUpTaskThread(id: string): ClickUpTaskThread | null {
  return threadById.get(id) ?? null;
}

export async function clickUpTaskThread(
  id: string,
  options?: { force?: boolean },
): Promise<ClickUpTaskThread> {
  if (options?.force) {
    threadById.delete(id);
    threadInflight.delete(id);
  }
  const pending = threadInflight.get(id);
  if (pending) return pending;
  const promise = invoke<ClickUpTaskThread>("clickup_task_thread", { id })
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

export async function clickUpTaskComment(
  id: string,
  body: string,
  options?: { parentId?: string },
): Promise<string> {
  const url = await invoke<string>("clickup_task_comment", {
    id,
    body: body.trim(),
    parentId: options?.parentId?.trim() ?? "",
  });
  threadById.delete(id);
  threadInflight.delete(id);
  return url;
}

export function clearClickUpCache() {
  detailsById.clear();
  threadById.clear();
  threadInflight.clear();
}

export function notifyClickUpChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLICKUP_CHANGE_EVENT));
}
