import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "../chrome/icons";
import { t } from "../i18n";

type Props = {
  query: string;
  active: number;
  count: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
};

export function TranscriptFindBar({
  query,
  active,
  count,
  inputRef,
  onQueryChange,
  onPrev,
  onNext,
  onClose,
  onInputKeyDown,
}: Props) {
  const empty = query.trim().length === 0;
  const label = empty
    ? ""
    : count === 0
      ? t("No results")
      : `${active + 1}/${count}`;

  return (
    <div
      role="search"
      className="absolute right-3 top-2 z-30 flex items-center gap-1.5 rounded-lg border border-content/12 bg-background-base/95 px-1.5 py-1 shadow-xl backdrop-blur-xl"
      data-no-tooltip
    >
      <Search className="ml-1 size-3.5 shrink-0 text-content/40" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder={t("Find in conversation")}
        aria-label={t("Find in conversation")}
        spellCheck={false}
        autoComplete="off"
        className="h-6 w-52 min-w-0 bg-transparent font-sans text-[12px] text-content outline-none placeholder:text-content/35"
      />
      <span
        aria-live="polite"
        className="min-w-10 shrink-0 text-center font-sans text-[11px] tabular-nums text-content/45"
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={t("Previous match")}
        disabled={count === 0}
        onClick={onPrev}
        className="grid size-6 shrink-0 place-items-center rounded-md text-content/55 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronUp className="size-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={t("Next match")}
        disabled={count === 0}
        onClick={onNext}
        className="grid size-6 shrink-0 place-items-center rounded-md text-content/55 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronDown className="size-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
        className="grid size-6 shrink-0 place-items-center rounded-md text-content/55 hover:bg-content/10 hover:text-content"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
