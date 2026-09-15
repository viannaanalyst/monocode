# Goal and Debug mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent per-session Goal and a Debug mode to the composer's Add menu, each injected into every turn's prompt.

**Architecture:** Two pure modules (`src/lib/goal.ts`, `src/lib/debugMode.ts`) own the type, the prompt blocks, the completion-marker parser and the chip label. The goal persists on the session (`goal_json` column in Rust plus the TS store/snapshot round-trip, mirroring `linked_work_item_json`). New UI pieces live in `src/chrome/ComposerModes.tsx` (Add-menu rows, goal editor, chips), composed by `src/chrome/Composer.tsx`. `src/App.tsx` composes the turn prompt (Goal → Debug → Plan/Orchestrator → request) and flips the goal to completed when the turn's final line signals it.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 tokens, vitest (SSR markup for components), Tauri v2 + rusqlite, pt-BR i18n dictionary.

## Global Constraints

- The typography guard (`src/typography.test.ts`) must stay green: only `text-sm`/`text-xs`/`text-2xs`/`text-display` tokens or the literal `text-[12px]`/`text-[10px]`; no `font-bold`, `size-2.5`, `size-2` outside its allowlist; row icons are `size-3.5`.
- Every user-facing string goes through `t()` with the English source key plus a `src/i18n/pt-BR.ts` entry.
- Commits follow the repo style: an imperative sentence ending with a period.
- No new dependencies. `npm run check:web` (vitest + tsc) must pass after every task; run `npm run check:rust` after the Rust edits.
- Touch only the files a task lists.

---

### Task 1: Goal module

**Files:**
- Create: `src/lib/goal.ts`
- Test: `src/lib/goal.test.ts`

**Interfaces:**
- Produces: `SessionGoal` (`{ text: string; createdAt: number; completedAt?: number }`), `goalTurnPrompt(goal: SessionGoal, request: string): string`, `goalCompleted(text: string): string | null`, `goalChipLabel(text: string, max?: number): string`, `sanitizeSessionGoal(value: unknown): SessionGoal | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/goal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  goalChipLabel,
  goalCompleted,
  goalTurnPrompt,
  sanitizeSessionGoal,
  type SessionGoal,
} from "./goal";

const goal: SessionGoal = { text: "Ship the login screen", createdAt: 1 };

describe("goalTurnPrompt", () => {
  it("carries the goal, the marker instruction, and the request", () => {
    const prompt = goalTurnPrompt(goal, "  add the form  ");
    expect(prompt).toContain("## Goal");
    expect(prompt).toContain("Ship the login screen");
    expect(prompt).toContain("GOAL COMPLETED: <one-line summary>");
    expect(prompt.trimEnd().endsWith("add the form")).toBe(true);
  });
});

describe("goalCompleted", () => {
  it("reads the marker from the last non-empty line", () => {
    expect(goalCompleted("Done.\n\nGOAL COMPLETED: login ships\n")).toBe(
      "login ships",
    );
    expect(goalCompleted("goal completed:   lowercase  ")).toBe("lowercase");
  });

  it("ignores missing, misplaced, and empty markers", () => {
    expect(goalCompleted("GOAL COMPLETED: early\nbut more work follows")).toBe(
      null,
    );
    expect(goalCompleted("still working")).toBe(null);
    expect(goalCompleted("GOAL COMPLETED:")).toBe(null);
    expect(goalCompleted("")).toBe(null);
  });
});

describe("goalChipLabel", () => {
  it("collapses whitespace and truncates long goals", () => {
    expect(goalChipLabel("a\n b")).toBe("a b");
    const long = "x".repeat(80);
    const label = goalChipLabel(long);
    expect(label.length).toBe(40);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("sanitizeSessionGoal", () => {
  it("keeps a valid goal and drops junk", () => {
    expect(sanitizeSessionGoal({ text: " go ", createdAt: 2 })).toEqual({
      text: "go",
      createdAt: 2,
    });
    expect(
      sanitizeSessionGoal({ text: "go", createdAt: 2, completedAt: 3 }),
    ).toEqual({ text: "go", createdAt: 2, completedAt: 3 });
    expect(sanitizeSessionGoal({ text: "   ", createdAt: 2 })).toBeUndefined();
    expect(sanitizeSessionGoal(null)).toBeUndefined();
    expect(sanitizeSessionGoal("goal")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/goal.test.ts`
Expected: FAIL — `Failed to resolve import "./goal"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/goal.ts`:

```ts
/** A session objective the agent keeps pursuing until the user closes it. */
export type SessionGoal = {
  text: string;
  createdAt: number;
  completedAt?: number;
};

const GOAL_COMPLETED_RE = /^GOAL COMPLETED:\s*(.+)$/i;

/** Keeps every turn pointed at the session's goal until it is achieved. */
export function goalTurnPrompt(goal: SessionGoal, request: string): string {
  return [
    "You are pursuing a goal the user set for this session. Keep every response focused on it.",
    "",
    "## Goal",
    "",
    goal.text.trim(),
    "",
    "Only after the goal is fully achieved, end your final reply with a last line exactly:",
    "GOAL COMPLETED: <one-line summary>",
    "Never emit that line while any part of the goal is still open.",
    "",
    "## Request",
    "",
    request.trim(),
  ].join("\n");
}

/** Reads the completion marker from the final non-empty line of a turn. */
export function goalCompleted(text: string): string | null {
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    const match = GOAL_COMPLETED_RE.exec(line);
    return match?.[1]?.trim() || null;
  }
  return null;
}

/** Chip label: one line, truncated so the composer stays compact. */
export function goalChipLabel(text: string, max = 40): string {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= max) return single;
  return `${single.slice(0, max - 1).trimEnd()}…`;
}

export function sanitizeSessionGoal(value: unknown): SessionGoal | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return undefined;
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : 0;
  const completedAt =
    typeof record.completedAt === "number" &&
    Number.isFinite(record.completedAt)
      ? record.completedAt
      : undefined;
  return { text, createdAt, ...(completedAt ? { completedAt } : {}) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/goal.test.ts src/typography.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/goal.ts src/lib/goal.test.ts
git commit -m "Add the goal prompt, marker parser, and chip label."
```

---

### Task 2: Debug mode module

**Files:**
- Create: `src/lib/debugMode.ts`
- Test: `src/lib/debugMode.test.ts`

**Interfaces:**
- Produces: `debugTurnPrompt(request: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/debugMode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { debugTurnPrompt } from "./debugMode";

describe("debugTurnPrompt", () => {
  it("carries the systematic posture and the request", () => {
    const prompt = debugTurnPrompt("  the preview errors  ");
    expect(prompt).toContain("systematic debugger");
    expect(prompt).toContain("root cause");
    expect(prompt).toContain("Verify the fix");
    expect(prompt.trimEnd().endsWith("the preview errors")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/debugMode.test.ts`
Expected: FAIL — `Failed to resolve import "./debugMode"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/debugMode.ts`:

```ts
export const DEBUG_MODE_BODY = `You are in debug mode. Work like a systematic debugger:
- Read the error and the failing output completely before touching code.
- Reproduce the problem and gather evidence at each layer before proposing a change.
- State one hypothesis and the smallest experiment that tests it.
- Fix the root cause, never the symptom; do not stack speculative fixes.
- Verify the fix against the failing case and the adjacent tests, and report the evidence.
If the request is not a debugging task, say so briefly and work normally.`;

/** Wraps a turn so the answer follows the debugging posture above. */
export function debugTurnPrompt(request: string): string {
  return [DEBUG_MODE_BODY, "", "## Request", "", request.trim()].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/debugMode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugMode.ts src/lib/debugMode.test.ts
git commit -m "Add the debug mode turn prompt."
```

---

### Task 3: Persist the goal

**Files:**
- Modify: `src-tauri/src/session_store.rs` (structs, `migrate`, `upsert_session`, `get_session`, test `sample()`)
- Modify: `src/lib/session.ts` (add `goal`)
- Modify: `src/lib/sessionStore.ts` (types, `persistableMeta`, `recordToSession`)
- Modify: `src/lib/workspaceSnapshot.ts` (stub type, collect, rehydrate, sanitize)
- Test: `src/lib/sessionStore.test.ts`, `src/lib/workspaceSnapshot.test.ts`

**Interfaces:**
- Consumes: `SessionGoal`, `sanitizeSessionGoal` from Task 1.
- Produces: `Session.goal?: SessionGoal` persisted end to end; `WorkspaceSessionStub.goal`.

- [ ] **Step 1: Write the failing TS tests**

Append to `src/lib/sessionStore.test.ts` (keep the existing imports; add `SessionGoal` usage inline):

```ts
describe("persisting a session goal", () => {
  it("carries the goal through the payload and the fingerprint", () => {
    const session = newSession("cursor", "/tmp/project");
    session.goal = { text: "Ship the login", createdAt: 1 };
    const payload = sanitizeSessionForPersist(session);
    expect(payload?.goal).toEqual({ text: "Ship the login", createdAt: 1 });
    const fingerprint = persistFingerprint(session);
    session.goal = { text: "Ship the login", createdAt: 1, completedAt: 2 };
    expect(persistFingerprint(session)).not.toBe(fingerprint);
  });
});
```

Append to `src/lib/workspaceSnapshot.test.ts`:

```ts
  it("round-trips a session goal", () => {
    const session = chat("s1", "/tmp/a");
    session.goal = { text: "Ship the login", createdAt: 1 };
    const snapshot = collectWorkspaceSnapshot(
      [newTab("s1")],
      [session],
      "t1",
      "/tmp/a",
      new Map(),
    );
    expect(snapshot.sessions[0]?.goal).toEqual({
      text: "Ship the login",
      createdAt: 1,
    });
    const restored = hydrateWorkspaceSnapshot(snapshot, new Map());
    expect(
      restored?.sessions.find((item) => item.id === "s1")?.goal,
    ).toEqual({ text: "Ship the login", createdAt: 1 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sessionStore.test.ts src/lib/workspaceSnapshot.test.ts`
Expected: FAIL — `payload?.goal` is `undefined`; the snapshot stub has no `goal`.

- [ ] **Step 3: Add the Rust column**

In `src-tauri/src/session_store.rs`:

1. `SessionUpsert` (after `linked_work_item`):

```rust
    #[serde(default)]
    pub goal: Option<Value>,
```

2. `SessionRecord` (after `linked_work_item`):

```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub goal: Option<Value>,
```

3. `migrate` (next to the existing `inbox_ask` line):

```rust
    ensure_session_column(conn, "goal_json", "TEXT")?;
```

4. `upsert_session`, next to `linked_work_item_json`:

```rust
    let goal_json = session
        .goal
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
```

5. The INSERT: add the column, the placeholder, and the conflict update:

```sql
           linked_work_item_json, goal_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
```
```sql
           linked_work_item_json = excluded.linked_work_item_json,
           goal_json = excluded.goal_json
```

6. `params![...]`: append `goal_json,` after `linked_work_item_json,`.

7. `get_session`: add `goal_json` to the SELECT after `linked_work_item_json`, read it as column 16, and map it:

```rust
                linked_work_item_json, goal_json
```
```rust
                linked_work_item: optional_json(row.get(15)?),
                goal: optional_json(row.get(16)?),
```

8. The test module's `sample()`: add `goal: None,` to the literal.

9. Add the Rust test after `legacy_inbox_chats_are_not_normal_sessions`:

```rust
    #[test]
    fn goal_round_trips_through_upsert_and_get() {
        let store = SessionStore::open_in_memory().unwrap();
        let conn = store.lock_conn().unwrap();
        let mut session = sample("goal", "/tmp/project", "Login");
        session.goal = Some(json!({ "text": "Ship the login", "createdAt": 1 }));
        upsert_session(&conn, &session).unwrap();
        let record = get_session(&conn, "goal").unwrap().unwrap();
        assert_eq!(record.goal, session.goal);
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_store`
Expected: PASS.

- [ ] **Step 4: Wire the TS store and snapshot**

`src/lib/session.ts` — inside `Session` (next to `linkedWorkItem?: LinkedWorkItem;`):

```ts
  goal?: SessionGoal;
```

and add the type import at the top:

```ts
import type { SessionGoal } from "./goal";
```

`src/lib/sessionStore.ts`:

- `SessionSummary`: leave unchanged (the rail does not need the goal).
- `SessionRecord` (after `linkedWorkItem`): `goal?: SessionGoal | null;`
- `SessionUpsertPayload` (after `linkedWorkItem`): `goal?: SessionGoal;`
- Import at the top: `import { sanitizeSessionGoal, type SessionGoal } from "./goal";`
- `persistableMeta`: after `const linkedWorkItem = sanitizeLinkedWorkItem(session.linkedWorkItem);` add

```ts
  const goal = sanitizeSessionGoal(session.goal);
```

and in the returned object, after `...(linkedWorkItem ? { linkedWorkItem } : {}),`:

```ts
    ...(goal ? { goal } : {}),
```

- `recordToSession`: after `const linkedWorkItem = sanitizeLinkedWorkItem(record.linkedWorkItem);` add

```ts
  const goal = sanitizeSessionGoal(record.goal);
```

and in the returned object, next to `linkedWorkItem,`:

```ts
    ...(goal ? { goal } : {}),
```

`src/lib/workspaceSnapshot.ts`:

- Import: `import { sanitizeSessionGoal, type SessionGoal } from "./goal";`
- `WorkspaceSessionStub`: add `goal?: SessionGoal;`
- The session→stub builder (the block ending with `...(session.worktreeCwd ? { worktreeCwd: session.worktreeCwd } : {}),` around line 316): add

```ts
    ...(session.goal ? { goal: session.goal } : {}),
```

- `sessionFromStub` (the block with the same shape around line 337): add

```ts
    ...(stub.goal ? { goal: stub.goal } : {}),
```

- `sanitizeStub` (around line 375): before its returned object add

```ts
  const goal = sanitizeSessionGoal(value.goal);
```

and inside the object, next to the `worktreeCwd` spread:

```ts
    ...(goal ? { goal } : {}),
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/sessionStore.test.ts src/lib/workspaceSnapshot.test.ts src/lib/goal.test.ts`
Expected: PASS.

Run: `npm run check:web`
Expected: 240+ files, all tests pass, `tsc` clean.

Run: `npm run check:rust`
Expected: fmt, clippy, and cargo tests clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/session_store.rs src/lib/session.ts src/lib/sessionStore.ts src/lib/workspaceSnapshot.ts src/lib/sessionStore.test.ts src/lib/workspaceSnapshot.test.ts
git commit -m "Persist the session goal in the store and snapshot."
```

---

### Task 4: Composer mode components

**Files:**
- Create: `src/chrome/ComposerModes.tsx`
- Test: `src/chrome/ComposerModes.test.ts`

**Interfaces:**
- Consumes: `goalChipLabel`, `SessionGoal` (Task 1); `Popover`, `PopoverAnchor` (existing).
- Produces: `GoalMenuRow({ goal?, onEdit })`, `DebugMenuRow({ active, onToggle })`, `GoalEditor({ anchor, width?, goal?, onSave(text), onClear, onClose })`, `GoalChip({ goal?, onEdit, onClear, onResolve(action) })`, `DebugChip({ onDisable })`.

- [ ] **Step 1: Add the two icons**

In `src/chrome/icons.tsx`, add the imports next to the other hugeicons imports:

```ts
import Bug01Icon from "@hugeicons/core-free-icons/Bug01Icon";
import CrosshairIcon from "@hugeicons/core-free-icons/CrosshairIcon";
```

and the exports next to the other `wrap(...)` lines:

```ts
export const Bug = wrap(Bug01Icon, "Bug");
export const Crosshair = wrap(CrosshairIcon, "Crosshair");
```

- [ ] **Step 2: Write the failing test**

Create `src/chrome/ComposerModes.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DebugChip, DebugMenuRow, GoalChip, GoalMenuRow } from "./ComposerModes";

describe("composer goal and debug modes", () => {
  it("shows the goal text in the menu row and the chip", () => {
    const goal = { text: "Ship the login screen", createdAt: 1 };
    const row = renderToStaticMarkup(
      createElement(GoalMenuRow, { goal, onEdit: vi.fn() }),
    );
    expect(row).toContain("Ship the login screen");
    const chip = renderToStaticMarkup(
      createElement(GoalChip, {
        goal,
        onEdit: vi.fn(),
        onClear: vi.fn(),
        onResolve: vi.fn(),
      }),
    );
    expect(chip).toContain("Ship the login screen");
    expect(chip).not.toContain("Complete goal");
  });

  it("truncates a long goal in the chip and shows the completion actions", () => {
    const goal = {
      text: "Fazer o preview de anexos funcionar em todos os formularios",
      createdAt: 1,
      completedAt: 2,
    };
    const chip = renderToStaticMarkup(
      createElement(GoalChip, {
        goal,
        onEdit: vi.fn(),
        onClear: vi.fn(),
        onResolve: vi.fn(),
      }),
    );
    expect(chip).toContain("…");
    expect(chip).toContain('aria-label="Complete goal"');
    expect(chip).toContain('aria-label="Keep pursuing"');
  });

  it("marks the debug rows when active", () => {
    const off = renderToStaticMarkup(
      createElement(DebugMenuRow, { active: false, onToggle: vi.fn() }),
    );
    const on = renderToStaticMarkup(
      createElement(DebugMenuRow, { active: true, onToggle: vi.fn() }),
    );
    expect(off).not.toContain('aria-pressed="true"');
    expect(on).toContain('aria-pressed="true"');
    expect(
      renderToStaticMarkup(createElement(DebugChip, { onDisable: vi.fn() })),
    ).toContain("Debug");
  });

  it("hides the goal chip and renders the empty menu row without a goal", () => {
    expect(
      renderToStaticMarkup(
        createElement(GoalChip, {
          onEdit: vi.fn(),
          onClear: vi.fn(),
          onResolve: vi.fn(),
        }),
      ),
    ).toBe("");
    const row = renderToStaticMarkup(
      createElement(GoalMenuRow, { onEdit: vi.fn() }),
    );
    expect(row).toContain("Set a goal to keep pursuing");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/chrome/ComposerModes.test.ts`
Expected: FAIL — `Failed to resolve import "./ComposerModes"`.

- [ ] **Step 4: Write the components**

Create `src/chrome/ComposerModes.tsx`:

```tsx
import { useState, type ReactElement } from "react";
import { goalChipLabel, type SessionGoal } from "../lib/goal";
import { t } from "../i18n";
import { Bug, Check, Crosshair, X } from "./icons";
import { Popover, type PopoverAnchor } from "./Popover";

const ROW =
  "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-content hover:bg-content/10";

const CHIP =
  "flex h-6.5 shrink-0 items-center gap-1 rounded-full px-1.5 text-sm";

export function GoalMenuRow({
  goal,
  onEdit,
}: {
  goal?: SessionGoal;
  onEdit: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onEdit}
      className={ROW}
    >
      <Crosshair className="size-3.5 shrink-0 text-content/70" />
      <span className="min-w-0 truncate text-sm">{t("Goal")}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-content/40">
        {goal ? goalChipLabel(goal.text) : t("Set a goal to keep pursuing")}
      </span>
      {goal ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
    </button>
  );
}

export function DebugMenuRow({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={ROW}
    >
      <Bug className="size-3.5 shrink-0 text-content/70" />
      <span className="min-w-0 truncate text-sm">{t("Debug mode")}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-content/40">
        {t("Turn debug mode on")}
      </span>
      {active ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
    </button>
  );
}

export function GoalEditor({
  anchor,
  width,
  goal,
  onSave,
  onClear,
  onClose,
}: {
  anchor: PopoverAnchor;
  width?: number;
  goal?: SessionGoal;
  onSave: (text: string) => void;
  onClear: () => void;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(goal?.text ?? "");
  const save = () => {
    const text = draft.trim();
    if (!text) return;
    onSave(text);
  };
  return (
    <Popover
      anchor={anchor}
      side="top"
      align="start"
      width={width}
      onDismiss={onClose}
      className="p-2"
    >
      <p className="px-1 pb-1 text-2xs font-medium uppercase tracking-wide text-content/40">
        {t("Goal")}
      </p>
      <textarea
        value={draft}
        autoFocus
        rows={3}
        spellCheck={false}
        placeholder={t("Describe the goal for this session")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") onClose();
        }}
        className="w-full resize-none rounded-md border border-content/10 bg-content/5 p-2 text-sm text-content outline-none placeholder:text-content/35"
      />
      <div className="flex items-center justify-end gap-1 pt-1.5">
        {goal ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-xs text-content/60 hover:bg-content/10 hover:text-content"
          >
            {t("Clear")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          className="rounded-md bg-content/10 px-2 py-1 text-xs font-medium text-content hover:bg-content/15"
        >
          {t("Save")}
        </button>
      </div>
    </Popover>
  );
}

export function GoalChip({
  goal,
  onEdit,
  onClear,
  onResolve,
}: {
  goal?: SessionGoal;
  onEdit: () => void;
  onClear: () => void;
  onResolve: (action: "complete" | "keep") => void;
}): ReactElement | null {
  if (!goal) return null;
  const completed = Boolean(goal.completedAt);
  return (
    <span
      className={`${CHIP} ${
        completed
          ? "bg-emerald-400/10 text-emerald-200/90"
          : "bg-content/8 text-content/80"
      }`}
    >
      <Crosshair className="size-3.5 shrink-0" />
      <button
        type="button"
        title={t("Edit goal")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onEdit}
        className="max-w-56 truncate"
      >
        {goalChipLabel(goal.text)}
      </button>
      {completed ? (
        <>
          <button
            type="button"
            aria-label={t("Complete goal")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onResolve("complete")}
            className="rounded px-1 text-2xs font-medium hover:bg-emerald-400/15"
          >
            {t("Complete goal")}
          </button>
          <button
            type="button"
            aria-label={t("Keep pursuing")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onResolve("keep")}
            className="rounded px-1 text-2xs font-medium text-emerald-100/70 hover:bg-emerald-400/15"
          >
            {t("Keep pursuing")}
          </button>
        </>
      ) : null}
      <button
        type="button"
        aria-label={t("Clear goal")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        className="grid size-3.5 shrink-0 place-items-center rounded-full hover:bg-content/15"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function DebugChip({ onDisable }: { onDisable: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-label={t("Turn off Debug mode")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onDisable}
      className={`${CHIP} text-content/70 hover:bg-content/10`}
    >
      <Bug className="size-3.5" />
      Debug
      <X className="size-3.5" />
    </button>
  );
}
```

- [ ] **Step 5: Add the pt-BR keys**

In `src/i18n/pt-BR.ts`, next to the other composer keys:

```ts
  Goal: "Objetivo",
  "Set a goal to keep pursuing": "Defina um objetivo para perseguir",
  "Describe the goal for this session": "Descreva o objetivo desta sessão",
  "Edit goal": "Editar objetivo",
  "Clear goal": "Limpar objetivo",
  "Complete goal": "Concluir objetivo",
  "Keep pursuing": "Continuar",
  "Debug mode": "Modo debug",
  "Turn debug mode on": "Liga o modo debug",
  "Turn off Debug mode": "Desliga o modo debug",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/chrome/ComposerModes.test.ts src/typography.test.ts`
Expected: PASS (4 tests + the guard).

- [ ] **Step 7: Commit**

```bash
git add src/chrome/ComposerModes.tsx src/chrome/ComposerModes.test.ts src/chrome/icons.tsx src/i18n/pt-BR.ts
git commit -m "Add the composer goal and debug mode pieces."
```

---

### Task 5: Compose the pieces into the composer

**Files:**
- Modify: `src/chrome/Composer.tsx`
- Modify: `src/surfaces/SessionPane.tsx`
- Modify: `src/lib/session.ts` (`ComposerTurnOptions`)
- Modify: `src/App.tsx` (goal handlers, pass-through, `debug` in the send options)

**Interfaces:**
- Consumes: the Task 4 components; `SessionGoal`; `ComposerTurnOptions`.
- Produces: the composer emits `{ intent, debug }` on send; the session goal is set/cleared/confirmed through `onGoalChange`/`onGoalResolve`; `App`'s send options gain `debug?: boolean`.

- [ ] **Step 1: Extend the turn options type**

`src/lib/session.ts`:

```ts
export type ComposerTurnOptions = { intent?: TurnIntent; debug?: boolean };
```

- [ ] **Step 2: Composer props and state**

In `src/chrome/Composer.tsx`:

- Import: `import { GoalChip, GoalEditor, GoalMenuRow, DebugMenuRow, DebugChip } from "./ComposerModes";` and `import type { SessionGoal } from "../lib/goal";`
- Props type (next to `onSubmit`):

```ts
  goal?: SessionGoal;
  onGoalChange?: (goal: SessionGoal | null) => void;
  onGoalResolve?: (action: "complete" | "keep") => void;
```

- Destructure them with the others (the block that starts at `onSubmit,`):

```ts
  goal,
  onGoalChange,
  onGoalResolve,
```
- State (next to `const [planSelected, setPlanSelected] = useState(false);`):

```ts
  const [debugSelected, setDebugSelected] = useState(false);
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
```

- Send payload (the `onSubmit(text, files, {...})` call):

```ts
      debug: debugSelected,
```

- The menu rows, in Synara's order (Goal before Plan, Debug after it): insert `<GoalMenuRow …/>` immediately after the Files and folders `</button>` and before the Plan mode `<button … aria-pressed={planSelected}`, and `<DebugMenuRow …/>` immediately after the Plan row's `</button>` and before the Orchestrator row:

```tsx
                  <GoalMenuRow
                    goal={goal}
                    onEdit={() => {
                      setPlusOpen(false);
                      setGoalEditorOpen(true);
                      ref.current?.focus();
                    }}
                  />
```

```tsx
                  <DebugMenuRow
                    active={debugSelected}
                    onToggle={() => {
                      setDebugSelected((selected) => !selected);
                      setPlusOpen(false);
                      ref.current?.focus();
                    }}
                  />
```

- The editor popover: right after the `{plusOpen ? (<Popover …>…</Popover>) : null}` block for the "+" menu insert:

```tsx
              {goalEditorOpen ? (
                <GoalEditor
                  anchor={boxRef}
                  width={plusWidth}
                  goal={goal}
                  onSave={(text) => {
                    onGoalChange?.({
                      text,
                      createdAt: goal?.createdAt ?? Date.now(),
                    });
                    setGoalEditorOpen(false);
                    ref.current?.focus();
                  }}
                  onClear={() => {
                    onGoalChange?.(null);
                    setGoalEditorOpen(false);
                    ref.current?.focus();
                  }}
                  onClose={() => setGoalEditorOpen(false)}
                />
              ) : null}
```

- The chips: after the `planSelected ? (<button …Plan…</button>) : null` block insert:

```tsx
            <GoalChip
              goal={goal}
              onEdit={() => setGoalEditorOpen(true)}
              onClear={() => onGoalChange?.(null)}
              onResolve={(action) => onGoalResolve?.(action)}
            />
            {debugSelected ? (
              <DebugChip onDisable={() => setDebugSelected(false)} />
            ) : null}
```

- [ ] **Step 3: Pass the props through SessionPane**

In `src/surfaces/SessionPane.tsx` (next to the other `Composer` props):

```tsx
      goal={session.goal}
      onGoalChange={(goal) => onGoalChange?.(session.id, goal)}
      onGoalResolve={(action) => onGoalResolve?.(session.id, action)}
```

with the two props added to `SessionPane`'s props type:

```ts
  onGoalChange?: (sessionId: string, goal: SessionGoal | null) => void;
  onGoalResolve?: (sessionId: string, action: "complete" | "keep") => void;
```

(`import type { SessionGoal } from "../lib/goal";`)

- [ ] **Step 4: App handlers and send options**

In `src/App.tsx`, next to `persistSession`:

```ts
  const onGoalChange = useCallback(
    (sessionId: string, goal: SessionGoal | null) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, goal: goal ?? undefined }
            : session,
        ),
      );
    },
    [],
  );

  const onGoalResolve = useCallback(
    (sessionId: string, action: "complete" | "keep") => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId || !session.goal) return session;
          if (action === "complete") {
            return { ...session, goal: undefined };
          }
          const { completedAt: _completedAt, ...goal } = session.goal;
          return { ...session, goal };
        }),
      );
    },
    [],
  );
```

The persistence effect that watches `sessions` (the 650 ms queue) stores the change; no explicit `persistSession` call is needed.

- `onSubmit`'s options type: add `debug?: boolean;`
- Pass the props where `SessionPane` is rendered:

```tsx
                onGoalChange={onGoalChange}
                onGoalResolve={onGoalResolve}
```

- [ ] **Step 5: Run the checks**

Run: `npm run check:web`
Expected: all tests pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/chrome/Composer.tsx src/surfaces/SessionPane.tsx src/lib/session.ts src/App.tsx
git commit -m "Wire the goal and debug modes into the composer."
```

---

### Task 6: Prompt composition and completion detection

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `goalTurnPrompt`, `goalCompleted` (Task 1); `debugTurnPrompt` (Task 2); `options.debug` (Task 5); `session.goal` (Task 3).

- [ ] **Step 1: Compose the turn prompt**

In `src/App.tsx`, the block that builds `turnPrompt`:

```ts
          const base = proposalDraft
            ? orchestrationPlanningPrompt(prompt, proposalDraft.settings)
            : intent === "plan" && !rawCommand
              ? planTurnPrompt(prompt)
              : prompt;
          const withDebug = options?.debug ? debugTurnPrompt(base) : base;
          const turnPrompt = current.goal
            ? goalTurnPrompt(current.goal, withDebug)
            : withDebug;
```

(Imports: `import { goalCompleted, goalTurnPrompt } from "./lib/goal";` and `import { debugTurnPrompt } from "./lib/debugMode";`)

- [ ] **Step 2: Accumulate the turn and detect the marker**

Next to `let buildSucceeded = false;`:

```ts
        let goalText = "";
        const goalActive = Boolean(current.goal && !current.goal.completedAt);
```

Inside the `onEvent` callback, after the `session.error` line:

```ts
              if (goalActive && event.type === "message.delta") {
                goalText = (goalText + event.text).slice(-200_000);
              }
              if (goalActive && event.type === "message.completed") {
                goalText += "\n";
              }
```

After the `try/catch/finally` that owns `buildSucceeded`, before the post-turn bookkeeping:

```ts
        if (goalActive && buildSucceeded && goalCompleted(goalText)) {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === sessionId && session.goal
                ? {
                    ...session,
                    goal: { ...session.goal, completedAt: Date.now() },
                  }
                : session,
            ),
          );
        }
```

- [ ] **Step 3: Run the checks**

Run: `npx vitest run src/lib/goal.test.ts src/lib/debugMode.test.ts`
Expected: PASS.

Run: `npm run check:web`
Expected: all tests pass, `tsc` clean.

- [ ] **Step 4: Manual verification in dev**

Run: `npm run tauri dev`, then:
1. Add menu → Goal → type `testar o objetivo` → Enter. The chip appears; reopen the editor by clicking the chip label.
2. Send a message: the turn prompt carries the goal block (check the transcript's behavior: the agent keeps the goal in mind).
3. Add menu → Debug mode: the chip appears; send a turn; turn Debug off from the chip.
4. Ask the agent to achieve a trivial goal and end with the marker line; the chip turns emerald with Concluir/Continuar. `Continuar` keeps the goal without the marker; `Concluir` clears it.
5. Restart the app: the goal (and a completed state) is still there.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Inject the goal and debug blocks and detect goal completion."
```

---

### Task 7: Full verification and hand-off build

**Files:** none (verification only).

- [ ] **Step 1: Full checks**

Run: `npm run check:web`
Expected: all test files pass, `tsc` clean.

Run: `npm run check:rust`
Expected: fmt, clippy, cargo tests clean.

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 2: Install for the human pass**

Run: `npm run app:mac`
Expected: `MonoCode instalado em /Applications` (the updater signing warning is pre-existing).

- [ ] **Step 3: Report**

Report the commit list, the check results, and the manual checklist from Task 6 Step 4 for the human's pass.
