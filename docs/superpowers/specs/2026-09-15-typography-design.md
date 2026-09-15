# Typography standardization — design

## Goal

Standardize MonoCode's typography app-wide to match Synara's system: one weight per role, one size per level, consistent icon sizes, the system UI font plus Cal Sans for titles and JetBrains Mono for code, and a divider above the Settings row in the rail.

## Evidence

Extracted from the installed Synara app (`/Applications/Synara.app` → `app.asar` → compiled CSS/JS):

- UI font: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` (system UI; SF Pro on macOS).
- Display font: `"Cal Sans", <UI font>`, used in exactly one place — the sidebar surface title at **17px**.
- Mono font: `"JetBrains Mono Variable", "JetBrains Mono", "SF Mono", …`.
- Scale (Tailwind v4): `text-xs` 12/16, `text-sm` 14/20, `text-base` 16/24; badges at 10px.
- Weights: 400 normal, 500 medium, 600 semibold, 700 bold.
- Sidebar items: same component and same weight for every item; icons `size-3.5` (14px); active state is a background, never a weight change. Section labels ("Projects", "Chats") are muted and smaller.
- Settings: rows with 10px vertical padding, 600 titles, muted 12px descriptions; rail footer has a top border above "Settings".

MonoCode today: system UI font already matches, but the scale is ad-hoc (`text-[12px]` ×306, `text-[11px]` ×221, `text-[13px]` ×143, `text-[10px]` ×44), weights are mixed (`font-medium` ×93, `font-semibold` ×45, `font-bold` ×2), icon sizes drift (`size-2`…`size-4` in text rows), and there is no display or bundled mono font.

## Scope

In scope:

- Bundle Cal Sans and JetBrains Mono, wire them through theme tokens, and keep the system UI font.
- A four-level type scale with a fixed role→size→weight table, applied across every surface.
- Icon-size standardization inside text rows.
- A top border above the Settings row in the rail.
- A source-scanning guard test that fails when the retired patterns come back.

Out of scope:

- Layout, spacing, color, and component behavior changes beyond what the size shift naturally causes.
- Redesigning icons, adding new icons, or changing the icon set.
- User-selectable UI fonts (the existing theme font settings, if any, keep working); this change only sets defaults.
- Synara's "?" footer button: MonoCode keeps its existing shortcut on the right instead.

## Design

### Fonts

- `public/fonts/` gains: `cal-sans-latin-400-normal.woff2`, `jetbrains-mono-latin-400-normal.woff2`, `jetbrains-mono-latin-600-normal.woff2` (all OFL-1.1), downloaded from `@fontsource/cal-sans@5.3.0` and `@fontsource/jetbrains-mono@5.3.0` on jsDelivr, with the two OFL license texts copied alongside. Only the `latin` subset is bundled: it already covers Portuguese accents, and fontsource's `latin.css` faces carry no `unicode-range`, so merging latin-ext would require hand-writing ranges for no gain.
- `src/index.css` declares `@font-face` blocks (one per file, `font-display: swap`) and updates the theme tokens: `--font-display: "Cal Sans", var(--font-sans)` and `--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`. `--font-sans` stays the system stack.
- The app's font layer (`src/lib/fonts.ts`) overrides `--font-mono` at boot with its own fallback stack, so `MONO_FALLBACK` there must also start with `"JetBrains Mono"`; otherwise the CSS token never wins. The user's font settings keep overriding both stacks when set.
- Cal Sans applies only to top-level surface titles (Kanban, Automations, Inbox, Notes, Settings) at `text-display` with `font-display`; nothing else uses it. Search has no surface title (its header is the input), so it never uses Cal Sans. JetBrains Mono replaces the mono default everywhere (`font-mono`, code blocks, diffs, terminals).
- `NOTICE` notes both fonts and their license.

### Type scale and weights

Theme tokens in `src/index.css`:

- `--text-sm: 0.875rem` / `--text-sm--line-height: 1.25rem` (14/20) — the base UI size.
- `--text-xs: 0.75rem` / `--text-xs--line-height: 1rem` (12/16) — secondary.
- `--text-2xs: 0.625rem` / `--text-2xs--line-height: 0.875rem` (10/14) — badges.
- `--text-display: 1.0625rem` / `--text-display--line-height: 1.375rem` (17/22) — surface titles with `font-display`.

Migration mapping from the current arbitrary values:

| Current | Becomes | Role |
| --- | --- | --- |
| `text-[13px]`, `text-sm` | `text-sm` (14) | nav, lists, buttons, inputs, settings rows |
| `text-[12px]`, `text-xs` | stays (12) | descriptions, metadata, hints, timestamps; the literal equals the `xs` token, so it is not renamed |
| `text-[11px]` | `text-xs` (12) | same as above; no 11px level survives |
| `text-[10px]`, `text-[9px]` | `text-2xs` (10) | counts, tags, pills |
| `text-[20px]`, `text-[22px]` titles | `text-display` (17) | surface titles only |

Other literals at 16px or above, plus `text-lg`/`text-2xl`, are reviewed case by case in their wave: surface titles become `text-display`; anything else drops to the role table (14 or 12).

Weight roles:

- **400** — body text, navigation items, list rows, descriptions. The active row is a background change only.
- **500** — buttons, actions, select/segmented values, badge text.
- **600** — settings row titles, card titles, modal/dialog titles, surface section headings.
- **700** — retired; `font-bold` is banned.

Line height follows the token pairs; `leading-none` is only allowed on badges/gutters with an explicit comment, `leading-tight`/`leading-relaxed` are replaced by the token line heights.

### Icons

- Default inline icon = **14px** (`size-3.5`) in rail items, list rows, buttons, menus, tooltips, and settings rows.
- **16px** (`size-4`) is allowed only for surface-level headers, empty states, and prominent toolbar actions.
- `size-3`, `size-2.5`, `size-2` are retired inside text rows. Identity marks keep their sizing as documented exceptions: project mascots and the color-swatch glyph (`size-2`), `FileTypeIcon size={16}` and `ModelBrandIcon size-4` brand marks, the 12px status glyphs aligned to the `w-3` spinner box in `OrchestrationSidebarAgents`, and status dots at `size-1.5` (the app's dot idiom).
- Icons inheriting color from `currentColor` keep doing so; no color changes.

### Rail footer

The Settings row in `ProjectRail` gains a `border-t border-content/10` divider (plus the padding the current layout needs) so it reads as the footer, matching the Synara print; the shortcut label stays on the right.

### Guard test

`src/typography.test.ts` scans `src/**/*.tsx`/`*.css` (the pattern used by `src/chrome/icons.test.ts`) and fails on:

- any arbitrary text size other than the two literals the scale keeps (`text-[12px]`, `text-[10px]`) — this catches the retired odd sizes (13, 11, 9, 12.5, 11.5, 10.5) plus outliers like 7px and 22px
- `font-bold`
- `size-2.5` anywhere, and `size-2` outside a three-entry allowlist (`chrome/ProjectRail.tsx` for project mascots, `chrome/RailAction.tsx` for the decorative status dot, and `chrome/ColorPickerPopover.tsx` for the glyph inside a color swatch)

The text and weight rules ship with an empty allowlist; the icon rule keeps only the mascot exception, documented inline in the test.

The guard ships after the migration waves.

## Application waves

Each wave is a task in the implementation plan and touches only its area:

1. Foundation: font files, `@font-face`, tokens, `NOTICE`.
2. Rail and chrome: `ProjectRail`, `RailAction`, `Sidebar` (session cards, folders), `SessionHoverCard`, `TitleBar`/`OverlayNav`, `MenuBar`, `Tooltip`.
3. Settings: `SettingsView` primitives and pages, `SettingsRail`, `CustomModelsSection`, `ModelSettings`.
4. Composer and transcript: `Composer`, `AgentTranscript` and its banners/menus, `QuestionForm`, `ApprovalToasts`, `PlanPreview`, `SessionActivity`, `SecondOpinionButton` cards, `HandoffMiniCard`.
5. Surfaces: `InboxView` and its subcomponents, `KanbanView`, `AutomationsView`, `NotesView`, `SearchView`, `EmptySession`, `AstraWelcome`.
6. Diffs, editor, and terminals: `UnifiedDiffView`, `FilePane`/`FileEditor` chrome, `GitChangesPanel`, `GitHistoryGraph`, `WorkingTreeDiff`, `InboxPrDiff`, `TerminalView`, `ProjectTerminalDock`, `BrowserView`, `DiffCommentComposer`.
7. Guard test, full checks, manual verification.

## Testing and verification

- The existing suite stays green after each wave (`npm run check:web`), since most component tests assert markup text, not classes; any test that asserted a migrated class is updated in its wave.
- The guard test is added last and must pass (only the documented mascot exception remains).
- Manual verification per wave: rail legibility at 14px, settings rows with 600/12 hierarchy, badges at 10px, Cal Sans only on surface titles, JetBrains Mono in code/diff/terminal, and the new footer divider.
- Final manual pass: switch the app to pt-BR and check no layout clipping from the size shifts (long labels in the rail, settings selects, composer chips).
