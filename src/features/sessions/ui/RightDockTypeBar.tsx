import { ExpandPanel, Folder, GitBranch, PanelLeft, Plus, RestorePanel, Terminal, X } from "../../../shared/ui/icons";
import { IconButton } from "../../../app/shell/TitleBar";
import { t } from "../../../i18n";

export type RightDockType = "terminal" | "explorer" | "changes";

const TYPES: {
  id: RightDockType;
  label: string;
  Icon: typeof Terminal;
}[] = [
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "explorer", label: "Explorer", Icon: Folder },
  { id: "changes", label: "Changes", Icon: GitBranch },
];

export function RightDockTypeBar({
  tabs,
  active,
  onSelect,
  onClose,
  onAdd,
  addRef,
  onExpand,
  expanded = false,
  onTogglePanel,
}: {
  tabs: RightDockType[];
  active: RightDockType | null;
  onSelect: (id: RightDockType) => void;
  onClose: (id: RightDockType) => void;
  onAdd: () => void;
  addRef?: (el: HTMLDivElement | null) => void;
  onExpand: () => void;
  expanded?: boolean;
  onTogglePanel: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((id) => {
          const meta = TYPES.find((entry) => entry.id === id) ?? TYPES[0];
          const Icon = meta.Icon;
          const selected = id === active;
          const label = t(meta.label);
          return (
            <div
              key={id}
              className={`group relative flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2.5 text-[12px] ${
                selected
                  ? "bg-content/[0.08] text-content"
                  : "text-content/50 hover:bg-content/5 hover:text-content"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(id)}
                className="flex cursor-pointer items-center gap-1.5"
              >
                <Icon
                  className="size-3.5 shrink-0 group-hover:invisible"
                  strokeWidth={1.75}
                />
                <span>{label}</span>
              </button>
              <button
                type="button"
                data-no-tooltip
                aria-label={t("Close {name}", { name: label })}
                className="invisible absolute top-1/2 left-2.5 grid size-3.5 -translate-y-1/2 cursor-pointer place-items-center text-content/70 hover:text-content group-hover:visible"
                onClick={() => onClose(id)}
              >
                <X className="size-3" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
      <div ref={addRef} data-panel-add="">
        <IconButton label={t("Add panel")} onClick={onAdd}>
          <Plus className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
      <IconButton
        label={expanded ? t("Restore panel") : t("Expand panel")}
        active={expanded}
        onClick={onExpand}
      >
        {expanded ? (
          <RestorePanel className="size-3.5" strokeWidth={1.75} />
        ) : (
          <ExpandPanel className="size-3.5" strokeWidth={1.75} />
        )}
      </IconButton>
      <IconButton label={t("Panels")} active onClick={onTogglePanel}>
        <PanelLeft className="size-3.5" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
