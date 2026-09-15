# Typography Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize MonoCode's typography app-wide to the Synara system: system UI font plus bundled Cal Sans (surface titles) and JetBrains Mono (code), a 14/12/10 scale, one weight per role, consistent icon sizes, and a divider above the Settings row.

**Architecture:** A foundation task bundles the two fonts and adds theme tokens (`--font-display`, `--text-display`, `--text-2xs`, updated `--font-mono` and the runtime `MONO_FALLBACK` in `src/lib/fonts.ts`). Six sweep tasks then migrate every area (chrome, settings, composer/transcript, surfaces, diffs/editor/terminal) to the scale and weight roles. A final source-scanning guard test prevents the retired patterns from returning.

**Tech Stack:** Tailwind v4 `@theme` tokens in `src/index.css`, woff2 assets under `public/fonts/`, React + TypeScript, vitest.

## Global Constraints

- No new dependencies; the fonts are static assets under `public/fonts/`, referenced as `/fonts/<file>` (mirrors `/monocode.png`) and allowed by the existing CSP (`font-src 'self' data:`).
- Scale: base **14px** (`text-sm`), secondary **12px** (`text-xs`), badge **10px** (`text-2xs`), surface title **17px** (`text-display` with `font-display`).
- Weight roles: **400** body/nav/list rows (active state is a background change only), **500** buttons/actions/values, **600** settings row titles, card titles, modal titles and surface section headings. **700 is retired.**
- Icon sizes inside text rows: default **14px** (`size-3.5`); **16px** (`size-4`) only for surface headers, empty states and prominent toolbar actions. `size-2.5` is retired; `size-2` stays only on project mascots.
- Migration mapping: `text-[13px]`→`text-sm`, `text-[11px]`→`text-xs`, `text-[10px]`→`text-2xs`, `text-[9px]`→`text-2xs`; `text-[12px]` stays as a literal (it already equals `text-xs`, and renaming 306 call sites buys nothing); `font-bold`→`font-semibold`; `leading-tight`/`leading-relaxed` give way to the token line heights; `leading-none` stays only on badges/gutters.
- User font settings (`src/lib/fonts.ts`) keep overriding the stacks when set; this plan only changes the defaults.
- English strings are the i18n keys; no copy changes.
- Commit messages follow the repo style: imperative sentence ending with a period.
- Run `npm run check:web` at the end of every task.

---

### Task 1: Foundation — bundle the fonts and add the tokens

**Files:**
- Create: `public/fonts/cal-sans-latin-400-normal.woff2`, `public/fonts/jetbrains-mono-latin-400-normal.woff2`, `public/fonts/jetbrains-mono-latin-600-normal.woff2`, `public/fonts/cal-sans-OFL.txt`, `public/fonts/jetbrains-mono-OFL.txt`
- Modify: `src/index.css` (theme tokens + `@font-face` blocks)
- Modify: `src/lib/fonts.ts` (`MONO_FALLBACK`)
- Modify: `NOTICE`

**Interfaces:**
- Produces: the `font-display`, `text-display`, and `text-2xs` utilities plus the JetBrains Mono default used by every later task.

- [ ] **Step 1: Download the font files and licenses**

```bash
mkdir -p public/fonts
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/cal-sans@5.3.0/files/cal-sans-latin-400-normal.woff2" -o public/fonts/cal-sans-latin-400-normal.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-400-normal.woff2" -o public/fonts/jetbrains-mono-latin-400-normal.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-600-normal.woff2" -o public/fonts/jetbrains-mono-latin-600-normal.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/cal-sans@5.3.0/LICENSE" -o public/fonts/cal-sans-OFL.txt
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/LICENSE" -o public/fonts/jetbrains-mono-OFL.txt
```

Verify each woff2 is a real font file:

```bash
file public/fonts/*.woff2
```

Expected: `Web Open Font Format (Version 2)` for all three.

- [ ] **Step 2: Declare the faces and update the tokens in `src/index.css`**

At the top of the file (before `@import "tailwindcss";` is not possible; place the `@font-face` blocks right after the `@custom-variant` line):

```css
@font-face {
  font-family: "Cal Sans";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/cal-sans-latin-400-normal.woff2") format("woff2");
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2");
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/jetbrains-mono-latin-600-normal.woff2") format("woff2");
}
```

Inside the existing `@theme` block, add the display and badge tokens and update the mono token:

```css
  --font-display: "Cal Sans", var(--font-sans);
  --text-display: 1.0625rem;
  --text-display--line-height: 1.375rem;
  --text-2xs: 0.625rem;
  --text-2xs--line-height: 0.875rem;
```

and change `--font-mono` to:

```css
  --font-mono:
    "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
```

- [ ] **Step 3: Make JetBrains Mono the runtime default in `src/lib/fonts.ts`**

The app overrides `--font-mono` at boot from `codeFontStack("")`, so the fallback string is what actually ships:

```ts
const MONO_FALLBACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
```

`SANS_FALLBACK` stays as is. `src/lib/fonts.test.ts:55` asserts `codeFontStack("").toContain("ui-monospace")`, which this keeps true; run the file to confirm.

- [ ] **Step 4: Note the licenses in `NOTICE`**

Add a short section listing both fonts, their upstream (Cal.com / JetBrains) and `OFL-1.1`, pointing at the license files under `public/fonts/`.

- [ ] **Step 5: Verify the bundle carries the fonts**

Run: `npx vite build` and then `ls dist/fonts`
Expected: the three woff2 files and two license texts are copied.

Then run: `npx vitest run src/lib/fonts.test.ts && npm run check:web`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add public/fonts src/index.css src/lib/fonts.ts NOTICE
git commit -m "Bundle Cal Sans and JetBrains Mono."
```

---

### Task 2: Sweep the rail and top chrome

**Files:** `src/chrome/ProjectRail.tsx`, `src/chrome/RailAction.tsx`, `src/chrome/Sidebar.tsx`, `src/chrome/SessionHoverCard.tsx`, `src/chrome/TitleBar.tsx`, `src/chrome/MenuBar.tsx`, `src/chrome/Tooltip.tsx`, `src/chrome/UpdateRailCard.tsx`, `src/chrome/UsageFooter.tsx`, `src/chrome/ProjectSearch.tsx`, `src/chrome/FileTree.tsx`, `src/chrome/ExplorerMenu.tsx`, `src/chrome/RightDockTypeBar.tsx`, `src/chrome/RightPanelPicker.tsx`, `src/chrome/SurfaceTabs.tsx`, `src/chrome/SessionFolderPicker.tsx`, `src/chrome/SessionFiltersMenu.tsx`, `src/chrome/SessionsEmpty.tsx`, `src/chrome/SidebarUpdate.tsx`, `src/chrome/Modal.tsx`

**Interfaces:**
- Consumes: Task 1's `text-2xs`, `font-display`, `text-display`, and the JetBrains Mono default.
- Produces: no new exports; the rail and chrome follow the scale.

- [ ] **Step 1: Apply the mapping**

For every file above, replace per the global mapping. Area-specific rules:

- Rail items (`RailAction`, project rows, session rows): label `text-sm`, weight 400 — remove `font-medium`/`font-semibold` from the label; keep the active state as `bg-content/10` (no weight change).
- Live agent card (`ProjectRail.tsx` `LiveAgentCard`): title `text-sm` weight 400 (it is a list row), activity/section rows stay `text-xs`.
- Section headers ("Fixadas"/"Projetos"): `text-xs` weight 400, muted (they already read that way; only the size token changes).
- Counters/badges (agent count, unread badges, usage numbers): `text-2xs` weight 500 (badge) or 400 (plain numeric metadata).
- Tooltips (`Tooltip.tsx`): `text-xs`.
- `SessionHoverCard`: title `text-sm` weight 500 (it is a hover card title), metadata `text-xs`.
- Mascots keep `size-2`; all other inline icons become `size-3.5`; remove every `size-2.5`.
- The Settings row in `ProjectRail` gains the footer divider: wrap it with the existing container and add `border-t border-content/10` plus the padding the row needs, keeping the shortcut label on the right.

- [ ] **Step 2: Review in the running app (or static markup tests)**

Run: `npx vitest run src/chrome/RightDockTypeBar.test.ts src/chrome/ProjectRail.test.ts src/chrome/Tooltip.test.ts src/chrome/FileTree.test.ts src/chrome/SessionHoverCard.test.ts`
Expected: green (update any assertion that quoted a migrated class).

- [ ] **Step 3: Acceptance greps**

Run each and expect no output:

```bash
grep -rnE 'text-\[(13|11|10|12\.5|11\.5|10\.5|9)px\]' src/chrome/ProjectRail.tsx src/chrome/RailAction.tsx src/chrome/Sidebar.tsx src/chrome/SessionHoverCard.tsx src/chrome/TitleBar.tsx src/chrome/MenuBar.tsx src/chrome/Tooltip.tsx src/chrome/UpdateRailCard.tsx src/chrome/UsageFooter.tsx src/chrome/ProjectSearch.tsx src/chrome/FileTree.tsx src/chrome/ExplorerMenu.tsx src/chrome/RightDockTypeBar.tsx src/chrome/RightPanelPicker.tsx src/chrome/SurfaceTabs.tsx src/chrome/SessionFolderPicker.tsx src/chrome/SessionFiltersMenu.tsx src/chrome/SessionsEmpty.tsx src/chrome/SidebarUpdate.tsx src/chrome/Modal.tsx
grep -rn 'font-bold\|size-2\.5' src/chrome/ProjectRail.tsx src/chrome/RailAction.tsx src/chrome/Sidebar.tsx src/chrome/SessionHoverCard.tsx src/chrome/TitleBar.tsx src/chrome/MenuBar.tsx src/chrome/Tooltip.tsx src/chrome/UpdateRailCard.tsx src/chrome/UsageFooter.tsx src/chrome/ProjectSearch.tsx src/chrome/FileTree.tsx src/chrome/ExplorerMenu.tsx src/chrome/RightDockTypeBar.tsx src/chrome/RightPanelPicker.tsx src/chrome/SurfaceTabs.tsx src/chrome/SessionFolderPicker.tsx src/chrome/SessionFiltersMenu.tsx src/chrome/SessionsEmpty.tsx src/chrome/SidebarUpdate.tsx src/chrome/Modal.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/chrome/ProjectRail.tsx src/chrome/RailAction.tsx src/chrome/Sidebar.tsx src/chrome/SessionHoverCard.tsx src/chrome/TitleBar.tsx src/chrome/MenuBar.tsx src/chrome/Tooltip.tsx src/chrome/UpdateRailCard.tsx src/chrome/UsageFooter.tsx src/chrome/ProjectSearch.tsx src/chrome/FileTree.tsx src/chrome/ExplorerMenu.tsx src/chrome/RightDockTypeBar.tsx src/chrome/RightPanelPicker.tsx src/chrome/SurfaceTabs.tsx src/chrome/SessionFolderPicker.tsx src/chrome/SessionFiltersMenu.tsx src/chrome/SessionsEmpty.tsx src/chrome/SidebarUpdate.tsx src/chrome/Modal.tsx
git commit -m "Standardize rail and chrome typography."
```

---

### Task 3: Sweep Settings

**Files:** `src/surfaces/SettingsView.tsx`, `src/chrome/SettingsRail.tsx`, `src/chrome/CustomModelsSection.tsx`, `src/chrome/CustomModelEditor.tsx`, `src/chrome/ModelSettings.tsx`, `src/surfaces/SkillsPage.tsx`, `src/chrome/ColorPickerPopover.tsx`, `src/chrome/ImportSessionDialog.tsx`, `src/chrome/RemoveProjectDialog.tsx`, `src/chrome/ProjectBackgroundDialog.tsx`, `src/chrome/WhatsNewDialog.tsx`, `src/surfaces/ReleaseNotesSurface.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports; the settings pages follow the scale.

- [ ] **Step 1: Apply the mapping and the settings hierarchy**

- `Row` primitive (`SettingsView.tsx`): label `text-sm font-semibold`, description `text-xs` (keep the muted color), values/controls `text-sm`.
- `Heading` / section titles: `text-sm font-semibold`; sub-groups keep muted `text-xs`.
- Settings rail items (`SettingsRail.tsx`): `text-sm` weight 400 with the active background.
- Buttons (`SecondaryButton`, primary buttons): `text-sm font-medium` (or the existing `text-xs` for dense inline buttons becomes `text-xs font-medium`).
- Badges/pills (`Default` badge, counts): `text-2xs font-medium`.
- Provider rows, custom model editors, skills list rows: 14px values, 12px descriptions, 600 titles.
- Icon sizes: inline icons `size-3.5`; keep `size-4` only in empty states/illustrations; remove `size-2.5`.

- [ ] **Step 2: Update and run the settings tests**

Run: `npx vitest run src/surfaces/SkillsPage.test.ts src/lib/customModels.test.ts src/lib/customModelEditor.test.ts`
Expected: green (update any assertion that quoted a migrated class).

- [ ] **Step 3: Acceptance greps**

```bash
grep -rnE 'text-\[(13|11|10|12\.5|11\.5|10\.5|9)px\]' src/surfaces/SettingsView.tsx src/chrome/SettingsRail.tsx src/chrome/CustomModelsSection.tsx src/chrome/CustomModelEditor.tsx src/chrome/ModelSettings.tsx src/surfaces/SkillsPage.tsx src/chrome/ColorPickerPopover.tsx src/chrome/ImportSessionDialog.tsx src/chrome/RemoveProjectDialog.tsx src/chrome/ProjectBackgroundDialog.tsx src/chrome/WhatsNewDialog.tsx src/surfaces/ReleaseNotesSurface.tsx
grep -rn 'font-bold\|size-2\.5' src/surfaces/SettingsView.tsx src/chrome/SettingsRail.tsx src/chrome/CustomModelsSection.tsx src/chrome/CustomModelEditor.tsx src/chrome/ModelSettings.tsx src/surfaces/SkillsPage.tsx src/chrome/ColorPickerPopover.tsx src/chrome/ImportSessionDialog.tsx src/chrome/RemoveProjectDialog.tsx src/chrome/ProjectBackgroundDialog.tsx src/chrome/WhatsNewDialog.tsx src/surfaces/ReleaseNotesSurface.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/surfaces/SettingsView.tsx src/chrome/SettingsRail.tsx src/chrome/CustomModelsSection.tsx src/chrome/CustomModelEditor.tsx src/chrome/ModelSettings.tsx src/surfaces/SkillsPage.tsx src/chrome/ColorPickerPopover.tsx src/chrome/ImportSessionDialog.tsx src/chrome/RemoveProjectDialog.tsx src/chrome/ProjectBackgroundDialog.tsx src/chrome/WhatsNewDialog.tsx src/surfaces/ReleaseNotesSurface.tsx
git commit -m "Standardize settings typography."
```

---

### Task 4: Sweep composer, transcript, and their pickers

**Files:** `src/chrome/Composer.tsx`, `src/surfaces/AgentTranscript.tsx`, `src/chrome/QuestionForm.tsx`, `src/chrome/ApprovalToasts.tsx`, `src/chrome/PlanPreview.tsx`, `src/chrome/SecondOpinionButton.tsx`, `src/chrome/SecondOpinionCard.tsx`, `src/chrome/HandoffMiniCard.tsx`, `src/chrome/SessionActivity.tsx`, `src/chrome/ContextMeter.tsx`, `src/chrome/PromptOutline.tsx`, `src/chrome/ModelPicker.tsx`, `src/chrome/CwdPicker.tsx`, `src/chrome/BranchPicker.tsx`, `src/chrome/SwitchBranchDialog.tsx`, `src/chrome/AccessPicker.tsx`, `src/chrome/SkillPicker.tsx`, `src/chrome/FileMentionPicker.tsx`, `src/chrome/FilePicker.tsx`, `src/chrome/AttachmentChip.tsx`, `src/surfaces/TranscriptFindBar.tsx`, `src/surfaces/TranscriptBookmarks.tsx`, `src/surfaces/TranscriptSelectionMenu.tsx`, `src/surfaces/EditorSelectionMenu.tsx`, `src/surfaces/AgentMarkdown.tsx`, `src/surfaces/UserLinkPreview.tsx`, `src/surfaces/LargeContextNudge.tsx`, `src/chrome/MarkdownModeToggle.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports.

- [ ] **Step 1: Apply the mapping**

- Transcript body (`AgentTranscript.tsx:608`): `font-mono text-sm` (14) — the mono size itself still comes from `--font-mono-size`; do not change that variable.
- Composer input and footer labels: `text-sm`; slash-command section headers `text-2xs font-medium uppercase` (10px, as they already are).
- Picker rows (models, cwd, branches, skills, files): labels `text-sm` weight 400, metadata `text-xs`; the selected row keeps its background and may use weight 500.
- Menus/popovers: item labels `text-sm`; hints and shortcuts `text-xs`.
- Cards (`SecondOpinionCard`, `HandoffMiniCard`, `PlanPreview`, `SessionActivity`, `LargeContextNudge`): titles `text-sm font-semibold`, body `text-xs`, badges `text-2xs`.
- Question/approval surfaces: question text `text-sm`, options `text-sm` weight 400, buttons `text-sm font-medium`.
- Icons: inline `size-3.5`; `size-2.5` removed; keep `size-2` only where a mascot is rendered.

- [ ] **Step 2: Run the area tests**

Run: `npx vitest run src/chrome/Composer.test.ts src/surfaces/AgentTranscript.test.ts src/chrome/ModelPicker.test.ts src/surfaces/AgentMarkdown.test.ts src/surfaces/AgentTranscriptFileLinks.test.ts src/chrome/SkillPicker.test.ts src/chrome/AttachmentChip.test.ts`
Expected: green.

- [ ] **Step 3: Acceptance greps**

```bash
grep -rnE 'text-\[(13|11|10|12\.5|11\.5|10\.5|9)px\]' src/chrome/Composer.tsx src/surfaces/AgentTranscript.tsx src/chrome/QuestionForm.tsx src/chrome/ApprovalToasts.tsx src/chrome/PlanPreview.tsx src/chrome/SecondOpinionButton.tsx src/chrome/SecondOpinionCard.tsx src/chrome/HandoffMiniCard.tsx src/chrome/SessionActivity.tsx src/chrome/ContextMeter.tsx src/chrome/PromptOutline.tsx src/chrome/ModelPicker.tsx src/chrome/CwdPicker.tsx src/chrome/BranchPicker.tsx src/chrome/SwitchBranchDialog.tsx src/chrome/AccessPicker.tsx src/chrome/SkillPicker.tsx src/chrome/FileMentionPicker.tsx src/chrome/FilePicker.tsx src/chrome/AttachmentChip.tsx src/surfaces/TranscriptFindBar.tsx src/surfaces/TranscriptBookmarks.tsx src/surfaces/TranscriptSelectionMenu.tsx src/surfaces/EditorSelectionMenu.tsx src/surfaces/AgentMarkdown.tsx src/surfaces/UserLinkPreview.tsx src/surfaces/LargeContextNudge.tsx src/chrome/MarkdownModeToggle.tsx
grep -rn 'font-bold\|size-2\.5' src/chrome/Composer.tsx src/surfaces/AgentTranscript.tsx src/chrome/QuestionForm.tsx src/chrome/ApprovalToasts.tsx src/chrome/PlanPreview.tsx src/chrome/SecondOpinionButton.tsx src/chrome/SecondOpinionCard.tsx src/chrome/HandoffMiniCard.tsx src/chrome/SessionActivity.tsx src/chrome/ContextMeter.tsx src/chrome/PromptOutline.tsx src/chrome/ModelPicker.tsx src/chrome/CwdPicker.tsx src/chrome/BranchPicker.tsx src/chrome/SwitchBranchDialog.tsx src/chrome/AccessPicker.tsx src/chrome/SkillPicker.tsx src/chrome/FileMentionPicker.tsx src/chrome/FilePicker.tsx src/chrome/AttachmentChip.tsx src/surfaces/TranscriptFindBar.tsx src/surfaces/TranscriptBookmarks.tsx src/surfaces/TranscriptSelectionMenu.tsx src/surfaces/EditorSelectionMenu.tsx src/surfaces/AgentMarkdown.tsx src/surfaces/UserLinkPreview.tsx src/surfaces/LargeContextNudge.tsx src/chrome/MarkdownModeToggle.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/chrome/Composer.tsx src/surfaces/AgentTranscript.tsx src/chrome/QuestionForm.tsx src/chrome/ApprovalToasts.tsx src/chrome/PlanPreview.tsx src/chrome/SecondOpinionButton.tsx src/chrome/SecondOpinionCard.tsx src/chrome/HandoffMiniCard.tsx src/chrome/SessionActivity.tsx src/chrome/ContextMeter.tsx src/chrome/PromptOutline.tsx src/chrome/ModelPicker.tsx src/chrome/CwdPicker.tsx src/chrome/BranchPicker.tsx src/chrome/SwitchBranchDialog.tsx src/chrome/AccessPicker.tsx src/chrome/SkillPicker.tsx src/chrome/FileMentionPicker.tsx src/chrome/FilePicker.tsx src/chrome/AttachmentChip.tsx src/surfaces/TranscriptFindBar.tsx src/surfaces/TranscriptBookmarks.tsx src/surfaces/TranscriptSelectionMenu.tsx src/surfaces/EditorSelectionMenu.tsx src/surfaces/AgentMarkdown.tsx src/surfaces/UserLinkPreview.tsx src/surfaces/LargeContextNudge.tsx src/chrome/MarkdownModeToggle.tsx
git commit -m "Standardize composer and transcript typography."
```

---

### Task 5: Sweep the full-screen surfaces

**Files:** `src/surfaces/InboxView.tsx`, `src/surfaces/InboxComments.tsx`, `src/surfaces/InboxDiscussionPanel.tsx`, `src/surfaces/InboxMedia.tsx`, `src/chrome/InboxMiniCard.tsx`, `src/chrome/InboxConnectMenu.tsx`, `src/chrome/InboxFiltersMenu.tsx`, `src/surfaces/KanbanView.tsx`, `src/surfaces/AutomationsView.tsx`, `src/surfaces/NotesView.tsx`, `src/surfaces/SearchView.tsx`, `src/surfaces/EmptySession.tsx`, `src/surfaces/AstraWelcome.tsx`, `src/surfaces/AstraWelcome.css`, `src/surfaces/AgentTabView.tsx`, `src/surfaces/NotionTaskEditor.tsx`, `src/chrome/DiscussionEmpty.tsx`

**Interfaces:**
- Consumes: Task 1's `font-display`/`text-display`.
- Produces: surface header titles render in Cal Sans at 17px.

- [ ] **Step 1: Apply the mapping and the surface titles**

- Surface header titles become the only Cal Sans usage: `KanbanView.tsx` (`{t("Kanban")}`), `AutomationsView.tsx` (`{t("Automations")}`), the Inbox detail/header title, `NotesView`, `SearchView`, and the Settings page title in `SettingsView.tsx` (this file is already migrated in Task 3; only this one class is added here if it was missed). Use:

```tsx
<span className="font-display text-display text-content">{t("Kanban")}</span>
```

- Everything else follows the mapping: row titles `text-sm` weight 400 (lists) or 600 (card titles), descriptions/metadata `text-xs`, badges/pills `text-2xs`, buttons `text-sm font-medium`.
- `text-[20px]`/`text-[22px]` titles that are not surface titles drop to `text-sm` (600) or `text-xs` per role.
- Icons `size-3.5`; `size-2.5` removed; mascots keep `size-2`.

- [ ] **Step 2: Run the surface tests**

Run: `npx vitest run src/surfaces/InboxView.test.ts src/surfaces/NotesView.test.ts src/surfaces/KanbanView.test.ts src/surfaces/AutomationsView.test.ts src/surfaces/EmptySession.test.ts`
Expected: green.

- [ ] **Step 3: Acceptance greps**

```bash
grep -rnE 'text-\[(13|11|10|12\.5|11\.5|10\.5|9)px\]' src/surfaces/InboxView.tsx src/surfaces/InboxComments.tsx src/surfaces/InboxDiscussionPanel.tsx src/surfaces/InboxMedia.tsx src/chrome/InboxMiniCard.tsx src/chrome/InboxConnectMenu.tsx src/chrome/InboxFiltersMenu.tsx src/surfaces/KanbanView.tsx src/surfaces/AutomationsView.tsx src/surfaces/NotesView.tsx src/surfaces/SearchView.tsx src/surfaces/EmptySession.tsx src/surfaces/AstraWelcome.tsx src/surfaces/AstraWelcome.css src/surfaces/AgentTabView.tsx src/surfaces/NotionTaskEditor.tsx src/chrome/DiscussionEmpty.tsx
grep -rn 'font-bold\|size-2\.5' src/surfaces/InboxView.tsx src/surfaces/InboxComments.tsx src/surfaces/InboxDiscussionPanel.tsx src/surfaces/InboxMedia.tsx src/chrome/InboxMiniCard.tsx src/chrome/InboxConnectMenu.tsx src/chrome/InboxFiltersMenu.tsx src/surfaces/KanbanView.tsx src/surfaces/AutomationsView.tsx src/surfaces/NotesView.tsx src/surfaces/SearchView.tsx src/surfaces/EmptySession.tsx src/surfaces/AstraWelcome.tsx src/surfaces/AstraWelcome.css src/surfaces/AgentTabView.tsx src/surfaces/NotionTaskEditor.tsx src/chrome/DiscussionEmpty.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/surfaces/InboxView.tsx src/surfaces/InboxComments.tsx src/surfaces/InboxDiscussionPanel.tsx src/surfaces/InboxMedia.tsx src/chrome/InboxMiniCard.tsx src/chrome/InboxConnectMenu.tsx src/chrome/InboxFiltersMenu.tsx src/surfaces/KanbanView.tsx src/surfaces/AutomationsView.tsx src/surfaces/NotesView.tsx src/surfaces/SearchView.tsx src/surfaces/EmptySession.tsx src/surfaces/AstraWelcome.tsx src/surfaces/AstraWelcome.css src/surfaces/AgentTabView.tsx src/surfaces/NotionTaskEditor.tsx src/chrome/DiscussionEmpty.tsx
git commit -m "Standardize surface typography."
```

---

### Task 6: Sweep diffs, editor, and terminals

**Files:** `src/surfaces/UnifiedDiffView.tsx`, `src/surfaces/WorkingTreeDiff.tsx`, `src/surfaces/SessionChangesDiff.tsx`, `src/surfaces/InboxPrDiff.tsx`, `src/surfaces/DiffCommentComposer.tsx`, `src/surfaces/CommitDiff.tsx`, `src/chrome/SessionReview.tsx`, `src/surfaces/FilePane.tsx`, `src/surfaces/FileEditor.tsx`, `src/surfaces/BinaryFileView.tsx`, `src/surfaces/SkillDocumentPreview.tsx`, `src/surfaces/TerminalView.tsx`, `src/surfaces/ProjectTerminalDock.tsx`, `src/surfaces/BrowserView.tsx`, `src/surfaces/TerminalGridBackground.tsx`, `src/chrome/GitChangesPanel.tsx`, `src/chrome/GitHistoryGraph.tsx`, `src/chrome/ToolDiffPreview.tsx`, `src/chrome/PrActions.tsx`, `src/chrome/PrReviewBar.tsx`, `src/chrome/PrMetadataEditor.tsx`, `src/chrome/BrowserAgentBridge.tsx`, `src/chrome/TerminalSpinner.tsx`, `src/chrome/ImageLightbox.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and the JetBrains Mono default.
- Produces: no new exports.

- [ ] **Step 1: Apply the mapping**

- Diff line text and gutters: `text-xs` (12) instead of 11px; keep `font-mono` and `leading-none` on gutters (allowed badge/gutter case), diff hunk headers `text-xs`.
- File headers in diff cards (`UnifiedDiffView` file rows): `text-sm` weight 500; counts (`+n −n`) `text-2xs` weight 500, tabular.
- Git panels (`GitChangesPanel`, `GitHistoryGraph`): commit subject `text-sm` weight 400; sha/author/time metadata `text-xs`; section headers `text-xs`; badges `text-2xs`.
- Editor chrome (`FilePane`, `FileEditor`, `BinaryFileView`, `SkillDocumentPreview`): tabs `text-sm`; empty/status text `text-xs`; keep the editor's own font-size variable untouched (`--font-mono-size`).
- Terminals (`TerminalView`, `ProjectTerminalDock`): chrome labels `text-xs`, keep the terminal's own font settings; `TerminalSpinner` size unchanged.
- PR surfaces (`PrActions`, `PrReviewBar`, `PrMetadataEditor`, `InboxPrDiff`, `DiffCommentComposer`, `ToolDiffPreview`): buttons `text-sm font-medium`, metadata `text-xs`, badges `text-2xs`.
- Icons: `size-3.5` inside rows; every `size-2.5` becomes `size-3.5` (or `size-3` only if 14px genuinely does not fit the gutter, with the reason in the report).

- [ ] **Step 2: Run the area tests**

Run: `npx vitest run src/lib/unifiedDiff.test.ts src/surfaces/InboxView.test.ts src/chrome/PrActions.test.ts src/chrome/PrReviewBar.test.ts src/lib/workingTreeDiff.test.ts src/lib/gitGraph.test.ts`
Expected: green.

- [ ] **Step 3: Acceptance greps**

```bash
grep -rnE 'text-\[(13|11|10|12\.5|11\.5|10\.5|9)px\]' src/surfaces/UnifiedDiffView.tsx src/surfaces/WorkingTreeDiff.tsx src/surfaces/SessionChangesDiff.tsx src/surfaces/InboxPrDiff.tsx src/surfaces/DiffCommentComposer.tsx src/surfaces/CommitDiff.tsx src/chrome/SessionReview.tsx src/surfaces/FilePane.tsx src/surfaces/FileEditor.tsx src/surfaces/BinaryFileView.tsx src/surfaces/SkillDocumentPreview.tsx src/surfaces/TerminalView.tsx src/surfaces/ProjectTerminalDock.tsx src/surfaces/BrowserView.tsx src/surfaces/TerminalGridBackground.tsx src/chrome/GitChangesPanel.tsx src/chrome/GitHistoryGraph.tsx src/chrome/ToolDiffPreview.tsx src/chrome/PrActions.tsx src/chrome/PrReviewBar.tsx src/chrome/PrMetadataEditor.tsx src/chrome/BrowserAgentBridge.tsx src/chrome/TerminalSpinner.tsx src/chrome/ImageLightbox.tsx
grep -rn 'font-bold' src/surfaces/UnifiedDiffView.tsx src/surfaces/WorkingTreeDiff.tsx src/surfaces/SessionChangesDiff.tsx src/surfaces/InboxPrDiff.tsx src/surfaces/DiffCommentComposer.tsx src/surfaces/CommitDiff.tsx src/chrome/SessionReview.tsx src/surfaces/FilePane.tsx src/surfaces/FileEditor.tsx src/surfaces/BinaryFileView.tsx src/surfaces/SkillDocumentPreview.tsx src/surfaces/TerminalView.tsx src/surfaces/ProjectTerminalDock.tsx src/surfaces/BrowserView.tsx src/surfaces/TerminalGridBackground.tsx src/chrome/GitChangesPanel.tsx src/chrome/GitHistoryGraph.tsx src/chrome/ToolDiffPreview.tsx src/chrome/PrActions.tsx src/chrome/PrReviewBar.tsx src/chrome/PrMetadataEditor.tsx src/chrome/BrowserAgentBridge.tsx src/chrome/TerminalSpinner.tsx src/chrome/ImageLightbox.tsx
```

Expected: no output (except the documented gutter exception, if the implementer had to keep one — they must note it in the report and the guard in Task 7 will list it explicitly).

- [ ] **Step 4: Commit**

```bash
git add src/surfaces/UnifiedDiffView.tsx src/surfaces/WorkingTreeDiff.tsx src/surfaces/SessionChangesDiff.tsx src/surfaces/InboxPrDiff.tsx src/surfaces/DiffCommentComposer.tsx src/surfaces/CommitDiff.tsx src/chrome/SessionReview.tsx src/surfaces/FilePane.tsx src/surfaces/FileEditor.tsx src/surfaces/BinaryFileView.tsx src/surfaces/SkillDocumentPreview.tsx src/surfaces/TerminalView.tsx src/surfaces/ProjectTerminalDock.tsx src/surfaces/BrowserView.tsx src/surfaces/TerminalGridBackground.tsx src/chrome/GitChangesPanel.tsx src/chrome/GitHistoryGraph.tsx src/chrome/ToolDiffPreview.tsx src/chrome/PrActions.tsx src/chrome/PrReviewBar.tsx src/chrome/PrMetadataEditor.tsx src/chrome/BrowserAgentBridge.tsx src/chrome/TerminalSpinner.tsx src/chrome/ImageLightbox.tsx
git commit -m "Standardize diff and editor typography."
```

---

### Task 7: Add the typography guard

**Files:**
- Create: `src/typography.test.ts`

**Interfaces:**
- Consumes: the migrated tree from Tasks 2-6.
- Produces: a failing signal whenever the retired patterns return.

- [ ] **Step 1: Write the guard**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
/** Any arbitrary text size except the two literals the scale keeps. */
const BANNED_TEXT = /text-\[(?!12px\]|10px\])[0-9.]+px\]/;
const BANNED_WEIGHT = ["font-bold"];
const BANNED_ICON = ["size-2.5"];
/** `size-2` stays on project mascots, RailAction's status dot, and the color-swatch glyph. */
const SIZE_2_FILES = new Set([
  "chrome/ProjectRail.tsx",
  "chrome/RailAction.tsx",
  "chrome/ColorPickerPopover.tsx",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("typography scale", () => {
  it("keeps retired sizes, weights, and icon sizes out of the source", () => {
    const offenders: string[] = [];
    for (const dir of ["chrome", "surfaces", "hooks", "lib"].map((name) =>
      join(SRC, name),
    )) {
      for (const file of sourceFiles(dir)) {
        const source = readFileSync(file, "utf8");
        for (const line of source.split("\n")) {
          if (BANNED_TEXT.test(line)) {
            offenders.push(`${file.slice(SRC.length)}: ${line.match(BANNED_TEXT)?.[0]}`);
          }
          for (const banned of [...BANNED_WEIGHT, ...BANNED_ICON]) {
            if (line.includes(banned)) {
              offenders.push(`${file.slice(SRC.length)}: ${banned}`);
            }
          }
          if (
            !SIZE_2_FILES.has(file.slice(SRC.length)) &&
            line.includes("size-2 ")
          ) {
            offenders.push(`${file.slice(SRC.length)}: size-2`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/typography.test.ts`
Expected: PASS. Any offender it reports belongs to a file missed by Tasks 2-6; migrate that file with the mapping, re-run until the list is empty, and include it in the commit.

- [ ] **Step 3: Commit**

```bash
git add src/typography.test.ts
git commit -m "Guard the typography scale."
```

---

### Task 8: Full checks and manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web suite**

Run: `npm run check:web`
Expected: all vitest files pass (including the new guard) and `tsc --noEmit` is clean.

- [ ] **Step 2: Build**

Run: `npx vite build`
Expected: success; `dist/fonts/` contains the three woff2 files.

- [ ] **Step 3: Manual verification**

With the app in dev mode:

1. Rail: every item reads at 14px with the same weight; the active item is a background only; icons are visually uniform; the Settings row has the divider above it and the shortcut on the right.
2. Settings: row titles at 600/14, descriptions at 12, badges at 10; nothing clips in pt-BR.
3. Surface titles (Kanban, Automations, Inbox, Notes, Search, Settings) render in Cal Sans at 17px and nothing else does.
4. Code, diffs, and terminals render in JetBrains Mono; the code font-size setting in Appearance still changes the terminal/editor size.
5. Long labels: rail project names, settings selects, composer chips, and diff file headers do not clip or overlap after the size changes.
6. Switch Appearance → font settings to a custom font and back to default, and confirm the defaults restore Cal Sans/JetBrains Mono where expected.

- [ ] **Step 4: Report**

Summarize commands and manual results; do not claim the manual pass if it was not performed.

---

## Self-review notes

- Spec coverage: fonts and licensing (Task 1), scale and weights (Tasks 2-6), icon sizes (Tasks 2-6), rail footer divider (Task 2), Cal Sans surface titles (Task 5), guard test (Task 7), checks and manual verification (Task 8).
- Deviation from the spec's file list, already reflected in the spec: only the `latin` subset of each font is bundled (fontsource faces carry no `unicode-range`, and latin covers Portuguese), and `src/lib/fonts.ts`'s `MONO_FALLBACK` is updated because the runtime overrides `--font-mono` at boot.
- Type consistency: `text-2xs`, `text-display`, `font-display`, and `--font-display` keep the same names across Tasks 1-7.
