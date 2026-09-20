import {
  ChevronDown,
  CircleAlert,
  Lock,
  Pencil,
  Search,
  Sparkles,
} from "../../../shared/ui/icons";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  RUNTIME_MODE_HINT,
  RUNTIME_MODE_LABEL,
  RUNTIME_MODES,
  type RuntimeMode,
} from "../model/session";
import { Popover } from "../../../shared/ui/Popover";
import { t } from "../../../i18n";


type Props = {
  value: RuntimeMode;
  onChange: (mode: RuntimeMode) => void;
  onClose?: () => void;
  busy?: boolean;
};

const MENU_WIDTH = 288;

/** Only the three modes that matter day to day. */
const VISIBLE_MODES: RuntimeMode[] = RUNTIME_MODES.filter(
  (mode) => mode !== "auto-accept-edits" && mode !== "auto",
);

const ICONS: Record<RuntimeMode, typeof Lock> = {
  "read-only": Search,
  supervised: Lock,
  "auto-accept-edits": Pencil,
  auto: Sparkles,
  "full-access": CircleAlert,
};

/**
 * One tone per access level, from a quiet read-only blue to the full-access
 * warning orange, so the composer chip and the list read the same way.
 */
const MODE_TONE: Record<RuntimeMode, { label: string; hint: string }> = {
  "read-only": { label: "text-sky-400", hint: "text-sky-400/70" },
  supervised: { label: "text-emerald-400", hint: "text-emerald-400/70" },
  "auto-accept-edits": { label: "", hint: "text-content/50" },
  auto: { label: "", hint: "text-content/50" },
  "full-access": { label: "text-orange-400", hint: "text-orange-400/70" },
};

const toneClass = (mode: RuntimeMode) => MODE_TONE[mode].label;

export function AccessPicker({
  value,
  onChange,
  onClose,
  busy = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(0, VISIBLE_MODES.indexOf(value)),
  );
  const root = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const Icon = ICONS[value];

  const dismiss = (restore: boolean) => {
    setOpen(false);
    if (restore) onCloseRef.current?.();
  };

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, VISIBLE_MODES.indexOf(value)));
  }, [open, value]);

  const pick = (mode: RuntimeMode) => {
    onChange(mode);
    dismiss(true);
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(VISIBLE_MODES.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const mode = VISIBLE_MODES[active];
      if (mode) pick(mode);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-no-tooltip
        aria-label={t(RUNTIME_MODE_LABEL[value])}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            dismiss(true);
            return;
          }
          setOpen(true);
        }}
        className={`flex h-6.5 max-w-52 items-center gap-1 rounded-full px-1.5 ${
          open
            ? "bg-content/10 text-content"
            : "text-content/70 hover:bg-content/10 hover:text-content"
        }`}
      >
        <Icon
          className={`size-3.5 shrink-0 ${toneClass(value)}`}
          strokeWidth={1.75}
        />
        <span className={`min-w-0 truncate text-sm ${toneClass(value)}`}>
          {t(RUNTIME_MODE_LABEL[value])}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/50 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="listbox"
          aria-label={t("Access")}
          data-access-picker
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="p-1"
        >
          {VISIBLE_MODES.map((mode, index) => {
            const ModeIcon = ICONS[mode];
            const selected = mode === value;
            const highlighted = index === active;
            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(mode)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left ${
                  highlighted || selected
                    ? "bg-selection text-content"
                    : "text-content hover:bg-content/5"
                }`}
              >
                <ModeIcon
                  className={`mt-0.5 size-3.5 shrink-0 ${
                    toneClass(mode) || "text-content/70"
                  }`}
                  strokeWidth={1.75}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium leading-5 ${toneClass(mode)}`}
                  >
                    {t(RUNTIME_MODE_LABEL[mode])}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs leading-4 ${MODE_TONE[mode].hint}`}
                  >
                    {t(RUNTIME_MODE_HINT[mode])}
                  </span>
                </span>
              </button>
            );
          })}
          {busy ? (
            <p className="px-2 py-1.5 text-xs leading-4 text-content/50">
              Access changes apply to the next turn. Stop and resend to apply
              them now.
            </p>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}
