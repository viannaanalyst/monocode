import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectBranchesState } from "../../source-control/hooks/useProjectBranches";
import { MOD, SHIFT } from "../../../platform/tauri/platform";
import type { WorkspaceMode } from "../../sessions/model/session";
import {
  Check,
  ChevronDown,
  Folder,
  FolderTree,
  GitBranch,
  Search,
  Settings,
} from "../../../shared/ui/icons";
import { GitPickerTrigger } from "../../source-control/ui/GitPickerTrigger";
import { Popover } from "../../../shared/ui/Popover";
import { t } from "../../../i18n";

export const WORKSPACE_MODE_SHORTCUT = `${MOD}${SHIFT}G`;

export function isWorkspaceModeShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "g"
  );
}

export function WorkspacePicker({
  cwd,
  mode,
  base,
  enabled = true,
  onModeChange,
  onBaseChange,
  onOpenSettings,
  onClose,
}: {
  cwd: string;
  mode: WorkspaceMode;
  base?: string;
  enabled?: boolean;
  onModeChange: (mode: WorkspaceMode, base?: string) => void;
  onBaseChange: (base: string) => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}) {
  const { branches, settled } = useProjectBranchesState(
    cwd,
    enabled && !!cwd && cwd !== "~",
  );
  const resolvedBase = base || branches?.current || undefined;
  const effectiveBase = resolvedBase || "HEAD";

  return (
    <>
      <WorkspaceModePicker
        mode={mode}
        enabled={enabled && !!resolvedBase}
        onChange={(next) =>
          onModeChange(next, next === "worktree" ? effectiveBase : undefined)
        }
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />
      {mode === "worktree" ? (
        <WorktreeBasePicker
          branches={branches?.branches ?? []}
          selected={effectiveBase}
          loading={!settled}
          enabled={enabled && !!branches}
          onChange={onBaseChange}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}

/** A started conversation owns its working copy; only its branch stays mutable. */
export function WorkspaceIdentity({ worktree }: { worktree: boolean }) {
  const Icon = worktree ? FolderTree : Folder;
  const label = worktree ? t("Worktree") : t("Current checkout");
  return (
    <div
      aria-label={t("Workspace {label}", { label })}
      className="flex h-6 min-w-0 shrink-0 items-center gap-1.5 px-1.5 text-sm text-content/45"
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function WorkspaceModePicker({
  mode,
  enabled,
  onChange,
  onOpenSettings,
  onClose,
}: {
  mode: WorkspaceMode;
  enabled: boolean;
  onChange: (mode: WorkspaceMode) => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const dismiss = () => {
    setOpen(false);
    onClose?.();
  };
  const label = mode === "worktree" ? t("New worktree") : t("Current checkout");
  const Icon = mode === "worktree" ? FolderTree : Folder;

  return (
    <div ref={anchor} className="relative flex min-w-0 shrink-0">
      <button
        type="button"
        data-no-tooltip
        disabled={!enabled}
        aria-label={t("Workspace {label}", { label })}
        aria-keyshortcuts="Meta+Shift+G Control+Shift+G"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 min-w-0 max-w-48 items-center gap-1.5 rounded-full px-1.5 text-content/60 hover:bg-content/10 hover:text-content aria-expanded:bg-content/10 aria-expanded:text-content disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content/50"
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate text-sm">{label}</span>
        <ChevronDown
          className="size-3.5 shrink-0 text-content/50"
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <Popover
          anchor={anchor}
          side="top"
          width={220}
          constrainHeight={false}
          onDismiss={dismiss}
          role="dialog"
          aria-label={t("Workspace")}
          className="overflow-hidden p-1.5"
        >
          <div className="flex items-center justify-between gap-3 px-2 py-1 text-2xs font-medium text-content/45">
            <span>{t("Workspace")}</span>
            <kbd className="font-sans text-2xs font-normal text-content/35">
              {WORKSPACE_MODE_SHORTCUT}
            </kbd>
          </div>
          {(
            [
              ["current", t("Current checkout"), Folder],
              ["worktree", t("New worktree"), FolderTree],
            ] as const
          ).map(([value, text, RowIcon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(value);
                dismiss();
              }}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-content/10 ${
                mode === value ? "bg-selection text-content" : "text-content/80"
              }`}
            >
              <RowIcon className="size-4 shrink-0 text-content/55" />
              <span className="flex-1">{text}</span>
              {mode === value ? <Check className="size-3.5" /> : null}
            </button>
          ))}
          {onOpenSettings ? (
            <div className="h-8 border-t border-content/10">
              <button
                type="button"
                aria-label={t("Open worktree settings")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                className="flex h-full w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-content/65 hover:bg-content/10 hover:text-content"
              >
                <Settings
                  className="size-4 shrink-0 text-content/45"
                  strokeWidth={1.75}
                />
                <span className="flex-1">{t("Worktree settings")}</span>
              </button>
            </div>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}

type BaseBranch = { name: string; remote: string | null };

function branchRef(branch: BaseBranch): string {
  return branch.remote ? `${branch.remote}/${branch.name}` : branch.name;
}

function WorktreeBasePicker({
  branches,
  selected,
  loading,
  enabled,
  onChange,
  onClose,
}: {
  branches: BaseBranch[];
  selected: string;
  loading: boolean;
  enabled: boolean;
  onChange: (base: string) => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const unique = new Map<string, BaseBranch>();
    for (const branch of branches) unique.set(branchRef(branch), branch);
    return [...unique.values()].filter((branch) =>
      branchRef(branch).toLowerCase().includes(needle),
    );
  }, [branches, query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => search.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    setActive((index) => Math.max(0, Math.min(index, rows.length - 1)));
  }, [rows.length]);
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const dismiss = () => {
    setOpen(false);
    setQuery("");
    onClose?.();
  };

  return (
    <div ref={anchor} className="relative flex min-w-0 shrink-0">
      <GitPickerTrigger
        data-no-tooltip
        disabled={!enabled}
        aria-label={t("Create worktree from {base}", { base: selected })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        label={t("From {base}", { base: selected })}
        loading={loading}
      />
      {open ? (
        <Popover
          anchor={anchor}
          side="top"
          width={280}
          minHeight={160}
          maxHeight={280}
          onDismiss={dismiss}
          role="dialog"
          aria-label={t("Worktree base branch")}
          className="flex flex-col overflow-hidden"
        >
          <label className="flex shrink-0 items-center gap-2 border-b border-content/10 px-2 py-2.5 text-content/50">
            <Search className="size-3.5 shrink-0" />
            <input
              ref={search}
              value={query}
              placeholder={t("Search base branches…")}
              aria-label={t("Search base branches")}
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) =>
                    Math.max(
                      0,
                      Math.min(
                        rows.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (event.key === "Enter" && rows[active]) {
                  event.preventDefault();
                  onChange(branchRef(rows[active]));
                  dismiss();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content/40"
            />
          </label>
          <div
            role="listbox"
            aria-label={t("Base branches")}
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {rows.map((branch, index) => {
              const ref = branchRef(branch);
              const selectedRow = ref === selected;
              const highlighted = index === active;
              return (
                <button
                  key={ref}
                  type="button"
                  role="option"
                  aria-selected={selectedRow}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    onChange(ref);
                    dismiss();
                  }}
                  className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-content/10 ${
                    highlighted || selectedRow
                      ? "bg-selection text-content"
                      : "text-content/80"
                  }`}
                >
                  {selectedRow ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : (
                    <GitBranch className="size-3.5 shrink-0 text-content/45" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate font-mono ${selectedRow ? "font-medium" : ""}`}
                  >
                    {ref}
                  </span>
                </button>
              );
            })}
            {rows.length === 0 ? (
              <p className="px-2 py-3 text-xs text-content/45">
                {t("No matching branches")}
              </p>
            ) : null}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
