// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { collectMatchRanges } from "./transcriptFind";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe("collectMatchRanges", () => {
  it("finds every case-insensitive occurrence across text nodes", () => {
    const el = root("<p>foo bar</p><p>FOO <b>foo</b></p>");
    const ranges = collectMatchRanges(el, "foo");
    expect(ranges).toHaveLength(3);
    expect(ranges[0].toString()).toBe("foo");
    el.remove();
  });

  it("returns nothing for a blank query", () => {
    const el = root("<p>foo</p>");
    expect(collectMatchRanges(el, "   ")).toEqual([]);
    el.remove();
  });
});
