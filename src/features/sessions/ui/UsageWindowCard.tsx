import { t } from "../../../i18n";
import {
  clampUsedPercent,
  formatResetCountdown,
  formatUsagePercent,
  type ProviderRateLimits,
  type RateLimitWindow,
} from "../../providers/model/rateLimits";

export type UsageWindowKind = "session" | "weekly" | "monthly";

/** Traffic-light bar color shared by every usage surface. */
export function usageBarClass(pct: number): string {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-content/45";
}

/** Freshness line under a provider's usage title. */
export function usageUpdatedLabel(
  limits: ProviderRateLimits,
  now: number,
): string {
  if (limits.updatedAt <= 0) return t("Rate-limit details");
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - limits.updatedAt) / 60_000),
  );
  if (elapsedMinutes === 0) return t("Updated just now");
  if (elapsedMinutes < 60) {
    return t("Updated {minutes}m ago", { minutes: elapsedMinutes });
  }
  return t("Updated {hours}h ago", {
    hours: Math.floor(elapsedMinutes / 60),
  });
}

function windowLimitLabel(kind: UsageWindowKind): string {
  if (kind === "session") return t("5-hour limit");
  if (kind === "weekly") return t("Weekly limit");
  return t("Monthly limit");
}

function windowFallbackLabel(kind: UsageWindowKind): string {
  if (kind === "session") return t("5-hour window");
  if (kind === "weekly") return t("Weekly window");
  return t("Monthly window");
}

/** One rate-limit window with its bar, remaining share, and reset time. */
export function UsageWindowCard({
  kind,
  window,
  now,
  title,
  remainingLabel,
}: {
  kind: UsageWindowKind;
  window: RateLimitWindow;
  now: number;
  title?: string;
  remainingLabel?: string;
}) {
  const pct = clampUsedPercent(window.usedPercent);
  const remaining = Math.max(0, Math.round(100 - pct));
  const resolvedTitle = title ?? windowLimitLabel(kind);
  return (
    <section className="rounded-lg bg-content/[0.045] px-3 py-2.5 ring-1 ring-inset ring-content/[0.06]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium text-content/65">{resolvedTitle}</h3>
        <span className="shrink-0 text-xs font-medium tabular-nums">
          {t("{percent} used", { percent: formatUsagePercent(pct) })}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-content/10"
        role="progressbar"
        aria-label={t("{title} used", { title: resolvedTitle })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <span
          className={`block h-full rounded-full ${usageBarClass(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] leading-4 text-content/40">
        <span className="tabular-nums">
          {remainingLabel ??
            t("{percent}% remaining", { percent: remaining })}
        </span>
        <span
          className="truncate text-right tabular-nums"
          title={
            window.resetsAt == null
              ? undefined
              : new Date(window.resetsAt).toLocaleString()
          }
        >
          {window.resetsAt == null
            ? windowFallbackLabel(kind)
            : formatResetCountdown(window.resetsAt - now)}
        </span>
      </div>
    </section>
  );
}
