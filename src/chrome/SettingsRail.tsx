import {
  Archive,
  ArrowLeft,
  Bot,
  File,
  Inbox,
  Keyboard,
  Mic,
  Palette,
  Settings,
  Sparkles,
  type IconComponent,
} from "./icons";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { t } from "../i18n";
import {
  SETTINGS_NAV_GROUPS,
  settingsSectionLabel,
  type SettingsSectionId,
} from "../lib/settings";

const SECTION_ICONS: Record<SettingsSectionId, IconComponent> = {
  general: Settings,
  appearance: Palette,
  keybindings: Keyboard,
  providers: Bot,
  project: File,
  voice: Mic,
  inbox: Inbox,
  skills: Sparkles,
  archive: Archive,
};

type Props = {
  section: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
  onClose: () => void;
};

/** Body of the project rail while settings are open. */
export function SettingsNav({ section, onSelect, onClose }: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  return (
    <>
      <div
        ref={lockOverscroll}
        aria-label={t("Settings")}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none px-2 pb-2"
      >
        {SETTINGS_NAV_GROUPS.map((group) => (
          <div key={group.label} className="pt-3 first:pt-2">
            <p className="px-2 pb-1 text-xs font-medium text-content/35">
              {t(group.label)}
            </p>
            <div className="flex flex-col gap-px">
              {group.ids.map((id) => (
                <NavRow
                  key={id}
                  label={settingsSectionLabel(id)}
                  icon={SECTION_ICONS[id]}
                  active={id === section}
                  onClick={() => onSelect(id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-px p-2">
        <NavRow label={t("Back")} icon={ArrowLeft} onClick={onClose} />
      </div>
    </>
  );
}

function NavRow({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-no-tooltip
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
        active
          ? "bg-content/10 text-content"
          : "text-content/55 hover:bg-content/5 hover:text-content"
      }`}
    >
      <Icon className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm leading-tight">
        {label}
      </span>
    </button>
  );
}
