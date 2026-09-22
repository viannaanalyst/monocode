import { OrchestrationSidebarAgents } from "../../features/orchestration/ui/OrchestrationSidebarAgents";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock,
  Folder,
  GitPullRequest,
  Inbox,
  ListFilter,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  StickyNote,
} from "../../shared/ui/icons";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { type SidebarTabId } from "../../features/settings/model/appearance";
import {
  basename,
  type GitFileDiffKind,
  type GitHistoryCommit,
} from "../../platform/tauri/fs";
import { IS_MAC, MOD } from "../../platform/tauri/platform";
import { resolveModel } from "../../features/sessions/model/models";
import { prettyCwd, prettyParent, projectKey, projectName } from "../../shared/lib/paths";
import type { OpenFileFn } from "../../features/search/model/search";
import { sessionDisplayTitle } from "../../features/sessions/model/session";
import { nextUnseenFinishedSessions } from "../../features/sessions/model/sessionDone";
import {
  orderedSessionActionIds,
  pruneSessionSelection,
  toggleSessionSelection,
} from "../../features/sessions/model/sessionSelection";
import { paneDropFromPoint, setExternalPaneDrop } from "../../features/workspace/model/paneDrop";
import { startDragGhost, type DragGhost } from "../../features/sessions/model/dragGhost";
import type { PaneEdge } from "../../features/workspace/model/layout";
import { suppressTextSelection } from "../../shared/lib/drag";
import {
  compareSessionSummaries,
  filterSessionsByArchive,
  filterSessionsByQuery,
} from "../../features/sessions/data/sessionHistory";
import {
  addSessionToFolder,
  applySessionListDrop,
  buildSessionList,
  createFolderWithSessions,
  dissolveFolder,
  folderAccent,
  folderContaining,
  folderShellFill,
  loadPinnedSessionsCollapsed,
  loadReminderSessionsCollapsed,
  loadSessionFolders,
  mergeFolderSessionSummaries,
  pruneSessionFolders,
  removeSessionFromFolder,
  renameFolder,
  reorderSessionFolders,
  savePinnedSessionsCollapsed,
  saveReminderSessionsCollapsed,
  saveSessionFolders,
  sessionListNavigationIds,
  setFolderCollapsed,
  setFolderColor,
  setFolderCustomColor,
  subscribeSessionFolders,
  ungroupedSessions,
  type SessionFolder,
  type SessionListDropTarget,
} from "../../features/sessions/model/sessionFolders";
import { LIST_PAGE_SIZE, listWindowSize } from "../../shared/lib/listWindow";
import {
  groupSessionsByProject,
  loadCollapsedProjects,
  saveCollapsedProjects,
  subscribeCollapsedProjects,
} from "../../features/sessions/model/sessionProjects";
import {
  filterSessionsByHarness,
  filterSessionsByStatus,
  filterSessionsByTime,
  harnessesInSessions,
  hasActiveSessionFilters,
  loadSessionSidebarFilters,
  saveSessionSidebarFilters,
  type SessionSidebarFilters,
} from "../../features/sessions/model/sessionFilters";
import type { HarnessId, LinkedWorkItem } from "../../features/sessions/model/session";
import type { LiveAgent } from "../../features/sessions/model/liveAgents";
import type { SessionSummary } from "../../features/sessions/data/sessionStore";
import type { SettingsSectionId } from "../../features/settings/model/settings";
import type { InstalledUpdate } from "../model/updateNotice";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
  TAB_GROUP_COLORS,
} from "../../features/workspace/model/tabGroups";
import { useDragResize } from "../../shared/hooks/useDragResize";
import { useGitFileStatuses } from "../../features/source-control/hooks/useGitFileStatuses";
import { useLockOverscroll } from "../../shared/hooks/useLockOverscroll";
import { useSortable } from "../../shared/hooks/useSortable";
import { useTabGroupLogos } from "../../features/projects/hooks/useTabGroupLogos";
import { normalizeHex } from "../../shared/lib/colorUtils";
import {
  projectRailItems,
  sameProjectPath,
  type RecentProject,
} from "../../features/projects/model/recents";
import { ColorPickerPopover, ColorSwatchRow } from "../../shared/ui/ColorPickerPopover";
import { ExplorerMenu, type ExplorerMenuItem } from "../../features/files/ui/ExplorerMenu";
import { SessionHoverCard } from "../../features/sessions/ui/SessionHoverCard";
import type { SessionExportFormat } from "../../features/sessions/model/sessionExport";
import { FileTree } from "../../features/files/ui/FileTree";
import { ModelBrandIcon } from "../../features/sessions/ui/ModelBrandIcon";
import { ProjectRail } from "./ProjectRail";
import { RailAction } from "./RailAction";
import { TerminalSpinner } from "../../features/sessions/ui/TerminalSpinner";
import { DevModeSlot, IconButton, TabVisitNav } from "./TitleBar";
import { ProjectSearch } from "../../features/projects/ui/ProjectSearch";
import { ProjectLogoIcon } from "../../features/projects/ui/ProjectLogoIcon";
import { ProjectMascot } from "../../features/projects/ui/ProjectMascot";
import { Popover } from "../../shared/ui/Popover";
import { SessionFiltersMenu } from "../../features/sessions/ui/SessionFiltersMenu";
import { LinkSessionWorkItemDialog } from "../../features/sessions/ui/LinkSessionWorkItemDialog";
import { sessionReminderPresets } from "../../features/sessions/ui/sessionReminderPresets";
import {
  formatReminderTime,
  reminderTime,
  type SessionReminder,
} from "../../features/sessions/model/sessionReminders";
import { SessionsEmpty } from "../../features/sessions/ui/SessionsEmpty";
import { SidebarUpdateFooter } from "./SidebarUpdate";
import { SourceControl } from "../../features/source-control/ui/SourceControl";
import { t, withShortcut } from "../../i18n";


const MIN_WIDTH = 260;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 260;
const REMINDERS_COLOR = "#f59e0b";

let rememberedWidth = DEFAULT_WIDTH;

type SidebarTab = SidebarTabId;

function projectPathBusy(
  paths: Iterable<string> | undefined,
  cwd: string,
): boolean {
  if (!paths) return false;
  for (const path of paths) {
    if (sameProjectPath(path, cwd)) return true;
  }
  return false;
}

type Props = {
  cwd: string;
  /** Working copy for Changes / explorer git. Falls back to `cwd`. */
  gitCwd?: string;
  open: boolean;
  sessions: SessionSummary[];
  /** Show each session's project name. */
  showProject?: boolean;
  busySessionIds: Set<string>;
  approvalSessionIds: Set<string>;
  activeSessionId?: string;
  /** Open tabs, including blank ones not yet in history. */
  openSessions?: readonly SessionSummary[];
  status: "idle" | "error";
  /** First listing for this project has not arrived yet. */
  pending: boolean;
  onSelectSession: (sessionId: string) => void;
  onSessionNavigationOrder?: (ids: readonly string[]) => void;
  onPrefetchSession?: (sessionId: string) => void;
  onPlaceSessionOnPane?: (
    sessionId: string,
    targetId: string,
    edge: PaneEdge,
  ) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  onArchiveSessions?: (
    sessionIds: readonly string[],
    archived: boolean,
  ) => void;
  onPinSession?: (sessionId: string, pinned: boolean) => void;
  onPinSessions?: (sessionIds: readonly string[], pinned: boolean) => void;
  onSetSessionLinkedWorkItem?: (
    sessionId: string,
    item: LinkedWorkItem | undefined,
  ) => void;
  reminders?: readonly SessionReminder[];
  onSetReminders?: (sessionIds: readonly string[], dueAt: number) => void;
  onCancelReminders?: (sessionIds: readonly string[]) => void;
  onDeleteSession?: (sessionId: string) => void;
  onDeleteSessions?: (sessionIds: readonly string[]) => void;
  onExportSession?: (sessionId: string, format: SessionExportFormat) => void;
  onImportSession?: (cwd: string) => void;
  onOpenNotificationSettings?: (projectPath: string) => void;
  onNewInProject?: (cwd: string) => void;
  onOpenFile: OpenFileFn;
  onOpenTerminal?: (cwd: string) => void;
  onFileMoved?: (from: string, to: string) => void;
  onFileDeleted?: (path: string) => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  filesSearchOpen: boolean;
  onFilesSearchOpenChange: (open: boolean) => void;
  onOpenFilesSearch?: () => void;
  searchFocusToken?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenDiff?: (path: string, kind?: GitFileDiffKind) => void;
  onOpenAllChanges?: () => void;
  onOpenCommit?: (commit: GitHistoryCommit) => void;
  selectedDiffPath?: string;
  selectedDiffKind?: GitFileDiffKind;
  selectedCommitSha?: string;
  textHarness?: HarnessId;
  onShowSourceControl?: () => void;
  recents?: RecentProject[];
  busyProjectPaths?: Iterable<string>;
  liveAgents?: LiveAgent[];
  onSelectAgent?: (sessionId: string) => void;
  onSelectProject?: (path: string) => void;
  onOpenProject?: () => void;
  onRemoveProject?: (path: string, options: { purgeData: boolean }) => void;
  onNew?: () => string | void;
  onNewTerminal?: () => void;
  onSearch?: () => void;
  onOpenInbox?: () => void;
  onOpenInboxItem?: (item: LinkedWorkItem) => void;
  onOpenKanban?: () => void;
  onOpenAutomations?: () => void;
  onOpenNotes?: () => void;
  onGoToFile?: () => void;
  searchActive?: boolean;
  inboxActive?: boolean;
  kanbanActive?: boolean;
  automationsActive?: boolean;
  automationsPaused?: boolean;
  notesActive?: boolean;
  notesEnabled?: boolean;
  projectRailOpen?: boolean;
  unseenFinishedIds?: Set<string>;
  inboxUnseen?: boolean;
  /** Linked GitHub work changed after the session last advanced. */
  linkedSessionUpdateIds?: ReadonlySet<string>;
  settingsOpen?: boolean;
  settingsSection?: SettingsSectionId;
  onOpenSettings?: () => void;
  onSelectSettingsSection?: (section: SettingsSectionId) => void;
  onCloseSettings?: () => void;
  updateNotice?: InstalledUpdate | null;
  onOpenWhatsNew?: (version: string) => void;
  onDismissUpdate?: () => void;
};

function SidebarComponent({
  cwd,
  gitCwd,
  open,
  sessions,
  showProject = false,
  busySessionIds,
  approvalSessionIds,
  activeSessionId,
  openSessions = [],
  status,
  pending,
  onSelectSession,
  onSessionNavigationOrder,
  onPrefetchSession,
  onPlaceSessionOnPane,
  onRenameSession,
  onArchiveSession,
  onArchiveSessions,
  onPinSession,
  onPinSessions,
  onSetSessionLinkedWorkItem,
  reminders = [],
  onSetReminders,
  onCancelReminders,
  onDeleteSession,
  onDeleteSessions,
  onExportSession,
  onImportSession,
  onOpenNotificationSettings,
  onNewInProject,
  onOpenFile,
  onOpenTerminal,
  onFileMoved,
  onFileDeleted,
  tab,
  filesSearchOpen,
  onFilesSearchOpenChange,
  onOpenFilesSearch,
  searchFocusToken = 0,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onOpenDiff,
  onOpenAllChanges,
  onOpenCommit,
  selectedDiffPath,
  selectedDiffKind,
  selectedCommitSha,
  textHarness,
  onShowSourceControl,
  recents = [],
  busyProjectPaths,
  liveAgents = [],
  onSelectAgent,
  onSelectProject,
  onOpenProject,
  onRemoveProject,
  onNew,
  onSearch,
  onOpenInbox,
  onOpenInboxItem,
  onOpenKanban,
  onOpenAutomations,
  onOpenNotes,
  onGoToFile,
  searchActive = false,
  inboxActive = false,
  kanbanActive = false,
  automationsActive = false,
  automationsPaused = false,
  notesActive = false,
  notesEnabled = true,
  projectRailOpen = true,
  unseenFinishedIds: unseenFinishedIdsProp,
  inboxUnseen = false,
  linkedSessionUpdateIds = new Set(),
  settingsOpen = false,
  settingsSection = "general",
  onOpenSettings,
  onSelectSettingsSection,
  onCloseSettings,
  updateNotice = null,
  onOpenWhatsNew,
  onDismissUpdate,
}: Props) {
  const gitRoot = gitCwd || cwd;
  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.5)),
    defaultWidth: DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (next) => {
      rememberedWidth = next;
    },
  });
  const [now, setNow] = useState(() => Date.now());
  const sessionsLock = useLockOverscroll<HTMLDivElement>();
  const sessionsScrollRef = useRef<HTMLDivElement>(null);
  const [sessionMenu, setSessionMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);
  const [linkingSession, setLinkingSession] = useState<SessionSummary | null>(
    null,
  );
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const contextSelectionRef = useRef(false);
  const [folderMenu, setFolderMenu] = useState<{
    x: number;
    y: number;
    folderId: string;
  } | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [sessionFolders, setSessionFolders] = useState<SessionFolder[]>(() =>
    loadSessionFolders(cwd),
  );
  const [collapsedProjects, setCollapsedProjects] = useState(
    loadCollapsedProjects,
  );
  const [pinnedSessionsCollapsed, setPinnedSessionsCollapsed] = useState(() =>
    loadPinnedSessionsCollapsed(cwd),
  );
  const [reminderSessionsCollapsed, setReminderSessionsCollapsed] = useState(
    () => loadReminderSessionsCollapsed(cwd),
  );
  const [sessionDrop, setSessionDrop] = useState<SessionListDropTarget | null>(
    null,
  );
  const [sessionFilters, setSessionFilters] = useState(
    loadSessionSidebarFilters,
  );
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionListLimit, setSessionListLimit] = useState(LIST_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingFolderSessionIds = useRef(new Set<string>());
  const busyIdsRef = useRef(busySessionIds);
  const focusedSessionIdRef = useRef(activeSessionId);
  const unseenFinishedLocalRef = useRef<Set<string>>(new Set());
  if (
    busyIdsRef.current !== busySessionIds ||
    focusedSessionIdRef.current !== activeSessionId
  ) {
    unseenFinishedLocalRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyIdsRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedLocalRef.current,
      focusedSessionId: activeSessionId,
    });
    busyIdsRef.current = busySessionIds;
    focusedSessionIdRef.current = activeSessionId;
  }
  const unseenFinishedIds =
    unseenFinishedIdsProp ?? unseenFinishedLocalRef.current;
  // Revisits render straight from cache, so this is only ever true the first
  // time a project is opened.
  const pendingFirstLoad = pending && sessions.length === 0;
  const listedSessions = mergeFolderSessionSummaries(
    sessions,
    openSessions,
    sessionFolders,
  ).filter((session) => !session.orchestrationLeadId);
  const visibleSessions = [
    ...filterSessionsByQuery(
      filterSessionsByStatus(
        filterSessionsByTime(
          filterSessionsByHarness(
            filterSessionsByArchive(
              listedSessions,
              sessionFilters.showArchived,
            ),
            sessionFilters.hiddenHarnesses,
          ),
          sessionFilters.time,
          now,
        ),
        sessionFilters.status,
        busySessionIds,
        approvalSessionIds,
        unseenFinishedIds,
      ),
      searchQuery,
    ),
  ].sort(compareSessionSummaries);
  // The project tree groups every project's conversations, pinned ones first.
  const pinnedInTree = showProject
    ? visibleSessions.filter((session) => session.pinned)
    : [];
  const projectGroups = showProject
    ? groupSessionsByProject(
        visibleSessions.filter((session) => !session.pinned),
      )
    : [];
  const toggleProjectCollapsed = (key: string) => {
    setCollapsedProjects((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsedProjects(next);
      return next;
    });
  };
  const filtersActive = hasActiveSessionFilters(sessionFilters);
  const searchNarrowed = Boolean(searchQuery.trim());
  // Summaries for the whole project stay in `sessions` so filters still work.
  // Folders sit above the ungrouped list. Only a page of ungrouped cards
  // mounts; the sentinel below asks for the next page.
  const reminderIds = new Set(reminders.map((reminder) => reminder.sessionId));
  const reminderGroup = {
    sessionIds: [...reminders]
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((reminder) => reminder.sessionId),
    collapsed: reminderSessionsCollapsed,
  };
  const ungroupedVisible = ungroupedSessions(
    visibleSessions,
    sessionFolders,
  ).filter((session) => !reminderIds.has(session.id));
  const activeUngroupedIndex = ungroupedVisible.findIndex(
    (session) => session.id === activeSessionId,
  );
  const shownUngroupedCount = listWindowSize(
    ungroupedVisible.length,
    sessionListLimit,
    activeUngroupedIndex,
  );
  const shownUngrouped = ungroupedVisible.slice(0, shownUngroupedCount);
  const fullSessionListEntries = buildSessionList(
    visibleSessions,
    sessionFolders,
    ungroupedVisible,
    pinnedSessionsCollapsed,
    reminderGroup,
  );
  const sessionListEntries = buildSessionList(
    visibleSessions,
    sessionFolders,
    shownUngrouped,
    pinnedSessionsCollapsed,
    reminderGroup,
  );
  const sessionNavigationIds = sessionListNavigationIds(
    fullSessionListEntries,
    searchNarrowed,
  );
  const sessionNavigationKey = sessionNavigationIds.join("\0");
  useEffect(() => {
    onSessionNavigationOrder?.(sessionNavigationIds);
  }, [onSessionNavigationOrder, sessionNavigationKey]);
  useEffect(() => {
    if (tab !== "sessions") {
      setSelectedSessionIds(new Set());
      return;
    }
    const available = new Set(sessionNavigationIds);
    setSelectedSessionIds((current) =>
      pruneSessionSelection(current, available),
    );
  }, [cwd, tab, sessionNavigationKey]);
  const hasMoreSessions = shownUngroupedCount < ungroupedVisible.length;
  const sessionListKey = `${cwd}\0${sessionFilters.showArchived}\0${sessionFilters.time}\0${sessionFilters.hiddenHarnesses.join(",")}\0${sessionFilters.status.working}\0${sessionFilters.status.needsApproval}\0${sessionFilters.status.done}\0${searchQuery}`;
  const sessionHarnesses = harnessesInSessions(sessions);
  const narrowedByUser = searchNarrowed || filtersActive;
  const visibleFolderIds = sessionListEntries.flatMap((entry) =>
    entry.kind === "folder" ? [entry.folder.id] : [],
  );
  const folderSortable = useSortable(
    visibleFolderIds,
    (ids) => {
      setSessionFolders((current) => {
        const next = reorderSessionFolders(current, ids);
        if (next === current) return current;
        saveSessionFolders(cwd, next);
        return next;
      });
    },
    { axis: "y" },
  );
  const showProjectRail = Boolean(onSelectProject && onOpenProject);
  // The project rail is the sidebar now: projects expand into their sessions.
  const railVisible = showProjectRail && (open || settingsOpen);
  const showSidebarFooter = !projectRailOpen;
  // The wide session list is gone; sessions live inside each project.
  const sidebarVisible = false;
  const gitStatuses = useGitFileStatuses(gitRoot, open && tab === "files");

  useEffect(() => {
    setSessionListLimit(LIST_PAGE_SIZE);
    const scroller = sessionsScrollRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [sessionListKey]);

  useEffect(() => {
    if (tab !== "sessions" || !hasMoreSessions) return;
    const sentinel = loadMoreRef.current;
    const root = sessionsScrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setSessionListLimit((current) => current + LIST_PAGE_SIZE);
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, hasMoreSessions, shownUngroupedCount]);

  useEffect(() => {
    setSessionFolders(loadSessionFolders(cwd));
    setPinnedSessionsCollapsed(loadPinnedSessionsCollapsed(cwd));
    setReminderSessionsCollapsed(loadReminderSessionsCollapsed(cwd));
    setRenamingFolderId(null);
    setFolderMenu(null);
    setSessionDrop(null);
    pendingFolderSessionIds.current.clear();
  }, [cwd]);

  useEffect(
    () =>
      subscribeSessionFolders(cwd, () => {
        setSessionFolders(loadSessionFolders(cwd));
      }),
    [cwd],
  );

  useEffect(() => subscribeCollapsedProjects(() => {
    setCollapsedProjects(loadCollapsedProjects());
  }), []);

  useEffect(() => {
    if (pending || status === "error") return;
    const known = new Set(sessions.map((session) => session.id));
    for (const session of openSessions) known.add(session.id);
    if (activeSessionId) known.add(activeSessionId);
    for (const id of pendingFolderSessionIds.current) {
      known.add(id);
      if (
        sessions.some((session) => session.id === id) ||
        openSessions.some((session) => session.id === id)
      ) {
        pendingFolderSessionIds.current.delete(id);
      }
    }
    setSessionFolders((current) => {
      const next = pruneSessionFolders(current, known);
      if (next === current) return current;
      saveSessionFolders(cwd, next);
      return next;
    });
  }, [activeSessionId, cwd, openSessions, pending, sessions, status]);

  useEffect(() => {
    if (tab !== "sessions") return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (tab !== "sessions") {
      setFilterMenu(null);
      setSearchQuery("");
    }
  }, [tab]);

  useEffect(() => {
    if (!sessionMenu && !folderMenu && !filterMenu) return;
    const onScroll = () => {
      closeSessionMenu();
      setFolderMenu(null);
      setFilterMenu(null);
    };
    const scrollParent = sessionsScrollRef.current ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [sessionMenu, folderMenu, filterMenu]);

  useEffect(() => {
    if (selectedSessionIds.size === 0) return;
    const clear = () => {
      contextSelectionRef.current = false;
      setSelectedSessionIds(new Set());
      setSessionMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clear();
    };
    // A pointer landing off the cards drops the selection; a menu acting on
    // it stays open, and the cards handle their own clicks.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const el = target instanceof Element ? target : null;
      if (el?.closest("[data-session-card],[data-popover-side]")) return;
      clear();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selectedSessionIds.size]);

  const commitSessionFolders = (next: SessionFolder[]) => {
    setSessionFolders(next);
    saveSessionFolders(cwd, next);
  };

  const onNewInFolder = (folderId: string) => {
    const sessionId = onNew?.();
    if (!sessionId) return;
    pendingFolderSessionIds.current.add(sessionId);
    setSearchQuery("");
    setSessionFolders((current) => {
      const next = setFolderCollapsed(
        addSessionToFolder(current, folderId, sessionId),
        folderId,
        false,
      );
      saveSessionFolders(cwd, next);
      return next;
    });
  };

  const menuSessionIds = sessionMenu
    ? orderedSessionActionIds(
        sessionMenu.sessionId,
        selectedSessionIds,
        sessionNavigationIds,
      )
    : [];
  const menuSessions = menuSessionIds.flatMap((sessionId) => {
    const session = listedSessions.find((entry) => entry.id === sessionId);
    return session ? [session] : [];
  });
  const multipleMenuSessions = menuSessionIds.length > 1;
  const menuReminderTimes = [
    ...new Set(
      reminders
        .filter((reminder) => menuSessionIds.includes(reminder.sessionId))
        .map((reminder) => reminder.dueAt),
    ),
  ];
  const allMenuSessionsPinned =
    menuSessions.length > 0 && menuSessions.every((session) => session.pinned);
  const allMenuSessionsArchived =
    menuSessions.length > 0 &&
    menuSessions.every((session) => session.archived);
  const menuSessionFolder =
    menuSessionIds.length === 1
      ? folderContaining(sessionFolders, menuSessionIds[0])
      : undefined;
  const anyMenuSessionFoldered = menuSessionIds.some((sessionId) =>
    sessionFolders.some((folder) => folder.sessionIds.includes(sessionId)),
  );
  const canRemoveMenuSessionsFromFolders = multipleMenuSessions
    ? anyMenuSessionFoldered
    : !!menuSessionFolder;
  const menuFolder = folderMenu
    ? sessionFolders.find((folder) => folder.id === folderMenu.folderId)
    : undefined;
  const folderMenuItems: ExplorerMenuItem[] = [
    { kind: "item", id: "rename", label: t("Rename"), shortcut: "F2" },
    { kind: "sep" },
    { kind: "item", id: "ungroup", label: t("Ungroup") },
  ];
  const sessionMenuItems: ExplorerMenuItem[] = [
    ...(onCancelReminders && menuReminderTimes.length > 0
      ? [
          {
            kind: "item" as const,
            id: "reminder:cancel",
            label: t("Cancel reminder"),
            description:
              menuReminderTimes.length === 1
                ? formatReminderTime(menuReminderTimes[0])
                : t("Multiple reminder times"),
          },
          { kind: "sep" as const },
        ]
      : []),
    ...(onPinSession || onPinSessions
      ? [
          {
            kind: "item" as const,
            id: "pin",
            label: allMenuSessionsPinned ? t("Unpin") : t("Pin"),
          },
        ]
      : []),
    ...(!multipleMenuSessions && onRenameSession
      ? [
          {
            kind: "item" as const,
            id: "rename",
            label: t("Rename"),
            shortcut: "F2",
          },
        ]
      : []),
    ...(!multipleMenuSessions && onSetSessionLinkedWorkItem
      ? [
          {
            kind: "item" as const,
            id: "link-work-item",
            label: menuSessions[0]?.linkedWorkItem
              ? t("Edit GitHub issue or PR link…")
              : t("Link GitHub issue or PR…"),
          },
        ]
      : []),
    {
      kind: "item",
      id: "reminder",
      label: t("Remind me"),
      disabled: !onSetReminders,
      submenu: sessionReminderPresets(),
    },
    { kind: "sep" as const },
    { kind: "item" as const, id: "folder-new", label: t("New folder") },
    ...(sessionFolders.length > 0 ? [{ kind: "sep" as const }] : []),
    ...sessionFolders.map((folder) => ({
      kind: "item" as const,
      id: `folder-add:${folder.id}`,
      label: t("Add to {name}", { name: folder.name }),
      checked:
        menuSessionIds.length > 0 &&
        menuSessionIds.every((sessionId) =>
          folder.sessionIds.includes(sessionId),
        ),
    })),
    ...(canRemoveMenuSessionsFromFolders
      ? [
          {
            kind: "item" as const,
            id: "folder-remove",
            label: multipleMenuSessions
              ? t("Remove from folders") : t("Remove from folder"),
          },
        ]
      : []),
    ...(onArchiveSession ||
    onArchiveSessions ||
    onDeleteSession ||
    onDeleteSessions
      ? [
          { kind: "sep" as const },
          ...(onArchiveSession || onArchiveSessions
            ? [
                {
                  kind: "item" as const,
                  id: "archive",
                  label: allMenuSessionsArchived ? t("Unarchive") : t("Archive"),
                },
              ]
            : []),
          ...(onDeleteSession || onDeleteSessions
            ? [
                {
                  kind: "item" as const,
                  id: "delete",
                  label: t("Delete"),
                  shortcut: "⌫",
                  danger: true,
                },
              ]
            : []),
        ]
      : []),
    ...(!multipleMenuSessions && onExportSession
      ? [
          { kind: "sep" as const },
          {
            kind: "item" as const,
            id: "export-markdown",
            label: t("Export as Markdown"),
          },
          {
            kind: "item" as const,
            id: "export-json",
            label: t("Export as JSON"),
          },
        ]
      : []),
  ];

  const onSessionContextMenu = (
    sessionId: string,
    e: ReactMouseEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    contextSelectionRef.current = !selectedSessionIds.has(sessionId);
    if (contextSelectionRef.current) {
      setSelectedSessionIds(new Set([sessionId]));
    }
    setFilterMenu(null);
    setFolderMenu(null);
    setSessionMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  const closeSessionMenu = () => {
    setSessionMenu(null);
    if (!contextSelectionRef.current) return;
    contextSelectionRef.current = false;
    setSelectedSessionIds(new Set());
  };

  const onFolderContextMenu = (
    folderId: string,
    e: ReactMouseEvent<HTMLElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setFilterMenu(null);
    setSessionMenu(null);
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const onSessionMenuPick = (id: string) => {
    if (!sessionMenu) return;
    const sessionId = sessionMenu.sessionId;
    const sessionIds = menuSessionIds;
    const archived = allMenuSessionsArchived;
    const pinned = allMenuSessionsPinned;
    closeSessionMenu();
    if (id === "reminder:cancel") {
      onCancelReminders?.(sessionIds);
      return;
    }
    if (id.startsWith("reminder:")) {
      const dueAt = reminderTime(id);
      if (dueAt != null) {
        setReminderSessionsCollapsed(false);
        saveReminderSessionsCollapsed(cwd, false);
        onSetReminders?.(sessionIds, dueAt);
      }
      return;
    }
    if (id === "pin") {
      if (sessionIds.length > 1 && onPinSessions) {
        onPinSessions(sessionIds, !pinned);
      } else {
        for (const id of sessionIds) onPinSession?.(id, !pinned);
      }
      return;
    }
    if (id === "rename") {
      setRenamingSessionId(sessionId);
      return;
    }
    if (id === "link-work-item") {
      setLinkingSession(menuSessions[0] ?? null);
      return;
    }
    if (id === "folder-new") {
      const { folders, id: createdId } = createFolderWithSessions(
        sessionFolders,
        sessionIds,
      );
      if (!createdId) return;
      commitSessionFolders(folders);
      setRenamingFolderId(createdId);
      return;
    }
    if (id.startsWith("folder-add:")) {
      const folderId = id.slice("folder-add:".length);
      const folders = sessionIds.reduce(
        (current, id) => addSessionToFolder(current, folderId, id),
        sessionFolders,
      );
      commitSessionFolders(setFolderCollapsed(folders, folderId, false));
      return;
    }
    if (id === "folder-remove") {
      commitSessionFolders(
        sessionIds.reduce(
          (current, id) => removeSessionFromFolder(current, id),
          sessionFolders,
        ),
      );
      return;
    }
    if (id === "archive") {
      if (sessionIds.length > 1 && onArchiveSessions) {
        onArchiveSessions(sessionIds, !archived);
      } else {
        for (const id of sessionIds) onArchiveSession?.(id, !archived);
      }
      return;
    }
    if (id === "delete") {
      if (sessionIds.length > 1 && onDeleteSessions) {
        onDeleteSessions(sessionIds);
      } else {
        for (const id of sessionIds) onDeleteSession?.(id);
      }
      return;
    }
    if (id === "export-markdown" || id === "export-json") {
      onExportSession?.(sessionId, id === "export-json" ? "json" : "markdown");
    }
  };

  const onFolderMenuPick = (id: string) => {
    if (!folderMenu) return;
    const folderId = folderMenu.folderId;
    setFolderMenu(null);
    if (id === "rename") {
      setRenamingFolderId(folderId);
      return;
    }
    if (id === "ungroup") {
      commitSessionFolders(dissolveFolder(sessionFolders, folderId));
    }
  };

  const onFolderColorChange = (colorIndex: number | null) => {
    if (!folderMenu) return;
    commitSessionFolders(
      setFolderColor(sessionFolders, folderMenu.folderId, colorIndex),
    );
  };

  const onFolderCustomColorChange = (color: string) => {
    if (!folderMenu) return;
    commitSessionFolders(
      setFolderCustomColor(sessionFolders, folderMenu.folderId, color),
    );
  };

  const onSessionListDrop = (
    draggedId: string,
    target: SessionListDropTarget,
  ) => {
    const { folders, createdId } = applySessionListDrop(
      sessionFolders,
      draggedId,
      target,
    );
    if (folders === sessionFolders) return;
    commitSessionFolders(folders);
    if (createdId) setRenamingFolderId(createdId);
  };

  const isSessionDrop = (kind: "folder" | "session", id: string) =>
    sessionDrop?.kind === kind && sessionDrop.id === id;

  const onSessionCardSelect = (
    sessionId: string,
    event: { shiftKey: boolean },
  ) => {
    if (event.shiftKey) {
      contextSelectionRef.current = false;
      setSessionMenu(null);
      setSelectedSessionIds((current) =>
        toggleSessionSelection(current, sessionId),
      );
      return;
    }
    setSelectedSessionIds(new Set());
    onSelectSession(sessionId);
  };

  const renderSessionCard = (session: SessionSummary, compact = false) =>
    renamingSessionId === session.id && onRenameSession ? (
      <SessionRenameRow
        session={session}
        isActive={session.id === activeSessionId}
        needsApproval={approvalSessionIds.has(session.id)}
        onCommit={(title) => {
          onRenameSession(session.id, title);
          setRenamingSessionId(null);
        }}
        onCancel={() => setRenamingSessionId(null)}
      />
    ) : (
      <SessionCard
        session={session}
        isActive={session.id === activeSessionId}
        isSelected={selectedSessionIds.has(session.id)}
        busy={busySessionIds.has(session.id)}
        done={unseenFinishedIds.has(session.id)}
        linkedUpdate={linkedSessionUpdateIds.has(session.id)}
        needsApproval={approvalSessionIds.has(session.id)}
        dropTarget={isSessionDrop("session", session.id)}
        compact={compact}
        showProject={showProject}
        now={now}
        onSelect={onSessionCardSelect}
        onOpenWorkItem={onOpenInboxItem}
        onPrefetch={onPrefetchSession}
        onPlaceOnPane={onPlaceSessionOnPane}
        onListDrop={reminderIds.has(session.id) ? undefined : onSessionListDrop}
        onListDropTargetChange={setSessionDrop}
        onContextMenu={(e) => onSessionContextMenu(session.id, e)}
        onArchive={
          onArchiveSession
            ? () => onArchiveSession(session.id, !session.archived)
            : undefined
        }
        onRename={
          onRenameSession ? () => setRenamingSessionId(session.id) : undefined
        }
        onDelete={
          onDeleteSession ? () => onDeleteSession(session.id) : undefined
        }
      />
    );

  const onSessionFiltersChange = (next: SessionSidebarFilters) => {
    setSessionFilters(next);
    saveSessionSidebarFilters(next);
  };

  const onFilterButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (filterMenu) {
      setFilterMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setSessionMenu(null);
    setFolderMenu(null);
    setFilterMenu({
      x: rect.right - 228,
      y: rect.bottom + 2,
    });
  };

  const sessionSearchInput = (
    <input
      ref={searchInputRef}
      type="text"
      value={searchQuery}
      placeholder={t("Search conversations...")}
      aria-label={t("Search conversations")}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(event) => setSearchQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (searchQuery) {
          setSearchQuery("");
        }
      }}
      className="h-full w-full min-w-0 rounded-md bg-transparent py-0 pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/35"
    />
  );

  const sidebarContent = (
    <aside
      ref={resize.setPaneRef}
      className="body-glass relative flex h-full min-h-0 shrink-0 flex-col border-r border-content/10"
    >
      {railVisible ? (
        <>
          <div
            className="flex h-10 shrink-0 select-none items-center gap-1 border-b border-content/10 pl-3 pr-1.5"
            data-tauri-drag-region="deep"
          >
            <div className="min-w-0 flex-1" />
            <WorkspaceTitleActions
              cwd={cwd}
              recents={recents}
              onSearch={onGoToFile}
              onNew={onNew}
              onNewInProject={onNewInProject}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="flex h-10 shrink-0 select-none items-center border-b border-content/10 pr-1.5"
            data-tauri-drag-region="deep"
          >
            {IS_MAC ? <div className="w-[78px] shrink-0" /> : null}
            <DevModeSlot />
            <TabVisitNav
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onGoBack={onGoBack}
              onGoForward={onGoForward}
            />
          </div>
          {onSelectProject ? (
            <SidebarProjectPicker
              cwd={cwd}
              recents={recents}
              busy={projectPathBusy(busyProjectPaths, cwd)}
              onSelectProject={onSelectProject}
              onOpenProject={onOpenProject}
              onNew={onNew}
              onSearch={onSearch}
              onOpenInbox={onOpenInbox}
              onOpenNotes={notesEnabled ? onOpenNotes : undefined}
              searchActive={searchActive}
              inboxActive={inboxActive}
              notesActive={notesActive}
              inboxUnseen={inboxUnseen}
            />
          ) : null}
        </>
      )}
      <>
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
            tab === "files" ? "" : "hidden"
          }`}
        >
          {filesSearchOpen ? (
            <ProjectSearch
              cwd={gitRoot}
              focusToken={searchFocusToken}
              onOpenFile={onOpenFile}
              onClose={() => onFilesSearchOpenChange(false)}
            />
          ) : cwd && cwd !== "~" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <FileTree
                key={gitRoot}
                cwd={gitRoot}
                onOpenFile={onOpenFile}
                onOpenTerminal={onOpenTerminal}
                onFileMoved={onFileMoved}
                onFileDeleted={onFileDeleted}
                onSearch={onOpenFilesSearch}
                gitStatuses={gitStatuses}
                sourceControlActive={open && tab === "changes"}
                onShowSourceControl={onShowSourceControl}
              />
            </div>
          ) : (
            <p className="px-3 py-2 text-[12px] text-content/50">
              {t("No project folder")}
            </p>
          )}
        </div>
        {tab === "sessions" && cwd && cwd !== "~" ? (
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-content/10 px-2">
            <div className="relative flex h-7 min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-2 size-3.5 shrink-0 opacity-50" />
              {sessionSearchInput}
            </div>
            <SessionsHeaderButton
              label={t("Filter sessions")}
              active={filtersActive}
              open={!!filterMenu}
              hasPopup
              onClick={onFilterButtonClick}
            >
              <ListFilter className="size-3.5" strokeWidth={1.75} />
            </SessionsHeaderButton>
          </div>
        ) : null}
        <div
          ref={(el) => {
            sessionsLock(el);
            sessionsScrollRef.current = el;
          }}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-none ${
            tab === "sessions" ? "" : "hidden"
          }`}
        >
          {!cwd || cwd === "~" ? (
            <p className="px-3 py-2 text-[12px] text-content/50">
              {t("No project folder")}
            </p>
          ) : (
            <div>
              {/*
              A project's first load stays deliberately blank. The listing is
              served from a covering index and resolves within a frame or two,
              so a placeholder only ever flashed — reading as a glitch rather
              than as progress. This is checked before the empty state so that
              cannot claim "No sessions yet" before the rows have landed.
            */}
              {pendingFirstLoad ? null : status === "error" &&
                sessions.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-content/50">{t("Couldn’t load sessions")}</p>
              ) : visibleSessions.length === 0 ? (
                // A narrowed-down result is a transient answer to what the user
                // just typed, so it stays a quiet line of text. Only the genuine
                // "this project has nothing in it" case earns the illustration.
                narrowedByUser ? (
                  <p className="px-3 py-2 text-[12px] text-content/50">
                    {searchNarrowed
                      ? t("No matching sessions")
                      : t("No sessions match these filters")}
                  </p>
                ) : (
                  <SessionsEmpty message={t("Sessions you start will show up here")} />
                )
              ) : showProject ? (
                <ul className="flex flex-col gap-0.5 p-1.5">
                  {pinnedInTree.length > 0 ? (
                    <li className="mb-1.5">
                      <div className="overflow-hidden rounded-md bg-content/5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-content/50">
                          <Pin className="size-3.5" strokeWidth={1.75} />
                          <span className="truncate">{t("Pinned")}</span>
                          <span className="ml-auto shrink-0 text-2xs tabular-nums text-content/40">
                            {pinnedInTree.length}
                          </span>
                        </div>
                        <ul className="flex flex-col gap-px p-1">
                          {pinnedInTree.map((session) => (
                            <li key={session.id}>
                              {renderSessionCard(session, true)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ) : null}
                  {projectGroups.map((group) => {
                    const collapsed = collapsedProjects.has(group.key);
                    return (
                      <li key={group.key} className="mb-1">
                        <button
                          type="button"
                          data-no-drag
                          data-tauri-drag-region="false"
                          data-no-tooltip
                          aria-expanded={!collapsed}
                          onClick={() => toggleProjectCollapsed(group.key)}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-content/5"
                        >
                          {collapsed ? (
                            <ChevronRight
                              className="size-3.5 shrink-0 text-content/40"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <ChevronDown
                              className="size-3.5 shrink-0 text-content/40"
                              strokeWidth={1.75}
                            />
                          )}
                          <Folder
                            className="size-3.5 shrink-0 text-content/45"
                            strokeWidth={1.75}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-content/80">
                            {group.name}
                          </span>
                          <span className="shrink-0 text-2xs tabular-nums text-content/40">
                            {group.sessions.length}
                          </span>
                        </button>
                        {collapsed ? null : (
                          <ul className="flex flex-col gap-px p-1">
                            {group.sessions.map((session) => (
                              <li key={session.id}>
                                {renderSessionCard(session, true)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="flex flex-col gap-0.5 p-1.5">
                  {sessionListEntries.map((entry, index) => {
                    if (entry.kind === "pinned" || entry.kind === "reminders") {
                      const isReminders = entry.kind === "reminders";
                      const expanded = searchNarrowed || !entry.collapsed;
                      const beforeUngrouped =
                        sessionListEntries[index + 1]?.kind === "session";
                      return (
                        <li
                          key={`${entry.kind}-sessions`}
                          data-pinned-sessions={isReminders ? undefined : ""}
                          data-reminder-sessions={isReminders ? "" : undefined}
                          className={`relative ${
                            expanded || beforeUngrouped ? "mb-1.5" : ""
                          }`}
                        >
                          <div className="overflow-hidden rounded-md bg-content/5">
                            <FolderRow
                              folder={
                                isReminders
                                  ? {
                                      name: t("Reminders"),
                                      customColor: REMINDERS_COLOR,
                                    }
                                  : { name: t("Pinned") }
                              }
                              sessions={entry.sessions}
                              expanded={expanded}
                              dropTarget={false}
                              busy={entry.sessions.some((session) =>
                                busySessionIds.has(session.id),
                              )}
                              done={entry.sessions.some((session) =>
                                unseenFinishedIds.has(session.id),
                              )}
                              needsApproval={entry.sessions.some((session) =>
                                approvalSessionIds.has(session.id),
                              )}
                              groupIcon={
                                isReminders ? (
                                  <Clock
                                    className="size-3.5"
                                    strokeWidth={1.75}
                                  />
                                ) : (
                                  <Pin
                                    className="size-3.5 text-content"
                                    strokeWidth={1.75}
                                  />
                                )
                              }
                              onToggle={() => {
                                if (searchNarrowed) return;
                                const collapsed = !entry.collapsed;
                                if (isReminders) {
                                  setReminderSessionsCollapsed(collapsed);
                                  saveReminderSessionsCollapsed(cwd, collapsed);
                                  return;
                                }
                                setPinnedSessionsCollapsed(collapsed);
                                savePinnedSessionsCollapsed(cwd, collapsed);
                              }}
                            />
                            {expanded ? (
                              <ul className="flex flex-col gap-px p-1">
                                {entry.sessions.map((session) => (
                                  <li key={session.id}>
                                    {renderSessionCard(session, true)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </li>
                      );
                    }
                    if (entry.kind === "folder") {
                      const expanded =
                        searchNarrowed || !entry.folder.collapsed;
                      const shellFill = folderShellFill(
                        entry.folder.colorIndex,
                        entry.folder.customColor,
                      );
                      const folderIndex = visibleFolderIds.indexOf(
                        entry.folder.id,
                      );
                      const beforeUngrouped =
                        sessionListEntries[index + 1]?.kind === "session";
                      const draggingFolder =
                        folderSortable.draggingId === entry.folder.id;
                      const showFolderDropStart =
                        folderSortable.draggingId &&
                        folderSortable.toIndex === folderIndex &&
                        folderSortable.fromIndex !== null &&
                        folderSortable.toIndex < folderSortable.fromIndex;
                      const showFolderDropEnd =
                        folderSortable.draggingId &&
                        folderSortable.toIndex === folderIndex &&
                        folderSortable.fromIndex !== null &&
                        folderSortable.toIndex > folderSortable.fromIndex;
                      return (
                        <li
                          key={entry.folder.id}
                          ref={(el) =>
                            folderSortable.setItemRef(entry.folder.id, el)
                          }
                          data-session-folder={entry.folder.id}
                          className={`relative ${
                            expanded || beforeUngrouped ? "mb-1.5" : ""
                          } ${draggingFolder ? "opacity-40" : ""}`}
                        >
                          {showFolderDropStart ? (
                            <div className="pointer-events-none absolute inset-x-1 top-0 z-20 h-0.5 rounded-full bg-accent" />
                          ) : null}
                          {showFolderDropEnd ? (
                            <div className="pointer-events-none absolute inset-x-1 bottom-0 z-20 h-0.5 rounded-full bg-accent" />
                          ) : null}
                          <div
                            className={`overflow-hidden rounded-md ${
                              shellFill ? "" : "bg-content/5"
                            }`}
                            style={
                              shellFill ? { background: shellFill } : undefined
                            }
                          >
                            {renamingFolderId === entry.folder.id ? (
                              <FolderRenameRow
                                folder={entry.folder}
                                memberCount={entry.sessions.length}
                                dropTarget={isSessionDrop(
                                  "folder",
                                  entry.folder.id,
                                )}
                                onCommit={(name) => {
                                  commitSessionFolders(
                                    renameFolder(
                                      sessionFolders,
                                      entry.folder.id,
                                      name,
                                    ),
                                  );
                                  setRenamingFolderId(null);
                                }}
                                onCancel={() => setRenamingFolderId(null)}
                              />
                            ) : (
                              <FolderRow
                                folder={entry.folder}
                                sessions={entry.sessions}
                                expanded={expanded}
                                dropTarget={isSessionDrop(
                                  "folder",
                                  entry.folder.id,
                                )}
                                busy={entry.sessions.some((session) =>
                                  busySessionIds.has(session.id),
                                )}
                                done={entry.sessions.some((session) =>
                                  unseenFinishedIds.has(session.id),
                                )}
                                needsApproval={entry.sessions.some((session) =>
                                  approvalSessionIds.has(session.id),
                                )}
                                onPointerDown={(event) =>
                                  folderSortable.onItemPointerDown(
                                    entry.folder.id,
                                    event,
                                  )
                                }
                                onToggle={() => {
                                  if (folderSortable.consumeClick()) return;
                                  if (searchNarrowed) return;
                                  commitSessionFolders(
                                    setFolderCollapsed(
                                      sessionFolders,
                                      entry.folder.id,
                                      !entry.folder.collapsed,
                                    ),
                                  );
                                }}
                                onContextMenu={(event) =>
                                  onFolderContextMenu(entry.folder.id, event)
                                }
                                onRename={() =>
                                  setRenamingFolderId(entry.folder.id)
                                }
                              />
                            )}
                            {expanded ? (
                              <>
                                <ul className="flex flex-col gap-px p-1">
                                  {entry.sessions.map((session) => (
                                    <li key={session.id}>
                                      {renderSessionCard(session, true)}
                                    </li>
                                  ))}
                                </ul>
                                {onNew ? (
                                  <div className="border-t border-content/10 p-1">
                                    <button
                                      type="button"
                                      data-no-drag
                                      data-tauri-drag-region="false"
                                      data-no-tooltip
                                      aria-label={t("New session")}
                                      onClick={() =>
                                        onNewInFolder(entry.folder.id)
                                      }
                                      className="relative flex w-full items-center gap-1 rounded-md border border-transparent px-2.5 py-1.5 text-left text-content/45 hover:bg-content/10 hover:text-content"
                                    >
                                      <Plus
                                        className="size-3.5 shrink-0"
                                        strokeWidth={1.75}
                                      />
                                      <span className="text-sm font-medium leading-snug">
                                        {t("New session")}
                                      </span>
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={entry.session.id}>
                        {renderSessionCard(entry.session)}
                      </li>
                    );
                  })}
                  {hasMoreSessions ? (
                    <li
                      ref={loadMoreRef}
                      aria-hidden
                      className="h-px list-none"
                    />
                  ) : null}
                </ul>
              )}
            </div>
          )}
        </div>
        {tab === "changes" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SourceControl
              cwd={gitRoot}
              enabled={open}
              textHarness={textHarness}
              selectedPath={selectedDiffPath}
              selectedKind={selectedDiffKind}
              selectedSha={selectedCommitSha}
              onOpenFile={
                onOpenDiff ??
                ((path) => onOpenFile(path, undefined, { exact: true }))
              }
              onOpenAllChanges={onOpenAllChanges ?? (() => {})}
              onOpenCommit={onOpenCommit ?? (() => {})}
            />
          </div>
        ) : null}
        {showSidebarFooter ? (
          <>
            <SidebarUpdateFooter
              update={updateNotice}
              onOpenWhatsNew={onOpenWhatsNew}
              onDismissUpdate={onDismissUpdate}
            />
            <div className="flex shrink-0 flex-col gap-px p-2">
              <RailAction
                label={t("Settings")}
                icon={Settings}
                onClick={onOpenSettings}
                shortcut={`${MOD},`}
                ariaLabel={withShortcut("Settings", `${MOD},`)}
              />
            </div>
          </>
        ) : null}
      </>
      {sessionMenu ? (
        <ExplorerMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          items={sessionMenuItems}
          ariaLabel={
            multipleMenuSessions
              ? t("{count} selected session actions", {
                  count: menuSessionIds.length,
                })
              : t("Session actions")
          }
          onPick={onSessionMenuPick}
          onClose={closeSessionMenu}
        />
      ) : null}
      {folderMenu ? (
        <ExplorerMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderMenuItems}
          ariaLabel={t("Folder actions")}
          width={260}
          header={
            <FolderColorSwatches
              colorIndex={menuFolder?.colorIndex}
              customColor={menuFolder?.customColor}
              onChange={onFolderColorChange}
              onCustomChange={onFolderCustomColorChange}
            />
          }
          onPick={onFolderMenuPick}
          onClose={() => setFolderMenu(null)}
        />
      ) : null}
      {filterMenu ? (
        <SessionFiltersMenu
          x={filterMenu.x}
          y={filterMenu.y}
          harnesses={sessionHarnesses}
          filters={sessionFilters}
          onChange={onSessionFiltersChange}
          onClose={() => setFilterMenu(null)}
        />
      ) : null}
      {linkingSession ? (
        <LinkSessionWorkItemDialog
          initial={linkingSession.linkedWorkItem}
          sessionTitle={sessionDisplayTitle(
            linkingSession.title,
            linkingSession.harness,
          )}
          onSave={(item) => {
            onSetSessionLinkedWorkItem?.(linkingSession.id, item);
            setLinkingSession(null);
          }}
          onClose={() => setLinkingSession(null)}
        />
      ) : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Resize sidebar")}
        aria-valuenow={resize.width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </aside>
  );

  return (
    <div
      className={`flex h-full shrink-0 ${
        railVisible || sidebarVisible ? "" : "hidden"
      }`}
    >
      {railVisible && onSelectProject && onOpenProject ? (
        <ProjectRail
          cwd={cwd}
          recents={recents}
          inboxUnseen={inboxUnseen}
          busyPaths={busyProjectPaths}
          liveAgents={liveAgents}
          activeSessionId={activeSessionId}
          onSelectAgent={onSelectAgent}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onSearch={onSearch}
          searchActive={searchActive}
          onOpenInbox={onOpenInbox}
          inboxActive={inboxActive}
          onOpenKanban={onOpenKanban}
          kanbanActive={kanbanActive}
          onOpenAutomations={onOpenAutomations}
          automationsActive={automationsActive}
          automationsPaused={automationsPaused}
          notesEnabled={notesEnabled}
          onOpenNotes={onOpenNotes}
          notesActive={notesActive}
          sessions={sessions}
          onSelectSession={onSelectSession}
          onPlaceSessionOnPane={onPlaceSessionOnPane}
          busySessionIds={busySessionIds}
          approvalSessionIds={approvalSessionIds}
          onRenameSession={onRenameSession}
          onArchiveSession={onArchiveSession}
          onPinSession={onPinSession}
          onDeleteSession={onDeleteSession}
          onSetReminders={onSetReminders}
          onCancelReminders={onCancelReminders}
          reminderSessionIds={new Set(reminders.map((item) => item.sessionId))}
          onNewInProject={onNewInProject}
          onSelectProject={onSelectProject}
          onOpenProject={onOpenProject}
          onRemoveProject={onRemoveProject}
          onImportSession={onImportSession}
          onOpenNotificationSettings={onOpenNotificationSettings}
          settingsOpen={settingsOpen}
          settingsSection={settingsSection}
          onOpenSettings={onOpenSettings}
          onSelectSettingsSection={onSelectSettingsSection}
          onCloseSettings={onCloseSettings}
          updateNotice={updateNotice}
          onOpenWhatsNew={onOpenWhatsNew}
          onDismissUpdate={onDismissUpdate}
        />
      ) : null}
      {sidebarVisible ? sidebarContent : null}
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);

function SidebarProjectPicker({
  cwd,
  recents,
  busy,
  onSelectProject,
  onOpenProject,
  onNew,
  onSearch,
  onOpenInbox,
  onOpenNotes,
  searchActive = false,
  inboxActive = false,
  notesActive = false,
  inboxUnseen = false,
}: {
  cwd: string;
  recents: RecentProject[];
  busy: boolean;
  onSelectProject: (path: string) => void;
  onOpenProject?: () => void;
  onNew?: () => void;
  onSearch?: () => void;
  onOpenInbox?: () => void;
  onOpenNotes?: () => void;
  searchActive?: boolean;
  inboxActive?: boolean;
  notesActive?: boolean;
  inboxUnseen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [groupLabels] = useState(loadTabGroupLabels);
  const [groupColors] = useState(loadTabGroupColors);
  const [groupCustomColors] = useState(loadTabGroupCustomColors);
  const [groupMascots] = useState(loadTabGroupMascots);
  const groupLogos = useTabGroupLogos();
  const seed = projectName(cwd);
  const key = projectKey(cwd);
  const label = resolveTabGroupLabel(key, groupLabels, basename(cwd) || seed);
  const logoPath = resolveTabGroupLogo(key, groupLogos);
  const color = resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const projects = projectRailItems(recents, cwd);
  const orderedProjects = [
    ...projects.filter((item) => sameProjectPath(item.path, cwd)),
    ...projects.filter((item) => !sameProjectPath(item.path, cwd)),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredProjects = normalizedQuery
    ? orderedProjects.filter((item) => {
        const itemKey = projectKey(item.path);
        const itemLabel = resolveTabGroupLabel(
          itemKey,
          groupLabels,
          basename(item.path) || projectName(item.path),
        );
        return `${itemLabel}\n${item.path}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
    : orderedProjects;

  const closePicker = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const openPicker = () => {
    setOpen(true);
    setQuery("");
    setActive(0);
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const pickProject = (path: string) => {
    closePicker();
    if (!sameProjectPath(path, cwd)) onSelectProject(path);
  };

  const onPickerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredProjects.length === 0) return;
      setActive((index) => Math.min(filteredProjects.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      const project = filteredProjects[active];
      if (!project) return;
      event.preventDefault();
      pickProject(project.path);
    }
  };

  return (
    <div
      className="flex h-9 items-center gap-0.5 border-b border-content/10 px-2"
      data-tauri-drag-region="deep"
    >
      <div
        ref={pickerRef}
        className="relative flex h-full min-w-0 flex-1 items-center"
      >
        <button
          type="button"
          title={cwd}
          aria-label={t("Switch project, current project {label}", { label })}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-tauri-drag-region="false"
          onClick={() => (open ? closePicker() : openPicker())}
          onKeyDown={(event) => {
            if (open) return;
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            openPicker();
          }}
          className={`flex h-6.5 min-w-0 items-center gap-1.5 rounded-md px-2 text-[12px] leading-none hover:text-content ${
            open
              ? "bg-content/10 text-content"
              : "text-content/50 hover:bg-content/5"
          }`}
        >
          {logoPath ? (
            <ProjectLogoIcon
              path={logoPath}
              className="size-3.5 shrink-0 rounded-sm"
              imageClassName="size-3.5"
            />
          ) : (
            <ProjectMascot
              project={seed}
              color={color}
              name={resolveTabGroupMascot(key, groupMascots)}
              className="size-3 shrink-0"
              active={busy}
            />
          )}
          <span className="min-w-0 truncate font-medium text-content/90">
            {label}
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-content/45 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={1.75}
          />
        </button>
        {open ? (
          <Popover
            anchor={pickerRef}
            side="bottom"
            align="start"
            gap={4}
            width={286}
            maxHeight={380}
            role="dialog"
            aria-label={t("Project picker")}
            onDismiss={() => closePicker()}
            onKeyDown={onPickerKeyDown}
            className="flex flex-col overflow-hidden"
          >
            <label className="flex h-11 shrink-0 items-center gap-2.5 border-b border-content/10 px-3 text-content/45 focus-within:text-content/70">
              <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="sr-only">{t("Search projects")}</span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder={t("Search projects...")}
                className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content/35"
              />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1.5">
              {filteredProjects.length > 0 ? (
                filteredProjects.map((item, index) => {
                  const current = sameProjectPath(item.path, cwd);
                  const itemKey = projectKey(item.path);
                  const itemSeed = projectName(item.path);
                  const itemLabel = resolveTabGroupLabel(
                    itemKey,
                    groupLabels,
                    basename(item.path) || itemSeed,
                  );
                  const itemLogo = resolveTabGroupLogo(itemKey, groupLogos);
                  const itemColor = resolveTabGroupColor(
                    itemKey,
                    groupColors,
                    groupCustomColors,
                    itemSeed,
                  );
                  return (
                    <button
                      key={item.path}
                      type="button"
                      title={item.path}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pickProject(item.path)}
                      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left ${
                        active === index
                          ? "bg-content/10 text-content"
                          : "text-content/75 hover:bg-content/5 hover:text-content"
                      }`}
                    >
                      <span className="grid size-4 shrink-0 place-items-center">
                        {current ? (
                          <Check className="size-3.5" strokeWidth={2} />
                        ) : itemLogo ? (
                          <ProjectLogoIcon
                            path={itemLogo}
                            className="size-4 rounded-sm"
                            imageClassName="size-4"
                          />
                        ) : (
                          <ProjectMascot
                            project={itemSeed}
                            color={itemColor}
                            name={resolveTabGroupMascot(itemKey, groupMascots)}
                            className="size-3.5"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {itemLabel}
                      </span>
                      <span className="max-w-44 shrink truncate font-mono text-xs text-content/40">
                        {prettyParent(item.path)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2.5 py-5 text-center text-[12px] text-content/45">{t("No projects found")}</p>
              )}
            </div>
            {onOpenProject ? (
              <div className="shrink-0 border-t border-content/10 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    closePicker();
                    onOpenProject();
                  }}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-content/75 hover:bg-content/8 hover:text-content"
                >
                  <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span>{t("New project")}</span>
                </button>
              </div>
            ) : null}
          </Popover>
        ) : null}
      </div>
      <div className="flex items-center ml-auto">
        {onNew ? (
          <IconButton label={withShortcut("New tab", `${MOD}T`)} onClick={onNew}>
            <Plus className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {onSearch ? (
          <IconButton
            label={withShortcut("Search", `${MOD}K`)}
            active={searchActive}
            onClick={onSearch}
          >
            <Search className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {onOpenInbox ? (
          <IconButton
            label={inboxUnseen ? t("Inbox, new items") : t("Inbox")}
            active={inboxActive}
            onClick={onOpenInbox}
          >
            <span className="relative">
              <Inbox className="size-3.5" strokeWidth={1.75} />
              {inboxUnseen ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-accent"
                />
              ) : null}
            </span>
          </IconButton>
        ) : null}
        {onOpenNotes ? (
          <IconButton label={t("Notes")} active={notesActive} onClick={onOpenNotes}>
            <StickyNote className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceTitleActions({
  cwd,
  recents,
  onSearch,
  onNew,
  onNewInProject,
}: {
  cwd?: string;
  recents?: RecentProject[];
  onSearch?: () => void;
  onNew?: () => void;
  onNewInProject?: (path: string) => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!onSearch && !onNew) return null;
  const otherProjects = (recents ?? []).filter(
    (item) => !cwd || !sameProjectPath(item.path, cwd),
  );
  const canChooseProject = Boolean(onNewInProject && otherProjects.length > 0);
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      data-tauri-drag-region="false"
    >
      {onSearch ? (
        <IconButton label={withShortcut("Go to File", `${MOD}P`)} onClick={onSearch}>
          <Search className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      ) : null}
      {onNew ? (
        <>
          <span ref={root} className="inline-flex">
            <IconButton
              label={withShortcut("New session", `${MOD}T`)}
              active={menuOpen}
              onClick={() => {
                if (canChooseProject) setMenuOpen((open) => !open);
                else onNew();
              }}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          </span>
          {menuOpen ? (
            <Popover
              anchor={root}
              side="bottom"
              align="end"
              width={260}
              onDismiss={() => setMenuOpen(false)}
              role="menu"
              aria-label={t("New tab")}
              className="p-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-content hover:bg-content/10"
              >
                <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
                {t("New tab in this project")}
              </button>
              {otherProjects.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-widest text-content/45">
                    {t("Another project")}
                  </p>
                  {otherProjects.slice(0, 8).map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      title={item.path}
                      onClick={() => {
                        setMenuOpen(false);
                        onNewInProject?.(item.path);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-content/80 hover:bg-content/10 hover:text-content"
                    >
                      <span className="min-w-0 truncate text-sm">
                        {basename(item.path) || projectName(item.path)}
                      </span>
                      <span className="max-w-28 shrink-0 truncate font-mono text-xs text-content/45">
                        {prettyParent(item.path)}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </Popover>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SessionsHeaderButton({
  label,
  active = false,
  open = false,
  hasPopup = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  open?: boolean;
  hasPopup?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={open}
      aria-haspopup={hasPopup ? "menu" : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className={`relative z-50 grid size-6 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content ${
        open || active ? "bg-content/10 text-content" : ""
      }`}
    >
      {children}
    </button>
  );
}

function sessionListDropFromPoint(
  x: number,
  y: number,
  draggedId: string,
): SessionListDropTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest("[data-reminder-sessions]")) return null;
  const card = el.closest("[data-session-card]") as HTMLElement | null;
  const cardId = card?.dataset.sessionCard;
  if (cardId === draggedId) return null;
  const folder = el.closest("[data-session-folder]") as HTMLElement | null;
  const folderId = folder?.dataset.sessionFolder;
  if (folderId && cardId && card && folder.contains(card)) {
    return { kind: "folder", id: folderId };
  }
  if (cardId) return { kind: "session", id: cardId };
  if (folderId) return { kind: "folder", id: folderId };
  return null;
}

function FolderColorSwatches({
  colorIndex,
  customColor,
  onChange,
  onCustomChange,
}: {
  colorIndex: number | undefined;
  customColor: string | undefined;
  onChange: (index: number | null) => void;
  onCustomChange: (color: string) => void;
}) {
  const paletteColor =
    colorIndex != null ? TAB_GROUP_COLORS[colorIndex] : TAB_GROUP_COLORS[0];
  const pickerValue =
    customColor ?? normalizeHex(paletteColor ?? TAB_GROUP_COLORS[0]);
  return (
    <div className="px-1 py-1">
      <ColorSwatchRow
        colors={TAB_GROUP_COLORS}
        colorIndex={colorIndex}
        customColor={customColor}
        customPickerOpen
        customHighlighted={customColor != null}
        onPickIndex={(index) => onChange(index === 0 ? null : index)}
      />
      <ColorPickerPopover value={pickerValue} onChange={onCustomChange} />
    </div>
  );
}

function FolderRow({
  folder,
  sessions,
  expanded,
  dropTarget,
  busy,
  done,
  needsApproval,
  groupIcon,
  onPointerDown,
  onToggle,
  onContextMenu,
  onRename,
}: {
  folder: Pick<SessionFolder, "name" | "colorIndex" | "customColor">;
  sessions: SessionSummary[];
  expanded: boolean;
  dropTarget: boolean;
  busy: boolean;
  done: boolean;
  needsApproval: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  groupIcon?: ReactNode;
  onToggle: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  onRename?: () => void;
}) {
  const count = sessions.length;
  const accent = folderAccent(folder.colorIndex, folder.customColor);
  return (
    <button
      type="button"
      title={folder.name}
      aria-expanded={expanded}
      data-tauri-drag-region="false"
      onPointerDown={onPointerDown}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === "F2" && onRename) {
          event.preventDefault();
          onRename();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className={`group relative flex w-full touch-none items-center gap-1.5 px-2 h-8 text-left ${
        expanded ? "rounded-md" : ""
      } ${
        dropTarget
          ? "text-content"
          : expanded
            ? "text-content hover:bg-content/10"
            : "text-content/80 hover:bg-content/10 hover:text-content"
      }`}
    >
      {dropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-md bg-accent/20" />
      ) : null}
      <span
        className={`relative grid size-4 shrink-0 place-items-center ${
          accent ? "" : "text-content/50"
        }`}
        style={accent ? { color: accent } : undefined}
      >
        {expanded ? (
          groupIcon ? (
            <>
              <span className="group-hover:hidden group-focus-visible:hidden">
                {groupIcon}
              </span>
              <ChevronDown
                className="hidden size-3.5 text-content group-hover:block group-focus-visible:block"
                strokeWidth={1.75}
              />
            </>
          ) : (
            <ChevronDown className="size-3.5 text-content" strokeWidth={1.75} />
          )
        ) : (
          <>
            <span className="group-hover:hidden group-focus-visible:hidden">
              {groupIcon ?? (
                <Folder className="size-3.5 text-content" strokeWidth={1.75} />
              )}
            </span>
            <ChevronRight
              className="hidden size-3.5 group-hover:block group-focus-visible:block text-content"
              strokeWidth={1.75}
            />
          </>
        )}
      </span>
      <span
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (onRename) onRename();
          else onToggle();
        }}
        className="relative min-w-0 flex-1 cursor-text truncate text-sm leading-snug text-content"
      >
        {folder.name}
      </span>
      <span className="relative flex shrink-0 items-center gap-1 text-2xs tabular-nums text-content/45">
        {!expanded && needsApproval ? (
          <CircleAlert className="size-3.5 text-amber-400" strokeWidth={1.75} />
        ) : !expanded && busy ? (
          <TerminalSpinner className="inline-block w-3 select-none text-center text-xs leading-none text-accent" />
        ) : !expanded && done ? (
          <Check className="size-3.5 text-emerald-400" strokeWidth={2.25} />
        ) : null}
        <span>{count}</span>
      </span>
      {onContextMenu ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={t("Edit folder")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onContextMenu(event);
          }}
          className="relative grid size-5 shrink-0 place-items-center rounded text-content/45 opacity-0 hover:bg-content/15 hover:text-content group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </span>
      ) : null}
    </button>
  );
}

function FolderRenameRow({
  folder,
  memberCount,
  dropTarget,
  onCommit,
  onCancel,
}: {
  folder: SessionFolder;
  memberCount: number;
  dropTarget: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(folder.name);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const finish = (success: boolean) => {
    if (finished.current) return;
    if (success) {
      const trimmed = value.trim();
      if (!trimmed) {
        onCancel();
        return;
      }
      finished.current = true;
      onCommit(trimmed);
      return;
    }
    finished.current = true;
    onCancel();
  };

  return (
    <div
      className={`relative flex w-full items-center gap-1.5 px-2 py-1.5 ${
        dropTarget ? "" : "text-content"
      }`}
    >
      {dropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-md bg-accent/20" />
      ) : null}
      <span className="relative grid size-4 shrink-0 place-items-center text-content/50">
        <ChevronDown className="size-3.5" strokeWidth={1.75} />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        className="relative min-w-0 flex-1 rounded bg-content/10 px-2 py-0.5 text-sm leading-snug text-content outline-none ring-1 ring-accent/40"
      />
      <span className="relative shrink-0 text-2xs tabular-nums text-content/45">
        {memberCount}
      </span>
    </div>
  );
}

const SESSION_PREFETCH_DELAY_MS = 120;

function SessionCard({
  session,
  isActive,
  isSelected,
  busy,
  done,
  linkedUpdate,
  needsApproval,
  dropTarget,
  compact = false,
  showProject = false,
  now,
  onSelect,
  onOpenWorkItem,
  onPrefetch,
  onPlaceOnPane,
  onListDrop,
  onListDropTargetChange,
  onContextMenu,
  onArchive,
  onRename,
  onDelete,
}: {
  session: SessionSummary;
  isActive: boolean;
  isSelected: boolean;
  busy: boolean;
  done: boolean;
  linkedUpdate: boolean;
  needsApproval: boolean;
  dropTarget?: boolean;
  compact?: boolean;
  showProject?: boolean;
  now: number;
  onSelect: (sessionId: string, event: { shiftKey: boolean }) => void;
  onOpenWorkItem?: (item: LinkedWorkItem) => void;
  onPrefetch?: (sessionId: string) => void;
  onPlaceOnPane?: (sessionId: string, targetId: string, edge: PaneEdge) => void;
  onListDrop?: (draggedId: string, target: SessionListDropTarget) => void;
  onListDropTargetChange?: (target: SessionListDropTarget | null) => void;
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onArchive?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const skipClickUntil = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const prefetchTimer = useRef<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const orchestration = session.orchestration;
  const rawTitle = sessionDisplayTitle(session.title, session.harness);
  const title = rawTitle === "New session" ? t("New session") : rawTitle;
  const gitLabel = formatGitLabel(session.repo, session.branch);

  useEffect(
    () => () => {
      if (hoverTimer.current != null) clearTimeout(hoverTimer.current);
    },
    [],
  );

  const openHoverCard = () => {
    if (hoverTimer.current != null) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovering(true), 220);
  };

  const closeHoverCard = () => {
    if (hoverTimer.current != null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovering(false);
  };
  const time = formatRelative(session.updatedAt, now);
  const modelChoice = resolveModel(session.harness, session.model);
  const statusClass = needsApproval
    ? "text-amber-400"
    : busy
      ? "text-accent"
      : done
        ? "text-emerald-400"
        : "text-content/45";
  const statusIcon = needsApproval ? (
    <CircleAlert className="size-3.5" strokeWidth={1.75} />
  ) : busy ? (
    <TerminalSpinner className="inline-block w-3 select-none text-center text-xs leading-none text-accent" />
  ) : done ? (
    <Check className="size-3.5" strokeWidth={2.25} />
  ) : null;

  const linkedWorkItem = session.linkedWorkItem;
  const linkedUpdateDot = linkedUpdate ? (
    <span
      title={`Linked ${linkedWorkItem?.kind === "pr" ? "PR" : "issue"} updated since this session`}
      aria-label={t("Linked work item updated")}
      className="size-1.5 shrink-0 rounded-full bg-accent"
    />
  ) : null;
  const workItemBadge = linkedWorkItem ? (
    <button
      type="button"
      data-no-drag
      data-tauri-drag-region="false"
      title={t(
        linkedWorkItem.kind === "pr"
          ? "Open PR #{n} in Inbox ({mod}-click for GitHub)"
          : "Open issue #{n} in Inbox ({mod}-click for GitHub)",
        { n: linkedWorkItem.number, mod: MOD },
      )}
      aria-label={t(
        linkedWorkItem.kind === "pr" ? "Open PR #{n}" : "Open issue #{n}",
        { n: linkedWorkItem.number },
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey) {
          void openUrl(linkedWorkItem.url).catch(() => undefined);
          return;
        }
        if (onOpenWorkItem) onOpenWorkItem(linkedWorkItem);
        else void openUrl(linkedWorkItem.url).catch(() => undefined);
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        void openUrl(linkedWorkItem.url).catch(() => undefined);
      }}
      className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded px-0.5 text-2xs tabular-nums text-accent hover:underline"
    >
      {linkedWorkItem.kind === "pr" ? (
        <GitPullRequest className="size-3.5" strokeWidth={1.75} />
      ) : (
        <CircleDot className="size-3.5" strokeWidth={1.75} />
      )}
      <span>#{linkedWorkItem.number}</span>
    </button>
  ) : null;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(session.id, { shiftKey: e.shiftKey });
      return;
    }
    if (e.key === "F2" && onRename) {
      e.preventDefault();
      onRename();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
      e.preventDefault();
      onDelete();
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Warm the transcript during the press. Opening stays on click so a
    // drag-to-pane gesture does not switch conversations.
    if (prefetchTimer.current != null) {
      window.clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    }
    onPrefetch?.(session.id);
    if (!onPlaceOnPane && !onListDrop) return;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let lastX = startX;
    let lastY = startY;
    let lastList: SessionListDropTarget | null = null;
    let ghost: DragGhost | null = null;
    handle.setPointerCapture(pointerId);
    const restoreSelection = suppressTextSelection();

    const setListTarget = (next: SessionListDropTarget | null) => {
      if (lastList?.kind === next?.kind && lastList?.id === next?.id) return;
      lastList = next;
      onListDropTargetChange?.(next);
    };

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        active = true;
        setDragging(true);
        ghost = startDragGhost(handle, ev.clientX, ev.clientY);
        if (onPlaceOnPane) {
          setExternalPaneDrop({
            fromId: session.id,
            overId: null,
            edge: "left",
          });
        }
      }
      ghost?.move(ev.clientX, ev.clientY);
      setListTarget(
        onListDrop
          ? sessionListDropFromPoint(ev.clientX, ev.clientY, session.id)
          : null,
      );
      if (!onPlaceOnPane) return;
      const over = paneDropFromPoint(ev.clientX, ev.clientY);
      if (!over || over.id === session.id) {
        setExternalPaneDrop({
          fromId: session.id,
          overId: over?.id === session.id ? session.id : null,
          edge: over?.edge ?? "left",
        });
        return;
      }
      setExternalPaneDrop({
        fromId: session.id,
        overId: over.id,
        edge: over.edge,
      });
    };

    const onUp = () => finish(true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      finish(false);
    };

    function finish(commit: boolean) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      restoreSelection();
      setDragging(false);
      ghost?.end();
      ghost = null;
      setExternalPaneDrop(null);
      setListTarget(null);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      if (!active) return;
      skipClickUntil.current = performance.now() + 400;
      if (!commit) return;
      const listOver = onListDrop
        ? sessionListDropFromPoint(lastX, lastY, session.id)
        : null;
      if (listOver) {
        onListDrop?.(session.id, listOver);
        return;
      }
      const over = paneDropFromPoint(lastX, lastY);
      if (over && over.id !== session.id) {
        onPlaceOnPane?.(session.id, over.id, over.edge);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
  };

  useEffect(
    () => () => {
      if (prefetchTimer.current != null) {
        window.clearTimeout(prefetchTimer.current);
        prefetchTimer.current = null;
      }
    },
    [onPrefetch, session.id],
  );

  const schedulePrefetch = () => {
    if (!onPrefetch || prefetchTimer.current != null) return;
    prefetchTimer.current = window.setTimeout(() => {
      prefetchTimer.current = null;
      onPrefetch(session.id);
    }, SESSION_PREFETCH_DELAY_MS);
  };

  const cancelScheduledPrefetch = () => {
    if (prefetchTimer.current == null) return;
    window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };

  const archiveLabel = session.archived ? t("Unarchive") : t("Archive");
  const cardPaddingY = orchestration
    ? "py-2.5"
    : compact
      ? "py-1.5"
      : "py-2";

  return (
    <div className="group relative">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-current={isActive ? "true" : undefined}
        aria-pressed={isSelected}
        title={title}
        data-session-card={session.id}
        data-orchestration-card={orchestration ? "true" : undefined}
        data-session-selected={isSelected ? "true" : undefined}
        data-tauri-drag-region="false"
        onPointerDown={onPointerDown}
        onPointerEnter={() => {
          schedulePrefetch();
          openHoverCard();
        }}
        onPointerLeave={() => {
          cancelScheduledPrefetch();
          closeHoverCard();
        }}
        onClick={(event) => {
          if (performance.now() < skipClickUntil.current) return;
          onSelect(session.id, event);
        }}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        className={`relative flex w-full cursor-pointer select-none touch-none flex-col rounded-md border px-2.5 text-left ${cardPaddingY} ${
          dragging ? "opacity-40" : ""
        } ${
          dropTarget
            ? "text-content border-transparent"
            : isSelected
              ? "bg-accent/15 text-content border-transparent"
              : needsApproval
                ? "bg-content/20 text-content border-content/30 border-dashed"
                : isActive
                  ? "bg-content/10 text-content border-transparent"
                  : // A lead rests at the tone others only reach on hover, so
                    // its card reads as a group even when nothing is selected.
                    `text-content/80 hover:text-content border-transparent ${
                      orchestration
                        ? "bg-content/5 hover:bg-content/10"
                        : "hover:bg-content/5"
                    }`
        }`}
      >
        {dropTarget ? (
          <div className="pointer-events-none absolute inset-0 rounded-md bg-accent/20" />
        ) : null}
        <span className="relative flex min-w-0 items-center gap-2">
          {session.pinned ? (
            <Pin
              className="size-3.5 shrink-0 text-content/45"
              strokeWidth={1.75}
            />
          ) : null}
          <ModelBrandIcon model={modelChoice} className="size-4 shrink-0" />
          <span
            className="min-w-0 flex-1 truncate text-sm leading-snug text-content"
          >
            {title}
          </span>
          {linkedUpdateDot}
          {statusIcon ? (
            <span className={`flex shrink-0 items-center ${statusClass}`}>
              {statusIcon}
            </span>
          ) : null}
          <span className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {workItemBadge}
            {onArchive ? (
              <button
                type="button"
                data-no-drag
                data-tauri-drag-region="false"
                title={archiveLabel}
                aria-label={`${archiveLabel} ${title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onArchive();
                }}
                className="pointer-events-none grid size-5 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content group-focus-within:pointer-events-auto group-hover:pointer-events-auto"
              >
                <Archive className="size-3.5 shrink-0" strokeWidth={1.75} />
              </button>
            ) : null}
          </span>
        </span>
        {orchestration ? (
          <OrchestrationSidebarAgents
            leadId={session.id}
            summary={orchestration}
          />
        ) : null}
      </div>
      <SessionHoverCard
        anchor={cardRef}
        open={hovering && !dragging}
        title={title}
        time={time}
        branch={gitLabel}
        path={showProject && session.cwd ? prettyCwd(session.cwd) : undefined}
      />
    </div>
  );
}

function SessionRenameRow({
  session,
  isActive,
  needsApproval,
  onCommit,
  onCancel,
}: {
  session: SessionSummary;
  isActive: boolean;
  needsApproval: boolean;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(() =>
    sessionDisplayTitle(session.title, session.harness),
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const finish = (success: boolean) => {
    if (finished.current) return;
    if (success) {
      const trimmed = value.trim();
      if (!trimmed) {
        onCancel();
        return;
      }
      finished.current = true;
      onCommit(trimmed);
      return;
    }
    finished.current = true;
    onCancel();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };

  return (
    <div
      className={`flex w-full flex-col rounded-md px-2.5 py-2 ${
        needsApproval
          ? "bg-amber-400/10 text-content"
          : isActive
            ? "bg-content/10 text-content"
            : "text-content/80"
      }`}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded bg-content/10 px-2 py-1 text-sm leading-snug text-content outline-none ring-1 ring-accent/40"
      />
    </div>
  );
}

function formatGitLabel(repo?: string, branch?: string): string {
  if (repo && branch) return `${repo}/${branch}`;
  return branch || repo || "";
}

function formatRelative(value: number, now: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const seconds = Math.max(0, Math.round((now - value) / 1000));
  if (seconds < 60) return t("now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}
