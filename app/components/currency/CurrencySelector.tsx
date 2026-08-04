"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  CURRENCY_OPTIONS,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type CurrencySelectorProps = {
  compact?: boolean;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
};

function formatOptionLabel(option: (typeof CURRENCY_OPTIONS)[number]) {
  return `${option.region} — ${option.code} — ${option.symbol}`;
}

export default function CurrencySelector({
  compact = false,
}: CurrencySelectorProps) {
  const { currency, setCurrency } = useCurrency();
  const listboxId = useId();
  const buttonId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      CURRENCY_OPTIONS.findIndex((option) => option.code === currency)
    )
  );
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    width: 220,
    maxHeight: 280,
    openUpward: false,
  });

  const selectedOption =
    CURRENCY_OPTIONS.find((option) => option.code === currency) ||
    CURRENCY_OPTIONS[0];

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredWidth = Math.max(compact ? rect.width : 220, 200);
    const maxLeft = window.innerWidth - preferredWidth - viewportPadding;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, maxLeft)
    );

    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(280, available));

    setMenuPosition({
      top: openUpward
        ? Math.max(viewportPadding, rect.top - maxHeight - 8)
        : rect.bottom + 8,
      left,
      width: preferredWidth,
      maxHeight,
      openUpward,
    });
  }, [compact]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleResize() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open, updateMenuPosition]);

  function focusOption(index: number) {
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
        ?.focus();
    });
  }

  function openMenu() {
    const selectedIndex = Math.max(
      0,
      CURRENCY_OPTIONS.findIndex((option) => option.code === currency)
    );
    setActiveIndex(selectedIndex);
    setOpen(true);
    focusOption(selectedIndex);
  }

  function closeMenu(focusButton = true) {
    setOpen(false);
    if (focusButton) {
      buttonRef.current?.focus();
    }
  }

  function selectCurrency(code: CurrencyCode) {
    setCurrency(code);
    closeMenu();
  }

  function moveActive(delta: number) {
    setActiveIndex((current) => {
      const next =
        (current + delta + CURRENCY_OPTIONS.length) % CURRENCY_OPTIONS.length;
      focusOption(next);
      return next;
    });
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openMenu();
    } else if (event.key === "Escape") {
      closeMenu();
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    code: CurrencyCode
  ) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        focusOption(0);
        break;
      case "End": {
        event.preventDefault();
        const lastIndex = CURRENCY_OPTIONS.length - 1;
        setActiveIndex(lastIndex);
        focusOption(lastIndex);
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        selectCurrency(code);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        if (event.key.length === 1) {
          const matchIndex = CURRENCY_OPTIONS.findIndex(
            (option, optionIndex) =>
              optionIndex >= index &&
              (option.code.startsWith(event.key.toUpperCase()) ||
                option.region.startsWith(event.key.toUpperCase()))
          );
          if (matchIndex >= 0) {
            setActiveIndex(matchIndex);
            focusOption(matchIndex);
          }
        }
        break;
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex min-w-0 ${compact ? "w-full" : "max-w-full"}`}
    >
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label="Currency"
        onClick={() => {
          if (open) {
            closeMenu(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleButtonKeyDown}
        className={`
          inline-flex min-w-0 items-center justify-between gap-1.5
          rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)]
          text-sm font-semibold text-[var(--heading)] shadow-[0_6px_16px_rgba(0,0,0,0.18)]
          outline-none transition
          hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]
          focus-visible:border-[var(--accent-strong)]/60 focus-visible:ring-2
          focus-visible:ring-[var(--accent-strong)]/25
          ${
            compact
              ? "h-11 w-full px-3"
              : "h-10 max-w-[4.75rem] px-2 sm:max-w-none sm:min-w-[112px] sm:gap-2 sm:px-3"
          }
          ${open ? "border-[var(--accent-strong)]/45" : ""}
        `}
      >
        <span className="min-w-0 truncate">
          {compact ? (
            formatOptionLabel(selectedOption)
          ) : (
            <>
              <span className="sm:hidden">{selectedOption.code}</span>
              <span className="hidden sm:inline">
                {selectedOption.region} · {selectedOption.code}
              </span>
            </>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-soft)] transition ${
            open ? "rotate-180 text-[var(--accent-strong)]" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={buttonId}
          aria-activedescendant={`${listboxId}-option-${activeIndex}`}
          className="
            fixed z-[80] overflow-y-auto rounded-2xl
            border border-[var(--border-strong)] bg-[var(--surface-2)] p-1.5
            shadow-[0_18px_40px_rgba(0,0,0,0.45)]
          "
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          {CURRENCY_OPTIONS.map((option, index) => {
            const selected = option.code === currency;
            const active = index === activeIndex;

            return (
              <li key={option.code} role="presentation">
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  data-index={index}
                  aria-selected={selected}
                  tabIndex={active ? 0 : -1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectCurrency(option.code)}
                  onKeyDown={(event) =>
                    handleOptionKeyDown(event, index, option.code)
                  }
                  className={`
                    flex w-full items-center justify-between gap-3
                    rounded-xl px-3 py-2.5 text-left text-sm transition
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/45
                    ${
                      active || selected
                        ? "bg-[var(--surface-2)] text-[var(--heading)]"
                        : "text-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--heading)]"
                    }
                  `}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold tracking-wide">
                      {option.region}
                      <span className="mx-1.5 text-[var(--text-soft)]">—</span>
                      {option.code}
                      <span className="mx-1.5 text-[var(--text-soft)]">—</span>
                      <span className="text-[var(--accent-strong)]">{option.symbol}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-soft)]">
                      {option.label}
                    </span>
                  </span>

                  {selected && (
                    <Check
                      className="h-4 w-4 shrink-0 text-[var(--accent-strong)]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
