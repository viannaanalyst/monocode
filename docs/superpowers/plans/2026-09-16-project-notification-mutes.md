# Project Notification Mutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose per-project notification mutes and category preferences through the project rail menu, the Inbox header, and Settings → Inbox, reusing the components and stores that already exist.

**Architecture:** The persistence and policy layers already exist (`notificationPreferences`, `useProjectNotificationPreferences`, `notificationMuteActions`, `NotificationMuteControl`, `NotificationMuteDatePicker`, `InboxNotificationMenu`, `ProjectNotificationSettings`). This plan wires them into the app shell: rail context menu + row indicator, Inbox header button, and the Settings Inbox page, plus pt-BR strings for every new label.

**Tech Stack:** React 19, TypeScript, Tailwind v4 tokens, Vitest + happy-dom, Tauri invoke mocks in tests.

## Global Constraints

- Do not change the app's design language: reuse existing rows, menus (`TabGroupMenu`/`ExplorerMenu`), `IconButton`/`RailAction` patterns, spacing, and typography. `src/typography.test.ts` must stay green.
- Every user-facing string goes through `t()` with a pt-BR key in `src/i18n/pt-BR.ts`; tests run in the `en` locale, so English keys remain the fallback.
- No new native `title` tooltips; use `aria-label` and visible labels (existing reused code keeps its attributes).
- Never commit a red suite: each task ends with `npx vitest run <files>` green plus `npx tsc --noEmit` clean.
- Use the repo's existing test harnesses (Tauri `invoke` mock + `happy-dom`).
- Commit messages in English, matching repo style.

---

### Task 1: Localize mute presets and notification strings

**Files:**
- Modify: `src/chrome/notificationMuteActions.ts`
- Modify: `src/i18n/pt-BR.ts`
- Test: Create `src/chrome/notificationMuteActions.test.ts`

**Interfaces:**
- Consumes: `t` from `../i18n`, `saveLocale`/`resetLocaleForTests` from `../i18n`.
- Produces: `notificationMuteActions(now?)` keeps returning `{ id, label, milliseconds? }[]` items whose `label` is localized at call time.

- [ ] **Step 1: Write the failing test**

```ts
// src/chrome/notificationMuteActions.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { resetLocaleForTests, saveLocale } from "../i18n";
import { notificationMuteActions } from "./notificationMuteActions";

afterEach(() => resetLocaleForTests());

describe("notification mute actions", () => {
  it("keeps the preset ids and durations", () => {
    saveLocale("en");
    const actions = notificationMuteActions(new Date("2026-09-16T12:00:00"));
    expect(actions.map((action) => action.id)).toEqual([
      "mute:1",
      "mute:4",
      "mute:8",
      "mute:indefinite",
      "mute:custom",
    ]);
  });

  it("localizes preset labels to pt-BR", () => {
    saveLocale("pt-BR");
    const labels = notificationMuteActions(
      new Date("2026-09-16T12:00:00"),
    ).map((action) => action.label);
    expect(labels[0]).toMatch(/^1 hora \(/);
    expect(labels[1]).toMatch(/^4 horas \(/);
    expect(labels[2]).toMatch(/^8 horas \(/);
    expect(labels[3]).toBe("Até retomar");
    expect(labels[4]).toBe("Escolher data e hora");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/notificationMuteActions.test.ts`
Expected: FAIL — pt-BR labels are still English.

- [ ] **Step 3: Localize the presets**

In `src/chrome/notificationMuteActions.ts`, add the import and change the labels:

```ts
import { t } from "../i18n";
```

```ts
const mutePresets = [
  ...NOTIFICATION_MUTE_HOURS.map((hours) => ({
    kind: "item" as const,
    id: `mute:${hours}`,
    label: `${hours} ${hours === 1 ? t("hour") : t("hours")}`,
    milliseconds: hours * 3_600_000,
  })),
  {
    kind: "item" as const,
    id: "mute:indefinite",
    label: t("Until resumed"),
    milliseconds: null,
  },
  { kind: "item" as const, id: "mute:custom", label: t("Choose date and time") },
];
```

In the `notificationMuteActions` mapper, localize the "Tomorrow, " suffix:

```ts
    const day =
      until.toDateString() === now.toDateString() ? "" : `${t("Tomorrow")}, `;
```

- [ ] **Step 4: Add the pt-BR keys**

Append to `src/i18n/pt-BR.ts` (keep the file alphabetical only if the surrounding block is):

```ts
  hour: "hora",
  hours: "horas",
  Tomorrow: "Amanhã",
  "Until resumed": "Até retomar",
  "Choose date and time": "Escolher data e hora",
  "Mute notifications": "Mutar notificações",
  "Resume notifications": "Retomar notificações",
  "Notification settings…": "Configurações de notificação…",
  "Inbox actions": "Ações do Inbox",
  "Mute all projects": "Mutar todos os projetos",
  "Resume muted projects": "Retomar projetos mutados",
  "Mute": "Mutar",
  "Muted": "Mutado",
  "Change mute duration": "Alterar duração do mute",
  "Mute project notifications": "Mutar notificações do projeto",
  "Mute pauses all project notifications without changing your category choices.":
    "O mute pausa todas as notificações do projeto sem mudar suas escolhas de categoria.",
  "Could not save notification preferences. Please try again.":
    "Não foi possível salvar as preferências de notificação. Tente novamente.",
  "Could not save read status. Please try again.":
    "Não foi possível salvar o status de leitura. Tente novamente.",
  "Project notifications": "Notificações do projeto",
  "Choose sounds, banners and sidebar indicators by category. Mute pauses them without changing your choices. Unread items stay marked in Inbox.":
    "Escolha sons, banners e indicadores da barra lateral por categoria. O mute pausa tudo sem mudar suas escolhas. Itens não lidos continuam marcados no Inbox.",
  "Select projects": "Selecionar projetos",
  "Select all projects": "Selecionar todos os projetos",
  "All categories enabled": "Todas as categorias ativas",
  "All notifications paused": "Todas as notificações pausadas",
  "Mute selected projects": "Mutar projetos selecionados",
  "Done": "Concluído",
  "Pull requests / Merge requests": "Pull requests / Merge requests",
  "Issues and Linear tasks": "Issues e tarefas do Linear",
  "Agent finished": "Agente terminou",
  "Agent approvals and questions": "Aprovações e perguntas do agente",
  "Reminders": "Lembretes",
  "{muted} of {total} projects muted": "{muted} de {total} projetos mutados",
  "{category} for {project}": "{category} para {project}",
```

- [ ] **Step 5: Wrap the remaining hardcoded strings**

In the four reused components, replace hardcoded labels with `t("...")` (keys above): `src/chrome/NotificationMuteControl.tsx` ("Mute notifications", "Resume notifications", "Muted", "Mute", "Change mute duration", "Mute project notifications", the paused-explanation string, the error, and the `${muted.length} of ${projectIds.length} projects muted` status becomes `t("{muted} of {total} projects muted", { muted: muted.length, total: projectIds.length })`), `src/chrome/InboxNotificationMenu.tsx` ("Inbox actions", "Mute all projects", "Resume muted projects", "Notification settings…", the two errors, and `Mark all as read` already uses a key — keep it), `src/surfaces/ProjectNotificationSettings.tsx` ("Project notifications", the description string, "Select projects"/"Done", "All categories enabled", "All notifications paused", "Mute selected projects", "Local project", `<span>{t(category.label)}</span>`, `aria-label={t("{category} for {project}", { category: t(category.label), project: project.name })}`), and `src/chrome/NotificationMuteDatePicker.tsx` (the three validation/save strings).

Run `npx rg -n '"[A-Z][^"]{5,}' src/chrome/NotificationMuteControl.tsx src/chrome/InboxNotificationMenu.tsx src/chrome/NotificationMuteDatePicker.tsx src/surfaces/ProjectNotificationSettings.tsx` and confirm only imports, CSS/class strings, `role`/`aria` names, and test ids remain.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/chrome/notificationMuteActions.test.ts src/chrome/NotificationMuteControl.test.ts src/surfaces/ProjectNotificationSettings.test.ts src/typography.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/chrome/notificationMuteActions.ts src/chrome/notificationMuteActions.test.ts src/i18n/pt-BR.ts src/chrome/NotificationMuteControl.tsx src/chrome/InboxNotificationMenu.tsx src/chrome/NotificationMuteDatePicker.tsx src/surfaces/ProjectNotificationSettings.tsx
git commit -m "Localize project notification mutes to pt-BR"
```

---

### Task 2: Show the mute indicator on rail project rows

**Files:**
- Modify: `src/chrome/ProjectRail.tsx`
- Test: Create `src/chrome/ProjectRailMuteIndicator.test.ts`

**Interfaces:**
- Consumes: `useProjectNotificationPreferences()` (`src/hooks/useProjectNotificationPreferences.ts`), `useNotificationProjects(paths)` (`src/hooks/useNotificationProjects.ts`), `notificationMuteStatus(preference)` (`src/chrome/notificationMuteActions.ts`), `pathKey(path)` (`src/lib/paths.ts`), `collectRailProjects(recents, cwd)` (`src/lib/recents.ts`).
- Produces: `ProjectSection`/`ProjectCard` accept `muteStatuses: ReadonlyMap<string, string | null>` (Task 3 keeps using this signature); the project row's `aria-label` reads `"${cardAriaLabel}, ${muteStatus}"` when muted.

- [ ] **Step 1: Write the failing test**

```ts
// src/chrome/ProjectRailMuteIndicator.test.ts
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferences } from "../lib/notificationPreferences";
import { rememberNotificationProjects } from "../lib/notificationProjects";
import { ProjectRail } from "./ProjectRail";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({
    root: "/work/private",
    commonDir: null,
    remote: "https://github.com/person/private.git",
  })),
  convertFileSrc: (path: string) => path,
}));
vi.mock("../hooks/useProjectDiffStats", () => ({
  useProjectDiffStats: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () =>
    root.render(
      createElement(ProjectRail, {
        cwd: "/work/private",
        recents: [],
        onSelectProject: vi.fn(),
        onOpenProject: vi.fn(),
      }),
    ),
  );
}

describe("rail project mute indicator", () => {
  it("marks a muted project and clears the mark when resumed", async () => {
    rememberNotificationProjects([
      {
        id: "local:/work/private",
        name: "person/private",
        detail: "github.com",
        kind: "repository",
        paths: ["/work/private"],
      },
    ]);
    updateNotificationPreferences(["local:/work/private"], {
      mutedUntil: null,
    });
    await render();

    const indicator = container.querySelector(
      '[role="img"][aria-label="Muted until resumed"]',
    );
    expect(indicator).not.toBeNull();
    const project = container.querySelector('button[aria-current="true"]')!;
    expect(project.getAttribute("aria-label")).toContain("Muted until resumed");

    updateNotificationPreferences(["local:/work/private"], {
      mutedUntil: undefined,
    });
    await act(async () => {});
    expect(
      container.querySelector('[role="img"][aria-label="Muted until resumed"]'),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/ProjectRailMuteIndicator.test.ts`
Expected: FAIL — no `role="img"` indicator is rendered.

- [ ] **Step 3: Compute and pass the mute statuses**

In `src/chrome/ProjectRail.tsx` add the imports:

```ts
import { notificationMuteStatus } from "./notificationMuteActions";
import { useProjectNotificationPreferences } from "../hooks/useProjectNotificationPreferences";
import { useNotificationProjects } from "../hooks/useNotificationProjects";
import { pathKey } from "../lib/paths";
```

Inside `ProjectRail`, next to `const groupLogos = useTabGroupLogos();`:

```ts
  const notificationPreferences = useProjectNotificationPreferences();
  const allProjects = useMemo(
    () => collectRailProjects(recents, cwd),
    [cwd, recents],
  );
  const notificationProjects = useNotificationProjects([...allProjects.keys()]);
  const muteStatuses = new Map<string, string | null>();
  for (const project of notificationProjects.projects) {
    const status = notificationMuteStatus(notificationPreferences[project.id]);
    for (const path of project.paths) muteStatuses.set(pathKey(path), status);
  }
```

`collectRailProjects` is already imported from `../lib/recents` in this file — do not add a duplicate import.

- [ ] **Step 4: Thread the map to the cards**

Add `muteStatuses: ReadonlyMap<string, string | null>;` to `ProjectSection`'s props type and destructuring, and pass it in both `<ProjectSection ... />` call sites:

```tsx
              muteStatuses={muteStatuses}
```

Add `muteStatus?: string;` to `ProjectCard`'s props type and destructuring, and in `ProjectSection`:

```tsx
            muteStatus={muteStatuses.get(pathKey(item.path)) ?? undefined}
```

- [ ] **Step 5: Render the indicator and extend the aria-label**

In `ProjectCard`, replace the project button's `aria-label`:

```tsx
        aria-label={muteStatus ? `${cardAriaLabel}, ${muteStatus}` : cardAriaLabel}
```

Next to the existing project logo/mascot span (inside the same row, after the name), add:

```tsx
        {muteStatus ? (
          <span
            role="img"
            aria-label={muteStatus}
            className="grid size-4 shrink-0 place-items-center text-amber-400"
          >
            <BellOff className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
```

Add `BellOff` to the `./icons` import at the top of the file. Do not add a `title` attribute.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/chrome/ProjectRailMuteIndicator.test.ts src/chrome/ProjectRailSessionDrag.test.ts src/typography.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/chrome/ProjectRail.tsx src/chrome/ProjectRailMuteIndicator.test.ts
git commit -m "Show project notification mute status in the rail"
```

---

### Task 3: Mute, resume and open settings from the project menu

**Files:**
- Modify: `src/chrome/ProjectRail.tsx`
- Modify: `src/chrome/Sidebar.tsx`
- Modify: `src/App.tsx`
- Test: Restore and adapt `src/chrome/ProjectNotificationMenu.test.ts`

**Interfaces:**
- Consumes: `notificationMuteActions()`, `notificationMuteDeadline(id)`, `notificationMuteStatus`, `updateNotificationPreferences(ids, { mutedUntil })`, `knownNotificationProject(path)` (`src/lib/notificationProjects.ts`), `NotificationMuteDatePicker` (`src/chrome/NotificationMuteDatePicker.tsx`), `Popover` (`src/chrome/Popover.tsx`), `TabGroupMenuExtraItem.submenu` (`src/chrome/TabGroupMenu.tsx`).
- Produces: `ProjectRail` accepts `onOpenNotificationSettings?: (projectPath: string) => void`; `Sidebar` forwards it to `ProjectRail`; `App` provides it through `openSettings("inbox", "project-notifications")` (the anchor lands in Task 5; until then the call still opens Settings → Inbox).

- [ ] **Step 1: Restore the upstream test and adapt it**

```bash
git show upstream/main:src/chrome/ProjectNotificationMenu.test.ts > src/chrome/ProjectNotificationMenu.test.ts
```

Apply these exact edits:

1. Delete the whole `it("opens notification settings for all projects from the Inbox context menu", ...)` block (lines ~206-264 in the upstream file). Our Inbox notifications menu lives in the Inbox header (Task 4), not on the rail.
2. In the remaining tests, replace `createElement(ProjectRail, {` prop lists that include `onOpenNotificationSettings` with the same props: the prop name stays `onOpenNotificationSettings`.

Keep the `vi.mock` blocks, the `button()` helper, and every other assertion (indicator, resume, timers, settings callback on the project menu).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/ProjectNotificationMenu.test.ts`
Expected: FAIL — "Mute notifications" / "Resume notifications" items do not exist yet.

- [ ] **Step 3: Add the menu state and ready-project lookup**

In `ProjectRail`'s state block, next to `projectMenu`:

```ts
  const [notificationMenu, setNotificationMenu] = useState<{
    x: number;
    y: number;
    path: string;
    project: NotificationProject;
  } | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const notificationPath = projectMenu?.path;
  const readyNotificationProject = notificationPath
    ? knownNotificationProject(notificationPath)
    : undefined;
  const menuMuteStatus = readyNotificationProject
    ? notificationMuteStatus(notificationPreferences[readyNotificationProject.id])
    : null;
  useEffect(() => {
    setNotificationError(null);
  }, [notificationPath]);
```

Imports to add: `notificationMuteActions`, `notificationMuteDeadline`, `notificationMuteStatus` from `./notificationMuteActions`; `NotificationMuteDatePicker` from `./NotificationMuteDatePicker`; `Popover` from `./Popover`; `updateNotificationPreferences` from `../lib/notificationPreferences`; `knownNotificationProject`, `type NotificationProject` from `../lib/notificationProjects`; `BellOff` (already in Task 2) from `./icons`.

- [ ] **Step 4: Extend the menu items**

Change the signature of `projectMenuExtraItems` to take the notification flags:

```ts
function projectMenuExtraItems(
  pinned: boolean,
  canRemove: boolean,
  canImport: boolean,
  notificationReady: boolean,
  canConfigureNotifications: boolean,
): TabGroupMenuExtraItem[] {
```

After the `reveal` item, push:

```ts
    {
      id: "notifications-mute",
      label: t("Mute notifications"),
      icon: BellOff,
      sepBefore: true,
      disabled: !notificationReady,
      submenu: notificationMuteActions(),
    },
```

and when `canConfigureNotifications` is true:

```ts
    items.push({
      id: "notifications-settings",
      label: t("Notification settings…"),
      icon: Settings,
    });
```

Update the call site:

```tsx
          extraItems={projectMenuExtraItems(
            pinnedPaths.some((pinned) =>
              sameProjectPath(pinned, projectMenu.path),
            ),
            Boolean(onRemoveProject),
            Boolean(onImportSession),
            Boolean(readyNotificationProject),
            Boolean(onOpenNotificationSettings),
          )}
```

- [ ] **Step 5: Handle the picks and the resume action**

In `onProjectMenuPick`, add before the `pin`/`unpin` branch:

```ts
    if (action === "mute:custom") {
      if (!readyNotificationProject) return false;
      setNotificationMenu({ ...projectMenu, project: readyNotificationProject });
      return false;
    }
    if (action.startsWith("mute:") || action === "notifications-resume") {
      if (!readyNotificationProject) return false;
      const mutedUntil = notificationMuteDeadline(action);
      if (action !== "notifications-resume" && mutedUntil === undefined)
        return false;
      try {
        updateNotificationPreferences([readyNotificationProject.id], {
          mutedUntil,
        });
      } catch {
        setNotificationError(
          t("Could not save notification preferences. Please try again."),
        );
        return false;
      }
      return;
    }
    if (action === "notifications-settings") {
      onOpenNotificationSettings?.(path);
      return;
    }
```

Note: `TabGroupMenu.onExtraPick` keeps the menu open when the handler returns `false` (check `TabGroupMenu`'s extra-item branch; if it does not, close manually with `setProjectMenu(null)` after a successful mute).

Pass the resume action and the error line into the rendered `TabGroupMenu`:

```tsx
          leadingAction={
            menuMuteStatus
              ? {
                  id: "notifications-resume",
                  label: t("Resume notifications"),
                  description: menuMuteStatus,
                  icon: BellOff,
                }
              : undefined
          }
```

```tsx
          footer={
            notificationError ? (
              <p role="alert" className="px-2 py-1.5 text-xs text-red-400">
                {notificationError}
              </p>
            ) : undefined
          }
```

- [ ] **Step 6: Render the custom date picker**

Next to the project menu render block:

```tsx
      {notificationMenu ? (
        <Popover
          anchor={{ x: notificationMenu.x, y: notificationMenu.y }}
          gap={0}
          width={280}
          role="dialog"
          aria-label={t("Mute project notifications")}
          onDismiss={() => setNotificationMenu(null)}
          className="overflow-y-auto p-3"
        >
          <NotificationMuteDatePicker
            projectIds={[notificationMenu.project.id]}
            onCancel={() => setNotificationMenu(null)}
            onChanged={() => setNotificationMenu(null)}
          />
        </Popover>
      ) : null}
```

- [ ] **Step 7: Thread the prop from App through Sidebar**

In `ProjectRail`'s props type and destructuring add:

```ts
  onOpenNotificationSettings?: (projectPath: string) => void;
```

In `src/chrome/Sidebar.tsx`: add the same prop to `Props`, destructure it, and pass it in the `<ProjectRail ...>` render:

```tsx
          onOpenNotificationSettings={onOpenNotificationSettings}
```

In `src/App.tsx`: add the prop to `<Sidebar ...>`:

```tsx
            onOpenNotificationSettings={onOpenNotificationSettings}
```

and define the callback next to `onOpenInboxIntegrations`:

```ts
  const onOpenNotificationSettings = useCallback(
    (projectPath: string) => {
      setNotificationSettingsProject(projectPath);
      setNotificationSettingsRequest((value) => value + 1);
      openSettings("inbox", "project-notifications");
    },
    [openSettings],
  );
```

with the state declared next to `settingsAnchor`:

```ts
  const [notificationSettingsProject, setNotificationSettingsProject] =
    useState<string | null>(null);
  const [notificationSettingsRequest, setNotificationSettingsRequest] =
    useState(0);
```

Add the anchor now so this call typechecks (the scroll target itself lands in Task 5): in `src/surfaces/SettingsView.tsx` extend the union and the map:

```ts
export type SettingsAnchor =
  | "github"
  | "gitlab"
  | "linear"
  | "jira"
  | "clickup"
  | "notion"
  | "project-notifications";
```

```ts
const ANCHOR_IDS: Record<SettingsAnchor, string> = {
  github: "settings-github",
  gitlab: "settings-gitlab",
  linear: "settings-linear",
  jira: "settings-jira",
  clickup: "settings-clickup",
  notion: "settings-notion",
  "project-notifications": "settings-project-notifications",
};
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run src/chrome/ProjectNotificationMenu.test.ts src/chrome/ProjectRailMuteIndicator.test.ts src/typography.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/chrome/ProjectRail.tsx src/chrome/Sidebar.tsx src/App.tsx src/surfaces/SettingsView.tsx src/chrome/ProjectNotificationMenu.test.ts
git commit -m "Add project mute, resume and settings actions to the rail menu"
```

---

### Task 4: Inbox header notifications button

**Files:**
- Create: `src/chrome/InboxNotificationsButton.tsx`
- Test: Create `src/chrome/InboxNotificationsButton.test.ts`
- Modify: `src/surfaces/InboxView.tsx`
- Modify: `src/App.tsx`
- Test: Restore `src/chrome/InboxNotificationMenu.test.ts` (menu-level)

**Interfaces:**
- Consumes: `InboxNotificationMenu` (`src/chrome/InboxNotificationMenu.tsx`, props `{ x, y, projectPaths, onOpenSettings?, onClose }`), the `InboxView` header button pattern (`data-no-tooltip`, `aria-label`, plain `<button>`), `t`.
- Produces: a new `Bell` icon export in `src/chrome/icons.tsx` and `<InboxNotificationsButton projectPaths={string[]} onOpenSettings={() => void} />`, a plain header button (`aria-label={t("Notifications")}`) that opens the menu below itself.

- [ ] **Step 1: Write the failing test**

```ts
// src/chrome/InboxNotificationsButton.test.ts
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxNotificationsButton } from "./InboxNotificationsButton";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ connected: false })),
  convertFileSrc: (path: string) => path,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("inbox notifications button", () => {
  it("opens the inbox actions menu", async () => {
    await act(async () =>
      root.render(
        createElement(InboxNotificationsButton, {
          projectPaths: ["/repos/work"],
          onOpenSettings: vi.fn(),
        }),
      ),
    );

    const bell = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Notifications"]',
    );
    expect(bell).not.toBeNull();
    await act(async () => bell!.click());
    expect(
      document.querySelector('[role="menu"][aria-label="Inbox actions"]'),
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/chrome/InboxNotificationsButton.test.ts`
Expected: FAIL — cannot resolve `./InboxNotificationsButton`.

- [ ] **Step 3: Create the component**

First, add the bell icon next to `BellOff` in `src/chrome/icons.tsx`:

```ts
import Notification01Icon from "@hugeicons/core-free-icons/Notification01Icon";
```

```ts
export const Bell = wrap(Notification01Icon, "Bell");
```

Then create the button:

```tsx
// src/chrome/InboxNotificationsButton.tsx
import { useRef, useState } from "react";
import { t } from "../i18n";
import { Bell } from "./icons";
import { InboxNotificationMenu } from "./InboxNotificationMenu";

/** Rail-parity Inbox actions: mark all read, mute/resume projects, settings. */
export function InboxNotificationsButton({
  projectPaths,
  onOpenSettings,
}: {
  projectPaths: readonly string[];
  onOpenSettings?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-no-tooltip
        aria-label={t("Notifications")}
        aria-haspopup="menu"
        aria-expanded={menu != null}
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (!rect) return;
          setMenu({ x: rect.right - 244, y: rect.bottom + 4 });
        }}
        className={`grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content ${
          menu ? "bg-content/10 text-content" : ""
        }`}
      >
        <Bell className="size-3.5" strokeWidth={1.75} />
      </button>
      {menu ? (
        <InboxNotificationMenu
          x={menu.x}
          y={menu.y}
          projectPaths={projectPaths}
          onOpenSettings={onOpenSettings}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
```

Add `"Notifications": "Notificações"` to `src/i18n/pt-BR.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/chrome/InboxNotificationsButton.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the Inbox header**

In `src/surfaces/InboxView.tsx`, add `onOpenNotificationSettings?: (projectPath: string) => void;` to the view props, and render the button in the header actions row between the filter and mark-all buttons (`recents` is the view prop and `items` is the `useState<InboxItem[]>` at the top of the same component):

```tsx
          <InboxNotificationsButton
            projectPaths={[
              ...new Set([
                ...recents.map((project) => project.path),
                ...items.map((entry) => entry.projectPath).filter(Boolean),
              ]),
            ]}
            onOpenSettings={() => onOpenNotificationSettings?.(cwd)}
          />
```

In `src/App.tsx`, pass the opener where `<InboxView ...>` is rendered:

```tsx
            onOpenNotificationSettings={onOpenNotificationSettings}
```

- [ ] **Step 6: Restore the menu-level test**

```bash
git show upstream/main:src/chrome/InboxNotificationMenu.test.ts > src/chrome/InboxNotificationMenu.test.ts
```

Adaptations:

1. Replace the `openInboxMenu()` helper body with a direct render:

```ts
async function openInboxMenu() {
  await act(async () =>
    root.render(
      createElement(InboxNotificationMenu, {
        x: 20,
        y: 20,
        projectPaths: ["/repos/private", "/repos/work"],
        onClose: () => {},
      }),
    ),
  );
}
```

and import `InboxNotificationMenu` instead of `ProjectRail`.
2. Delete `it("uses already loaded Inbox activity immediately even when the provider stops responding", ...)` (rail-fetch behavior; our Inbox surfaces cover it).
3. Drop the `vi.mock` entries the file no longer needs (for example provider list/diff-stat mocks) once the file compiles.
4. Keep every localStorage-facing assertion (`markInboxItemsSeen` effects, `mute:1` duration windows, resume, custom timing, error retry).

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/chrome/InboxNotificationsButton.test.ts src/chrome/InboxNotificationMenu.test.ts src/typography.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/chrome/InboxNotificationsButton.tsx src/chrome/InboxNotificationsButton.test.ts src/chrome/InboxNotificationMenu.test.ts src/chrome/icons.tsx src/surfaces/InboxView.tsx src/App.tsx src/i18n/pt-BR.ts
git commit -m "Add Inbox notification actions to the Inbox header"
```

---

### Task 5: Project notifications block in Settings → Inbox

**Files:**
- Modify: `src/surfaces/SettingsView.tsx`
- Modify: `src/App.tsx`
- Test: Create `src/surfaces/SettingsProjectNotifications.test.ts`

**Interfaces:**
- Consumes: `ProjectNotificationSettings` (`src/surfaces/ProjectNotificationSettings.tsx`, props `{ cwd, recents?, notificationProjectPath?, notificationSettingsRequest?, highlighted? }`), `loadRecents()` (`src/lib/recents.ts`), the state added in Task 3 (`notificationSettingsProject`, `notificationSettingsRequest`).
- Produces: `SettingsView` accepts `notificationProjectPath?: string | null` and `notificationSettingsRequest?: number`; the Inbox page renders the block whose id (`settings-project-notifications`) matches the anchor added in Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// src/surfaces/SettingsProjectNotifications.test.ts
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("settings inbox page", () => {
  it("renders the project notifications block and its anchor id", async () => {
    await act(async () =>
      root.render(
        createElement(SettingsView, {
          section: "inbox",
          cwd: "/repo",
          sessions: [],
          onClose: vi.fn(),
          onOpenSession: vi.fn(),
          onArchiveSession: vi.fn(),
          onDeleteSession: vi.fn(),
          onOpenWhatsNew: vi.fn(),
        }),
      ),
    );

    const block = container.querySelector("#settings-project-notifications");
    expect(block).not.toBeNull();
    expect(block!.textContent).toContain("Project notifications");
    expect(
      container.querySelector('[aria-label="Project notifications"]'),
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/surfaces/SettingsProjectNotifications.test.ts`
Expected: FAIL — the Inbox page does not render the block.

- [ ] **Step 3: Render the block on the Inbox page**

In `src/surfaces/SettingsView.tsx` change the render call:

```tsx
            {section === "inbox" ? (
              <InboxPage
                cwd={cwd}
                notificationProjectPath={notificationProjectPath}
                notificationSettingsRequest={notificationSettingsRequest}
              />
            ) : null}
```

and the component:

```tsx
function InboxPage({
  cwd,
  notificationProjectPath = null,
  notificationSettingsRequest = 0,
}: {
  cwd: string;
  notificationProjectPath?: string | null;
  notificationSettingsRequest?: number;
}) {
  const recents = useMemo(() => loadRecents(), []);
  return (
    <div className="flex flex-col gap-4">
      <ProjectNotificationSettings
        cwd={cwd}
        recents={recents}
        notificationProjectPath={notificationProjectPath}
        notificationSettingsRequest={notificationSettingsRequest}
      />
      <GithubSettings />
      <GitlabSettings />
      <LinearSettings />
      <JiraSettings />
      <ClickUpSettings />
      <NotionSettings />
    </div>
  );
}
```

Imports to add: `ProjectNotificationSettings` from `./ProjectNotificationSettings`, `loadRecents` from `../lib/recents`. Check that `useMemo` is imported in SettingsView (it is).

- [ ] **Step 4: Pass the props from App**

In `src/App.tsx`'s `<SettingsView ...>` add:

```tsx
                notificationProjectPath={notificationSettingsProject}
                notificationSettingsRequest={notificationSettingsRequest}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/surfaces/SettingsProjectNotifications.test.ts src/surfaces/ProjectNotificationSettings.test.ts src/chrome/ProjectNotificationMenu.test.ts src/typography.test.ts && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/surfaces/SettingsView.tsx src/surfaces/SettingsProjectNotifications.test.ts src/App.tsx
git commit -m "Render project notification settings on the Settings inbox page"
```

---

### Task 6: Full verification and manual pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, suite and build**

```bash
npx tsc --noEmit
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: 0 type errors, all tests green, build and cargo check succeed.

- [ ] **Step 2: Build and install the app**

```bash
npm run app:mac
```

- [ ] **Step 3: Manual verification**

1. Right-click a project in the rail → "Mutar notificações" → pick "8 horas"; the row shows the amber `BellOff` and the project's `aria-label` mentions the mute; reopening the menu shows "Retomar notificações" with the status.
2. In the same menu pick "Escolher data e hora", set a future time, confirm the mute window.
3. Inbox header bell → "Marcar tudo como lido" clears the unseen badges; "Mutar todos os projetos" mutes every rail project; "Retomar projetos mutados" resumes them; "Configurações de notificação…" opens Settings → Inbox scrolled to the block with that project focused.
4. Settings → Inbox: toggle a category for a project and confirm the choice survives reopening the app; confirm the pt-BR copy in all new surfaces.
5. Confirm no layout shifted: rail rows, Inbox header, and Settings cards keep their existing spacing and typography.

- [ ] **Step 4: Commit any verification fixes**

If manual verification required changes, commit them with a message describing the fix; otherwise there is nothing to commit.
