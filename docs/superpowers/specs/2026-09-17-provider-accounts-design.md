# Multiple provider accounts — design

## Goal

Let the user keep more than one Claude, Codex, or OpenCode login on the same Mac, name them, switch from the usage footer, and have the **next action** in the focused chat run on the newly selected account — without interrupting a turn that is already streaming.

## Evidence

- User (2026-09-17): two Codex logins should be switchable; OpenCode should get the same treatment.
- Switch semantics: if Codex 1 is answering, keep that turn; from the next user action, Codex 2 continues the **same MonoCode chat**.
- Scope of the switch: the focused chat **and** the per-project default for that provider (new chats in this project start on the new account). Not global across projects.
- Labels: the user types a name when adding (Trabalho, Pessoal). No email subtitle in v1.
- Footer layout: the chip shows the account name on the bar (`Codex · Trabalho 72%`), not only inside the popover.
- Upstream 0.1.50 (#280) already shipped isolation dirs, `providerAccountId` on sessions, `src/lib/providerAccounts.ts`, and per-account login/usage fetch for Claude and Codex. Our merge kept that plumbing but dropped the footer UI (chips still fetch `default` only) and Rust still rejects OpenCode in `provider_account_dir`.
- Deviation from #280: conversations are **not** pinned forever to the account that started them. `providerAccountId` updates on switch so the next action uses the new account.

## Scope

In scope (v1):

- Named extra accounts for `claude`, `codex`, and `opencode`.
- Isolated data directories for extra accounts; **Padrão** (`id: default`) keeps the normal CLI home.
- Usage footer chips: selected account label on the bar, list + add + rename in the popover, usage/reconnect/Codex resets for that account.
- Per-project selection (`monocode.providerAccountSelections.v1`) updated on switch and on successful add.
- Focused session `providerAccountId` updated on switch; in-flight turn keeps the old process; next message starts a new provider process with the MonoCode transcript (no resume of the previous account's cloud thread).
- Wire `accountId` through usage fetch, login, spawn, and handoff/workers from the session at action time.

Out of scope (v1):

- Removing an account or deleting its isolated directory from the UI.
- Duplicate account UI on Settings → Providers.
- Auto-detected email as the label.
- Rewriting every open session record at the moment of switch (only the focused session is updated immediately; others pick up the project selection on their next action).
- Switching accounts globally across all projects.
- Other harnesses (Cursor, Gemini, Grok, Hermes, …).
- Cloud sync of credentials or of the account registry (`docs/superpowers/specs/2026-09-15-account-cloud-sync-design.md` still excludes provider CLI credentials).

## Design

### Account model (`src/lib/providerAccounts.ts`)

Keep the existing store. Each provider lists:

1. **Padrão** — always present, `id: default`, `isDefault: true`, not stored in the extra-accounts array. Uses the user's normal Claude/Codex/OpenCode home.
2. Named profiles — `id: account-<uuid>` (`newProviderAccount`), label trimmed to 48 characters, `[A-Za-z0-9_-]+` ids.

Keys:

- `monocode.providerAccounts.v1` — extra accounts per provider.
- `monocode.providerAccountSelections.v1` — `pathKey(project) → { claude?, codex?, opencode? }`.

`selectedProviderAccountId(provider, cwd)` is the source of truth for the footer chip and for **new** sessions in that project. Invalid or missing ids fall back to `default`.

Rename: update `label` via `saveProviderAccount` (default row is not renamed in v1).

Add: `newProviderAccount` + name prompt in the popover → isolated login (`loginHarness(provider, id)`). Persist with `saveProviderAccount` only after login succeeds. Then `selectProviderAccount` and update the focused session's `providerAccountId`. Cancelled or failed login creates nothing.

### Isolation (`src-tauri/src/harness.rs`)

`provider_account_dir` already creates `app_data_dir/provider-accounts/<provider>/<id>/` for non-default ids. Extend the allow-list from `claude` | `codex` to include `opencode`.

`apply_provider_account` env:

| Provider | Extra account | Default account |
| --- | --- | --- |
| Claude | `CLAUDE_CONFIG_DIR` and `CLAUDE_SECURESTORAGE_CONFIG_DIR`; strip Anthropic token env vars (existing) | unchanged process env |
| Codex | `CODEX_HOME`; strip OpenAI/Codex token env vars (existing) | unchanged |
| OpenCode | `OPENCODE_DATA_DIR` = the profile dir. Strip `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_AUTH_CONTENT`, and API-key env vars that would pull the default install. `fetch_opencode_go_usage` takes `account_id` like `fetch_claude_usage` and reads `auth.json` from `provider_account_dir` (not from the MonoCode process env) | existing discovery (`OPENCODE_DATA_DIR` / XDG / default) |

`spawnChild` in `src/lib/harness/child.ts` must pass `{ provider, id }` for OpenCode extra accounts the same way it does for Claude/Codex.

Default (`id: default` or omitted) still returns `Ok(None)` from `provider_account_dir` — no extra folder, no extra env.

### Sessions and next action

- New chat in a project: copy `selectedProviderAccountId` for that harness into `session.providerAccountId`.
- Footer switch: `selectProviderAccount` **and** set the focused session's `providerAccountId` immediately. The chip always reflects the **project** selection for that provider. Do **not** kill the in-flight harness.
- Next provider action in **any** session of this project (send, title, compact, …): the account is `selectedProviderAccountId` at that moment. Write it onto the session, then if the live process is a different account, drop resume (the other login cannot continue that cloud thread) and spawn with MonoCode history. Same live-map mismatch already exists in `claude.ts` / `codex.ts`; v1 uses it for mid-session switch instead of pinning the starter account forever.
- Background tabs are not rewritten until their next action (or until they are focused and the user switches again). A turn already streaming on a background session keeps its original process.
- Handoff, second opinion, and orchestrated workers pass `providerAccountId` from the session **after** resolving it from the project selection at action start.

### Footer UI

`UsageFooter` / `UsageProviderChip` (and the OpenCode chip) take `project` (cwd) and subscribe to `subscribeProviderAccounts`.

Chip label:

- Only the default account exists → keep today's usage-only chip (`Codex 72% 5h`).
- At least one extra account → `Codex · {label}` plus usage, ellipsis on long labels. `aria-label` includes provider, account, and usage.

Popover (width may grow slightly past 300px if the list needs it; keep the existing usage cards, sign-in panel, and Codex banked resets):

1. Account list: Padrão, then named accounts; selected row marked. Inline rename on named rows.
2. **Adicionar conta**.
3. Divider.
4. Existing usage / empty / login content for the **selected** account.

Fetch paths (`fetchClaudeRateLimits`, `fetchCodexRateLimits`, `fetchOpencodeGoRateLimits`, reconnect, Codex reset credit) pass `selectedProviderAccountId`, not a hardcoded `"default"`. Changing selection refetches.

### i18n

All new strings go through `t()` with keys in `src/i18n/pt-BR.ts`: Padrão, Adicionar conta, Nova conta {provider}, Nome, Cancelar, Continuar, Renomear, and chip/popover `aria-label`s. No extra native `title` tooltips on the new controls (existing usage `title`s stay as they are).

## Testing and verification

- Extend `src/lib/providerAccounts.test.ts` if add-after-login / rename rules need cases beyond today's store tests.
- Footer/chip tests: label on the bar when extras exist; popover list; fetch invoked with the selected id; selection updates project + focused session without aborting a mocked in-flight turn.
- `src/lib/harness/auth.test.ts`: OpenCode named-account login isolation (env + child id), matching the existing Codex case.
- Claude/Codex live tests already cover restart when `providerAccountId` changes; add or extend a case for “switch during a session, next prompt uses the new account”.
- Rust: `provider_account_dir` accepts `opencode`; spawn sets `OPENCODE_DATA_DIR`; invalid ids still error; `default` still skips the extra dir.
- `npm test`, `cargo test` / `cargo check` on the harness and rate-limit crates touched, `npm run check:web` if that is the repo's web gate. Manual: two Codex accounts, stream a reply, switch, send the next message; repeat with OpenCode; confirm the chip usage follows the selected account.

## Risks

- **Transcript vs provider thread**: the new account does not see the old CLI's remote session. The MonoCode transcript is the continuity. If a harness cannot ingest full history, the next turn still starts on the new login with whatever history path that harness already uses for handoff/resume-less starts.
- **OpenCode config vs data**: extra-account usage must not read the global `auth.json` / `OPENCODE_AUTH_CONTENT`. Pass `account_id` into the Tauri command and resolve the profile dir the same way spawn does; confirm against the installed CLI before calling v1 done.
- **Footer density**: account names on three chips can clip; ellipsis plus `aria-label` is the accepted trade-off (user chose this over popover-only names).
