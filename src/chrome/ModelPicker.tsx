import { Check, ChevronDown, ChevronRight, Search, Zap } from "./icons";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  findModel,
  getModelSnapshot,
  getPickerVisibilitySnapshot,
  loadRecentModelChoices,
  resolveModel,
  showProviderInModelPicker,
  subscribeModels,
  subscribePickerVisibility,
  type AgentModel,
  type ModelSetting,
  type ModelSettingChoice,
} from "../lib/models";
import {
  harnessUnavailableHint,
  hasProbedHarnessAvailability,
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

type MenuEntry = { kind: "setting"; setting: ModelSetting } | { kind: "model" };

type Submenu = { kind: "setting"; setting: ModelSetting } | { kind: "models" };

type RecentMenu = { models: AgentModel[] };

const MENU_WIDTH = 250;
const SETTING_MENU_WIDTH = 210;
const SUBMENU_OVERLAP = -4;
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
  // Every model gets the effort slider; models that do not declare one still
  // show it, and the harness simply ignores a value it never advertised.
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
  // `variant` is OpenCode's name for the same reasoning dial.
  return (
    setting.id === "effort" ||
    setting.id === "reasoning" ||
    setting.id === "variant"
  );
}

/** Effort options ordered low → high for the inline slider. */
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

function recentMenuModels(current: AgentModel): AgentModel[] {
  const models = loadRecentModelChoices().flatMap((choice) => {
    const item = findModel(choice.model);
    return item?.harness === choice.harness ? [item] : [];
  });
  if (!models.some((item) => item.id === current.id)) models.push(current);
  return models.slice(0, 6);
}

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
  const [active, setActive] = useState(0);
  const [activeModel, setActiveModel] = useState(0);
  const [activeSetting, setActiveSetting] = useState(0);
  const [recentMenu, setRecentMenu] = useState<RecentMenu | null>(null);
  const [recentActive, setRecentActive] = useState(0);
  const [submenu, setSubmenu] = useState<Submenu | null>(null);
  const [activeRow, setActiveRow] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
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
  const entries = useMemo<MenuEntry[]>(
    () => [
      ...settings.map((setting) => ({
        kind: "setting" as const,
        setting,
      })),
      { kind: "model" as const },
    ],
    [settings],
  );

  const triggerLabel = current.name;
  const fastSetting = settings.find((setting) => setting.id === "fast");
  const fastValue = fastSetting ? settingValue(fastSetting, values) : "";
  const effortSetting = settings.find(isEffortSetting);
  const triggerEffort = effortSetting
    ? settingValueLabel(effortSetting, values)
    : undefined;

  const pickerHarnesses = useMemo(() => {
    void availabilityVersion;
    void visibilityVersion;
    return HARNESSES.filter((id) =>
      showProviderInModelPicker(
        id,
        isHarnessAvailable(id),
        hasProbedHarnessAvailability(),
      ),
    );
  }, [availabilityVersion, visibilityVersion]);
  // The centered "Select model" modal lists every enabled model, grouped by
  // provider, without the provider rail.
  const providerGroups = useMemo(() => {
    void catalogVersion;
    void modelVisibility;
    const needle = query.trim().toLowerCase();
    return pickerHarnesses
      .map((id) => ({
        harness: id,
        models: pickerModelsFor(id).filter(
          (model) =>
            !needle ||
            `${model.name} ${HARNESS_TITLE[id]}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [catalogVersion, modelVisibility, pickerHarnesses, query]);

  const visibleModels = useMemo(
    () => providerGroups.flatMap((group) => group.models),
    [providerGroups],
  );

  const dismiss = (restore: boolean) => {
    setOpen(false);
    setRecentMenu(null);
    setSubmenu(null);
    if (restore) onCloseRef.current?.();
  };

  const togglePicker = () => {
    if (openRef.current) dismiss(true);
    else {
      setRecentMenu(null);
      setOpen(true);
    }
  };

  const openRecentMenu = () => {
    const selected = currentRef.current;
    if (!selected) return;
    const models = recentMenuModels(selected);
    const selectedIndex = models.findIndex((item) => item.id === selected.id);
    setOpen(false);
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
    setQuery("");
  }, [open, current.harness]);

  useEffect(() => {
    if (!open || submenu?.kind !== "models") return;
    void refreshHarnessCatalogs(pickerHarnesses);
  }, [open, submenu?.kind, pickerHarnesses]);

  useEffect(() => {
    if (!open) return;
    setActive((index) => Math.min(index, Math.max(0, entries.length - 1)));
  }, [entries.length, open]);

  useEffect(() => {
    if (!open || submenu?.kind !== "models") return;
    const index = visibleModels.findIndex((item) => item.id === current.id);
    setActiveModel(index >= 0 ? index : 0);
  }, [open, submenu?.kind, query, visibleModels, current.id]);

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
  }, [hotkeys]);

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
    dismiss(true);
  };

  const showEntrySubmenu = (entry: MenuEntry) => {
    if (entry.kind === "model") {
      setSubmenu({ kind: "models" });
      return;
    }
    if (entry.setting.kind === "select") {
      setSubmenu({ kind: "setting", setting: entry.setting });
      return;
    }
    setSubmenu(null);
  };

  const moveEntry = (direction: 1 | -1) => {
    setSubmenu(null);
    setActive((index) => (index + direction + entries.length) % entries.length);
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (submenu?.kind === "models") {
        setActiveModel((index) =>
          Math.min(visibleModels.length - 1, index + 1),
        );
      } else if (submenu?.kind === "setting") {
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
      if (submenu?.kind === "models") {
        setActiveModel((index) => Math.max(0, index - 1));
      } else if (submenu?.kind === "setting") {
        setActiveSetting((index) => Math.max(0, index - 1));
      } else {
        moveEntry(-1);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
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
    if (submenu?.kind === "models") {
      const item = visibleModels[activeModel];
      if (item) pickModel(item);
      return;
    }
    if (submenu?.kind === "setting") {
      const option = submenu.setting.options[activeSetting];
      if (option) pickSetting(submenu.setting, option.value);
      return;
    }
    const entry = entries[active];
    if (!entry) return;
    if (entry.kind === "model" || entry.setting.kind === "select") {
      showEntrySubmenu(entry);
      return;
    }
    const value = settingValue(entry.setting, values);
    setSetting(entry.setting, value === "true" ? "false" : "true");
  };

  const showSubmenu = open && submenu != null && activeRow != null;

  return (
    <>
      <button
        ref={button}
        type="button"
        title={`${HARNESS_TITLE[current.harness]} · ${current.name} · Recent models: right-click or ${MOD}.`}
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
        className={`flex h-6.5 max-w-40 items-center gap-1 rounded-full px-1.5 ${
          open
            ? "bg-content/10 text-content"
            : "text-content hover:bg-content/10"
        }`}
      >
        <ModelBrandIcon model={current} className="size-4 shrink-0" />
        <span className="min-w-0 truncate text-[11px]">{triggerLabel}</span>
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
            width={MENU_WIDTH}
            autoFocus
            dismissOnEscape={false}
            ignore={SELF}
            onDismiss={() => dismiss(false)}
            role="menu"
            aria-label={t("Model and effort")}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            data-model-picker
            className="p-1 font-sans"
          >
            {/* Codex-style header: the bolt toggles Fast and the model name
                opens the second modal with the enabled models. */}
            <div className="flex items-center gap-1 px-1 pt-1 pb-0.5">
              {fastSetting ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={fastValue === "true"}
                  aria-label={t("Fast")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setSetting(
                      fastSetting,
                      fastValue === "true" ? "false" : "true",
                    )
                  }
                  className={`grid size-7 shrink-0 place-items-center rounded-md ${
                    fastValue === "true"
                      ? "bg-content/15 text-content"
                      : "text-content/45 hover:bg-content/10 hover:text-content"
                  }`}
                >
                  <Zap className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : (
                <span className="size-7 shrink-0" />
              )}
              <button
                ref={setActiveRow}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={showSubmenu}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(0);
                  showEntrySubmenu({ kind: "model" });
                }}
                onClick={() => showEntrySubmenu({ kind: "model" })}
                className="mx-auto flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-content hover:bg-content/5"
              >
                <ModelBrandIcon model={current} className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate text-[13px] font-medium">
                  {current.name}
                </span>
                <ChevronRight
                  className="size-3.5 shrink-0 text-content/45"
                  strokeWidth={1.75}
                />
              </button>
              <span className="size-7 shrink-0" />
            </div>

            {entries.map((entry, index) => {
              const highlighted = index === active;
              if (entry.kind === "model") return null;

              const setting = entry.setting;
              if (setting.id === "fast") return null;
              const value = settingValue(setting, values);
              const isToggle = setting.kind === "toggle";
              // Effort is the reasoning dial, so it reads as a slider the way
              // Codex presents it rather than another submenu.
              if (!isToggle && isEffortSetting(setting)) {
                const options = orderedSettingOptions(setting);
                const selected = Math.max(
                  0,
                  options.findIndex((option) => option.value === value),
                );
                return (
                  <div
                    key={setting.id}
                    onMouseEnter={() => {
                      setActive(index);
                      setSubmenu(null);
                    }}
                    className="px-2 pb-2 pt-2"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-content">
                        {settingLabel(setting)}
                      </span>
                      <span className="text-content/55">
                        {settingValueLabel(setting, values)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={options.length - 1}
                      step={1}
                      value={selected}
                      aria-label={settingLabel(setting)}
                      onMouseDown={(event) => event.preventDefault()}
                      onChange={(event) =>
                        pickSetting(
                          setting,
                          options[Number(event.target.value)].value,
                        )
                      }
                      className="sidebar-opacity-slider mt-2.5 w-full"
                    />
                  </div>
                );
              }
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
                    !isToggle && highlighted ? showSubmenu : undefined
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setActive(index);
                    showEntrySubmenu(entry);
                  }}
                  onClick={() => {
                    if (isToggle) {
                      setSetting(setting, value === "true" ? "false" : "true");
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
          </Popover>

          {showSubmenu && submenu.kind === "setting" ? (
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

          {showSubmenu && submenu.kind === "models" ? (
            <ModelsModal
              groups={providerGroups}
              currentId={current.id}
              query={query}
              onQuery={setQuery}
              onPick={(_harness, id) => {
                const model = findModel(id);
                if (model) pickModel(model);
              }}
              onClose={() => setSubmenu(null)}
            />
          ) : null}
        </>
      ) : null}

      {recentMenu ? (
        <Popover
          anchor={button}
          side="top"
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

function ModelsModal({
  groups,
  currentId,
  query,
  onQuery,
  onPick,
  onClose,
}: {
  groups: { harness: HarnessId; models: AgentModel[] }[];
  currentId: string;
  query: string;
  onQuery: (value: string) => void;
  onPick: (harness: HarnessId, model: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[220] grid place-items-center bg-black/40 p-6 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Select model")}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="flex max-h-[70vh] w-[min(420px,90vw)] flex-col overflow-hidden rounded-2xl border border-content/12 bg-background-base/95 font-sans shadow-2xl backdrop-blur-2xl"
      >
        <div className="shrink-0 px-4 pt-4 pb-2">
          <div className="text-[13px] font-medium text-content/60">
            {t("Select model")}
          </div>
          <label className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-content/10 px-2 text-content/45 focus-within:border-content/20">
            <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={t("Search models")}
              aria-label={t("Search models")}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none placeholder:text-content/35"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1.5">
          {groups.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-content/45">
              {t("No models found")}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.harness} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-widest text-content/40">
                  {HARNESS_TITLE[group.harness]}
                </p>
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={model.id === currentId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(group.harness, model.id)}
                    className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] ${
                      model.id === currentId
                        ? "bg-content/10 text-content"
                        : "text-content hover:bg-content/5"
                    }`}
                  >
                    <ModelBrandIcon model={model} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {model.name}
                    </span>
                    {model.id === currentId ? (
                      <Check
                        className="size-3.5 shrink-0 text-content/50"
                        strokeWidth={2}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
