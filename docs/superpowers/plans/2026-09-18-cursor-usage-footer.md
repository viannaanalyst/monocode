# Cursor usage footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Cursor included billing-cycle usage on the footer chip (and on-demand only when the dashboard returns a spend limit).

**Architecture:** Same host-fetch pattern as Claude/OpenCode Go: Tauri reads the local Cursor token (CLI `auth.json`, then IDE `state.vscdb`) and POSTs to the dashboard usage API. The webview parses JSON into `ProviderRateLimits` (`monthly` = included cycle, `weekly` = on-demand if present) and reuses `UsageProviderChip` plus reconnect via `agent login`.

**Tech Stack:** Rust (`ureq`, `rusqlite`), TypeScript `rateLimits.ts` / `rateLimitsFetch.ts`, React footer chips, Vitest, `t()` + `src/i18n/pt-BR.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-18-cursor-usage-footer-design.md`
- Token never leaves the Rust process; never log it.
- Do not map `autoPercentUsed` / `apiPercentUsed` / `totalPercentUsed` onto bars.
- `supportsProviderAccounts` stays false for Cursor even after adding `"cursor"` to `RateLimitProvider`.
- No named Cursor accounts, no extra telemetry DBs, no faster poll than existing rate-limit cadence.
- New strings through `t()` with pt-BR keys.

---

### Task 1: Parse dashboard JSON in TypeScript

**Files:**
- Modify: `src/lib/rateLimits.ts`
- Test: `src/lib/rateLimits.test.ts`

**Interfaces:**
- `RateLimitProvider` includes `"cursor"`.
- `CursorUsageDetail = { includedUsd: number; limitUsd: number; bonusUsd: number; spendUsedUsd: number | null; spendLimitUsd: number | null }`
- `ProviderRateLimits.cursorDetail?: CursorUsageDetail | null`
- `parseCursorDashboardUsage(body: unknown): ProviderRateLimits`

- [ ] Failing tests: included-only; included + spend limit; ignore auto/api percents; `limit: 0` + planInfo fallback; RFC3339 and epoch `billingCycleEnd`; bonus; malformed → error.
- [ ] Implement parser: included → `monthly`; spend limit → `weekly`; `session` always null.
- [ ] Keep `supportsProviderAccounts` excluding cursor (`src/lib/providerAccounts.ts`).

### Task 2: Tauri token + HTTP command

**Files:**
- Modify: `src-tauri/src/rate_limits.rs`, `src-tauri/src/lib.rs`
- Test: `rate_limits.rs` unit tests (temp `auth.json` + sqlite fixture)

**Interfaces:**
- `extract_cursor_access_token(raw: &str) -> Option<String>`
- `read_cursor_ide_access_token(db: &Path) -> Option<String>`
- `fetch_cursor_usage() -> CursorUsageFetch` (`status`, `httpStatus`, `body`, `error`)
- POST `https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` with Bearer + `Connect-Protocol-Version: 1`; on 404/405 retry `https://cursor.com/api/dashboard/get-current-period-usage`.
- Optional `GetPlanInfo` only when `planUsage.limit` is missing/0.
- 401 → error “Cursor sign-in expired”; no token → unavailable “Cursor not signed in”.

### Task 3: Fetch wrapper, footer chip, labels

**Files:**
- Modify: `src/lib/rateLimitsFetch.ts`, `src/chrome/UsageFooter.tsx`, `src/chrome/UsageProviderChip.tsx`, `src/chrome/UsageWindowCard.tsx`, `src/App.tsx`, `src/i18n/pt-BR.ts`
- Test: `UsageFooterAuth.test.ts` / `UsageProviderChip.test.ts`

**Interfaces:**
- `fetchCursorRateLimits(): Promise<ProviderRateLimits>`
- `usageProviders` includes `"cursor"` when focused harness is cursor.
- `UsageProviderChip` includes `monthly` in `usageWindows`; loading considers monthly.
- Cursor titles: monthly → “Plan cycle” / “Ciclo do plano”; weekly → “On-demand”; remaining line can show `$used / $limit` from `cursorDetail` when present.
- Reconnect: `loginHarness("cursor")`.

### Task 4: Verify

- [ ] `npx vitest run` on touched tests; `cargo test --lib rate_limits` (or crate tests); `npm run check:web` if that is the web gate.
