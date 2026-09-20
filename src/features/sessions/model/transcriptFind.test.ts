// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { collectMatchRanges, scrollRangeIntoView } from "./transcriptFind";

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

describe("scrollRangeIntoView", () => {
  function spanRange(text = "match"): { range: Range; span: HTMLElement } {
    const span = document.createElement("span");
    span.textContent = text;
    document.body.append(span);
    const range = document.createRange();
    range.setStart(span.firstChild as Text, 0);
    range.setEnd(span.firstChild as Text, text.length);
    return { range, span };
  }

  it("falls back to element scrollIntoView for hidden (zero) rects", () => {
    const { range, span } = spanRange();
    const root = document.createElement("div");
    const intoView = vi.fn();
    span.scrollIntoView = intoView;
    range.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 0, height: 0 }) as DOMRect;
    scrollRangeIntoView(range, root);
    expect(intoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
    });
    span.remove();
  });

  it("centers a visible match inside the scroller", () => {
    const { range, span } = spanRange();
    const root = document.createElement("div");
    const scrollTo = vi.fn();
    root.scrollTo = scrollTo;
    root.scrollTop = 100;
    range.getBoundingClientRect = () =>
      ({ top: 700, left: 0, width: 40, height: 16 }) as DOMRect;
    root.getBoundingClientRect = () =>
      ({ top: 500, left: 0, width: 800, height: 600 }) as DOMRect;
    scrollRangeIntoView(range, root);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    span.remove();
  });
});
