# Project notification mutes — design

## Goal

Expose the per-project notification preferences that the notification pipeline already honors, without changing the app's design language: mute a project from its rail context menu, see the muted state on the project row, mute every Inbox project or mark everything read from the Inbox header, and manage categories and mutes per project in Settings → Inbox.

## Scope

In scope:

- Rail project context menu (the existing `TabGroupMenu` action sheet): a **Mute notifications** item with the shared duration submenu (1/4/8 hours, Until resumed, Choose date and time), a leading **Resume notifications** action when the project is muted (with the mute status as its description), and a **Notification settings…** item that opens Settings → Inbox on the new project notifications block.
- Custom mute timing through the existing `NotificationMuteDatePicker` in a `Popover` anchored at the menu position; inline save error text, no toast.
- A `BellOff` indicator on the project row while muted, with the mute status as its `aria-label`.
- Inbox header: a bell `IconButton` that opens the existing `InboxNotificationMenu` (mark all as read, mute all projects, resume muted projects, notification settings…). The existing per-source "Mark all as read" button stays.
- Settings → Inbox: the existing `ProjectNotificationSettings` block at the top of the page (category toggles and per-project mute controls), with a new `project-notifications` anchor so the menu item scrolls to it.

Out of scope:

- Settings search and row reveal (front 2); the anchor above only scrolls to the block and works with today's `SettingsAnchor` mechanism.
- Notification delivery rules themselves; mutes are already enforced in `src/lib/notifications.ts` and the sound pipeline.
- Any rail, Inbox, Settings, or typography redesign: the port reuses the existing rows, menus, `IconButton`/`RailAction` patterns, and the current type scale.

## Design

### State and reuse

All persistence already exists and is reactive:

- `src/lib/notificationPreferences.ts` — `loadNotificationPreferences`, `updateNotificationPreferences(projectIds, { mutedUntil })`, `isProjectMuted`, and the `subscribeNotificationPreferences` store.
- `src/hooks/useProjectNotificationPreferences.ts` — `useSyncExternalStore` wrapper; every consumer re-renders on change, so the rail indicator, menus, and Settings stay in sync.
- `src/chrome/notificationMuteActions.ts` — `notificationMuteActions()` (submenu items with localized-at-render labels), `notificationMuteDeadline(id)`, and `notificationMuteStatus(preference)`.
- `src/chrome/NotificationMuteControl.tsx`, `src/chrome/NotificationMuteDatePicker.tsx`, `src/chrome/InboxNotificationMenu.tsx`, and `src/surfaces/ProjectNotificationSettings.tsx` already implement the controls and are currently unused by the app shell.

No new persistence keys or delivery logic.

### Rail project menu (`src/chrome/ProjectRail.tsx`)

- `projectMenuExtraItems` gains, after `reveal`: a `notifications-mute` item (`BellOff`, `sepBefore: true`, `submenu: notificationMuteActions()`) and, when the project resolves for notifications (`knownNotificationProject` in `src/lib/notificationProjects.ts`), a `notifications-settings` item (`Settings` icon).
- The item is disabled until the project resolves, so a git-remote lookup that has not finished cannot write a preference for the wrong key. Resolution uses the same `readyNotificationProject` lookup upstream used: `knownNotificationProject(path)` over the recents list.
- When the current project is muted, the menu receives `leadingAction` = **Resume notifications** (`BellOff`, description = `notificationMuteStatus`) which clears `mutedUntil` through `updateNotificationPreferences`.
- Picking a duration calls `notificationMuteDeadline(id)` and persists it; picking `mute:custom` keeps the menu open state → closes it and opens the date picker `Popover` at the menu's coordinates (the state kept for `projectMenu` already stores `x`/`y`).
- Save failures set an inline error line in the menu and leave it open, mirroring `NotificationMuteControl`.
- `ProjectCard` receives `muteStatus?: string` and renders the `BellOff` span (`role="img"`, `aria-label={muteStatus}`, amber, same spacing as the existing approval/busy dots) before the model icon when muted. Status comes from `notificationMuteStatus(notificationPreferences[project.id])` keyed by the project's paths, computed once in `ProjectRail` from `useNotificationProjects(sessions.map(s => s.cwd))` + `useProjectNotificationPreferences`.

### Inbox header (`src/surfaces/InboxView.tsx`)

- One new `IconButton` (bell, `aria-label={t("Notifications")}`) between the existing filter and mark-all buttons; it stores its `getBoundingClientRect()` and renders `InboxNotificationMenu` (coordinate-based, like `ExplorerMenu`) below the icon.
- The menu receives `projectPaths` = the rail's recent project paths plus each Inbox item's `projectPath` (deduped), and `onOpenSettings` routes to the same Settings anchor as the rail item.

### Settings → Inbox (`src/surfaces/SettingsView.tsx`)

- `InboxPage` renders `ProjectNotificationSettings` first, inside a wrapper `div` with `id={ANCHOR_IDS["project-notifications"]}`.
- `SettingsAnchor` union and `ANCHOR_IDS` gain `"project-notifications"`.
- `InboxPage` receives `cwd`, `recents`, and the optional `notificationProjectPath`/`notificationSettingsRequest` pair from `SettingsView` props; `App` holds the requested project path and bumps the request counter when the rail or Inbox menu asks for settings, so the block opens scrolled to the block with that project highlighted.

### App wiring (`src/App.tsx`)

- `openSettings(section, anchor)` already accepts an anchor; add a `notification-settings` opener that sets the pending project path, bumps the request counter, and calls `openSettings("inbox", "project-notifications")`.
- Thread `onOpenNotificationSettings?: (projectPath: string) => void` to `Sidebar` → `ProjectRail` and to `InboxView`, matching the prop style of the existing menu callbacks.

### i18n and interaction rules (house rules)

- Every new user-facing string goes through `t()` with pt-BR keys in `src/i18n/pt-BR.ts`: mute presets (hour labels, "Until resumed", "Choose date and time"), "Mute notifications", "Resume notifications", "Notification settings…", "Mark all as read" (exists), "Mute all projects", "Resume muted projects", "Notifications", the settings block headings, category names, and error strings.
- No new native `title` tooltips: status text lives in `aria-label`s and visible labels. Existing `title`s inside the reused components stay as they are, except where the app already replaced them with `data-no-tooltip` patterns.
- Typography stays on the current scale (`src/typography.test.ts` already passes for these components).

## Testing and verification

- Restore adapted upstream tests: `src/chrome/ProjectNotificationMenu.test.ts` (rail menu mute/resume, settings item, rendered indicator) and `src/chrome/InboxNotificationMenu.test.ts` (mark all read, mute all, resume muted, error retry) against our rail/Inbox wiring.
- Keep the green tests already in the tree: `NotificationMuteControl.test.ts`, `ProjectNotificationSettings.test.ts`, and the `notificationPreferences` coverage.
- Add a rail indicator assertion to the restored menu test: a muted project renders `role="img"` with the status and no `title` attribute.
- Run `npm test`, `npm run build`, and `cargo check` before calling the feature done; then `npm run app:mac` for manual verification (mute a project, confirm the row indicator, reopen to see "Resume", set a custom time, mute all from the Inbox menu, and change categories in Settings).

## Risks

- **Toast/menu timing**: the rail menu closes on pick; the custom date picker opens after close using stored coordinates. If the popover lands off-screen near the viewport bottom, clamp it the way `Popover` already does.
- **Project resolution**: projects without a usable git remote cannot be muted (the preference key would be unstable), so the item stays disabled — the same constraint upstream shipped.
