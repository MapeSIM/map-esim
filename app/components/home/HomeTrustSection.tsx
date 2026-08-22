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

export function HomeTrustSection() {
  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70"
      aria-labelledby="home-trust-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <h2
          id="home-trust-heading"
          className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
        >
          {HOME_TRUST_SECTION_TITLE}
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {HOME_TRUST_ITEMS.map((item, index) => {
            const Icon = TRUST_ICONS[index] ?? QrCode;
            return (
              <li key={item.title}>
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
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
