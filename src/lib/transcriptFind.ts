/**
 * In-conversation find. Matches plain text occurrences across the rendered
 * transcript and paints every hit with the CSS Custom Highlight API, so the
 * native selection (and its "add to chat" menu) is left untouched.
 */

export const FIND_ALL_HIGHLIGHT = "monocode-find";
export const FIND_ACTIVE_HIGHLIGHT = "monocode-find-active";

export function collectMatchRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.trim();
  if (!needle) return [];
  const lower = needle.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    if (text) {
      const hay = text.toLowerCase();
      let from = 0;
      let index = hay.indexOf(lower, from);
      while (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        ranges.push(range);
        from = index + lower.length;
        index = hay.indexOf(lower, from);
      }
    }
    node = walker.nextNode();
  }
  return ranges;
}

function highlightSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

export function applyFindHighlights(
  ranges: readonly Range[],
  active: Range | null,
): void {
  if (!highlightSupported()) return;
  const registry = CSS.highlights;
  if (ranges.length === 0) {
    registry.delete(FIND_ALL_HIGHLIGHT);
  } else {
    registry.set(FIND_ALL_HIGHLIGHT, new Highlight(...ranges));
  }
  if (active) {
    registry.set(FIND_ACTIVE_HIGHLIGHT, new Highlight(active));
  } else {
    registry.delete(FIND_ACTIVE_HIGHLIGHT);
  }
}

export function clearFindHighlights(): void {
  if (!highlightSupported()) return;
  CSS.highlights.delete(FIND_ALL_HIGHLIGHT);
  CSS.highlights.delete(FIND_ACTIVE_HIGHLIGHT);
}

function rangeElement(range: Range): HTMLElement | null {
  const node = range.startContainer;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return el instanceof HTMLElement ? el : null;
}

/** Scrolls a range into view without moving the document selection. */
export function scrollRangeIntoView(range: Range, root: HTMLElement): void {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // Match inside folded/hidden content: let the browser find the nearest
    // scrollable ancestor instead of guessing from a degenerate rect.
    const el = rangeElement(range);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    root.scrollTo({ top: root.scrollHeight });
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const target =
    root.scrollTop + (rect.top - rootRect.top) - rootRect.height / 2;
  root.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
}
