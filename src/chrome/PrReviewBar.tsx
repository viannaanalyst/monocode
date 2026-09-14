import { useState } from "react";
import { GitPullRequest, Trash2 } from "./icons";
import {
  canSubmitReview,
  type PrReviewComment,
  type PrReviewDraft,
  type PrReviewEvent,
} from "../lib/prReview";
import { t } from "../i18n";

export function PrReviewBar({
  draft,
  busy,
  onSubmit,
  onDiscard,
  onEdit,
  onRemove,
}: {
  draft: PrReviewDraft;
  busy: string | null;
  onSubmit: (event: PrReviewEvent, body: string) => void;
  onDiscard: () => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<PrReviewEvent>("comment");
  const count = draft.comments.length;

  return (
    <div className="rounded-md border border-content/15 bg-content/[0.03] p-3">
      <div className="flex items-center gap-2">
        <GitPullRequest className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-[12px] text-content/80">
          {count === 1
            ? t("1 review comment")
            : t("{count} review comments", { count })}
        </span>
        <button
          type="button"
          disabled={busy != null}
          onClick={onDiscard}
          className="text-[11px] text-content/50 hover:text-content disabled:opacity-40"
        >
          {t("Discard review")}
        </button>
        <button
          type="button"
          disabled={busy != null || (event !== "approve" && !canSubmitReview(draft, event))}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:opacity-40"
        >
          {t("Submit review")}
        </button>
      </div>
      {count > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {draft.comments.map((comment: PrReviewComment) => (
            <li
              key={comment.id}
              className="flex items-start gap-2 rounded bg-content/5 px-2 py-1.5"
            >
              <span className="shrink-0 font-mono text-[11px] text-content/50">
                {comment.path}:{comment.line}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-content/80">
                {comment.body}
              </span>
              <button
                type="button"
                title={t("Edit comment")}
                onClick={() => {
                  const next = window.prompt(t("Edit comment"), comment.body);
                  if (next != null) onEdit(comment.id, next);
                }}
                className="shrink-0 text-[11px] text-content/50 hover:text-content"
              >
                {t("Edit")}
              </button>
              <button
                type="button"
                aria-label={t("Remove comment")}
                onClick={() => onRemove(comment.id)}
                className="shrink-0 text-content/50 hover:text-content"
              >
                <Trash2 className="size-3" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-content/45">{t("No pending comments")}</p>
      )}
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            rows={3}
            value={body}
            onChange={(input) => setBody(input.target.value)}
            placeholder={t("Review summary (optional for approve)")}
            className="w-full resize-y rounded-md border border-content/10 bg-background-base/70 px-2.5 py-2 text-[13px] leading-5 text-content outline-none placeholder:text-content/35"
          />
          <div className="flex items-center gap-1.5">
            {(["comment", "approve", "request-changes"] as PrReviewEvent[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={event === option}
                onClick={() => setEvent(option)}
                className={`rounded-md px-2 py-1 text-[11px] ${
                  event === option
                    ? "bg-content/15 text-content"
                    : "text-content/50 hover:text-content/80"
                }`}
              >
                {option === "comment"
                  ? t("Comment")
                  : option === "approve"
                    ? t("Approve")
                    : t("Request changes")}
              </button>
            ))}
            <button
              type="button"
              disabled={
                busy != null || (event !== "approve" && !canSubmitReview(draft, event))
              }
              onClick={() => onSubmit(event, body.trim())}
              className="ml-auto inline-flex h-7 items-center rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:opacity-40"
            >
              {t("Publish review")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
