import { invoke } from "@tauri-apps/api/core";

export type NotionStatus = {
  connected: boolean;
  databaseId: string;
};

export type NotionTask = {
  provider: "notion";
  kind: "notion";
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

export type NotionTaskDetails = {
  body: string;
  author: string;
  authorAvatarUrl?: string;
};

export type NotionTaskComment = {
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
  replies: NotionTaskComment[];
};

export type NotionTaskThread = {
  comments: NotionTaskComment[];
  truncated: boolean;
  reviewDecision: string;
  baseRefName: string;
  headRefName: string;
};

export type NotionPropertyOption = {
  name: string;
  color: string;
};

export type NotionDatabaseSchema = {
  titleProperty: string;
  stateProperty: string;
  stateType: "status" | "select" | "";
  stateOptions: NotionPropertyOption[];
  labelsProperty: string;
  labelOptions: NotionPropertyOption[];
};

export type NotionTaskChanges = {
  title?: string;
  status?: string;
  labels?: string[];
};

export const NOTION_CHANGE_EVENT = "monocode:notion-change";

const detailsById = new Map<string, NotionTaskDetails>();
const threadById = new Map<string, NotionTaskThread>();
const threadInflight = new Map<string, Promise<NotionTaskThread>>();

export function notionConnected(): Promise<NotionStatus> {
  return invoke<NotionStatus>("notion_status");
}

export function saveNotionConfig(
  token: string,
  databaseId: string,
): Promise<NotionStatus> {
  return invoke<NotionStatus>("notion_set_config", {
    token: token.trim(),
    databaseId: databaseId.trim(),
  });
}

export function disconnectNotion(): Promise<NotionStatus> {
  return invoke<NotionStatus>("notion_set_config", {
    token: "",
    databaseId: "",
  });
}

export function listNotionTasks(query: {
  state: "open" | "all";
  assignedToMe?: boolean;
}): Promise<NotionTask[]> {
  return invoke<NotionTask[]>("notion_list_tasks", {
    state: query.state,
    assignedToMe: query.assignedToMe ?? false,
  });
}

export function notionDatabaseSchema(): Promise<NotionDatabaseSchema> {
  return invoke<NotionDatabaseSchema>("notion_database_schema");
}

export function createNotionTask(
  title: string,
  status?: string,
): Promise<NotionTask> {
  const task = invoke<NotionTask>("notion_create_task", {
    title: title.trim(),
    status: status?.trim() || null,
  });
  return task.then((created) => {
    notifyNotionChange();
    return created;
  });
}

export function updateNotionTask(
  id: string,
  changes: NotionTaskChanges,
): Promise<NotionTask> {
  const task = invoke<NotionTask>("notion_update_task", {
    id,
    title: changes.title?.trim() ?? null,
    status: changes.status?.trim() ?? null,
    labels: changes.labels ?? null,
  });
  return task.then((updated) => {
    detailsById.delete(id);
    threadById.delete(id);
    threadInflight.delete(id);
    notifyNotionChange();
    return updated;
  });
}

export function peekNotionTaskDetails(id: string): NotionTaskDetails | null {
  return detailsById.get(id) ?? null;
}

export async function notionTaskDetails(
  id: string,
): Promise<NotionTaskDetails> {
  const details = await invoke<NotionTaskDetails>("notion_task_details", {
    id,
  });
  detailsById.set(id, details);
  return details;
}

export function peekNotionTaskThread(id: string): NotionTaskThread | null {
  return threadById.get(id) ?? null;
}

export async function notionTaskThread(
  id: string,
  options?: { force?: boolean },
): Promise<NotionTaskThread> {
  if (options?.force) {
    threadById.delete(id);
    threadInflight.delete(id);
  }
  const pending = threadInflight.get(id);
  if (pending) return pending;
  const promise = invoke<NotionTaskThread>("notion_task_thread", { id })
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

export async function notionTaskComment(
  id: string,
  body: string,
  options?: { parentId?: string },
): Promise<string> {
  const url = await invoke<string>("notion_task_comment", {
    id,
    body: body.trim(),
    parentId: options?.parentId?.trim() ?? "",
  });
  threadById.delete(id);
  threadInflight.delete(id);
  return url;
}

export function clearNotionCache() {
  detailsById.clear();
  threadById.clear();
  threadInflight.clear();
}

export function notifyNotionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTION_CHANGE_EVENT));
}
