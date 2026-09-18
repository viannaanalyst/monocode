# Cursor usage in the footer — design

## Goal

Show Cursor plan usage on the same footer chip used for Claude, Codex, and OpenCode Go when the focused chat is a Cursor session: included spend for the billing cycle, plus an on-demand bar only when the dashboard API actually returns a spend limit.

## Evidence

- User (2026-09-18): Cursor should get the same usage treatment as Codex / OpenCode Go / Claude. Chose option **A** (billing-cycle included usage) with opportunistic **C** (on-demand only if present). Rejected mapping Cursor onto fake 5-hour / weekly windows.
- Cursor CLI (`agent about`, `agent status`) reports plan tier and auth, not quota.
- Community/dashboard path: local session token + `GetCurrentPeriodUsage`. Cursor staff: `displayMessage` uses `includedSpend / limit`; `totalPercentUsed` / `autoPercentUsed` / `apiPercentUsed` are a **different** internal metric and must not drive the chip.
- Existing MonoCode pattern: Tauri host fetch so the webview CORS policy never sees the token (`fetch_claude_usage`, `fetch_opencode_go_usage`). Codex is the exception (JSON-RPC on the CLI). Cursor has no equivalent RPC.

## Scope

In scope (v1):

- Footer chip when `active.harness === "cursor"` (same visibility rule as Claude/Codex/OpenCode today).
- Host-side token discovery: Cursor Agent CLI `auth.json` first, then the Cursor IDE `state.vscdb` `cursorAuth/accessToken`.
- Host-side HTTP to Cursor’s dashboard usage endpoint; body returned to the webview for parsing (token never leaves the Rust process).
- Primary window: included plan usage (`includedSpend` / `limit`, both cents) with `billingCycleEnd` as `resetsAt`.
- Secondary window: on-demand / spend-limit **only** when `spendLimitUsage` has a usable limit; omit otherwise.
- Optional popover line for `bonusSpend` when `> 0`.
- Sign-in empty state with `agent login` when no token or 401, matching existing provider reconnect.
- Tests with JSON fixtures; no live Cursor network in CI.

Out of scope (v1):

- Named Cursor accounts / `providerAccounts` (still Claude, Codex, OpenCode only).
- Driving bars from `autoPercentUsed`, `apiPercentUsed`, or `totalPercentUsed`.
- Extra dashboard calls required only for richness (`GetAggregatedUsageEvents`, team members, local `ai-tracking.db`).
- Official Admin / Analytics / Cloud Agents APIs (API keys, team-scoped).
- Per-model token tables in the popover.
- Changing poll cadence (keep `RATE_LIMIT_POLL_MS` / `RATE_LIMIT_MIN_REFETCH_MS`).

`GetPlanInfo` and `GetHardLimit` are **optional helpers**, not required for a successful chip: use `GetPlanInfo.includedAmountCents` only if `planUsage.limit` is missing or `0`; do not fail the fetch if those extras error.

## Design

### Data model

Keep `ProviderRateLimits` with `session` / `weekly` / `monthly`. Map Cursor as:

| Field | Meaning |
| --- | --- |
| `provider` | `"cursor"` (extend `RateLimitProvider`) |
| `monthly` | included cycle: `usedPercent = 100 * includedSpend / limit` (clamp 0–100; if `limit <= 0` after fallback, treat as unavailable data, not 0%) |
| `weekly` | on-demand spend limit when present; otherwise `null`. Reuse the slot so `UsageWindowCard` / OpenCode-style popover already render two bars. Do **not** label it “Weekly”. |
| `session` | always `null` |
| `resetCredits` | `null` |

Chip percent on the bar: the tighter of the windows that exist (same `tightest` logic as today). If only included exists, that percent.

Popover labels (via `t()`, pt-BR):

- `monthly` for Cursor → “Ciclo do plano” (not “Monthly limit”).
- `weekly` for Cursor when it is spend-limit → “On-demand”.
- Remaining copy: `{percent} used`, `$X / $Y` under the bar (`includedSpend/100` and `limit/100`, USD, two decimals). Other providers keep current remaining-% copy.

`windowMinutes` for the included window: duration of `billingCycleEnd - billingCycleStart` in minutes when both timestamps parse; otherwise `MONTHLY_WINDOW_MINUTES` as a display fallback. On-demand uses the same cycle timestamps.

`resetsAt`: parse `billingCycleEnd` as RFC3339 **or** millisecond epoch (community clients disagree on the type).

### Token (host only)

`fetch_cursor_usage` (Tauri, same envelope as Claude/Go: `status`, `httpStatus`, `body`, `error`):

1. Read CLI token: try, in order, `~/.cursor/auth.json`, `$XDG_CONFIG_HOME/cursor/auth.json`, `~/.config/cursor/auth.json`. JSON `accessToken` (trim; skip empty).
2. Else IDE DB: platform `state.vscdb` (`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` on macOS; `~/.config/Cursor/User/globalStorage/state.vscdb` on Linux; `%APPDATA%\Cursor\User\globalStorage\state.vscdb` on Windows). Query `ItemTable.key = 'cursorAuth/accessToken'`. Open read-only; if WAL lock, `file:...?immutable=1` URI like existing `cursor_store.rs`. Value may be a raw JWT or a JSON-quoted string.
3. No token → `unavailable`, `"Cursor not signed in"`.

Do not persist the token. Do not log it. Do not send it to the webview.

v1 does not take `accountId`; always the machine’s default Cursor login.

### HTTP

Prefer the documented-in-the-wild Connect RPC:

- `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`
- Body `{}`
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Connect-Protocol-Version: 1`, a stable MonoCode `User-Agent`

If that returns 404/405, fall back once to `POST https://cursor.com/api/dashboard/get-current-period-usage` with the same Bearer (some clients use a `WorkosCursorSessionToken` cookie instead; try Bearer first). Map 401/403 like Claude (`error` / reconnect). 2xx body is passed through even if later parse fails (TS reports `error`, retry on poll).

Timeout: same order as existing `HTTP_TIMEOUT` in `rate_limits.rs`.

Optional: if `planUsage.limit` is 0/absent, one extra `GetPlanInfo` (same auth) for `includedAmountCents` / `planName`. If that call fails, keep the original body and let the parser decide.

### Parser (`src/lib/rateLimits.ts`)

`parseCursorDashboardUsage(body: unknown): ProviderRateLimits`

- Read `planUsage.includedSpend`, `limit`, `remaining`, `totalSpend`, `bonusSpend` as numbers (cents).
- Included percent: `includedSpend / limit` when `limit > 0`; else `includedAmountCents` from nested `planInfo` if present.
- On-demand: if `spendLimitUsage.individualLimit` (or `pooledLimit`) `> 0`, `usedPercent` from used/limit (prefer `individualUsed` / `individualLimit`; else pooled fields). Remaining cents are a check, not a second source of truth.
- Ignore auto/api/total percent fields.
- `bonusSpend` may be attached as optional metadata on the result if the type is extended with a Cursor-only `bonusUsd` / `includedUsd` / `limitUsd` for the popover dollar line. Prefer a small optional bag on `ProviderRateLimits` (e.g. `cursorDetail`) over overloading `resetCredits`.

Malformed 200 with no usable included window → `error`, not `unavailable` (same as OpenCode Go).

### Footer wiring

- `RateLimitProvider` includes `"cursor"`.
- `App.tsx` `usageProviders`: also when `active.harness === "cursor"`.
- `UsageFooter`: `wantCursor`, state, poll, refresh, reconnect via `loginHarness("cursor")`.
- Reuse `UsageProviderChip` (not the OpenCode-only chip) so reconnect works. Pass Cursor-specific window titles through existing `kind` + provider check, or a `labelOverride` — do not invent a fourth window kind if weekly+monthly suffice.
- `isNamedAccountHarness` stays false for Cursor.

### i18n

New `t()` keys in `src/i18n/pt-BR.ts`: Ciclo do plano, On-demand, Cursor not signed in / reconnect copy consistent with other providers, dollar fraction if not already covered.

## Testing and verification

- Rust: token extraction from sample `auth.json`; IDE sqlite fixture with JSON-quoted and raw JWT; missing file → unavailable; HTTP mapping 401 vs 200 (mock or captured body, no live network).
- TS: `parseCursorDashboardUsage` fixtures — included only; included + spend limit; `limit: 0` with planInfo fallback; bonus line; percent fields present but unused; epoch vs RFC3339 `billingCycleEnd`.
- Footer/chip: Cursor harness shows chip; two bars only when spend limit parsed; reconnect calls `loginHarness("cursor")`.
- `npm test`; `cargo test` on `rate_limits`; `npm run check:web` if that is the web gate. Manual: focused Cursor chat shows included %; popover dollars match cursor.com dashboard within cache lag; signed-out CLI shows connect.

## Risks

- **Unofficial API**: path or JSON can change. Fail closed (`error` / `unavailable`), never invent percentages from auto/api fields.
- **Stale dashboard cache**: Cursor has shipped frozen % while billing still counted. Copy can mention “Updated …” freshness; do not poll faster than existing rate-limit cadence to “fix” it.
- **CLI vs IDE token**: MonoCode talks to `agent`; CLI token is preferred so usage matches the harness, not a different IDE profile on the same Mac.
- **Cookie vs Bearer**: if Bearer fails with 401 and a cookie-shaped token exists, one cookie retry is allowed; do not open a browser or scrape `cursor.com` cookies from Chrome.
