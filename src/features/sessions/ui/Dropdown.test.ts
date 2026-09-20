// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Dropdown } from "./Dropdown";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

describe("Dropdown", () => {
  it("shows the selected label and no native tooltip", () => {
    const markup = renderToStaticMarkup(
      createElement(Dropdown, {
        value: "daily",
        options: OPTIONS,
        onChange: vi.fn(),
        ariaLabel: "Schedule",
      }),
    );
    expect(markup).toContain("Daily");
    expect(markup).toContain('data-no-tooltip');
    expect(markup).not.toContain("title=");
    expect(markup).toContain('aria-haspopup="menu"');
  });

  it("opens the app menu and reports the picked value", async () => {
    const onChange = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(Dropdown, {
          value: "daily",
          options: OPTIONS,
          onChange,
          ariaLabel: "Schedule",
        }),
      );
    });

    const trigger = () =>
      [...host.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-haspopup") === "menu",
      );
    expect(trigger()?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      trigger()!.click();
    });
    const items = [...document.body.querySelectorAll('[role="menuitemradio"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      "Every hour",
      "Daily",
      "Weekly",
    ]);

    await act(async () => {
      items[2]!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("weekly");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
