import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
