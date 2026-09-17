import { t } from "../i18n";
import { ALT, IS_MAC, MOD, SHIFT } from "./platform";
import type { VoiceModel } from "./transcribe";

export type { VoiceModel };

const SECTION_KEY = "monocode.settingsSection";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "keybindings"
  | "providers"
  | "inbox"
  | "project"
  | "voice"
  | "skills"
  | "archive";

/** Rail buckets. Sections list in order under their group label. */
export type SettingsGroupId = "app" | "agents" | "workspace";

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: "app", label: "App" },
  { id: "agents", label: "Agents" },
  { id: "workspace", label: "Workspace" },
];

export type SettingsSection = {
  id: SettingsSectionId;
  group: SettingsGroupId;
  label: string;
  description: string;
  /** Extra words search matches the section on, beyond its label. */
  keywords?: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    group: "app",
    label: "General",
    description: "App behavior and the current build.",
    keywords: "version update sounds notifications notes rail",
  },
  {
    id: "appearance",
    group: "app",
    label: "Appearance",
    description: "Theme, tint, and fonts.",
    keywords: "theme dark light color accent glass blur zoom scale wallpaper",
  },
  {
    id: "keybindings",
    group: "app",
    label: "Keybindings",
    description: "Shortcuts used by the workspace.",
    keywords: "shortcut hotkey keyboard binding",
  },
  {
    id: "providers",
    group: "agents",
    label: "Agent providers",
    description: "CLIs and the default model for new sessions.",
    keywords: "model harness claude codex gemini cli default hooks",
  },
  {
    id: "skills",
    group: "agents",
    label: "Agent skills",
    description: "File skills from the project, you, and harnesses.",
    keywords: "skill instructions prompt",
  },
  {
    id: "voice",
    group: "app",
    label: "Voice input",
    description: "Dictate prompts with OpenAI.",
    keywords: "speech dictation microphone transcription audio",
  },
  {
    id: "inbox",
    group: "workspace",
    label: "Inbox",
    description: "Services that feed the Inbox.",
    keywords: "github gitlab linear connect token integration",
  },
  {
    id: "project",
    group: "workspace",
    label: "Project instructions",
    description: "Shared AGENTS.md for this project.",
    keywords: "agents md instructions memory context",
  },
  {
    id: "archive",
    group: "workspace",
    label: "Archived",
    description: "Archived projects and conversations.",
    keywords: "archived restore delete hidden",
  },
];

export function settingsSectionsByGroup(): {
  id: SettingsGroupId;
  label: string;
  sections: SettingsSection[];
}[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: SETTINGS_SECTIONS.filter((section) => section.group === group.id),
  })).filter((group) => group.sections.length > 0);
}

/**
 * One searchable control. `id` is the row's `data-setting-id` in SettingsView,
 * which is also what Settings scrolls to when it opens on an anchor.
 */
export type SettingsEntry = {
  id: string;
  section: SettingsSectionId;
  label: string;
  keywords?: string;
};

export const SETTINGS_INDEX: SettingsEntry[] = [
  {
    id: "update",
    section: "general",
    label: "Version",
    keywords: "update upgrade release what's new build changelog",
  },
  {
    id: "sounds",
    section: "general",
    label: "Sounds",
    keywords: "audio cue chime mute volume",
  },
  {
    id: "notifications",
    section: "general",
    label: "Notifications",
    keywords: "notify alert toast permission reminder background",
  },
  {
    id: "notes",
    section: "general",
    label: "Notes",
    keywords: "notebook markdown rail scratchpad",
  },
  {
    id: "working-agents",
    section: "general",
    label: "Working agents",
    keywords: "live running sessions rail card",
  },
  {
    id: "theme",
    section: "appearance",
    label: "Theme",
    keywords: "dark light system appearance mode",
  },
  {
    id: "accent-color",
    section: "appearance",
    label: "Accent color",
    keywords: "highlight bubble send button tint",
  },
  {
    id: "hue",
    section: "appearance",
    label: "Hue",
    keywords: "tint color chrome",
  },
  {
    id: "saturation",
    section: "appearance",
    label: "Saturation",
    keywords: "tint color neutral grey gray",
  },
  {
    id: "dark-lightness",
    section: "appearance",
    label: "Dark-mode lightness",
    keywords: "black brightness contrast background",
  },
  {
    id: "sidebar-opacity",
    section: "appearance",
    label: "Sidebar opacity",
    keywords: "glass translucent transparency vibrancy",
  },
  {
    id: "blur",
    section: "appearance",
    label: "Blur radius",
    keywords: "glass translucent vibrancy backdrop",
  },
  {
    id: "main-pane-glass",
    section: "appearance",
    label: "Main pane glass",
    keywords: "translucent transparency body window",
  },
  {
    id: "interface-scale",
    section: "appearance",
    label: "Interface scale",
    keywords: "zoom font size bigger smaller ui",
  },
  {
    id: "chat-background",
    section: "appearance",
    label: "Chat background",
    keywords: "wallpaper image picture opacity backdrop",
  },
  {
    id: "transcript-layout",
    section: "general",
    label: "Transcript layout",
    keywords: "full width chat bubble message",
  },
  {
    id: "anchor-prompts",
    section: "general",
    label: "Anchor prompts to top",
    keywords: "scroll position sticky message",
  },
  {
    id: "follow-up",
    section: "general",
    label: "Follow-up behavior",
    keywords: "queue steer interrupt send while running",
  },
  {
    id: "effort-control",
    section: "general",
    label: "Effort control",
    keywords: "thinking reasoning model picker composer",
  },
  {
    id: "composer-mascot",
    section: "general",
    label: "Composer mascot",
    keywords: "runner animation coin fun",
  },
  {
    id: "diff-view",
    section: "general",
    label: "Diff view",
    keywords: "unified editor review changes working tree",
  },
  {
    id: "empty-session-games",
    section: "general",
    label: "Empty session games",
    keywords: "pacman snake arcade grid fun",
  },
  {
    id: "claude-hooks",
    section: "providers",
    label: "Claude Code hooks",
    keywords: "pretooluse settings.json block command notification",
  },
  {
    id: "project-notifications",
    section: "inbox",
    label: "Project notifications",
    keywords: "mute resume sounds banners reminders categories",
  },
  {
    id: "github",
    section: "inbox",
    label: "GitHub",
    keywords: "gh cli connect pull request sign in",
  },
  {
    id: "gitlab",
    section: "inbox",
    label: "GitLab",
    keywords: "token self-managed merge request connect",
  },
  {
    id: "linear",
    section: "inbox",
    label: "Linear",
    keywords: "api key issues teams connect",
  },
  {
    id: "show-archived",
    section: "archive",
    label: "Show archived in the sidebar",
    keywords: "hidden conversations list",
  },
];

export type SettingsSearchResult = {
  section: SettingsSectionId;
  sectionLabel: string;
  /** Row to scroll to, or `null` when the whole section matched. */
  settingId: string | null;
  label: string;
};

/** Ranks a label/keyword pair against a lowercased needle; `null` means no match. */
function matchScore(
  needle: string,
  label: string,
  keywords?: string,
): number | null {
  const lower = label.toLowerCase();
  if (lower.startsWith(needle)) return 0;
  if (lower.includes(needle)) return 1;
  if (keywords?.toLowerCase().includes(needle)) return 2;
  return null;
}

/** Individual settings first, then whole sections, so a row wins its own name. */
export function searchSettings(
  query: string,
  limit = 8,
): SettingsSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { score: number; result: SettingsSearchResult }[] = [];

  for (const entry of SETTINGS_INDEX) {
    const score = matchScore(needle, entry.label, entry.keywords);
    if (score == null) continue;
    scored.push({
      score,
      result: {
        section: entry.section,
        sectionLabel: settingsSectionLabel(entry.section),
        settingId: entry.id,
        label: entry.label,
      },
    });
  }

  for (const section of SETTINGS_SECTIONS) {
    const score = matchScore(
      needle,
      section.label,
      `${section.description} ${section.keywords ?? ""}`,
    );
    if (score == null) continue;
    scored.push({
      score: score + 0.5,
      result: {
        section: section.id,
        sectionLabel: section.label,
        settingId: null,
        label: section.label,
      },
    });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.result.label.localeCompare(b.result.label),
    )
    .slice(0, limit)
    .map((item) => item.result);
}

export const SETTINGS_SECTION_DEFAULT: SettingsSectionId = "general";

export const SETTINGS_NAV_GROUPS: {
  label: string;
  ids: SettingsSectionId[];
}[] = [
  {
    label: "Personal",
    ids: ["general", "appearance", "keybindings", "voice"],
  },
  { label: "Integrations", ids: ["inbox"] },
  { label: "Coding", ids: ["providers", "skills", "project"] },
  { label: "System", ids: ["archive"] },
];

export function isSettingsSectionId(
  value: unknown,
): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export function settingsSectionLabel(id: SettingsSectionId): string {
  return t(
    SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? "General",
  );
}

export function settingsSectionDescription(id: SettingsSectionId): string {
  return t(
    SETTINGS_SECTIONS.find((section) => section.id === id)?.description ?? "",
  );
}

export function loadSettingsSection(): SettingsSectionId {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    return isSettingsSectionId(raw) ? raw : SETTINGS_SECTION_DEFAULT;
  } catch {
    return SETTINGS_SECTION_DEFAULT;
  }
}

export function saveSettingsSection(id: SettingsSectionId) {
  try {
    localStorage.setItem(SECTION_KEY, id);
  } catch {
    // private mode / quota
  }
}

const COMPOSER_RUNNER_KEY = "monocode.composerRunner";

const FOLLOW_UP_BEHAVIOR_KEY = "monocode.followUpBehavior";

const COMPOSER_EFFORT_VISIBLE_KEY = "monocode.composerEffortVisible";

export type FollowUpBehavior = "steer" | "queue";

export const FOLLOW_UP_BEHAVIOR_DEFAULT: FollowUpBehavior = "steer";

export function loadFollowUpBehavior(): FollowUpBehavior {
  try {
    const raw = localStorage.getItem(FOLLOW_UP_BEHAVIOR_KEY);
    return raw === "queue" || raw === "steer"
      ? raw
      : FOLLOW_UP_BEHAVIOR_DEFAULT;
  } catch {
    return FOLLOW_UP_BEHAVIOR_DEFAULT;
  }
}

export function saveFollowUpBehavior(value: FollowUpBehavior) {
  try {
    localStorage.setItem(FOLLOW_UP_BEHAVIOR_KEY, value);
  } catch {
    // private mode / quota
  }
}

export const COMPOSER_EFFORT_VISIBLE_DEFAULT = false;

/** Fired on `window` when the standalone composer effort control setting flips. */
export const COMPOSER_EFFORT_VISIBLE_CHANGE_EVENT =
  "monocode:composer-effort-visible-change";

export function loadComposerEffortVisible(): boolean {
  try {
    const raw = localStorage.getItem(COMPOSER_EFFORT_VISIBLE_KEY);
    if (raw == null) return COMPOSER_EFFORT_VISIBLE_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return COMPOSER_EFFORT_VISIBLE_DEFAULT;
  }
}

export function saveComposerEffortVisible(value: boolean) {
  try {
    localStorage.setItem(COMPOSER_EFFORT_VISIBLE_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(COMPOSER_EFFORT_VISIBLE_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeComposerEffortVisible(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(COMPOSER_EFFORT_VISIBLE_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(
      COMPOSER_EFFORT_VISIBLE_CHANGE_EVENT,
      onStoreChange,
    );
}

export const COMPOSER_RUNNER_DEFAULT = true;

/** Fired on `window` when the composer mascot setting flips. */
export const COMPOSER_RUNNER_CHANGE_EVENT = "monocode:composer-runner-change";

export function loadComposerRunner(): boolean {
  try {
    const raw = localStorage.getItem(COMPOSER_RUNNER_KEY);
    if (raw == null) return COMPOSER_RUNNER_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return COMPOSER_RUNNER_DEFAULT;
  }
}

export function saveComposerRunner(value: boolean) {
  try {
    localStorage.setItem(COMPOSER_RUNNER_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(COMPOSER_RUNNER_CHANGE_EVENT, { detail: value }),
  );
}

const NOTES_ENABLED_KEY = "monocode.notesEnabled";

export const NOTES_ENABLED_DEFAULT = true;

/** Fired on `window` when the Notes UI setting flips. */
export const NOTES_ENABLED_CHANGE_EVENT = "monocode:notes-enabled-change";

export function loadNotesEnabled(): boolean {
  try {
    const raw = localStorage.getItem(NOTES_ENABLED_KEY);
    if (raw == null) return NOTES_ENABLED_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return NOTES_ENABLED_DEFAULT;
  }
}

export function saveNotesEnabled(value: boolean) {
  try {
    localStorage.setItem(NOTES_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(NOTES_ENABLED_CHANGE_EVENT, { detail: value }),
  );
}

export function subscribeNotesEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NOTES_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(NOTES_ENABLED_CHANGE_EVENT, onStoreChange);
}

const LIVE_AGENTS_ENABLED_KEY = "monocode.liveAgentsEnabled";

export const LIVE_AGENTS_ENABLED_DEFAULT = true;

/** Fired on `window` when the working-agents rail card setting flips. */
export const LIVE_AGENTS_ENABLED_CHANGE_EVENT =
  "monocode:live-agents-enabled-change";

export function loadLiveAgentsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(LIVE_AGENTS_ENABLED_KEY);
    if (raw == null) return LIVE_AGENTS_ENABLED_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return LIVE_AGENTS_ENABLED_DEFAULT;
  }
}

export function saveLiveAgentsEnabled(value: boolean) {
  try {
    localStorage.setItem(LIVE_AGENTS_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(LIVE_AGENTS_ENABLED_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeLiveAgentsEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LIVE_AGENTS_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(LIVE_AGENTS_ENABLED_CHANGE_EVENT, onStoreChange);
}

const GRID_ARCADE_ENABLED_KEY = "monocode.gridArcadeEnabled";

export const GRID_ARCADE_ENABLED_DEFAULT = true;

/** Fired on `window` when the empty-session games setting flips. */
export const GRID_ARCADE_ENABLED_CHANGE_EVENT =
  "monocode:grid-arcade-enabled-change";

export function loadGridArcadeEnabled(): boolean {
  try {
    const raw = localStorage.getItem(GRID_ARCADE_ENABLED_KEY);
    if (raw == null) return GRID_ARCADE_ENABLED_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return GRID_ARCADE_ENABLED_DEFAULT;
  }
}

export function saveGridArcadeEnabled(value: boolean) {
  try {
    localStorage.setItem(GRID_ARCADE_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(GRID_ARCADE_ENABLED_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeGridArcadeEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(GRID_ARCADE_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(GRID_ARCADE_ENABLED_CHANGE_EVENT, onStoreChange);
}

const DIFF_VIEWER_KEY = "monocode.diffViewer";

export type DiffViewer = "editor" | "unified";

export const DIFF_VIEWER_DEFAULT: DiffViewer = "editor";

/** Fired on `window` when the working-tree diff layout flips. */
export const DIFF_VIEWER_CHANGE_EVENT = "monocode:diff-viewer-change";

function isDiffViewer(value: unknown): value is DiffViewer {
  return value === "editor" || value === "unified";
}

export function loadDiffViewer(): DiffViewer {
  try {
    const raw = localStorage.getItem(DIFF_VIEWER_KEY);
    return isDiffViewer(raw) ? raw : DIFF_VIEWER_DEFAULT;
  } catch {
    return DIFF_VIEWER_DEFAULT;
  }
}

export function saveDiffViewer(value: DiffViewer) {
  const next = isDiffViewer(value) ? value : DIFF_VIEWER_DEFAULT;
  try {
    localStorage.setItem(DIFF_VIEWER_KEY, next);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DiffViewer>(DIFF_VIEWER_CHANGE_EVENT, { detail: next }),
  );
}

export function subscribeDiffViewer(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DIFF_VIEWER_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(DIFF_VIEWER_CHANGE_EVENT, onStoreChange);
}

const SESSION_ACTIVITY_KEY = "monocode.sessionActivityEnabled";

export const SESSION_ACTIVITY_ENABLED_DEFAULT = false;

/** Fired on `window` when the transcript activity card setting flips. */
export const SESSION_ACTIVITY_ENABLED_CHANGE_EVENT =
  "monocode:session-activity-enabled-change";

export function loadSessionActivityEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_ACTIVITY_KEY);
    if (raw == null) return SESSION_ACTIVITY_ENABLED_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return SESSION_ACTIVITY_ENABLED_DEFAULT;
  }
}

export function saveSessionActivityEnabled(value: boolean) {
  try {
    localStorage.setItem(SESSION_ACTIVITY_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(SESSION_ACTIVITY_ENABLED_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeSessionActivityEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_ACTIVITY_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(
      SESSION_ACTIVITY_ENABLED_CHANGE_EVENT,
      onStoreChange,
    );
}

const EXPAND_TOOL_ACTIVITY_KEY = "monocode.expandToolActivity";

export const EXPAND_TOOL_ACTIVITY_DEFAULT = false;

/** Fired on `window` when the tool-activity auto-expand setting flips. */
export const EXPAND_TOOL_ACTIVITY_CHANGE_EVENT =
  "monocode:expand-tool-activity-change";

export function loadExpandToolActivity(): boolean {
  try {
    const raw = localStorage.getItem(EXPAND_TOOL_ACTIVITY_KEY);
    if (raw == null) return EXPAND_TOOL_ACTIVITY_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return EXPAND_TOOL_ACTIVITY_DEFAULT;
  }
}

export function saveExpandToolActivity(value: boolean) {
  try {
    localStorage.setItem(EXPAND_TOOL_ACTIVITY_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(EXPAND_TOOL_ACTIVITY_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeExpandToolActivity(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EXPAND_TOOL_ACTIVITY_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(EXPAND_TOOL_ACTIVITY_CHANGE_EVENT, onStoreChange);
}

const LOCALHOST_IN_BROWSER_KEY = "monocode.localhostInBrowser";

export const LOCALHOST_IN_BROWSER_DEFAULT = true;

export function loadLocalhostInBrowser(): boolean {
  try {
    const raw = localStorage.getItem(LOCALHOST_IN_BROWSER_KEY);
    if (raw == null) return LOCALHOST_IN_BROWSER_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return LOCALHOST_IN_BROWSER_DEFAULT;
  }
}

export function saveLocalhostInBrowser(value: boolean) {
  try {
    localStorage.setItem(LOCALHOST_IN_BROWSER_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}

const BROWSER_AGENT_ENABLED_KEY = "monocode.browserAgentEnabled";

export const BROWSER_AGENT_ENABLED_DEFAULT = true;

export function loadBrowserAgentEnabled(): boolean {
  try {
    const raw = localStorage.getItem(BROWSER_AGENT_ENABLED_KEY);
    if (raw == null) return BROWSER_AGENT_ENABLED_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return BROWSER_AGENT_ENABLED_DEFAULT;
  }
}

export function saveBrowserAgentEnabled(value: boolean) {
  try {
    localStorage.setItem(BROWSER_AGENT_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}

const BROWSER_AGENT_ALLOWLIST_KEY = "monocode.browserAgentAllowlist";

export function loadBrowserAgentAllowlist(): string[] {
  try {
    const raw = localStorage.getItem(BROWSER_AGENT_ALLOWLIST_KEY);
    if (raw == null || raw.trim() === "") return [];
    return raw
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function loadBrowserAgentAllowlistText(): string {
  try {
    return localStorage.getItem(BROWSER_AGENT_ALLOWLIST_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveBrowserAgentAllowlistText(value: string) {
  try {
    localStorage.setItem(BROWSER_AGENT_ALLOWLIST_KEY, value);
  } catch {
    // private mode / quota
  }
}

const CLAUDE_HOOKS_KEY = "monocode.claudeHooks";

export const CLAUDE_HOOKS_DEFAULT = true;

export function loadClaudeHooks(): boolean {
  try {
    const raw = localStorage.getItem(CLAUDE_HOOKS_KEY);
    if (raw == null) return CLAUDE_HOOKS_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return CLAUDE_HOOKS_DEFAULT;
  }
}

export function saveClaudeHooks(value: boolean) {
  try {
    localStorage.setItem(CLAUDE_HOOKS_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}

const CTRL = IS_MAC ? "⌃" : "Ctrl+";

export type KeybindingRow = {
  command: string;
  keys: string;
  when: string;
};

/**
 * Mirrors the bindings we actually handle: the native menu accelerators in
 * `src-tauri/src/menu.rs`, `tabCommand`, and the window key handler in App.
 */
export const KEYBINDINGS: KeybindingRow[] = [
  { command: "App: Search", keys: `${MOD}K`, when: "Always" },
  { command: "App: Go to File", keys: `${MOD}P`, when: "Always" },
  { command: "App: Find in Files", keys: `${MOD}${SHIFT}F`, when: "Always" },
  { command: "App: Open Project", keys: `${MOD}O`, when: "Always" },
  { command: "App: New Window", keys: `${MOD}${SHIFT}N`, when: "Always" },
  { command: "App: Toggle Sidebar", keys: `${MOD}B`, when: "Always" },
  { command: "App: Switch Model", keys: `${MOD}.`, when: "Always" },
  { command: "View: Zoom In", keys: `${MOD}+`, when: "Always" },
  { command: "View: Zoom Out", keys: `${MOD}-`, when: "Always" },
  { command: "View: Reset Zoom", keys: `${MOD}0`, when: "Always" },
  { command: "Tab: New", keys: `${MOD}T`, when: "Always" },
  { command: "Tab: Close Others", keys: `${MOD}${ALT}T`, when: "Always" },
  { command: "Tab: Close All", keys: `${MOD}${SHIFT}W`, when: "Always" },
  { command: "Tab: Next", keys: `${MOD}${SHIFT}]`, when: "Always" },
  { command: "Tab: Previous", keys: `${MOD}${SHIFT}[`, when: "Always" },
  { command: "Tab: Cycle Next", keys: `${CTRL}Tab`, when: "Always" },
  {
    command: "Tab: Cycle Previous",
    keys: `${CTRL}${SHIFT}Tab`,
    when: "Always",
  },
  { command: "Tab: Back", keys: `${MOD}[`, when: "Always" },
  { command: "Tab: Forward", keys: `${MOD}]`, when: "Always" },
  { command: "Tab: Activate 1–8", keys: `${MOD}1 … ${MOD}8`, when: "Always" },
  { command: "Tab: Activate Last", keys: `${MOD}9`, when: "Always" },
  {
    command: "Session: Archive",
    keys: `${MOD}${SHIFT}A`,
    when: "sessionFocus && !overlay",
  },
  {
    command: "Session: Previous",
    keys: `${MOD}${SHIFT}↑`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Next",
    keys: `${MOD}${SHIFT}↓`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Previous",
    keys: `${MOD}${SHIFT}←`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Next",
    keys: `${MOD}${SHIFT}→`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  { command: "Pane: Close", keys: `${MOD}W`, when: "Always" },
  { command: "Pane: Split Right", keys: `${MOD}D`, when: "!editorFocus" },
  {
    command: "Pane: Split Down",
    keys: `${MOD}${SHIFT}D`,
    when: "!editorFocus",
  },
  { command: "Pane: Focus Left", keys: `${MOD}${ALT}←`, when: "Always" },
  { command: "Pane: Focus Right", keys: `${MOD}${ALT}→`, when: "Always" },
  { command: "Pane: Focus Up", keys: `${MOD}${ALT}↑`, when: "Always" },
  { command: "Pane: Focus Down", keys: `${MOD}${ALT}↓`, when: "Always" },
  { command: "Terminal: New", keys: `${MOD}\``, when: "Always" },
  { command: "Terminal: New Tab", keys: `${MOD}${SHIFT}\``, when: "Always" },
  { command: "Terminal: Toggle Dock", keys: `${MOD}J`, when: "Always" },
  { command: "Editor: Find", keys: `${MOD}F`, when: "editorFocus" },
  { command: "Editor: Replace", keys: `${MOD}${ALT}F`, when: "editorFocus" },
];

export function filterKeybindings(
  rows: KeybindingRow[],
  query: string,
): KeybindingRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.command.toLowerCase().includes(needle) ||
      t(row.command).toLowerCase().includes(needle) ||
      row.keys.toLowerCase().includes(needle) ||
      row.when.toLowerCase().includes(needle) ||
      t(row.when).toLowerCase().includes(needle),
  );
}

const VOICE_ENABLED_KEY = "monocode.voiceEnabled";
const VOICE_MODEL_KEY = "monocode.voiceModel";
const VOICE_LANGUAGE_KEY = "monocode.voiceLanguage";
const VOICE_PROMPT_KEY = "monocode.voicePrompt";

export type VoiceLanguage = "auto" | "pt" | "en" | "es";

/** Fired on `window` when the Voice input setting flips. */
export const VOICE_ENABLED_CHANGE_EVENT = "monocode:voice-enabled-change";

export const VOICE_ENABLED_DEFAULT = false;
export const VOICE_MODEL_DEFAULT: VoiceModel = "gpt-4o-transcribe";
export const VOICE_LANGUAGE_DEFAULT: VoiceLanguage = "auto";

function isVoiceModel(value: unknown): value is VoiceModel {
  return value === "gpt-4o-transcribe" || value === "gpt-4o-mini-transcribe";
}

function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return value === "auto" || value === "pt" || value === "en" || value === "es";
}

export function loadVoiceEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_ENABLED_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return VOICE_ENABLED_DEFAULT;
  }
}

export function saveVoiceEnabled(value: boolean) {
  try {
    localStorage.setItem(VOICE_ENABLED_KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(VOICE_ENABLED_CHANGE_EVENT, { detail: value }),
  );
}

export function loadVoiceModel(): VoiceModel {
  try {
    const raw = localStorage.getItem(VOICE_MODEL_KEY);
    return isVoiceModel(raw) ? raw : VOICE_MODEL_DEFAULT;
  } catch {
    return VOICE_MODEL_DEFAULT;
  }
}

export function saveVoiceModel(value: VoiceModel) {
  try {
    localStorage.setItem(VOICE_MODEL_KEY, value);
  } catch {
    // private mode / quota
  }
}

export function loadVoiceLanguage(): VoiceLanguage {
  try {
    const raw = localStorage.getItem(VOICE_LANGUAGE_KEY);
    return isVoiceLanguage(raw) ? raw : VOICE_LANGUAGE_DEFAULT;
  } catch {
    return VOICE_LANGUAGE_DEFAULT;
  }
}

export function saveVoiceLanguage(value: VoiceLanguage) {
  try {
    localStorage.setItem(VOICE_LANGUAGE_KEY, value);
  } catch {
    // private mode / quota
  }
}

export function loadVoicePrompt(): string {
  try {
    return localStorage.getItem(VOICE_PROMPT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveVoicePrompt(value: string) {
  try {
    localStorage.setItem(VOICE_PROMPT_KEY, value);
  } catch {
    // private mode / quota
  }
}
