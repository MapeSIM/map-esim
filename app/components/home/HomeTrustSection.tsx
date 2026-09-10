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
  HOME_TRUST_SECTION_INTRO,
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

export function HomeTrustSection() {
  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70"
      aria-labelledby="home-trust-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          Why travelers choose MAP eSIM
        </p>
        <h2
          id="home-trust-heading"
          className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)] sm:mt-3 sm:text-4xl"
        >
          {HOME_TRUST_SECTION_TITLE}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)] sm:mt-3 sm:text-base">
          {HOME_TRUST_SECTION_INTRO}
        </p>

        {/* Mobile: compact title chips (less scroll before Popular). */}
        <ul className="mt-5 flex flex-wrap gap-2 sm:hidden" aria-label="Trust highlights">
          {HOME_TRUST_ITEMS.map((item, index) => {
            const Icon = TRUST_ICONS[index] ?? QrCode;
            const href = trustItemHref(item.title);
            const chipClass =
              "inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--heading)]";
            const body = (
              <>
                <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
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

        {/* Tablet/desktop: existing tall trust cards (layout unchanged from sm up). */}
        <ul className="mt-8 hidden grid-cols-1 gap-4 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {HOME_TRUST_ITEMS.map((item, index) => {
            const Icon = TRUST_ICONS[index] ?? QrCode;
            const href = trustItemHref(item.title);
            const body = (
              <article className="h-full rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.2)] sm:p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[var(--heading)] sm:text-lg">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.description}
                </p>
              </article>
            );
            return (
              <li key={item.title}>
                {href ? (
                  <Link
                    href={href}
                    className="block h-full rounded-[24px] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
