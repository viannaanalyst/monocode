import {
  LayoutTwoColumn,
  LayoutTwoRow,
  Trash2,
} from "../chrome/icons";
import { useEffect, useRef, useState } from "react";
import { SurfaceTabs } from "../chrome/SurfaceTabs";
import { IconButton } from "../chrome/TitleBar";
import { suppressTextSelection } from "../lib/drag";
import {
  isDockSplit,
  type ProjectTerminalDock,
} from "../lib/projectTerminal";
import {
  layoutLeaves,
  layoutSashes,
  setSplitRatio,
  type LayoutNode,
  type LayoutSash,
  type SplitDir,
} from "../lib/layout";
import { MOD } from "../lib/platform";
import type { TerminalMetaPatch } from "../lib/terminalTab";
import { TerminalView } from "./TerminalView";
import { t, withShortcut } from "../i18n";

type Props = {
  dock: ProjectTerminalDock;
  focused: boolean;
  onFocus: () => void;
  onAddTerminal: (fromFileId?: string) => void;
  onSelectTerminal: (fileId: string) => void;
  onCloseTerminal: (fileId: string) => void;
  onCloseOtherTerminals: (fileId: string) => void;
  onReorderTerminals: (ids: string[]) => void;
  onSplit: (dir: SplitDir, fromFileId: string) => void;
  onSplitRatio: (splitId: string, index: number, ratio: number) => void;
  onTerminalMetaChange?: (fileId: string, patch: TerminalMetaPatch) => void;
};

export function ProjectTerminalDock({
  dock,
  focused,
  onFocus,
  onAddTerminal,
  onSelectTerminal,
  onCloseTerminal,
  onCloseOtherTerminals,
  onReorderTerminals,
  onSplit,
  onSplitRatio,
  onTerminalMetaChange,
}: Props) {
  const split = isDockSplit(dock);
  const files = dock.pane.files;
  const activeFileId = dock.pane.activeFileId;
  const [draft, setDraft] = useState<LayoutNode | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(dock.layout);
  layoutRef.current = dock.layout;

  useEffect(() => {
    setDraft(null);
  }, [dock.layout]);

  const tree = draft ?? dock.layout;
  const leaves = tree && split ? layoutLeaves(tree) : [];
  const sashes = tree && split ? layoutSashes(tree) : [];

  const paneActions = (fileId: string) => (
    <div className="flex shrink-0 items-center gap-0.5 px-1">
      <IconButton
        label={t("Split Pane Right")}
        onClick={() => onSplit("right", fileId)}
      >
        <LayoutTwoColumn className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={t("Split Pane Down")}
        onClick={() => onSplit("down", fileId)}
      >
        <LayoutTwoRow className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={t("Close Terminal")}
        onClick={() => onCloseTerminal(fileId)}
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} />
      </IconButton>
    </div>
  );

  return (
    <section
      data-project-terminal-dock=""
      className="relative flex h-full min-h-0 min-w-0 flex-col"
      onMouseDown={onFocus}
    >
      {split ? null : (
        <SurfaceTabs
          files={files}
          activeFileId={activeFileId}
          dirtyFileIds={EMPTY_IDS}
          fileErrorCounts={EMPTY_ERRORS}
          label={t("Terminals")}
          compact
          pills
          onSelectFile={onSelectTerminal}
          onCloseFile={onCloseTerminal}
          onCloseOtherFiles={onCloseOtherTerminals}
          onReorder={onReorderTerminals}
          onNewTab={() => onAddTerminal()}
          newTabLabel={withShortcut(t("New terminal"), `${MOD}\``)}
          trailing={paneActions(activeFileId)}
        />
      )}
      <div ref={treeRef} className="relative min-h-0 min-w-0 flex-1">
        {files.map((file) => {
          const leaf = leaves.find((entry) => entry.id === file.id);
          const visible = split ? !!leaf : file.id === activeFileId;
          const rect = leaf?.rect;
          return (
            <div
              key={file.id}
              aria-hidden={!visible}
              className={
                visible
                  ? split
                    ? "absolute flex min-h-0 min-w-0 flex-col"
                    : "absolute inset-0 flex min-h-0 min-w-0 flex-col"
                  : "hidden"
              }
              style={
                visible && split && rect
                  ? {
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.w * 100}%`,
                      height: `${rect.h * 100}%`,
                    }
                  : undefined
              }
              onMouseDown={
                visible ? () => onSelectTerminal(file.id) : undefined
              }
            >
              {split ? (
                <SurfaceTabs
                  files={[file]}
                  activeFileId={file.id}
                  dirtyFileIds={EMPTY_IDS}
                  fileErrorCounts={EMPTY_ERRORS}
                  label={t("Terminals")}
                  compact
                  pills
                  onSelectFile={onSelectTerminal}
                  onCloseFile={onCloseTerminal}
                  onCloseOtherFiles={onCloseOtherTerminals}
                  onReorder={onReorderTerminals}
                  onNewTab={() => onAddTerminal(file.id)}
                  newTabLabel={withShortcut(t("New terminal"), `${MOD}\``)}
                  trailing={paneActions(file.id)}
                />
              ) : null}
              <div className="relative min-h-0 min-w-0 flex-1">
                <TerminalView
                  id={file.id}
                  cwd={file.cwd}
                  active={focused && file.id === activeFileId}
                  onMetaChange={(patch) =>
                    onTerminalMetaChange?.(file.id, patch)
                  }
                />
              </div>
            </div>
          );
        })}
        {sashes.map((sash) => (
          <SplitSash
            key={`${sash.splitId}:${sash.index}`}
            sash={sash}
            containerRef={treeRef}
            onPreview={(ratio) => {
              if (!layoutRef.current) return;
              setDraft(
                setSplitRatio(
                  layoutRef.current,
                  sash.splitId,
                  sash.index,
                  ratio,
                ),
              );
            }}
            onCommit={(ratio) => {
              setDraft(null);
              onSplitRatio(sash.splitId, sash.index, ratio);
            }}
            onCancel={() => setDraft(null)}
          />
        ))}
      </div>
    </section>
  );
}

function SplitSash({
  sash,
  containerRef,
  onPreview,
  onCommit,
  onCancel,
}: {
  sash: LayoutSash;
  containerRef: { current: HTMLDivElement | null };
  onPreview: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
}) {
  const row = sash.dir === "right";
  const boundary = sash.sizes
    .slice(0, sash.index + 1)
    .reduce((sum, size) => sum + size, 0);
  const group = sash.group;

  return (
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      className={
        row
          ? "absolute z-10 w-px bg-content/10"
          : "absolute z-10 h-px bg-content/10"
      }
      style={
        row
          ? {
              left: `${(group.x + boundary * group.w) * 100}%`,
              top: `${group.y * 100}%`,
              height: `${group.h * 100}%`,
            }
          : {
              left: `${group.x * 100}%`,
              top: `${(group.y + boundary * group.h) * 100}%`,
              width: `${group.w * 100}%`,
            }
      }
    >
      <div
        className={
          row
            ? "absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize touch-none"
            : "absolute inset-x-0 -top-1.5 -bottom-1.5 cursor-row-resize touch-none"
        }
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const handle = event.currentTarget;
          const parent = containerRef.current;
          if (!parent) return;
          handle.setPointerCapture(event.pointerId);
          const rect = parent.getBoundingClientRect();
          const restoreSelection = suppressTextSelection();
          const previousCursor = document.body.style.cursor;
          document.body.style.cursor = row ? "col-resize" : "row-resize";
          const origin = row
            ? rect.left + group.x * rect.width
            : rect.top + group.y * rect.height;
          const span = row ? group.w * rect.width : group.h * rect.height;
          let nextBoundary = boundary;
          let moved = false;
          let frame: number | null = null;

          const move = (ev: PointerEvent) => {
            const pos = row ? ev.clientX : ev.clientY;
            if (span <= 0) return;
            moved = true;
            nextBoundary = (pos - origin) / span;
            if (frame != null) return;
            frame = requestAnimationFrame(() => {
              frame = null;
              onPreview(nextBoundary);
            });
          };
          const finish = (commit: boolean) => {
            if (frame != null) {
              cancelAnimationFrame(frame);
              frame = null;
            }
            if (handle.hasPointerCapture(event.pointerId)) {
              handle.releasePointerCapture(event.pointerId);
            }
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", up);
            handle.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", keydown);
            restoreSelection();
            document.body.style.cursor = previousCursor;
            if (!moved) return;
            if (commit) onCommit(nextBoundary);
            else onCancel();
          };
          const up = () => finish(true);
          const cancel = () => finish(false);
          const keydown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            finish(false);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", up);
          handle.addEventListener("pointercancel", cancel);
          window.addEventListener("keydown", keydown);
        }}
      />
    </div>
  );
}

const EMPTY_IDS = new Set<string>();
const EMPTY_ERRORS = new Map<string, number>();
