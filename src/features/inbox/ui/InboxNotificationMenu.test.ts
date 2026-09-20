// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  loadNotificationPreferences,
  updateNotificationPreferences,
} from "../../notifications/model/notificationPreferences";
import { rememberNotificationProjects } from "../../notifications/model/notificationProjects";
import { InboxNotificationMenu } from "./InboxNotificationMenu";
import { inboxItemKey, type InboxItem } from "../model/githubTasks";
import {
  clearKnownInboxItems,
  isInboxEntryUnseen,
  markInboxItemsSeen,
  rememberInboxItems,
  seedInboxSeenIfNeeded,
} from "../model/inboxSeen";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  clearKnownInboxItems();
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

function button(label: string) {
  const result = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === label
      || (/^\d+ hours?$/.test(label) && item.textContent?.startsWith(`${label} (`)),
  );
  expect(result, label).toBeDefined();
  return result!;
}

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

it("reopens known Inbox actions without a disabled loading frame", async () => {
  await openInboxMenu();
  expect(button("Mute all projects").disabled).toBe(false);
  await openInboxMenu();
  expect(button("Mute all projects").disabled).toBe(false);
  await act(async () => {});
  expect(document.querySelector('[role="status"]')?.textContent).toContain("2 projects");
});

it("keeps unread items and the menu open when marking read fails, then allows retry", async () => {
  const entry = { key: "github:company/work:issue:1", updatedAt: "2026-09-16T10:00:00Z" };
  seedInboxSeenIfNeeded([{ ...entry, updatedAt: "2026-09-15T10:00:00Z" }]);
  rememberInboxItems([{ ...entry, projectPath: "/repos/work" }]);
  await openInboxMenu();
  const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("Storage full");
  });
  act(() => button("Mark all as read").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save read status");
  expect(isInboxEntryUnseen(entry)).toBe(true);
  expect(button("Mark all as read").disabled).toBe(false);
  write.mockRestore();
  act(() => button("Mark all as read").click());
  expect(isInboxEntryUnseen(entry)).toBe(false);
});

it("marks all Inbox providers as read from the menu, including muted projects", async () => {
  const items: InboxItem[] = (["github", "gitlab", "linear"] as const).map((provider) => ({
    provider, kind: "issue", repo: "company/work", number: 1,
    title: "Inbox update", url: `https://${provider}.com/company/work/1`,
    state: "open", updatedAt: "2026-09-16T10:00:00Z",
    labels: [], assignees: [], draft: false, projectPath: "/repos/work",
  }));
  const entries = items.map((item) => ({ key: inboxItemKey(item), updatedAt: item.updatedAt }));
  seedInboxSeenIfNeeded(entries.map((entry) => ({ ...entry, updatedAt: "2026-09-15T10:00:00Z" })));
  updateNotificationPreferences(["local:/repos/work"], { mutedUntil: null });
  rememberInboxItems(items.map((item) => ({
    key: inboxItemKey(item), updatedAt: item.updatedAt, projectPath: item.projectPath,
  })));
  await openInboxMenu();
  expect(entries.every(isInboxEntryUnseen)).toBe(true);
  await act(async () => button("Mark all as read").click());
  expect(entries.some(isInboxEntryUnseen)).toBe(false);
  expect(isInboxEntryUnseen({ ...entries[0]!, updatedAt: "2026-09-16T11:00:00Z" })).toBe(true);
  expect(loadNotificationPreferences()["local:/repos/work"].mutedUntil).toBeNull();
});

it("disables mark all as read for read items and reacts when unread items are read elsewhere", async () => {
  const item: InboxItem = {
    provider: "github", kind: "issue", repo: "company/work", number: 1,
    title: "Inbox update", url: "https://github.com/company/work/issues/1",
    state: "open", updatedAt: "2026-09-16T10:00:00Z",
    labels: [], assignees: [], draft: false, projectPath: "/repos/work",
  };
  const entry = { key: inboxItemKey(item), updatedAt: item.updatedAt };
  seedInboxSeenIfNeeded([entry]);
  rememberInboxItems([{ ...entry, projectPath: item.projectPath }]);
  await openInboxMenu();
  expect(button("Mark all as read").disabled).toBe(true);

  const updated = { ...item, updatedAt: "2026-09-16T11:00:00Z" };
  act(() =>
    rememberInboxItems([
      { ...entry, updatedAt: updated.updatedAt, projectPath: item.projectPath },
    ]),
  );
  await openInboxMenu();
  expect(button("Mark all as read").disabled).toBe(false);
  act(() => markInboxItemsSeen([{ ...entry, updatedAt: updated.updatedAt }]));
  expect(button("Mark all as read").disabled).toBe(true);
});

it("mutes all known Inbox projects for one hour directly from Inbox", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date(2030, 0, 15, 20, 30).getTime());
  rememberNotificationProjects([
    {
      id: "linear:project:planning",
      name: "Planning",
      detail: "Linear",
      kind: "linear",
      paths: [],
    },
  ]);
  await openInboxMenu();
  act(() => button("Mute all projects").click());
  expect(button("1 hour").textContent).toBe("1 hour (21:30)");
  expect(button("4 hours").textContent).toBe("4 hours (Tomorrow, 0:30)");
  expect(button("8 hours").textContent).toBe("8 hours (Tomorrow, 4:30)");
  expect(button("Until resumed").textContent).toBe("Until resumed");
  expect(button("Choose date and time").textContent).toBe("Choose date and time");
  const start = Date.now();
  act(() => button("1 hour").click());
  const preferences = loadNotificationPreferences();
  expect(Object.keys(preferences).sort()).toEqual([
    "linear:project:planning",
    "local:/repos/private",
    "local:/repos/work",
  ]);
  for (const preference of Object.values(preferences)) {
    expect(preference.mutedUntil).toBeGreaterThanOrEqual(start + 3_600_000);
    expect(preference.mutedUntil).toBeLessThanOrEqual(Date.now() + 3_600_000);
  }
});

it("offers explicit all-project actions without an implicit active-project exclusion", async () => {
  rememberNotificationProjects([
    {
      id: "repository:github.com/company/work",
      name: "company/work",
      detail: "github.com",
      kind: "repository",
      paths: [],
    },
  ]);
  updateNotificationPreferences(["repository:github.com/company/work"], {
    disabled: ["issues"],
  });
  await openInboxMenu();
  expect(document.body.textContent).not.toContain("Mute other projects");
  expect(document.body.textContent).not.toContain("Keeps");
  act(() => button("Mute all projects").click());
  act(() => button("Until resumed").click());
  expect(loadNotificationPreferences()).toEqual({
    "repository:github.com/company/work": {
      disabled: ["issues"],
      mutedUntil: null,
    },
    "local:/repos/private": { disabled: [], mutedUntil: null },
    "local:/repos/work": { disabled: [], mutedUntil: null },
  });
});

it("resumes muted projects without changing category choices or unmuted projects", async () => {
  updateNotificationPreferences(["local:/repos/work"], {
    disabled: ["issues"],
    mutedUntil: null,
  });
  updateNotificationPreferences(["local:/repos/private"], {
    disabled: ["agentFinished"],
  });
  await openInboxMenu();
  act(() => button("Resume muted projects").click());
  expect(loadNotificationPreferences()).toEqual({
    "local:/repos/work": {
      disabled: ["issues"],
      resumedAt: expect.any(Number),
    },
    "local:/repos/private": { disabled: ["agentFinished"] },
  });
  await openInboxMenu();
  expect(button("Resume muted projects").disabled).toBe(true);
});

it("opens custom timing from the duration submenu for all projects", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(new Date(2030, 0, 15, 9).getTime());
  await openInboxMenu();
  act(() => button("Mute all projects").click());
  act(() => button("Choose date and time").click());
  expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  expect([...document.querySelectorAll("button")].some(item => item.textContent === "1 hour")).toBe(false);
  act(() => document.querySelector<HTMLButtonElement>('button[aria-label="2030-01-16"]')!.click());
  const input = document.querySelector<HTMLInputElement>('input[placeholder="HH:mm"]');
  expect(input).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "12:00");
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => button("Mute until then").click());
  expect(loadNotificationPreferences()).toEqual({
    "local:/repos/work": {
      disabled: [],
      mutedUntil: new Date(2030, 0, 16, 12).getTime(),
    },
    "local:/repos/private": {
      disabled: [],
      mutedUntil: new Date(2030, 0, 16, 12).getTime(),
    },
  });
  now.mockRestore();
});

it("keeps the menu open and reports failed persistence so the action can be retried", async () => {
  await openInboxMenu();
  act(() => button("Mute all projects").click());
  const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("Storage full");
  });
  act(() => button("4 hours").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not save",
  );
  expect(loadNotificationPreferences()).toEqual({});
  expect(
    document.querySelector('[role="menu"][aria-label="Inbox actions"]'),
  ).not.toBeNull();
  write.mockRestore();
  act(() => button("4 hours").click());
  expect(Object.keys(loadNotificationPreferences())).toHaveLength(2);
});

it("keeps every known project path actionable from the menu", async () => {
  await openInboxMenu();
  expect(button("Mute all projects").disabled).toBe(false);

  act(() => button("Mute all projects").click());
  act(() => button("Until resumed").click());
  expect(loadNotificationPreferences()).toEqual({
    "local:/repos/private": { disabled: [], mutedUntil: null },
    "local:/repos/work": { disabled: [], mutedUntil: null },
  });
});
