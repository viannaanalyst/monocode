import {
  CHAT_BACKGROUND_OPACITY_MAX,
  CHAT_BACKGROUND_OPACITY_MIN,
  CHAT_BACKGROUND_SCOPE_DEFAULT,
  loadChatBackgroundFilledOpacity,
  loadChatBackgroundOpacity,
  loadChatBackgroundScope,
  type ChatBackgroundScope,
} from "./appearance";

const KEY = "monocode:project-chat-backgrounds";

export const PROJECT_CHAT_BACKGROUND_CHANGED =
  "monocode:project-chat-background-changed";

export type ProjectChatBackground = {
  path: string;
  /** Visibility in empty conversations. */
  opacity: number;
  /** Visibility once the conversation has messages. */
  opacityFilled: number;
  scope: ChatBackgroundScope;
};

type StoredProjectChatBackground = Partial<ProjectChatBackground>;

let revision = Date.now();

function clampOpacity(value: number): number {
  return Math.min(
    CHAT_BACKGROUND_OPACITY_MAX,
    Math.max(CHAT_BACKGROUND_OPACITY_MIN, value),
  );
}

function read(): Record<string, StoredProjectChatBackground> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, StoredProjectChatBackground>)
      : {};
  } catch {
    return {};
  }
}

function write(value: Record<string, StoredProjectChatBackground>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // private mode / quota
  }
}

function validScope(value: unknown): value is ChatBackgroundScope {
  return value === "empty" || value === "all";
}

export function loadProjectChatBackground(
  project: string,
): ProjectChatBackground | null {
  const stored = read()[project];
  const path = typeof stored?.path === "string" ? stored.path.trim() : "";
  if (!path) return null;
  const opacity =
    typeof stored.opacity === "number" && Number.isFinite(stored.opacity)
      ? clampOpacity(stored.opacity)
      : loadChatBackgroundOpacity();
  const opacityFilled =
    typeof stored.opacityFilled === "number" &&
    Number.isFinite(stored.opacityFilled)
      ? clampOpacity(stored.opacityFilled)
      : loadChatBackgroundFilledOpacity();
  return {
    path,
    opacity,
    opacityFilled,
    scope: validScope(stored.scope) ? stored.scope : loadChatBackgroundScope(),
  };
}

export function saveProjectChatBackground(
  project: string,
  value: Omit<ProjectChatBackground, "opacityFilled"> & {
    opacityFilled?: number;
  },
) {
  const path = value.path.trim();
  if (!project || !path) return;
  const next = read();
  next[project] = {
    path,
    opacity: clampOpacity(value.opacity),
    // Older callers only knew the empty-session opacity; reuse it when unset.
    opacityFilled: clampOpacity(value.opacityFilled ?? value.opacity),
    scope: validScope(value.scope)
      ? value.scope
      : CHAT_BACKGROUND_SCOPE_DEFAULT,
  };
  write(next);
  notifyProjectChatBackgroundChanged();
}

export function clearProjectChatBackgroundSetting(project: string) {
  const next = read();
  if (!(project in next)) return;
  delete next[project];
  write(next);
  notifyProjectChatBackgroundChanged();
}

export function notifyProjectChatBackgroundChanged() {
  revision += 1;
  window.dispatchEvent(new CustomEvent(PROJECT_CHAT_BACKGROUND_CHANGED));
}

export function projectChatBackgroundRevision(): number {
  return revision;
}

export function subscribeProjectChatBackground(listener: () => void) {
  window.addEventListener(PROJECT_CHAT_BACKGROUND_CHANGED, listener);
  return () =>
    window.removeEventListener(PROJECT_CHAT_BACKGROUND_CHANGED, listener);
}
