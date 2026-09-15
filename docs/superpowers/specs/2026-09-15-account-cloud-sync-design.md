# Account and cloud sync — design

## Goal

Let the user sign in on any machine running their MonoCode build and get their projects, conversations (text only), and non-secret settings back — with the cloud unable to read any of it.

## Evidence

- User request (2026-09-15): "instalo no outro pc, logo na minha conta e vêm todos os projetos e conversas"; images must not sync ("essas imagens não precisa fazer sync"); settings/design should ("configurações design etc etc").
- Decisions from the design Q&A: v1 includes conversations without images; end-to-end encryption with a passphrase (cloud blind); Supabase free tier as the backend; no budget (free only); no second Mac available to test yet, and Windows support is out of scope for v1.
- Codebase constraints that shape the design: projects are keyed by absolute path (`projectKey = pathKey(cwd)`, `src/lib/paths.ts:213`); sessions carry machine-local state (`providerSessionId`, `worktreeCwd`, checkpoints, in-flight flags) and embed attachment `data` up to 20MB (`src/lib/attachments.ts:6`); persistence funnels through `persistableMeta`/`upsertSession` (`src/lib/sessionStore.ts`) with a 650ms queue; the Rust store owns `sessions`/`notes`/`workspace_snapshot` in SQLite; session export/import exists (`src/lib/sessionExport.ts`).

## Scope

In scope (v1):

- **Account**: sign in/out with email magic link (Supabase Auth), one user, first machine creates the encryption key, later machines unlock it.
- **Projects**: registry entries (id, name, git remote, label, color, mascot, pinned/favorite) synced; on a new machine a project that is not on disk offers "Clonar do GitHub".
- **Conversations**: session headers (title, harness, model, model settings, runtime mode, pinned, archived, goal) and blocks (text, tool metadata), **without attachment payloads**; history restores, "continue" starts a fresh provider session on that machine.
- **Settings and design**: whitelisted non-secret keys only (theme, fonts, scale, accent, provider order, model presets, composer preferences, tab-group labels/colors/mascots, rail width, keybindings), plus Notes.
- **Sync UX**: Settings → Account panel (sign in, passphrase, recovery key, sync now, last sync, pending/failed counts), offline queue, per-project "não sincronizar" toggle.

Out of scope (v1):

- Attachments and images (never leave the machine; restored conversations show a "imagem só neste computador" placeholder), provider CLI credentials, API keys/tokens, `.env` files, checkpoints, in-flight state, terminal contents, browser scratch files, worktrees.
- Windows (a separate app port), mobile/web clients, sharing with other people, realtime push, server-side search.
- Home-directory skill folders (project skills already travel with git); automations and reminders (they are machine-specific schedules).

## Design

### Threat model and encryption

- The server must never see plaintext content, names, or paths. The only plaintext it stores: `user_id`, record `kind`, record `id`, `parent_id` (for blocks), `updated_at`, `deleted`, a random `project_id` when applicable, and ciphertext + nonce.
- **Master key**: 32 random bytes generated on the first device. Stored locally wrapped: `AES-GCM(master, key = PBKDF2-SHA256(passphrase, salt, 600k))`. The passphrase never leaves the device and is never persisted.
- **Recovery key**: the master key in base64, shown once at setup and re-exportable from the settings panel. Losing both passphrase and recovery key makes the data unrecoverable — the UI says so explicitly.
- **Per record**: a random 12-byte nonce; `AES-GCM(master, nonce, plaintext JSON)`; additional data binds `kind` + `id` so records cannot be swapped between kinds.
- The master key lives in memory only while unlocked; a lock action and app quit clear it (the settings panel stays locked until the passphrase is entered again).
- RLS on every table (`user_id = auth.uid()`), no service-role key in the app, no public buckets.

### Record model

One table, `sync_records`, holding every synced item as an opaque blob:

| column | type | notes |
| --- | --- | --- |
| user_id | uuid | RLS scope |
| kind | text | `project` \| `settings` \| `note` \| `session` \| `block` |
| id | text | uuid for projects/sessions/notes; stable key for settings entries |
| parent_id | text null | session id for blocks; project id for sessions |
| updated_at | bigint | client clock (ms); late writes must not go backwards |
| deleted | boolean | tombstones |
| project_id | text null | random uuid, plaintext, for per-project filtering |
| nonce | text | base64 |
| ciphertext | text | base64 |

- **Sessions are split**: the session header is one record, each block a child record keyed by the block's stable id. Blocks are immutable and append-only, so two machines can never conflict on them; only headers (title, goal, pinned, archived, model) use last-write-wins by `updated_at`.
- **Deleting** a session writes a tombstone for the session plus tombstones for its blocks (or a server-side delete cascade by `parent_id`).
- **Settings** are one record per key (stable ids) so a change on one machine does not clobber unrelated keys. Notes are one record each.
- Local cursor: `last_pulled_at` per account; pull is `updated_at > cursor` ordered by `updated_at, kind, id`; push is batched upserts (100 records per request, ~200KB of ciphertext max per batch, below Supabase's request limits).

### Local integration

- A local outbox mirrors writes that matter: the persistence path already funnels through `upsertSession`/`persistableMeta`, and Rust owns the store — the sync layer gets an explicit "mark synced entities" step there instead of touching every caller. A periodic reconciler (on app focus, every 5 minutes, and after each turn) pushes dirty records and pulls changes.
- Incoming records are written through the same store functions, then the UI is nudged (history reload, tabs reload) with the existing `nudgeWorkspace`-style events.
- Session records arriving from another machine are marked `remote: true` in local metadata so "continue" knows to start a fresh provider session and to clear `providerSessionId`/`worktreeCwd`.
- Attachments are stripped at capture: the sync payload keeps `{id, kind, mimeType, name, size, local: true}` and drops `data`/`path`; the transcript renders the existing attachment chip with a "só neste computador" state.
- Offline: every write stays local; the outbox flushes when the network returns. Supabase's post-idle wake-up (free tier) is handled by treating the first request of a session as a warm-up with one retry and a visible "acordando…" state.

### New-machine flow

1. Install the build → Settings → Account → sign in (magic link).
2. If this is not the first device: enter the passphrase (or paste the recovery key) and unlock.
3. The first sync pulls the project registry, settings, notes, and conversations.
4. A project whose checkout is missing on this machine shows "não está neste computador" with **Clonar do GitHub**: the app runs `git clone <remote> <chosen folder>` and remaps that project's local path; sessions for it appear as history.
5. Sessions that reference a provider session from another machine are marked "histórico" — sending a message starts a fresh provider session (and the UI says so once).

### Error handling and edge cases

- Clock skew: `updated_at` is server-clamped (`greatest(existing, incoming)` guard in the upsert) so a wrong device clock cannot silently reorder history.
- Conflicts: header LWW with the losing version dropped from the server; the losing header values are kept locally in a `sync_conflicts` row and the panel shows "1 conflito" until dismissed. Blocks never conflict (immutable, append-only).
- Partial failure: a failed batch retries with exponential backoff; a record that fails to decrypt is skipped and reported, never dropped silently (others continue).
- Account changes: signing out keeps local data; a different account signing in requires a fresh key setup and does not merge into the previous account's data.
- Deletion is respected: tombstones propagate but never delete local-only data (attachments stay where they are).

## Testing

- **Pure units**: key wrapping/unwrapping (PBKDF2 + AES-GCM round-trip, wrong passphrase fails), record encryption with bound AAD, payload builders that strip attachments, session-to-records splitting and merging (blocks union, header LWW with clock skew), settings whitelist filtering.
- **Local integration (vitest, mocked Supabase client)**: outbox marks and flushes, pull cursor advances, tombstones apply, offline retry, warm-up retry on the first request.
- **Rust**: no new commands needed for v1 beyond what the store exposes; if a table/cursor column is added, cover it with an in-memory test.
- **Manual, two machines or one machine plus a wiped profile**: first-device setup, second-device unlock, project clone prompt, history restore, continue-on-new-machine, image placeholder, offline edits then reconnect, recovery-key restore, sign-out/sign-in.
- `npm run check:web`, `npm run check:rust`, and the typography guard stay green.

### Fixed decisions

- The project registry keeps label, color, and mascot **inside** the project record (one record per project, no separate settings rows).
- The Supabase URL and anon key ship in the build (single-user, RLS-protected); Settings gains an override field so a self-hosted instance can be pointed at later.
- Passphrase rules: minimum 8 characters, show/hide toggle, and a one-time confirmation that it is the only key to the data.
- Free-tier email caveat: Supabase's built-in mailer is rate-limited (a few messages per hour), which is enough for signing in once per device; a custom SMTP is a later option.
- Delivery stages for the plan, each independently verifiable: (1) crypto module + account/key-setup UI, (2) sync records and the engine (outbox, pull cursor, tombstones, warm-up retry), (3) capture/split/restore of projects, settings, notes, and conversations (attachments stripped, remote sessions marked), (4) the new-machine flow (clone prompt, history restore, continue-here notice).
