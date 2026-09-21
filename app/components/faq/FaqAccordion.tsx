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
 * Server-friendly FAQ accordion using native details/summary.
 * Exclusive open behavior via the HTML `name` group (no client JS).
 * Display-only — does not change FAQ copy or SEO schema.
 */
export function FaqAccordion({
  items,
  defaultOpenFirst = true,
}: FaqAccordionProps) {
  const groupName = "map-esim-faq-accordion";

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const openByDefault = Boolean(defaultOpenFirst && index === 0);
        return (
          <details
            key={item.question}
            name={groupName}
            {...(openByDefault ? { open: true } : {})}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 open:border-[var(--border-hover)]"
          >
            <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-[var(--heading)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span
                className="shrink-0 text-[var(--accent-strong)] transition group-open:rotate-45"
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              {item.answer}
            </p>
          </details>
        );
      })}
    </div>
  );
}
