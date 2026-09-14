// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrReviewBar } from "./PrReviewBar";

const draft = {
  comments: [
    { id: "right:a.ts:3", path: "a.ts", line: 3, side: "right" as const, body: "nit" },
    { id: "left:b.ts:9", path: "b.ts", line: 9, side: "left" as const, body: "drop this" },
  ],
};

describe("PrReviewBar", () => {
  it("lists pending comments with locations", () => {
    const markup = renderToStaticMarkup(
      createElement(PrReviewBar, {
        draft,
        busy: null,
        onSubmit: () => {},
        onDiscard: () => {},
        onEdit: () => {},
        onRemove: () => {},
      }),
    );
    expect(markup).toContain("2 review comments");
    expect(markup).toContain("a.ts:3");
    expect(markup).toContain("b.ts:9");
    expect(markup).toContain("Submit review");
    expect(markup).toContain("Discard review");
  });

  it("disables submit while empty", () => {
    const markup = renderToStaticMarkup(
      createElement(PrReviewBar, {
        draft: { comments: [] },
        busy: null,
        onSubmit: () => {},
        onDiscard: () => {},
        onEdit: () => {},
        onRemove: () => {},
      }),
    );
    expect(markup).toContain("No pending comments");
    expect(markup).toMatch(/disabled/);
  });
});

describe("PrReviewBar inline editing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function button(label: string): HTMLButtonElement {
    const match = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }

  function renderBar(onEdit = vi.fn()) {
    act(() =>
      root.render(
        createElement(PrReviewBar, {
          draft,
          busy: null,
          onSubmit: () => {},
          onDiscard: () => {},
          onEdit,
          onRemove: () => {},
        }),
      ),
    );
    return onEdit;
  }

  function type(body: string, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(body, value);
      body.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("edits a comment inline without calling window.prompt", () => {
    expect(window.prompt).toBeUndefined();
    const onEdit = renderBar();
    act(() => button("Edit").click());

    const editor = container.querySelector("textarea");
    expect(editor).not.toBeNull();
    expect(editor!.value).toBe("nit");

    type(editor!, "  nit fixed  ");
    act(() => button("Save").click());

    expect(onEdit).toHaveBeenCalledWith("right:a.ts:3", "nit fixed");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("disables Save while the edit is empty and cancels it", () => {
    renderBar();
    act(() => button("Edit").click());

    const editor = container.querySelector("textarea")!;
    type(editor, "   ");
    expect(button("Save").disabled).toBe(true);

    type(editor, "kept");
    expect(button("Save").disabled).toBe(false);

    act(() => button("Cancel").click());
    expect(container.querySelector("textarea")).toBeNull();
  });
});
