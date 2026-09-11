import type { IconComponent } from "./icons";

type Props = {
  label: string;
  icon: IconComponent;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
  dot?: boolean;
  shortcut?: string;
  ariaLabel?: string;
};

export function RailAction({
  label,
  icon: Icon,
  onClick,
  active = false,
  badge,
  dot = false,
  shortcut,
  ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-no-tooltip
      aria-label={ariaLabel ?? label}
      className={`relative flex w-full items-center gap-2 rounded-md px-2 h-8  text-left ${
        active
          ? "bg-content/10 text-content"
          : "text-content/50 hover:bg-content/10 hover:text-content"
      } disabled:cursor-default disabled:opacity-40`}
    >
      {badge != null ? (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 grid min-w-4 -translate-y-1/2 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <Icon
        className={`size-4 shrink-0 opacity-70 ${badge != null ? "ml-4" : ""}`}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
        {label}
      </span>
      {dot ? (
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
      ) : shortcut ? (
        <span aria-hidden className="shrink-0 text-[11px] text-content/40">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

/** Compact, label-free variant for a horizontal row of rail actions. */
export function RailIconAction({
  label,
  icon: Icon,
  onClick,
  active = false,
  dot = false,
  badge,
  ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={label}
      aria-label={ariaLabel ?? label}
      className={`relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-md ${
        active
          ? "bg-content/10 text-content"
          : "text-content/50 hover:bg-content/10 hover:text-content"
      } disabled:cursor-default disabled:opacity-40`}
    >
      <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
      {badge != null ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-semibold leading-4 text-white tabular-nums"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : dot ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent"
        />
      ) : null}
    </button>
  );
}

export function RailSearch({
  label,
  icon: Icon,
  onClick,
  active = false,
  shortcut,
  ariaLabel,
}: {
  label: string;
  icon: IconComponent;
  onClick?: () => void;
  active?: boolean;
  shortcut?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-no-tooltip
      aria-label={ariaLabel ?? label}
      className={`relative flex w-full items-center gap-2 rounded-md border border-content/8 px-1.5 shadow-sm h-8 text-left ${
        active
          ? "bg-content/10 text-content"
          : "text-content/50 hover:bg-content/10 hover:text-content"
      } disabled:cursor-default disabled:opacity-40`}
    >
      <Icon className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
        {label}
      </span>
      {shortcut ? (
        <span aria-hidden className="shrink-0 text-[11px] text-content/40">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}
