import Link from "next/link";
import {
  Globe2,
  Headphones,
  QrCode,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import {
  HOME_TRUST_ITEMS,
  HOME_TRUST_SECTION_TITLE,
} from "@/app/lib/home/homeTrustSection";

const TRUST_ICONS: LucideIcon[] = [
  QrCode,
  Globe2,
  Smartphone,
  ShieldCheck,
  Headphones,
];

function trustItemHref(title: string): string | null {
  if (title === "Support Available") return "/support";
  if (title === "200+ Destinations") return "/countries";
  return null;
}

/** Compact horizontal trust chip bar (mobile + desktop). */
export function HomeTrustSection() {
  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70"
      aria-labelledby="home-trust-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 sm:py-6">
        <h2 id="home-trust-heading" className="sr-only">
          {HOME_TRUST_SECTION_TITLE}
        </h2>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)] sm:text-xs">
          Why travelers choose MAP eSIM
        </p>
        <ul
          className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:mt-3.5 sm:gap-2.5"
          aria-label="Trust highlights"
        >
          {HOME_TRUST_ITEMS.map((item, index) => {
            const Icon = TRUST_ICONS[index] ?? QrCode;
            const href = trustItemHref(item.title);
            const chipClass =
              "inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--heading)] sm:px-3.5 sm:py-2 sm:text-[13px]";
            const body = (
              <>
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-[var(--accent-strong)]"
                  aria-hidden="true"
                />
                <span className="truncate">{item.title}</span>
              </>
            );
            return (
              <li key={item.title}>
                {href ? (
                  <Link
                    href={href}
                    className={`${chipClass} transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60`}
                  >
                    {body}
                  </Link>
                ) : (
                  <span className={chipClass}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
