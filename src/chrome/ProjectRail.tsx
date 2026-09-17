import {
  Archive,
  BellOff,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  AppWindow,
  FilePlusCorner,
  FolderOpen,
  History,
  ImagePlus,
  Inbox,
  LayoutTwoColumn,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  StickyNote,
  Trash2,
} from "./icons";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDragResize } from "../hooks/useDragResize";
import type { PaneEdge } from "../lib/layout";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useProjectDiffStats } from "../hooks/useProjectDiffStats";
import { useAnimatedReorder } from "../hooks/useAnimatedReorder";
import { useTabGroupLogos } from "../hooks/useTabGroupLogos";
import {
  loadProjectRailWidth,
  PROJECT_RAIL_WIDTH_DEFAULT,
  PROJECT_RAIL_WIDTH_MAX,
  PROJECT_RAIL_WIDTH_MIN,
  saveProjectRailWidth,
} from "../lib/appearance";
import {
  basename,
  listExternalEditors,
  openInExternalEditor,
  revealPath,
  type ExternalEditor,
  type GitDiffStats,
} from "../lib/fs";
import { IS_MAC, IS_WIN, MOD } from "../lib/platform";
import { pathKey, projectKey, projectName } from "../lib/paths";
import {
  collectRailProjects,
  loadPinnedProjects,
  loadProjectRailOrder,
  projectRailSections,
  sameProjectPath,
  savePinnedProjects,
  saveProjectRailOrder,
  syncProjectRailOrder,
  type RecentProject,
} from "../lib/recents";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupColorIndex,
  resolveTabGroupCustomColor,
  resolveTabGroupLabel,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
  saveTabGroupColor,
  saveTabGroupCustomColor,
  saveTabGroupLabel,
  saveTabGroupMascot,
} from "../lib/tabGroups";
import { formatLiveElapsed, type LiveAgent } from "../lib/liveAgents";
import type { SessionSummary } from "../lib/sessionStore";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";
import { startDragGhost, type DragGhost } from "../lib/dragGhost";
import { suppressTextSelection } from "../lib/drag";
import { paneDropFromPoint, setExternalPaneDrop } from "../lib/paneDrop";
import { ModelBrandIcon } from "./ModelBrandIcon";
import { resolveModel } from "../lib/models";
import { sessionDisplayTitle } from "../lib/session";
import { sessionReminderPresets } from "./sessionReminderPresets";
import { reminderTime } from "../lib/sessionReminders";
import { ProjectLogoIcon } from "./ProjectLogoIcon";
import { ProjectBackgroundDialog } from "./ProjectBackgroundDialog";
import { ProjectMascot } from "./ProjectMascot";
import { RailAction } from "./RailAction";
import { RemoveProjectDialog } from "./RemoveProjectDialog";
import { DevModeSlot, IconButton, TabVisitNav } from "./TitleBar";
import { SidebarUpdateFooter } from "./SidebarUpdate";
import type { InstalledUpdate } from "../lib/updateNotice";
import { SettingsNav } from "./SettingsRail";
import { Shimmer } from "../surfaces/Shimmer";
import { TabGroupMenu, type TabGroupMenuExtraItem } from "./TabGroupMenu";
import { TerminalSpinner } from "./TerminalSpinner";
import type { SettingsSectionId } from "../lib/settings";
import { t, withShortcut } from "../i18n";
import {
  notificationMuteActions,
  notificationMuteDeadline,
  notificationMuteStatus,
} from "./notificationMuteActions";
import { NotificationMuteDatePicker } from "./NotificationMuteDatePicker";
import { Popover } from "./Popover";
import { updateNotificationPreferences } from "../lib/notificationPreferences";
import {
  knownNotificationProject,
  type NotificationProject,
} from "../lib/notificationProjects";
import { useProjectNotificationPreferences } from "../hooks/useProjectNotificationPreferences";
import { useNotificationProjects } from "../hooks/useNotificationProjects";

function revealLabel() {
  if (IS_MAC) return t("Reveal in Finder");
  if (IS_WIN) return t("Reveal in File Explorer");
  return t("Open Containing Folder");
}

function projectMenuExtraItems(
  pinned: boolean,
  canRemove: boolean,
  canImport: boolean,
  notificationReady: boolean,
  canConfigureNotifications: boolean,
  externalEditors: ExternalEditor[] | null,
): TabGroupMenuExtraItem[] {
  const items: TabGroupMenuExtraItem[] = [
    {
      id: "background",
      label: t("Background image"),
      icon: ImagePlus,
    },
    pinned
      ? { id: "unpin", label: t("Unpin project"), icon: PinOff }
      : { id: "pin", label: t("Pin project"), icon: Pin },
    { id: "reveal", label: revealLabel(), icon: FolderOpen },
    {
      id: "external-editor",
      label: t("Open in editor"),
      icon: AppWindow,
      disabled: externalEditors === null,
      submenu:
        externalEditors === null
          ? [
              {
                kind: "item",
                id: "external-editor:loading",
                label: t("Looking for editors…"),
                disabled: true,
              },
            ]
          : externalEditors.length > 0
            ? externalEditors.map((editor) => ({
                kind: "item" as const,
                id: `external-editor:${editor.id}`,
                label: editor.name,
              }))
            : [
                {
                  kind: "item",
                  id: "external-editor:none",
                  label: t("No supported editors found"),
                  disabled: true,
                },
              ],
    },
    {
      id: "notifications-mute",
      label: t("Mute notifications"),
      icon: BellOff,
      sepBefore: true,
      disabled: !notificationReady,
      submenu: notificationMuteActions(),
    },
    ...(canImport
      ? [
          {
            id: "import-session",
            label: t("Import session…"),
            icon: FilePlusCorner,
          },
        ]
      : []),
  ];
  if (canConfigureNotifications) {
    items.push({
      id: "notifications-settings",
      label: t("Notification settings…"),
      icon: Settings,
    });
  }
  if (canRemove) {
    items.push(
      { id: "archive", label: t("Archive"), icon: Archive, sepBefore: true },
      { id: "delete", label: t("Delete"), icon: Trash2, danger: true },
    );
  }
  return items;
}

type Props = {
  cwd: string;
  recents: RecentProject[];
  inboxUnseen?: boolean;
  busyPaths?: Iterable<string>;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onSearch?: () => void;
  searchActive?: boolean;
  onOpenInbox?: () => void;
  inboxActive?: boolean;
  onOpenKanban?: () => void;
  kanbanActive?: boolean;
  onOpenAutomations?: () => void;
  automationsActive?: boolean;
  automationsPaused?: boolean;
  notesEnabled?: boolean;
  onOpenNotes?: () => void;
  notesActive?: boolean;
  /** Conversations per project, rendered under each expanded project. */
  sessions?: SessionSummary[];
  onSelectSession?: (sessionId: string) => void;
  busySessionIds?: Set<string>;
  approvalSessionIds?: Set<string>;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  onPinSession?: (sessionId: string, pinned: boolean) => void;
  onDeleteSession?: (sessionId: string) => void;
  onSetReminders?: (sessionIds: readonly string[], dueAt: number) => void;
  onCancelReminders?: (sessionIds: readonly string[]) => void;
  reminderSessionIds?: Set<string>;
  onNewInProject?: (cwd: string) => void;
  onPlaceSessionOnPane?: (
    sessionId: string,
    targetId: string,
    edge: PaneEdge,
  ) => void;
  onSelectProject: (path: string) => void;
  onOpenProject: () => void;
  onRemoveProject?: (path: string, options: { purgeData: boolean }) => void;
  onImportSession?: (cwd: string) => void;
  onOpenNotificationSettings?: (projectPath: string) => void;
  liveAgents?: LiveAgent[];
  activeSessionId?: string;
  onSelectAgent?: (sessionId: string) => void;
  settingsOpen?: boolean;
  settingsSection?: SettingsSectionId;
  onOpenSettings?: () => void;
  onSelectSettingsSection?: (section: SettingsSectionId) => void;
  onCloseSettings?: () => void;
  updateNotice?: InstalledUpdate | null;
  onOpenWhatsNew?: (version: string) => void;
  onDismissUpdate?: () => void;
};

export function ProjectRail({
  cwd,
  recents,
  inboxUnseen = false,
  busyPaths,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  searchActive = false,
  onSearch,
  onOpenInbox,
  inboxActive = false,
  onOpenKanban,
  kanbanActive = false,
  onOpenAutomations,
  automationsActive = false,
  automationsPaused = false,
  notesActive = false,
  onOpenNotes,
  sessions = [],
  onSelectSession,
  busySessionIds,
  approvalSessionIds,
  onRenameSession,
  onArchiveSession,
  onPinSession,
  onDeleteSession,
  onSetReminders,
  onCancelReminders,
  reminderSessionIds,
  onNewInProject,
  onPlaceSessionOnPane,
  onSelectProject,
  onOpenProject,
  onRemoveProject,
  onImportSession,
  onOpenNotificationSettings,
  liveAgents = [],
  activeSessionId,
  onSelectAgent,
  settingsOpen = false,
  settingsSection = "general",
  onOpenSettings,
  onSelectSettingsSection,
  onCloseSettings,
  updateNotice = null,
  onOpenWhatsNew,
  onDismissUpdate,
}: Props) {
  const resize = useDragResize({
    min: PROJECT_RAIL_WIDTH_MIN,
    max: () =>
      Math.min(PROJECT_RAIL_WIDTH_MAX, Math.floor(window.innerWidth * 0.35)),
    defaultWidth: PROJECT_RAIL_WIDTH_DEFAULT,
    initial: loadProjectRailWidth(),
    onCommit: saveProjectRailWidth,
  });
  const [railOrder, setRailOrder] = useState(loadProjectRailOrder);
  const [pinnedPaths, setPinnedPaths] = useState(loadPinnedProjects);
  const [groupLabels, setGroupLabels] = useState(loadTabGroupLabels);
  const [groupColors, setGroupColors] = useState(loadTabGroupColors);
  const [groupMascots, setGroupMascots] = useState(loadTabGroupMascots);
  const [groupCustomColors, setGroupCustomColors] = useState(
    loadTabGroupCustomColors,
  );
  const [externalEditors, setExternalEditors] = useState<
    ExternalEditor[] | null
  >(null);
  useEffect(() => {
    let active = true;
    void listExternalEditors()
      .then((installed) => {
        if (active) {
          setExternalEditors(Array.isArray(installed) ? installed : []);
        }
      })
      .catch(() => {
        if (active) setExternalEditors([]);
      });
    return () => {
      active = false;
    };
  }, []);
  const [projectMenu, setProjectMenu] = useState<{
    x: number;
    y: number;
    path: string;
    projectKey: string;
  } | null>(null);
  const [notificationMenu, setNotificationMenu] = useState<{
    x: number;
    y: number;
    path: string;
    project: NotificationProject;
  } | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const menuTrigger = useRef<HTMLElement | null>(null);
  const [removing, setRemoving] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [backgroundProject, setBackgroundProject] = useState<{
    project: string;
    name: string;
  } | null>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupLogos = useTabGroupLogos();
  const notificationPreferences = useProjectNotificationPreferences();
  const notificationPath = projectMenu?.path;
  const readyNotificationProject = notificationPath
    ? knownNotificationProject(notificationPath)
    : undefined;
  const menuMuteStatus = readyNotificationProject
    ? notificationMuteStatus(notificationPreferences[readyNotificationProject.id])
    : null;
  useEffect(() => {
    setNotificationError(null);
  }, [notificationPath]);
  const allProjects = useMemo(
    () => collectRailProjects(recents, cwd),
    [cwd, recents],
  );
  const notificationProjects = useNotificationProjects([...allProjects.keys()]);
  const muteStatuses = new Map<string, string | null>();
  for (const project of notificationProjects.projects) {
    const status = notificationMuteStatus(notificationPreferences[project.id]);
    for (const path of project.paths) muteStatuses.set(pathKey(path), status);
  }
  const sections = useMemo(
    () => projectRailSections(recents, cwd, railOrder, pinnedPaths),
    [cwd, pinnedPaths, railOrder, recents],
  );
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const path of busyPaths ?? []) set.add(path);
    return set;
  }, [busyPaths]);

  useEffect(() => {
    setRailOrder((prev) => {
      const synced = syncProjectRailOrder(prev, allProjects);
      if (synced.join("\0") === prev.join("\0")) return prev;
      saveProjectRailOrder(synced);
      return synced;
    });
  }, [allProjects]);

  useEffect(() => {
    setPinnedPaths((prev) => {
      const next = prev.filter((path) => allProjects.has(path));
      if (next.length === prev.length) return prev;
      savePinnedProjects(next);
      return next;
    });
  }, [allProjects]);

  useEffect(() => {
    if (!projectMenu) return;
    const onScroll = () => setProjectMenu(null);
    const scrollParent = scrollRef.current ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [projectMenu]);

  const openProjectMenu = (
    path: string,
    x: number,
    y: number,
    trigger: HTMLElement | null = null,
  ) => {
    menuTrigger.current = trigger;
    setNotificationMenu(null);
    setProjectMenu({
      x,
      y,
      path,
      projectKey: projectKey(path),
    });
  };

  const closeNotificationMenu = () => {
    setNotificationMenu(null);
    menuTrigger.current?.focus();
  };

  const onProjectContextMenu = (
    path: string,
    event: MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const trigger =
      event.currentTarget.querySelector<HTMLButtonElement>("button");
    trigger?.focus();
    openProjectMenu(path, event.clientX, event.clientY, trigger);
  };

  const onProjectRename = (projectKey: string, label: string) => {
    saveTabGroupLabel(projectKey, label);
    setGroupLabels(loadTabGroupLabels());
  };

  const onProjectColorChange = (
    projectKey: string,
    colorIndex: number | null,
  ) => {
    saveTabGroupColor(projectKey, colorIndex);
    setGroupColors(loadTabGroupColors());
    setGroupCustomColors(loadTabGroupCustomColors());
  };

  const onProjectMascotChange = (projectKey: string, name: string | null) => {
    saveTabGroupMascot(projectKey, name);
    setGroupMascots(loadTabGroupMascots());
  };

  const onProjectCustomColorChange = (projectKey: string, color: string) => {
    saveTabGroupCustomColor(projectKey, color);
    setGroupColors(loadTabGroupColors());
    setGroupCustomColors(loadTabGroupCustomColors());
  };

  const reorderSubset = (
    fullOrder: string[],
    subsetOrder: string[],
    subsetPaths: Set<string>,
  ) => {
    const next: string[] = [];
    let subsetIndex = 0;
    for (const path of fullOrder) {
      if (!subsetPaths.has(path)) {
        next.push(path);
        continue;
      }
      if (subsetIndex < subsetOrder.length) {
        next.push(subsetOrder[subsetIndex++]);
      }
    }
    return next;
  };

  const onReorderPinned = (ids: string[]) => {
    const subset = new Set(sections.pinned.map((item) => item.path));
    const next = reorderSubset(railOrder, ids, subset);
    setRailOrder(next);
    saveProjectRailOrder(next);
  };

  const onReorderProjects = (ids: string[]) => {
    const subset = new Set(sections.projects.map((item) => item.path));
    const next = reorderSubset(railOrder, ids, subset);
    setRailOrder(next);
    saveProjectRailOrder(next);
  };

  const onTogglePin = (path: string) => {
    const isPinned = pinnedPaths.some((pinned) =>
      sameProjectPath(pinned, path),
    );
    const next = isPinned
      ? pinnedPaths.filter((pinned) => !sameProjectPath(pinned, path))
      : [...pinnedPaths, path];
    setPinnedPaths(next);
    savePinnedProjects(next);
  };

  const onProjectMenuPick = (action: string) => {
    if (!projectMenu) return;
    const { path, projectKey } = projectMenu;
    if (action === "mute:custom") {
      if (!readyNotificationProject) return false;
      setNotificationMenu({ ...projectMenu, project: readyNotificationProject });
      setProjectMenu(null);
      return;
    }
    if (action.startsWith("mute:") || action === "notifications-resume") {
      if (!readyNotificationProject) return false;
      const mutedUntil = notificationMuteDeadline(action);
      if (action !== "notifications-resume" && mutedUntil === undefined)
        return false;
      try {
        updateNotificationPreferences([readyNotificationProject.id], {
          mutedUntil,
        });
      } catch {
        setNotificationError(
          t("Could not save notification preferences. Please try again."),
        );
        return false;
      }
      return;
    }
    if (action === "notifications-settings") {
      onOpenNotificationSettings?.(path);
      return;
    }
    if (action === "pin" || action === "unpin") onTogglePin(path);
    else if (action === "background") {
      setBackgroundProject({
        project: projectKey,
        name: resolveTabGroupLabel(projectKey, groupLabels, basename(path)),
      });
    } else if (action === "reveal") void revealPath(path);
    else if (action.startsWith("external-editor:")) {
      const editorId = action.slice("external-editor:".length);
      if (!externalEditors?.some((editor) => editor.id === editorId)) {
        return false;
      }
      void openInExternalEditor(editorId, path)
        .then(() => {
          setProjectMenu(null);
          menuTrigger.current?.focus();
        })
        .catch(() => {
          setNotificationError(
            t("Could not open the external editor. Please try again."),
          );
        });
      return false;
    }
    else if (action === "import-session") onImportSession?.(path);
    else if (action === "archive") {
      onRemoveProject?.(path, { purgeData: false });
    } else if (action === "delete") {
      setRemoving({
        path,
        name: resolveTabGroupLabel(projectKey, groupLabels, basename(path)),
      });
    }
  };

  const onConfirmDelete = () => {
    if (!removing) return;
    onRemoveProject?.(removing.path, { purgeData: true });
    setRemoving(null);
  };

  const pinnedIds = sections.pinned.map((item) => item.path);
  const projectIds = sections.projects.map((item) => item.path);
  const pinnedSortable = useAnimatedReorder(pinnedIds, onReorderPinned, "y");
  const projectSortable = useAnimatedReorder(projectIds, onReorderProjects, "y");
  return (
    <nav
      ref={resize.setPaneRef}
      aria-label={t("Projects")}
      className="sidebar-glass relative flex shrink-0 flex-col border-r border-content/10"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center pr-1.5"
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

      <div className="flex shrink-0 select-none items-center gap-1 px-3 pb-4 pt-3">
        <span className="min-w-0 flex-1 truncate font-display text-display text-content">
          MonoCode
        </span>
        {onSearch ? (
          <IconButton label={t("Search")} active={searchActive} onClick={onSearch}>
            <Search className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {onOpenNotes ? (
          <IconButton label={t("Notes")} active={notesActive} onClick={onOpenNotes}>
            <StickyNote className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
      </div>

      {settingsOpen ? (
        <SettingsNav
          section={settingsSection}
          onSelect={(next) => onSelectSettingsSection?.(next)}
          onClose={() => onCloseSettings?.()}
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-px px-2 pb-2 pt-0.5">
            {onOpenInbox ? (
              <RailAction
                label={t("Inbox")}
                icon={Inbox}
                onClick={onOpenInbox}
                ariaLabel={inboxUnseen ? t("Inbox, new items") : t("Inbox")}
              />
            ) : null}
            {onOpenKanban ? (
              <RailAction
                label={t("Kanban")}
                icon={LayoutTwoColumn}
                active={kanbanActive}
                onClick={onOpenKanban}
              />
            ) : null}
            {onOpenAutomations ? (
              <RailAction
                label={t("Automations")}
                icon={History}
                active={automationsActive}
                dot={automationsPaused}
                onClick={onOpenAutomations}
              />
            ) : null}
          </div>

          <div
            ref={(el) => {
              lockOverscroll(el);
              scrollRef.current = el;
            }}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none pb-2"
          >
            {sections.pinned.length > 0 ? (
              <ProjectSection
                label={t("Pinned")}
                items={sections.pinned}
                cwd={cwd}
                busy={busy}
                sortable={pinnedSortable}
                pinned
                searchActive={searchActive || inboxActive || notesActive}
                onSelect={onSelectProject}
                onTogglePin={onTogglePin}
                onContextMenu={onProjectContextMenu}
                onOpenMenu={openProjectMenu}
                groupLabels={groupLabels}
                groupColors={groupColors}
                groupCustomColors={groupCustomColors}
                groupLogos={groupLogos}
                groupMascots={groupMascots}
                muteStatuses={muteStatuses}
                sessions={sessions}
                onSelectSession={onSelectSession}
                busySessionIds={busySessionIds}
                approvalSessionIds={approvalSessionIds}
                onRenameSession={onRenameSession}
                onArchiveSession={onArchiveSession}
                onPinSession={onPinSession}
                onDeleteSession={onDeleteSession}
                onSetReminders={onSetReminders}
                onCancelReminders={onCancelReminders}
                reminderSessionIds={reminderSessionIds}
                onNewInProject={onNewInProject}
                onPlaceSessionOnPane={onPlaceSessionOnPane}
              />
            ) : null}

            <ProjectSection
              label={t("Projects")}
              items={sections.projects}
              emptyLabel={t("No projects yet")}
              onAdd={onOpenProject}
              cwd={cwd}
              busy={busy}
              sortable={projectSortable}
              pinned={false}
              searchActive={searchActive || inboxActive || notesActive}
              onSelect={onSelectProject}
              onTogglePin={onTogglePin}
              onContextMenu={onProjectContextMenu}
              onOpenMenu={openProjectMenu}
              groupLabels={groupLabels}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupLogos={groupLogos}
              groupMascots={groupMascots}
              muteStatuses={muteStatuses}
              sessions={sessions}
              onSelectSession={onSelectSession}
              busySessionIds={busySessionIds}
              approvalSessionIds={approvalSessionIds}
              onRenameSession={onRenameSession}
              onArchiveSession={onArchiveSession}
              onPinSession={onPinSession}
              onDeleteSession={onDeleteSession}
              onSetReminders={onSetReminders}
              onCancelReminders={onCancelReminders}
              reminderSessionIds={reminderSessionIds}
              onNewInProject={onNewInProject}
              onPlaceSessionOnPane={onPlaceSessionOnPane}
            />
          </div>
          <LiveAgentsPreview
            agents={liveAgents}
            activeSessionId={activeSessionId}
            onSelect={onSelectAgent}
            groupColors={groupColors}
            groupCustomColors={groupCustomColors}
            groupMascots={groupMascots}
          />
          <SidebarUpdateFooter
            update={updateNotice}
            onOpenWhatsNew={onOpenWhatsNew}
            onDismissUpdate={onDismissUpdate}
          />
          <div className="mb-1.5 flex h-[29px] shrink-0 flex-col justify-center gap-px border-t border-content/10 px-2 py-0">
            <RailAction
              label={t("Settings")}
              icon={Settings}
              onClick={onOpenSettings}
              shortcut={`${MOD},`}
              ariaLabel={withShortcut("Settings", `${MOD},`)}
              dense
            />
          </div>
        </>
      )}
      {projectMenu ? (
        <TabGroupMenu
          x={projectMenu.x}
          y={projectMenu.y}
          groupId={projectMenu.projectKey}
          label={resolveTabGroupLabel(
            projectMenu.projectKey,
            groupLabels,
            basename(projectMenu.path),
          )}
          colorIndex={resolveTabGroupColorIndex(
            projectMenu.projectKey,
            groupColors,
            groupCustomColors,
          )}
          customColor={resolveTabGroupCustomColor(
            projectMenu.projectKey,
            groupCustomColors,
          )}
          currentColor={resolveTabGroupColor(
            projectMenu.projectKey,
            groupColors,
            groupCustomColors,
            projectName(projectMenu.path),
          )}
          logoPath={resolveTabGroupLogo(projectMenu.projectKey, groupLogos)}
          logoProject={projectMenu.path}
          mascotName={resolveTabGroupMascot(
            projectMenu.projectKey,
            groupMascots,
          )}
          mascotProject={projectName(projectMenu.path)}
          onRename={onProjectRename}
          onColorChange={onProjectColorChange}
          onCustomColorChange={onProjectCustomColorChange}
          onMascotChange={onProjectMascotChange}
          onLogoChange={() => {}}
          onPick={() => {}}
          onClose={() => {
            setProjectMenu(null);
            menuTrigger.current?.focus();
          }}
          showActions={false}
          leadingAction={
            menuMuteStatus
              ? {
                  id: "notifications-resume",
                  label: t("Resume notifications"),
                  description: menuMuteStatus,
                  icon: BellOff,
                }
              : undefined
          }
          extraItems={projectMenuExtraItems(
            pinnedPaths.some((pinned) =>
              sameProjectPath(pinned, projectMenu.path),
            ),
            Boolean(onRemoveProject),
            Boolean(onImportSession),
            Boolean(readyNotificationProject),
            Boolean(onOpenNotificationSettings),
            externalEditors,
          )}
          footer={
            notificationError ? (
              <p role="alert" className="px-2 py-1.5 text-xs text-red-400">
                {notificationError}
              </p>
            ) : undefined
          }
          onExtraPick={onProjectMenuPick}
        />
      ) : null}
      {notificationMenu ? (
        <Popover
          anchor={{ x: notificationMenu.x, y: notificationMenu.y }}
          gap={0}
          width={280}
          role="dialog"
          aria-label={t("Mute project notifications")}
          onDismiss={closeNotificationMenu}
          className="overflow-y-auto p-3"
        >
          <NotificationMuteDatePicker
            projectIds={[notificationMenu.project.id]}
            onCancel={closeNotificationMenu}
            onChanged={closeNotificationMenu}
          />
        </Popover>
      ) : null}
      {removing ? (
        <RemoveProjectDialog
          name={removing.name}
          path={removing.path}
          onConfirm={onConfirmDelete}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
      {backgroundProject ? (
        <ProjectBackgroundDialog
          project={backgroundProject.project}
          name={backgroundProject.name}
          onClose={() => setBackgroundProject(null)}
        />
      ) : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Resize project sidebar")}
        aria-valuenow={resize.width}
        aria-valuemin={PROJECT_RAIL_WIDTH_MIN}
        aria-valuemax={PROJECT_RAIL_WIDTH_MAX}
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </nav>
  );
}

type SortableHandle = ReturnType<typeof useAnimatedReorder>;

const LIVE_AGENT_MIN = 2;
const LIVE_AGENT_CAP = 4;

function LiveAgentsPreview({
  agents,
  activeSessionId,
  onSelect,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agents: LiveAgent[];
  activeSessionId?: string;
  onSelect?: (sessionId: string) => void;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lockList = useLockOverscroll<HTMLDivElement>();
  const ticking =
    agents.length >= LIVE_AGENT_MIN &&
    agents.some((agent) => !agent.done && agent.startedAt != null);

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (agents.length < LIVE_AGENT_MIN) return null;

  const extra = agents.length - LIVE_AGENT_CAP;
  const visible =
    expanded || extra <= 0 ? agents : agents.slice(0, LIVE_AGENT_CAP);

  return (
    <div className="shrink-0 px-2">
      <div
        role="status"
        aria-label={t("Working agents")}
        className="overflow-hidden rounded-lg bg-content/5"
      >
        <div className="flex items-center gap-2 px-3.5 py-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)] animate-pulse"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-content/50">
            Working
          </span>
          <span className="text-2xs tabular-nums text-content/40">
            {agents.length}
          </span>
        </div>
        <div
          ref={expanded ? lockList : undefined}
          className={`flex flex-col gap-px px-1 ${
            extra > 0 ? "" : "pb-1"
          } ${expanded ? "max-h-[45vh] overflow-y-auto overscroll-none" : ""}`}
        >
          {visible.map((agent) => (
            <LiveAgentCard
              key={agent.id}
              agent={agent}
              now={now}
              selected={agent.id === activeSessionId}
              onSelect={onSelect}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupMascots={groupMascots}
            />
          ))}
        </div>
        {extra > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="flex w-full items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-content/50 hover:bg-content/8 hover:text-content"
          >
            {expanded ? (
              <ChevronUp className="size-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            )}
            {expanded ? t("Show less") : t("{count} more", { count: extra })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LiveAgentCard({
  agent,
  now,
  selected,
  onSelect,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agent: LiveAgent;
  now: number;
  selected: boolean;
  onSelect?: (sessionId: string) => void;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  const seed = projectName(agent.cwd);
  const key = projectKey(agent.cwd);
  const color = resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const model = resolveModel(agent.harness, agent.model);
  const elapsed = agent.done
    ? agent.durationMs != null
      ? formatLiveElapsed(0, agent.durationMs)
      : ""
    : agent.startedAt != null
      ? formatLiveElapsed(agent.startedAt, now)
      : "";
  const activity = agent.needsApproval
    ? t("Need approval")
    : agent.done
      ? t("Done")
      : agent.activity;
  const live = !agent.needsApproval && !agent.done;

  return (
    <button
      type="button"
      data-no-tooltip
      aria-label={[agent.title, model.name, activity, elapsed]
        .filter(Boolean)
        .join(", ")}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect?.(agent.id)}
      className={`relative flex w-full flex-col rounded-md px-2 py-1.5 text-left ${
        selected ? "bg-content/10" : "hover:bg-content/8"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ProjectMascot
          project={seed}
          color={color}
          name={resolveTabGroupMascot(key, groupMascots)}
          className="size-2 shrink-0"
          active={live}
        />
        {live ? (
          <p className="min-w-0 flex-1 truncate text-sm leading-snug">
            {agent.title}
          </p>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm leading-snug">
            {agent.title}
          </span>
        )}
      </span>
      <span
        className={`mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-xs leading-tight ${
          agent.needsApproval
            ? "text-amber-400"
            : agent.done
              ? "text-emerald-400"
              : "text-content/50"
        }`}
      >
        {agent.needsApproval ? (
          <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.75} />
        ) : agent.done ? (
          <Check className="size-3.5 shrink-0" strokeWidth={2.25} />
        ) : (
          <TerminalSpinner className="inline-block w-3 select-none text-center text-xs leading-none" />
        )}
        <span className="min-w-0 truncate">{activity}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-xs leading-tight text-content/45">
        <ModelBrandIcon model={model} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{model.name}</span>
        {elapsed ? (
          <span className="shrink-0 tabular-nums">{elapsed}</span>
        ) : null}
      </span>
    </button>
  );
}

function ProjectSection({
  label,
  items,
  emptyLabel,
  onAdd,
  cwd,
  busy,
  sortable,
  pinned,
  searchActive,
  onSelect,
  onTogglePin,
  onContextMenu,
  onOpenMenu,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupLogos,
  groupMascots,
  muteStatuses,
  sessions = [],
  onSelectSession,
  busySessionIds,
  approvalSessionIds,
  onRenameSession,
  onArchiveSession,
  onPinSession,
  onDeleteSession,
  onSetReminders,
  onCancelReminders,
  reminderSessionIds,
  onNewInProject,
  onPlaceSessionOnPane,
}: {
  label: string;
  items: RecentProject[];
  emptyLabel?: string;
  onAdd?: () => void;
  cwd: string;
  busy: Set<string>;
  sortable: SortableHandle;
  pinned: boolean;
  searchActive: boolean;
  onSelect: (path: string) => void;
  onTogglePin: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: (
    path: string,
    x: number,
    y: number,
    trigger?: HTMLElement | null,
  ) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupLogos: ReturnType<typeof useTabGroupLogos>;
  groupMascots: Record<string, string>;
  muteStatuses: ReadonlyMap<string, string | null>;
  sessions?: SessionSummary[];
  onSelectSession?: (sessionId: string) => void;
  busySessionIds?: Set<string>;
  approvalSessionIds?: Set<string>;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  onPinSession?: (sessionId: string, pinned: boolean) => void;
  onDeleteSession?: (sessionId: string) => void;
  onSetReminders?: (sessionIds: readonly string[], dueAt: number) => void;
  onCancelReminders?: (sessionIds: readonly string[]) => void;
  reminderSessionIds?: Set<string>;
  onNewInProject?: (cwd: string) => void;
  onPlaceSessionOnPane?: (
    sessionId: string,
    targetId: string,
    edge: PaneEdge,
  ) => void;
}) {
  return (
    <div className="shrink-0 mb-2">
      <div className="flex items-center gap-1 px-3 pb-1.5 pt-1">
        <span className="min-w-0 flex-1 truncate px-1 text-xs text-content/50">
          {label}
        </span>
        {onAdd ? (
          <button
            type="button"
            data-no-tooltip
            aria-label={t("Open project")}
            onClick={onAdd}
            className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {items.length === 0 && emptyLabel ? (
        <p className="px-4 pb-1 text-xs leading-tight text-content/40">
          {emptyLabel}
        </p>
      ) : null}
      <div className="flex flex-col gap-px px-2">
        {items.map((item) => (
          <ProjectCard
            key={item.path}
            item={item}
            selected={!searchActive && sameProjectPath(item.path, cwd)}
            busy={isBusyPath(item.path, busy)}
            pinned={pinned}
            sortable={sortable}
            onSelect={onSelect}
            onTogglePin={onTogglePin}
            onContextMenu={onContextMenu}
            onOpenMenu={onOpenMenu}
            groupLabels={groupLabels}
            groupColors={groupColors}
            groupCustomColors={groupCustomColors}
            groupLogos={groupLogos}
            groupMascots={groupMascots}
            muteStatus={muteStatuses.get(pathKey(item.path)) ?? undefined}
            sessions={sessions}
            onSelectSession={onSelectSession}
            busySessionIds={busySessionIds}
            approvalSessionIds={approvalSessionIds}
            onRenameSession={onRenameSession}
            onArchiveSession={onArchiveSession}
            onPinSession={onPinSession}
            onDeleteSession={onDeleteSession}
            onSetReminders={onSetReminders}
            onCancelReminders={onCancelReminders}
            reminderSessionIds={reminderSessionIds}
            onNewInProject={onNewInProject}
            onPlaceSessionOnPane={onPlaceSessionOnPane}
          />
        ))}
      </div>
    </div>
  );
}

const nameClassName =
  "min-w-0 flex-1 truncate text-sm leading-tight";

function ProjectSessionRow({
  session,
  busy,
  approval,
  onSelect,
  onOpenMenu,
  onPlaceOnPane,
}: {
  session: SessionSummary;
  busy: boolean;
  approval: boolean;
  onSelect: (sessionId: string) => void;
  onOpenMenu: (x: number, y: number, session: SessionSummary) => void;
  onPlaceOnPane?: (sessionId: string, targetId: string, edge: PaneEdge) => void;
}) {
  const drag = useSessionRowPaneDrag(session.id, onPlaceOnPane);
  return (
    <button
      type="button"
      data-no-drag
      onPointerDown={(event) => {
        event.stopPropagation();
        drag.onPointerDown(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (performance.now() < drag.skipClickUntil.current) return;
        onSelect(session.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(event.clientX, event.clientY, session);
      }}
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[12px] text-content/60 hover:bg-content/5 hover:text-content"
    >
      {approval ? (
        <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
      ) : busy ? (
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
      ) : null}
      <ModelBrandIcon
        model={resolveModel(session.harness, session.model)}
        className="size-3.5 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">
        {sessionDisplayTitle(session.title, session.harness)}
      </span>
    </button>
  );
}

/**
 * Pointer gesture that places a session row on a pane edge. Mirrors the
 * sidebar card drag so conversations split the workspace from the rail too.
 */
function useSessionRowPaneDrag(
  sessionId: string,
  onPlaceOnPane?: (sessionId: string, targetId: string, edge: PaneEdge) => void,
) {
  const skipClickUntil = useRef(0);
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !onPlaceOnPane) return;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let lastX = startX;
    let lastY = startY;
    let ghost: DragGhost | null = null;
    handle.setPointerCapture(pointerId);
    const restoreSelection = suppressTextSelection();

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        active = true;
        ghost = startDragGhost(handle, ev.clientX, ev.clientY);
        setExternalPaneDrop({ fromId: sessionId, overId: null, edge: "left" });
      }
      ghost?.move(ev.clientX, ev.clientY);
      const over = paneDropFromPoint(ev.clientX, ev.clientY);
      if (!over || over.id === sessionId) {
        setExternalPaneDrop({
          fromId: sessionId,
          overId: null,
          edge: over?.edge ?? "left",
        });
        return;
      }
      setExternalPaneDrop({
        fromId: sessionId,
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
      setExternalPaneDrop(null);
      ghost?.end();
      ghost = null;
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      if (!active) return;
      skipClickUntil.current = performance.now() + 400;
      if (!commit) return;
      const over = paneDropFromPoint(lastX, lastY);
      if (over && over.id !== sessionId) {
        onPlaceOnPane?.(sessionId, over.id, over.edge);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
  };
  return { onPointerDown, skipClickUntil };
}

function ProjectCard({
  item,
  selected,
  busy,
  pinned,
  sortable,
  onSelect,
  onTogglePin,
  onContextMenu,
  onOpenMenu,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupLogos,
  groupMascots,
  muteStatus,
  sessions = [],
  onSelectSession,
  busySessionIds,
  approvalSessionIds,
  onRenameSession,
  onArchiveSession,
  onPinSession,
  onDeleteSession,
  onSetReminders,
  onCancelReminders,
  reminderSessionIds,
  onNewInProject,
  onPlaceSessionOnPane,
}: {
  item: RecentProject;
  selected: boolean;
  busy: boolean;
  pinned: boolean;
  sortable: SortableHandle;
  onSelect: (path: string) => void;
  onTogglePin: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: (
    path: string,
    x: number,
    y: number,
    trigger?: HTMLElement | null,
  ) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupLogos: ReturnType<typeof useTabGroupLogos>;
  groupMascots: Record<string, string>;
  muteStatus?: string;
  sessions?: SessionSummary[];
  onSelectSession?: (sessionId: string) => void;
  busySessionIds?: Set<string>;
  approvalSessionIds?: Set<string>;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  onPinSession?: (sessionId: string, pinned: boolean) => void;
  onDeleteSession?: (sessionId: string) => void;
  onSetReminders?: (sessionIds: readonly string[], dueAt: number) => void;
  onCancelReminders?: (sessionIds: readonly string[]) => void;
  reminderSessionIds?: Set<string>;
  onNewInProject?: (cwd: string) => void;
  onPlaceSessionOnPane?: (
    sessionId: string,
    targetId: string,
    edge: PaneEdge,
  ) => void;
}) {
  const fallbackName = basename(item.path);
  const key = projectKey(item.path);
  const seed = projectName(item.path);
  const name = resolveTabGroupLabel(key, groupLabels, fallbackName);
  const logoPath = resolveTabGroupLogo(key, groupLogos);
  const color = resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const diffEnabled = Boolean(item.path) && item.path !== "~";
  const stats = useProjectDiffStats(item.path, diffEnabled);
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  const hasChanges = files > 0 || additions > 0 || deletions > 0;
  const cardAriaLabel = projectCardAriaLabel(name, stats, busy);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const isExpanded = expanded ?? selected;
  const [sessionMenu, setSessionMenu] = useState<{
    x: number;
    y: number;
    session: SessionSummary;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const projectSessions = sessions.filter((session) =>
    sameProjectPath(session.cwd, item.path),
  );
  const shownSessions = [...projectSessions].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return (
    <div className="min-w-0">
    <div
      ref={(el) => sortable.setItemRef(item.path, el)}
      data-selected={selected || undefined}
      className={`reorder-item project-reorder-item group relative flex touch-none items-stretch rounded-md px-2 h-8 ${
        selected
          ? "bg-content/12 text-content"
          : "opacity-65"
      } cursor-pointer`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
          return;
        }
        sortable.onItemPointerDown(item.path, event);
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
          return;
        }
        if (sortable.consumeClick()) return;
        onSelect(item.path);
      }}
      onContextMenu={(event) => onContextMenu(item.path, event)}
      onKeyDown={(event) => {
        if (
          event.key !== "ContextMenu" &&
          !(event.shiftKey && event.key === "F10")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const trigger =
          event.currentTarget.querySelector<HTMLButtonElement>("button");
        onOpenMenu(item.path, rect.left, rect.bottom, trigger);
      }}
    >
      <button
        type="button"
        data-no-tooltip
        aria-label={muteStatus ? `${cardAriaLabel}, ${muteStatus}` : cardAriaLabel}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left group-hover:pr-20"
      >
        <div className="project-card-logo grid size-4 shrink-0 place-items-center">
          <span
            className={projectSessions.length > 0 ? "group-hover:hidden" : ""}
          >
            {logoPath && !busy ? (
              <ProjectLogoIcon
                path={logoPath}
                className="size-4 rounded-sm"
                imageClassName="size-4"
              />
            ) : (
              <ProjectMascot
                project={seed}
                color={color}
                name={resolveTabGroupMascot(key, groupMascots)}
                className="size-3"
                active={busy}
              />
            )}
          </span>
          {projectSessions.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              data-no-drag
              aria-label={
                isExpanded ? t("Collapse project") : t("Expand project")
              }
              aria-expanded={isExpanded}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!isExpanded);
              }}
              className="hidden size-4 place-items-center rounded-sm text-content/50 hover:bg-content/8 hover:text-content group-hover:grid"
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              )}
            </span>
          ) : null}
        </div>
        {busy ? (
          <Shimmer as="span" duration={1.4} className={nameClassName}>
            {name}
          </Shimmer>
        ) : (
          <span className={nameClassName}>{name}</span>
        )}
        {muteStatus ? (
          <span
            role="img"
            aria-label={muteStatus}
            className="grid size-4 shrink-0 place-items-center text-amber-400"
          >
            <BellOff className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
        {hasChanges ? (
          <span className="project-card-stats shrink-0 group-hover:hidden">
            <ProjectDiffStat additions={additions} deletions={deletions} />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        data-no-drag
        data-no-tooltip
        aria-label={t("Project options")}
        aria-haspopup="menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu(
            item.path,
            event.clientX,
            event.clientY,
            event.currentTarget,
          );
        }}
        className="absolute right-1 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-content/55 hover:bg-content/8 hover:text-content group-hover:grid"
      >
        <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
      </button>
      {onNewInProject ? (
        <button
          type="button"
          data-no-drag
          data-no-tooltip
          aria-label={t("New session")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onNewInProject(item.path);
          }}
          className="absolute right-14 top-1/2 hidden size-4 -translate-y-1/2 place-items-center rounded-sm text-content/55 hover:bg-content/8 hover:text-content group-hover:grid"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      <button
        type="button"
        data-no-drag
        data-no-tooltip
        aria-label={pinned ? t("Unpin project") : t("Pin project")}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(item.path);
        }}
        className="absolute right-8 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-sm text-content/55 opacity-0 pointer-events-none transition-opacity hover:text-content group-hover:pointer-events-auto group-hover:opacity-100"
      >
        {pinned ? (
          <PinOff className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Pin className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
      </div>
      {projectSessions.length > 0 ? (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="mt-0.5 flex flex-col gap-px pb-0.5 pl-6 pr-1">
              {shownSessions.map((session) =>
                renamingId === session.id ? (
                  <input
                    key={session.id}
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const next = renameValue.trim();
                        if (next) onRenameSession?.(session.id, next);
                        setRenamingId(null);
                      } else if (event.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    onBlur={() => setRenamingId(null)}
                    className="h-7 w-full rounded-md bg-content/10 px-2 text-[12px] text-content outline-none"
                  />
                ) : (
                <ProjectSessionRow
                  key={session.id}
                  session={session}
                  busy={busySessionIds?.has(session.id) ?? false}
                  approval={approvalSessionIds?.has(session.id) ?? false}
                  onSelect={(sessionId) => onSelectSession?.(sessionId)}
                  onOpenMenu={(x, y, entry) =>
                    setSessionMenu({ x, y, session: entry })
                  }
                  onPlaceOnPane={onPlaceSessionOnPane}
                />
                )
              )}
            </div>
          </div>
        </div>
      ) : null}
      {sessionMenu ? (
        <ExplorerMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          width={200}
          items={
            [
              {
                kind: "item",
                id: "pin",
                label: sessionMenu.session.pinned ? t("Unpin") : t("Pin"),
              },
              {
                kind: "item",
                id: "archive",
                label: sessionMenu.session.archived
                  ? t("Unarchive")
                  : t("Archive"),
              },
              { kind: "sep" },
              { kind: "item", id: "rename", label: t("Rename") },
              { kind: "sep" },
              ...(reminderSessionIds?.has(sessionMenu.session.id)
                ? [
                    {
                      kind: "item",
                      id: "reminder:cancel",
                      label: t("Cancel reminder"),
                    },
                  ]
                : sessionReminderPresets()),
              { kind: "item", id: "delete", label: t("Delete") },
            ] as ExplorerMenuItem[]
          }
          onPick={(id) => {
            const session = sessionMenu.session;
            if (id === "pin") onPinSession?.(session.id, !session.pinned);
            else if (id === "archive")
              onArchiveSession?.(session.id, !session.archived);
            else if (id === "rename") {
              setRenameValue(
                sessionDisplayTitle(session.title, session.harness),
              );
              setRenamingId(session.id);
            } else if (id === "delete") onDeleteSession?.(session.id);
            else if (id.startsWith("reminder:")) {
              if (id === "reminder:cancel") onCancelReminders?.([session.id]);
              else {
                const dueAt = reminderTime(id, new Date());
                if (dueAt != null) onSetReminders?.([session.id], dueAt);
              }
            }
            setSessionMenu(null);
          }}
          onClose={() => setSessionMenu(null)}
        />
      ) : null}
    </div>
  );
}

function isBusyPath(path: string, busy: Set<string>): boolean {
  for (const other of busy) {
    if (sameProjectPath(path, other)) return true;
  }
  return false;
}

function ProjectDiffStat({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-2xs font-medium tabular-nums">
      {additions > 0 ? (
        <span className="text-emerald-400">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-400">-{deletions}</span>
      ) : null}
    </span>
  );
}

function projectCardAriaLabel(
  name: string,
  stats: GitDiffStats | null,
  busy: boolean,
): string {
  const parts = [name];
  if (busy) parts.push("working");
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  if (files > 0) {
    parts.push(`${files} ${files === 1 ? "file" : "files"} changed`);
  }
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(", ");
}
