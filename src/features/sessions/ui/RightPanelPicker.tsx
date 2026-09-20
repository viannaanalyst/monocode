import { Folder, Terminal } from "../../../shared/ui/icons";
import { Popover } from "../../../shared/ui/Popover";
import { t } from "../../../i18n";

export type RightPanelPick = "terminal" | "explorer";

const ITEMS: { id: RightPanelPick; label: string; Icon: typeof Terminal }[] = [
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "explorer", label: "Explorer", Icon: Folder },
];

export function RightPanelPicker({
  onPick,
}: {
  onPick: (id: RightPanelPick) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-6">
      <div className="flex w-[13.5rem] flex-col gap-2">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-full bg-content/[0.07] px-3 text-sm font-medium text-content/85 hover:bg-content/[0.11] hover:text-content"
          >
            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RightPanelTypeMenu({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null | { current: HTMLElement | null };
  onPick: (id: RightPanelPick) => void;
  onClose: () => void;
}) {
  return (
    <Popover
      anchor={anchor}
      side="bottom"
      align="end"
      gap={6}
      width={220}
      onDismiss={onClose}
      ignore="[data-panel-add]"
      className="rounded-2xl p-1.5"
    >
      <div className="flex flex-col gap-0.5">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm text-content/85 hover:bg-content/10 hover:text-content"
          >
            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
