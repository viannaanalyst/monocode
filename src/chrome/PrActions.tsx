import { useState } from "react";
import { Check, ChevronDown, LoaderCircle, RotateCcw, X } from "./icons";
import {
  prApproveAvailability,
  prMergeAvailability,
  type PrReviewEvent,
} from "../lib/prReview";
import type { GithubPrDetails } from "../lib/githubTasks";
import { t } from "../i18n";

export type PrMergeMethod = "squash" | "merge" | "rebase";

const ACTION_FILLED =
  "inline-flex h-7 items-center gap-1.5 rounded-md bg-content px-2.5 text-[12px] font-medium text-background-base disabled:cursor-default disabled:opacity-40";
const ACTION_OUTLINE =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-content/15 px-2.5 text-[12px] text-content/80 hover:bg-content/5 disabled:cursor-default disabled:opacity-40";

const METHOD_LABELS: Record<PrMergeMethod, string> = {
  squash: "Squash and merge",
  merge: "Create a merge commit",
  rebase: "Rebase and merge",
};

export function PrActions({
  details,
  viewerLogin,
  busy,
  onSubmitReview,
  onToggleState,
  onMerge,
}: {
  details: GithubPrDetails;
  viewerLogin: string;
  busy: string | null;
  onSubmitReview: (event: PrReviewEvent) => void;
  onToggleState: (close: boolean) => void;
  onMerge: (method: PrMergeMethod) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const merge = prMergeAvailability(details);
  const approve = prApproveAvailability(details, viewerLogin);
  const closed = details.state.trim().toUpperCase() !== "OPEN";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex">
        <button
          type="button"
          disabled={busy != null || !merge.enabled}
          title={t(merge.reason)}
          onClick={() => onMerge("squash")}
          className={`${ACTION_FILLED} rounded-r-none`}
        >
          {busy === "merge" ? (
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Check className="size-3.5" strokeWidth={1.75} />
          )}
          {t("Merge")}
        </button>
        <button
          type="button"
          aria-label={t("Merge options")}
          disabled={busy != null || !merge.enabled}
          onClick={() => setMenuOpen((open) => !open)}
          className={`${ACTION_FILLED} rounded-l-none border-l border-background-base/10 px-1.5`}
        >
          <ChevronDown className="size-3.5" strokeWidth={2} />
        </button>
        {menuOpen ? (
          <div className="absolute top-full left-0 z-30 mt-1 min-w-52 rounded-md border border-content/10 bg-background-base py-1 shadow-lg">
            {(Object.keys(METHOD_LABELS) as PrMergeMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onMerge(method);
                }}
                className="flex h-7 w-full items-center px-3 text-left text-[12px] text-content hover:bg-content/10"
              >
                {t(METHOD_LABELS[method])}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy != null || !approve.enabled}
        title={t(approve.reason)}
        onClick={() => onSubmitReview("approve")}
        className={ACTION_OUTLINE}
      >
        {t("Approve")}
      </button>
      <button
        type="button"
        disabled={busy != null || closed}
        onClick={() => onSubmitReview("request-changes")}
        className={ACTION_OUTLINE}
      >
        {t("Request changes")}
      </button>
      <button
        type="button"
        disabled={busy != null}
        onClick={() => onToggleState(!closed)}
        className={ACTION_OUTLINE}
      >
        {closed ? (
          <RotateCcw className="size-3.5" strokeWidth={1.75} />
        ) : (
          <X className="size-3.5" strokeWidth={1.75} />
        )}
        {closed ? t("Reopen pull request") : t("Close pull request")}
      </button>
    </div>
  );
}
