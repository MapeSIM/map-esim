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
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { SortOption } from "@/app/lib/plans/plan-utils";

export type SortSelectOption = {
  value: SortOption;
  label: string;
};

type SortSelectProps = {
  value: SortOption;
  onChange: (value: SortOption) => void;
  options: SortSelectOption[];
  label?: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export default function SortSelect({
  value,
  onChange,
  options,
  label = "Sort plans",
}: SortSelectProps) {
  const listboxId = useId();
  const buttonId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value)
    )
  );
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 280,
  });

  const selected =
    options.find((option) => option.value === value) || options[0];

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredWidth = Math.max(rect.width, 240);
    const maxLeft = window.innerWidth - preferredWidth - viewportPadding;
    const left = Math.max(viewportPadding, Math.min(rect.left, maxLeft));

    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, available));

    setMenuPosition({
      top: openUpward
        ? Math.max(viewportPadding, rect.top - maxHeight - 8)
        : rect.bottom + 8,
      left,
      width: preferredWidth,
      maxHeight,
    });
  }, []);

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
      options.findIndex((option) => option.value === value)
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

  function selectOption(next: SortOption) {
    onChange(next);
    closeMenu();
  }

  function moveActive(delta: number) {
    setActiveIndex((current) => {
      const next = (current + delta + options.length) % options.length;
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
    option: SortSelectOption
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
        const lastIndex = options.length - 1;
        setActiveIndex(lastIndex);
        focusOption(lastIndex);
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        selectOption(option.value);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex w-full sm:w-auto">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={label}
        onClick={() => {
          if (open) {
            closeMenu(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleButtonKeyDown}
        className={`
          inline-flex h-11 w-full items-center justify-between gap-2
          rounded-full border border-[var(--border-strong)] bg-[var(--surface)]
          py-2 pl-4 pr-3 text-sm font-semibold text-[var(--heading)]
          outline-none transition
          hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]
          focus-visible:border-[var(--accent-strong)]/60 focus-visible:ring-2
          focus-visible:ring-[var(--accent-strong)]/25
          sm:min-w-[240px]
          ${open ? "border-[var(--accent-strong)]/45" : ""}
        `}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <SlidersHorizontal
            className="h-4 w-4 shrink-0 text-[var(--accent-strong)]"
            aria-hidden="true"
          />
          <span className="truncate">{selected?.label || "Sort"}</span>
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
            shadow-[var(--shadow-strong)]
          "
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const active = index === activeIndex;

            return (
              <li key={option.value} role="presentation">
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  data-index={index}
                  aria-selected={isSelected}
                  tabIndex={active ? 0 : -1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.value)}
                  onKeyDown={(event) => handleOptionKeyDown(event, option)}
                  className={`
                    flex w-full items-center justify-between gap-3
                    rounded-xl px-3 py-2.5 text-left text-sm transition
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/45
                    ${
                      active || isSelected
                        ? "bg-[var(--surface)] text-[var(--heading)]"
                        : "text-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--heading)]"
                    }
                  `}
                >
                  <span className="truncate font-medium">{option.label}</span>
                  {isSelected && (
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
