# Agent Provider Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a user-chosen agent provider order, let the user reorder providers on Settings → Providers (drag by a grip plus keyboard move buttons), and apply that order in every provider listing.

**Architecture:** A small reactive store (`src/lib/providerOrder.ts`) persists the order in `localStorage`, merges it safely with the fixed `HARNESSES` array, and notifies subscribers like the existing picker-visibility store in `src/lib/models.ts`. Consumers (Settings page, `ModelPicker`, `secondOpinionTargets`, `defaultSessionChoice`) read `orderedHarnesses(...)`. The Settings list reuses `useSortable` (vertical) with a grip handle and adds labeled move-up/down buttons for keyboard access.

**Tech Stack:** React + TypeScript, `useSyncExternalStore`, the existing `useSortable` hook, vitest (`renderToStaticMarkup` for static markup, happy-dom where DOM is needed).

## Global Constraints

- No new dependencies; persistence is `localStorage` only, matching the rest of the app.
- The merge rule is fixed: saved order wins for providers that still exist, unknown/duplicate ids drop, new providers append at the end in `HARNESSES` order.
- An explicit default provider (`loadLastModelChoice()?.harness`) always wins; the user order only decides the fallback when it is unset or unavailable.
- `allModels()`/`findModel()` keep their fixed `HARNESS_ORDER`; model-ID resolution must not follow display order.
- English strings are the i18n keys; add pt-BR entries for every new user-facing string.
- Commit messages follow the repo style: imperative sentence ending with a period.
- Run `npx vitest run <file>` while iterating and `npm run check:web` before considering the feature done.

---

### Task 1: Provider order store (`providerOrder.ts`)

**Files:**
- Create: `src/lib/providerOrder.ts`
- Create: `src/lib/providerOrder.test.ts`

**Interfaces:**
- Consumes: `HARNESSES`, `type HarnessId` from `src/lib/session.ts`.
- Produces (used by Tasks 2-3): `PROVIDER_ORDER_KEY`, `PROVIDER_ORDER_CHANGE_EVENT`, `mergeProviderOrder(saved, available)`, `loadProviderOrder()`, `saveProviderOrder(ids)`, `moveProvider(order, id, delta)`, `orderedHarnesses(available?)`, `subscribeProviderOrder(listener)`, `getProviderOrderSnapshot()`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/providerOrder.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_ORDER_KEY,
  getProviderOrderSnapshot,
  loadProviderOrder,
  mergeProviderOrder,
  moveProvider,
  orderedHarnesses,
  saveProviderOrder,
  subscribeProviderOrder,
} from "./providerOrder";
import { HARNESSES } from "./session";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mergeProviderOrder", () => {
  it("keeps the saved order and appends new providers at the end", () => {
    expect(
      mergeProviderOrder(["grok", "claude"], ["claude", "codex", "grok", "pi"]),
    ).toEqual(["grok", "claude", "codex", "pi"]);
  });

  it("drops unknown and duplicate ids", () => {
    expect(
      mergeProviderOrder(["nope", "pi", "pi", 7, null], ["claude", "pi"]),
    ).toEqual(["pi", "claude"]);
  });

  it("returns the default order when nothing is saved", () => {
    expect(mergeProviderOrder([], HARNESSES)).toEqual([...HARNESSES]);
  });
});

describe("persistence", () => {
  it("round-trips through localStorage and notifies subscribers", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeProviderOrder(() =>
      seen.push(getProviderOrderSnapshot()),
    );
    saveProviderOrder(["pi", "fx", "claude"]);
    unsubscribe();
    expect(JSON.parse(localStorage.getItem(PROVIDER_ORDER_KEY) ?? "[]")).toEqual(
      ["pi", "fx", "claude", "codex", "cursor", "grok", "opencode", "omp"],
    );
    expect(loadProviderOrder()).toEqual([
      "pi",
      "fx",
      "claude",
      "codex",
      "cursor",
      "grok",
      "opencode",
      "omp",
    ]);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("falls back to the default order for garbage values", () => {
    localStorage.setItem(PROVIDER_ORDER_KEY, "{not json");
    expect(loadProviderOrder()).toEqual([...HARNESSES]);
    localStorage.setItem(PROVIDER_ORDER_KEY, JSON.stringify({ a: 1 }));
    expect(loadProviderOrder()).toEqual([...HARNESSES]);
  });
});

describe("moveProvider", () => {
  it("moves within bounds and clamps at the ends", () => {
    expect(moveProvider(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveProvider(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveProvider(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("orderedHarnesses", () => {
  it("preserves the user order and honors the availability filter", () => {
    saveProviderOrder(["omp", "codex", "claude"]);
    expect(orderedHarnesses((id) => id === "claude" || id === "codex")).toEqual([
      "codex",
      "claude",
    ]);
  });
});
```

Note: `moveProvider` is generic over `T extends string`, so the unit test can pass plain strings while production call sites pass `HarnessId`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/providerOrder.test.ts`
Expected: FAIL with `Cannot find module './providerOrder'`.

- [ ] **Step 3: Implement `providerOrder.ts`**

```ts
import { HARNESSES, type HarnessId } from "./session";

export const PROVIDER_ORDER_KEY = "monocode.providerOrder";
export const PROVIDER_ORDER_CHANGE_EVENT = "monocode:provider-order-change";

let version = 0;
const listeners = new Set<() => void>();

function isHarnessId(value: unknown): value is HarnessId {
  return (
    typeof value === "string" &&
    (HARNESSES as readonly string[]).includes(value)
  );
}

export function mergeProviderOrder(
  saved: readonly unknown[],
  available: readonly HarnessId[],
): HarnessId[] {
  const allowed = new Set(available);
  const merged: HarnessId[] = [];
  const seen = new Set<HarnessId>();
  for (const value of saved) {
    if (!isHarnessId(value) || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  for (const id of available) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function loadProviderOrder(): HarnessId[] {
  try {
    const raw = localStorage.getItem(PROVIDER_ORDER_KEY);
    if (!raw) return [...HARNESSES];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...HARNESSES];
    return mergeProviderOrder(parsed, HARNESSES);
  } catch {
    return [...HARNESSES];
  }
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROVIDER_ORDER_CHANGE_EVENT));
  }
}

export function saveProviderOrder(ids: readonly HarnessId[]): void {
  const next = mergeProviderOrder(ids, HARNESSES);
  try {
    localStorage.setItem(PROVIDER_ORDER_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
  notify();
}

export function moveProvider<T extends string>(
  order: readonly T[],
  id: T,
  delta: -1 | 1,
): T[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function orderedHarnesses(
  available?: (harness: HarnessId) => boolean,
): HarnessId[] {
  const allowed = available ? HARNESSES.filter(available) : [...HARNESSES];
  return mergeProviderOrder(loadProviderOrder(), allowed);
}

export function subscribeProviderOrder(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProviderOrderSnapshot(): number {
  return version;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== PROVIDER_ORDER_KEY) return;
    notify();
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/providerOrder.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providerOrder.ts src/lib/providerOrder.test.ts
git commit -m "Add the provider order store."
```

---

### Task 2: Apply the order to every provider listing

**Files:**
- Modify: `src/chrome/ModelPicker.tsx:436-439` (picker provider groups)
- Modify: `src/lib/secondOpinion.ts:91-97` (`secondOpinionTargets`)
- Modify: `src/lib/models.ts:770-777` (`defaultSessionChoice` fallback)
- Modify: `src/lib/models.test.ts` (new fallback case)
- Modify: `src/lib/secondOpinion.test.ts` (new order case)
- Modify: `src/chrome/ModelPicker.test.ts` (new order case)

**Interfaces:**
- Consumes: `orderedHarnesses`, `subscribeProviderOrder`, `getProviderOrderSnapshot`, `saveProviderOrder`, `PROVIDER_ORDER_KEY` from Task 1.
- Produces: no new exports; consumer behavior follows the persisted order.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/models.test.ts` inside the `defaultSessionChoice` describe block:

```ts
  it("follows the saved provider order for the fallback", () => {
    localStorage.setItem(
      "monocode.providerOrder",
      JSON.stringify(["pi", "claude", "codex"]),
    );
    expect(defaultSessionChoice((harness) => harness === "pi" || harness === "claude")).toEqual({
      harness: "pi",
      model: defaultModelId("pi"),
    });
  });
```

Add to `src/lib/secondOpinion.test.ts` inside the `secondOpinionTargets` describe block:

```ts
  it("follows the saved provider order", () => {
    localStorage.setItem(
      "monocode.providerOrder",
      JSON.stringify(["codex", "claude"]),
    );
    expect(
      secondOpinionTargets("pi", {
        installed: (id) => id === "claude" || id === "codex",
        visible: () => true,
        probed: true,
      }),
    ).toEqual(["codex", "claude"]);
  });
```

Both test files need `beforeEach`/`afterEach` localStorage stubbing if they do not already have it; `src/lib/models.test.ts` already uses `localStorage` directly, and `src/lib/secondOpinion.test.ts` needs the stub from `src/chrome/ModelPicker.test.ts:62-73`:

```ts
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

(Import `beforeEach`/`afterEach`/`vi` from vitest as needed; do not stub twice in files that already stub.)

Add to `src/chrome/ModelPicker.test.ts` after the existing grouping test:

```ts
  it("orders provider groups by the saved provider order", () => {
    localStorage.setItem(
      "monocode.providerOrder",
      JSON.stringify(["opencode", "grok", "claude"]),
    );
    for (const harness of HARNESSES) setHarnessModelsEnabled(harness, true);
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "grok",
          model: "grok:grok-4.6",
          values: { effort: "high" },
          onChange: vi.fn(),
          onSettingsChange: vi.fn(),
        }),
      ),
    );
    const list = openModelsList();
    const providers = [
      ...(list?.querySelectorAll<HTMLButtonElement>("[data-provider-harness]") ?? []),
    ].map((el) => el.getAttribute("data-provider-harness"));
    expect(providers).toEqual(["opencode", "grok", "claude"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/models.test.ts src/lib/secondOpinion.test.ts src/chrome/ModelPicker.test.ts`
Expected: FAIL for the three new cases (order still fixed).

- [ ] **Step 3: Implement the consumer changes**

In `src/chrome/ModelPicker.tsx`, add the subscription next to the existing ones (`ModelPicker.tsx:377-382`) and change the memo:

```tsx
  const providerOrder = useSyncExternalStore(
    subscribeProviderOrder,
    getProviderOrderSnapshot,
    getProviderOrderSnapshot,
  );
```

```tsx
  const pickerHarnesses = useMemo(() => {
    void visibilityVersion;
    void providerOrder;
    return orderedHarnesses((id) => isPickerProviderVisible(id));
  }, [providerOrder, visibilityVersion]);
```

with the import:

```tsx
import {
  getProviderOrderSnapshot,
  orderedHarnesses,
  subscribeProviderOrder,
} from "../lib/providerOrder";
```

In `src/lib/secondOpinion.ts`, replace the `HARNESSES.filter(...)` source with the ordered list:

```ts
  const others = orderedHarnesses().filter((id) => {
    if (id === from) return false;
    if (!options.visible(id)) return false;
    if (!options.probed) return true;
    return options.installed(id);
  });
```

with the import:

```ts
import { orderedHarnesses } from "./providerOrder";
```

In `src/lib/models.ts`, change only the fallback line of `defaultSessionChoice`:

```ts
  const harness =
    available && !available(preferred)
      ? (orderedHarnesses(available)[0] ?? preferred)
      : preferred;
```

with the import:

```ts
import { orderedHarnesses } from "./providerOrder";
```

Leave `allModels()`/`findModel()` and `HARNESS_ORDER` untouched.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/models.test.ts src/lib/secondOpinion.test.ts src/chrome/ModelPicker.test.ts src/lib/providerOrder.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/chrome/ModelPicker.tsx src/lib/secondOpinion.ts src/lib/models.ts src/lib/models.test.ts src/lib/secondOpinion.test.ts src/chrome/ModelPicker.test.ts
git commit -m "Order provider lists by the saved provider order."
```

---

### Task 3: Reorder UI on Settings → Providers

**Files:**
- Modify: `src/surfaces/SettingsView.tsx` (`ProvidersPage` at 2801-2861, `ProviderRow` at 2863+)
- Create: `src/surfaces/ProvidersOrder.test.ts`
- Modify: `src/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: Task 1's `mergeProviderOrder`, `moveProvider`, `orderedHarnesses`, `saveProviderOrder`, `subscribeProviderOrder`, `getProviderOrderSnapshot`; `useSortable` (`src/hooks/useSortable.ts:51`).
- Produces: `ProvidersPage` renders the rows in the persisted order with a grip and move buttons; dragging persists via `saveProviderOrder`.

- [ ] **Step 1: Write the failing test**

Create `src/surfaces/ProvidersOrder.test.ts` (static markup; the list component is exported for testability):

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvidersOrderList } from "./SettingsView";
import { HARNESS_TITLE } from "../lib/session";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
  localStorage.setItem(
    "monocode.providerOrder",
    JSON.stringify(["pi", "claude", "codex"]),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProvidersOrderList", () => {
  it("renders providers in the saved order with grip and move controls", () => {
    const markup = renderToStaticMarkup(createElement(ProvidersOrderList));
    const pi = markup.indexOf(HARNESS_TITLE.pi);
    const claude = markup.indexOf(HARNESS_TITLE.claude);
    expect(pi).toBeGreaterThan(-1);
    expect(pi).toBeLessThan(claude);
    expect(markup).toContain(`aria-label="Move ${HARNESS_TITLE.pi} down"`);
    expect(markup).toContain(`aria-label="Move ${HARNESS_TITLE.pi} up"`);
    expect(markup).toContain(`aria-label="Reorder ${HARNESS_TITLE.pi}"`);
  });
});
```

Note: add `afterEach` to the vitest import in the test file (the snippet lists it implicitly; the final import line is `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/surfaces/ProvidersOrder.test.ts`
Expected: FAIL because `ProvidersOrderList` is not exported.

- [ ] **Step 3: Implement the list and row changes**

In `src/surfaces/SettingsView.tsx`:

1. Add imports:

```tsx
import { ChevronDown, ChevronUp, GripVertical } from "../chrome/icons";
import { useSortable } from "../hooks/useSortable";
import {
  getProviderOrderSnapshot,
  mergeProviderOrder,
  moveProvider,
  orderedHarnesses,
  saveProviderOrder,
  subscribeProviderOrder,
} from "../lib/providerOrder";
```

(`ChevronDown` may already be imported by the file — check the existing icon import block and avoid duplicates.)

2. Extract the list into an exported component so it is testable without the whole Settings surface, and use it from `ProvidersPage`:

```tsx
export function ProvidersOrderList() {
  const providerOrder = useSyncExternalStore(
    subscribeProviderOrder,
    getProviderOrderSnapshot,
    getProviderOrderSnapshot,
  );
  const providers = useMemo(() => {
    void providerOrder;
    return orderedHarnesses();
  }, [providerOrder]);
  const sortable = useSortable(
    providers,
    (ids) => saveProviderOrder(mergeProviderOrder(ids, providers)),
    { axis: "y" },
  );

  return (
    <div className="flex flex-col gap-3">
      {providers.map((harness, index) => (
        <ProviderRow
          key={harness}
          harness={harness}
          orderIndex={index}
          orderCount={providers.length}
          dragging={sortable.draggingId === harness}
          dropStart={
            sortable.toIndex === index &&
            sortable.fromIndex !== null &&
            sortable.toIndex < sortable.fromIndex
          }
          dropEnd={
            sortable.toIndex === index &&
            sortable.fromIndex !== null &&
            sortable.toIndex > sortable.fromIndex
          }
          itemRef={(el) => sortable.setItemRef(harness, el)}
          onGripPointerDown={(event) =>
            sortable.onItemPointerDown(harness, event)
          }
          onMove={(delta) =>
            saveProviderOrder(moveProvider(providers, harness, delta))
          }
          {...(rowProps?.(harness) ?? {})}
        />
      ))}
    </div>
  );
}
```

3. Keep `ProvidersPage`'s existing state (the current row props are `selectedModel`, `isDefault`, `onDefault`, `onModelChange`) and pass them per harness through `rowProps`. Because the test renders `ProvidersOrderList` without `ProvidersPage`, give `ProviderRow` defaults for the model props: `selectedModel = ""`, `isDefault = false`, `onDefault = () => {}`, `onModelChange = () => {}`. When `selectedModel` is empty the row already resolves through `resolveModel`.

- `ProviderRow` props gain optional defaults: `isDefault = false`, `onDefault = () => {}`, `onModelChange = () => {}`, `selectedModel = ""`, plus the six new required reorder props.
- `ProvidersPage` passes its real values through a small wrapper: render `<ProvidersOrderList />` only for ordering; inside `ProvidersPage`, map the derived props into a context-free prop bag by passing them as an optional `rowProps` prop:

```tsx
export function ProvidersOrderList({
  rowProps,
}: {
  rowProps?: (harness: HarnessId) => {
    selectedModel: string;
    isDefault: boolean;
    onDefault: (harness: HarnessId, model: string) => void;
    onModelChange: (harness: HarnessId, model: string) => void;
  };
} = {}) {
```

In `ProvidersPage`, render:

```tsx
      <ProvidersOrderList
        rowProps={(harness) => ({
          selectedModel: defaultModels[harness],
          isDefault: effectiveChoice.harness === harness,
          onDefault,
          onModelChange,
        })}
      />
```

4. `ProviderRow` render changes (root, lines and controls):

```tsx
  return (
    <section
      ref={itemRef}
      className={`relative rounded-xl border border-content/10 px-4 py-3 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      {dropStart ? (
        <div className="pointer-events-none absolute inset-x-1 -top-1.5 z-20 h-0.5 rounded-full bg-accent" />
      ) : null}
      {dropEnd ? (
        <div className="pointer-events-none absolute inset-x-1 -bottom-1.5 z-20 h-0.5 rounded-full bg-accent" />
      ) : null}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label={t("Reorder {name}", { name: HARNESS_TITLE[harness] })}
            onPointerDown={onGripPointerDown}
            className="grid size-5 cursor-grab place-items-center rounded text-content/35 hover:bg-content/10 hover:text-content active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={t("Move {name} up", { name: HARNESS_TITLE[harness] })}
            disabled={orderIndex === 0}
            onClick={() => onMove(-1)}
            className="grid size-5 place-items-center rounded text-content/35 hover:bg-content/10 hover:text-content disabled:opacity-30"
          >
            <ChevronUp className="size-3" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={t("Move {name} down", { name: HARNESS_TITLE[harness] })}
            disabled={orderIndex === orderCount - 1}
            onClick={() => onMove(1)}
            className="grid size-5 place-items-center rounded text-content/35 hover:bg-content/10 hover:text-content disabled:opacity-30"
          >
            <ChevronDown className="size-3" strokeWidth={2} />
          </button>
        </div>
        <HarnessIcon harness={harness} className="mt-0.5 size-4 shrink-0" />
```

The existing header/content markup stays inside the same flex container.

5. New `ProviderRow` props (with the defaults noted above):

```tsx
  orderIndex: number;
  orderCount: number;
  dragging: boolean;
  dropStart: boolean;
  dropEnd: boolean;
  itemRef: (el: HTMLElement | null) => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (delta: -1 | 1) => void;
```

Import `type PointerEvent as ReactPointerEvent` from `react` if not already imported.

- [ ] **Step 4: Add pt-BR entries**

Add to `src/i18n/pt-BR.ts`:

```ts
  "Reorder {name}": "Reordenar {name}",
  "Move {name} up": "Mover {name} para cima",
  "Move {name} down": "Mover {name} para baixo",
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/surfaces/ProvidersOrder.test.ts src/chrome/ModelPicker.test.ts src/lib/providerOrder.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/surfaces/SettingsView.tsx src/surfaces/ProvidersOrder.test.ts src/i18n/pt-BR.ts
git commit -m "Reorder providers on the Settings page."
```

---

### Task 4: Full checks and manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web suite**

Run: `npm run check:web`
Expected: all vitest files pass and `tsc --noEmit` is clean.

- [ ] **Step 2: Manual verification**

With the app in dev mode:

1. Open Settings → Providers; drag a provider by its grip to the top and confirm the whole list follows while dragging (dimmed row, insertion line).
2. Reorder the same provider with the move-up/move-down buttons; confirm they are disabled at the ends.
3. Switch to the composer’s model picker and confirm the provider groups follow the new order.
4. Open a handoff or second-opinion menu and confirm the provider order matches.
5. With the explicit default provider cleared in Settings, create a new session and confirm the fallback provider is the first of the user order; set an explicit default and confirm it still wins.
6. Restart the app and confirm the order persisted in all three places.

- [ ] **Step 3: Report**

Summarize the commands run and the manual results; do not claim the manual pass if it was not performed.

---

## Self-review notes

- Spec coverage: store and merge rules (Task 1), every consumer listed in the spec (Task 2 for `ModelPicker`, `secondOpinionTargets`, `defaultSessionChoice`; Task 3 for the Settings list), grip + keyboard reorder and insertion feedback (Task 3), i18n (Task 3), tests and manual verification (Tasks 1-4).
- Deliberate deviation from the spec's suggestion to reuse `orderByIds`/`mergeOrderedSubset`: those helpers take `{ id }` objects, while the provider list is plain `HarnessId` strings, so Task 1 implements the equivalent merge locally and tests it.
- Type consistency: `mergeProviderOrder`, `moveProvider`, `orderedHarnesses`, `saveProviderOrder`, `subscribeProviderOrder`, and `getProviderOrderSnapshot` keep the same names and signatures across Tasks 1-3.
