# Action Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast, consistent tooltips for existing action/icon controls while preserving accessibility and make enabled title-bar actions, including the upper-right terminal button, use the pointer cursor.

**Architecture:** Add one delegated `TooltipLayer` mounted by the React app. It listens for pointer and keyboard focus on `button`, links, and role-button controls that already expose `title` or `aria-label`, temporarily suppresses native `title`, and renders one fixed tooltip through a portal. Existing components remain the label source; `aria-label` is retained.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, Vitest, happy-dom, Tauri 2.

## Global Constraints

- Preserve `aria-label` on interactive elements.
- Open after approximately 160ms on pointer hover or keyboard focus.
- Close when the control is left, blurred, disabled, or the pointer enters an unrelated surface.
- Keep the tooltip non-interactive with `pointer-events: none`.
- Use existing background/content tokens, subtle border, small shadow, 11–12px text, and entrance feedback under 200ms.
- Clamp long labels, keep the tooltip inside the viewport, and respect reduced motion.
- Do not change session storage, conversation data, provider behavior, or the existing pointer-cursor commit.

---

### Task 1: Add pure tooltip targeting and positioning helpers

**Files:**
- Create: `src/chrome/Tooltip.tsx`
- Test: `src/chrome/Tooltip.test.ts`

**Interfaces:**
- `tooltipText(element: Element): string | null`
- `isTooltipTarget(element: Element): element is HTMLElement`
- `tooltipPosition(anchor: DOMRect, tooltip: { width: number; height: number }, viewport: { width: number; height: number }, gap?: number): { left: number; top: number; placement: "top" | "bottom" }`
- `TooltipLayer({ children }: { children: ReactNode }): JSX.Element`

- [ ] **Step 1: Write failing helper tests**

Add tests for title precedence, aria-label fallback, disabled rejection, and viewport clamping:

```ts
it("prefers title over aria-label", () => {
  const button = document.createElement("button");
  button.title = "New Terminal";
  button.setAttribute("aria-label", "Open terminal");
  expect(tooltipText(button)).toBe("New Terminal");
});

it("falls back to aria-label and ignores disabled controls", () => {
  const button = document.createElement("button");
  button.setAttribute("aria-label", "Settings");
  expect(tooltipText(button)).toBe("Settings");
  button.disabled = true;
  expect(isTooltipTarget(button)).toBe(false);
});

it("keeps tooltip coordinates inside the viewport", () => {
  const result = tooltipPosition(new DOMRect(2, 740, 24, 24), { width: 120, height: 28 }, { width: 800, height: 768 });
  expect(result.left).toBeGreaterThanOrEqual(8);
  expect(result.top).toBeGreaterThanOrEqual(8);
  expect(result.top + 28).toBeLessThanOrEqual(760);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npx vitest run src/chrome/Tooltip.test.ts`. Expected: FAIL because the module and exports do not exist yet.

- [ ] **Step 3: Implement the helper functions**

Use `title.trim()` first and `aria-label.trim()` second. Accept enabled `HTMLButtonElement`, anchors, and `[role="button"]`; reject disabled, `aria-disabled="true"`, `aria-hidden="true"`, and empty labels. Position below the anchor when possible, otherwise above, with an 8px viewport inset and gap.

- [ ] **Step 4: Run the focused test and verify it passes**

Run `npx vitest run src/chrome/Tooltip.test.ts`. Expected: PASS for every helper test.

- [ ] **Step 5: Commit the helper contract**

```bash
git add src/chrome/Tooltip.tsx src/chrome/Tooltip.test.ts
git commit -m "Add tooltip targeting helpers"
```

### Task 2: Implement the delegated tooltip layer

**Files:**
- Modify: `src/chrome/Tooltip.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `TooltipLayer` listens at document level and renders one portal tooltip with `role="tooltip"` and `aria-hidden="true"`.
- It consumes the helpers from Task 1 and exposes no new app state.

- [ ] **Step 1: Add the interaction state machine**

Register capturing `pointerover`, `pointerout`, `focusin`, and `focusout` listeners. Track the current target, label, anchor rectangle, open state, and one timeout. Ignore transitions whose `relatedTarget` remains inside the same target. Use a 160ms timer for hover and focus, cancel on leave/blur, and close if the target becomes disabled.

- [ ] **Step 2: Suppress duplicate native titles safely**

When a candidate becomes active, save its `title` in a `WeakMap<HTMLElement, string>`, remove the DOM `title`, and use `tooltipText` for the custom layer. Restore the title when neither pointer nor focus remains. Never remove or modify `aria-label`.

- [ ] **Step 3: Render and position the tooltip**

Render through `createPortal(..., document.body)`. Measure with a ref in `useLayoutEffect`, apply `tooltipPosition`, use `pointer-events-none`, clamp text width, and use existing background/content tokens. Add opacity/translate entrance feedback capped at 160ms and disable transform transition under reduced motion.

- [ ] **Step 4: Test timer behavior**

Extend `src/chrome/Tooltip.test.ts` with fake timers: hover opens after 160ms, leaving before 160ms does not open, focus opens, and `title` is restored after leaving. Run `npx vitest run src/chrome/Tooltip.test.ts`; expected: all tooltip tests pass.

- [ ] **Step 5: Commit the tooltip layer**

```bash
git add src/chrome/Tooltip.tsx src/chrome/Tooltip.test.ts src/index.css
git commit -m "Add fast shared action tooltips"
```

### Task 3: Mount the layer and fix title-bar cursor behavior

**Files:**
- Modify: `src/App.tsx:5300` (root render)
- Modify: `src/chrome/TitleBar.tsx:394-430` (`IconButton`)
- Modify: `src/index.css:344-349` (drag-region cursor rules)
- Test: `src/chrome/TitleBar.test.ts`

**Interfaces:**
- App renders `<TooltipLayer>` around the existing layout.
- `IconButton` keeps its current label, aria-label, disabled handling, and click behavior while adding explicit cursor classes.

- [ ] **Step 1: Mount `TooltipLayer`**

Import `TooltipLayer` in `App.tsx` and wrap the existing top-level layout. Do not move session state or alter callbacks.

- [ ] **Step 2: Fix `IconButton` cursor states**

Add `cursor-pointer` to the enabled branch and `cursor-default` to the disabled branch. Keep `title`, `aria-label`, and `aria-disabled` unchanged.

- [ ] **Step 3: Narrow the title-bar drag exception**

Keep non-button drag surfaces on the default cursor and add this later rule so enabled title-bar actions win over the drag-region rule:

```css
header[data-tauri-drag-region] button:not(:disabled) {
  cursor: pointer !important;
}
```

- [ ] **Step 4: Add a focused regression assertion**

Extend `src/chrome/TitleBar.test.ts` to assert that the title-bar terminal action retains its label and renders enabled when its callback is supplied.

- [ ] **Step 5: Run web checks**

Run `npm run check:web`. Expected: Vitest and TypeScript finish with exit code 0.

- [ ] **Step 6: Commit the integration**

```bash
git add src/App.tsx src/chrome/TitleBar.tsx src/chrome/TitleBar.test.ts src/index.css
git commit -m "Enable tooltips and pointer cursors across actions"
```

### Task 4: Build and manually verify the complete surface

**Files:**
- Verify: `src/chrome/Tooltip.tsx`
- Verify: `src/chrome/TitleBar.tsx`
- Verify: `src/surfaces/ProjectTerminalDock.tsx`
- Verify: `src/chrome/WindowControls.tsx`
- Verify: `src/index.css`

- [ ] **Step 1: Build the frontend**

Run `npm run build`. Expected: Vite exits with code 0; existing chunk-size warnings are acceptable if there are no build errors.

- [ ] **Step 2: Start the custom app**

Run `npm run tauri dev`. Expected: the development window opens without changing the session database.

- [ ] **Step 3: Verify title-bar actions**

Hover and keyboard-focus search, new session, terminal, settings, tab close, tab scroll, and window controls. Confirm the tooltip appears after roughly 160ms, uses the custom dark surface, stays inside the window, and the enabled terminal button shows the pointer cursor.

- [ ] **Step 4: Verify terminal actions**

Open the terminal dock and check New Terminal, Move Terminal, and Hide Terminal. Confirm consistent tooltips, fast appearance, and pointer cursor on enabled actions.

- [ ] **Step 5: Verify accessibility and edge cases**

Tab through icon-only controls, confirm focus opens the tooltip, confirm disabled controls do not show an actionable tooltip, check long labels near screen edges, and confirm `aria-label` remains present in the DOM.

- [ ] **Step 6: Inspect final repository state**

Run:

```bash
git diff --check
git status --short --branch
git log -4 --oneline --decorate
```

Expected: no whitespace errors, only intended commits ahead of `origin/custom`, and no conversation/database files tracked or modified.
