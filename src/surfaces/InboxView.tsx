import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCheck,
  ChevronDown,
  CircleDot,
  CircleX,
  ExternalLink,
  GitCompare,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Inbox,
  MessageSquare,
  ListFilter,
  LoaderCircle,
  MessageMultiple,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  type IconComponent,
} from "../chrome/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  InboxFiltersMenu,
  INBOX_FILTER_MENU_WIDTH,
} from "../chrome/InboxFiltersMenu";
import { InboxConnectMenu } from "../chrome/InboxConnectMenu";
import { InboxProviderMark } from "../chrome/InboxProviderMark";
import { ProjectLogoIcon } from "../chrome/ProjectLogoIcon";
import { ProjectMascot } from "../chrome/ProjectMascot";
import { PrActions, type PrMergeMethod } from "../chrome/PrActions";
import { PrReviewBar } from "../chrome/PrReviewBar";
import { PrMetadataEditor } from "../chrome/PrMetadataEditor";
import { OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
import { useDragResize } from "../hooks/useDragResize";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useTabGroupLogos } from "../hooks/useTabGroupLogos";
import {
  asGithubPrDetails,
  githubStatus,
  githubPrDiff,
  githubPrEdit,
  githubPrMerge,
  githubPrReview,
  githubPrState,
  githubRepoMeta,
  githubReviewDecisionLabel,
  githubWorkItem,
  githubWorkItemComment,
  githubWorkItemDetails,
  githubWorkItemThread,
  gitlabAttentionLabel,
  inboxErrorMessage,
  inboxItemKey,
  inboxItemRef,
  inboxItemStatus,
  inboxListIsFresh,
  invalidateGithubItem,
  isTrackerProvider,
  inboxProjectsForRail,
  listInboxItems,
  peekGithubPrDiff,
  peekGithubWorkItemDetails,
  peekGithubWorkItemThread,
  peekInboxList,
  classifyInboxError,
  formatRelativeTime,
  inboxPersonAvatarUrl,
  type GithubLabel,
  type GithubPrDiff,
  type GithubRepoMeta,
  type GithubWorkItemDetails,
  type GithubWorkItemThread,
  type InboxItem,
  type InboxProviderErrors,
  type InboxQuery,
} from "../lib/githubTasks";
import {
  applyInboxFilters,
  connectableInboxSources,
  hasActiveInboxFilters,
  loadInboxConnections,
  linearProjectOptions,
  inboxFetchState,
  loadInboxFilters,
  loadInboxSource,
  pruneInboxFilters,
  saveInboxFilters,
  resolveInboxSource,
  saveInboxConnections,
  saveInboxSource,
  visibleInboxSources,
  INBOX_SOURCE_LABELS,
  type ConnectableInboxSource,
  type InboxFilters,
  type InboxSource,
} from "../lib/inboxFilters";
import { projectKey, projectName } from "../lib/paths";
import { IS_MAC } from "../lib/platform";
import {
  addReviewComment,
  clearReviewDraft,
  emptyReviewDraft,
  peekReviewDraft,
  removeReviewComment,
  reviewDraftKey,
  saveReviewDraft,
  updateReviewComment,
  type PrReviewDraft,
  type PrReviewEvent,
} from "../lib/prReview";
import { sameProjectPath, type RecentProject } from "../lib/recents";
import { sessionDisplayTitle, type LinkedWorkItem } from "../lib/session";
import type { SessionSummary } from "../lib/sessionStore";
import {
  inboxItemMatchesLinkedWorkItem,
  linkedWorkItemInboxKey,
  relatedSessionsForInboxItem,
} from "../lib/sessionWorkItem";
import {
  isInboxEntryUnseen,
  markInboxItemSeen,
  markInboxItemsSeen,
  useInboxSeenTick,
} from "../lib/inboxSeen";
import { LIST_PAGE_SIZE, listWindowSize } from "../lib/listWindow";
import {
  LINEAR_CHANGE_EVENT,
  linearConnected,
  linearIssueComment,
  linearIssueDetails,
  linearIssueThread,
  listLinearTeams,
  loadHiddenLinearTeamIds,
  peekLinearIssueDetails,
  peekLinearIssueThread,
  saveHiddenLinearTeamIds,
  type LinearIssueThread,
  type LinearTeam,
} from "../lib/linear";
import {
  GITLAB_CHANGE_EVENT,
  gitlabConnected,
  gitlabMrDiff,
  gitlabWorkItemComment,
  gitlabWorkItemDetails,
  gitlabWorkItemThread,
  peekGitlabMrDiff,
  peekGitlabWorkItemDetails,
  peekGitlabWorkItemThread,
  type GitlabWorkItemThread,
} from "../lib/gitlab";
import {
  JIRA_CHANGE_EVENT,
  jiraConnected,
  jiraIssueComment,
  jiraIssueDetails,
  jiraIssueThread,
  peekJiraIssueDetails,
  peekJiraIssueThread,
  type JiraIssueThread,
} from "../lib/jira";
import {
  CLICKUP_CHANGE_EVENT,
  clickUpConnected,
  clickUpTaskComment,
  clickUpTaskDetails,
  clickUpTaskThread,
  peekClickUpTaskDetails,
  peekClickUpTaskThread,
  type ClickUpTaskThread,
} from "../lib/clickup";
import {
  NOTION_CHANGE_EVENT,
  notionConnected,
  notionTaskComment,
  notionTaskDetails,
  notionTaskThread,
  peekNotionTaskDetails,
  peekNotionTaskThread,
  type NotionTaskThread,
} from "../lib/notion";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../lib/tabGroups";
import { AgentMarkdown } from "./AgentMarkdown";
import {
  InboxComments,
  InboxCommentForm,
  type InboxReplyTarget,
} from "./InboxComments";
import { InboxPrDiff } from "./InboxPrDiff";
import {
  InboxDiscussionPanel,
  type InboxSessionPortal,
} from "./InboxDiscussionPanel";
import { inboxAskKey } from "../lib/inboxAsk";
import { NotionTaskEditor, type NotionEditTarget } from "./NotionTaskEditor";
import { t } from "../i18n";

const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

// One height for the whole detail action row; `border` is inside it, so the
// outline variant lines up with the filled and ghost ones.
const ACTION = "inline-flex items-center gap-1.5 rounded-md px-3 text-[12px]";
const ACTION_FILLED = `${ACTION} h-6.5 bg-content text-background-base hover:bg-content/80`;
const ACTION_OUTLINE = `${ACTION} h-7 border border-content/15 text-content/80 hover:bg-content/5`;
const ACTION_GHOST = `${ACTION} h-7 text-content/70 hover:bg-content/10 hover:text-content`;
const METHOD_LABELS_FOR_CONFIRM: Record<PrMergeMethod, string> = {
  squash: "Squash and merge",
  merge: "Create a merge commit",
  rebase: "Rebase and merge",
};
const DEFAULT_WIDTH = 280;

let rememberedWidth = DEFAULT_WIDTH;

type InboxProjectOption = {
  path: string;
  name: string;
  logoPath: string | null;
  mascotName: string | null;
  mascotColor: string;
};

function inboxProjectOptions(
  projects: RecentProject[],
  logos: ReturnType<typeof useTabGroupLogos>,
): InboxProjectOption[] {
  const mascots = loadTabGroupMascots();
  const colors = loadTabGroupColors();
  const custom = loadTabGroupCustomColors();
  return [...projects]
    .map((project) => {
      const name = projectName(project.path);
      const key = projectKey(project.path);
      return {
        path: project.path,
        name,
        logoPath: resolveTabGroupLogo(key, logos),
        mascotName: resolveTabGroupMascot(key, mascots),
        mascotColor: resolveTabGroupColor(key, colors, custom, name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function InboxProjectMark({
  project,
}: {
  project: Pick<
    InboxProjectOption,
    "name" | "logoPath" | "mascotName" | "mascotColor"
  >;
}) {
  if (project.logoPath) {
    return (
      <ProjectLogoIcon
        path={project.logoPath}
        className="size-3.5 shrink-0 rounded-sm"
        imageClassName="size-3.5"
      />
    );
  }
  return (
    <ProjectMascot
      project={project.name}
      color={project.mascotColor}
      name={project.mascotName}
      className="size-3 shrink-0"
    />
  );
}

function peekInboxForRail(recents: RecentProject[], cwd: string) {
  const projects = inboxProjectsForRail(recents, cwd);
  const filters = pruneInboxFilters(
    loadInboxFilters(),
    projects.map((project) => project.path),
  );
  return peekInboxList(projects, {
    assignedToMe: filters.assignedToMe,
    state: inboxFetchState(filters),
    search: "",
    linearHiddenTeamIds: loadHiddenLinearTeamIds(),
  });
}

function InboxSourceTab({
  source,
  selected,
  onSelect,
}: {
  source: InboxSource;
  selected: boolean;
  onSelect: (source: InboxSource) => void;
}) {
  const label = t(INBOX_SOURCE_LABELS[source]);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(source)}
      className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-[12px] leading-none ${
        selected
          ? "bg-content/10 text-content"
          : "text-content/50 hover:bg-content/5 hover:text-content"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <InboxProviderMark
          provider={source}
          className="block size-3.5 shrink-0"
        />
        <span className="leading-none">{label}</span>
      </span>
    </button>
  );
}

function InboxDetailTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`relative flex h-9 items-center text-[12px] leading-none ${
        selected ? "text-content" : "text-content/50 hover:text-content"
      }`}
    >
      {label}
      {selected ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-content" />
      ) : null}
    </button>
  );
}

type Props = {
  onAsk: (item: InboxItem) => Promise<string>;
  onAskRestart: (item: InboxItem) => Promise<string>;
  onAskMount: (portal: InboxSessionPortal | null) => void;
  cwd: string;
  recents: RecentProject[];
  besideRail?: boolean;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  onStart?: (item: InboxItem, body?: string) => void | Promise<void>;
  sessions?: readonly SessionSummary[];
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  /** Session-card destination to reveal after the Inbox list loads. */
  target?: LinkedWorkItem | null;
  /** Opens Settings on the card where the given source is connected. */
  onOpenIntegrations: (source: ConnectableInboxSource) => void;
};

export function InboxView({
  onAsk,
  onAskRestart,
  onAskMount,
  cwd,
  recents,
  besideRail = false,
  onClose,
  onToggleSidebar,
  onStart,
  sessions = [],
  onOpenSession,
  target = null,
  onOpenIntegrations,
}: Props) {
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const listLock = useLockOverscroll<HTMLDivElement>();
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  const setListScrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      listLock(element);
      listScrollRef.current = element;
    },
    [listLock],
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const logos = useTabGroupLogos();
  const [groupMascots] = useState(loadTabGroupMascots);
  const [groupColors] = useState(loadTabGroupColors);
  const [groupCustomColors] = useState(loadTabGroupCustomColors);

  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<InboxItem[]>(
    () => peekInboxForRail(recents, cwd)?.items ?? [],
  );
  const [loading, setLoading] = useState(
    () => peekInboxForRail(recents, cwd) == null,
  );
  const [revalidating, setRevalidating] = useState(false);
  const [providerErrors, setProviderErrors] = useState<InboxProviderErrors>(
    () => peekInboxForRail(recents, cwd)?.errors ?? {},
  );
  const [refresh, setRefresh] = useState(0);
  const targetSelectionKey = target ? linkedWorkItemInboxKey(target) : null;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    targetSelectionKey,
  );
  const [targetItem, setTargetItem] = useState<InboxItem | null>(null);
  const [filters, setFilters] = useState(loadInboxFilters);
  const [connections, setConnections] = useState(loadInboxConnections);
  const [source, setSource] = useState(() =>
    resolveInboxSource(loadInboxSource(), connections),
  );
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [linearHiddenTeamIds, setLinearHiddenTeamIds] = useState(
    loadHiddenLinearTeamIds,
  );
  const [linearTeams, setLinearTeams] = useState<LinearTeam[]>([]);
  const [notionEditor, setNotionEditor] = useState<{
    mode: "create" | "edit";
    target?: NotionEditTarget;
  } | null>(null);
  const prevRefresh = useRef(refresh);

  const projects = useMemo(
    () => inboxProjectsForRail(recents, cwd),
    [cwd, recents],
  );
  const projectOptions = useMemo(
    () => inboxProjectOptions(projects, logos),
    [logos, projects],
  );
  const linearProjects = useMemo(() => linearProjectOptions(items), [items]);
  const activeFilters = useMemo(
    () =>
      pruneInboxFilters(
        filters,
        projects.map((project) => project.path),
      ),
    [filters, projects],
  );
  const filtersActive = hasActiveInboxFilters(
    activeFilters,
    source,
    linearHiddenTeamIds,
  );
  const fetchState = inboxFetchState(activeFilters);
  const fetchQuery = useMemo<InboxQuery>(
    () => ({
      assignedToMe: activeFilters.assignedToMe,
      state: fetchState,
      search: "",
      linearHiddenTeamIds,
    }),
    [activeFilters.assignedToMe, fetchState, linearHiddenTeamIds],
  );

  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(MAX_WIDTH, Math.round(window.innerWidth * 0.5)),
    defaultWidth: DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (width) => {
      rememberedWidth = width;
    },
  });

  useEffect(() => {
    if (!target) return;
    setSource("github");
    setSearchInput("");
  }, [target]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (filterMenu) {
        setFilterMenu(null);
        return;
      }
      if (connectMenuOpen) {
        setConnectMenuOpen(false);
        return;
      }
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [connectMenuOpen, filterMenu]);

  useEffect(() => {
    const onChange = () => {
      setLinearHiddenTeamIds(loadHiddenLinearTeamIds());
      setRefresh((value) => value + 1);
    };
    window.addEventListener(LINEAR_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LINEAR_CHANGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    const onChange = () => setRefresh((value) => value + 1);
    window.addEventListener(GITLAB_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(GITLAB_CHANGE_EVENT, onChange);
  }, []);

  // The mount read does the real work: opening Settings unmounts this view, so
  // a token set there lands on the way back in. Reads can also overlap, and
  // only the newest may write, or a slow earlier answer restores a stale one.
  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    const read = () => {
      const generation = ++latest;
      void Promise.allSettled([
        githubStatus(),
        linearConnected(),
        gitlabConnected(),
        jiraConnected(),
        clickUpConnected(),
        notionConnected(),
      ]).then(([github, linear, gitlab, jira, clickup, notion]) => {
        if (cancelled || generation !== latest) return;
        setConnections((prev) => ({
          github:
            github.status === "fulfilled"
              ? github.value.connected
              : prev.github,
          linear:
            linear.status === "fulfilled"
              ? linear.value.connected
              : prev.linear,
          gitlab:
            gitlab.status === "fulfilled"
              ? gitlab.value.connected
              : prev.gitlab,
          jira:
            jira.status === "fulfilled" ? jira.value.connected : prev.jira,
          clickup:
            clickup.status === "fulfilled"
              ? clickup.value.connected
              : prev.clickup,
          notion:
            notion.status === "fulfilled"
              ? notion.value.connected
              : prev.notion,
        }));
      });
    };
    read();
    window.addEventListener(LINEAR_CHANGE_EVENT, read);
    window.addEventListener(GITLAB_CHANGE_EVENT, read);
    window.addEventListener(JIRA_CHANGE_EVENT, read);
    window.addEventListener(CLICKUP_CHANGE_EVENT, read);
    window.addEventListener(NOTION_CHANGE_EVENT, read);
    return () => {
      cancelled = true;
      window.removeEventListener(LINEAR_CHANGE_EVENT, read);
      window.removeEventListener(GITLAB_CHANGE_EVENT, read);
      window.removeEventListener(JIRA_CHANGE_EVENT, read);
      window.removeEventListener(CLICKUP_CHANGE_EVENT, read);
      window.removeEventListener(NOTION_CHANGE_EVENT, read);
    };
  }, []);

  useEffect(() => {
    saveInboxConnections(connections);
  }, [connections]);

  // The initial source is resolved against cached status, so storage can still
  // name a provider this view has already fallen back from.
  useEffect(() => {
    saveInboxSource(source);
    // Mount only: the temporary switch to GitHub for a linked target must not
    // be persisted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disconnecting can pull the tab out from under the current selection.
  useEffect(() => {
    const next = resolveInboxSource(source, connections);
    if (next === source) return;
    setSource(next);
    saveInboxSource(next);
  }, [connections, source]);

  const visibleSources = visibleInboxSources(connections);
  const connectableSources = connectableInboxSources(connections);
  const sourceAvailable = visibleSources.includes(source);
  const noSourcesConnected = visibleSources.length === 0;

  // The roster has to come from Linear, not from the fetched issues: hiding a
  // team drops its issues, so a derived list could never offer it back.
  useEffect(() => {
    if (source !== "linear") return;
    let cancelled = false;
    void listLinearTeams()
      .then((teams) => {
        if (!cancelled) setLinearTeams(teams);
      })
      .catch(() => {
        if (!cancelled) setLinearTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [source, linearHiddenTeamIds]);

  useEffect(() => {
    const force = refresh !== prevRefresh.current;
    prevRefresh.current = refresh;
    const cached = peekInboxList(projects, fetchQuery);
    if (cached) {
      setItems(cached.items);
      setProviderErrors(cached.errors);
      setLoading(false);
    }
    if (!force && cached && inboxListIsFresh(projects, fetchQuery)) {
      return;
    }

    let cancelled = false;
    if (cached) setRevalidating(true);
    else {
      setLoading(true);
      setProviderErrors({});
    }
    void listInboxItems(projects, fetchQuery, { force })
      .then((next) => {
        if (cancelled) return;
        setItems(next.items);
        setProviderErrors(next.errors);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cached) return;
        setItems([]);
        const message = err instanceof Error ? err.message : String(err);
        setProviderErrors({
          github: message,
          linear: message,
          gitlab: message,
        });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRevalidating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchQuery, projects, refresh]);

  useEffect(() => {
    if (
      !target ||
      items.some((item) => inboxItemMatchesLinkedWorkItem(item, target))
    ) {
      return;
    }
    let cancelled = false;
    void githubWorkItem(cwd, target.repo, target.kind, target.number)
      .then((item) => {
        if (cancelled) return;
        setTargetItem({
          ...item,
          projectPath: cwd,
          provider: "github",
        });
      })
      .catch(() => {
        // The normal Inbox remains usable when an exact lookup is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, items, target, targetSelectionKey]);

  const visibleItems = useMemo(() => {
    if (!sourceAvailable) return [];
    const visible = applyInboxFilters(
      items,
      activeFilters,
      searchInput,
      Date.now(),
      source,
    );
    if (!target || source !== "github") return visible;
    const targeted =
      items.find((item) => inboxItemMatchesLinkedWorkItem(item, target)) ??
      (targetItem && inboxItemMatchesLinkedWorkItem(targetItem, target)
        ? targetItem
        : null);
    if (!targeted || visible.includes(targeted)) return visible;
    return [targeted, ...visible];
  }, [
    activeFilters,
    items,
    searchInput,
    source,
    sourceAvailable,
    target,
    targetItem,
  ]);

  const inboxSeenTick = useInboxSeenTick();
  const sourceEntries = useMemo(
    () =>
      sourceAvailable
        ? items
            .filter((item) => item.provider === source)
            .map((item) => ({
              key: inboxItemKey(item),
              updatedAt: item.updatedAt,
            }))
        : [],
    [items, source, sourceAvailable],
  );
  const sourceHasUnseen = useMemo(
    () => sourceEntries.some(isInboxEntryUnseen),
    [inboxSeenTick, sourceEntries],
  );

  const searchNarrowed = searchInput.trim().length > 0;
  const narrowedByUser = searchNarrowed || filtersActive;
  const sourceError = providerErrors[source] ?? null;

  const selectedByKey = visibleItems.find(
    (item) => inboxItemKey(item) === selectedKey,
  );
  const waitingForTarget =
    !!targetSelectionKey && selectedKey === targetSelectionKey;
  const selected =
    selectedByKey ?? (waitingForTarget ? null : visibleItems[0]) ?? null;
  const shownItemCount = listWindowSize(visibleItems.length, listLimit);
  const shownItems = visibleItems.slice(0, shownItemCount);
  const hasMoreItems = shownItemCount < visibleItems.length;

  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
    const scroller = listScrollRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [activeFilters, linearHiddenTeamIds, searchInput, source]);

  useEffect(() => {
    if (!hasMoreItems) return;
    const sentinel = loadMoreRef.current;
    const root = listScrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setListLimit((current) => current + LIST_PAGE_SIZE);
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, shownItemCount]);

  useEffect(() => {
    if (!selected) {
      if (!targetSelectionKey) setSelectedKey(null);
      return;
    }
    const key = inboxItemKey(selected);
    // Keep waiting while the exact cache-miss lookup loads. Otherwise the
    // current list's first row replaces the requested key.
    if (
      targetSelectionKey &&
      selectedKey === targetSelectionKey &&
      key !== targetSelectionKey
    ) {
      return;
    }
    if (key !== selectedKey) setSelectedKey(key);
  }, [selected, selectedKey, targetSelectionKey]);

  const onFiltersChange = (next: InboxFilters) => {
    const pruned = pruneInboxFilters(
      next,
      projects.map((project) => project.path),
    );
    setFilters(pruned);
    saveInboxFilters(pruned);
  };

  const onSourceChange = (next: InboxSource) => {
    setSource(next);
    saveInboxSource(next);
  };

  const onFilterButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (filterMenu) {
      setFilterMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setFilterMenu({
      x: rect.right - INBOX_FILTER_MENU_WIDTH,
      y: rect.bottom + 2,
    });
  };

  const list = (
    <div
      ref={resize.setPaneRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-content/10"
    >
      <div className="flex h-9 shrink-0 items-center gap-px border-b border-content/10 px-2">
        {visibleSources.length > 0 ? (
          <div
            role="tablist"
            aria-label={t("Inbox source")}
            className="flex min-w-0 basis-0 items-center gap-px"
            style={{ flexGrow: visibleSources.length }}
          >
            {visibleSources.map((option) => (
              <InboxSourceTab
                key={option}
                source={option}
                selected={source === option}
                onSelect={onSourceChange}
              />
            ))}
          </div>
        ) : null}
        {connectableSources.length > 0 ? (
          <button
            ref={connectButtonRef}
            type="button"
            aria-label={t("Connect an inbox source")}
            aria-haspopup="menu"
            aria-expanded={connectMenuOpen}
            title={t("Connect an inbox source")}
            onClick={() => setConnectMenuOpen((open) => !open)}
            className={`flex h-6 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] leading-none ${
              connectMenuOpen
                ? "bg-content/10 text-content"
                : "text-content/40 hover:bg-content/5 hover:text-content"
            }`}
          >
            <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 truncate">{t("Add connection")}</span>
          </button>
        ) : null}
      </div>
      {noSourcesConnected ? null : (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-content/10 px-2">
          <div className="relative flex h-7 min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("Filter inbox")}
              aria-label={t("Filter inbox")}
              spellCheck={false}
              autoComplete="off"
              className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
            />
          </div>
          <button
            type="button"
            title={t("Filter inbox")}
            aria-label={t("Filter inbox")}
            aria-expanded={!!filterMenu}
            aria-haspopup="menu"
            onClick={onFilterButtonClick}
            className={`grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content ${
              filterMenu || filtersActive ? "bg-content/10 text-content" : ""
            }`}
          >
            <ListFilter className="size-3" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title={t("Mark all as read")}
            aria-label={t("Mark all as read")}
            disabled={!sourceHasUnseen}
            onClick={() => markInboxItemsSeen(sourceEntries)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-content/45"
          >
            <CheckCheck className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={t("Refresh")}
            onClick={() => setRefresh((value) => value + 1)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
          >
            {loading || revalidating ? (
              <LoaderCircle
                className="size-3.5 animate-spin"
                strokeWidth={1.75}
              />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          {source === "notion" ? (
            <button
              type="button"
              title={t("New Notion page")}
              aria-label={t("New Notion page")}
              onClick={() => setNotionEditor({ mode: "create" })}
              className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      )}
      <div
        ref={setListScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none"
      >
        {noSourcesConnected ? (
          <p className="px-3 py-3 text-[12px] text-content/50">{t("Add a connection to start using the Inbox.")}</p>
        ) : sourceError && visibleItems.length === 0 ? (
          <p className="px-3 py-2 text-pretty text-[12px] text-content/50">
            {t(classifyInboxError(sourceError))}
          </p>
        ) : loading && items.length === 0 ? (
          <div className="flex justify-center py-10 text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : visibleItems.length === 0 ? (
          <p className="px-3 py-2 text-pretty text-[12px] text-content/50">
            {t(
              narrowedByUser
                ? searchNarrowed
                  ? source === "linear"
                    ? "No matching Linear issues"
                    : source === "gitlab"
                      ? "No matching issues or merge requests"
                      : source === "jira"
                        ? "No matching Jira issues"
                        : source === "clickup"
                          ? "No matching ClickUp tasks"
                          : source === "notion"
                            ? "No matching Notion pages"
                            : "No matching issues or pull requests"
                  : source === "linear"
                    ? "No Linear issues match these filters"
                    : source === "gitlab"
                      ? "No GitLab items match these filters"
                      : source === "jira"
                        ? "No Jira issues match these filters"
                        : source === "clickup"
                          ? "No ClickUp tasks match these filters"
                          : source === "notion"
                            ? "No Notion pages match these filters"
                            : "No issues or pull requests match these filters"
                : source === "linear"
                  ? "No Linear issues"
                  : source === "gitlab"
                    ? activeFilters.assignedToMe
                      ? "Nothing needs your attention"
                      : projects.length === 0
                        ? "Open a project to fill the inbox"
                        : "No matching issues or merge requests"
                    : projects.length === 0
                      ? "Open a project to fill the inbox"
                      : source === "jira"
                        ? "No Jira issues"
                        : source === "clickup"
                          ? "No ClickUp tasks"
                          : source === "notion"
                            ? "No Notion pages"
                            : "No matching issues or pull requests",
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 p-1.5">
            {shownItems.map((item) => {
              const key = inboxItemKey(item);
              const projectId = projectKey(item.projectPath);
              const relatedSessions = relatedSessionsForInboxItem(
                item,
                sessions,
              );
              return (
                <li key={key}>
                  <InboxCard
                    item={item}
                    active={selected != null && key === inboxItemKey(selected)}
                    logoPath={resolveTabGroupLogo(projectId, logos)}
                    mascotName={resolveTabGroupMascot(projectId, groupMascots)}
                    mascotColor={resolveTabGroupColor(
                      projectId,
                      groupColors,
                      groupCustomColors,
                      projectName(item.projectPath),
                    )}
                    relatedSessionCount={relatedSessions.length}
                    onSelect={() => {
                      markInboxItemSeen({
                        key,
                        updatedAt: item.updatedAt,
                      });
                      setSelectedKey(key);
                    }}
                  />
                </li>
              );
            })}
            {hasMoreItems ? (
              <li ref={loadMoreRef} aria-hidden className="h-px list-none" />
            ) : null}
          </ul>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Resize inbox list")}
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </div>
  );

  const filtersPortal = filterMenu ? (
    <InboxFiltersMenu
      x={filterMenu.x}
      y={filterMenu.y}
      projects={projectOptions}
      linearProjects={linearProjects}
      linearTeams={linearTeams}
      hiddenLinearTeamIds={linearHiddenTeamIds}
      source={source}
      filters={activeFilters}
      onChange={onFiltersChange}
      onLinearTeamsChange={saveHiddenLinearTeamIds}
      onClose={() => setFilterMenu(null)}
    />
  ) : null;

  const connectPortal =
    connectMenuOpen && connectableSources.length > 0 ? (
      <InboxConnectMenu
        anchor={connectButtonRef}
        sources={connectableSources}
        onConnect={onOpenIntegrations}
        onClose={() => setConnectMenuOpen(false)}
      />
    ) : null;

  return (
    <div
      role="region"
      aria-label={t("Inbox")}
      data-app-inbox
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-content/10"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <Inbox
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-content">{t("Inbox")}</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        {list}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1">
            <InboxDetailBody
              item={selected}
              cwd={cwd}
              projects={projectOptions}
              revision={refresh}
              relatedSessions={
                selected ? relatedSessionsForInboxItem(selected, sessions) : []
              }
              onDiscuss={() => setDiscussionOpen(true)}
              onStart={onStart}
              onOpenSession={onOpenSession}
              onEditNotion={(item) =>
                setNotionEditor({ mode: "edit", target: notionEditTarget(item) })
              }
              onMutated={() => setRefresh((value) => value + 1)}
            />
          </div>
          {discussionOpen && selected ? (
            <InboxDiscussionPanel
              onOpen={onAsk}
              onRestart={onAskRestart}
              onMount={onAskMount}
              key={inboxAskKey(selected)}
              item={selected}
              onClose={() => setDiscussionOpen(false)}
            />
          ) : null}
        </div>
      </div>
      {filtersPortal}
      {connectPortal}
      {notionEditor ? (
        <NotionTaskEditor
          mode={notionEditor.mode}
          target={notionEditor.target}
          onClose={() => setNotionEditor(null)}
          onSaved={() => setNotionEditor(null)}
        />
      ) : null}
    </div>
  );
}

function notionEditTarget(item: InboxItem): NotionEditTarget {
  return {
    id: item.id ?? "",
    title: item.title,
    status: item.state,
    labels: item.labels.map((label) => label.name),
  };
}

function InboxDetailBody({
  item,
  cwd,
  projects,
  revision = 0,
  relatedSessions,
  onDiscuss,
  onStart,
  onOpenSession,
  onEditNotion,
  onMutated,
}: {
  item: InboxItem | null;
  cwd: string;
  projects: InboxProjectOption[];
  revision?: number;
  relatedSessions: readonly SessionSummary[];
  onDiscuss?: () => void;
  onStart?: (item: InboxItem, body?: string) => void | Promise<void>;
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  onEditNotion?: (item: InboxItem) => void;
  onMutated?: () => void;
}) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Inbox className="mb-3 size-6 text-content/30" strokeWidth={1.75} />
        <p className="text-[13px] text-content/45">{t("Select an inbox item")}</p>
      </div>
    );
  }
  return (
    <InboxDetail
      key={inboxItemKey(item)}
      item={item}
      cwd={cwd}
      projects={projects}
      revision={revision}
      relatedSessions={relatedSessions}
      onDiscuss={onDiscuss}
      onStart={onStart}
      onOpenSession={onOpenSession}
      onEditNotion={onEditNotion}
      onMutated={onMutated}
    />
  );
}

type InboxStatusMark = {
  Icon: IconComponent;
  className: string;
  label: string;
};

/** Status reads from the glyph first and the color second, so it survives color blindness. */
function inboxStatusMark(item: InboxItem): InboxStatusMark {
  const label = inboxItemStatus(item);
  const pr = item.kind === "pr";
  if (label === "Draft") {
    return {
      Icon: GitPullRequestDraft,
      className: "text-content/50",
      label,
    };
  }
  if (label === "Merged") {
    return { Icon: GitMerge, className: "text-violet-400/90", label };
  }
  if (label === "Closed") {
    return {
      Icon: pr ? GitPullRequestClosed : CircleX,
      className: "text-rose-400/90",
      label,
    };
  }
  return {
    Icon: pr ? GitPullRequest : CircleDot,
    className: "text-emerald-400/90",
    label,
  };
}

function InboxCard({
  item,
  active,
  logoPath,
  mascotName,
  mascotColor,
  relatedSessionCount,
  onSelect,
}: {
  item: InboxItem;
  active: boolean;
  logoPath: string | null;
  mascotName: string | null;
  mascotColor: string;
  relatedSessionCount: number;
  onSelect: () => void;
}) {
  useInboxSeenTick();
  const status = inboxStatusMark(item);
  const kindLabel =
    item.kind === "pr"
      ? item.provider === "gitlab"
        ? "Merge request"
        : "Pull request"
      : "Issue";
  const time = formatRelativeTime(item.updatedAt);
  const name = projectName(item.projectPath);
  const tracker = isTrackerProvider(item.provider);
  const source = tracker ? item.teamName || item.repo : item.repo || name;
  const attentionLabel =
    item.provider === "gitlab"
      ? gitlabAttentionLabel(item.attentionReason ?? "")
      : "";
  const unseen = isInboxEntryUnseen({
    key: inboxItemKey(item),
    updatedAt: item.updatedAt,
  });

  return (
    <button
      type="button"
      title={item.title}
      aria-current={active ? "true" : undefined}
      aria-label={`${status.label} ${kindLabel.toLowerCase()} ${inboxItemRef(
        item,
      )}: ${item.title}${attentionLabel ? `, ${attentionLabel}` : ""}${unseen ? ", new" : ""}${relatedSessionCount > 0 ? `, ${relatedSessionCount} related ${relatedSessionCount === 1 ? "thread" : "threads"}` : ""}`}
      onClick={onSelect}
      className={`flex w-full flex-col rounded-md border px-2.5 py-2 text-left ${
        active
          ? "border-transparent bg-content/10 text-content"
          : "border-transparent text-content/80 hover:bg-content/5 hover:text-content"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <InboxProviderMark
            provider={item.provider}
            className="size-3.5 shrink-0"
          />
          <status.Icon
            className={`size-3 shrink-0 ${status.className}`}
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-[11px] text-content/50">
            {kindLabel} · {inboxItemRef(item)}
            {attentionLabel ? ` · ${attentionLabel}` : ""}
          </span>
        </span>
        {relatedSessionCount > 0 || time || unseen ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {relatedSessionCount > 0 ? (
              <span
                title={`${relatedSessionCount} related ${relatedSessionCount === 1 ? "thread" : "threads"}`}
                className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-accent"
              >
                <MessageMultiple className="size-3" strokeWidth={1.75} />
                {relatedSessionCount}
              </span>
            ) : null}
            {time ? (
              <span className="text-[11px] tabular-nums text-content/45">
                {time}
              </span>
            ) : null}
            {unseen ? (
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="mt-1 line-clamp-1 text-[13px] font-semibold leading-snug text-content">
        {item.title}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-content/45">
          {tracker || !item.projectPath ? null : logoPath ? (
            <ProjectLogoIcon
              path={logoPath}
              className="size-3.5 shrink-0 rounded-sm"
              imageClassName="size-3.5"
            />
          ) : (
            <ProjectMascot
              project={name}
              color={mascotColor}
              name={mascotName}
              className="size-3 shrink-0"
            />
          )}
          <span className="min-w-0 truncate">{source}</span>
        </span>
        {item.labels.length > 0 ? (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {item.labels.slice(0, 2).map((label) => (
              <InboxLabel key={label.name} label={label} compact />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function inboxShowsFullFileDiff(item: InboxItem): boolean {
  return item.provider === "github" && item.kind === "pr";
}

export function InboxDetail({
  item,
  cwd,
  projects,
  revision,
  relatedSessions,
  onDiscuss,
  onStart,
  onOpenSession,
  onEditNotion,
  onMutated,
}: {
  item: InboxItem;
  cwd: string;
  projects: InboxProjectOption[];
  revision: number;
  relatedSessions: readonly SessionSummary[];
  onDiscuss?: () => void;
  onStart?: (item: InboxItem, body?: string) => void | Promise<void>;
  onOpenSession?: (sessionId: string) => void | Promise<void>;
  onEditNotion?: (item: InboxItem) => void;
  onMutated?: () => void;
}) {
  const detailLock = useLockOverscroll<HTMLDivElement>();
  const linear = item.provider === "linear";
  const gitlab = item.provider === "gitlab";
  const jira = item.provider === "jira";
  const clickup = item.provider === "clickup";
  const notion = item.provider === "notion";
  const tracker = linear || jira || clickup || notion;
  const isPr = !tracker && item.kind === "pr";
  const githubKind =
    item.provider === "github" && (item.kind === "issue" || item.kind === "pr")
      ? item.kind
      : null;
  const gitlabKind =
    gitlab && (item.kind === "issue" || item.kind === "pr") ? item.kind : null;
  const cached = linear
    ? peekLinearIssueDetails(item.id ?? "")
    : jira
      ? peekJiraIssueDetails(item.id ?? "")
      : clickup
        ? peekClickUpTaskDetails(item.id ?? "")
        : notion
          ? peekNotionTaskDetails(item.id ?? "")
          : gitlabKind
            ? peekGitlabWorkItemDetails(item.repo, gitlabKind, item.number)
            : githubKind
              ? peekGithubWorkItemDetails(
                  item.projectPath,
                  githubKind,
                  item.number,
                )
              : null;
  const cachedDiff = isPr
    ? gitlab
      ? peekGitlabMrDiff(item.repo, item.number)
      : peekGithubPrDiff(item.projectPath, item.number)
    : null;
  const cachedThread = linear
    ? peekLinearIssueThread(item.id ?? "")
    : jira
      ? peekJiraIssueThread(item.id ?? "")
      : clickup
        ? peekClickUpTaskThread(item.id ?? "")
        : notion
          ? peekNotionTaskThread(item.id ?? "")
          : gitlabKind
            ? peekGitlabWorkItemThread(
                item.repo,
                gitlabKind,
                item.number,
              )
            : githubKind
              ? peekGithubWorkItemThread(
                  item.projectPath,
                  githubKind,
                  item.number,
                )
              : null;
  const [details, setDetails] = useState<GithubWorkItemDetails | null>(cached);
  const [loading, setLoading] = useState(cached == null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "code">("summary");
  const [diffMode, setDiffMode] = useState<"hunks" | "full">("hunks");
  const fullFile = inboxShowsFullFileDiff(item) && diffMode === "full";
  const [prDiff, setPrDiff] = useState<GithubPrDiff | null>(cachedDiff);
  const [diffLoading, setDiffLoading] = useState(isPr && cachedDiff == null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [thread, setThread] = useState<
    | GithubWorkItemThread
    | LinearIssueThread
    | GitlabWorkItemThread
    | JiraIssueThread
    | ClickUpTaskThread
    | NotionTaskThread
    | null
  >(cachedThread);
  const [threadLoading, setThreadLoading] = useState(cachedThread == null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<InboxReplyTarget | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<GithubRepoMeta | null>(null);
  const defaultProject =
    projects.find((project) => sameProjectPath(project.path, cwd))?.path ??
    projects[0]?.path ??
    cwd;
  const [startProject, setStartProject] = useState(defaultProject);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const chooseStartProject = linear || (gitlab && !item.projectPath);
  const status = tracker
    ? item.state || inboxItemStatus(item)
    : inboxItemStatus(item);
  const statusMark = inboxStatusMark(item);

  const source = tracker
    ? item.teamName || item.repo
    : item.repo || projectName(item.projectPath);
  const attentionLabel = gitlab
    ? gitlabAttentionLabel(item.attentionReason ?? "")
    : "";
  const markdownCwd = chooseStartProject
    ? startProject || cwd
    : item.projectPath || cwd;
  const authorName = details?.author?.trim() ?? "";
  const extraAssignees = item.assignees.filter(
    (person) =>
      !authorName ||
      person.login.trim().toLowerCase() !== authorName.toLowerCase(),
  );
  const showAssignment =
    !tracker && (extraAssignees.length > 0 || item.assignees.length === 0);
  const reviewDecision =
    details?.reviewDecision?.trim() || thread?.reviewDecision?.trim() || "";
  const reviewLabel = githubReviewDecisionLabel(reviewDecision);
  const reviewClass =
    reviewDecision.toUpperCase() === "APPROVED"
      ? "text-emerald-400/90"
      : reviewDecision.toUpperCase() === "CHANGES_REQUESTED"
        ? "text-rose-400/90"
        : "text-content/50";
  const baseRef =
    details?.baseRefName?.trim() || thread?.baseRefName?.trim() || "";
  const headRef =
    details?.headRefName?.trim() || thread?.headRefName?.trim() || "";
  const prDetails = asGithubPrDetails(details);

  const draftKey = reviewDraftKey(item.projectPath, item.number);
  const [reviewDraft, setReviewDraft] = useState<PrReviewDraft>(
    () => peekReviewDraft(draftKey) ?? emptyReviewDraft(),
  );
  const [reviewPublishCount, setReviewPublishCount] = useState(0);

  useEffect(() => {
    setReviewDraft(peekReviewDraft(draftKey) ?? emptyReviewDraft());
  }, [draftKey]);

  const updateDraft = (next: PrReviewDraft) => {
    setReviewDraft(next);
    saveReviewDraft(draftKey, next);
  };

  useEffect(() => {
    let cancelled = false;
    const id = item.id ?? "";
    const cachedDetails = linear
      ? peekLinearIssueDetails(id)
      : jira
        ? peekJiraIssueDetails(id)
        : clickup
          ? peekClickUpTaskDetails(id)
          : notion
            ? peekNotionTaskDetails(id)
            : gitlabKind
              ? peekGitlabWorkItemDetails(
                  item.repo,
                  gitlabKind,
                  item.number,
                )
              : githubKind
                ? peekGithubWorkItemDetails(
                    item.projectPath,
                    githubKind,
                    item.number,
                  )
                : null;
    if (cachedDetails) {
      setDetails(cachedDetails);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
      setDetails(null);
    }
    const pending = linear
      ? id
        ? linearIssueDetails(id)
        : Promise.reject(new Error("Missing Linear issue"))
      : jira
        ? id
          ? jiraIssueDetails(id)
          : Promise.reject(new Error("Missing Jira issue"))
        : clickup
          ? id
            ? clickUpTaskDetails(id)
            : Promise.reject(new Error("Missing ClickUp task"))
          : notion
            ? id
              ? notionTaskDetails(id)
              : Promise.reject(new Error("Missing Notion page"))
            : gitlabKind
              ? gitlabWorkItemDetails(item.repo, gitlabKind, item.number)
              : githubKind
                ? githubWorkItemDetails(
                    item.projectPath,
                    githubKind,
                    item.number,
                  )
                : Promise.reject(new Error("Unknown inbox item"));
    void pending
      .then((next) => {
        if (cancelled) return;
        setDetails(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedDetails) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    githubKind,
    gitlabKind,
    item.id,
    item.number,
    item.projectPath,
    item.repo,
    linear,
    jira,
    clickup,
    notion,
    revision,
  ]);

  useEffect(() => {
    let cancelled = false;
    const id = item.id ?? "";
    const cachedThread = linear
      ? peekLinearIssueThread(id)
      : jira
        ? peekJiraIssueThread(id)
        : clickup
          ? peekClickUpTaskThread(id)
          : notion
            ? peekNotionTaskThread(id)
            : gitlabKind
              ? peekGitlabWorkItemThread(
                  item.repo,
                  gitlabKind,
                  item.number,
                )
              : githubKind
                ? peekGithubWorkItemThread(
                    item.projectPath,
                    githubKind,
                    item.number,
                  )
                : null;
    if (cachedThread) {
      setThread(cachedThread);
      setThreadLoading(false);
      setThreadError(null);
    } else {
      setThreadLoading(true);
      setThreadError(null);
      setThread(null);
    }
    const pending = linear
      ? id
        ? linearIssueThread(id)
        : Promise.reject(new Error("Missing Linear issue"))
      : jira
        ? id
          ? jiraIssueThread(id)
          : Promise.reject(new Error("Missing Jira issue"))
        : clickup
          ? id
            ? clickUpTaskThread(id)
            : Promise.reject(new Error("Missing ClickUp task"))
          : notion
            ? id
              ? notionTaskThread(id)
              : Promise.reject(new Error("Missing Notion page"))
            : gitlabKind
              ? gitlabWorkItemThread(item.repo, gitlabKind, item.number)
              : githubKind
                ? githubWorkItemThread(
                    item.projectPath,
                    githubKind,
                    item.number,
                  )
                : null;
    if (!pending) {
      return () => {
        cancelled = true;
      };
    }
    void pending
      .then((next) => {
        if (cancelled) return;
        setThread(next);
        setThreadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedThread) return;
        setThreadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    githubKind,
    gitlabKind,
    item.id,
    item.number,
    item.projectPath,
    item.repo,
    linear,
    jira,
    clickup,
    notion,
    revision,
  ]);

  useEffect(() => {
    if (!isPr || tab !== "code") return;
    let cancelled = false;
    const cachedDiff = gitlab
      ? peekGitlabMrDiff(item.repo, item.number)
      : peekGithubPrDiff(item.projectPath, item.number, fullFile);
    if (cachedDiff) {
      setPrDiff(cachedDiff);
      setDiffLoading(false);
      setDiffError(null);
    } else {
      setDiffLoading(true);
      setDiffError(null);
      setPrDiff(null);
    }
    const pending = gitlab
      ? gitlabMrDiff(item.repo, item.number)
      : githubPrDiff(item.projectPath, item.number, { fullContext: fullFile });
    void pending
      .then((next) => {
        if (cancelled) return;
        setPrDiff(next);
        setDiffError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cachedDiff) return;
        setDiffError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    fullFile,
    gitlab,
    isPr,
    item.number,
    item.projectPath,
    item.repo,
    revision,
    tab,
  ]);

  useEffect(() => {
    if (!isPr || item.provider !== "github") {
      setRepoMeta(null);
      return;
    }
    let cancelled = false;
    void githubRepoMeta(item.projectPath)
      .then((meta) => {
        if (!cancelled) setRepoMeta(meta);
      })
      .catch(() => {
        if (!cancelled) setRepoMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPr, item.projectPath, item.provider, revision]);

  const postComment = async (body: string) => {
    setPosting(true);
    setPostError(null);
    try {
      if (linear) {
        const id = item.id ?? "";
        await linearIssueComment(id, body, { parentId: replyTo?.id });
        setReplyTo(null);
        try {
          setThread(await linearIssueThread(id, { force: true }));
        } catch (err: unknown) {
          setPostError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (jira || clickup || notion) {
        const id = item.id ?? "";
        await (jira
          ? jiraIssueComment(id, body, { parentId: replyTo?.id })
          : clickup
            ? clickUpTaskComment(id, body, { parentId: replyTo?.id })
            : notionTaskComment(id, body));
        setReplyTo(null);
        try {
          setThread(
            await (jira
              ? jiraIssueThread(id, { force: true })
              : clickup
                ? clickUpTaskThread(id, { force: true })
                : notionTaskThread(id, { force: true })),
          );
        } catch (err: unknown) {
          setPostError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (gitlabKind) {
        await gitlabWorkItemComment(item.repo, gitlabKind, item.number, body);
        setReplyTo(null);
        try {
          setThread(
            await gitlabWorkItemThread(item.repo, gitlabKind, item.number, {
              force: true,
            }),
          );
        } catch (err: unknown) {
          setPostError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (!githubKind) throw new Error("Unknown inbox item");
      await githubWorkItemComment(
        item.projectPath,
        githubKind,
        item.number,
        body,
        { inReplyTo: replyTo?.threadId },
      );
      setReplyTo(null);
      try {
        setThread(
          await githubWorkItemThread(
            item.projectPath,
            githubKind,
            item.number,
            {
              force: true,
            },
          ),
        );
      } catch (err: unknown) {
        setPostError(err instanceof Error ? err.message : String(err));
      }
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setPosting(false);
    }
  };

  const refreshDetails = async () => {
    if (!githubKind) return;
    invalidateGithubItem(item.projectPath, githubKind, item.number);
    const next = await githubWorkItemDetails(
      item.projectPath,
      githubKind,
      item.number,
    );
    setDetails(next);
    onMutated?.();
  };

  const runAction = async (key: string, work: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(key);
    setActionError(null);
    try {
      await work();
      await refreshDetails();
    } catch (error) {
      setActionError(inboxErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const confirmPr = (message: string, okLabel: string) =>
    ask(message, { title: t("MonoCode"), kind: "warning", okLabel });

  const onMerge = (method: PrMergeMethod) =>
    runAction("merge", async () => {
      const ok = await confirmPr(
        t("Merge pull request #{number} with {method}?", {
          number: item.number,
          method: t(METHOD_LABELS_FOR_CONFIRM[method]),
        }),
        t("Merge"),
      );
      if (!ok) return;
      await githubPrMerge(item.projectPath, item.number, method, false);
    });

  const onToggleState = (close: boolean) =>
    runAction("state", async () => {
      if (close) {
        const ok = await confirmPr(
          t("Close pull request #{number}?", { number: item.number }),
          t("Close pull request"),
        );
        if (!ok) return;
      }
      await githubPrState(item.projectPath, item.number, close);
    });

  const publishReview = (event: PrReviewEvent, body: string) =>
    runAction("review", async () => {
      if (!prDetails?.id) throw new Error("Missing pull request id");
      await githubPrReview(
        item.projectPath,
        item.number,
        prDetails.id,
        event,
        body,
        reviewDraft.comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          side: comment.side,
          body: comment.body,
        })),
      );
      clearReviewDraft(draftKey);
      updateDraft(emptyReviewDraft());
      setReviewPublishCount((value) => value + 1);
    });

  const onSubmitReview = (event: PrReviewEvent) => {
    if (event !== "approve" && reviewDraft.comments.length === 0) {
      setActionError(t("Add a review comment before requesting changes"));
      return;
    }
    void publishReview(event, "");
  };

  const statusPill = (
    <span
      className={`inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-content/10 px-2 text-[12px] ${statusMark.className}`}
    >
      <statusMark.Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{status || t("Open")}</span>
    </span>
  );
  const trackerAssignees =
    item.assignees.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {item.assignees.map((person) => (
          <span
            key={person.login}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-content/10 px-1.5 py-0.5 text-[12px] text-content/75"
          >
            <InboxPerson
              name={person.login}
              avatarUrl={inboxPersonAvatarUrl(
                item.provider,
                person.login,
                person.avatarUrl,
              )}
              size={16}
            />
            <span className="truncate">{person.login}</span>
          </span>
        ))}
      </div>
    ) : (
      <span className="text-[12px] text-content/45">{t("Unassigned")}</span>
    );
  const trackerTags =
    item.labels.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {item.labels.map((label) => (
          <span
            key={label.name}
            className="inline-flex items-center rounded-md border border-content/10 px-1.5 py-0.5 text-[11px] text-content/70"
          >
            {label.name}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-[12px] text-content/45">{t("None")}</span>
    );

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={`flex min-h-0 flex-1 flex-col @3xl:flex-row ${
          tracker ? "overflow-y-auto overscroll-none @3xl:overflow-hidden" : ""
        }`}
      >
      <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-inbox-detail-header
        className="relative z-10 shrink-0 border-b border-content/10"
      >
        <div
          className={`mx-auto flex w-full max-w-5xl flex-col gap-2.5 px-8 pt-5 ${
            isPr ? "" : "pb-5"
          }`}
        >
          <header className="flex flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-2 text-[12px] text-content/50">
              <InboxProviderMark
                provider={item.provider}
                className="size-3.5 shrink-0"
              />
              <span className="shrink-0">
                {item.kind === "pr"
                  ? gitlab
                    ? "Merge request"
                    : "Pull request"
                  : "Issue"}
              </span>
              <span className="shrink-0 tabular-nums">
                {inboxItemRef(item)}
              </span>
              <span
                className={`flex shrink-0 items-center gap-1 ${statusMark.className}`}
              >
                <statusMark.Icon className="size-3.5" strokeWidth={1.75} />
                {status}
              </span>
              {attentionLabel ? (
                <span className="shrink-0 text-accent">{attentionLabel}</span>
              ) : null}
              {source ? (
                <span className="min-w-0 truncate">{source}</span>
              ) : null}
            </div>
            <h1
              title={item.title}
              className="line-clamp-2 text-[20px] font-semibold leading-tight text-content"
            >
              {item.title}
            </h1>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[12px] text-content/50">
              {authorName ? (
                <InboxPerson
                  name={authorName}
                  avatarUrl={inboxPersonAvatarUrl(
                    item.provider,
                    authorName,
                    details?.authorAvatarUrl,
                  )}
                  size={16}
                />
              ) : null}
              {showAssignment ? (
                <>
                  {authorName ? <span aria-hidden>·</span> : null}
                  {extraAssignees.length > 0 ? (
                    <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                      {extraAssignees.map((person) => (
                        <InboxPerson
                          key={person.login}
                          name={person.login}
                          avatarUrl={inboxPersonAvatarUrl(
                            item.provider,
                            person.login,
                            person.avatarUrl,
                          )}
                          size={16}
                        />
                      ))}
                    </span>
                  ) : (
                    <span>{t("Unassigned")}</span>
                  )}
                </>
              ) : null}
              {item.createdAt && formatRelativeTime(item.createdAt) ? (
                <>
                  <span aria-hidden>·</span>
                  <time
                    dateTime={item.createdAt}
                    title={new Date(item.createdAt).toLocaleString()}
                  >
                    {t("Created {time}", {
                      time: formatRelativeTime(item.createdAt) ?? "",
                    })}
                  </time>
                </>
              ) : null}
              {formatRelativeTime(item.updatedAt) ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {t("Updated {time}", {
                      time: formatRelativeTime(item.updatedAt) ?? "",
                    })}
                  </span>
                </>
              ) : null}
              {baseRef && headRef ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <GitCompare
                      className="size-3 shrink-0"
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 truncate">
                      {baseRef} ← {headRef}
                    </span>
                  </span>
                </>
              ) : null}
              {reviewLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span className={reviewClass}>{reviewLabel}</span>
                </>
              ) : null}
            </div>
            {relatedSessions.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <span className="mr-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-content/45">
                  <MessageMultiple className="size-3.5" strokeWidth={1.75} />
                  Related {relatedSessions.length === 1 ? "thread" : "threads"}
                </span>
                {relatedSessions.map((session) => {
                  const title = sessionDisplayTitle(
                    session.title,
                    session.harness,
                  );
                  return (
                    <button
                      key={session.id}
                      type="button"
                      title={`Open thread: ${title}`}
                      onClick={() => void onOpenSession?.(session.id)}
                      className="inline-flex min-w-0 max-w-64 items-center gap-1 rounded-md bg-content/5 px-2 py-1 text-[11px] text-content/70 hover:bg-content/10 hover:text-content"
                    >
                      <span className="truncate">{title}</span>
                      {session.archived ? (
                        <span className="shrink-0 text-content/40">
                          Archived
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {isPr && item.provider === "github" && prDetails ? (
                <PrActions
                  details={prDetails}
                  viewerLogin={repoMeta?.viewerLogin ?? ""}
                  busy={busyAction}
                  onSubmitReview={onSubmitReview}
                  onToggleState={onToggleState}
                  onMerge={onMerge}
                />
              ) : null}
              {onStart && item.kind !== "pr" ? (
                <>
                  <button
                    type="button"
                    disabled={
                      starting ||
                      (chooseStartProject &&
                        (projects.length === 0 ||
                          !startProject ||
                          loading ||
                          !!error))
                    }
                    onClick={() => {
                      if (starting) return;
                      setStarting(true);
                      setStartError(null);
                      const next = chooseStartProject
                        ? { ...item, projectPath: startProject }
                        : item;
                      void Promise.resolve(
                        onStart(
                          next,
                          linear ? (details?.body ?? "") : undefined,
                        ),
                      )
                        .catch((err: unknown) => {
                          setStartError(
                            err instanceof Error ? err.message : String(err),
                          );
                        })
                        .finally(() => setStarting(false));
                    }}
                    className={`${ACTION_FILLED} disabled:cursor-default disabled:opacity-40`}
                  >
                    {starting ? t("Sending...") : t("Send to agent")}
                  </button>
                  {chooseStartProject ? (
                    <InboxProjectPicker
                      projects={projects}
                      value={startProject}
                      onChange={setStartProject}
                    />
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={onDiscuss}
                className={item.kind === "pr" ? ACTION_FILLED : ACTION_OUTLINE}
              >
                <MessageSquare className="size-3.5" strokeWidth={1.75} /> {t("Ask")}
              </button>
              {notion && onEditNotion ? (
                <button
                  type="button"
                  onClick={() => onEditNotion(item)}
                  className={ACTION_OUTLINE}
                >
                  <Pencil className="size-3.5" strokeWidth={1.75} /> {t("Edit")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void openUrl(item.url)}
                className={ACTION_GHOST}
              >
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
                {item.kind === "pr"
                  ? gitlab
                    ? t("Review on GitLab")
                    : t("Review on GitHub")
                  : linear
                    ? t("Open in Linear")
                    : jira
                      ? t("Open in Jira")
                      : clickup
                        ? t("Open in ClickUp")
                        : notion
                          ? t("Open in Notion")
                          : gitlab
                            ? t("Open on GitLab")
                            : t("Open on GitHub")}
              </button>
            </div>
            {startError ? (
              <p className="text-[12px] text-red-400/90">{startError}</p>
            ) : null}
            {actionError ? (
              <p className="text-[12px] text-red-400/90">{actionError}</p>
            ) : null}
          </header>
          {isPr ? (
            <div className="flex h-9 items-stretch gap-4">
              <div
                role="tablist"
                aria-label={
                  gitlab ? "Merge request sections" : "Pull request sections"
                }
                className="flex items-stretch gap-4"
              >
                <InboxDetailTab
                  label="Summary"
                  selected={tab === "summary"}
                  onSelect={() => setTab("summary")}
                />
                <InboxDetailTab
                  label="Code"
                  selected={tab === "code"}
                  onSelect={() => setTab("code")}
                />
              </div>
              {tab === "code" && inboxShowsFullFileDiff(item) ? (
                <div
                  role="group"
                  aria-label="Diff context"
                  className="ml-auto flex items-center self-center rounded-md border border-content/10 bg-content/[0.03] p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={diffMode === "hunks"}
                    onClick={() => setDiffMode("hunks")}
                    className={`rounded px-2.5 py-1 text-[11px] leading-none ${
                      diffMode === "hunks"
                        ? "bg-content/10 text-content"
                        : "text-content/45 hover:text-content/70"
                    }`}
                  >
                    Hunks
                  </button>
                  <button
                    type="button"
                    aria-pressed={diffMode === "full"}
                    onClick={() => setDiffMode("full")}
                    className={`rounded px-2.5 py-1 text-[11px] leading-none ${
                      diffMode === "full"
                        ? "bg-content/10 text-content"
                        : "text-content/45 hover:text-content/70"
                    }`}
                  >
                    Full file
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={detailLock}
        data-inbox-detail-scroll
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none"
      >
        <div
          className={`mx-auto flex w-full flex-col gap-5 px-8 py-5 ${tracker ? "max-w-3xl" : "max-w-5xl"}`}
        >
          {!tracker && item.labels.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.labels.map((label) => (
                <InboxLabel key={label.name} label={label} />
              ))}
            </div>
          ) : null}
          {isPr && item.provider === "github" && prDetails && repoMeta ? (
            <PrMetadataEditor
              details={prDetails}
              meta={repoMeta}
              busy={busyAction}
              onApply={(input) =>
                runAction("metadata", () =>
                  githubPrEdit(item.projectPath, item.number, input),
                )
              }
            />
          ) : null}
          {isPr && item.provider === "github" && tab === "code" ? (
            <PrReviewBar
              key={reviewPublishCount}
              draft={reviewDraft}
              busy={busyAction}
              onSubmit={publishReview}
              onDiscard={() => {
                clearReviewDraft(draftKey);
                updateDraft(emptyReviewDraft());
              }}
              onEdit={(id, body) => updateDraft(updateReviewComment(reviewDraft, id, body))}
              onRemove={(id) => updateDraft(removeReviewComment(reviewDraft, id))}
            />
          ) : null}
          {isPr && tab === "code" ? (
            diffLoading ? (
              <div className="flex justify-center py-10 text-content/40">
                <LoaderCircle
                  className="size-4 animate-spin"
                  strokeWidth={1.75}
                />
              </div>
            ) : diffError ? (
              <p className="text-[13px] text-content/50">{diffError}</p>
            ) : prDiff ? (
              <InboxPrDiff
                key={`${item.projectPath}:${item.number}:${revision}:${diffMode}`}
                diff={prDiff}
                fullFile={fullFile}
                onLineComment={({ filePath, line, body }) => {
                  const lineNumber = line.newNumber ?? line.oldNumber;
                  if (lineNumber == null) return;
                  updateDraft(
                    addReviewComment(reviewDraft, {
                      path: filePath,
                      line: lineNumber,
                      side: line.kind === "del" ? "left" : "right",
                      body,
                    }),
                  );
                }}
              />
            ) : (
              <p className="text-[13px] text-content/45">{t("No file changes")}</p>
            )
          ) : loading ? (
            <div className="flex justify-center py-10 text-content/40">
              <LoaderCircle
                className="size-4 animate-spin"
                strokeWidth={1.75}
              />
            </div>
          ) : error ? (
            <p className="text-[13px] text-content/50">{error}</p>
          ) : (
            <>
              {details?.body.trim() ? (
                <AgentMarkdown
                  text={details.body}
                  cwd={markdownCwd}
                  allowRemoteMedia
                />
              ) : (
                <p className="text-[13px] text-content/45">{t("No description")}</p>
              )}
              <InboxComments
                thread={thread}
                loading={threadLoading}
                error={threadError}
                cwd={markdownCwd}
                provider={item.provider}
                replyMode={
                  linear ? "parent" : gitlab || notion ? undefined : "thread"
                }
                onReply={setReplyTo}
              />
              <InboxCommentForm
                replyTo={replyTo}
                posting={posting}
                error={postError}
                onCancelReply={() => {
                  setReplyTo(null);
                  setPostError(null);
                }}
                onSubmit={postComment}
              />
            </>
          )}
        </div>
      </div>
      </div>
      {tracker ? (
        <aside className="shrink-0 border-t border-content/10 @3xl:w-[300px] @3xl:border-l @3xl:border-t-0">
          <div className="flex h-full flex-col gap-5 overflow-y-auto px-8 py-6 @3xl:px-5">
            <InboxProp label={t("Status")}>
              {notion && onEditNotion ? (
                <button
                  type="button"
                  onClick={() => onEditNotion(item)}
                  className="block transition-opacity hover:opacity-80"
                >
                  {statusPill}
                </button>
              ) : (
                statusPill
              )}
            </InboxProp>
            <InboxProp label={t("Assignee")}>{trackerAssignees}</InboxProp>
            <InboxProp label={t("Tags")}>{trackerTags}</InboxProp>
            <InboxProp label={t("Updated")}>
              <span className="text-[12px] text-content/70">
                {formatRelativeTime(item.updatedAt) || "—"}
              </span>
            </InboxProp>
            <InboxProp label={t("Source")}>
              <span className="block min-w-0 truncate text-[12px] text-content/70">
                {source || "—"}
              </span>
            </InboxProp>
            {notion && onEditNotion ? (
              <button
                type="button"
                onClick={() => onEditNotion(item)}
                className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-content/15 text-[12px] text-content/80 hover:bg-content/5"
              >
                <Pencil className="size-3.5" strokeWidth={1.75} />
                {t("Edit page")}
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
      </div>
    </div>
  );
}

function InboxProp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-content/40">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function InboxPerson({
  name,
  avatarUrl,
  size = 20,
  className = "",
}: {
  name: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(!avatarUrl);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setFailed(!avatarUrl);
  }, [avatarUrl]);

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
          className="shrink-0 rounded-full bg-content/10 object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="grid shrink-0 place-items-center rounded-full bg-content/12 font-medium text-content/55"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(9, Math.round(size * 0.45)),
          }}
        >
          {initial}
        </span>
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function InboxProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: InboxProjectOption[];
  value: string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected =
    projects.find((project) => sameProjectPath(project.path, value)) ??
    projects[0] ??
    null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || menu.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        disabled={projects.length === 0}
        onClick={() => setOpen((next) => !next)}
        className="inline-flex h-7 max-w-48 items-center gap-1.5 rounded-md border border-content/10 bg-content/5 px-2 text-[12px] text-content/80 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40"
      >
        {selected ? <InboxProjectMark project={selected} /> : null}
        <span className="min-w-0 truncate">
          {selected?.name ?? "Choose project"}
        </span>
        <ChevronDown
          className="size-3 shrink-0 text-content/45"
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <div
          ref={menu}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-full max-w-64 overflow-y-auto rounded-lg border border-content/10 bg-content/10 p-1 shadow-xl backdrop-blur-xl outline-none"
        >
          {projects.map((project) => {
            const active = selected
              ? sameProjectPath(project.path, selected.path)
              : false;
            return (
              <button
                key={project.path}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(project.path);
                  setOpen(false);
                }}
                className={`flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[12px] ${
                  active
                    ? "bg-content/10 text-content"
                    : "text-content/80 hover:bg-content/5 hover:text-content"
                }`}
              >
                <InboxProjectMark project={project} />
                <span className="min-w-0 truncate">{project.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InboxLabel({
  label,
  compact = false,
}: {
  label: GithubLabel;
  compact?: boolean;
}) {
  const color = labelColor(label.color);
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-px text-content/50 bg-content/8 ${
        compact ? "max-w-20 text-[10px]" : "text-[11px]"
      }`}
    >
      {color ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="min-w-0 truncate">{label.name}</span>
    </span>
  );
}

function labelColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex}`;
}
