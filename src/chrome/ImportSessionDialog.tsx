import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../lib/layers";
import { readTextFile } from "../lib/fs";
import { prettyParent } from "../lib/paths";
import {
  forgetSessionExport,
  loadRecentSessionExports,
  pickSessionImportFile,
  type RecentSessionExport,
} from "../lib/sessionExportIo";
import { X } from "./icons";
import { t } from "../i18n";

type Props = {
  onClose: () => void;
  onImport: (text: string) => Promise<void> | void;
};

/**
 * In-app session import. Lists the JSON exports this app has saved, plus a
 * paste-a-path field, so the OS file dialog is not the only way in.
 */
export function ImportSessionDialog({ onClose, onImport }: Props) {
  const [recents, setRecents] = useState<RecentSessionExport[]>([]);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(loadRecentSessionExports().filter((r) => r.format === "json"));
    inputRef.current?.focus();
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

  const run = async (load: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const text = await load();
      await onImport(text);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: LAYER.dialog }}>
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Import session")}
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute left-1/2 top-[18%] flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-3 rounded-lg border border-content/10 bg-content/5 p-4 shadow-xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content">
            {t("Import session")}
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

        {recents.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-2xs font-medium uppercase tracking-widest text-content/45">
              {t("Recent exports")}
            </p>
            <ul className="max-h-56 overflow-y-auto rounded-md border border-content/10">
              {recents.map((entry) => (
                <li
                  key={entry.path}
                  className="flex items-center gap-2 border-b border-content/5 last:border-b-0"
                >
                  <button
                    type="button"
                    disabled={busy}
                    title={entry.path}
                    onClick={() =>
                      void run(() => readTextFile(entry.path))
                    }
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2.5 py-2 text-left hover:bg-content/8 disabled:opacity-40"
                  >
                    <span className="min-w-0 truncate text-sm text-content/85">
                      {entry.name}
                    </span>
                    <span className="max-w-40 shrink-0 truncate font-mono text-xs text-content/40">
                      {prettyParent(entry.path)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("Remove")}
                    title={t("Remove")}
                    onClick={() => {
                      forgetSessionExport(entry.path);
                      setRecents((prev) =>
                        prev.filter((item) => item.path !== entry.path),
                      );
                    }}
                    className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-content/35 hover:bg-content/10 hover:text-content"
                  >
                    <X className="size-3.5" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = path.trim();
            if (value) void run(() => readTextFile(value));
          }}
        >
          <label className="text-2xs font-medium uppercase tracking-widest text-content/45">
            {t("Paste a file path")}
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/…/session.json"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-content/10 bg-content/5 px-2 py-1.5 font-mono text-sm text-content outline-none focus:border-content/25"
            />
            <button
              type="submit"
              disabled={busy || !path.trim()}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
            >
              {t("Import")}
            </button>
          </div>
        </form>

        {error ? (
          <p className="text-[12px] leading-snug text-red-400">{error}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-content/10 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                if (busy) return;
                setError(null);
                let picked: Awaited<ReturnType<typeof pickSessionImportFile>>;
                try {
                  picked = await pickSessionImportFile();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  return;
                }
                if (!picked) return;
                await run(async () => picked.text);
              })();
            }}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content/60 hover:bg-content/8 hover:text-content disabled:opacity-40"
          >
            {t("Browse…")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-content/70 hover:bg-content/8 hover:text-content"
          >
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
