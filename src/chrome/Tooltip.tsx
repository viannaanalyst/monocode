import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

const VIEWPORT_INSET = 8;
const TOOLTIP_DELAY_MS = 160;

type OpenTooltip = {
  anchor: DOMRect;
  label: string;
  target: HTMLElement;
  prefer: "top" | "bottom" | "auto";
};

export function tooltipText(element: Element): string | null {
  // Buttons whose label already reads on screen opt out of the hover bubble.
  // A closer [data-tooltip-enable] wins, so icon-only rows (transcript turn
  // actions) can still explain themselves inside a quiet region.
  const optOut = element.closest("[data-no-tooltip]");
  if (optOut) {
    const optIn = element.closest("[data-tooltip-enable]");
    if (!optIn || !optOut.contains(optIn)) return null;
  }
  const title = element.getAttribute("title")?.trim();
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  const raw = title || ariaLabel || null;
  return raw ? t(raw) : null;
}

function isTooltipControl(element: Element): element is HTMLElement {
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
  return isButton;
}

export function isTooltipTarget(element: Element): element is HTMLElement {
  return isTooltipControl(element) && tooltipText(element) !== null;
}

export function tooltipPosition(
  anchor: DOMRect,
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = VIEWPORT_INSET,
  prefer: "top" | "bottom" | "auto" = "auto",
): { left: number; top: number; placement: "top" | "bottom" } {
  const maxLeft = Math.max(
    VIEWPORT_INSET,
    viewport.width - VIEWPORT_INSET - tooltip.width,
  );
  const centeredLeft = anchor.left + (anchor.width - tooltip.width) / 2;
  const left = Math.min(maxLeft, Math.max(VIEWPORT_INSET, centeredLeft));

  const bottomTop = anchor.bottom + gap;
  const topTop = anchor.top - tooltip.height - gap;
  const bottomFits =
    bottomTop + tooltip.height <= viewport.height - VIEWPORT_INSET;
  const topFits = topTop >= VIEWPORT_INSET;
  const placement =
    prefer === "top"
      ? topFits || !bottomFits
        ? "top"
        : "bottom"
      : prefer === "bottom"
        ? bottomFits || !topFits
          ? "bottom"
          : "top"
        : bottomFits
          ? "bottom"
          : "top";
  const preferredTop = placement === "bottom" ? bottomTop : topTop;
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
  const suppressedTargetsRef = useRef(new Set<HTMLElement>());

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
        VIEWPORT_INSET,
        openTooltip.prefer,
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
      suppressedTargetsRef.current.delete(target);
    };

    const restoreTitleWhenUnused = (target: HTMLElement) => {
      if (
        pointerTargetRef.current !== target &&
        focusTargetRef.current !== target
      ) {
        restoreTitle(target);
      }
    };

    const closeActiveTarget = (target: HTMLElement) => {
      if (activeTargetRef.current !== target) return;
      clearTimer();
      setOpenTooltip((current) =>
        current?.target === target ? null : current,
      );
      activeTargetRef.current = null;
      labelRef.current = null;
    };

    const isOpenTargetValid = (target: HTMLElement) =>
      target.isConnected &&
      isTooltipControl(target) &&
      Boolean(tooltipText(target) || titlesRef.current.get(target)?.trim());

    const openAfterDelay = (target: HTMLElement) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const stillActive =
          activeTargetRef.current === target &&
          (pointerTargetRef.current === target ||
            focusTargetRef.current === target);
        if (!stillActive || !isOpenTargetValid(target) || !labelRef.current) {
          if (!isOpenTargetValid(target)) closeActiveTarget(target);
          return;
        }

        const preferAttr = target.getAttribute("data-tooltip-placement");
        const prefer =
          preferAttr === "top" || preferAttr === "bottom" ? preferAttr : "auto";
        setOpenTooltip({
          anchor: target.getBoundingClientRect(),
          label: labelRef.current,
          target,
          prefer,
        });
      }, TOOLTIP_DELAY_MS);
    };

    const activate = (target: HTMLElement) => {
      if (activeTargetRef.current === target) return;

      const previous = activeTargetRef.current;
      if (previous) closeActiveTarget(previous);

      const label = tooltipText(target);
      if (!label || !isTooltipTarget(target)) return;

      activeTargetRef.current = target;
      labelRef.current = label;
      if (target.hasAttribute("title")) {
        titlesRef.current.set(target, target.getAttribute("title") ?? "");
        suppressedTargetsRef.current.add(target);
        target.removeAttribute("title");
      }
      openAfterDelay(target);
    };

    const targetFrom = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const target = eventTarget.closest<HTMLElement>(
        "button, a, [role=button]",
      );
      return target &&
        (isTooltipTarget(target) || titlesRef.current.has(target))
        ? target
        : null;
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
      restoreTitleWhenUnused(target);
      if (
        pointerTargetRef.current !== target &&
        focusTargetRef.current !== target
      ) {
        closeActiveTarget(target);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = targetFrom(event.target);
      if (!target || pointerTargetRef.current === target) return;
      const previous = pointerTargetRef.current;
      pointerTargetRef.current = target;
      if (previous) release(previous);
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
      const previous = focusTargetRef.current;
      focusTargetRef.current = target;
      if (previous) release(previous);
      activate(target);
    };

    const onFocusOut = (event: FocusEvent) => {
      const target = activeTargetFrom(event.target);
      if (!target || target.contains(event.relatedTarget as Node | null)) return;
      if (focusTargetRef.current === target) focusTargetRef.current = null;
      release(target);
    };

    // A right click opens a context menu under the cursor; leaving the hover
    // bubble up would overlap it.
    const onContextMenu = () => {
      const target = activeTargetRef.current;
      if (!target) return;
      clearTimer();
      setOpenTooltip(null);
      activeTargetRef.current = null;
      labelRef.current = null;
      pointerTargetRef.current = null;
      focusTargetRef.current = null;
      restoreTitle(target);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("contextmenu", onContextMenu, true);

    const observer = new MutationObserver(() => {
      const activeTarget = activeTargetRef.current;
      if (activeTarget && !isOpenTargetValid(activeTarget)) {
        closeActiveTarget(activeTarget);
        restoreTitleWhenUnused(activeTarget);
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "aria-disabled",
        "aria-hidden",
        "disabled",
        "role",
        "title",
        "aria-label",
      ],
      childList: true,
      subtree: true,
    });

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      observer.disconnect();
      clearTimer();
      for (const target of suppressedTargetsRef.current) restoreTitle(target);
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
