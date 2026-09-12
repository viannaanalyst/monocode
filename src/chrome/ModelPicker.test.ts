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
import { saveRecentModelChoice } from "../lib/models";

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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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

function openModelsModal(): HTMLElement {
  const menu = openMenu();
  const modelButton = [
    ...menu.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.includes("Grok 4.6"))!;
  act(() => modelButton.click());
  return document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Select model"]',
  )!;
}

describe("model picker", () => {
  it("keeps the model and effort in one panel and opens the models modal", () => {
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

    const modal = openModelsModal();
    expect(modal).not.toBeNull();
    expect(
      modal.querySelector('input[aria-label="Search models"]'),
    ).not.toBeNull();
    expect(
      [...modal.querySelectorAll('[role="menuitemradio"]')].some((option) =>
        option.textContent?.includes("Grok 4.6"),
      ),
    ).toBe(true);

    const effortSlider = container.querySelector<HTMLInputElement>(
      'input[aria-label="Effort"]',
    )!;
    expect(effortSlider).not.toBeNull();
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setValue.call(effortSlider, "3");
      effortSlider.dispatchEvent(new Event("input", { bubbles: true }));
      effortSlider.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onSettingsChange).toHaveBeenCalledWith({ effort: "xhigh" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks a model from the centered modal", () => {
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

    const modal = openModelsModal();
    const target = [
      ...modal.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ].find((option) => option.textContent?.includes("Grok 4.5"))!;
    act(() => target.click());

    expect(onChange).toHaveBeenCalledWith("grok", "grok:grok-4.5");
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
