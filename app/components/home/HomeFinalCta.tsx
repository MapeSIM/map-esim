import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  HOME_FINAL_CTA_BODY,
  HOME_FINAL_CTA_POINTS,
  HOME_FINAL_CTA_PRIMARY_HREF,
  HOME_FINAL_CTA_PRIMARY_LABEL,
  HOME_FINAL_CTA_SECONDARY_HREF,
  HOME_FINAL_CTA_SECONDARY_LABEL,
  HOME_FINAL_CTA_TITLE,
} from "@/app/lib/home/homeConversionSections";

export function HomeFinalCta() {
  return (
    <section
      className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20"
      aria-labelledby="home-final-cta-heading"
    >
      <div className="theme-cta overflow-hidden rounded-[28px] border border-[var(--accent-strong)]/25 px-6 py-10 text-center sm:px-10">
        <h2
          id="home-final-cta-heading"
          className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
        >
          {HOME_FINAL_CTA_TITLE}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text)]">
          {HOME_FINAL_CTA_BODY}
        </p>
        <ul className="mx-auto mt-6 flex max-w-3xl flex-col gap-2 text-sm text-[var(--text)] sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-5">
          {HOME_FINAL_CTA_POINTS.map((point) => (
            <li key={point} className="inline-flex items-center justify-center gap-2">
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={HOME_FINAL_CTA_PRIMARY_HREF}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-7 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] sm:w-auto"
          >
            {HOME_FINAL_CTA_PRIMARY_LABEL}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={HOME_FINAL_CTA_SECONDARY_HREF}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-7 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] sm:w-auto"
          >
            {HOME_FINAL_CTA_SECONDARY_LABEL}
          </Link>
        </div>
      </div>
    </section>
  );
}
