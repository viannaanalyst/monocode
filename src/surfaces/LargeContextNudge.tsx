import { useMemo, useState } from "react";
import { Sparkles, X } from "../chrome/icons";
import { t } from "../i18n";
import type { Block, HarnessId, Session } from "../lib/session";
import { groupTurns } from "./transcriptActivity";

/** Rough character budget before nudging. ~30k tokens of transcript. */
const LARGE_CONTEXT_CHARS = 120_000;
const DISMISS_KEY = "monocode.largeContextDismissed";
/** Re-nudge only once the session grows this much beyond the last dismissal. */
const REGROWTH = 1.3;

function estimateChars(blocks: readonly Block[]): number {
  let total = 0;
  for (const block of blocks) {
    total += block.text?.length ?? 0;
    const tool = block.tool;
    if (!tool) continue;
    total += (tool.title?.length ?? 0) + (tool.detail?.length ?? 0);
    const preview = tool.preview;
    if (!preview) continue;
    total +=
      (preview.query?.length ?? 0) +
      (preview.path?.length ?? 0) +
      (preview.output?.length ?? 0) +
      (preview.title?.length ?? 0);
  }
  return total;
}

function loadDismissed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function saveDismissed(map: Record<string, number>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    // private mode / quota
  }
}

type Props = {
  session: Session;
  onHandoff?: (harness: HarnessId, turn: Block[], model: string) => void;
};

/**
 * Nudges toward "continue in a summarized session" when a transcript grows
 * large. The handoff reuses the latest turn, so the new session starts with a
 * deterministic summary of everything up to here instead of the full log.
 */
export function LargeContextNudge({ session, onHandoff }: Props) {
  const size = useMemo(() => estimateChars(session.blocks), [session.blocks]);
  const [dismissed, setDismissed] = useState(loadDismissed);
  if (!onHandoff || size < LARGE_CONTEXT_CHARS) return null;
  const previous = dismissed[session.id];
  if (previous != null && size <= previous * REGROWTH) return null;
  const turns = groupTurns(session.blocks);
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || lastTurn.length === 0) return null;

  const dismiss = () => {
    const next = { ...dismissed, [session.id]: size };
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-content/10 bg-content/[0.03] px-3 py-2.5 text-[12px] text-content/70">
      <Sparkles
        className="mt-0.5 size-3.5 shrink-0 text-amber-400/80"
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <p className="text-content/80">
          {t("This conversation is using a lot of context.")}
        </p>
        <p className="mt-0.5 text-content/50">
          {t(
            "Continue in a summarized session to keep the next turns fast and focused.",
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onHandoff(session.harness, lastTurn, session.model)}
        className="shrink-0 rounded-md border border-content/15 px-2.5 py-1 text-[12px] text-content/80 hover:bg-content/5"
      >
        {t("Create summarized session")}
      </button>
      <button
        type="button"
        aria-label={t("Dismiss")}
        title={t("Dismiss")}
        onClick={dismiss}
        className="grid size-6 shrink-0 place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
