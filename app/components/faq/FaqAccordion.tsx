"use client";

import { useId, useState } from "react";

export type FaqAccordionItem = {
  question: string;
  answer: string;
};

type FaqAccordionProps = {
  items: readonly FaqAccordionItem[];
  /** When true (default), the first item starts expanded. */
  defaultOpenFirst?: boolean;
};

/**
 * Exclusive FAQ accordion: at most one item open; the open item can be closed.
 * Display-only — does not change FAQ copy or SEO schema.
 */
export function FaqAccordion({
  items,
  defaultOpenFirst = true,
}: FaqAccordionProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(
    defaultOpenFirst && items.length > 0 ? 0 : null
  );

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? null : index));
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const open = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div
            key={item.question}
            className={`rounded-2xl border bg-[var(--surface)] px-5 py-4 ${
              open
                ? "border-[var(--border-hover)]"
                : "border-[var(--border)]"
            }`}
          >
            <h3 className="m-0 text-base font-semibold text-[var(--heading)]">
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex w-full cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                <span>{item.question}</span>
                <span
                  className={`shrink-0 text-[var(--accent-strong)] transition ${
                    open ? "rotate-45" : ""
                  }`}
                  aria-hidden="true"
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!open}
              className={open ? "mt-3" : undefined}
            >
              {open ? (
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.answer}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
