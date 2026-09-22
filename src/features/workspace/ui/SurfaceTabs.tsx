import { openPath } from "@tauri-apps/plugin-opener";
import { isHtmlFilePath } from "../../sessions/model/fileKind";
import { GitCompare, GripVertical, Plus, Terminal, X } from "../../../shared/ui/icons";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { copyText } from "../../../platform/tauri/clipboard";
import { basename, revealPath } from "../../../platform/tauri/fs";
import {
  isAgentTab,
  isChangesTab,
  isCommitTab,
  isFilesystemTab,
  isPlanTab,
  isReleaseNotesTab,
  isReviewTab,
  isSessionChangesTab,
  isTerminalTab,
  type FilePaneTab,
} from "../model/layout";
import { displayPath } from "../../../shared/lib/paths";
import { IS_MAC, IS_WIN } from "../../../platform/tauri/platform";
import { releaseNotesTitle } from "../../../app/model/releaseNotes";
import { terminalTabLabel } from "../../terminal/model/terminalTab";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { useAnimatedReorder } from "../../../shared/hooks/useAnimatedReorder";
import { ExplorerMenu, type ExplorerMenuItem } from "../../files/ui/ExplorerMenu";
import { FileTypeIcon } from "../../files/ui/FileTypeIcon";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { t } from "../../../i18n";

type Props = {
  files: FilePaneTab[];
  activeFileId: string;
  dirtyFileIds: Set<string>;
  fileErrorCounts: Map<string, number>;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string) => void;
  onCloseOtherFiles: (fileId: string) => void;
  onReorder: (ids: string[]) => void;
  onPaneDragStart?: (event: ReactPointerEvent<HTMLElement>) => void;
  onNewTab?: () => void;
  label?: string;
  trailing?: ReactNode;
  /** Dense tab strip for narrow panels: fit-content tabs, tighter rows. */
  compact?: boolean;
  /** Rounded pill tabs (Synara-style terminal chrome). */
  pills?: boolean;
  newTabLabel?: string;
};

export type SurfaceTabPresentation = {
  name: string;
  label: string;
  iconName: string;
  tooltip: string;
};

type SurfaceTabMenu = {
  x: number;
  y: number;
  fileId: string;
};

const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : IS_WIN
    ? "Reveal in File Explorer"
    : "Open Containing Folder";

export function surfaceTabMenuItems(
  file: FilePaneTab,
  canCloseOthers = true,
): ExplorerMenuItem[] {
  const close: ExplorerMenuItem = {
    kind: "item",
    id: "close",
    label: t("Close"),
  };
  const closeOthers: ExplorerMenuItem = {
    kind: "item",
    id: "close-others",
    label: t("Close Others"),
    disabled: !canCloseOthers,
  };
  if (!isFilesystemTab(file) || isChangesTab(file)) {
    return [close, closeOthers];
  }

  return [
    ...(isHtmlFilePath(file.path)
      ? [
          {
            kind: "item" as const,
            id: "open-browser",
            label: t("Open in Browser"),
          },
        ]
      : []),
    { kind: "item", id: "open-default", label: t("Open in Default App") },
    { kind: "item", id: "reveal", label: t(REVEAL_LABEL) },
    { kind: "sep" },
    { kind: "item", id: "copy-path", label: t("Copy Path") },
    {
      kind: "item",
      id: "copy-relative-path",
      label: t("Copy Relative Path"),
    },
    { kind: "item", id: "copy-name", label: t("Copy File Name") },
    { kind: "sep" },
    close,
    closeOthers,
  ];
}

export function surfaceTabPresentation(
  file: FilePaneTab,
): SurfaceTabPresentation {
  if (isReleaseNotesTab(file)) {
    const title = releaseNotesTitle(file.releaseNotes.version);
    return {
      name: title,
      label: title,
      iconName: "CHANGELOG.md",
      tooltip: title,
    };
  }

  if (isChangesTab(file)) {
    return {
      name: "Changes",
      label: t("Changes"),
      iconName: "CHANGES",
      tooltip: t("Working tree changes"),
    };
  }

  if (isSessionChangesTab(file)) {
    return {
      name: "Session Changes",
      label: t("Session Changes"),
      iconName: "CHANGES",
      tooltip: t("Changes captured for this session only"),
    };
  }

  if (isAgentTab(file)) {
    const name = file.path.trim() || "Agent";
    return {
      name,
      label: name,
      iconName: "AGENT",
      tooltip: `${name} — orchestration agent`,
    };
  }

  if (isCommitTab(file)) {
    const name = file.commit.subject.trim() || file.commit.shortSha;
    return {
      name,
      label: name,
      iconName: "CHANGES",
      tooltip: `${file.commit.shortSha} — ${file.commit.subject}`,
    };
  }

  const review = isReviewTab(file);
  const terminal = isTerminalTab(file);
  const name = isPlanTab(file)
    ? file.plan.title.trim() || t("Plan")
    : terminal
      ? terminalTabLabel(file)
      : basename(file.path);
  return {
    name,
    label: review ? `${name} (${t("Working Tree")})` : name,
    iconName: isPlanTab(file) ? "plan.md" : name,
    tooltip: isPlanTab(file)
      ? name
      : terminal
        ? `${name} — ${file.cwd}`
        : review
          ? `${file.path} (${t("Working Tree")})`
          : file.path,
  };
}

/** Tab tooltip: the path, then what is wrong with it. */
export function appendProblems(title: string, errors: number): string {
  if (!errors) return title;
  return `${title} — ${t(errors === 1 ? "{count} problem" : "{count} problems", { count: errors })}`;
}

export function SurfaceTabs({
  files,
  activeFileId,
  dirtyFileIds,
  fileErrorCounts,
  onSelectFile,
  onCloseFile,
  onCloseOtherFiles,
  onReorder,
  onPaneDragStart,
  onNewTab,
  label = t("Open files"),
  trailing,
  compact = false,
  pills = false,
  newTabLabel = t("New tab"),
}: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<SurfaceTabMenu | null>(null);
  const fileIds = files.map((file) => file.id);
  const sortable = useAnimatedReorder(fileIds, onReorder);
  const canDrag = files.length > 1;
  const menuFile = menu
    ? files.find((file) => file.id === menu.fileId)
    : undefined;

  const onMenuPick = (id: string) => {
    if (!menuFile) return;
    setMenu(null);
    if (id === "close") {
      onCloseFile(menuFile.id);
      return;
    }
    if (id === "close-others") {
      onCloseOtherFiles(menuFile.id);
      return;
    }
    if (!isFilesystemTab(menuFile) || isChangesTab(menuFile)) return;

    if (id === "open-browser") {
      void openPath(menuFile.path);
      return;
    }

    let action: Promise<void>;
    switch (id) {
      case "open-default":
        action = openPath(menuFile.path);
        break;
      case "reveal":
        action = revealPath(menuFile.path);
        break;
      case "copy-path":
        action = copyText(menuFile.path);
        break;
      case "copy-relative-path":
        action = copyText(displayPath(menuFile.path, menuFile.cwd));
        break;
      case "copy-name":
        action = copyText(basename(menuFile.path));
        break;
      default:
        return;
    }
    void action.catch((error) => {
      console.error(`Failed to run file-tab action ${id}:`, error);
    });
  };

  useLayoutEffect(() => {
    if (sortable.draggingId) return;
    activeTabRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [activeFileId, sortable.draggingId]);

  return (
    <div className={`flex min-w-0 shrink-0 border-b border-content/10 ${
      pills ? "h-9 bg-transparent px-1.5" : "bg-content/2"
    } ${
      !pills && compact ? "h-8" : pills ? "" : "h-9"
    }`}>
      <div
        ref={lockOverscroll}
        role="tablist"
        aria-label={label}
        className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto overscroll-none"
      >
      {onPaneDragStart ? (
        <div
          role="button"
          title={t("Drag to reorder pane")}
          aria-label={t("Drag to reorder pane")}
          tabIndex={-1}
          className="grid h-full w-5 shrink-0 cursor-grab place-items-center text-content/35 hover:bg-content/5 hover:text-content/70 active:cursor-grabbing touch-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            onPaneDragStart(event);
          }}
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </div>
      ) : null}
      {files.map((file) => {
        const active = file.id === activeFileId;
        const dirty = dirtyFileIds.has(file.id);
        const errors = fileErrorCounts.get(file.id) ?? 0;
        const changes = isChangesTab(file);
        const commit = isCommitTab(file);
        const review = isReviewTab(file) && !changes;
        const terminal = isTerminalTab(file);
        const agent = isAgentTab(file) ? file.agent : null;
        const { label, iconName } = surfaceTabPresentation(file);
        const tabDraggable = canDrag;
        return (
          <div
            key={file.id}
            data-no-tooltip
            ref={(el) => {
              sortable.setItemRef(file.id, el);
              if (el && file.id === activeFileId) activeTabRef.current = el;
            }}
            className={`reorder-item tab-motion group relative flex shrink items-stretch ${
              pills
                ? `mx-0.5 my-auto h-7 w-max max-w-[11rem] rounded-full ${
                    active ? "bg-content/[0.08]" : "hover:bg-content/5"
                  }`
                : `border-r border-content/10 ${
                    compact
                      ? "w-max min-w-0 max-w-[11rem] touch-none"
                      : "w-52 min-w-28 touch-none"
                  } ${
                    active ? "bg-content/8" : "hover:bg-content/5"
                  }`
            } ${
              tabDraggable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"
            }`}
            onMouseDownCapture={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              onCloseFile(file.id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (
                (event.target as HTMLElement | null)?.closest("[data-no-drag]")
              ) {
                return;
              }
              onSelectFile(file.id);
              if (tabDraggable) sortable.onItemPointerDown(file.id, event);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectFile(file.id);
              setMenu({
                x: event.clientX,
                y: event.clientY,
                fileId: file.id,
              });
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (sortable.consumeClick()) return;
                onSelectFile(file.id);
              }}
              className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
                pills || compact ? "text-[12px]" : "text-[12px]"
              } ${
                pills
                  ? "px-2.5"
                  : compact
                    ? "px-2 pr-6"
                    : "px-3 pr-8"
              } ${
                tabDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              } ${
                active ? "text-content" : "text-content/55 hover:text-content"
              }`}
            >
              {terminal ? (
                <Terminal
                  className={`size-3.5 shrink-0 ${pills ? "group-hover:invisible" : ""}`}
                  strokeWidth={1.75}
                />
              ) : pills ? (
                <span className="grid size-3.5 shrink-0 place-items-center group-hover:invisible">
                  <FileTypeIcon name={iconName} isDir={false} size={14} />
                </span>
              ) : agent ? (
                <HarnessIcon
                  harness={agent.harness}
                  className="size-3.5 shrink-0"
                />
              ) : changes || commit ? (
                <GitCompare className="size-3.5 shrink-0" strokeWidth={1.75} />
              ) : (
                <FileTypeIcon name={iconName} isDir={false} size={15} />
              )}
              <span
                className={`min-w-0 flex-1 truncate ${review ? "italic" : ""} ${
                  errors
                    ? active
                      ? "text-red-400"
                      : "text-red-400/75 group-hover:text-red-400"
                    : ""
                }`}
              >
                {label}
              </span>
              {dirty ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-content/75"
                  title={t("Unsaved changes")}
                  aria-label={t("Unsaved changes")}
                />
              ) : null}
            </button>
            {pills ? (
            <button
              type="button"
              aria-label={t("Close {name}", { name: label })}
              data-no-drag
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onCloseFile(file.id);
              }}
              className="invisible absolute top-1/2 left-2.5 grid size-3.5 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-content/70 hover:text-content group-hover:visible [&_*]:pointer-events-none"
            >
              <X className="size-3" strokeWidth={1.75} />
            </button>
            ) : (
            <button
              type="button"
              aria-label={t("Close {name}", { name: label })}
              data-no-drag
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onCloseFile(file.id);
              }}
              className={`absolute top-1/2 grid -translate-y-1/2 cursor-pointer place-items-center rounded text-content/50 hover:bg-content/10 hover:text-content [&_*]:pointer-events-none ${
                compact ? "right-1 size-4" : "right-1.5 size-5"
              } ${
                active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
            )}
          </div>
        );
      })}
      {onNewTab ? (
        <button
          type="button"
          title={newTabLabel}
          aria-label={newTabLabel}
          data-no-drag
          onClick={onNewTab}
          className={`grid shrink-0 cursor-pointer place-items-center text-content/45 hover:text-content [&_*]:pointer-events-none ${
            pills
              ? "mx-0.5 size-7 rounded-full hover:bg-content/8"
              : compact
                ? "h-full w-7 hover:bg-content/8"
                : "h-full w-8 hover:bg-content/8"
          }`}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      {onPaneDragStart ? (
        <div
          className="min-w-4 flex-1 cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onPaneDragStart(event);
          }}
        />
      ) : null}
      </div>
      {trailing}
      {menu && menuFile ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          items={surfaceTabMenuItems(menuFile, files.length > 1)}
          ariaLabel={t("File tab actions")}
          onPick={onMenuPick}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
