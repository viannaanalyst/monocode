// @vitest-environment happy-dom
import { act, createElement, type CSSProperties, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/harness/availability", () => ({
  getHarnessAvailabilitySnapshot: () => 0,
  hasProbedHarnessAvailability: () => true,
  isHarnessAvailable: () => true,
  probeHarnessAvailability: () => Promise.resolve(),
  subscribeHarnessAvailability: () => () => undefined,
}));

vi.mock("../lib/harness/registry", () => ({
  refreshHarnessCatalogs: () => Promise.resolve(),
}));

vi.mock("./Popover", () => ({
  Popover: ({
    children,
    role,
    className,
    tabIndex,
    onKeyDown,
    ...props
  }: {
    children: ReactNode;
    role?: string;
    className?: string;
    tabIndex?: number;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    style?: CSSProperties;
    "aria-label"?: string;
    "data-model-picker"?: boolean;
  }) =>
    createElement(
      "div",
      {
        role,
        className,
        tabIndex,
        onKeyDown,
        style: props.style,
        "aria-label": props["aria-label"],
        "data-model-picker": props["data-model-picker"] ? "" : undefined,
      },
      children,
    ),
}));

import { ModelPicker } from "./ModelPicker";
import {
  resetHarnessModelOverlays,
  saveRecentModelChoice,
  setHarnessModels,
} from "../lib/models";
import {
  setHarnessModelsEnabled,
  setModelEnabled,
} from "../lib/modelVisibility";
import { HARNESSES, HARNESS_TITLE } from "../lib/session";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
  resetHarnessModelOverlays();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetHarnessModelOverlays();
  vi.unstubAllGlobals();
});

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="menu"]',
  )!;
}

function openMenu() {
  act(() => trigger().click());
  return container.querySelector<HTMLElement>(
    '[role="menu"][aria-label="Model and effort"]',
  )!;
}

function openModelsList(): HTMLElement {
  const menu = openMenu();
  const modelButton = [
    ...menu.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.getAttribute("aria-haspopup") === "menu")!;
  act(() => modelButton.click());
  return container.querySelector<HTMLElement>(
    '[role="menu"][aria-label="Select model"]',
  )!;
}

function providerRow(harness: HarnessId): HTMLButtonElement {
  const list = container.querySelector<HTMLElement>(
    '[role="menu"][aria-label="Select model"]',
  )!;
  return list.querySelector<HTMLButtonElement>(
    `button[data-provider-harness="${harness}"]`,
  )!;
}

function openProvider(harness: HarnessId): HTMLElement {
  act(() => providerRow(harness).click());
  return container.querySelector<HTMLElement>(
    `[role="menu"][aria-label="${HARNESS_TITLE[harness]}"]`,
  )!;
}

describe("model picker", () => {
  it("keeps effort in the anchored panel and changes it on the slider", () => {
    const onChange = vi.fn();
    const onSettingsChange = vi.fn();
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "grok",
          model: "grok:grok-4.6",
          values: { effort: "high" },
          onChange,
          onSettingsChange,
        }),
      ),
    );

    expect(trigger().textContent).toContain("Grok 4.6");
    expect(trigger().getAttribute("title")).toBeNull();
    expect(trigger().className).not.toMatch(/max-w-40/);
    expect(trigger().querySelector("span")?.className).not.toMatch(/truncate/);

    const menu = openMenu();
    expect(menu).not.toBeNull();
    expect(
      document.querySelector('[role="dialog"][aria-label="Select model"]'),
    ).toBeNull();

    const effortSlider = container.querySelector<HTMLElement>(
      '[role="slider"][aria-label="Effort"]',
    )!;
    expect(effortSlider).not.toBeNull();
    Object.defineProperty(effortSlider, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 100,
        bottom: 20,
        width: 100,
        height: 20,
        toJSON: () => ({}),
      }),
    });
    act(() => {
      effortSlider.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 98,
          pointerId: 1,
        }),
      );
    });

    expect(onSettingsChange).toHaveBeenCalledWith({ effort: "xhigh" });
    expect(
      container.querySelector('[role="menu"][aria-label="Model and effort"]'),
    ).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the full model name in the composer trigger", () => {
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "cursor",
          model: "cursor:grok-4.6",
          values: {},
          onChange: vi.fn(),
          onSettingsChange: vi.fn(),
        }),
      ),
    );

    expect(trigger().textContent).toContain("Cursor Grok 4.6");
    expect(trigger().textContent).not.toContain("…");
    expect(trigger().className).not.toMatch(/max-w-40/);
    expect(trigger().querySelector("span")?.className).not.toMatch(/truncate/);
  });

  it("groups models by provider and opens a provider submenu", () => {
    for (const harness of HARNESSES) setHarnessModelsEnabled(harness, true);
    setModelEnabled("grok:grok-4.5", false);
    setModelEnabled("opencode:grok-4.5", false);
    const onChange = vi.fn();
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "grok",
          model: "grok:grok-4.6",
          values: { effort: "high" },
          onChange,
          onSettingsChange: vi.fn(),
        }),
      ),
    );

    const list = openModelsList();
    expect(list).not.toBeNull();
    expect(list.querySelector('input[aria-label="Search models"]')).toBeNull();
    expect(list.textContent).not.toContain("Recommended set of models");
    const providers = [
      ...list.querySelectorAll<HTMLButtonElement>("[data-provider-harness]"),
    ];
    expect(providers.map((el) => el.getAttribute("data-provider-harness"))).toEqual(
      expect.arrayContaining(["grok", "cursor"]),
    );
    expect(list.querySelector('[role="menuitemradio"]')).toBeNull();
    expect(
      document.querySelector('[role="dialog"][aria-label="Select model"]'),
    ).toBeNull();

    const grokOptions = [
      ...openProvider("grok").querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ),
    ];
    expect(
      grokOptions.some((option) => option.textContent?.includes("Grok 4.6")),
    ).toBe(true);
    expect(
      grokOptions.some((option) => option.textContent?.includes("Grok 4.5")),
    ).toBe(false);

    const cursorOptions = [
      ...openProvider("cursor").querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ),
    ];
    expect(
      cursorOptions.some((option) => option.textContent?.includes("Composer 2.5")),
    ).toBe(true);
    expect(
      cursorOptions.some((option) =>
        option.textContent?.includes("Cursor Grok 4.6"),
      ),
    ).toBe(true);
  });

  it("picks a model from a provider submenu", () => {
    setHarnessModelsEnabled("grok", true);
    const onChange = vi.fn();
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "grok",
          model: "grok:grok-4.6",
          values: { effort: "high" },
          onChange,
          onSettingsChange: vi.fn(),
        }),
      ),
    );

    openModelsList();
    const grokMenu = openProvider("grok");
    const target = [
      ...grokMenu.querySelectorAll<HTMLButtonElement>(
        '[data-picker-harness="grok"][role="menuitemradio"]',
      ),
    ].find((option) => option.textContent?.includes("Grok 4.5"))!;
    act(() => target.click());

    expect(onChange).toHaveBeenCalledWith("grok", "grok:grok-4.5");
  });

  it("keeps Codex reasoning on the slider and its speed tier on the lightning", () => {
    setHarnessModels("codex", [
      {
        id: "codex:test",
        harness: "codex",
        name: "GPT Test",
        settings: [
          {
            id: "reasoningEffort",
            label: "Reasoning",
            kind: "select",
            value: "medium",
            options: [
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ],
          },
          {
            id: "serviceTier",
            label: "Service Tier",
            kind: "select",
            value: "default",
            options: [
              { value: "default", label: "Standard" },
              { value: "fast", label: "Fast" },
            ],
          },
        ],
      },
    ]);
    setHarnessModelsEnabled("codex", true);
    const onSettingsChange = vi.fn();
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "codex",
          model: "codex:test",
          values: { reasoningEffort: "medium", serviceTier: "default" },
          onChange: vi.fn(),
          onSettingsChange,
        }),
      ),
    );

    const menu = openMenu();
    expect(menu.querySelector('[role="slider"]')).not.toBeNull();
    expect(menu.textContent).not.toContain("Reasoning");
    expect(menu.textContent).not.toContain("Service Tier");

    const zap = menu.querySelector<HTMLButtonElement>(
      'button[aria-label="Fast"]',
    )!;
    expect(zap.getAttribute("aria-checked")).toBe("false");
    act(() => zap.click());
    expect(onSettingsChange).toHaveBeenCalledWith({
      reasoningEffort: "medium",
      serviceTier: "fast",
    });
  });

  it("quick-switches between recently used models on right-click", () => {
    saveRecentModelChoice("claude", "claude:opus-5");
    saveRecentModelChoice("cursor", "cursor:composer-2.5");
    const onChange = vi.fn();
    act(() =>
      root.render(
        createElement(ModelPicker, {
          harness: "grok",
          model: "grok:grok-4.6",
          values: { effort: "high" },
          hotkeys: true,
          onChange,
          onSettingsChange: vi.fn(),
        }),
      ),
    );

    act(() => {
      trigger().dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
        }),
      );
    });

    const recentMenu = container.querySelector<HTMLElement>(
      '[role="menu"][aria-label="Recently used models"]',
    )!;
    const recentItems = [
      ...recentMenu.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ),
    ];
    expect(recentItems).toHaveLength(3);
    const cursorModel = recentItems.find((item) =>
      item.textContent?.includes("Composer 2.5"),
    )!;

    act(() => cursorModel.click());
    expect(onChange).toHaveBeenCalledWith("cursor", "cursor:composer-2.5");
  });
});
