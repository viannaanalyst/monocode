import { useEffect, useRef, useState, type ReactElement } from "react";
import { Check, ChevronDown } from "./icons";
import { Popover } from "./Popover";

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * The app's own select: a themed trigger plus a popover list with the shared
 * open animation and a short close animation, so small choices never open the
 * native macOS menu.
 */
export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  width,
  className,
  disabled = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  width?: number;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const close = () => {
    if (!open) return;
    setOpen(false);
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
    }, 130);
  };

  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        data-no-tooltip
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-content/10 bg-background-base/70 px-2 text-sm text-content outline-none hover:bg-content/8 disabled:opacity-40 ${
          className ?? ""
        }`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          className="size-3.5 shrink-0 text-content/50"
          strokeWidth={1.75}
        />
      </button>
      {open || closing ? (
        <Popover
          anchor={trigger}
          side="bottom"
          align="start"
          gap={4}
          width={width}
          className={`p-1 ${closing ? "dropdown-closing" : ""}`}
          onDismiss={close}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              disabled={option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                close();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-content hover:bg-content/8 disabled:opacity-40"
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === value ? (
                <Check
                  className="size-3.5 shrink-0 text-accent"
                  strokeWidth={2}
                />
              ) : null}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}
