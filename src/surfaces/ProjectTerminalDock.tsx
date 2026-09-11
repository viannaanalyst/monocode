import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Play,
  Plus,
} from "../chrome/icons";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ExplorerMenu } from "../chrome/ExplorerMenu";
import { SurfaceTabs } from "../chrome/SurfaceTabs";
import { IconButton } from "../chrome/TitleBar";
import {
  clampDockSize,
  defaultDockSize,
  isVerticalDock,
  type DockSide,
  type ProjectTerminalDock,
} from "../lib/projectTerminal";
import { MOD } from "../lib/platform";
import {
  loadProjectScripts,
  type ProjectScript,
} from "../lib/projectScripts";
import type { TerminalMetaPatch } from "../lib/terminalTab";
import { TerminalView } from "./TerminalView";
import { t, withShortcut } from "../i18n";


type Props = {
  dock: ProjectTerminalDock;
  focused: boolean;
  onFocus: () => void;
  onHide: () => void;
  onSideChange: (side: DockSide) => void;
  onSizePaint: (size: number) => void;
  onSizeCommit: (size: number) => void;
  onAddTerminal: () => void;
  onSelectTerminal: (fileId: string) => void;
  onCloseTerminal: (fileId: string) => void;
  onReorderTerminals: (ids: string[]) => void;
  onTerminalMetaChange?: (fileId: string, patch: TerminalMetaPatch) => void;
  onRunScript?: (command: string) => void;
};

function dockSideItems(): { id: DockSide; label: string }[] {
  return [
    { id: "bottom", label: t("Dock Bottom") },
    { id: "top", label: t("Dock Top") },
    { id: "left", label: t("Dock Left") },
    { id: "right", label: t("Dock Right") },
  ];
}

function sideIcon(side: DockSide) {
  if (side === "top") return PanelTop;
  if (side === "left") return PanelLeft;
  if (side === "right") return PanelRight;
  return PanelBottom;
}

function hideIcon(side: DockSide) {
  if (side === "top") return ChevronUp;
  if (side === "left") return ChevronLeft;
  if (side === "right") return ChevronRight;
  return ChevronDown;
}

export function ProjectTerminalDock({
  dock,
  focused,
  onFocus,
  onHide,
  onSideChange,
  onSizePaint,
  onSizeCommit,
  onAddTerminal,
  onSelectTerminal,
  onCloseTerminal,
  onReorderTerminals,
  onTerminalMetaChange,
  onRunScript,
}: Props) {
  const vertical = isVerticalDock(dock.side);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [scriptsMenu, setScriptsMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const sideButton = useRef<HTMLDivElement>(null);
  const scriptsButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setScripts([]);
    void loadProjectScripts(dock.projectPath)
      .then((next) => {
        if (!cancelled) setScripts(next);
      })
      .catch(() => {
        if (!cancelled) setScripts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dock.projectPath]);
  const drag = useRef<{ start: number; size: number } | null>(null);
  const sizeRef = useRef(dock.size);
  sizeRef.current = dock.size;
  const pending = useRef(dock.size);
  const frame = useRef<number | null>(null);
  const SideIcon = sideIcon(dock.side);
  const HideIcon = hideIcon(dock.side);

  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [dragging, vertical]);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const paint = (next: number) => {
    pending.current = next;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onSizePaint(pending.current);
    });
  };

  const commit = () => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    onSizeCommit(pending.current);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: vertical ? event.clientY : event.clientX,
      size: sizeRef.current,
    };
    pending.current = sizeRef.current;
    setDragging(true);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const point = vertical ? event.clientY : event.clientX;
    const delta = point - drag.current.start;
    const signed =
      dock.side === "bottom" || dock.side === "right" ? -delta : delta;
    paint(clampDockSize(dock.side, drag.current.size + signed, viewport()));
  };

  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    commit();
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const sash =
    dock.side === "top"
      ? "absolute inset-x-0 -bottom-px z-10 h-1.5 cursor-row-resize touch-none"
      : dock.side === "bottom"
        ? "absolute inset-x-0 -top-px z-10 h-1.5 cursor-row-resize touch-none"
        : dock.side === "left"
          ? "absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none"
          : "absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none";

  return (
    <section
      data-project-terminal-dock=""
      className={`relative flex h-full min-h-0 min-w-0 flex-col ${
        focused ? "bg-content/3" : "bg-content/2"
      } ${
        dock.side === "top"
          ? "border-b"
          : dock.side === "bottom"
            ? "border-t"
            : dock.side === "left"
              ? "border-r"
              : "border-l"
      } border-content/10`}
      onMouseDown={onFocus}
    >
      <div
        role="separator"
        aria-orientation={vertical ? "horizontal" : "vertical"}
        aria-label={t("Resize terminal")}
        aria-valuenow={dock.size}
        className={`${sash} ${dragging ? "bg-content/15" : "hover:bg-content/10"}`}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={() => {
          pending.current = defaultDockSize(dock.side);
          commit();
        }}
      />
      <SurfaceTabs
        files={dock.pane.files}
        activeFileId={dock.pane.activeFileId}
        dirtyFileIds={EMPTY_IDS}
        fileErrorCounts={EMPTY_ERRORS}
        label={t("Terminals")}
        onSelectFile={onSelectTerminal}
        onCloseFile={onCloseTerminal}
        onReorder={onReorderTerminals}
        trailing={
          <div className="flex shrink-0 items-center gap-0.5 border-l border-content/10 px-1">
            {onRunScript ? (
              <div ref={scriptsButton}>
                <IconButton
                  label={t("Run project script")}
                  onClick={() => {
                    const rect =
                      scriptsButton.current?.getBoundingClientRect();
                    if (!rect) return;
                    setScriptsMenu({ x: rect.left, y: rect.bottom + 4 });
                  }}
                >
                  <Play className="size-3.5" strokeWidth={1.75} />
                </IconButton>
              </div>
            ) : null}
            <IconButton
              label={withShortcut("New Terminal", `${MOD}\``)}
              onClick={onAddTerminal}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </IconButton>
            <div ref={sideButton}>
            <IconButton
              label={t("Move Terminal")}
              onClick={() => {
                const rect = sideButton.current?.getBoundingClientRect();
                if (!rect) return;
                setMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <SideIcon className="size-3.5" strokeWidth={1.75} />
            </IconButton>
            </div>
            <IconButton
              label={withShortcut("Hide Terminal", `${MOD}J`)}
              onClick={onHide}
            >
              <HideIcon className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        }
      />
      <div className="relative min-h-0 min-w-0 flex-1">
        {dock.pane.files.map((file) => (
          <div
            key={file.id}
            aria-hidden={file.id !== dock.pane.activeFileId}
            className={
              file.id === dock.pane.activeFileId
                ? "absolute inset-0 h-full"
                : "hidden"
            }
          >
            <TerminalView
              id={file.id}
              cwd={file.cwd}
              active={focused && file.id === dock.pane.activeFileId}
              onMetaChange={(patch) => onTerminalMetaChange?.(file.id, patch)}
            />
          </div>
        ))}
      </div>
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          ariaLabel={t("Move terminal")}
          items={dockSideItems().map((item) => ({
            kind: "item" as const,
            id: item.id,
            label: item.label,
            checked: item.id === dock.side,
          }))}
          onPick={(id) => {
            if (id === "top" || id === "bottom" || id === "left" || id === "right") {
              onSideChange(id);
            }
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {scriptsMenu ? (
        <ExplorerMenu
          x={scriptsMenu.x}
          y={scriptsMenu.y}
          width={260}
          ariaLabel={t("Run project script")}
          items={
            scripts.length > 0
              ? scripts.map((script) => ({
                  kind: "item" as const,
                  id: script.command,
                  label: script.name,
                }))
              : [
                  {
                    kind: "item" as const,
                    id: "none",
                    label: t("Add scripts in .monocode/scripts.json"),
                    disabled: true,
                  },
                ]
          }
          onPick={(id) => {
            if (id !== "none") onRunScript?.(id);
            setScriptsMenu(null);
          }}
          onClose={() => setScriptsMenu(null)}
        />
      ) : null}
    </section>
  );
}

const EMPTY_IDS = new Set<string>();
const EMPTY_ERRORS = new Map<string, number>();
