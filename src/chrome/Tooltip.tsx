import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_INSET = 8;
const TOOLTIP_DELAY_MS = 160;

type OpenTooltip = {
  anchor: DOMRect;
  label: string;
  target: HTMLElement;
};

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
  const [openTooltip, setOpenTooltip] = useState<OpenTooltip | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const pointerTargetRef = useRef<HTMLElement | null>(null);
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titlesRef = useRef(new WeakMap<HTMLElement, string>());

  useLayoutEffect(() => {
    if (!openTooltip || !tooltipRef.current) {
      setPosition(null);
      return;
    }

    const bounds = tooltipRef.current.getBoundingClientRect();
    setPosition(
      tooltipPosition(
        openTooltip.anchor,
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [openTooltip]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const restoreTitle = (target: HTMLElement) => {
      if (!titlesRef.current.has(target)) return;
      target.setAttribute("title", titlesRef.current.get(target)!);
      titlesRef.current.delete(target);
    };

    const clearActiveTarget = (target: HTMLElement) => {
      clearTimer();
      setOpenTooltip(null);
      restoreTitle(target);
      if (activeTargetRef.current === target) {
        activeTargetRef.current = null;
        labelRef.current = null;
      }
    };

    const isDisabled = (target: HTMLElement) =>
      target.matches(":disabled") ||
      target.getAttribute("aria-disabled")?.toLowerCase() === "true";

    const openAfterDelay = (target: HTMLElement) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const stillActive =
          activeTargetRef.current === target &&
          (pointerTargetRef.current === target ||
            focusTargetRef.current === target);
        if (!stillActive || isDisabled(target) || !labelRef.current) {
          if (isDisabled(target)) clearActiveTarget(target);
          return;
        }

        setOpenTooltip({
          anchor: target.getBoundingClientRect(),
          label: labelRef.current,
          target,
        });
      }, TOOLTIP_DELAY_MS);
    };

    const activate = (target: HTMLElement) => {
      if (activeTargetRef.current === target) return;

      const previous = activeTargetRef.current;
      if (previous) clearActiveTarget(previous);

      const label = tooltipText(target);
      if (!label || !isTooltipTarget(target)) return;

      activeTargetRef.current = target;
      labelRef.current = label;
      if (target.hasAttribute("title")) {
        titlesRef.current.set(target, target.getAttribute("title") ?? "");
        target.removeAttribute("title");
      }
      openAfterDelay(target);
    };

    const targetFrom = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const target = eventTarget.closest<HTMLElement>(
        "button, a, [role=button]",
      );
      return target && isTooltipTarget(target) ? target : null;
    };

    const activeTargetFrom = (eventTarget: EventTarget | null) => {
      const activeTarget = activeTargetRef.current;
      if (
        activeTarget &&
        eventTarget instanceof Node &&
        activeTarget.contains(eventTarget)
      ) {
        return activeTarget;
      }
      return targetFrom(eventTarget);
    };

    const release = (target: HTMLElement) => {
      if (
        pointerTargetRef.current !== target &&
        focusTargetRef.current !== target
      ) {
        clearActiveTarget(target);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = targetFrom(event.target);
      if (!target || pointerTargetRef.current === target) return;
      pointerTargetRef.current = target;
      activate(target);
    };

    const onPointerOut = (event: PointerEvent) => {
      const target = activeTargetFrom(event.target);
      if (!target || target.contains(event.relatedTarget as Node | null)) return;
      if (pointerTargetRef.current === target) pointerTargetRef.current = null;
      release(target);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = targetFrom(event.target);
      if (!target || focusTargetRef.current === target) return;
      focusTargetRef.current = target;
      activate(target);
    };

    const onFocusOut = (event: FocusEvent) => {
      const target = activeTargetFrom(event.target);
      if (!target || target.contains(event.relatedTarget as Node | null)) return;
      if (focusTargetRef.current === target) focusTargetRef.current = null;
      release(target);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      clearTimer();
      const activeTarget = activeTargetRef.current;
      if (activeTarget) restoreTitle(activeTarget);
    };
  }, []);

  return (
    <>
      {children}
      {openTooltip &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            aria-hidden="true"
            className={`monocode-tooltip pointer-events-none ${
              position?.placement === "top"
                ? "monocode-tooltip--top"
                : "monocode-tooltip--bottom"
            }`}
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {openTooltip.label}
          </div>,
          document.body,
        )}
    </>
  );
}
