# Multiple provider accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch named Claude, Codex, and OpenCode accounts from the usage footer; the next action in a project uses the selected account without aborting an in-flight turn.

**Architecture:** Reuse `#280` (`providerAccounts`, `providerAccountId`, isolated dirs). Wire the footer UI our merge dropped, pass `accountId` into usage fetch, extend Rust isolation to OpenCode (`OPENCODE_DATA_DIR`), and resolve the project selection at send time instead of pinning the starter account forever.

**Tech Stack:** React, Vitest/happy-dom, Tauri 2 / Rust, `t()` + `src/i18n/pt-BR.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-provider-accounts-design.md`
- Extra accounts only for `claude` | `codex` | `opencode`. Default `id` is `default` and uses the normal CLI home.
- Chip shows `Provider · Label` only when an extra account exists; otherwise keep today's usage-only chip.
- In-flight turns keep their process. Next action uses `selectedProviderAccountId(provider, cwd)`.
- New strings go through `t()` with pt-BR keys. Tests stay on English fallbacks.
- No account delete UI, no Settings duplicate list.

---

### Task 1: Isolate OpenCode profiles in Rust

**Files:**
- Modify: `src-tauri/src/harness.rs` (`provider_account_dir`, `apply_provider_account`)
- Modify: `src-tauri/src/rate_limits.rs` (`fetch_opencode_go_usage` + key lookup)
- Test: `src-tauri/src/harness.rs` and `src-tauri/src/rate_limits.rs` unit tests

**Interfaces:**
- `provider_account_dir` allows `opencode`.
- Extra OpenCode spawn sets `OPENCODE_DATA_DIR` and removes `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_AUTH_CONTENT`.
- `fetch_opencode_go_usage(app, account_id)` reads `auth.json` from that dir when `account_id` is not `default`.

- [ ] Add `provider_supports_accounts` tests (claude/codex/opencode yes; cursor no).
- [ ] Add `read_opencode_go_api_key` profile-dir test that ignores global `OPENCODE_AUTH_CONTENT`.
- [ ] Implement allow-list + env + fetch `account_id`.
- [ ] `cargo test` on the two modules.

### Task 2: Spawn, login, and session account helpers

**Files:**
- Modify: `src/lib/harness/child.ts`, `auth.ts`, `authSupport.ts`, `opencode.ts`, `session.ts`, `providerAccounts.ts`
- Test: existing auth/providerAccounts tests plus OpenCode login isolation

**Interfaces:**
- `spawnChild(..., account?: { provider: "claude" | "codex" | "opencode"; id: string })`
- `harnessLoginArgs("opencode") === ["auth", "login"]`
- `selectedAccountForHarness(harness, cwd): string | undefined` (omit `default`)
- `newSession` stamps `providerAccountId` from the project selection
- OpenCode `ensureLive` restarts when `providerAccountId` changes (no resume across accounts)

- [ ] Failing tests first, then implement.

### Task 3: Footer account list and usage fetch

**Files:**
- Create: `src/chrome/ProviderAccountControls.tsx` (list, add name+login, rename)
- Modify: `UsageFooter.tsx`, `UsageProviderChip.tsx`, `rateLimitsFetch.ts`
- Test: `UsageFooterOpencodeChip.test.ts`, `UsageProviderChip.test.ts`, new account-control test

**Interfaces:**
- Footer chips subscribe to `subscribeProviderAccounts`.
- Fetches pass `selectedProviderAccountId`.
- Add persists only after `loginHarness` succeeds, then `selectProviderAccount`.
- `onSelectAccount` updates project selection; App updates the focused session.

### Task 4: App send path and i18n

**Files:**
- Modify: `src/App.tsx` (UsageFooter `project` + `onSelectAccount`; send uses project selection)
- Modify: `src/i18n/pt-BR.ts`
- Test: existing App/footer tests still green

- [ ] `sendHarnessTurn` uses `selectedAccountForHarness` and writes it onto the session before spawn.
- [ ] Focused session `providerAccountId` updates on footer switch without `forgetHarnessSession`.
- [ ] Strings: Default account → Padrão, Add account, Account name, Continue, Rename, New {provider} account.

### Task 5: Verify

- [ ] `npx vitest run` on touched tests
- [ ] `npx tsc --noEmit` or `npm run check:web`
- [ ] `cargo test` / `cargo check`
