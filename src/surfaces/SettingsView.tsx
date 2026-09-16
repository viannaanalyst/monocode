import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowDownCircle,
  Check,
  ChevronDown,
  GripVertical,
  ImagePlus,
  Loader,
  RefreshCw,
  RotateCcw,
  Search,
} from "../chrome/icons";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { ModelBrandIcon } from "../chrome/ModelBrandIcon";
import {
  ColorPickerPopover,
  ColorSwatchRow,
} from "../chrome/ColorPickerPopover";
import { Popover } from "../chrome/Popover";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CustomModelsSection } from "../chrome/CustomModelsSection";
import { InboxProviderMark } from "../chrome/InboxProviderMark";
import { RemoveProjectDialog } from "../chrome/RemoveProjectDialog";
import { terminalTheme } from "./TerminalView";
import { WindowControls } from "../chrome/WindowControls";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useColorScheme } from "../hooks/useColorScheme";
import { useAnimatedReorder } from "../hooks/useAnimatedReorder";
import {
  applyChatBackground,
  applyChatBackgroundEmptyOpacity,
  applyChatBackgroundSessionOpacity,
  applyChatBackgroundScope,
  applyAccentColor,
  applyBodyGlass,
  applySidebarBlur,
  applySidebarOpacity,
  applyThemeDarkLightness,
  applyThemePreference,
  applyThemeTint,
  BODY_GLASS_DEFAULT,
  ACCENT_COLOR_DEFAULT,
  CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT,
  CHAT_BACKGROUND_OPACITY_MAX,
  CHAT_BACKGROUND_OPACITY_MIN,
  CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT,
  CHAT_BACKGROUND_SCOPE_DEFAULT,
  THEME_PREFERENCE_DEFAULT,
  chatBackgroundSrc,
  isLightScheme,
  loadBodyGlass,
  loadAccentColor,
  loadChatBackgroundEmptyOpacity,
  loadChatBackgroundPath,
  loadChatBackgroundSessionOpacity,
  loadChatBackgroundScope,
  loadThemeDarkLightness,
  loadThemePreference,
  loadSidebarBlur,
  loadSidebarOpacity,
  loadThemeHue,
  loadThemeSaturation,
  loadTranscriptLayout,
  loadTranscriptAnchor,
  saveBodyGlass,
  saveAccentColor,
  saveChatBackgroundEmptyOpacity,
  saveChatBackgroundPath,
  saveChatBackgroundSessionOpacity,
  saveChatBackgroundScope,
  saveThemeDarkLightness,
  saveThemePreference,
  saveSidebarBlur,
  saveSidebarOpacity,
  saveThemeHue,
  saveThemeSaturation,
  saveTranscriptLayout,
  saveTranscriptAnchor,
  loadShowExcludedFiles,
  saveShowExcludedFiles,
  SHOW_EXCLUDED_FILES_DEFAULT,
  SCHEME_CHANGE_EVENT,
  TRANSCRIPT_ANCHOR_CHANGE_EVENT,
  SIDEBAR_BLUR_DEFAULT,
  SIDEBAR_BLUR_MAX,
  SIDEBAR_BLUR_MIN,
  SIDEBAR_OPACITY_DEFAULT,
  SIDEBAR_OPACITY_MAX,
  SIDEBAR_OPACITY_MIN,
  THEME_DARK_LIGHTNESS_DEFAULT,
  THEME_DARK_LIGHTNESS_MAX,
  THEME_DARK_LIGHTNESS_MIN,
  THEME_HUE_DEFAULT,
  THEME_HUE_MAX,
  THEME_HUE_MIN,
  THEME_SATURATION_DEFAULT,
  THEME_SATURATION_MAX,
  THEME_SATURATION_MIN,
  type ThemePreference,
  type ChatBackgroundScope,
  type TranscriptLayout,
} from "../lib/appearance";
import {
  pickAndSaveChatBackground,
  removeChatBackground,
} from "../lib/chatBackground";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  subscribeUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "../lib/uiScale";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  FONTS_CHANGE_EVENT,
  codeFontStack,
  listSystemFonts,
  loadCodeFontFamily,
  loadCodeFontSize,
  loadCodeFontWeight,
  loadUiFontFamily,
  loadUiFontWeight,
  resetFontsToDefaults,
  saveCodeFontFamily,
  saveCodeFontSize,
  saveCodeFontWeight,
  saveUiFontFamily,
  saveUiFontWeight,
  type SystemFont,
} from "../lib/fonts";
import {
  getHarnessAvailabilitySnapshot,
  hasProbedHarnessAvailability,
  harnessUnavailableHint,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
} from "../lib/harness/availability";
import { refreshHarnessCatalogs } from "../lib/harness/registry";
import { installCodexBinary } from "../lib/harness/child";
import {
  defaultSessionChoice,
  defaultModelId,
  getModelSnapshot,
  hasLiveCatalog,
  isPickerProviderVisible,
  loadDefaultModels,
  loadLastModelChoice,
  modelsFor,
  resolveModel,
  saveDefaultModel,
  saveLastModelChoice,
  savePickerProviderVisible,
  subscribeModels,
  type AgentModel,
} from "../lib/models";
import {
  isModelEnabled,
  modelVisibilityVersion,
  setHarnessModelsEnabled,
  setModelEnabled,
  subscribeModelVisibility,
} from "../lib/modelVisibility";
import { supportsCustomModels } from "../lib/customModels";
import {
  getProviderOrderSnapshot,
  mergeProviderOrder,
  orderedHarnesses,
  saveProviderOrder,
  subscribeProviderOrder,
} from "../lib/providerOrder";
import {
  loadProjectInstructions,
  saveProjectInstructions,
  type ProjectInstructions,
} from "../lib/projectInstructions";
import { prettyCwd, projectKey, projectName } from "../lib/paths";
import { IS_MAC, IS_WIN } from "../lib/platform";
import {
  loadArchivedProjects,
  looksLikeProject,
  subscribeArchivedProjects,
  type ArchivedProject,
} from "../lib/recents";
import {
  HARNESS_TITLE,
  sessionDisplayTitle,
  type HarnessId,
} from "../lib/session";
import {
  loadSessionSidebarFilters,
  saveSessionSidebarFilters,
} from "../lib/sessionFilters";
import type { SessionSummary } from "../lib/sessionStore";
import {
  clearInboxCache,
  githubStatus,
  type GithubStatus,
  type InboxProvider,
} from "../lib/githubTasks";
import {
  disconnectGitlab,
  gitlabConnected,
  saveGitlabConfig,
} from "../lib/gitlab";
import {
  disconnectLinear,
  LINEAR_CHANGE_EVENT,
  linearConnected,
  listLinearTeams,
  loadHiddenLinearTeamIds,
  notifyLinearChange,
  saveHiddenLinearTeamIds,
  saveLinearToken,
  type LinearTeam,
} from "../lib/linear";
import {
  disconnectJira,
  jiraConnected,
  notifyJiraChange,
  saveJiraConfig,
} from "../lib/jira";
import {
  clickUpConnected,
  disconnectClickUp,
  notifyClickUpChange,
  saveClickUpToken,
} from "../lib/clickup";
import {
  disconnectNotion,
  notionConnected,
  notifyNotionChange,
  saveNotionConfig,
} from "../lib/notion";
import { loadTabGroupLabels, resolveTabGroupLabel } from "../lib/tabGroups";
import {
  filterKeybindings,
  KEYBINDINGS,
  loadClaudeHooks,
  loadComposerRunner,
  loadDiffViewer,
  loadFollowUpBehavior,
  loadGridArcadeEnabled,
  loadLiveAgentsEnabled,
  loadNotesEnabled,
  loadSessionActivityEnabled,
  loadExpandToolActivity,
  loadLocalhostInBrowser,
  loadBrowserAgentEnabled,
  loadBrowserAgentAllowlistText,
  loadVoiceEnabled,
  loadVoiceLanguage,
  loadVoiceModel,
  loadVoicePrompt,
  saveClaudeHooks,
  saveLocalhostInBrowser,
  saveBrowserAgentEnabled,
  saveBrowserAgentAllowlistText,
  saveComposerRunner,
  saveDiffViewer,
  saveFollowUpBehavior,
  saveGridArcadeEnabled,
  saveLiveAgentsEnabled,
  saveNotesEnabled,
  saveSessionActivityEnabled,
  saveExpandToolActivity,
  saveVoiceEnabled,
  saveVoiceLanguage,
  saveVoiceModel,
  saveVoicePrompt,
  settingsSectionDescription,
  settingsSectionLabel,
  type DiffViewer,
  type FollowUpBehavior,
  type SettingsSectionId,
} from "../lib/settings";
import {
  voiceClearApiKey,
  voiceHasApiKey,
  voiceSetApiKey,
} from "../lib/transcribe";
import {
  loadNotificationSound,
  loadSoundsEnabled,
  playCue,
  previewSound,
  saveNotificationSound,
  saveSoundsEnabled,
  SOUND_PALETTE,
  type SoundName,
} from "../lib/sounds";
import {
  cachedNotificationPermission,
  loadNotificationsEnabled,
  openNotificationSettings,
  probeNotificationPermission,
  requestNotificationPermission,
  saveNotificationsEnabled,
  type NotificationPermission,
} from "../lib/notifications";
import {
  LOCALES,
  getLocale,
  saveLocale,
  t,
  type Locale,
} from "../i18n";
import {

  installPendingUpdate,
  readAppVersion,
  runUpdateFlow,
  type UpdaterSnapshot,
} from "../lib/updater";

import { SkillsPage } from "./SkillsPage";

export type SettingsAnchor =
  | "github"
  | "gitlab"
  | "linear"
  | "jira"
  | "clickup"
  | "notion"
  | "project-notifications";

const ANCHOR_IDS: Record<SettingsAnchor, string> = {
  github: "settings-github",
  gitlab: "settings-gitlab",
  linear: "settings-linear",
  jira: "settings-jira",
  clickup: "settings-clickup",
  notion: "settings-notion",
  "project-notifications": "settings-project-notifications",
};

type Props = {
  section: SettingsSectionId;
  /** Card to scroll to; the General page is too long to land at the top. */
  anchor?: SettingsAnchor | null;
  cwd: string;
  sessions: SessionSummary[];
  besideRail?: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreProject?: (path: string) => void;
  onDeleteProject?: (path: string) => void;
  onOpenWhatsNew: (version: string) => void;
};

export function SettingsView({
  section,
  anchor = null,
  cwd,
  sessions,
  besideRail = false,
  onClose,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreProject,
  onDeleteProject,
  onOpenWhatsNew,
}: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  useEffect(() => {
    if (!anchor) return;
    document.getElementById(ANCHOR_IDS[anchor])?.scrollIntoView({
      block: "start",
    });
  }, [anchor]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const appearance = useAppearanceSettings();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-custom-model-editor]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    // Let dialogs and other Settings controls handle Escape first.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="region"
      aria-label={t("Settings")}
      data-app-settings
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-content/10"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm">
          <span className="shrink-0 text-content/45">{t("Settings")}</span>
          <span aria-hidden className="shrink-0 text-content/25">
            /
          </span>
          <span className="min-w-0 truncate text-content">
            {settingsSectionLabel(section)}
          </span>
        </div>
        {section === "appearance" ? (
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={appearance.restoreDefaults}
            className="mr-2 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-content/50 hover:bg-content/10 hover:text-content"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            {t("Restore defaults")}
          </button>
        ) : null}
        {IS_MAC ? null : <WindowControls />}
      </div>

      {section === "skills" ? (
        <SkillsPage
          key={cwd}
          cwd={cwd}
          header={
            <PageHeader
              title={settingsSectionLabel(section)}
              description={settingsSectionDescription(section)}
            />
          }
        />
      ) : (
        <div
          ref={lockOverscroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-none"
        >
          <div className="mx-auto w-full max-w-[680px] px-8 py-10">
            <PageHeader
              title={settingsSectionLabel(section)}
              description={
                section === "voice" ? "" : settingsSectionDescription(section)
              }
            />
            {section === "general" ? (
              <GeneralPage onOpenWhatsNew={onOpenWhatsNew} />
            ) : null}
            {section === "appearance" ? (
              <AppearancePage appearance={appearance} />
            ) : null}
            {section === "keybindings" ? <KeybindingsPage /> : null}
            {section === "providers" ? <ProvidersPage /> : null}
            {section === "project" ? <ProjectPage key={cwd} cwd={cwd} /> : null}
            {section === "voice" ? <VoicePage /> : null}
            {section === "inbox" ? <InboxPage /> : null}
            {section === "archive" ? (
              <ArchivePage
                cwd={cwd}
                sessions={sessions}
                onOpenSession={onOpenSession}
                onArchiveSession={onArchiveSession}
                onDeleteSession={onDeleteSession}
                onRestoreProject={onRestoreProject}
                onDeleteProject={onDeleteProject}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function GeneralPage({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [transcriptLayout, setTranscriptLayout] =
    useState<TranscriptLayout>(loadTranscriptLayout);
  const [transcriptAnchor, setTranscriptAnchor] =
    useState(loadTranscriptAnchor);
  const [diffViewer, setDiffViewer] = useState<DiffViewer>(loadDiffViewer);
  const [followUpBehavior, setFollowUpBehavior] =
    useState<FollowUpBehavior>(loadFollowUpBehavior);
  const [composerRunner, setComposerRunner] = useState(loadComposerRunner);
  const [gridArcadeEnabled, setGridArcadeEnabled] = useState(
    loadGridArcadeEnabled,
  );
  const [notesEnabled, setNotesEnabled] = useState(loadNotesEnabled);
  const [sessionActivity, setSessionActivity] = useState(
    loadSessionActivityEnabled,
  );
  const [expandToolActivity, setExpandToolActivity] = useState(
    loadExpandToolActivity,
  );
  const [liveAgentsEnabled, setLiveAgentsEnabled] = useState(
    loadLiveAgentsEnabled,
  );
  const [soundsEnabled, setSoundsEnabled] = useState(loadSoundsEnabled);
  const [notificationSound, setNotificationSound] = useState<SoundName>(
    loadNotificationSound,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    loadNotificationsEnabled,
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(cachedNotificationPermission);
  const [claudeHooks, setClaudeHooks] = useState(loadClaudeHooks);
  const [localhostInBrowser, setLocalhostInBrowser] = useState(
    loadLocalhostInBrowser,
  );
  const [browserAgentEnabled, setBrowserAgentEnabled] = useState(
    loadBrowserAgentEnabled,
  );
  const [browserAllowlist, setBrowserAllowlist] = useState(
    loadBrowserAgentAllowlistText,
  );

  // The user may flip the switch in System Settings and come back: re-read
  // the OS state whenever the window regains focus while the toggle is on.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const refresh = () => {
      void probeNotificationPermission().then(setNotificationPermission);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [notificationsEnabled]);

  useEffect(() => {
    const onAnchor = (event: Event) => {
      setTranscriptAnchor((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    return () => {
      window.removeEventListener(TRANSCRIPT_ANCHOR_CHANGE_EVENT, onAnchor);
    };
  }, []);

  const onTranscriptLayout = (next: TranscriptLayout) => {
    saveTranscriptLayout(next);
    setTranscriptLayout(next);
  };

  const onTranscriptAnchor = (next: boolean) => {
    saveTranscriptAnchor(next);
    setTranscriptAnchor(next);
  };

  const onDiffViewer = (next: DiffViewer) => {
    saveDiffViewer(next);
    setDiffViewer(next);
  };
  const onSessionActivity = (next: boolean) => {
    saveSessionActivityEnabled(next);
    setSessionActivity(next);
  };
  const onExpandToolActivity = (next: boolean) => {
    saveExpandToolActivity(next);
    setExpandToolActivity(next);
  };

  const onFollowUpBehavior = (next: FollowUpBehavior) => {
    saveFollowUpBehavior(next);
    setFollowUpBehavior(next);
  };

  const onComposerRunner = (next: boolean) => {
    saveComposerRunner(next);
    setComposerRunner(next);
  };

  const onGridArcadeEnabled = (next: boolean) => {
    saveGridArcadeEnabled(next);
    setGridArcadeEnabled(next);
  };

  const onNotesEnabled = (next: boolean) => {
    saveNotesEnabled(next);
    setNotesEnabled(next);
  };

  const onLiveAgentsEnabled = (next: boolean) => {
    saveLiveAgentsEnabled(next);
    setLiveAgentsEnabled(next);
  };

  const onSoundsEnabled = (next: boolean) => {
    saveSoundsEnabled(next);
    setSoundsEnabled(next);
  };

  const onNotificationSound = (next: SoundName) => {
    saveNotificationSound(next);
    setNotificationSound(next);
    previewSound(next);
  };

  const onNotificationsEnabled = (next: boolean) => {
    saveNotificationsEnabled(next);
    setNotificationsEnabled(next);
    if (!next) return;
    void requestNotificationPermission().then(setNotificationPermission);
  };

  const onClaudeHooks = (next: boolean) => {
    saveClaudeHooks(next);
    setClaudeHooks(next);
  };

  const locale = getLocale();

  return (
    <>
      <Row
        label={t("Language")}
        description={t(
          "The language of the interface. New strings from upstream stay in English until they are translated.",
        )}
      >
        <Segmented
          label={t("Language")}
          value={locale}
          options={LOCALES.map((item) => ({
            value: item.id,
            label: item.nativeLabel,
          }))}
          onChange={(next: Locale) => saveLocale(next)}
        />
      </Row>
      <Row
        label={t("Transcript layout")}
        description={t("Full width keeps user prompts as a spanning card. Chat aligns them to the right with a max width, like a messaging app.")}
      >
        <Segmented
          label={t("Transcript layout")}
          value={transcriptLayout}
          options={[
            { value: "full", label: t("Full width") },
            { value: "chat", label: t("Chat") },
          ]}
          onChange={onTranscriptLayout}
        />
      </Row>
      <Row
        label={t("Diff view")}
        description={t("Editor keeps working-tree changes in the file. Unified stacks every changed file in one review, with sticky headers and collapsed unchanged lines.")}
      >
        <Segmented
          label={t("Diff view")}
          value={diffViewer}
          options={[
            { value: "editor", label: t("Editor") },
            { value: "unified", label: t("Unified") },
          ]}
          onChange={onDiffViewer}
        />
      </Row>
      <Row
        label={t("Session activity card")}
        description={t(
          "Shows a card at the end of a turn summarizing the commands the agent ran, with tests and commits called out.",
        )}
      >
        <Toggle
          label={t("Session activity card")}
          on={sessionActivity}
          onChange={onSessionActivity}
        />
      </Row>
      <Row
        label={t("Expand tool activity automatically")}
        description={t(
          "Opens the tool group (edits, reads, commands) while the agent works. Turn it off to keep each group collapsed until you click it.",
        )}
      >
        <Toggle
          label={t("Expand tool activity automatically")}
          on={expandToolActivity}
          onChange={onExpandToolActivity}
        />
      </Row>
      <Row
        label={t("Follow-up behavior")}
        description={t("Queue follow-ups until the active turn finishes, or steer the active turn immediately.")}
      >
        <Segmented
          label={t("Follow-up behavior")}
          value={followUpBehavior}
          options={[
            { value: "queue", label: t("Queue") },
            { value: "steer", label: t("Steer") },
          ]}
          onChange={onFollowUpBehavior}
        />
      </Row>
      <Row
        label={t("Anchor prompts to top")}
        description={t("When you send, the new prompt sits at the top of the transcript and the reply grows into the space below. Turn this off to keep the classic layout, with the latest message resting on the composer.")}
      >
        <Toggle
          label={t("Anchor prompts to top")}
          on={transcriptAnchor}
          onChange={onTranscriptAnchor}
        />
      </Row>
      <Row
        label={t("Composer mascot")}
        description={t("When a turn is running, the project mascot runs along the composer, bonks the scroll-to-latest button the first time, then jumps it, and sometimes grabs a coin.")}
      >
        <Toggle
          label={t("Composer mascot")}
          on={composerRunner}
          onChange={onComposerRunner}
        />
      </Row>
      <Row
        label={t("Empty session games")}
        description={t("Pac-man and snake idle on the empty-session grid. Hover the band to take control of whichever is on screen. Turn this off to keep the pane still.")}
      >
        <Toggle
          label={t("Empty session games")}
          on={gridArcadeEnabled}
          onChange={onGridArcadeEnabled}
        />
      </Row>
      <Row
        label={t("Notes")}
        description={t("A global markdown notebook on the project rail. Save a finished turn from the transcript, then mention it later with @note or add it to chat. Turn this off to hide Notes from the UI.")}
      >
        <Toggle label={t("Notes")} on={notesEnabled} onChange={onNotesEnabled} />
      </Row>
      <Row
        label={t("Working agents")}
        description={t("When two or more chats are in flight, a card on the project rail lists them so you can jump across projects. Finished turns stay until you open that session. Turn this off to hide the card.")}
      >
        <Toggle
          label={t("Working agents")}
          on={liveAgentsEnabled}
          onChange={onLiveAgentsEnabled}
        />
      </Row>
      <Row
        label={t("Sounds")}
        description={t("Short cues when a turn finishes, a new inbox item appears on the project rail, or an update is available. Switches and Copy on a finished turn also play.")}
      >
        <Toggle label={t("Sounds")} on={soundsEnabled} onChange={onSoundsEnabled} />
      </Row>
      <Row
        label={t("Notification sound")}
        description={t("Played when a turn finishes and when an approval is pending. Choosing one plays a preview.")}
      >
        <Select
          label={t("Notification sound")}
          value={notificationSound}
          onChange={(value) => onNotificationSound(value as SoundName)}
          options={SOUND_PALETTE.map((name) => ({
            value: name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
          }))}
        />
      </Row>
      <Row
        label={t("Notifications")}
        description={t("Notify when a reminder is due, or when an agent finishes or needs input in another session or while MonoCode is in the background. Click the notification to open that session.")}
      >
        {notificationsEnabled && notificationPermission === "denied" ? (
          <NotificationsBlocked />
        ) : null}
        {notificationsEnabled && notificationPermission === "unsupported" ? (
          <span className="text-[12px] text-content/45">
            {t("Not available on this platform")}
          </span>
        ) : null}
        <Toggle
          label={t("Notifications")}
          on={notificationsEnabled}
          onChange={onNotificationsEnabled}
        />
      </Row>
      <Row
        label={t("Claude Code hooks")}
        description={t(
          "Run the hooks configured in your settings.json files — PreToolUse command rewrites, blocks, notifications, and the rest — just as the Claude Code CLI would. Turn this off if a hook is misbehaving and you need the session back. Takes effect on the next turn.",
        )}
      >
        <Toggle
          label={t("Claude Code hooks")}
          on={claudeHooks}
          onChange={onClaudeHooks}
        />
      </Row>

      <Heading title={t("Browser")} />
      <Row
        label={t("Open localhost in Browser")}
        description={t(
          "Links to localhost in the transcript open the in-app browser pane instead of the system browser.",
        )}
      >
        <Toggle
          label={t("Open localhost in Browser")}
          on={localhostInBrowser}
          onChange={(next) => {
            saveLocalhostInBrowser(next);
            setLocalhostInBrowser(next);
          }}
        />
      </Row>
      <Row
        label={t("Agent browser tools")}
        description={t(
          "Let agents control the in-app browser with MCP tools (browser_navigate, click, type) or /in-app-browser. Hosts not on the allowlist need your approval. Leave the list empty to allow localhost only, or add * to allow every host.",
        )}
      >
        <Toggle
          label={t("Agent browser tools")}
          on={browserAgentEnabled}
          onChange={(next) => {
            saveBrowserAgentEnabled(next);
            setBrowserAgentEnabled(next);
          }}
        />
      </Row>
      <Row label={t("Browser allowlist")}>
        <textarea
          value={browserAllowlist}
          onChange={(event) => {
            const next = event.target.value;
            setBrowserAllowlist(next);
            saveBrowserAgentAllowlistText(next);
          }}
          spellCheck={false}
          placeholder="localhost"
          className="h-16 w-56 resize-y rounded-md border border-content/10 bg-content/5 px-2 py-1.5 font-mono text-sm text-content outline-none"
        />
      </Row>

      <Heading title={t("About")} />
      <UpdateRow onOpenWhatsNew={onOpenWhatsNew} />
    </>
  );
}

function InboxPage() {
  return (
    <div className="flex flex-col gap-4">
      <GithubSettings />
      <GitlabSettings />
      <LinearSettings />
      <JiraSettings />
      <ClickUpSettings />
      <NotionSettings />
    </div>
  );
}

function InboxCard({
  provider,
  title,
  description,
  status,
  anchor,
  children,
}: {
  provider: InboxProvider;
  title: string;
  description: string;
  status?: string;
  anchor?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={anchor}
      className="scroll-mt-8 rounded-xl border border-content/10 px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <InboxProviderMark
          provider={provider}
          className="mt-0.5 size-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-content">{title}</h2>
            {status ? (
              <span className="shrink-0 text-[12px] text-content/50">
                {status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-pretty text-[12px] leading-relaxed text-content/45">
            {description}
          </p>
        </div>
      </div>
      {children ? (
        <div className="mt-3 flex min-w-0 flex-col gap-2">{children}</div>
      ) : null}
    </section>
  );
}

function InboxTextField({
  value,
  onChange,
  onSubmit,
  type = "text",
  placeholder,
  label,
  autoComplete = "off",
  mono = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  type?: "text" | "password" | "email" | "url";
  placeholder?: string;
  label: string;
  autoComplete?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex h-8 min-w-0 w-full items-center rounded-md border border-content/10 px-2.5 focus-within:border-content/20">
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit?.();
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete={autoComplete}
        spellCheck={false}
        className={`min-w-0 w-full bg-transparent text-sm text-content outline-none placeholder:text-content/35 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function GithubSettings() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const checkStatus = useCallback(async () => {
    const generation = ++request.current;
    setChecking(true);
    setError(null);
    try {
      const next = await githubStatus();
      if (generation === request.current) setStatus(next);
    } catch (err: unknown) {
      if (generation === request.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (generation === request.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    return () => {
      request.current += 1;
    };
  }, [checkStatus]);

  const description = status?.connected
    ? t(
        "GitHub CLI is installed and authenticated. MonoCode uses it for GitHub inbox items.",
      )
    : status?.installed
      ? t(
          "Run gh auth login in a terminal, complete the sign-in flow, then check again.",
        )
      : t(
          "Install GitHub CLI from cli.github.com, run gh auth login in a terminal, then check again.",
        );
  const label = checking
    ? t("Checking")
    : status?.connected
      ? t("Connected")
      : status?.installed
        ? t("Sign in required")
        : t("Not installed");

  return (
    <InboxCard
      provider="github"
      title="GitHub"
      description={description}
      status={label}
      anchor={ANCHOR_IDS.github}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {!checking && !status?.installed ? (
          <SecondaryButton
            onClick={() => {
              void openUrl("https://cli.github.com/").catch(() => {});
            }}
          >
            {t("Installation guide")}
          </SecondaryButton>
        ) : null}
        <SecondaryButton onClick={() => void checkStatus()} disabled={checking}>
          {checking ? t("Checking") : t("Check again")}
        </SecondaryButton>
      </div>
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
    </InboxCard>
  );
}

function GitlabSettings() {
  const [url, setUrl] = useState("https://gitlab.com");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void gitlabConnected()
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        setUrl(status.url);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await saveGitlabConfig(url, token);
      setUrl(status.url);
      setToken("");
      setConnected(status.connected);
      clearInboxCache();
    } catch (err: unknown) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await disconnectGitlab(url);
      setConnected(false);
      setUrl(status.url);
      clearInboxCache();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InboxCard
      provider="gitlab"
      title="GitLab"
      description={t(
        "Connect GitLab.com or a self-managed GitLab instance. Use a personal access token with API access; the token is stored locally and Disconnect deletes it.",
      )}
      status={connected ? t("Connected") : t("Not connected")}
      anchor={ANCHOR_IDS.gitlab}
    >
      {connected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-content/50">
            {url}
          </span>
          <SecondaryButton
            onClick={() => void onDisconnect()}
            disabled={busy}
          >
            {t("Disconnect")}
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <InboxTextField
            type="url"
            value={url}
            onChange={setUrl}
            placeholder="https://gitlab.com"
            label={t("GitLab URL")}
            autoComplete="url"
          />
          <InboxTextField
            type="password"
            value={token}
            onChange={setToken}
            onSubmit={() => void onSave()}
            placeholder="glpat-…"
            label={t("GitLab access token")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => void onSave()}
              disabled={busy || !token.trim()}
            >
              {busy ? t("Saving") : t("Connect")}
            </SecondaryButton>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
    </InboxCard>
  );
}

function ClickUpSettings() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void clickUpConnected()
      .then((status) => {
        if (!cancelled) setConnected(status.connected);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await saveClickUpToken(token);
      setConnected(status.connected);
      setToken("");
      clearInboxCache();
      notifyClickUpChange();
    } catch (err: unknown) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectClickUp();
      setConnected(false);
      clearInboxCache();
      notifyClickUpChange();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InboxCard
      provider="clickup"
      title="ClickUp"
      description={t(
        "Connect ClickUp with a personal API token from Settings → Apps. Assigned tasks appear in the Inbox; Disconnect deletes the token.",
      )}
      status={connected ? t("Connected") : t("Not connected")}
      anchor={ANCHOR_IDS.clickup}
    >
      {connected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => void onDisconnect()} disabled={busy}>
            {t("Disconnect")}
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <InboxTextField
            type="password"
            value={token}
            onChange={setToken}
            onSubmit={() => void onSave()}
            placeholder="pk_…"
            label={t("ClickUp API token")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => void onSave()}
              disabled={busy || !token.trim()}
            >
              {busy ? t("Saving") : t("Connect")}
            </SecondaryButton>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
    </InboxCard>
  );
}

function NotionSettings() {
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void notionConnected()
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        if (status.databaseId) setDatabaseId(status.databaseId);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!token.trim() || !databaseId.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await saveNotionConfig(token, databaseId);
      setConnected(status.connected);
      if (status.databaseId) setDatabaseId(status.databaseId);
      setToken("");
      clearInboxCache();
      notifyNotionChange();
    } catch (err: unknown) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectNotion();
      setConnected(false);
      clearInboxCache();
      notifyNotionChange();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InboxCard
      provider="notion"
      title="Notion"
      description={t(
        "Create a Notion integration, share a Tasks database with it, and paste the integration token + database id. Each row becomes an Inbox item.",
      )}
      status={connected ? t("Connected") : t("Not connected")}
      anchor={ANCHOR_IDS.notion}
    >
      {connected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-content/50">
            {databaseId}
          </span>
          <SecondaryButton
            onClick={() => void onDisconnect()}
            disabled={busy}
          >
            {t("Disconnect")}
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <InboxTextField
            type="password"
            value={token}
            onChange={setToken}
            placeholder="secret_…"
            label={t("Notion integration token")}
          />
          <InboxTextField
            value={databaseId}
            onChange={setDatabaseId}
            onSubmit={() => void onSave()}
            placeholder={t("Database id or URL")}
            label={t("Notion database")}
            mono
          />
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => void onSave()}
              disabled={busy || !token.trim() || !databaseId.trim()}
            >
              {busy ? t("Saving") : t("Connect")}
            </SecondaryButton>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
    </InboxCard>
  );
}

function JiraSettings() {
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void jiraConnected()
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        if (status.site) setSite(status.site);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!token.trim() || !site.trim() || !email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await saveJiraConfig(site, email, token);
      setConnected(status.connected);
      if (status.site) setSite(status.site);
      setToken("");
      clearInboxCache();
      notifyJiraChange();
    } catch (err: unknown) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectJira();
      setConnected(false);
      clearInboxCache();
      notifyJiraChange();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InboxCard
      provider="jira"
      title="Jira"
      description={t(
        "Connect Jira Cloud with your site, e-mail, and an API token from id.atlassian.com. The token is stored locally and Disconnect deletes it.",
      )}
      status={connected ? t("Connected") : t("Not connected")}
      anchor={ANCHOR_IDS.jira}
    >
      {connected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-content/50">
            {site}
          </span>
          <SecondaryButton
            onClick={() => void onDisconnect()}
            disabled={busy}
          >
            {t("Disconnect")}
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <InboxTextField
            value={site}
            onChange={setSite}
            placeholder="team.atlassian.net"
            label={t("Jira site")}
          />
          <InboxTextField
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            label={t("Jira e-mail")}
            autoComplete="email"
          />
          <InboxTextField
            type="password"
            value={token}
            onChange={setToken}
            onSubmit={() => void onSave()}
            placeholder={t("API token")}
            label={t("Jira API token")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => void onSave()}
              disabled={
                busy || !token.trim() || !site.trim() || !email.trim()
              }
            >
              {busy ? t("Saving") : t("Connect")}
            </SecondaryButton>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
    </InboxCard>
  );
}

function LinearSettings() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [hiddenTeamIds, setHiddenTeamIds] = useState(loadHiddenLinearTeamIds);

  const loadTeams = useCallback(async () => {
    try {
      const next = await listLinearTeams();
      setTeams(next);
    } catch {
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void linearConnected().then((status) => {
      if (cancelled) return;
      setConnected(status.connected);
      if (status.connected) void loadTeams();
    });
    return () => {
      cancelled = true;
    };
  }, [loadTeams]);

  // The inbox filter menu writes the same list, so follow it while both are mounted.
  useEffect(() => {
    const onChange = () => setHiddenTeamIds(loadHiddenLinearTeamIds());
    window.addEventListener(LINEAR_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LINEAR_CHANGE_EVENT, onChange);
  }, []);

  const onSave = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveLinearToken(token);
      setToken("");
      setConnected(true);
      clearInboxCache();
      notifyLinearChange();
      await loadTeams();
    } catch (err: unknown) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectLinear();
      setConnected(false);
      setTeams([]);
      clearInboxCache();
      notifyLinearChange();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleTeam = (id: string) => {
    const next = new Set(hiddenTeamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = [...next];
    setHiddenTeamIds(ids);
    saveHiddenLinearTeamIds(ids);
    clearInboxCache();
  };

  return (
    <InboxCard
      provider="linear"
      title="Linear"
      description={t(
        "Create a personal API key in Linear → Settings → Security & Access. Disconnect deletes it.",
      )}
      status={connected ? t("Connected") : t("Not connected")}
      anchor={ANCHOR_IDS.linear}
    >
      {connected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => void onDisconnect()} disabled={busy}>
            {t("Disconnect")}
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <InboxTextField
            type="password"
            value={token}
            onChange={setToken}
            onSubmit={() => void onSave()}
            placeholder="lin_api_…"
            label={t("Linear API key")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButton
              onClick={() => void onSave()}
              disabled={busy || !token.trim()}
            >
              {busy ? t("Saving") : t("Connect")}
            </SecondaryButton>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-[12px] text-red-400/90">{error}</p>
      ) : null}
      {connected && teams.length > 0 ? (
        <div className="border-t border-content/10 pt-3">
          <div className="text-sm font-semibold text-content">
            {t("Linear Teams")}
          </div>
          <p className="mt-1 text-pretty text-[12px] leading-relaxed text-content/45">
            {t("Unchecked teams stay out of the inbox.")}
          </p>
          <div className="mt-2 flex flex-col gap-0.5">
            {teams.map((team) => {
              const checked = !hiddenTeamIds.includes(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => toggleTeam(team.id)}
                  className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-sm text-content hover:bg-content/5"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {team.name}
                    {team.key ? (
                      <span className="ml-1.5 text-content/40">{team.key}</span>
                    ) : null}
                  </span>
                  {checked ? (
                    <Check className="size-3.5 shrink-0" strokeWidth={2.25} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </InboxCard>
  );
}

function UpdateRow({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot>({
    phase: "idle",
    currentVersion: "…",
  });

  useEffect(() => {
    let cancelled = false;
    void readAppVersion().then((currentVersion) => {
      if (cancelled) return;
      setSnapshot((current) => ({ ...current, currentVersion }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy =
    snapshot.phase === "checking" || snapshot.phase === "downloading";
  const hasUpdate = snapshot.phase === "available";

  const onClick = async () => {
    if (busy) return;
    if (hasUpdate) {
      await installPendingUpdate(setSnapshot);
      return;
    }
    await runUpdateFlow(true, setSnapshot);
  };

  const status =
    snapshot.phase === "available"
      ? t("Version {version} is available.", {
          version: snapshot.availableVersion ?? "",
        })
      : snapshot.phase === "downloading"
        ? snapshot.progress != null
          ? t("Downloading {percent}%", { percent: snapshot.progress })
          : t("Downloading…")
        : snapshot.phase === "checking"
          ? t("Checking for updates…")
          : snapshot.phase === "current"
            ? t("You're on the latest version.")
            : snapshot.phase === "error"
              ? (snapshot.error ?? t("Update check failed."))
              : t("MonoCode updates itself from the release feed.");

  return (
    <Row
      label={
        <span className="flex items-baseline gap-2">
          {t("Version")}
          <span className="font-mono text-[12px] text-content/45">
            {snapshot.currentVersion}
          </span>
        </span>
      }
      description={status}
    >
      <div className="flex items-center gap-2">
        <SecondaryButton
          onClick={() => onOpenWhatsNew(snapshot.currentVersion)}
          disabled={snapshot.currentVersion === "…"}
        >{t("What's new")}</SecondaryButton>
        <SecondaryButton onClick={() => void onClick()} disabled={busy}>
          {busy ? (
            <Loader className="size-3.5 animate-spin" aria-hidden />
          ) : hasUpdate ? (
            <ArrowDownCircle className="size-3.5 text-accent" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {hasUpdate ? t("Download") : t("Check for updates")}
        </SecondaryButton>
      </div>
    </Row>
  );
}

type AppearanceSettings = ReturnType<typeof useAppearanceSettings>;

function useAppearanceSettings() {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(loadThemePreference);
  const [accentColor, setAccentColor] = useState(loadAccentColor);
  const [opacity, setOpacity] = useState(loadSidebarOpacity);
  const [blur, setBlur] = useState(loadSidebarBlur);
  const [themeHue, setThemeHue] = useState(loadThemeHue);
  const [themeSaturation, setThemeSaturation] = useState(loadThemeSaturation);
  const [themeDarkLightness, setThemeDarkLightness] = useState(
    loadThemeDarkLightness,
  );
  const [bodyGlass, setBodyGlass] = useState(loadBodyGlass);
  const [showExcludedFiles, setShowExcludedFiles] = useState(
    loadShowExcludedFiles,
  );
  const [chatBackgroundPath, setChatBackgroundPath] = useState(
    loadChatBackgroundPath,
  );
  const [chatBackgroundEmptyOpacity, setChatBackgroundEmptyOpacity] = useState(
    loadChatBackgroundEmptyOpacity,
  );
  const [chatBackgroundSessionOpacity, setChatBackgroundSessionOpacity] =
    useState(loadChatBackgroundSessionOpacity);
  const [chatBackgroundScope, setChatBackgroundScope] =
    useState<ChatBackgroundScope>(loadChatBackgroundScope);
  const [chatBackgroundBusy, setChatBackgroundBusy] = useState(false);
  const [chatBackgroundError, setChatBackgroundError] = useState<string | null>(
    null,
  );
  const [uiScale, setUiScale] = useState(loadUiScale);
  const [uiFontFamily, setUiFontFamily] = useState(loadUiFontFamily);
  const [uiFontWeight, setUiFontWeight] = useState(loadUiFontWeight);
  const [codeFontFamily, setCodeFontFamily] = useState(loadCodeFontFamily);
  const [codeFontSize, setCodeFontSize] = useState(loadCodeFontSize);
  const [codeFontWeight, setCodeFontWeight] = useState(loadCodeFontWeight);

  useEffect(() => subscribeUiScale(() => setUiScale(loadUiScale())), []);

  const onThemePreference = useCallback((next: ThemePreference) => {
    applyThemePreference(next);
    saveThemePreference(next);
    setThemePreference(next);
  }, []);

  const onAccentColor = useCallback((value: string | null) => {
    const next = applyAccentColor(value);
    saveAccentColor(next);
    setAccentColor(next);
  }, []);

  const onOpacity = useCallback((percent: number) => {
    const next = applySidebarOpacity(percent / 100);
    saveSidebarOpacity(next);
    setOpacity(next);
  }, []);

  const onBlur = useCallback((radius: number) => {
    const next = applySidebarBlur(radius);
    saveSidebarBlur(next);
    setBlur(next);
  }, []);

  const onTint = useCallback((hue: number, saturation: number) => {
    const next = applyThemeTint(hue, saturation);
    saveThemeHue(next.hue);
    saveThemeSaturation(next.saturation);
    setThemeHue(next.hue);
    setThemeSaturation(next.saturation);
  }, []);

  const onDarkLightness = useCallback((value: number) => {
    const next = applyThemeDarkLightness(value);
    saveThemeDarkLightness(next);
    setThemeDarkLightness(next);
  }, []);

  const onBodyGlass = useCallback((next: boolean) => {
    applyBodyGlass(next);
    saveBodyGlass(next);
    setBodyGlass(next);
  }, []);

  const onShowExcludedFiles = useCallback((next: boolean) => {
    saveShowExcludedFiles(next);
    setShowExcludedFiles(next);
  }, []);

  const onChooseChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      const path = await pickAndSaveChatBackground();
      if (!path) return;
      saveChatBackgroundPath(path);
      applyChatBackground(path);
      setChatBackgroundPath(path);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onClearChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      await removeChatBackground();
      saveChatBackgroundPath(null);
      applyChatBackground(null);
      setChatBackgroundPath(null);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onChatBackgroundEmptyOpacity = useCallback((percent: number) => {
    const next = applyChatBackgroundEmptyOpacity(percent / 100);
    saveChatBackgroundEmptyOpacity(next);
    setChatBackgroundEmptyOpacity(next);
  }, []);

  const onChatBackgroundSessionOpacity = useCallback((percent: number) => {
    const next = applyChatBackgroundSessionOpacity(percent / 100);
    saveChatBackgroundSessionOpacity(next);
    setChatBackgroundSessionOpacity(next);
  }, []);

  const onChatBackgroundScope = useCallback((next: ChatBackgroundScope) => {
    applyChatBackgroundScope(next);
    saveChatBackgroundScope(next);
    setChatBackgroundScope(next);
  }, []);

  const onUiScale = useCallback((percent: number) => {
    const next = saveUiScale(percent / 100);
    setUiScale(next);
    void applyUiScale(next);
  }, []);

  const onUiFontFamily = useCallback((next: string) => {
    setUiFontFamily(saveUiFontFamily(next));
  }, []);

  const onUiFontWeight = useCallback((next: number) => {
    setUiFontWeight(saveUiFontWeight(next));
  }, []);

  const onCodeFontFamily = useCallback((next: string) => {
    setCodeFontFamily(saveCodeFontFamily(next));
  }, []);

  const onCodeFontSize = useCallback((next: number) => {
    setCodeFontSize(saveCodeFontSize(next));
  }, []);

  const onCodeFontWeight = useCallback((next: number) => {
    setCodeFontWeight(saveCodeFontWeight(next));
  }, []);

  const restoreDefaults = useCallback(() => {
    onThemePreference(THEME_PREFERENCE_DEFAULT);
    onAccentColor(ACCENT_COLOR_DEFAULT);
    onOpacity(Math.round(SIDEBAR_OPACITY_DEFAULT * 100));
    onBlur(SIDEBAR_BLUR_DEFAULT);
    onTint(THEME_HUE_DEFAULT, THEME_SATURATION_DEFAULT);
    onDarkLightness(THEME_DARK_LIGHTNESS_DEFAULT);
    onBodyGlass(BODY_GLASS_DEFAULT);
    onShowExcludedFiles(SHOW_EXCLUDED_FILES_DEFAULT);
    onChatBackgroundEmptyOpacity(
      Math.round(CHAT_BACKGROUND_EMPTY_OPACITY_DEFAULT * 100),
    );
    onChatBackgroundSessionOpacity(
      Math.round(CHAT_BACKGROUND_SESSION_OPACITY_DEFAULT * 100),
    );
    onChatBackgroundScope(CHAT_BACKGROUND_SCOPE_DEFAULT);
    if (chatBackgroundPath) void onClearChatBackground();
    onUiScale(Math.round(UI_SCALE_DEFAULT * 100));
    resetFontsToDefaults();
    setUiFontFamily(loadUiFontFamily());
    setUiFontWeight(loadUiFontWeight());
    setCodeFontFamily(loadCodeFontFamily());
    setCodeFontSize(loadCodeFontSize());
    setCodeFontWeight(loadCodeFontWeight());
  }, [
    chatBackgroundPath,
    onBlur,
    onBodyGlass,
    onShowExcludedFiles,
    onChatBackgroundEmptyOpacity,
    onChatBackgroundSessionOpacity,
    onChatBackgroundScope,
    onClearChatBackground,
    onAccentColor,
    onThemePreference,
    onOpacity,
    onTint,
    onDarkLightness,
    onUiScale,
    onUiFontFamily,
    onUiFontWeight,
    onCodeFontFamily,
    onCodeFontSize,
    onCodeFontWeight,
  ]);

  return {
    themePreference,
    accentColor,
    opacity,
    blur,
    themeHue,
    themeSaturation,
    themeDarkLightness,
    bodyGlass,
    showExcludedFiles,
    chatBackgroundPath,
    chatBackgroundEmptyOpacity,
    chatBackgroundSessionOpacity,
    chatBackgroundScope,
    chatBackgroundBusy,
    chatBackgroundError,
    uiScale,
    uiFontFamily,
    uiFontWeight,
    codeFontFamily,
    codeFontSize,
    codeFontWeight,
    onThemePreference,
    onAccentColor,
    onOpacity,
    onBlur,
    onTint,
    onDarkLightness,
    onBodyGlass,
    onShowExcludedFiles,
    onChooseChatBackground,
    onClearChatBackground,
    onChatBackgroundEmptyOpacity,
    onChatBackgroundSessionOpacity,
    onChatBackgroundScope,
    onUiScale,
    onUiFontFamily,
    onUiFontWeight,
    onCodeFontFamily,
    onCodeFontSize,
    onCodeFontWeight,
    restoreDefaults,
  };
}

function AppearancePage({ appearance }: { appearance: AppearanceSettings }) {
  const percent = Math.round(appearance.opacity * 100);
  const glassDisabled = useColorScheme() === "light";

  return (
    <>
      <Row
        label={t("Theme")}
        description={t("System follows the OS appearance. Dark and light share the same tint, so the hue below applies to both.")}
      >
        <Segmented
          label={t("Theme")}
          value={appearance.themePreference}
          options={[
            { value: "system", label: t("System") },
            { value: "dark", label: t("Dark") },
            { value: "light", label: t("Light") },
          ]}
          onChange={appearance.onThemePreference}
        />
      </Row>
      <Row
        label={t("Accent color")}
        description={t("Used for the composer send button and your message bubbles.")}
      >
        <AccentColorPicker
          value={appearance.accentColor}
          onChange={appearance.onAccentColor}
        />
      </Row>
      <Row
        label={t("Sidebar opacity")}
        description={
          glassDisabled
            ? t("Light mode always uses an opaque window. Your dark-mode value is preserved.") : t("How much of the desktop shows through the sidebar and the project rail.")
        }
      >
        <Slider
          label={t("Sidebar opacity")}
          value={percent}
          display={`${percent}%`}
          min={Math.round(SIDEBAR_OPACITY_MIN * 100)}
          max={Math.round(SIDEBAR_OPACITY_MAX * 100)}
          onChange={appearance.onOpacity}
          disabled={glassDisabled}
        />
      </Row>
      <Row
        label={t("Blur radius")}
        description={
          glassDisabled
            ? t("Background blur is unavailable while light mode uses an opaque window.") : t("Background blur behind the window. Higher values cost more to composite.")
        }
      >
        <Slider
          label={t("Blur radius")}
          value={appearance.blur}
          display={String(appearance.blur)}
          min={SIDEBAR_BLUR_MIN}
          max={SIDEBAR_BLUR_MAX}
          onChange={appearance.onBlur}
          disabled={glassDisabled}
        />
      </Row>
      <Row label={t("Hue")} description={t("Base hue for accents and tinted surfaces.")}>
        <Slider
          label={t("Hue")}
          value={appearance.themeHue}
          display={`${appearance.themeHue}°`}
          min={THEME_HUE_MIN}
          max={THEME_HUE_MAX}
          onChange={(value) =>
            appearance.onTint(value, appearance.themeSaturation)
          }
        />
      </Row>
      <Row
        label={t("Saturation")}
        description={t("How strongly the hue tints the interface. Zero keeps it neutral.")}
      >
        <Slider
          label={t("Saturation")}
          value={appearance.themeSaturation}
          display={`${appearance.themeSaturation}%`}
          min={THEME_SATURATION_MIN}
          max={THEME_SATURATION_MAX}
          onChange={(value) => appearance.onTint(appearance.themeHue, value)}
        />
      </Row>
      <Row
        label={t("Dark-mode lightness")}
        description={
          glassDisabled
            ? t("This only affects dark mode. Your dark-mode value is preserved.")
            : t("Base brightness of the dark theme. Lower values are darker; zero is true black.")
        }
      >
        <Slider
          label={t("Dark-mode lightness")}
          value={appearance.themeDarkLightness}
          display={`${appearance.themeDarkLightness}%`}
          min={THEME_DARK_LIGHTNESS_MIN}
          max={THEME_DARK_LIGHTNESS_MAX}
          onChange={appearance.onDarkLightness}
          disabled={glassDisabled}
        />
      </Row>
      <Row
        label={t("Main pane glass")}
        description={
          glassDisabled
            ? t("Main pane glass is unavailable while light mode uses an opaque window.") : t("Extend the translucent treatment to the main pane behind sessions and editors.")
        }
      >
        <Toggle
          label={t("Main pane glass")}
          on={appearance.bodyGlass}
          onChange={appearance.onBodyGlass}
          disabled={glassDisabled}
        />
      </Row>
      <Row
        label={t("Show excluded files")}
        description={t(
          "List files and folders matched by the project .gitignore, plus .git, in the explorer.",
        )}
      >
        <Toggle
          label={t("Show excluded files")}
          on={appearance.showExcludedFiles}
          onChange={appearance.onShowExcludedFiles}
        />
      </Row>
      <ChatBackgroundCard appearance={appearance} />
      <Row
        label={t("Interface scale")}
        description={t("Zoom the whole interface. You can also use Ctrl+=, Ctrl+-, and Ctrl+0 (Cmd on macOS).")}
      >
        <Slider
          label={t("Interface scale")}
          value={Math.round(appearance.uiScale * 100)}
          display={`${Math.round(appearance.uiScale * 100)}%`}
          min={Math.round(UI_SCALE_MIN * 100)}
          max={Math.round(UI_SCALE_MAX * 100)}
          step={10}
          onChange={appearance.onUiScale}
        />
      </Row>
      <Heading title={t("Fonts")} />
      <Row
        label={t("Interface font")}
        description={t(
          "Typeface for the app chrome. macOS keeps its native rendering until you pick one.",
        )}
      >
        <FontPicker
          label={t("Interface font")}
          value={appearance.uiFontFamily}
          onChange={appearance.onUiFontFamily}
          previewText="Ag"
        />
      </Row>
      <Row
        label={t("Interface weight")}
        description={t(
          "Base weight for interface text. Bolder headings keep their emphasis.",
        )}
      >
        <FontWeightSegmented
          label={t("Interface weight")}
          value={appearance.uiFontWeight}
          onChange={appearance.onUiFontWeight}
        />
      </Row>
      <Row
        label={t("Code font")}
        description={t(
          "Monospace for the editor and the terminal. Proportional fonts stay listed with the filter off but will misalign the terminal grid.",
        )}
      >
        <FontPicker
          label={t("Code font")}
          value={appearance.codeFontFamily}
          onChange={appearance.onCodeFontFamily}
          previewText="Aa"
          monospaceFilter
        />
      </Row>
      <Row
        label={t("Code size")}
        description={t("Editor and terminal text size.")}
      >
        <Slider
          label={t("Code size")}
          value={appearance.codeFontSize}
          display={`${appearance.codeFontSize}px`}
          min={CODE_FONT_SIZE_MIN}
          max={CODE_FONT_SIZE_MAX}
          onChange={appearance.onCodeFontSize}
        />
      </Row>
      <Row
        label={t("Code weight")}
        description={t("Editor and terminal text weight.")}
      >
        <FontWeightSegmented
          label={t("Code weight")}
          value={appearance.codeFontWeight}
          onChange={appearance.onCodeFontWeight}
        />
      </Row>
      <CodeFontPreview />
    </>
  );
}

const CODE_TERMINAL_SAMPLE = [
  "\x1b[1;32m$\x1b[0m pnpm vitest run src/lib/fonts.test.ts",
  " \x1b[32m✓\x1b[0m 9 passed (6ms)",
  "\x1b[1;32m$\x1b[0m echo \"a => b != c → € £ ¥\"",
  "a => b != c → € £ ¥",
  "\x1b[1;32m$\x1b[0m git diff --stat",
  " src/lib/fonts.ts \x1b[33m| 120 +++++++++++\x1b[0m",
];

/** Live in-place example of the code knob: a real (read-only) xterm.js
 * terminal running the same family, size, and weight as the workspace
 * terminals, so every picker and slider change shows here immediately. */
function CodeFontPreview() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontFamily: codeFontStack(loadCodeFontFamily()),
      fontSize: loadCodeFontSize(),
      fontWeight: loadCodeFontWeight(),
      lineHeight: 1,
      letterSpacing: 0,
      scrollback: 100,
      allowTransparency: true,
      theme: terminalTheme(isLightScheme()),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    // Static preview: hide the cursor, then play a tiny session.
    term.write("\x1b[?25l");
    for (const line of CODE_TERMINAL_SAMPLE) term.writeln(line);
    const onFontsChange = () => {
      if (disposed) return;
      term.options.fontFamily = codeFontStack(loadCodeFontFamily());
      term.options.fontSize = loadCodeFontSize();
      term.options.fontWeight = loadCodeFontWeight();
      // New metrics change the cell grid: re-fit to the host.
      fit.fit();
    };
    const onSchemeChange = () => {
      if (disposed) return;
      term.options.theme = terminalTheme(isLightScheme());
    };
    window.addEventListener(FONTS_CHANGE_EVENT, onFontsChange);
    window.addEventListener(SCHEME_CHANGE_EVENT, onSchemeChange);
    const observer = new ResizeObserver(() => {
      if (!disposed) fit.fit();
    });
    observer.observe(host);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener(FONTS_CHANGE_EVENT, onFontsChange);
      window.removeEventListener(SCHEME_CHANGE_EVENT, onSchemeChange);
      term.dispose();
    };
  }, []);

  return (
    <div className="border-b border-content/5 py-4 last:border-b-0">
      <div className="text-sm font-semibold text-content">
        {t("Code preview")}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-content/45">
        {t(
          "A real terminal running your code font: same typeface, size, and weight as the workspace terminals.",
        )}
      </p>
      <div className="monocode-terminal mt-3 h-36 rounded-lg border border-content/10 bg-content/5">
        <div
          ref={hostRef}
          aria-label={t("Code font terminal preview")}
          className="h-full w-full min-h-0 min-w-0 overflow-hidden"
        />
      </div>
    </div>
  );
}

function FontWeightSegmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const asOption = (weight: number) =>
    weight >= FONT_WEIGHT_MAX
      ? String(FONT_WEIGHT_MAX)
      : weight <= FONT_WEIGHT_MIN
        ? String(FONT_WEIGHT_MIN)
        : String(Math.round(weight / 100) * 100);
  return (
    <Segmented
      label={label}
      value={asOption(value)}
      options={[
        { value: "400", label: "Regular" },
        { value: "500", label: "Medium" },
        { value: "600", label: "Semibold" },
        { value: "700", label: "Bold" },
      ]}
      onChange={(next) => onChange(Number(next))}
    />
  );
}

function FontPicker({
  label,
  value,
  onChange,
  previewText,
  monospaceFilter = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  previewText: string;
  monospaceFilter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<SystemFont[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [monoOnly, setMonoOnly] = useState(monospaceFilter);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchId = useId();
  const listId = useId();

  useEffect(() => {
    if (!open || fonts || failed) return;
    let cancelled = false;
    void listSystemFonts()
      .then((next) => {
        if (!cancelled) setFonts(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fonts, failed]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const all = fonts ?? [];
    return all.filter((font) => {
      if (monoOnly && !font.monospace) return false;
      if (!needle) return true;
      return font.family.toLowerCase().includes(needle);
    });
  }, [fonts, monoOnly, needle]);

  // Index 0 is always "System default"; font rows follow it.
  useEffect(() => {
    setActive(0);
  }, [query, monoOnly]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Typing in the search field must not pick a font: Enter there would
    // otherwise reset to "System default" while the user is still filtering.
    if (
      e.key === "Enter" &&
      (e.target as HTMLElement | null)?.tagName === "INPUT"
    ) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(visible.length, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(active === 0 ? "" : (visible[active - 1]?.family ?? value));
    }
  };

  return (
    <div ref={root} className="relative max-w-64">
      <button
        type="button"
        ref={trigger}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-content/10 bg-content/5 px-2 py-1 text-left text-sm text-content outline-none hover:border-content/20"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded bg-content/10 text-xs text-content/70"
          style={value ? { fontFamily: `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}", sans-serif` } : undefined}
          aria-hidden
        >
          {previewText}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {value || "System default"}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/50 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="bottom"
          align="end"
          width={300}
          maxHeight={340}
          autoFocus
          onDismiss={(reason) => {
            setOpen(false);
            if (reason === "escape") trigger.current?.focus();
          }}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-opt-${active}`}
          tabIndex={-1}
          onKeyDown={onListKey}
          className="flex flex-col overflow-hidden p-1"
        >
          <div className="flex items-center gap-2 p-1">
            <label
              htmlFor={searchId}
              className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-content/10 px-2 text-content/45 focus-within:border-content/20"
            >
              <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
              <input
                id={searchId}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search fonts")}
                aria-label={t("Search fonts")}
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content/35"
              />
            </label>
          </div>
          {monospaceFilter ? (
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm text-content/60 hover:text-content">
              <input
                type="checkbox"
                checked={monoOnly}
                onChange={(event) => setMonoOnly(event.target.checked)}
                className="size-3.5 accent-current"
              />{t("Monospace only")}</label>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {fonts == null && !failed ? (
              <p className="flex items-center gap-2 px-2 py-3 text-[12px] text-content/45">
                <Loader className="size-3.5 animate-spin" aria-hidden />
                Loading system fonts…
              </p>
            ) : failed || (fonts != null && fonts.length === 0) ? (
              <p className="px-2 py-3 text-[12px] text-content/45">
                {failed
                  ? "Could not list system fonts. Your pick still applies if the family is installed."
                  : "No system fonts found. Your pick still applies if the family is installed."}
              </p>
            ) : (
              <>
                <FontPickerOption
                  id={`${listId}-opt-0`}
                  name="System default"
                  preview={null}
                  selected={value === ""}
                  highlighted={active === 0}
                  onEnter={() => setActive(0)}
                  onPick={() => pick("")}
                />
                {visible.map((font, index) => {
                  const row = index + 1;
                  return (
                    <FontPickerOption
                      key={font.family}
                      id={`${listId}-opt-${row}`}
                      name={font.family}
                      preview={font.family}
                      badge={font.monospace ? "Mono" : null}
                      selected={value === font.family}
                      highlighted={active === row}
                      onEnter={() => setActive(row)}
                      onPick={() => pick(font.family)}
                    />
                  );
                })}
                {visible.length === 0 ? (
                  <p className="px-2 py-3 text-[12px] text-content/45">{t("No matching fonts")}</p>
                ) : null}
              </>
            )}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

function FontPickerOption({
  id,
  name,
  preview,
  badge,
  selected,
  highlighted,
  onEnter,
  onPick,
}: {
  id: string;
  name: string;
  preview: string | null;
  badge?: string | null;
  selected: boolean;
  highlighted: boolean;
  onEnter: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onEnter}
      onClick={onPick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
        highlighted || selected
          ? "bg-content/10 text-content"
          : "text-content hover:bg-content/5"
      }`}
    >
      <span
        className="min-w-0 flex-1 truncate"
        style={
          preview
            ? { fontFamily: `"${preview.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}", sans-serif` }
            : undefined
        }
      >
        {name}
      </span>
      {badge ? (
        <span className="shrink-0 rounded bg-content/10 px-1 py-0.5 text-2xs font-medium text-content/50">
          {badge}
        </span>
      ) : null}
      {selected ? (
        <Check className="size-3.5 shrink-0" strokeWidth={2.25} />
      ) : null}
    </button>
  );
}

function ChatBackgroundCard({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const src = chatBackgroundSrc(appearance.chatBackgroundPath);
  const hasImage = Boolean(appearance.chatBackgroundPath && src);
  const emptyVisibility = Math.round(
    appearance.chatBackgroundEmptyOpacity * 100,
  );
  const sessionVisibility = Math.round(
    appearance.chatBackgroundSessionOpacity * 100,
  );
  const busy = appearance.chatBackgroundBusy;

  return (
    <div className="border-b border-content/5 py-4 last:border-b-0">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-content">
            {t("Chat background")}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-content/45">
            {t("An image behind your chat panes. It stays on this device.")}
          </p>
        </div>
        {hasImage ? (
          <div className="flex shrink-0 items-center gap-2">
            <SecondaryButton
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
            >
              {busy ? (
                <Loader className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("Change")}
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void appearance.onClearChatBackground()}
              disabled={busy}
              danger
            >
              {t("Remove")}
            </SecondaryButton>
          </div>
        ) : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-content/10">
        {hasImage ? (
          <div className="relative h-36">
            <img
              src={src ?? undefined}
              alt=""
              draggable={false}
              className="size-full object-cover"
              style={{ opacity: appearance.chatBackgroundEmptyOpacity }}
            />
            <span className="pointer-events-none absolute bottom-2 left-2 text-xs text-content/40">
              {t("Preview at {percent}%", { percent: emptyVisibility })}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void appearance.onChooseChatBackground()}
            disabled={busy}
            className="flex h-36 w-full flex-col items-center justify-center gap-2 text-content/40 hover:bg-content/5 hover:text-content/70 disabled:cursor-default disabled:opacity-40"
          >
            {busy ? (
              <Loader className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-5" aria-hidden />
            )}
            <span className="text-sm font-medium">{t("Choose an image")}</span>
          </button>
        )}
        {hasImage ? (
          <div className="border-t border-content/8">
            <div className="flex items-center justify-between gap-4 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] text-content">{t("Show on")}</div>
                <p className="text-xs text-content/40">
                  {t("Empty sessions only, or every conversation.")}
                </p>
              </div>
              <Segmented
                label={t("Show background on")}
                value={appearance.chatBackgroundScope}
                options={[
                  { value: "empty", label: t("Empty only") },
                  { value: "all", label: t("All sessions") },
                ]}
                onChange={appearance.onChatBackgroundScope}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-content/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] text-content">
                  {t("Empty sessions")}
                </div>
                <p className="text-xs text-content/40">
                  {t("Visibility while the conversation is still empty.")}
                </p>
              </div>
              <Slider
                label={t("Empty session visibility")}
                value={emptyVisibility}
                display={`${emptyVisibility}%`}
                min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
                max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
                onChange={appearance.onChatBackgroundEmptyOpacity}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-content/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] text-content">
                  {t("Working sessions")}
                </div>
                <p className="text-xs text-content/40">
                  {t("Keep it subtle so long conversations stay readable.")}
                </p>
              </div>
              <Slider
                label={t("Working session visibility")}
                value={sessionVisibility}
                display={`${sessionVisibility}%`}
                min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
                max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
                onChange={appearance.onChatBackgroundSessionOpacity}
              />
            </div>
          </div>
        ) : null}
      </div>
      {appearance.chatBackgroundError ? (
        <p className="mt-2 text-[12px] text-red-400">
          {appearance.chatBackgroundError}
        </p>
      ) : null}
    </div>
  );
}

function KeybindingsPage() {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterKeybindings(KEYBINDINGS, query), [query]);

  return (
    <>
      <div className="flex items-center justify-end gap-3 pb-3">
        <span className="shrink-0 text-[12px] text-content/40 tabular-nums">
          {rows.length} {rows.length === 1 ? t("binding") : t("bindings")}
        </span>
        <label className="flex h-7 w-52 shrink-0 items-center gap-2 rounded-md border border-content/10 px-2 text-content/45 focus-within:border-content/20">
          <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Filter")}
            aria-label={t("Filter keybindings")}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content/35"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-content/10">
        <div className="flex items-center border-b border-content/10 bg-content/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-content/40">
          <span className="min-w-0 flex-1">{t("Command")}</span>
          <span className="w-40 shrink-0">{t("Keybinding")}</span>
          <span className="w-28 shrink-0">{t("When")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-content/45">
            {t("No matching bindings")}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.command}-${row.keys}`}
              className="flex items-center border-b border-content/5 px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate">{t(row.command)}</span>
              <span className="w-40 shrink-0 font-mono text-sm text-content/80">
                {row.keys}
              </span>
              <span className="w-28 shrink-0 font-mono text-xs text-content/40">
                {t(row.when)}
              </span>
            </div>
          ))
        )}
      </div>

      <p className="pt-3 text-[12px] text-content/40">
        Bindings come from the app menu and the workspace key handler; they
        aren’t customizable yet.
      </p>
    </>
  );
}

export function ProvidersOrderList({
  rowProps,
}: {
  rowProps?: (harness: HarnessId) => {
    selectedModel: string;
    isDefault: boolean;
    onDefault: (harness: HarnessId, model: string) => void;
    onModelChange: (harness: HarnessId, model: string) => void;
  };
} = {}) {
  const providerOrder = useSyncExternalStore(
    subscribeProviderOrder,
    getProviderOrderSnapshot,
    getProviderOrderSnapshot,
  );
  const providers = useMemo(() => {
    void providerOrder;
    return orderedHarnesses();
  }, [providerOrder]);
  const sortable = useAnimatedReorder(
    providers,
    (ids) => saveProviderOrder(mergeProviderOrder(ids, providers)),
    "y",
  );

  return (
    <div className="flex flex-col gap-3">
      {providers.map((harness) => (
        <ProviderRow
          key={harness}
          harness={harness}
          dragging={sortable.draggingId === harness}
          itemRef={(el) => sortable.setItemRef(harness, el)}
          onGripPointerDown={(event) =>
            sortable.onItemPointerDown(harness, event)
          }
          {...(rowProps?.(harness) ?? {})}
        />
      ))}
    </div>
  );
}

function ProvidersPage() {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const availabilityVersion = useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const providerOrder = useSyncExternalStore(
    subscribeProviderOrder,
    getProviderOrderSnapshot,
    getProviderOrderSnapshot,
  );
  const [choice, setChoice] = useState(loadLastModelChoice);
  const [defaultModels, setDefaultModels] = useState(loadDefaultModels);
  const effectiveChoice = useMemo(() => {
    void availabilityVersion;
    void providerOrder;
    return hasProbedHarnessAvailability()
      ? defaultSessionChoice(isHarnessAvailable)
      : choice;
  }, [choice, availabilityVersion, providerOrder]);

  useEffect(() => {
    setChoice(loadLastModelChoice());
    setDefaultModels(loadDefaultModels());
  }, [catalogVersion]);

  useEffect(() => {
    void probeHarnessAvailability();
  }, []);

  const onModelChange = (harness: HarnessId, model: string) => {
    saveDefaultModel(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    if (choice?.harness === harness) {
      saveLastModelChoice(harness, model);
      setChoice({ harness, model });
    }
  };

  const onDefault = (harness: HarnessId, model: string) => {
    saveLastModelChoice(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    setChoice({ harness, model });
  };

  return (
    <ProvidersOrderList
      rowProps={(harness) => ({
        selectedModel:
          defaultModels[harness] ??
          (choice?.harness === harness
            ? choice.model
            : defaultModelId(harness)),
        isDefault: effectiveChoice?.harness === harness,
        onDefault,
        onModelChange,
      })}
    />
  );
}

function ProviderRow({
  harness,
  selectedModel = "",
  isDefault = false,
  onDefault = () => {},
  onModelChange = () => {},
  dragging,
  itemRef,
  onGripPointerDown,
}: {
  harness: HarnessId;
  selectedModel?: string;
  isDefault?: boolean;
  onDefault?: (harness: HarnessId, model: string) => void;
  onModelChange?: (harness: HarnessId, model: string) => void;
  dragging: boolean;
  itemRef: (el: HTMLElement | null) => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const models = modelsFor(harness);
  const liveCatalog = hasLiveCatalog(harness);
  const available = isHarnessAvailable(harness);
  const current =
    models.length > 0 ? resolveModel(harness, selectedModel) : null;
  const [inPicker, setInPicker] = useState(() =>
    isPickerProviderVisible(harness),
  );
  const [installing, setInstalling] = useState(false);
  const needsCatalogRefresh =
    supportsCustomModels(harness) || models.length === 0;

  useEffect(() => {
    if (!available || liveCatalog || !needsCatalogRefresh) return;
    void refreshHarnessCatalogs([harness]);
  }, [available, harness, liveCatalog, needsCatalogRefresh]);

  const onPickerVisible = (visible: boolean) => {
    savePickerProviderVisible(harness, visible);
    setInPicker(visible);
  };

  const onInstallCodex = async () => {
    const confirmed = await ask(
      "MonoCode will download and run OpenAI's official Codex installer, placing the CLI in ~/.monocode/bin. Continue?",
      { title: "Install Codex CLI", kind: "info" },
    );
    if (!confirmed) return;
    setInstalling(true);
    try {
      await installCodexBinary();
      await probeHarnessAvailability({ force: true });
      await refreshHarnessCatalogs(["codex"]);
      await message(
        "Codex CLI is installed. If you have not signed in before, run `codex` once in a terminal and choose Sign in with ChatGPT.",
        { title: "Codex CLI installed", kind: "info" },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await message(`Couldn't install Codex CLI.\n\n${detail}`, {
        title: "Codex CLI installation failed",
        kind: "error",
      });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section
      ref={itemRef}
      className={`reorder-item relative rounded-xl border border-content/10 px-4 py-3 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex shrink-0 flex-col items-center">
          <button
            type="button"
            tabIndex={-1}
            data-no-tooltip
            aria-label={t("Reorder {name}", { name: HARNESS_TITLE[harness] })}
            onPointerDown={onGripPointerDown}
            className="grid size-5 cursor-grab touch-none place-items-center rounded text-content/35 hover:bg-content/10 hover:text-content active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <HarnessIcon harness={harness} className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-content">
              {HARNESS_TITLE[harness]}
            </h2>
            {isDefault ? (
              <span className="rounded-full bg-content/10 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-content/60">
                {t("Default")}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-content/45">
            {available
              ? t(
                  models.length === 1
                    ? "{count} model available."
                    : "{count} models available.",
                  { count: models.length },
                )
              : harnessUnavailableHint(harness)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-[12px] text-content/50">
            {t("Show in picker")}
          </span>
          <Toggle
            label={t("Show {name} in the model picker", {
              name: HARNESS_TITLE[harness],
            })}
            on={inPicker}
            onChange={onPickerVisible}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {current ? (
          <Select
            label={t("{name} model", { name: HARNESS_TITLE[harness] })}
            value={current.id}
            onChange={(next) => onModelChange(harness, next)}
            options={models.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        ) : null}
        {!available && harness === "codex" ? (
          <SecondaryButton onClick={onInstallCodex} disabled={installing}>
            {installing ? "Installing…" : "Install Codex"}
          </SecondaryButton>
        ) : null}
        <SecondaryButton
          onClick={() => current && onDefault(harness, current.id)}
          disabled={isDefault || !available || !current}
        >
          {isDefault ? t("Default") : t("Use by default")}
        </SecondaryButton>
      </div>
      {models.length > 1 ? (
        <ModelVisibilityList harness={harness} models={models} />
      ) : null}
      {supportsCustomModels(harness) ? (
        <CustomModelsSection harness={harness} />
      ) : null}
    </section>
  );
}

function ModelVisibilityList({
  harness,
  models,
}: {
  harness: HarnessId;
  models: AgentModel[];
}) {
  useSyncExternalStore(
    subscribeModelVisibility,
    modelVisibilityVersion,
    modelVisibilityVersion,
  );
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const shown = models.filter((model) => isModelEnabled(model.id)).length;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? models.filter((model) => model.name.toLowerCase().includes(needle))
    : models;

  return (
    <div className="pt-3">
      <div className="overflow-hidden rounded-lg border border-content/10">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-content/70 hover:bg-content/5 hover:text-content"
        >
          <span className="min-w-0 flex-1">
            {t("Choose which models appear")}
          </span>
          <span className="shrink-0 tabular-nums text-content/40">
            {t("{shown} of {total}", { shown, total: models.length })}
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-content/45 ${expanded ? "rotate-180" : ""}`}
            strokeWidth={1.75}
          />
        </button>
        {expanded ? (
          <div className="border-t border-content/10">
            <div className="flex items-center gap-2 border-b border-content/8 px-3 py-2">
              <label className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-content/5 px-2 text-content/40">
                <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("Search models")}
                  aria-label={t("Search models")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content/35"
                />
              </label>
              <button
                type="button"
                onClick={() => setHarnessModelsEnabled(harness, true)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-content/55 hover:bg-content/8 hover:text-content"
              >
                {t("Select all")}
              </button>
              <button
                type="button"
                onClick={() => setHarnessModelsEnabled(harness, false)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-content/55 hover:bg-content/8 hover:text-content"
              >
                {t("Clear all")}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto overscroll-none">
              {visible.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-content/40">
                  {t("No models found")}
                </p>
              ) : (
                visible.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 border-b border-content/5 px-3 py-1.5 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ModelBrandIcon
                        model={model}
                        className="size-3.5 shrink-0"
                      />
                      <span className="min-w-0 truncate text-sm text-content/80">
                        {model.name}
                      </span>
                    </span>
                    <Toggle
                      label={t("Show {name} in the model picker", {
                        name: model.name,
                      })}
                      on={isModelEnabled(model.id)}
                      onChange={(on) => setModelEnabled(model.id, on)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VoicePage() {
  const [enabled, setEnabled] = useState(loadVoiceEnabled);
  const [model, setModel] = useState(loadVoiceModel);
  const [language, setLanguage] = useState(loadVoiceLanguage);
  const [prompt, setPrompt] = useState(loadVoicePrompt);
  const [keyDraft, setKeyDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void voiceHasApiKey()
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }, []);

  const saveKey = () => {
    if (!keyDraft.trim()) return;
    setBusy(true);
    setStatus(null);
    void voiceSetApiKey(keyDraft)
      .then(() => {
        setKeyDraft("");
        setHasKey(true);
        setStatus(t("Key saved to the macOS Keychain."));
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  };

  const removeKey = () => {
    setBusy(true);
    setStatus(null);
    void voiceClearApiKey()
      .then(() => {
        setHasKey(false);
        setStatus(t("Key removed."));
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Row
        label={t("Enable dictation")}
        description={t("Mic button in the composer.")}
      >
        <Toggle
          label={t("Enable dictation")}
          on={enabled}
          onChange={(next) => {
            setEnabled(next);
            saveVoiceEnabled(next);
          }}
        />
      </Row>
      <Row
        label={t("Model")}
        description={t("Full is more accurate; mini is cheaper.")}
      >
        <Select
          label={t("Model")}
          value={model}
          onChange={(value) => {
            const next =
              value === "gpt-4o-mini-transcribe"
                ? "gpt-4o-mini-transcribe"
                : "gpt-4o-transcribe";
            setModel(next);
            saveVoiceModel(next);
          }}
          options={[
            { value: "gpt-4o-transcribe", label: "GPT-4o Transcribe" },
            {
              value: "gpt-4o-mini-transcribe",
              label: "GPT-4o Mini Transcribe",
            },
          ]}
        />
      </Row>
      <Row label={t("Language")} description={t("Auto detects the language.")}>
        <Select
          label={t("Language")}
          value={language}
          onChange={(value) => {
            const next =
              value === "pt" || value === "en" || value === "es"
                ? value
                : "auto";
            setLanguage(next);
            saveVoiceLanguage(next);
          }}
          options={[
            { value: "auto", label: t("Auto") },
            { value: "pt", label: "Português" },
            { value: "en", label: "English" },
            { value: "es", label: "Español" },
          ]}
        />
      </Row>
      <div className="border-b border-content/5 py-4">
        <label className="block text-sm font-semibold text-content">
          {t("OpenAI API key")}
        </label>
        <p className="mt-1 text-[12px] leading-relaxed text-content/45">
          {t("Kept in the macOS Keychain.")}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="password"
            value={keyDraft}
            aria-label={t("OpenAI API key")}
            placeholder={hasKey ? "••••••••" : "sk-…"}
            onChange={(event) => setKeyDraft(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-content/10 bg-content/5 px-3 text-sm text-content outline-none"
          />
          <SecondaryButton onClick={saveKey} disabled={busy || !keyDraft.trim()}>
            {t("Save")}
          </SecondaryButton>
          {hasKey ? (
            <SecondaryButton onClick={removeKey} disabled={busy}>
              {t("Remove")}
            </SecondaryButton>
          ) : null}
        </div>
      </div>
      <div className="border-b border-content/5 py-4 last:border-b-0">
        <label className="block text-sm font-semibold text-content">
          {t("Context prompt")}
        </label>
        <p className="mt-1 text-[12px] leading-relaxed text-content/45">
          {t("Names and terms to expect.")}
        </p>
        <textarea
          value={prompt}
          aria-label={t("Context prompt")}
          rows={5}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => saveVoicePrompt(prompt)}
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-content/10 bg-content/5 px-3 py-2 text-sm leading-relaxed text-content outline-none"
        />
      </div>
      {status ? (
        <p className="pt-3 text-[12px] text-content/50">{status}</p>
      ) : null}
    </>
  );
}

function useArchivedProjects(): ArchivedProject[] {
  const [items, setItems] = useState(loadArchivedProjects);
  useEffect(
    () => subscribeArchivedProjects(() => setItems(loadArchivedProjects())),
    [],
  );
  return items;
}

function archivedProjectLabel(path: string): string {
  return resolveTabGroupLabel(
    projectKey(path),
    loadTabGroupLabels(),
    projectName(path),
  );
}

function ArchivePage({
  cwd,
  sessions,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreProject,
  onDeleteProject,
}: {
  cwd: string;
  sessions: SessionSummary[];
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreProject?: (path: string) => void;
  onDeleteProject?: (path: string) => void;
}) {
  const [filters, setFilters] = useState(loadSessionSidebarFilters);
  const [deleting, setDeleting] = useState<ArchivedProject | null>(null);
  const archivedProjects = useArchivedProjects();
  const archived = useMemo(
    () =>
      sessions
        .filter((session) => session.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const onShowArchived = (showArchived: boolean) => {
    const next = { ...filters, showArchived };
    saveSessionSidebarFilters(next);
    setFilters(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-content/10 px-4 py-4">
        <h2 className="text-sm font-semibold text-content">
          {t("Archived projects")}
        </h2>
        {archivedProjects.length === 0 ? (
          <p className="mt-1 text-pretty text-[12px] leading-relaxed text-content/45">
            {t(
              "Archive a project from the rail to keep its chats without listing it in the sidebar.",
            )}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            {archivedProjects.map((project) => (
              <div
                key={project.path}
                className="flex min-w-0 flex-wrap items-center gap-2 py-1.5"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-sm">
                    {archivedProjectLabel(project.path)}
                  </div>
                  <div className="truncate text-xs text-content/40">
                    {prettyCwd(project.path)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {onRestoreProject ? (
                    <SecondaryButton
                      onClick={() => onRestoreProject(project.path)}
                    >
                      {t("Restore")}
                    </SecondaryButton>
                  ) : null}
                  {onDeleteProject ? (
                    <SecondaryButton
                      danger
                      onClick={() => setDeleting(project)}
                    >
                      {t("Delete")}
                    </SecondaryButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Row
        label={t("Show archived in the sidebar")}
        description={t(
          "Keep archived conversations listed alongside the active ones.",
        )}
      >
        <Toggle
          label={t("Show archived in the sidebar")}
          on={filters.showArchived}
          onChange={onShowArchived}
        />
      </Row>

      <section className="rounded-xl border border-content/10 px-4 py-4">
        <h2 className="text-sm font-semibold text-content">
          {looksLikeProject(cwd)
            ? t("Archived in {project}", { project: projectName(cwd) })
            : t("Archived conversations")}
        </h2>
        {!looksLikeProject(cwd) ? (
          <p className="mt-1 text-pretty text-[12px] leading-relaxed text-content/45">
            {t("Open a project to see its archived conversations.")}
          </p>
        ) : archived.length === 0 ? (
          <p className="mt-1 text-pretty text-[12px] leading-relaxed text-content/45">
            {t("No archived conversations in this project.")}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            {archived.map((session) => (
              <div
                key={session.id}
                className="flex min-w-0 flex-wrap items-center gap-2 py-1.5"
              >
                <HarnessIcon
                  harness={session.harness}
                  className="size-3.5 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onOpenSession(session.id)}
                  className="min-w-0 flex-1 basis-40 truncate text-left text-sm hover:text-content"
                >
                  {sessionDisplayTitle(session.title, session.harness)}
                </button>
                <span className="shrink-0 text-xs text-content/35 tabular-nums">
                  {formatDate(session.updatedAt)}
                </span>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <SecondaryButton
                    onClick={() => onArchiveSession(session.id, false)}
                  >
                    {t("Unarchive")}
                  </SecondaryButton>
                  <SecondaryButton
                    danger
                    onClick={() => onDeleteSession(session.id)}
                  >
                    {t("Delete")}
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {deleting ? (
        <RemoveProjectDialog
          name={archivedProjectLabel(deleting.path)}
          path={deleting.path}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDeleteProject?.(deleting.path);
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}

function formatDate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function ProjectPage({ cwd }: { cwd: string }) {
  const [data, setData] = useState<ProjectInstructions | null>(null);
  const [draft, setDraft] = useState("");
  const [bridge, setBridge] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setStatus(null);
    setError(null);
    void loadProjectInstructions(cwd)
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setDraft(loaded.agents);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData({ agents: "", claude: "", agentsExists: false });
        setDraft("");
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const dirty = data != null && draft !== data.agents;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveProjectInstructions({
        cwd,
        agents: draft,
        writeClaudeBridge: bridge,
        existingClaude: data?.claude ?? "",
      });
      const loaded = await loadProjectInstructions(cwd);
      setData(loaded);
      setDraft(loaded.agents);
      setStatus(t("Saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {data == null ? (
        <p className="text-sm text-content/40">{t("Loading…")}</p>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus(null);
            }}
            spellCheck={false}
            placeholder={t(
              "# Project instructions\n\nRules every agent should follow in this project.",
            )}
            className="h-80 w-full resize-y rounded-xl border border-content/10 bg-content/5 px-3 py-2.5 font-mono text-sm leading-relaxed text-content outline-none focus:border-content/25"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
            >
              {saving ? t("Saving…") : t("Save")}
            </button>
            {status ? (
              <span className="text-[12px] text-content/45">{status}</span>
            ) : null}
            {error ? (
              <span className="text-[12px] text-red-400">{error}</span>
            ) : null}
          </div>
          <Row
            label={t("Link from CLAUDE.md")}
            description={t(
              "Adds @AGENTS.md so Claude Code reads the same instructions.",
            )}
          >
            <Toggle
              label={t("Add @AGENTS.md import")}
              on={bridge}
              onChange={setBridge}
            />
          </Row>
          <p className="text-[12px] text-content/35">
            {t("Project folder: {path}", { path: prettyCwd(cwd) })}
          </p>
        </>
      )}
    </div>
  );
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="pb-6">
      <h1 className="font-display text-display text-content">
        {title}
      </h1>
      {description ? (
        <p className="mt-1.5 max-w-lg text-pretty text-sm leading-relaxed text-content/45">
          {description}
        </p>
      ) : null}
    </header>
  );
}

function Heading({
  title,
  first = false,
  id,
}: {
  title: string;
  first?: boolean;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={`pb-1 text-sm font-semibold text-content ${
        first ? "" : "pt-8"
      }`}
    >
      {title}
    </h2>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-content/5 py-4 last:border-b-0">
      <div className="min-w-0 grow basis-72">
        <div className="text-sm font-semibold text-content">{label}</div>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-content/45">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-grid shrink-0 gap-0.5 rounded-md border border-content/10 p-0.5 text-sm"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-w-0 whitespace-nowrap rounded-[5px] px-2.5 py-1 ${
            value === option.value
              ? "bg-content/10 text-content"
              : "text-content/50 hover:text-content"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex w-56 items-center gap-3 ${disabled ? "opacity-40" : ""}`}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        disabled={disabled}
        className="sidebar-opacity-slider min-w-0 flex-1 disabled:cursor-not-allowed"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="w-10 shrink-0 text-right text-sm text-content tabular-nums">
        {display}
      </span>
    </div>
  );
}

const ACCENT_COLOR_PRESETS = [
  "#4da3f5",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#10b981",
] as const;

function AccentColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const colorIndex = value
    ? ACCENT_COLOR_PRESETS.indexOf(
        value as (typeof ACCENT_COLOR_PRESETS)[number],
      )
    : -1;
  const presetIndex = value == null ? 0 : colorIndex >= 0 ? colorIndex + 1 : -1;

  return (
    <div ref={root} className="w-48">
      <ColorSwatchRow
        colors={["var(--color-content)", ...ACCENT_COLOR_PRESETS]}
        labels={["Default", "Blue", "Violet", "Pink", "Red", "Orange", "Green"]}
        colorIndex={presetIndex >= 0 ? presetIndex : undefined}
        customColor={presetIndex < 0 ? (value ?? undefined) : undefined}
        customPickerOpen={open}
        onPickIndex={(index) => {
          setOpen(false);
          onChange(
            index === 0
              ? ACCENT_COLOR_DEFAULT
              : (ACCENT_COLOR_PRESETS[index - 1] ?? ACCENT_COLOR_PRESETS[0]),
          );
        }}
        onToggleCustom={() => setOpen((current) => !current)}
      />
      {open ? (
        <Popover
          anchor={root}
          side="bottom"
          align="end"
          width={248}
          onDismiss={() => setOpen(false)}
          className="px-2 pb-2"
        >
          <ColorPickerPopover
            value={value ?? ACCENT_COLOR_PRESETS[0]}
            onChange={onChange}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/** macOS keeps the decision after the first prompt; only System Settings can flip it. Windows toasts are governed by Settings > Notifications. */
function NotificationsBlocked() {
  return (
    <span className="flex items-center gap-2 text-[12px] text-content/45">
      {t("Permission needed")}
      {IS_MAC || IS_WIN ? (
        <button
          type="button"
          onClick={() => {
            void openNotificationSettings().catch(() => {});
          }}
          className="rounded-md border border-content/10 px-2 py-1 text-xs font-medium text-content/70 hover:bg-content/10 hover:text-content"
        >
          {t("Open System Settings")}
        </button>
      ) : null}
    </span>
  );
}

function Toggle({
  label,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      data-no-tooltip
      aria-label={label}
      aria-checked={on}
      disabled={disabled}
      onClick={() => {
        onChange(!on);
        playCue("switch");
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "bg-accent" : "bg-content/20"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-[left] ${
          on ? "left-4.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** Theme-aware dropdown for a Settings row: a trigger button opening a Popover listbox. Used instead of a native select, whose option popup is OS-rendered and unreadable in dark mode on Windows/Linux. */
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const activeId =
    options[active] != null ? `${listId}-opt-${active}` : undefined;

  useEffect(() => {
    if (!open) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
  }, [open, value, options]);

  useEffect(() => {
    if (!open) return;
    activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
      return;
    }
    if (e.key === "Tab") {
      const option = options[active];
      if (option && option.value !== value) onChange(option.value);
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const option = options[active];
      if (option) pick(option.value);
    }
  };

  return (
    <div ref={root} className="relative max-w-52">
      <button
        type="button"
        ref={trigger}
        data-no-tooltip
        aria-label={`${label}: ${selected?.label ?? value}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-content/10 bg-content/5 px-2 py-1 text-left text-sm text-content outline-none hover:border-content/20"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : value}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/50 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="bottom"
          align="end"
          width={280}
          maxHeight={320}
          autoFocus
          onDismiss={(reason) => {
            setOpen(false);
            if (reason === "escape") trigger.current?.focus();
          }}
          role="listbox"
          aria-label={label}
          aria-activedescendant={activeId}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="overflow-y-auto overscroll-contain p-1"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const highlighted = index === active;
            return (
              <button
                key={option.value}
                ref={highlighted ? activeOption : undefined}
                type="button"
                id={`${listId}-opt-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option.value)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                  highlighted || isSelected
                    ? "bg-content/10 text-content"
                    : "text-content hover:bg-content/5"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? (
                  <Check className="size-3.5 shrink-0" strokeWidth={2.25} />
                ) : null}
              </button>
            );
          })}
        </Popover>
      ) : null}
    </div>
  );
}

function SecondaryButton({
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2.5 py-1 text-sm font-medium ${
        danger
          ? "text-red-400 hover:border-red-400/40 hover:bg-red-400/10"
          : "text-content/70 hover:bg-content/10 hover:text-content"
      } disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}
