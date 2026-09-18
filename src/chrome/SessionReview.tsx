import { ChevronDown, ChevronRight, FileDiff } from "./icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  keepSessionChanges,
  sessionCheckpointStatus,
  subscribeReviewChanged,
  undoSessionChanges,
  undoSessionTurn,
  type CheckpointFile,
} from "../lib/checkpoint";
import { invalidateProjectFiles } from "../lib/fileIndex";
import { invalidateWatchedFiles } from "../lib/fileWatch";
import { basename, notifyGitChanged, subscribeGitChanged } from "../lib/fs";
import { FileTypeIcon } from "./FileTypeIcon";
import { t } from "../i18n";


type Props = {
  sessionId: string;
  cwd: string;
  enabled?: boolean;
  busy?: boolean;
  undoLocked?: boolean;
  onOpenDiff: (
    path?: string,
    session?: { sessionId: string; cwd: string },
  ) => void;
};

export function SessionReview({
  sessionId,
  cwd,
  enabled = true,
  busy = false,
  undoLocked = false,
  onOpenDiff,
}: Props) {
  const [files, setFiles] = useState<CheckpointFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState<
    "keep" | "undo" | "undo-turn" | null
  >(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const load = useCallback(() => {
    if (!cwd || cwd === "~") {
      setFiles([]);
      return;
    }
    void sessionCheckpointStatus(sessionId, cwd)
      .then((status) => setFiles(status.files))
      .catch(() => setFiles([]));
  }, [sessionId, cwd]);

  useEffect(() => {
    if (!enabled || busy) return;
    load();
    let timer: number | null = null;
    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        load();
      }, 200);
    };
    const unsubReview = subscribeReviewChanged((id) => {
      if (!id || id === sessionId) schedule();
    });
    const unsubGit = subscribeGitChanged(() => {
      if (filesRef.current.length > 0) schedule();
    });
    const onResume = () => {
      if (filesRef.current.length > 0) schedule();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      unsubReview();
      unsubGit();
    };
  }, [enabled, load, sessionId, busy]);

  useEffect(() => {
    if (files.length <= 3) setExpanded(false);
  }, [files.length]);

  useEffect(() => {
    if (busy) setFiles([]);
  }, [busy]);

  // The card represents the result of a turn. Keep it out of the live turn,
  // then refresh and reveal it once the turn has settled.
  if (busy || files.length === 0) return null;

  const disabled = acting != null;
  const canUndoAll = !undoLocked && files.every((file) => file.undoable);
  const visibleFiles = expanded ? files : files.slice(0, 3);
  const hiddenFileCount = files.length - visibleFiles.length;
  const totals = files.reduce(
    (sum, file) => ({
      additions: sum.additions + file.additions,
      deletions: sum.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  const run = (action: "keep" | "undo" | "undo-turn") => {
    if (disabled) return;
    setActing(action);
    const op =
      action === "keep"
        ? keepSessionChanges(sessionId, cwd)
        : action === "undo-turn"
          ? undoSessionTurn(sessionId, cwd)
          : undoSessionChanges(sessionId, cwd);
    const previous = filesRef.current.map((file) => file.path);
    void op
      .then((status) => {
        setFiles(status.files);
        notifyGitChanged();
        invalidateWatchedFiles(previous);
        invalidateProjectFiles(cwd);
      })
      .catch(() => load())
      .finally(() => setActing(null));
  };

  return (
    <div className="px-4 pt-1 pb-2 font-sans" data-session-review-shell>
      <div
        className="overflow-hidden rounded-xl border border-content/12 bg-content/3"
        data-session-review
      >
        <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-content/8 text-content/55">
            <FileDiff className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-content/80">
              {t(
                files.length === 1
                  ? "Changed {count} file"
                  : "Changed {count} files",
                { count: files.length },
              )}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-2xs font-medium tabular-nums -mt-0.5">
              <span className="text-emerald-400">+{totals.additions}</span>
              <span className="text-red-400">-{totals.deletions}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              data-no-tooltip
              disabled={disabled}
              onClick={() => run("undo-turn")}
              className="h-7 rounded-md px-2.5 text-xs text-content/50 hover:bg-content/8 hover:text-content disabled:opacity-35"
            >
              {acting === "undo-turn"
                ? t("Undoing…")
                : t("Undo response")}
            </button>
            <button
              type="button"
              data-no-tooltip
              disabled={disabled || !canUndoAll}
              onClick={() => run("undo")}
              className="h-7 rounded-md px-2.5 text-xs text-content/50 hover:bg-content/8 hover:text-content disabled:opacity-35"
            >
              {t("Undo")}
            </button>
            <button
              type="button"
              data-no-tooltip
              disabled={disabled}
              onClick={() => run("keep")}
              className="h-7 rounded-md px-2.5 text-xs text-content/50 hover:bg-content/8 hover:text-content disabled:opacity-35"
            >
              {t("Keep")}
            </button>
            <button
              type="button"
              data-no-tooltip
              onClick={() => onOpenDiff(undefined, { sessionId, cwd })}
              className="h-7 rounded-md border border-content/12 bg-content/8 px-2.5 text-xs font-medium text-content/75 hover:bg-content/12 hover:text-content"
            >
              {t("Review")}
            </button>
          </div>
        </div>
        <ul
          className={`scrollbar-none border-t border-stroke py-1 ${
            expanded ? "max-h-64 overflow-y-auto" : ""
          }`}
        >
          {visibleFiles.map((file) => (
            <li key={file.relative}>
              <FileRow
                file={file}
                sessionId={sessionId}
                cwd={cwd}
                onOpenDiff={onOpenDiff}
              />
            </li>
          ))}
        </ul>
        {files.length > 3 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="flex h-8 w-full items-center gap-1.5 border-t border-content/10 px-3 text-left text-xs text-content/45 hover:bg-content/5 hover:text-content/70"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="size-3.5" strokeWidth={1.75} />
            )}
            <span>
              {expanded
                ? t("Show fewer files")
                : t(
                    hiddenFileCount === 1
                      ? "Show {count} more file"
                      : "Show {count} more files",
                    { count: hiddenFileCount },
                  )}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FileRow({
  file,
  sessionId,
  cwd,
  onOpenDiff,
}: {
  file: CheckpointFile;
  sessionId: string;
  cwd: string;
  onOpenDiff: (
    path?: string,
    session?: { sessionId: string; cwd: string },
  ) => void;
}) {
  const name = basename(file.relative);
  return (
    <button
      type="button"
      title={file.relative}
      onClick={() => onOpenDiff(file.path, { sessionId, cwd })}
      className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-content/65 hover:bg-content/5 hover:text-content"
    >
      <FileTypeIcon name={name} isDir={false} size={15} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
        {file.relative}
      </span>
      <DiffCounts file={file} />
    </button>
  );
}

function DiffCounts({ file }: { file: CheckpointFile }) {
  if (!file.exact) {
    return (
      <span className="shrink-0 text-2xs font-medium text-amber-300/80">
        {t("Mixed changes")}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 gap-2 font-mono text-2xs font-medium tabular-nums">
      <span className="text-emerald-400">+{file.additions}</span>
      <span className="text-red-400">-{file.deletions}</span>
    </span>
  );
}
