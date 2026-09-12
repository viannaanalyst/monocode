import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Folder, GitBranch } from "./icons";

const GAP = 8;
const INSET = 8;

type Props = {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  title: string;
  branch?: string | null;
  path?: string | null;
};

/**
 * The floating preview beside a session row: title, branch and folder, the way
 * Cursor shows a conversation on hover rather than a plain text tooltip.
 */
export function SessionHoverCard({ anchor, open, title, branch, path }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!open || !anchor.current || !card) {
      setPosition(null);
      return;
    }
    const rect = anchor.current.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    let left = rect.right + GAP;
    if (left + bounds.width > window.innerWidth - INSET) {
      left = Math.max(INSET, rect.left - GAP - bounds.width);
    }
    const top = Math.min(
      Math.max(INSET, rect.top),
      Math.max(INSET, window.innerHeight - INSET - bounds.height),
    );
    setPosition({ left, top });
  }, [anchor, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      aria-hidden="true"
      className="monocode-session-card pointer-events-none fixed z-[200] w-72 max-w-[80vw] rounded-xl border border-content/12 bg-background-base/65 p-3 font-sans shadow-2xl backdrop-blur-2xl backdrop-saturate-150"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <p className="text-[13px] font-semibold leading-snug text-content">
        {title}
      </p>
      {branch ? (
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-content/55">
          <GitBranch className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate font-mono">{branch}</span>
        </p>
      ) : null}
      {path ? (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-content/55">
          <Folder className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate font-mono">{path}</span>
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
