// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DebugChip,
  DebugMenuRow,
  GoalChip,
  GoalEditor,
  GoalMenuRow,
} from "./ComposerModes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("composer goal and debug modes", () => {
  it("shows the goal text in the menu row and the chip", () => {
    const goal = { text: "Ship the login screen", createdAt: 1 };
    const row = renderToStaticMarkup(
      createElement(GoalMenuRow, { goal, onEdit: vi.fn() }),
    );
    expect(row).toContain("Ship the login screen");
    const chip = renderToStaticMarkup(
      createElement(GoalChip, {
        goal,
        onEdit: vi.fn(),
        onClear: vi.fn(),
        onResolve: vi.fn(),
      }),
    );
    expect(chip).toContain("Ship the login screen");
    expect(chip).not.toContain("Complete goal");
  });

  it("truncates a long goal in the chip and shows the completion actions", () => {
    const goal = {
      text: "Fazer o preview de anexos funcionar em todos os formularios",
      createdAt: 1,
      completedAt: 2,
    };
    const chip = renderToStaticMarkup(
      createElement(GoalChip, {
        goal,
        onEdit: vi.fn(),
        onClear: vi.fn(),
        onResolve: vi.fn(),
      }),
    );
    expect(chip).toContain("…");
    expect(chip).toContain('aria-label="Complete goal"');
    expect(chip).toContain('aria-label="Keep pursuing"');
  });

  it("marks the debug rows when active", () => {
    const off = renderToStaticMarkup(
      createElement(DebugMenuRow, { active: false, onToggle: vi.fn() }),
    );
    const on = renderToStaticMarkup(
      createElement(DebugMenuRow, { active: true, onToggle: vi.fn() }),
    );
    expect(off).not.toContain('aria-pressed="true"');
    expect(on).toContain('aria-pressed="true"');
    expect(
      renderToStaticMarkup(createElement(DebugChip, { onDisable: vi.fn() })),
    ).toContain("Debug");
  });

  it("hides the goal chip and renders the empty menu row without a goal", () => {
    expect(
      renderToStaticMarkup(
        createElement(GoalChip, {
          onEdit: vi.fn(),
          onClear: vi.fn(),
          onResolve: vi.fn(),
        }),
      ),
    ).toBe("");
    const row = renderToStaticMarkup(
      createElement(GoalMenuRow, { onEdit: vi.fn() }),
    );
    expect(row).toContain("Set a goal to keep pursuing");
  });

  it("clears the goal on an empty save and saves a trimmed text otherwise", async () => {
    const onSave = vi.fn();
    const onClear = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(GoalEditor, {
          anchor: null,
          goal: { text: "Ship the login screen", createdAt: 1 },
          onSave,
          onClear,
          onClose: vi.fn(),
        }),
      );
    });

    const buttons = () => [...document.body.querySelectorAll("button")];
    const saveButton = () =>
      buttons().find((button) => button.textContent === "Save");
    expect(saveButton()).toBeDefined();
    expect(
      buttons().some((button) => button.textContent === "Clear"),
    ).toBe(true);

    const textarea = document.body.querySelector("textarea");
    expect(textarea).not.toBeNull();
    await act(async () => {
      setTextareaValue(textarea!, "   ");
    });
    await act(async () => {
      saveButton()!.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      setTextareaValue(textarea!, "  Ship the next screen  ");
    });
    await act(async () => {
      saveButton()!.click();
    });
    expect(onSave).toHaveBeenCalledWith("Ship the next screen");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
