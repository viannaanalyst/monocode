import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../../../shared/lib/layers";
import {
  createNotionTask,
  notionDatabaseSchema,
  updateNotionTask,
  type NotionDatabaseSchema,
  type NotionPropertyOption,
  type NotionTask,
  type NotionTaskChanges,
} from "../model/notion";
import { LoaderCircle, X } from "../../../shared/ui/icons";
import { t } from "../../../i18n";

export type NotionEditTarget = {
  id: string;
  title: string;
  status: string;
  labels: string[];
};

type Props = {
  mode: "create" | "edit";
  target?: NotionEditTarget;
  onClose: () => void;
  onSaved: (task: NotionTask) => void;
};

const COLOR_DOT: Record<string, string> = {
  gray: "bg-content/40",
  brown: "bg-amber-600",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-emerald-400",
  blue: "bg-sky-400",
  purple: "bg-violet-400",
  pink: "bg-pink-400",
  red: "bg-rose-400",
};

function colorDot(color: string): string {
  return COLOR_DOT[color] ?? "bg-content/30";
}

function OptionChip({
  option,
  selected,
  onClick,
}: {
  option: NotionPropertyOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-6 max-w-48 items-center gap-1.5 truncate rounded-md border px-2 text-[12px] transition-colors ${
        selected
          ? "border-content/25 bg-content/12 text-content"
          : "border-content/10 text-content/65 hover:bg-content/8 hover:text-content"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${colorDot(option.color)}`} />
      <span className="truncate">{option.name}</span>
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-2xs uppercase tracking-widest text-content/45">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function NotionTaskEditor({ mode, target, onClose, onSaved }: Props) {
  const [schema, setSchema] = useState<NotionDatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(target?.title ?? "");
  const [status, setStatus] = useState(target?.status ?? "");
  const [labels, setLabels] = useState<string[]>(target?.labels ?? []);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void notionDatabaseSchema()
      .then((next) => {
        if (cancelled) return;
        setSchema(next);
        if (mode === "create" && next.stateOptions.length > 0) {
          setStatus((current) => current || next.stateOptions[0].name);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const toggleLabel = (name: string) => {
    setLabels((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );
  };

  const onSave = async () => {
    if (busy || loading) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("Title cannot be empty"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "create" || !target) {
        const created = await createNotionTask(trimmed, status || undefined);
        onSaved(created);
        onClose();
        return;
      }
      const changes: NotionTaskChanges = {};
      if (trimmed !== target.title) changes.title = trimmed;
      if (status !== target.status) changes.status = status;
      const before = [...target.labels].sort().join("\u0000");
      const after = [...labels].sort().join("\u0000");
      if (before !== after) changes.labels = labels;
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      const updated = await updateNotionTask(target.id, changes);
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showStatus = (schema?.stateOptions.length ?? 0) > 0;
  const showLabels =
    mode === "edit" && (schema?.labelOptions.length ?? 0) > 0;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: LAYER.dialog }}>
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? t("New Notion page") : t("Edit Notion page")}
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute left-1/2 top-[16%] flex w-[min(560px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-4 rounded-lg border border-content/10 bg-background-base/95 p-4 shadow-xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content">
            {mode === "create" ? t("New Notion page") : t("Edit Notion page")}
          </h2>
          <button
            type="button"
            aria-label={t("Close")}
            onClick={onClose}
            className="grid size-6 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6 text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="notion-title"
                className="text-2xs uppercase tracking-widest text-content/45"
              >
                {t("Title")}
              </label>
              <input
                id="notion-title"
                ref={inputRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onSave();
                  }
                }}
                placeholder={t("Page title")}
                spellCheck={false}
                className="rounded-md border border-content/10 bg-content/5 px-2.5 py-1.5 text-sm text-content outline-none focus:border-content/25"
              />
            </div>

            {showStatus && schema ? (
              <Section label={t("Status")}>
                {schema.stateOptions.map((option) => (
                  <OptionChip
                    key={option.name}
                    option={option}
                    selected={status === option.name}
                    onClick={() =>
                      setStatus((current) =>
                        current === option.name ? "" : option.name,
                      )
                    }
                  />
                ))}
              </Section>
            ) : null}

            {showLabels && schema ? (
              <Section label={t("Tags")}>
                {schema.labelOptions.map((option) => (
                  <OptionChip
                    key={option.name}
                    option={option}
                    selected={labels.includes(option.name)}
                    onClick={() => toggleLabel(option.name)}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}

        {error ? (
          <p className="text-[12px] leading-snug text-red-400">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-content/10 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-content/70 hover:bg-content/8 hover:text-content"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy || loading || !title.trim()}
            onClick={() => void onSave()}
            className="rounded-md bg-content px-3 py-1.5 text-sm font-medium text-background-base hover:bg-content/80 disabled:opacity-40"
          >
            {mode === "create" ? t("Create page") : t("Save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
