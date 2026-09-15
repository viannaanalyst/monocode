# Agent provider ordering — design

## Goal

Let the user reorder agent providers on Settings → Providers, and have that order apply everywhere providers are listed: the Settings page, the model picker/composer, and the handoff/second-opinion provider menus.

## Scope

In scope:

- A persisted provider order (localStorage, reactive), merged safely with the fixed `HARNESSES` array.
- Reordering on Settings → Providers by dragging a grip handle, plus keyboard-accessible move up/down buttons.
- All provider listing surfaces consume the new order.
- `defaultSessionChoice` keeps an explicit default as the winner; the user's order only decides the fallback when no default is set.

Out of scope:

- Per-project provider order.
- Reordering models inside a provider (model visibility toggles already exist).
- Keyboard-only drag with screen-reader announcements beyond labeled move buttons.
- Changing `allModels()`/`findModel()` resolution order, which stays fixed for ID lookups.

## Design

### State (`src/lib/providerOrder.ts`, new)

Mirror the reactive store pattern already used for picker visibility in `src/lib/models.ts` (`pickerVisibilityVersion` + listeners + `useSyncExternalStore`).

- `PROVIDER_ORDER_KEY = "monocode.providerOrder"`; `loadProviderOrder(): HarnessId[]` validates the stored value (array of strings, filtered through `HARNESSES`, deduped) and falls back to `HARNESSES`.
- `saveProviderOrder(ids: readonly HarnessId[]): void` persists and bumps a version, notifying subscribers; a `storage` listener covers other windows, like `models.ts`.
- `subscribeProviderOrder()/getProviderOrderSnapshot()` for `useSyncExternalStore`.
- `mergeProviderOrder(saved, available)`: keep `saved` ids present in `available` (deduped), then append the remaining `available` entries in default `HARNESSES` order. New providers land at the end; removed ids drop out. This is the only merge rule, so any stored state stays valid across releases.
- `orderedHarnesses(available?: (harness: HarnessId) => boolean): HarnessId[]` returns `mergeProviderOrder(loadProviderOrder(), HARNESSES.filter(available ?? (() => true)))`.

### Consumers

- `src/surfaces/SettingsView.tsx:2844` — `HARNESSES.map(...)` becomes `orderedHarnesses().map(...)`.
- `src/chrome/ModelPicker.tsx:438` — `pickerHarnesses` becomes `orderedHarnesses(isPickerProviderVisible)`, which orders both the composer and picker provider groups.
- `src/lib/secondOpinion.ts:91` — `secondOpinionTargets` filters from `orderedHarnesses()` instead of `HARNESSES`, ordering the handoff/second-opinion/build menus.
- `src/lib/models.ts:774` — `defaultSessionChoice`: the explicit default (`loadLastModelChoice()?.harness`) still wins; when it is unset or unavailable, the fallback becomes the first of `orderedHarnesses(available)` instead of the fixed `HARNESSES` order.
- `allModels()`/`findModel()` keep iterating the fixed `HARNESS_ORDER`.

### Reordering UI (Settings → Providers)

- Each `ProviderRow` gets a grip button on the left that initiates the drag through `useSortable(ids, onReorder, { axis: "y" })` (`src/hooks/useSortable.ts:51`), matching the folder reorder in `src/chrome/Sidebar.tsx:550`. Interactive controls inside the row (toggles, selects, custom-model inputs, visibility list) get `data-no-drag` so a press there never starts a drag.
- Insertion feedback reuses the hook's `draggingId`/`fromIndex`/`toIndex`: the dragged row is dimmed and an insertion line shows where it will land.
- Keyboard path: each row has labeled "Move up"/"Move down" buttons (e.g. `aria-label="Move {provider} up"`), disabled at the ends, calling the same reorder commit as the drag.
- `onReorder` persists with `saveProviderOrder`, so Settings, the picker, and the menus update immediately without a remount.

## Testing and verification

- Vitest for `providerOrder.ts`: merge rules (saved order wins, new providers appended at the end, unknown ids dropped, duplicates removed), persistence round-trip, and `orderedHarnesses` with an availability filter.
- Component tests: extend `src/chrome/ModelPicker.test.ts` (which already asserts provider order via `[data-provider-harness]`) with a saved custom order; add a static-markup test for the Providers list (grip and move buttons present, order follows the store).
- Manual verification: drag a provider by its grip, reorder with the move buttons, confirm Settings + picker + handoff menu all reflect the order, that the explicit default provider is unchanged, and that the order persists across a restart.
- Run `npm run check:web` before considering the feature done.
