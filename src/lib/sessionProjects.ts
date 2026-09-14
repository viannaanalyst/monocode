import { projectKey, projectName } from "./paths";
import type { SessionSummary } from "./sessionStore";

const COLLAPSED_KEY = "monocode.collapsedProjectGroups";

/** Fired on `window` whenever a project group is collapsed or expanded. */
export const COLLAPSED_PROJECTS_CHANGE_EVENT =
  "monocode:collapsed-project-groups-change";

/** Project keys (full paths) whose group is collapsed in the sidebar. */
export function loadCollapsedProjects(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string" && !!value),
    );
  } catch {
    return new Set();
  }
}

export function saveCollapsedProjects(keys: ReadonlySet<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys]));
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COLLAPSED_PROJECTS_CHANGE_EVENT));
}

export function subscribeCollapsedProjects(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(COLLAPSED_PROJECTS_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(COLLAPSED_PROJECTS_CHANGE_EVENT, onStoreChange);
}

/**
 * Conversations of one project, ready for the sidebar's project → session tree.
 *
 * Groups preserve the incoming order so the newest project (its most recent
 * session) lands first; callers keep a single sorted list and let grouping only
 * reshape it.
 */
export type SessionProjectGroup = {
  /** Stable identity for the project (full path, so same-named folders differ). */
  key: string;
  /** The cwd as first seen, used for display and for project-relative actions. */
  path: string;
  name: string;
  sessions: SessionSummary[];
};

export function groupSessionsByProject(
  sessions: readonly SessionSummary[],
): SessionProjectGroup[] {
  const groups = new Map<string, SessionProjectGroup>();
  const order: string[] = [];
  for (const session of sessions) {
    const path = session.cwd || "~";
    const key = projectKey(path);
    let group = groups.get(key);
    if (!group) {
      group = { key, path, name: projectName(path), sessions: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.sessions.push(session);
  }
  return order.map((key) => groups.get(key)!);
}
