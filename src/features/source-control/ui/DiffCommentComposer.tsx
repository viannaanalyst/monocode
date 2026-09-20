import { useState } from "react";
import { MessageSquarePlus, X } from "../../../shared/ui/icons";
import { Popover, type PopoverAnchor } from "../../../shared/ui/Popover";
import { diffCommentLocation, formatDiffComment } from "../model/diffComment";
import { MOD } from "../../../platform/tauri/platform";
import { requestAddToChat } from "../../sessions/model/quoteDraft";
import type { UnifiedLine } from "../model/unifiedDiff";
import { t } from "../../../i18n";


export type DiffCommentComposerTarget = {
  line: UnifiedLine;
  anchor: PopoverAnchor;
};

export function DiffCommentComposer({
  path,
  target,
  onDismiss,
  submitLabel,
  onSubmit,
}: {
  path: string;
  target: DiffCommentComposerTarget;
  onDismiss: () => void;
  submitLabel?: string;
  onSubmit?: (body: string) => void;
}) {
  const [comment, setComment] = useState("");
  const location = diffCommentLocation({ path, line: target.line });
  const submit = () => {
    const body = comment.trim();
    if (!body) return;
    if (onSubmit) {
      onSubmit(body);
    } else {
      const text = formatDiffComment({ path, line: target.line }, comment);
      if (!text) return;
      requestAddToChat(text, "plain");
    }
    onDismiss();
  };

  return (
    <Popover
      anchor={target.anchor}
      side="right"
      align="start"
      gap={6}
      width={320}
      onDismiss={onDismiss}
      role="dialog"
      aria-label={t("Comment on {location}", { location })}
      className="p-2"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-content/55"
            title={location}
          >
            {location}
          </span>
          <button
            type="button"
            title={t("Cancel comment")}
            aria-label={t("Cancel comment")}
            onClick={onDismiss}
            className="grid size-5 shrink-0 place-items-center rounded text-content/45 hover:bg-content/10 hover:text-content"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <textarea
          autoFocus
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              comment.trim()
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("Leave a comment…")}
          className="max-h-40 min-h-18 w-full resize-y rounded-lg border border-content/10 bg-background-base/70 px-2.5 py-2 text-sm leading-5 text-content outline-none placeholder:text-content/35 focus:border-content/20"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-2xs text-content/35">{MOD}↩ to add</span>
          <button
            type="submit"
            disabled={!comment.trim()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-sm font-medium text-background-base hover:opacity-80 disabled:cursor-default disabled:opacity-40"
          >
            <MessageSquarePlus className="size-3.5" strokeWidth={1.75} />{submitLabel ?? t("Add to chat")}</button>
        </div>
      </form>
    </Popover>
  );
}
