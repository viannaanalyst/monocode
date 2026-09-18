import { CoinsDollar, RefreshCw } from "./icons";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { HarnessIcon } from "./HarnessIcon";
import { Popover, type PopoverDismissReason } from "./Popover";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
  fetchOpencodeGoRateLimits,
} from "../lib/rateLimitsFetch";
import {
  clampUsedPercent,
  fetchingRateLimits,
  errorRateLimits,
  formatUsagePercent,
  formatWindowLabel,
  idleRateLimits,
  RATE_LIMIT_POLL_MS,
  shouldFetchProvider,
  type ProviderRateLimits,
  type RateLimitProvider,
  type RateLimitWindow,
} from "../lib/rateLimits";
import { HARNESS_LABEL, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { t } from "../i18n";
import { loginHarness, supportsHarnessLogin } from "../lib/harness/auth";
import {
  getProviderAccountsSnapshot,
  selectedProviderAccountId,
  subscribeProviderAccounts,
} from "../lib/providerAccounts";
import {
  ProviderAccountControls,
  providerChipAccountSuffix,
} from "./ProviderAccountControls";
import { consumeCodexRateLimitResetCredit } from "../lib/rateLimitsFetch";
import { UsageProviderChip } from "./UsageProviderChip";
import {
  usageUpdatedLabel,
  UsageWindowCard,
  type UsageWindowKind,
} from "./UsageWindowCard";
import {
  ProviderSignInPanel,
  type ProviderSignInState,
} from "./ProviderSignInPanel";
import { formatTokens } from "../lib/contextUsage";
import {
  findSessionCost,
  formatCost,
  supportsUsageCost,
  type SessionCost,
} from "../lib/usageCost";
import {
  fetchUsageCost,
  shouldFetchUsageCost,
  usageCostSnapshot,
  USAGE_COST_POLL_MS,
  type UsageCostState,
} from "../lib/usageCostFetch";
import {

  runningTerminalChipLabel,
  type RunningTerminal,
} from "../lib/terminalTab";

const CLOCK_MS = 30_000;

export type UsageFooterSession = {
  harness: HarnessId;
  providerSessionId?: string;
  authRequired?: boolean;
};

export function UsageFooter({
  providers,
  session,
  project,
  terminals = [],
  terminalOpen = false,
  onToggleTerminal,
  onAccountSelected,
}: {
  providers: RateLimitProvider[];
  session?: UsageFooterSession;
  project?: string;
  terminals?: RunningTerminal[];
  terminalOpen?: boolean;
  onToggleTerminal?: (fileId: string) => void;
  onAccountSelected?: (
    provider: RateLimitProvider,
    accountId: string,
  ) => void;
}) {
  const wantClaude = providers.includes("claude");
  const wantCodex = providers.includes("codex");
  const wantOpencode = providers.includes("opencode");
  const wantCost =
    session != null &&
    supportsUsageCost(session.harness) &&
    Boolean(session.providerSessionId);
  const [claude, setClaude] = useState<ProviderRateLimits>(() =>
    idleRateLimits("claude"),
  );
  const [codex, setCodex] = useState<ProviderRateLimits>(() =>
    idleRateLimits("codex"),
  );
  const [opencode, setOpencode] = useState<ProviderRateLimits>(() =>
    idleRateLimits("opencode"),
  );
  const [cost, setCost] = useState<UsageCostState>(() => usageCostSnapshot());
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);
  const claudeRef = useRef(claude);
  const codexRef = useRef(codex);
  const opencodeRef = useRef(opencode);
  const costRef = useRef(cost);
  claudeRef.current = claude;
  codexRef.current = codex;
  opencodeRef.current = opencode;
  costRef.current = cost;
  useSyncExternalStore(
    subscribeProviderAccounts,
    getProviderAccountsSnapshot,
    getProviderAccountsSnapshot,
  );
  const claudeAccountId = selectedProviderAccountId("claude", project);
  const codexAccountId = selectedProviderAccountId("codex", project);
  const opencodeAccountId = selectedProviderAccountId("opencode", project);

  const refresh = useCallback((force = false) => {
    if (inflight.current) return inflight.current;
    const visible = document.visibilityState === "visible";
    const fetchClaude =
      wantClaude &&
      shouldFetchProvider(claudeRef.current, { force, visible });
    const fetchCodex =
      wantCodex &&
      shouldFetchProvider(codexRef.current, { force, visible });
    const fetchOpencode =
      wantOpencode &&
      shouldFetchProvider(opencodeRef.current, { force, visible });
    const fetchCost =
      wantCost && shouldFetchUsageCost(costRef.current, { force, visible });
    if (!fetchClaude && !fetchCodex && !fetchOpencode && !fetchCost) return;
    if (force) setRefreshing(true);
    const jobs: Promise<unknown>[] = [];
    if (fetchClaude) {
      setClaude((current) => fetchingRateLimits("claude", current));
      jobs.push(
        fetchClaudeRateLimits(claudeAccountId).then((value) => {
          setClaude(value);
        }),
      );
    }
    if (fetchCodex) {
      setCodex((current) => fetchingRateLimits("codex", current));
      jobs.push(
        fetchCodexRateLimits(codexAccountId).then((value) => {
          setCodex(value);
        }),
      );
    }
    if (fetchOpencode) {
      setOpencode((current) => fetchingRateLimits("opencode", current));
      jobs.push(
        fetchOpencodeGoRateLimits(opencodeAccountId).then((value) => {
          setOpencode(value);
        }),
      );
    }
    if (fetchCost) {
      jobs.push(fetchUsageCost(force).then((value) => setCost(value)));
    }
    const run = Promise.allSettled(jobs)
      .then(() => undefined)
      .finally(() => {
        inflight.current = null;
        setRefreshing(false);
      });
    inflight.current = run;
    return run;
  }, [
    wantClaude,
    wantCodex,
    wantOpencode,
    wantCost,
    claudeAccountId,
    codexAccountId,
    opencodeAccountId,
  ]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), RATE_LIMIT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Session cost moves every turn, so it polls on a tighter clock than the
  // rate-limit windows. `refresh` dedupes and `shouldFetchUsageCost` throttles.
  useEffect(() => {
    if (!wantCost) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), USAGE_COST_POLL_MS);
    return () => window.clearInterval(poll);
  }, [refresh, wantCost]);

  // Switching sessions lands on a key the last report has no row for until the
  // next poll. Fetch straight away; `fetchUsageCost` collapses concurrent calls.
  const costSessionId = session?.providerSessionId;
  useEffect(() => {
    if (!wantCost || !costSessionId) return;
    void fetchUsageCost(false).then(setCost);
  }, [costSessionId, wantCost]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  /** Redeem a banked Codex reset and refresh the windows afterwards. */
  const consumeCodexReset = useCallback(async (creditId?: string) => {
    while (inflight.current) await inflight.current;
    setRefreshing(true);
    setCodex((current) => fetchingRateLimits("codex", current));
    let outcome: Awaited<ReturnType<typeof consumeCodexRateLimitResetCredit>>;
    const operation = (async () => {
      try {
        outcome = await consumeCodexRateLimitResetCredit(
          creditId,
          codexAccountId,
        );
        setCodex(await fetchCodexRateLimits(codexAccountId));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not use Codex reset";
        setCodex((current) => errorRateLimits("codex", message, current));
        throw error;
      }
    })();
    const tracked = operation.finally(() => {
      inflight.current = null;
      setRefreshing(false);
    });
    inflight.current = tracked.catch(() => undefined);
    await tracked;
    return outcome!;
  }, [codexAccountId]);

  const reconnectProvider = useCallback(
    async (
      provider: RateLimitProvider,
      fetchLimits: (accountId?: string) => Promise<ProviderRateLimits>,
      setLimits: Dispatch<SetStateAction<ProviderRateLimits>>,
      accountId: string,
    ) => {
      while (inflight.current) await inflight.current;
      setRefreshing(true);
      setLimits((current) => fetchingRateLimits(provider, current));
      const operation = (async () => {
        try {
          await loginHarness(provider, accountId);
          const value = await fetchLimits(accountId);
          setLimits(value);
          if (value.status !== "ok") {
            throw new Error(
              value.error ||
                `${HARNESS_TITLE[provider]} sign-in could not be verified`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not complete sign-in";
          setLimits((current) => errorRateLimits(provider, message, current));
          throw error;
        }
      })();
      const tracked = operation.finally(() => {
        inflight.current = null;
        setRefreshing(false);
      });
      inflight.current = tracked.catch(() => undefined);
      await tracked;
    },
    [],
  );

  const reconnectClaude = useCallback(
    () =>
      reconnectProvider(
        "claude",
        fetchClaudeRateLimits,
        setClaude,
        claudeAccountId,
      ),
    [reconnectProvider, claudeAccountId],
  );

  const reconnectCodex = useCallback(
    () =>
      reconnectProvider(
        "codex",
        fetchCodexRateLimits,
        setCodex,
        codexAccountId,
      ),
    [reconnectProvider, codexAccountId],
  );

  const sessionCost =
    wantCost && session
      ? findSessionCost(cost.report, session.harness, session.providerSessionId)
      : null;
  const showUsage = wantClaude || wantCodex || wantOpencode;
  const showTerminals = terminals.length > 0;
  const showRefresh = showUsage || wantCost;
  const showRight = showUsage || showTerminals || showRefresh;
  const ariaLabel = showUsage
    ? "Provider usage"
    : showTerminals
      ? "Terminals"
      : session
        ? "Session"
        : undefined;

  return (
    <footer
      aria-label={ariaLabel}
      className="mb-1.5 flex h-[29px] shrink-0 items-center gap-3 overflow-x-auto border-t border-content/10 px-3 text-xs text-content/55"
    >
      {showUsage ? (
        <>
          {wantClaude ? (
            <UsageProviderChip
              limits={claude}
              now={now}
              project={project}
              onReconnect={reconnectClaude}
              onAccountSelected={(accountId) =>
                onAccountSelected?.("claude", accountId)
              }
            />
          ) : null}
          {wantCodex ? (
            <UsageProviderChip
              limits={codex}
              now={now}
              project={project}
              onConsumeReset={consumeCodexReset}
              onReconnect={reconnectCodex}
              onAccountSelected={(accountId) =>
                onAccountSelected?.("codex", accountId)
              }
            />
          ) : null}
          {wantOpencode ? (
            <ProviderChip
              limits={opencode}
              now={now}
              project={project}
              onAccountSelected={(accountId) =>
                onAccountSelected?.("opencode", accountId)
              }
            />
          ) : null}
        </>
      ) : session ? (
        <SessionChip session={session} />
      ) : null}
      {sessionCost ? <CostChip cost={sessionCost} /> : null}
      {showRight ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {showTerminals ? (
            <RunningTerminalChip
              terminals={terminals}
              open={terminalOpen}
              onToggle={onToggleTerminal}
            />
          ) : null}
          {showRefresh ? (
            <button
              type="button"
              className="grid size-5 shrink-0 place-items-center rounded text-content/40 hover:bg-content/10 hover:text-content disabled:opacity-50"
              aria-label={t("Refresh usage")}
              title={t("Refresh usage")}
              disabled={refreshing}
              onClick={() => void refresh(true)}
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.75}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </footer>
  );
}

function CostChip({ cost }: { cost: SessionCost }) {
  const root = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const models = cost.models.filter(
    (model) => model.tokens > 0 || model.cost > 0,
  );
  const showModelCost = models.some((model) => model.cost > 0);

  return (
    <>
      <button
        ref={root}
        type="button"
        data-no-tooltip
        className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded px-1 -mx-1 tabular-nums hover:bg-content/10 hover:text-content"
        aria-label={t("Session cost")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CoinsDollar
          className="size-3.5 shrink-0"
          strokeWidth={1.75}
          aria-hidden
        />
        <span>{formatCost(cost.totalCost)}</span>
        <span className="text-content/25">·</span>
        <span>{formatTokens(cost.totalTokens)}</span>
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          align="start"
          autoFocus
          onDismiss={() => setOpen(false)}
          aria-label={t("Session cost")}
          className="min-w-[15rem] p-2"
        >
          <div className="px-1 pb-1.5 text-2xs uppercase tracking-wide text-content/40">
            {t("Estimated session cost")}
          </div>
          {models.length > 0 ? (
            <div className="space-y-1">
              {models.map((model) => (
                <div
                  key={model.model}
                  className="flex items-center gap-3 px-1 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate" title={model.model}>
                    {model.model}
                  </span>
                  <span className="shrink-0 tabular-nums text-content/60">
                    {formatTokens(model.tokens)}
                  </span>
                  {showModelCost ? (
                    <span className="shrink-0 tabular-nums">
                      {formatCost(model.cost)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-3 border-t border-content/10 px-1 pt-1.5 text-xs">
            <span className="flex-1">{t("Total")}</span>
            <span className="tabular-nums text-content/60">
              {formatTokens(cost.totalTokens)}
            </span>
            <span className="tabular-nums font-medium">
              {formatCost(cost.totalCost)}
            </span>
          </div>
        </Popover>
      ) : null}
    </>
  );
}

function TerminalLiveMark() {
  return (
    <span className="terminal-live shrink-0" aria-hidden>
      <span className="terminal-live-bar" />
      <span className="terminal-live-bar" />
      <span className="terminal-live-bar" />
    </span>
  );
}

function SessionChip({ session }: { session: UsageFooterSession }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loginState, setLoginState] = useState<ProviderSignInState>("idle");
  const [loginError, setLoginError] = useState<string | null>(null);
  const authRequired = Boolean(
    session.authRequired && loginState !== "complete",
  );
  const canLogin = authRequired && supportsHarnessLogin(session.harness);

  useEffect(() => {
    if (!session.authRequired && loginState === "complete") {
      setLoginState("idle");
    }
  }, [loginState, session.authRequired]);

  const dismiss = (reason: PopoverDismissReason) => {
    setOpen(false);
    if (reason === "escape") {
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };

  const signIn = async () => {
    setLoginState("running");
    setLoginError(null);
    try {
      await loginHarness(session.harness);
      setOpen(false);
      setLoginState("complete");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Could not complete sign-in",
      );
      setLoginState("error");
    }
  };

  if (!canLogin) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap"
        title={HARNESS_TITLE[session.harness]}
      >
        <HarnessIcon harness={session.harness} className="size-3.5 shrink-0" />
        <span>{HARNESS_LABEL[session.harness]}</span>
      </span>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="-mx-1 inline-flex h-5 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-1 text-content/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-content/10 hover:text-content focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]"
        aria-label={`${HARNESS_TITLE[session.harness]} sign-in required`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${HARNESS_TITLE[session.harness]} sign-in required`}
        onClick={() => setOpen((value) => !value)}
      >
        <HarnessIcon harness={session.harness} className="size-3.5 shrink-0" />
        <span>{HARNESS_LABEL[session.harness]}</span>
        {authRequired ? (
          <span className="text-[10px] text-amber-600 dark:text-amber-300">
            sign in
          </span>
        ) : null}
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="top"
          align="start"
          gap={7}
          width={300}
          autoFocus
          onDismiss={dismiss}
          role="dialog"
          aria-label={`${HARNESS_TITLE[session.harness]} sign-in`}
          tabIndex={-1}
          className="text-content"
        >
          <ProviderSignInPanel
            harness={session.harness}
            state={loginState}
            error={loginError}
            onSignIn={() => void signIn()}
          />
        </Popover>
      ) : null}
    </>
  );
}

function RunningTerminalChip({
  terminals,
  open: panelOpen,
  onToggle,
}: {
  terminals: RunningTerminal[];
  open: boolean;
  onToggle?: (fileId: string) => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const label = runningTerminalChipLabel(terminals);
  const many = terminals.length > 1;
  const title = terminals
    .map((terminal) => `"${terminal.process}" in ${terminal.label}`)
    .join("\n");
  const ariaLabel =
    terminals.length === 1
      ? panelOpen
        ? `Hide ${terminals[0]?.process}`
        : `Show ${terminals[0]?.process}`
      : panelOpen
        ? "Hide running terminals"
        : `${terminals.length} terminals are running processes`;

  const toggle = (fileId: string) => {
    setMenuOpen(false);
    onToggle?.(fileId);
  };

  return (
    <>
      <button
        ref={root}
        type="button"
        className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 whitespace-nowrap rounded px-1 -mx-1 hover:bg-content/10 hover:text-content"
        aria-label={ariaLabel}
        aria-pressed={panelOpen}
        aria-expanded={many && !panelOpen ? menuOpen : undefined}
        aria-haspopup={many && !panelOpen ? "menu" : undefined}
        title={title}
        onClick={() => {
          if (panelOpen || !many) {
            const target = terminals[0];
            if (target) toggle(target.id);
            return;
          }
          setMenuOpen((value) => !value);
        }}
      >
        <TerminalLiveMark />
        <span className="truncate font-mono text-2xs tabular-nums">
          {label}
        </span>
      </button>
      {menuOpen && many && !panelOpen ? (
        <Popover
          anchor={root}
          side="top"
          align="end"
          autoFocus
          onDismiss={() => setMenuOpen(false)}
          role="menu"
          aria-label={t("Running terminals")}
          className="min-w-[12rem] p-1"
        >
          {terminals.map((terminal) => (
            <button
              key={terminal.id}
              type="button"
              role="menuitem"
              className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] leading-none text-content hover:bg-content/10"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggle(terminal.id)}
            >
              <span className="min-w-0 flex-1 truncate">{terminal.process}</span>
              <span className="max-w-[7rem] shrink-0 truncate text-xs text-content/40">
                {terminal.label}
              </span>
            </button>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

function ProviderChip({
  limits,
  now,
  project,
  onAccountSelected,
}: {
  limits: ProviderRateLimits;
  now: number;
  project?: string;
  onAccountSelected?: (accountId: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const loading =
    limits.status === "idle" ||
    (limits.status === "fetching" &&
      !limits.session &&
      !limits.weekly &&
      !limits.monthly);
  const disconnected = limits.status === "unavailable";
  const windows = [
    limits.session ? { key: "session", window: limits.session } : null,
    limits.weekly ? { key: "weekly", window: limits.weekly } : null,
    limits.monthly ? { key: "monthly", window: limits.monthly } : null,
  ].filter(
    (entry): entry is { key: UsageWindowKind; window: RateLimitWindow } =>
      entry != null,
  );
  const hasWindows = windows.length > 0;
  useSyncExternalStore(
    subscribeProviderAccounts,
    getProviderAccountsSnapshot,
    getProviderAccountsSnapshot,
  );
  const accountSuffix = providerChipAccountSuffix(limits.provider, project);
  const usageDetailsLabel = accountSuffix
    ? `${HARNESS_TITLE[limits.provider]} · ${accountSuffix}`
    : t("{provider} usage details", {
        provider: HARNESS_TITLE[limits.provider],
      });
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-no-tooltip
        aria-label={usageDetailsLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded px-1 -mx-1 text-content/55 hover:bg-content/10 hover:text-content"
      >
      <HarnessIcon harness={limits.provider} className="size-3.5 shrink-0" />
      {accountSuffix ? (
        <span className="max-w-[7rem] truncate text-content/45">
          {accountSuffix}
        </span>
      ) : null}
      {loading ? (
        <span className="animate-pulse text-content/35">···</span>
      ) : disconnected ? (
        <span className="text-content/35">{t("not connected")}</span>
      ) : windows.length === 0 ? (
        <span className="text-content/35">{emptyUsageLabel(limits)}</span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
          {windows.map((entry, index) => (
            <span key={entry.key} className="inline-flex items-center gap-1.5">
              {index > 0 ? <span className="text-content/20">·</span> : null}
              <span className="text-content/40">
                {t(formatWindowLabel(entry.window.windowMinutes))}
              </span>
              <MiniBar usedPct={entry.window.usedPercent} />
              <span className={usagePctClass(entry.window.usedPercent)}>
                {formatUsagePercent(entry.window.usedPercent)}
              </span>
            </span>
          ))}
        </span>
        )}
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="top"
          align="start"
          width={300}
          maxHeight={460}
          autoFocus
          onDismiss={() => setOpen(false)}
          role="dialog"
          aria-label={usageDetailsLabel}
          className="overflow-y-auto p-2.5"
        >
          <ProviderAccountControls
            provider={limits.provider}
            project={project}
            onSelected={onAccountSelected}
          />
          {hasWindows ? (
            <>
          <div className="flex items-start gap-2.5 px-1 pb-2.5 pt-0.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-content/[0.06] ring-1 ring-inset ring-content/[0.07]">
              <HarnessIcon harness={limits.provider} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium leading-4">
                {t("{provider} usage", {
                  provider: HARNESS_TITLE[limits.provider],
                })}
              </h2>
              <p className="mt-0.5 text-[10px] leading-4 text-content/40">
                {usageUpdatedLabel(limits, now)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {windows.map((entry) => (
              <UsageWindowCard
                key={entry.key}
                kind={entry.key}
                window={entry.window}
                now={now}
              />
            ))}
          </div>
            </>
          ) : null}
        </Popover>
      ) : null}
    </>
  );
}

function usagePctClass(usedPct: number): string {
  const pct = clampUsedPercent(usedPct);
  if (pct >= 90) return "text-red-400";
  if (pct >= 80) return "text-amber-300";
  return "text-content/80";
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

function barClass(pct: number): string {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-content/45";
}
