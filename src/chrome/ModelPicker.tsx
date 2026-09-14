import { Check, ChevronDown, ChevronRight, RotateCcw, Zap } from "./icons";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  findModel,
  getModelSnapshot,
  getPickerVisibilitySnapshot,
  loadRecentModelChoices,
  resolveModel,
  isPickerProviderVisible,
  subscribeModels,
  subscribePickerVisibility,
  type AgentModel,
  type ModelSetting,
  type ModelSettingChoice,
} from "../lib/models";
import {
  harnessUnavailableHint,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
  getHarnessAvailabilitySnapshot,
} from "../lib/harness/availability";
import { refreshHarnessCatalogs } from "../lib/harness/registry";
import {
  modelVisibilityVersion,
  pickerModelsFor,
  subscribeModelVisibility,
} from "../lib/modelVisibility";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { LAYER } from "../lib/layers";
import { HarnessIcon } from "./HarnessIcon";
import { ModelBrandIcon } from "./ModelBrandIcon";
import { Popover } from "./Popover";
import { t } from "../i18n";
import { MOD } from "../lib/platform";

type Props = {
  harness: HarnessId;
  model: string;
  values: Record<string, string>;
  hotkeys?: boolean;
  onChange: (harness: HarnessId, model: string) => void;
  onSettingsChange: (settings: Record<string, string>) => void;
  onClose?: () => void;
};

type MenuEntry = { kind: "setting"; setting: ModelSetting };

type Submenu =
  | { kind: "setting"; setting: ModelSetting }
  | { kind: "models"; harness: HarnessId; models: AgentModel[] };

type RecentMenu = { models: AgentModel[] };

const MENU_WIDTH = 252;
const SETTING_MENU_WIDTH = 228;
const SUBMENU_OVERLAP = -4;
const MODELS_SUBMENU_GAP = 8;
const SELF = "[data-model-picker]";

const SETTING_ORDER = [
  "fast",
  "effort",
  "reasoning",
  "thinking",
  "variant",
  "agent",
  "context",
];

/** Levels shown for models that do not declare their own reasoning dial. */
const DEFAULT_EFFORT_OPTIONS: ModelSettingChoice[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

function pickerSettings(model: AgentModel): ModelSetting[] {
  const settings = [...(model.settings ?? [])]
    .filter(
      (setting) => !(model.harness === "opencode" && setting.id === "agent"),
    )
    .sort((a, b) => {
      const ai = SETTING_ORDER.indexOf(a.id);
      const bi = SETTING_ORDER.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  if (!settings.some(isEffortSetting)) {
    settings.unshift({
      id: "effort",
      label: "Effort",
      kind: "select",
      value: "medium",
      options: DEFAULT_EFFORT_OPTIONS,
    });
  }
  return settings;
}

const EFFORT_RANK: Record<string, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

/** One label per effort level, so providers do not each spell it differently. */
const EFFORT_LABEL: Record<string, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

function isEffortSetting(setting: ModelSetting): boolean {
  return (
    setting.id === "effort" ||
    setting.id === "reasoning" ||
    setting.id === "reasoningEffort" ||
    setting.id === "variant"
  );
}

function orderedSettingOptions(setting: ModelSetting): ModelSettingChoice[] {
  return [...setting.options].sort(
    (a, b) => (EFFORT_RANK[a.value] ?? 99) - (EFFORT_RANK[b.value] ?? 99),
  );
}

function settingLabel(setting: ModelSetting): string {
  return isEffortSetting(setting) ? t("Effort") : setting.label;
}

function settingValue(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  return values[setting.id] ?? setting.value;
}

function settingValueLabel(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  const value = settingValue(setting, values);
  if (isEffortSetting(setting) && EFFORT_LABEL[value]) {
    return t(EFFORT_LABEL[value]);
  }
  return (
    setting.options.find((option) => option.value === value)?.label ?? value
  );
}

const FAST_SETTING_IDS = new Set(["fast", "serviceTier"]);
const FAST_ON_VALUES = new Set(["true", "fast"]);
const FAST_OFF_VALUES = new Set(["false", "default"]);

/** Fast mode is a toggle on Claude/Cursor and a service tier on Codex. */
function fastSettingOf(settings: ModelSetting[]): ModelSetting | undefined {
  return settings.find((setting) => FAST_SETTING_IDS.has(setting.id));
}

/** Only an off + fast pair can collapse into the lightning toggle. */
function isToggleableFast(setting: ModelSetting): boolean {
  if (setting.id === "fast") return true;
  const hasOn = setting.options.some((option) =>
    FAST_ON_VALUES.has(option.value),
  );
  const hasExtra = setting.options.some(
    (option) =>
      !FAST_ON_VALUES.has(option.value) && !FAST_OFF_VALUES.has(option.value),
  );
  return hasOn && !hasExtra;
}

function isFastOn(
  setting: ModelSetting,
  values: Record<string, string>,
): boolean {
  return FAST_ON_VALUES.has(settingValue(setting, values));
}

function fastOnValue(setting: ModelSetting): string {
  return setting.id === "fast" ? "true" : "fast";
}

function fastOffValue(setting: ModelSetting): string {
  return setting.id === "fast" ? "false" : "default";
}

function recentMenuModels(current: AgentModel): AgentModel[] {
  const models = loadRecentModelChoices().flatMap((choice) => {
    const item = findModel(choice.model);
    return item?.harness === choice.harness ? [item] : [];
  });
  if (!models.some((item) => item.id === current.id)) models.push(current);
  return models.slice(0, 6);
}

const SLIDER_INSET = 10;

function effortStop(ratio: number): string {
  return `calc(${SLIDER_INSET}px + ${ratio} * (100% - ${SLIDER_INSET * 2}px))`;
}

function EffortSlider({
  options,
  value,
  label,
  valueText,
  fast = false,
  onChange,
}: {
  options: ModelSettingChoice[];
  value: string;
  label: string;
  valueText: string;
  fast?: boolean;
  onChange: (value: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const max = Math.max(1, options.length - 1);
  const ratio = selected / max;

  const applyFromX = (clientX: number) => {
    const el = track.current;
    if (!el || options.length === 0) return;
    const rect = el.getBoundingClientRect();
    const inner = Math.max(1, rect.width - SLIDER_INSET * 2);
    const t = Math.min(
      1,
      Math.max(0, (clientX - rect.left - SLIDER_INSET) / inner),
    );
    const index = Math.round(t * max);
    const next = options[index];
    if (next) onChange(next.value);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    applyFromX(event.clientX);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // happy-dom and some webviews omit pointer capture
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const captured =
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId);
    if (!captured && event.buttons !== 1) return;
    applyFromX(event.clientX);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={selected}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = options[Math.min(max, Math.max(0, selected + delta))];
        if (next) onChange(next.value);
      }}
      className="relative mt-1 h-[30px] w-full cursor-pointer touch-none outline-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-[22px] -translate-y-1/2 rounded-full bg-content/12" />
      <div
        className="absolute top-1/2 left-0 h-[22px] -translate-y-1/2 overflow-hidden rounded-full bg-accent"
        style={{
          width:
            ratio >= 1
              ? "100%"
              : `calc(${effortStop(ratio)} + 10px)`,
        }}
      >
        {fast
          ? FAST_SPARKS.map((spark, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="effort-fast-spark"
                style={{
                  left: spark.left,
                  top: spark.top,
                  width: spark.size,
                  height: spark.size,
                  ["--effort-delay" as string]: spark.delay,
                  ["--effort-twinkle" as string]: spark.duration,
                }}
              />
            ))
          : null}
      </div>
      {options.map((option, index) => (
        <span
          key={option.value}
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            index <= selected ? "bg-white/70" : "bg-content/30"
          }`}
          style={{ left: effortStop(index / max) }}
        />
      ))}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
        style={{ left: effortStop(ratio) }}
      />
    </div>
  );
}

const FAST_SPARKS = [
  { left: "8%", top: "38%", size: 3, delay: "0s", duration: "1.7s" },
  { left: "18%", top: "62%", size: 2, delay: "0.25s", duration: "2.1s" },
  { left: "27%", top: "28%", size: 2.5, delay: "0.5s", duration: "1.5s" },
  { left: "38%", top: "58%", size: 3.5, delay: "0.1s", duration: "1.9s" },
  { left: "48%", top: "32%", size: 2, delay: "0.7s", duration: "1.6s" },
  { left: "57%", top: "68%", size: 2.5, delay: "0.35s", duration: "2s" },
  { left: "68%", top: "40%", size: 3, delay: "0.9s", duration: "1.8s" },
  { left: "78%", top: "55%", size: 2, delay: "0.15s", duration: "1.4s" },
  { left: "88%", top: "30%", size: 2.5, delay: "0.55s", duration: "2.2s" },
];

export function ModelPicker({
  harness,
  model,
  values,
  hotkeys = false,
  onChange,
  onSettingsChange,
  onClose,
}: Props) {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const availabilityVersion = useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const visibilityVersion = useSyncExternalStore(
    subscribePickerVisibility,
    getPickerVisibilitySnapshot,
    getPickerVisibilitySnapshot,
  );
  const modelVisibility = useSyncExternalStore(
    subscribeModelVisibility,
    modelVisibilityVersion,
    modelVisibilityVersion,
  );
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"effort" | "models">("effort");
  const [active, setActive] = useState(0);
  const [activeModel, setActiveModel] = useState(0);
  const [activeModelOption, setActiveModelOption] = useState(0);
  const [activeSetting, setActiveSetting] = useState(0);
  const [recentMenu, setRecentMenu] = useState<RecentMenu | null>(null);
  const [recentActive, setRecentActive] = useState(0);
  const [submenu, setSubmenu] = useState<Submenu | null>(null);
  const [activeRow, setActiveRow] = useState<HTMLButtonElement | null>(null);
  const recentMenuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const recentOpenRef = useRef(recentMenu != null);
  const currentRef = useRef<AgentModel | null>(null);
  const lastHotkey = useRef(0);
  onCloseRef.current = onClose;
  openRef.current = open;
  recentOpenRef.current = recentMenu != null;

  const current = resolveModel(harness, model);
  currentRef.current = current;
  const settings = useMemo(() => {
    void catalogVersion;
    return pickerSettings(current);
  }, [catalogVersion, current]);
  const fast = fastSettingOf(settings);
  const fastToggleable = fast ? isToggleableFast(fast) : false;
  const fastOn = fast ? isFastOn(fast, values) : false;
  const extraEntries = useMemo<MenuEntry[]>(
    () =>
      settings
        .filter((setting) => {
          if (isEffortSetting(setting)) return false;
          if (fast && fastToggleable && setting.id === fast.id) return false;
          return true;
        })
        .map((setting) => ({ kind: "setting" as const, setting })),
    [settings, fast, fastToggleable],
  );
  const entries = extraEntries;

  const triggerLabel = current.name;
  const effortSetting = settings.find(isEffortSetting);
  const triggerEffort = effortSetting
    ? settingValueLabel(effortSetting, values)
    : undefined;

  const pickerHarnesses = useMemo(() => {
    void visibilityVersion;
    return HARNESSES.filter((id) => isPickerProviderVisible(id));
  }, [visibilityVersion]);
  const providerGroups = useMemo(() => {
    void catalogVersion;
    void modelVisibility;
    void availabilityVersion;
    return pickerHarnesses
      .map((id) => ({
        harness: id,
        models: pickerModelsFor(id),
      }))
      .filter((group) => group.models.length > 0);
  }, [availabilityVersion, catalogVersion, modelVisibility, pickerHarnesses]);

  const dismiss = (restore: boolean) => {
    setOpen(false);
    setPanel("effort");
    setRecentMenu(null);
    setSubmenu(null);
    if (restore) onCloseRef.current?.();
  };

  const togglePicker = () => {
    if (openRef.current) dismiss(true);
    else {
      setRecentMenu(null);
      setPanel("effort");
      setOpen(true);
    }
  };

  const openRecentMenu = () => {
    const selected = currentRef.current;
    if (!selected) return;
    const models = recentMenuModels(selected);
    const selectedIndex = models.findIndex((item) => item.id === selected.id);
    setOpen(false);
    setPanel("effort");
    setSubmenu(null);
    setRecentActive(selectedIndex >= 0 ? selectedIndex : 0);
    setRecentMenu({ models });
  };

  const toggleRecentMenu = () => {
    if (recentOpenRef.current) {
      setRecentMenu(null);
      onCloseRef.current?.();
    } else {
      openRecentMenu();
    }
  };

  const toggleFromHotkey = () => {
    const now = performance.now();
    if (now - lastHotkey.current < 80) return;
    lastHotkey.current = now;
    toggleRecentMenu();
  };

  useEffect(() => {
    if (!open) return;
    void probeHarnessAvailability();
    void refreshHarnessCatalogs([current.harness]);
    setActive(0);
    setSubmenu(null);
  }, [open, current.harness]);

  useEffect(() => {
    if (!open || panel !== "models") return;
    void refreshHarnessCatalogs(pickerHarnesses);
  }, [open, panel, pickerHarnesses]);

  useEffect(() => {
    if (!open) return;
    setActive((index) => Math.min(index, Math.max(0, entries.length - 1)));
  }, [entries.length, open]);

  useEffect(() => {
    if (!open || panel !== "models") return;
    const index = providerGroups.findIndex((group) =>
      group.models.some((item) => item.id === current.id),
    );
    setActiveModel(index >= 0 ? index : 0);
  }, [open, panel, providerGroups, current.id]);

  useEffect(() => {
    if (submenu?.kind !== "models") return;
    const index = submenu.models.findIndex((item) => item.id === current.id);
    setActiveModelOption(index >= 0 ? index : 0);
  }, [submenu, current.id]);

  useEffect(() => {
    if (submenu?.kind !== "setting") return;
    const value = settingValue(submenu.setting, values);
    const index = submenu.setting.options.findIndex(
      (option) => option.value === value,
    );
    setActiveSetting(index >= 0 ? index : 0);
  }, [submenu, values]);

  useEffect(() => {
    const inBlockingUi = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest(".monocode-terminal")) return true;
      return Boolean(
        target.closest(
          "[data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-access-picker]",
        ),
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (
        hotkeys &&
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "." || event.code === "Period")
      ) {
        if (!openRef.current && inBlockingUi(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFromHotkey();
        return;
      }
      if (!openRef.current || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (submenu?.kind === "models") {
        setSubmenu(null);
        return;
      }
      if (panel === "models") {
        setPanel("effort");
        return;
      }
      dismiss(true);
    };

    const onMenu = () => {
      if (!hotkeys) return;
      if (inBlockingUi(document.activeElement)) return;
      toggleFromHotkey();
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("open_model_picker", onMenu);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("open_model_picker", onMenu);
    };
  }, [hotkeys, panel, submenu]);

  const setSetting = (setting: ModelSetting, value: string) => {
    onSettingsChange({ ...values, [setting.id]: value });
  };

  const pickModel = (item: AgentModel) => {
    if (!isHarnessAvailable(item.harness)) return;
    onChange(item.harness, item.id);
    dismiss(true);
  };

  useEffect(() => {
    if (!recentMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setRecentActive(
          (index) =>
            (index + direction + recentMenu.models.length) %
            recentMenu.models.length,
        );
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const item = recentMenu.models[recentActive];
      if (item) pickModel(item);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recentActive, recentMenu]);

  const pickSetting = (setting: ModelSetting, value: string) => {
    setSetting(setting, value);
    setSubmenu(null);
  };

  const showEntrySubmenu = (entry: MenuEntry) => {
    if (entry.setting.kind === "select") {
      setSubmenu({ kind: "setting", setting: entry.setting });
      return;
    }
    setSubmenu(null);
  };

  const moveEntry = (direction: 1 | -1) => {
    setSubmenu(null);
    if (entries.length === 0) return;
    setActive((index) => (index + direction + entries.length) % entries.length);
  };

  const openProviderModels = (index: number) => {
    const group = providerGroups[index];
    if (!group) return;
    setActiveModel(index);
    setSubmenu({
      kind: "models",
      harness: group.harness,
      models: group.models,
    });
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const modelsSubmenu = submenu?.kind === "models" ? submenu : null;

    if (panel === "models") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (modelsSubmenu) {
          setActiveModelOption((index) =>
            Math.min(modelsSubmenu.models.length - 1, index + 1),
          );
        } else {
          setActiveModel((index) =>
            Math.min(providerGroups.length - 1, index + 1),
          );
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (modelsSubmenu) {
          setActiveModelOption((index) => Math.max(0, index - 1));
        } else {
          setActiveModel((index) => Math.max(0, index - 1));
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (modelsSubmenu) {
          const item = modelsSubmenu.models[activeModelOption];
          if (item) pickModel(item);
        } else {
          const group = providerGroups[activeModel];
          if (group) {
            setSubmenu({
              kind: "models",
              harness: group.harness,
              models: group.models,
            });
          }
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "Escape") {
        event.preventDefault();
        if (modelsSubmenu) setSubmenu(null);
        else setPanel("effort");
        return;
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (submenu?.kind === "setting") {
        setActiveSetting((index) =>
          Math.min(submenu.setting.options.length - 1, index + 1),
        );
      } else {
        moveEntry(1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (submenu?.kind === "setting") {
        setActiveSetting((index) => Math.max(0, index - 1));
      } else {
        moveEntry(-1);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (panel === "effort") {
        setPanel("models");
        return;
      }
      const entry = entries[active];
      if (entry) showEntrySubmenu(entry);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSubmenu(null);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (submenu?.kind === "setting") {
      const option = submenu.setting.options[activeSetting];
      if (option) pickSetting(submenu.setting, option.value);
      return;
    }
    const entry = entries[active];
    if (!entry) return;
    if (entry.setting.kind === "select") {
      showEntrySubmenu(entry);
      return;
    }
    const value = settingValue(entry.setting, values);
    setSetting(entry.setting, value === "true" ? "false" : "true");
  };

  const showSettingSubmenu =
    open && panel === "effort" && submenu?.kind === "setting" && activeRow != null;
  const showModelsSubmenu =
    open && panel === "models" && submenu?.kind === "models" && activeRow != null;
  const effortOptions = effortSetting
    ? orderedSettingOptions(effortSetting)
    : [];
  const effortValue = effortSetting
    ? settingValue(effortSetting, values)
    : "";

  return (
    <>
      <button
        ref={button}
        type="button"
        data-no-tooltip
        aria-label={`${HARNESS_TITLE[current.harness]} ${current.name}`}
        aria-keyshortcuts={`${MOD}.`}
        aria-expanded={open || recentMenu != null}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openRecentMenu();
        }}
        onClick={() => togglePicker()}
        className={`flex h-6.5 items-center gap-1 rounded-full px-1.5 ${
          open
            ? "bg-content/10 text-content"
            : "text-content hover:bg-content/10"
        }`}
      >
        <ModelBrandIcon model={current} className="size-4 shrink-0" />
        <span className="whitespace-nowrap text-[11px]">{triggerLabel}</span>
        {triggerEffort ? (
          <span className="shrink-0 text-[11px] text-content/45">
            {triggerEffort}
          </span>
        ) : null}
        <ChevronDown
          className={`size-3 shrink-0 text-content/50 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <>
          <Popover
            anchor={button}
            side="top"
            align="center"
            width={MENU_WIDTH}
            maxHeight={panel === "models" ? 420 : undefined}
            autoFocus
            dismissOnEscape={false}
            ignore={SELF}
            onDismiss={() => dismiss(false)}
            role="menu"
            aria-label={
              panel === "models" ? t("Select model") : t("Model and effort")
            }
            tabIndex={-1}
            onKeyDown={onMenuKey}
            data-model-picker
            className={`font-sans ${
              panel === "models"
                ? "overflow-y-auto overscroll-none p-1"
                : "p-1"
            }`}
          >
            {panel === "models" ? (
              <div className="pb-1">
                <div className="px-2.5 pt-1.5 pb-1 text-[12px] text-content/45">
                  {t("Select model")}
                </div>
                {providerGroups.length === 0 ? (
                  <p className="px-2.5 py-2 text-[12px] text-content/45">
                    {t("No models found")}
                  </p>
                ) : (
                  providerGroups.map((group, index) => {
                    const highlighted = index === activeModel;
                    const selected = group.models.some(
                      (item) => item.id === current.id,
                    );
                    return (
                      <button
                        key={group.harness}
                        ref={highlighted ? setActiveRow : undefined}
                        data-model-control-index={index}
                        data-provider-harness={group.harness}
                        type="button"
                        role="menuitem"
                        aria-haspopup="menu"
                        aria-expanded={
                          highlighted &&
                          showModelsSubmenu &&
                          submenu?.kind === "models" &&
                          submenu.harness === group.harness
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => openProviderModels(index)}
                        onClick={() => openProviderModels(index)}
                        className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
                          highlighted
                            ? "bg-content/10 text-content"
                            : "text-content hover:bg-content/5"
                        }`}
                      >
                        <HarnessIcon
                          harness={group.harness}
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {HARNESS_TITLE[group.harness]}
                        </span>
                        {selected ? (
                          <Check
                            className="size-3.5 shrink-0 text-content/55"
                            strokeWidth={2}
                          />
                        ) : null}
                        <ChevronRight
                          className="size-3.5 shrink-0 text-content/45"
                          strokeWidth={1.75}
                        />
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 px-0.5">
                  {fast && fastToggleable ? (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={fastOn}
                      aria-label={t("Fast")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setSetting(
                          fast,
                          fastOn ? fastOffValue(fast) : fastOnValue(fast),
                        )
                      }
                      className={`grid size-7 shrink-0 place-items-center rounded-md ${
                        fastOn
                          ? "text-accent"
                          : "text-content/40 hover:bg-content/10 hover:text-content"
                      }`}
                    >
                      <Zap className="size-3.5" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <span className="size-7 shrink-0" />
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={false}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSubmenu(null);
                      setPanel("models");
                    }}
                    className="min-w-0 flex-1 rounded-md px-1 py-0 text-center hover:bg-content/5"
                  >
                    <span className="flex items-center justify-center gap-1 text-[13px] font-medium text-accent">
                      <span className="min-w-0 truncate">
                        {effortSetting
                          ? settingValueLabel(effortSetting, values)
                          : current.name}
                      </span>
                      <ChevronRight
                        className="size-3.5 shrink-0"
                        strokeWidth={1.75}
                      />
                    </span>
                    {effortSetting ? (
                      <span className="block truncate text-[12px] leading-tight text-content/45">
                        {current.name}
                      </span>
                    ) : null}
                  </button>
                  {effortSetting ? (
                    <button
                      type="button"
                      aria-label={t("Reset effort")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setSetting(effortSetting, effortSetting.value)
                      }
                      className="grid size-7 shrink-0 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <span className="size-7 shrink-0" />
                  )}
                </div>

                {effortSetting ? (
                  <div className="px-2.5 pb-2 pt-0">
                    <EffortSlider
                      options={effortOptions}
                      value={effortValue}
                      label={settingLabel(effortSetting)}
                      valueText={settingValueLabel(effortSetting, values)}
                      fast={fastOn}
                      onChange={(value) => setSetting(effortSetting, value)}
                    />
                  </div>
                ) : null}

                {entries.map((entry, index) => {
                  const highlighted = index === active;
                  const setting = entry.setting;
                  const value = settingValue(setting, values);
                  const isToggle = setting.kind === "toggle";
                  return (
                    <button
                      key={setting.id}
                      ref={highlighted ? setActiveRow : undefined}
                      data-model-control-index={index}
                      type="button"
                      role={isToggle ? "menuitemcheckbox" : "menuitem"}
                      aria-checked={isToggle ? value === "true" : undefined}
                      aria-haspopup={isToggle ? undefined : "menu"}
                      aria-expanded={
                        !isToggle && highlighted ? showSettingSubmenu : undefined
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        setActive(index);
                        showEntrySubmenu(entry);
                      }}
                      onClick={() => {
                        if (isToggle) {
                          setSetting(
                            setting,
                            value === "true" ? "false" : "true",
                          );
                        } else {
                          showEntrySubmenu(entry);
                        }
                      }}
                      className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
                        highlighted
                          ? "bg-content/10 text-content"
                          : "text-content hover:bg-content/5"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {settingLabel(setting)}
                      </span>
                      {isToggle ? (
                        <span
                          aria-hidden="true"
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                            value === "true" ? "bg-content/35" : "bg-content/15"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 size-4 rounded-full bg-content shadow-sm transition-transform ${
                              value === "true"
                                ? "translate-x-4.5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      ) : (
                        <>
                          <span className="min-w-0 max-w-28 truncate text-content/55">
                            {settingValueLabel(setting, values)}
                          </span>
                          <ChevronRight
                            className="size-3.5 shrink-0 text-content/45"
                            strokeWidth={1.75}
                          />
                        </>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </Popover>

          {showSettingSubmenu && submenu.kind === "setting" ? (
            <Popover
              key={submenu.setting.id}
              anchor={activeRow}
              side="right"
              gap={SUBMENU_OVERLAP}
              width={SETTING_MENU_WIDTH}
              layer={LAYER.submenu}
              role="menu"
              aria-label={settingLabel(submenu.setting)}
              onMouseEnter={() => setSubmenu(submenu)}
              data-model-picker
              className="p-1 font-sans"
            >
              {submenu.setting.options.map((option, index) => {
                const selected =
                  option.value === settingValue(submenu.setting, values);
                const highlighted = index === activeSetting;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveSetting(index)}
                    onClick={() => pickSetting(submenu.setting, option.value)}
                    className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
                      highlighted
                        ? "bg-content/10 text-content"
                        : "text-content hover:bg-content/5"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {selected ? (
                      <Check
                        className="size-3.5 shrink-0 text-content/50"
                        strokeWidth={2}
                      />
                    ) : null}
                  </button>
                );
              })}
            </Popover>
          ) : null}

          {showModelsSubmenu && submenu.kind === "models" ? (
            <Popover
              key={submenu.harness}
              anchor={activeRow}
              side="right"
              gap={MODELS_SUBMENU_GAP}
              width={SETTING_MENU_WIDTH}
              maxHeight={320}
              layer={LAYER.submenu}
              role="menu"
              aria-label={HARNESS_TITLE[submenu.harness]}
              onMouseEnter={() => setSubmenu(submenu)}
              data-model-picker
              className="overflow-y-auto overscroll-none p-1 font-sans"
            >
              {submenu.models.map((item, index) => {
                const selected = item.id === current.id;
                const highlighted = index === activeModelOption;
                const disabled = !isHarnessAvailable(item.harness);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    data-picker-harness={item.harness}
                    aria-checked={selected}
                    disabled={disabled}
                    title={
                      disabled
                        ? harnessUnavailableHint(item.harness)
                        : undefined
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveModelOption(index)}
                    onClick={() => pickModel(item)}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] disabled:cursor-not-allowed ${
                      disabled
                        ? "text-content/30"
                        : highlighted
                          ? "bg-content/10 text-content"
                          : "text-content hover:bg-content/5"
                    }`}
                  >
                    <ModelBrandIcon model={item} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {selected ? (
                      <Check
                        className="size-3.5 shrink-0 text-content/50"
                        strokeWidth={2}
                      />
                    ) : null}
                  </button>
                );
              })}
            </Popover>
          ) : null}

        </>
      ) : null}

      {recentMenu ? (
        <Popover
          anchor={button}
          side="top"
          align="center"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={() => setRecentMenu(null)}
          role="menu"
          aria-label={t("Recently used models")}
          aria-activedescendant={`${recentMenuId}-${recentActive}`}
          tabIndex={-1}
          onContextMenu={(event) => event.preventDefault()}
          data-model-picker
          className="p-1 font-sans"
        >
          {recentMenu.models.map((item, index) => {
            const selected = item.id === current.id;
            const highlighted = index === recentActive;
            const disabled = !isHarnessAvailable(item.harness);
            return (
              <button
                key={item.id}
                id={`${recentMenuId}-${index}`}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={disabled}
                title={
                  disabled ? harnessUnavailableHint(item.harness) : undefined
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setRecentActive(index)}
                onClick={() => pickModel(item)}
                className={`flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left disabled:cursor-not-allowed ${
                  disabled
                    ? "text-content/30"
                    : highlighted
                      ? "bg-content/10 text-content"
                      : "text-content hover:bg-content/5"
                }`}
              >
                <HarnessIcon
                  harness={item.harness}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-4">
                    {item.name}
                  </span>
                  <span className="block truncate text-[11px] leading-4 text-content/45">
                    {HARNESS_TITLE[item.harness]}
                  </span>
                </span>
                {selected ? (
                  <Check
                    className="size-3.5 shrink-0 text-content/55"
                    strokeWidth={2}
                  />
                ) : null}
              </button>
            );
          })}
        </Popover>
      ) : null}
    </>
  );
}

