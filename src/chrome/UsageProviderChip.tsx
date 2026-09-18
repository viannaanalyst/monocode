import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  clampUsedPercent,
  formatRateLimitWindowChipLabel,
  formatResetDuration,
  formatUsagePercent,
  type ProviderRateLimits,
  type RateLimitProvider,
  type RateLimitResetCredit,
  type RateLimitWindow,
} from "../lib/rateLimits";
import type { CodexRateLimitResetOutcome } from "../lib/rateLimitsFetch";
import { mascotPath, projectMascot } from "../lib/projectMascots";
import { projectKey, projectName } from "../lib/paths";
import { HARNESS_TITLE } from "../lib/session";
import { t } from "../i18n";
import { formatCost } from "../lib/usageCost";
import {
  ProviderAccountControls,
  providerChipAccountSuffix,
} from "./ProviderAccountControls";
import {
  getProviderAccountsSnapshot,
  subscribeProviderAccounts,
} from "../lib/providerAccounts";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupMascot,
} from "../lib/tabGroups";
import { HarnessIcon } from "./HarnessIcon";
import { RefreshCw } from "./icons";
import { Popover, type PopoverDismissReason } from "./Popover";
import {
  usageBarClass as barClass,
  usageUpdatedLabel,
  UsageWindowCard,
} from "./UsageWindowCard";
import {
  ProviderSignInPanel,
  type ProviderSignInState,
} from "./ProviderSignInPanel";

type UsageWindowEntry = {
  key: "session" | "weekly" | "monthly";
  window: RateLimitWindow;
};

type ResetActionState =
  "idle" | "confirming" | "using" | CodexRateLimitResetOutcome | "error";

export function UsageProviderChip({
  limits,
  now,
  project,
  onConsumeReset,
  onReconnect,
  onAccountSelected,
}: {
  limits: ProviderRateLimits;
  now: number;
  project?: string;
  onConsumeReset?: (creditId?: string) => Promise<CodexRateLimitResetOutcome>;
  onReconnect?: () => Promise<void>;
  onAccountSelected?: (accountId: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [resetAction, setResetAction] = useState<ResetActionState>("idle");
  const [activeResetKey, setActiveResetKey] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [reconnectState, setReconnectState] =
    useState<ProviderSignInState>("idle");
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  useSyncExternalStore(
    subscribeProviderAccounts,
    getProviderAccountsSnapshot,
    getProviderAccountsSnapshot,
  );
  const accountSuffix = providerChipAccountSuffix(limits.provider, project);
  const loading =
    limits.status === "idle" ||
    (limits.status === "fetching" &&
      !limits.session &&
      !limits.weekly &&
      !limits.monthly);
  const disconnected = limits.status === "unavailable";
  const chipWindows = usageWindows(limits, "chip");
  const popoverWindows = usageWindows(limits, "popover");
  const loginView = Boolean(
    onReconnect &&
    popoverWindows.length === 0 &&
    (needsProviderLogin(limits) || reconnectState !== "idle"),
  );
  const tightest = chipWindows.reduce<RateLimitWindow | null>((best, entry) => {
    if (!best || entry.window.usedPercent > best.usedPercent) {
      return entry.window;
    }
    return best;
  }, null);
  const providerLabel = HARNESS_TITLE[limits.provider];
  const chipAria = accountSuffix
    ? `${providerLabel} · ${accountSuffix}`
    : `${providerLabel} usage details`;
  const mascotProject = project ? projectName(project) : providerLabel;
  const appearanceKey = project ? projectKey(project) : mascotProject;
  const mascotName = resolveTabGroupMascot(
    appearanceKey,
    loadTabGroupMascots(),
  );
  const mascotColor = resolveTabGroupColor(
    appearanceKey,
    loadTabGroupColors(),
    loadTabGroupCustomColors(),
    mascotProject,
  );

  useEffect(() => {
    if (open) return;
    setResetAction("idle");
    setActiveResetKey(null);
    setResetError(null);
    setReconnectState("idle");
    setReconnectError(null);
  }, [open]);

  const dismiss = (reason: PopoverDismissReason) => {
    setOpen(false);
    if (reason === "escape") {
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };

  const useReset = async (
    credit: RateLimitResetCredit | undefined,
    rowKey: string,
  ) => {
    if (!onConsumeReset) return;
    setActiveResetKey(rowKey);
    setResetAction("using");
    setResetError(null);
    try {
      setResetAction(await onConsumeReset(credit?.id));
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "Could not use this reset",
      );
      setResetAction("error");
    }
  };

  const reconnect = async () => {
    if (!onReconnect) return;
    setReconnectState("running");
    setReconnectError(null);
    try {
      await onReconnect();
      setReconnectState("complete");
    } catch (error) {
      setReconnectError(
        error instanceof Error ? error.message : "Could not complete sign-in",
      );
      setReconnectState("error");
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-no-tooltip
        className="-mx-1 inline-flex h-5 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-1 text-content/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-content/10 hover:text-content focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]"
        aria-label={chipAria}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <HarnessIcon harness={limits.provider} className="size-3 shrink-0" />
        {accountSuffix ? (
          <span className="max-w-[7rem] truncate text-content/45">
            {accountSuffix}
          </span>
        ) : null}
        {loading ? (
          <span className="animate-pulse text-content/35">···</span>
        ) : disconnected ? (
          <span className="text-content/35">not connected</span>
        ) : chipWindows.length === 0 ? (
          <span className="text-content/35">{emptyUsageLabel(limits)}</span>
        ) : (
          <>
            {tightest ? <MiniBar usedPct={tightest.usedPercent} /> : null}
            <span className="flex min-w-0 items-center gap-1 tabular-nums">
              {chipWindows.map((entry, index) => (
                <span
                  key={entry.key}
                  className="inline-flex items-center gap-1"
                >
                  {index > 0 ? (
                    <span className="text-content/25">·</span>
                  ) : null}
                  <span>
                    {formatUsagePercent(entry.window.usedPercent)}{" "}
                    {formatRateLimitWindowChipLabel(entry.window, now)}
                  </span>
                </span>
              ))}
            </span>
          </>
        )}
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="top"
          align="start"
          gap={7}
          width={300}
          maxHeight={460}
          autoFocus
          onDismiss={dismiss}
          role="dialog"
          aria-label={`${providerLabel} usage details`}
          tabIndex={-1}
          className="overflow-y-auto p-2.5 text-content"
        >
          {loginView ? (
            <>
              <ProviderAccountControls
                provider={limits.provider}
                project={project}
                onSelected={onAccountSelected}
              />
              <ProviderSignInPanel
                harness={limits.provider}
                state={reconnectState}
                error={reconnectError}
                onSignIn={() => void reconnect()}
              />
            </>
          ) : (
            <>
              <ProviderAccountControls
                provider={limits.provider}
                project={project}
                onSelected={onAccountSelected}
              />
              <div className="flex items-start gap-2.5 px-1 pb-2.5 pt-0.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-content/[0.06] ring-1 ring-inset ring-content/[0.07]">
                  <HarnessIcon harness={limits.provider} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-medium leading-4">
                    {providerLabel} usage
                  </h2>
                  <p className="mt-0.5 text-[10px] leading-4 text-content/40">
                    {usageUpdatedLabel(limits, now)}
                  </p>
                </div>
                {limits.status === "fetching" ? (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-content/40">
                    <RefreshCw
                      className="size-3 animate-spin"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Updating
                  </span>
                ) : null}
              </div>

              {limits.status === "error" && popoverWindows.length > 0 ? (
                <p className="mb-2 rounded-lg bg-amber-400/10 px-2.5 py-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                  Couldn’t refresh. Showing the last available snapshot.
                </p>
              ) : null}

              {popoverWindows.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {popoverWindows.map((entry) => (
                    <UsageWindowCard
                      key={entry.key}
                      kind={entry.key}
                      window={entry.window}
                      now={now}
                      title={cursorWindowTitle(limits.provider, entry.key)}
                      remainingLabel={cursorRemainingLabel(
                        limits,
                        entry.key,
                      )}
                    />
                  ))}
                  {limits.cursorDetail && limits.cursorDetail.bonusUsd > 0 ? (
                    <p className="px-1 text-[10px] leading-4 text-content/40">
                      {t("Bonus usage {amount}", {
                        amount: formatCost(limits.cursorDetail.bonusUsd),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyUsageState limits={limits} loading={loading} />
              )}

              {limits.provider === "codex" ? (
                <BankedResets
                  limits={limits}
                  now={now}
                  action={resetAction}
                  activeResetKey={activeResetKey}
                  error={resetError}
                  mascotProject={mascotProject}
                  mascotName={mascotName}
                  mascotColor={mascotColor}
                  onConfirm={(creditId) => {
                    setActiveResetKey(creditId);
                    setResetAction("confirming");
                  }}
                  onCancel={() => {
                    setActiveResetKey(null);
                    setResetAction("idle");
                  }}
                  onUse={useReset}
                  canUse={Boolean(onConsumeReset)}
                />
              ) : null}
            </>
          )}
        </Popover>
      ) : null}
    </>
  );
}

function usageWindows(
  limits: ProviderRateLimits,
  surface: "chip" | "popover" = "popover",
): UsageWindowEntry[] {
  if (limits.provider === "cursor") {
    const monthly = limits.monthly
      ? ({ key: "monthly", window: limits.monthly } as const)
      : null;
    const weekly = limits.weekly
      ? ({ key: "weekly", window: limits.weekly } as const)
      : null;
    if (surface === "chip") {
      return monthly ? [monthly] : weekly ? [weekly] : [];
    }
    const entries: UsageWindowEntry[] = [];
    if (monthly) entries.push(monthly);
    if (weekly) entries.push(weekly);
    return entries;
  }
  return [
    limits.session
      ? ({ key: "session", window: limits.session } as const)
      : null,
    limits.weekly ? ({ key: "weekly", window: limits.weekly } as const) : null,
    limits.monthly
      ? ({ key: "monthly", window: limits.monthly } as const)
      : null,
  ].filter((entry): entry is UsageWindowEntry => entry != null);
}

function cursorWindowTitle(
  provider: RateLimitProvider,
  kind: UsageWindowEntry["key"],
): string | undefined {
  if (provider !== "cursor") return undefined;
  if (kind === "monthly") return t("Plan cycle");
  if (kind === "weekly") return t("On-demand");
  return undefined;
}

function cursorRemainingLabel(
  limits: ProviderRateLimits,
  kind: UsageWindowEntry["key"],
): string | undefined {
  const detail = limits.cursorDetail;
  if (limits.provider !== "cursor" || !detail) return undefined;
  if (kind === "monthly") {
    return t("{used} of {limit}", {
      used: formatCost(detail.includedUsd),
      limit: formatCost(detail.limitUsd),
    });
  }
  if (
    kind === "weekly" &&
    detail.spendUsedUsd != null &&
    detail.spendLimitUsd != null
  ) {
    return t("{used} of {limit}", {
      used: formatCost(detail.spendUsedUsd),
      limit: formatCost(detail.spendLimitUsd),
    });
  }
  return undefined;
}

function BankedResets({
  limits,
  now,
  action,
  activeResetKey,
  error,
  mascotProject,
  mascotName,
  mascotColor,
  onConfirm,
  onCancel,
  onUse,
  canUse,
}: {
  limits: ProviderRateLimits;
  now: number;
  action: ResetActionState;
  activeResetKey: string | null;
  error: string | null;
  mascotProject: string;
  mascotName: string | null;
  mascotColor: string;
  onConfirm: (rowKey: string) => void;
  onCancel: () => void;
  onUse: (credit: RateLimitResetCredit | undefined, rowKey: string) => void;
  canUse: boolean;
}) {
  const summary = limits.resetCredits;
  const count = summary?.availableCount ?? null;
  const detailedCredits = (summary?.credits ?? []).filter(
    (credit) => credit.status === "available" || credit.status === "unknown",
  );
  const unlistedCount = Math.max(0, (count ?? 0) - detailedCredits.length);
  const rows: Array<RateLimitResetCredit | null> = [
    ...detailedCredits,
    ...Array.from({ length: unlistedCount }, () => null),
  ];
  const hasBankedReset = count != null && count > 0;
  return (
    <section className="mt-2.5 border-t border-content/[0.08] pt-2.5">
      <div className="relative min-h-[78px] overflow-hidden rounded-lg bg-content/[0.04] px-3 py-3 pr-[84px] ring-1 ring-inset ring-content/[0.06]">
        <div className="relative z-10 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-medium">Banked resets</h3>
            {count != null ? (
              <span className="rounded-full bg-content/[0.07] px-1.5 py-px text-[10px] font-medium tabular-nums text-content/65 ring-1 ring-inset ring-content/[0.07]">
                {count}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] leading-4 text-content/40">
            {count == null
              ? "Not reported by this account"
              : count === 0
                ? "No resets available"
                : `${count} ${count === 1 ? "reset" : "resets"} available`}
          </p>
        </div>
        <BankedResetMascot
          project={mascotProject}
          name={mascotName}
          color={mascotColor}
          happy={hasBankedReset}
        />
      </div>

      {count != null && count > 0 ? (
        <div
          className="mt-2 max-h-56 overflow-y-auto overscroll-contain"
          aria-label="Available banked resets"
        >
          <div className="flex flex-col gap-1.5">
            {rows.map((credit, index) => {
              const rowKey = credit?.id ?? `unlisted-${index}`;
              const selected = activeResetKey === rowKey;
              return (
                <BankedResetRow
                  key={rowKey}
                  credit={credit}
                  index={index}
                  now={now}
                  action={selected ? action : "idle"}
                  error={selected ? error : null}
                  disabled={action === "using" && !selected}
                  canUse={canUse}
                  onConfirm={() => onConfirm(rowKey)}
                  onCancel={onCancel}
                  onUse={() => onUse(credit ?? undefined, rowKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BankedResetMascot({
  project,
  name,
  color,
  happy,
}: {
  project: string;
  name: string | null;
  color: string;
  happy: boolean;
}) {
  const mascot = projectMascot(project, name);
  const spritePath = `${mascot.restPath}${mascotFacePlatePath(mascot.rest)}`;
  const maskId = `banked-reset-mascot-${useId().replace(/:/g, "")}`;
  return (
    <div
      className="reset-mascot-scene"
      data-reset-mascot-mood={happy ? "happy" : "sad"}
      data-mascot-name={mascot.name}
      style={{ color }}
      aria-hidden
    >
      <span className="reset-mascot-glow" />
      {happy ? (
        <>
          <span className="reset-mascot-spark reset-mascot-spark-a" />
          <span className="reset-mascot-spark reset-mascot-spark-b" />
        </>
      ) : null}
      <svg
        className="reset-mascot-sprite"
        viewBox="0 0 8 8"
        shapeRendering="crispEdges"
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="8"
            height="8"
          >
            <rect width="8" height="8" fill="black" />
            <path d={spritePath} fill="white" />
            {happy ? (
              <g fill="black">
                <rect x="2" y="3" width="1" height="1" />
                <rect x="5" y="3" width="1" height="1" />
                <rect x="2" y="4" width="1" height="1" />
                <rect x="5" y="4" width="1" height="1" />
                <rect x="3" y="5" width="2" height="1" />
              </g>
            ) : (
              <g fill="black">
                <rect x="1" y="3" width="1" height="1" />
                <rect x="4" y="3" width="1" height="1" />
                <rect x="3" y="4" width="2" height="1" />
                <rect x="2" y="5" width="1" height="1" />
                <rect x="5" y="5" width="1" height="1" />
              </g>
            )}
          </mask>
        </defs>
        <path d={spritePath} fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
      {!happy ? <span className="reset-mascot-tear" /> : null}
    </div>
  );
}

/** Fill only the middle of each face row before cutting the mood back out. */
function mascotFacePlatePath(rows: readonly string[]): string {
  return mascotPath(
    rows.map((row, y) => {
      if (y < 2 || y > 5) return ".".repeat(row.length);
      const first = row.indexOf("#");
      const last = row.lastIndexOf("#");
      if (first < 0) return ".".repeat(row.length);
      return `${".".repeat(first)}${"#".repeat(last - first + 1)}${".".repeat(row.length - last - 1)}`;
    }),
  );
}

function BankedResetRow({
  credit,
  index,
  now,
  action,
  error,
  disabled,
  canUse,
  onConfirm,
  onCancel,
  onUse,
}: {
  credit: RateLimitResetCredit | null;
  index: number;
  now: number;
  action: ResetActionState;
  error: string | null;
  disabled: boolean;
  canUse: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onUse: () => void;
}) {
  return (
    <article className="rounded-lg bg-content/[0.04] px-2.5 py-2 ring-1 ring-inset ring-content/[0.06]">
      <h4 className="text-[10px] font-medium leading-4 text-content/70">
        {credit?.title ?? `Banked reset ${index + 1}`}
      </h4>
      {credit?.description ? (
        <p className="mt-0.5 text-[10px] leading-4 text-content/45">
          {credit.description}
        </p>
      ) : null}
      <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2">
        <p
          className="min-w-0 truncate text-[10px] tabular-nums text-content/40"
          title={
            credit?.expiresAt == null
              ? undefined
              : new Date(credit.expiresAt).toLocaleString()
          }
        >
          {credit?.expiresAt == null
            ? "Expiry not provided"
            : credit.expiresAt <= now
              ? "Expires now"
              : `Expires in ${formatResetDuration(credit.expiresAt - now)}`}
        </p>
        {action === "using" ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-content/45">
            <RefreshCw
              className="size-3 animate-spin"
              strokeWidth={1.75}
              aria-hidden
            />
            Applying…
          </span>
        ) : isResetOutcome(action) || action === "error" ? (
          <span
            className={`shrink-0 text-[10px] ${
              action === "reset"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-content/50"
            }`}
            role="status"
          >
            {action === "error" ? error : resetOutcomeLabel(action)}
          </span>
        ) : canUse && action !== "confirming" ? (
          <button
            type="button"
            className="h-6 shrink-0 rounded-md bg-content/[0.07] px-2.5 text-[10px] font-medium text-content/70 ring-1 ring-inset ring-content/[0.08] transition-[background-color,color,transform] duration-150 ease-out hover:bg-content/[0.11] hover:text-content active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35"
            disabled={disabled}
            onClick={onConfirm}
          >
            Use reset
          </button>
        ) : null}
      </div>
      {action === "confirming" ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-content/[0.07] pt-2">
          <p className="text-[10px] leading-4 text-content/50">
            Spend this reset now?
          </p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="h-6 rounded-md px-2 text-[10px] text-content/50 hover:bg-content/10 hover:text-content"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-6 rounded-md bg-content px-2.5 text-[10px] font-medium text-background-base transition-transform duration-150 ease-out active:scale-[0.97]"
              onClick={onUse}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function EmptyUsageState({
  limits,
  loading,
}: {
  limits: ProviderRateLimits;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg bg-content/[0.04] px-3 py-4 text-center ring-1 ring-inset ring-content/[0.06]">
      <p className="text-xs font-medium text-content/65">
        {loading
          ? "Loading usage…"
          : limits.status === "unavailable"
            ? "Not connected"
            : "Usage unavailable"}
      </p>
      {limits.error ? (
        <p className="mx-auto mt-1 max-w-[15rem] text-[10px] leading-4 text-content/40">
          {limits.error}
        </p>
      ) : null}
    </div>
  );
}

export function needsProviderLogin(limits: ProviderRateLimits): boolean {
  if (limits.status === "unavailable") return true;
  if (limits.status !== "error") return false;
  const text = limits.error?.toLowerCase() ?? "";
  return (
    text.includes("expired") ||
    text.includes("sign-in") ||
    text.includes("not signed in") ||
    text.includes("not connected") ||
    text.includes("authentication")
  );
}

function resetOutcomeLabel(outcome: CodexRateLimitResetOutcome): string {
  if (outcome === "reset") return "Codex usage was reset.";
  if (outcome === "nothingToReset") return "There’s no active usage to reset.";
  if (outcome === "noCredit") return "No banked resets are available.";
  return "That reset was already used.";
}

function isResetOutcome(
  value: ResetActionState,
): value is CodexRateLimitResetOutcome {
  return (
    value === "reset" ||
    value === "nothingToReset" ||
    value === "noCredit" ||
    value === "alreadyRedeemed"
  );
}

function emptyUsageLabel(limits: ProviderRateLimits): string {
  if (limits.status !== "error") return "—";
  const text = limits.error?.toLowerCase() ?? "";
  if (text.includes("expired") || text.includes("sign-in")) return "expired";
  return "—";
}

function MiniBar({ usedPct }: { usedPct: number }) {
  const pct = clampUsedPercent(usedPct);
  return (
    <span
      className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-content/10"
      aria-hidden
    >
      <span
        className={`block h-full rounded-full ${barClass(pct)}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

