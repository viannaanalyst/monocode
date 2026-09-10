import type { ReactElement, ReactNode } from "react";

const VIEWPORT_INSET = 8;

export function tooltipText(element: Element): string | null {
  const title = element.getAttribute("title")?.trim();
  if (title) return title;

  const ariaLabel = element.getAttribute("aria-label")?.trim();
  return ariaLabel || null;
}

export function isTooltipTarget(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.getAttribute("aria-hidden")?.toLowerCase() === "true") {
    return false;
  }
  if (element.getAttribute("aria-disabled")?.toLowerCase() === "true") {
    return false;
  }
  if (element instanceof HTMLInputElement) return false;
  if (element.matches(":disabled")) return false;

  const disabledFieldset = element.closest("fieldset:disabled");
  if (disabledFieldset) {
    const firstLegend = Array.from(disabledFieldset.children).find(
      (child) => child.tagName === "LEGEND",
    );
    if (!firstLegend?.contains(element)) return false;
  }

  const isButton =
    element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement ||
    element.getAttribute("role") === "button";
  return isButton && tooltipText(element) !== null;
}

export function tooltipPosition(
  anchor: DOMRect,
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = VIEWPORT_INSET,
): { left: number; top: number; placement: "top" | "bottom" } {
  const maxLeft = Math.max(
    VIEWPORT_INSET,
    viewport.width - VIEWPORT_INSET - tooltip.width,
  );
  const centeredLeft = anchor.left + (anchor.width - tooltip.width) / 2;
  const left = Math.min(maxLeft, Math.max(VIEWPORT_INSET, centeredLeft));

  const bottomTop = anchor.bottom + gap;
  const bottomFits =
    bottomTop + tooltip.height <= viewport.height - VIEWPORT_INSET;
  const placement = bottomFits ? "bottom" : "top";
  const preferredTop = bottomFits
    ? bottomTop
    : anchor.top - tooltip.height - gap;
  const maxTop = Math.max(
    VIEWPORT_INSET,
    viewport.height - VIEWPORT_INSET - tooltip.height,
  );
  const top = Math.min(maxTop, Math.max(VIEWPORT_INSET, preferredTop));

  return { left, top, placement };
}

export function TooltipLayer({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <>{children}</>;
}
