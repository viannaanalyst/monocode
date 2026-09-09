# Action button tooltips design

## Goal

Improve the discoverability and feedback of action/icon buttons throughout MonoCode. Existing accessible labels must remain intact, tooltips should appear faster than the browser's native `title` tooltip, and enabled buttons in the title bar—including the terminal action in the upper-right—must use the pointer cursor.

## Scope

- Cover action and icon buttons that currently expose a `title` and/or `aria-label`.
- Keep `aria-label` on the interactive element for screen readers and keyboard users.
- Avoid showing tooltips for inputs, ordinary text content, separators, or disabled controls unless an existing disabled explanation is explicitly provided.
- Preserve existing keyboard activation, drag-region behavior, menus, and popover behavior.
- Do not modify session storage, conversation data, or provider behavior.

## Design

Add one shared tooltip layer in the React frontend. It will use the hovered or focused action button as its anchor and render a single fixed-position tooltip surface near that control. The layer will read the existing visible label source (`title` first, then `aria-label`) so existing components remain the source of truth and labels do not need to be duplicated.

Tooltip behavior:

- Open after approximately 160ms on pointer hover.
- Open on keyboard focus, with the same positioning and no reliance on native `title` timing.
- Close immediately when the control is left, blurred, disabled, or the pointer enters an unrelated surface.
- Keep the tooltip non-interactive with `pointer-events: none`.
- Use a compact dark surface with the existing content/background tokens, subtle border, small shadow, readable 11–12px text, and a short fade/translate entrance under 200ms.
- Clamp long labels and keep the tooltip within the viewport.
- Respect reduced-motion preferences.

The implementation will suppress duplicate native `title` behavior for managed controls while preserving the label as the tooltip source and retaining `aria-label` for accessibility.

## Cursor behavior

The title-bar drag-region CSS currently forces `cursor: default !important` on every button. Narrow that exception so enabled buttons use `cursor: pointer`, while disabled controls and non-button drag-region surfaces keep their existing cursor behavior. The shared `IconButton` primitive will also explicitly express the enabled/disabled cursor states.

## Testing and verification

- Add unit tests for tooltip label selection, delay/cancellation, and disabled behavior where practical.
- Run the existing web test suite and TypeScript check.
- Run a production frontend build.
- Manually verify title-bar actions, the upper-right terminal button, terminal dock actions, sidebar actions, keyboard focus, disabled buttons, and long labels.
- Confirm the existing pointer-cursor commit remains unchanged and create a separate commit for this feature.
