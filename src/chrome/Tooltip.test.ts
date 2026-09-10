// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTooltipTarget,
  TooltipLayer,
  tooltipPosition,
  tooltipText,
} from "./Tooltip";
import { resetLocaleForTests, saveLocale } from "../i18n";

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  resetLocaleForTests();
});

function renderLayer() {
  act(() => {
    root.render(
      createElement(
        TooltipLayer,
        null,
        createElement(
          "button",
          { title: "New terminal", "aria-label": "Create terminal" },
          "New",
        ),
      ),
    );
  });

  return container.querySelector("button")!;
}

function renderTwoActions() {
  act(() => {
    root.render(
      createElement(
        TooltipLayer,
        null,
        createElement("button", { title: "Action A" }, "A"),
        createElement("button", { title: "Action B" }, "B"),
      ),
    );
  });

  return container.querySelectorAll("button");
}

function dispatchWithRelatedTarget(
  target: HTMLElement,
  type: "pointerout" | "focusout",
  relatedTarget: EventTarget | null,
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  target.dispatchEvent(event);
}

function tooltip() {
  return document.body.querySelector('[role="tooltip"]');
}

describe("tooltipText", () => {
  it("prefers title over aria-label", () => {
    const button = document.createElement("button");
    button.title = "New Terminal";
    button.setAttribute("aria-label", "Open terminal");
    expect(tooltipText(button)).toBe("New Terminal");
  });

  it("translates title and aria-label in Portuguese", () => {
    saveLocale("pt-BR");
    const button = document.createElement("button");
    button.title = "New Terminal";
    expect(tooltipText(button)).toBe("Novo terminal");
    button.removeAttribute("title");
    button.setAttribute("aria-label", "Settings");
    expect(tooltipText(button)).toBe("Ajustes");
  });

  it("falls back to aria-label and ignores disabled controls", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Settings");
    expect(tooltipText(button)).toBe("Settings");
    button.disabled = true;
    expect(isTooltipTarget(button)).toBe(false);
  });

  it("accepts enabled links and role buttons", () => {
    const link = document.createElement("a");
    link.title = "Open docs";
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    roleButton.setAttribute("aria-label", "Run");

    expect(isTooltipTarget(link)).toBe(true);
    expect(isTooltipTarget(roleButton)).toBe(true);
  });

  it("rejects hidden, aria-disabled, and empty-label controls", () => {
    const hidden = document.createElement("button");
    hidden.title = "Hidden";
    hidden.setAttribute("aria-hidden", "true");
    const ariaDisabled = document.createElement("button");
    ariaDisabled.title = "Disabled";
    ariaDisabled.setAttribute("aria-disabled", "true");
    const empty = document.createElement("button");
    empty.title = "   ";
    empty.setAttribute("aria-label", "  ");

    expect(isTooltipTarget(hidden)).toBe(false);
    expect(isTooltipTarget(ariaDisabled)).toBe(false);
    expect(isTooltipTarget(empty)).toBe(false);
  });

  it("rejects a labeled button inside a disabled fieldset", () => {
    const fieldset = document.createElement("fieldset");
    fieldset.disabled = true;
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Settings");
    fieldset.append(button);

    expect(isTooltipTarget(button)).toBe(false);
  });

  it("accepts a labeled button inside the first legend of a disabled fieldset", () => {
    const fieldset = document.createElement("fieldset");
    fieldset.disabled = true;
    const legend = document.createElement("legend");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Settings");
    legend.append(button);
    fieldset.append(legend);

    expect(isTooltipTarget(button)).toBe(true);
  });

  it("rejects inputs even when they have role button and a label", () => {
    const input = document.createElement("input");
    input.setAttribute("role", "button");
    input.setAttribute("aria-label", "Run");
    const disabledInput = document.createElement("input");
    disabledInput.disabled = true;
    disabledInput.setAttribute("role", "button");
    disabledInput.setAttribute("aria-label", "Run disabled");

    expect(isTooltipTarget(input)).toBe(false);
    expect(isTooltipTarget(disabledInput)).toBe(false);
  });
});

describe("tooltipPosition", () => {
  it("keeps tooltip coordinates inside the viewport", () => {
    const result = tooltipPosition(
      new DOMRect(2, 740, 24, 24),
      { width: 120, height: 28 },
      { width: 800, height: 768 },
    );
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + 28).toBeLessThanOrEqual(760);
  });

  it("places the tooltip below the anchor when there is room", () => {
    expect(
      tooltipPosition(
        new DOMRect(200, 100, 40, 24),
        { width: 120, height: 28 },
        { width: 800, height: 768 },
      ),
      ).toEqual({ left: 160, top: 132, placement: "bottom" });
  });

  it("places the tooltip above when asked", () => {
    expect(
      tooltipPosition(
        new DOMRect(200, 100, 40, 24),
        { width: 120, height: 28 },
        { width: 800, height: 768 },
        8,
        "top",
      ),
    ).toEqual({ left: 160, top: 64, placement: "top" });
  });
});

describe("TooltipLayer", () => {
  it("opens a hovered action after 160ms", () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(159);
    });
    expect(tooltip()).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(tooltip()?.textContent).toBe("New terminal");
  });

  it("does not open when the pointer leaves before 160ms", () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      button.dispatchEvent(new Event("pointerout", { bubbles: true }));
      vi.advanceTimersByTime(160);
    });

    expect(tooltip()).toBeNull();
  });

  it("opens a focused action after 160ms", () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("focusin", { bubbles: true }));
      vi.advanceTimersByTime(160);
    });

    expect(tooltip()?.textContent).toBe("New terminal");
  });

  it("restores the native title after leaving without changing aria-label", () => {
    const button = renderLayer();

    act(() => button.dispatchEvent(new Event("pointerover", { bubbles: true })));
    expect(button.getAttribute("title")).toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Create terminal");

    act(() => button.dispatchEvent(new Event("pointerout", { bubbles: true })));
    expect(button.getAttribute("title")).toBe("New terminal");
    expect(button.getAttribute("aria-label")).toBe("Create terminal");
  });

  it("keeps A title suppressed when pointer remains on A and focus moves to B", () => {
    const [actionA, actionB] = renderTwoActions();

    act(() => {
      actionA.dispatchEvent(new Event("pointerover", { bubbles: true }));
      actionB.dispatchEvent(new Event("focusin", { bubbles: true }));
    });

    expect(actionA.getAttribute("title")).toBeNull();
    expect(actionB.getAttribute("title")).toBeNull();

    act(() => {
      dispatchWithRelatedTarget(actionA, "pointerout", null);
    });
    expect(actionA.getAttribute("title")).toBe("Action A");
    expect(actionB.getAttribute("title")).toBeNull();

    act(() => {
      dispatchWithRelatedTarget(actionB, "focusout", null);
    });
    expect(actionB.getAttribute("title")).toBe("Action B");
  });

  it("keeps A title suppressed when focus remains on A and pointer enters B", () => {
    const [actionA, actionB] = renderTwoActions();

    act(() => {
      actionA.dispatchEvent(new Event("focusin", { bubbles: true }));
      actionB.dispatchEvent(new Event("pointerover", { bubbles: true }));
    });

    expect(actionA.getAttribute("title")).toBeNull();
    expect(actionB.getAttribute("title")).toBeNull();
  });

  it("closes an open tooltip when its target becomes aria-disabled", async () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(160);
    });
    expect(tooltip()?.textContent).toBe("New terminal");

    await act(async () => {
      button.setAttribute("aria-disabled", "true");
      await Promise.resolve();
    });

    expect(tooltip()).toBeNull();
  });

  it("closes an open tooltip when its target becomes disabled", async () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(160);
    });

    await act(async () => {
      button.disabled = true;
      await Promise.resolve();
    });

    expect(tooltip()).toBeNull();
    expect(button.getAttribute("title")).toBeNull();

    act(() => {
      dispatchWithRelatedTarget(button, "pointerout", null);
    });
    expect(button.getAttribute("title")).toBe("New terminal");
  });

  it("closes an open tooltip when its target becomes aria-hidden", async () => {
    const button = renderLayer();

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(160);
    });

    await act(async () => {
      button.setAttribute("aria-hidden", "true");
      await Promise.resolve();
    });

    expect(tooltip()).toBeNull();
  });

  it("keeps the tooltip active when pointer moves to a descendant", () => {
    act(() => {
      root.render(
        createElement(
          TooltipLayer,
          null,
          createElement(
            "button",
            { title: "Nested action" },
            createElement("span", null, "Nested"),
          ),
        ),
      );
    });
    const button = container.querySelector("button")!;
    const child = button.querySelector("span")!;

    act(() => {
      button.dispatchEvent(new Event("pointerover", { bubbles: true }));
      dispatchWithRelatedTarget(button, "pointerout", child);
      vi.advanceTimersByTime(160);
    });

    expect(tooltip()?.textContent).toBe("Nested action");
    expect(button.getAttribute("title")).toBeNull();
  });
});
