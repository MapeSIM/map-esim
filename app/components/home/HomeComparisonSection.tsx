import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  HOME_COMPARISON_COLUMNS,
  HOME_COMPARISON_EYEBROW,
  HOME_COMPARISON_INTRO,
  HOME_COMPARISON_ROWS,
  HOME_COMPARISON_TITLE,
  HOME_DISCOVERY_CTA_HREF,
  HOME_DISCOVERY_CTA_LABEL,
} from "@/app/lib/home/homeConversionSections";

export function HomeComparisonSection() {
  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70"
      aria-labelledby="home-comparison-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          {HOME_COMPARISON_EYEBROW}
        </p>
        <h2
          id="home-comparison-heading"
          className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
        >
          {HOME_COMPARISON_TITLE}
        </h2>
        <p className="mt-3 max-w-3xl text-[var(--text-muted)]">
          {HOME_COMPARISON_INTRO}
        </p>

        {/* Mobile: stacked cards — no horizontal scroll. */}
        <ul className="mt-8 space-y-4 md:hidden">
          {HOME_COMPARISON_ROWS.map((row) => (
            <li
              key={row.feature}
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
            >
              <p className="text-sm font-bold text-[var(--heading)]">
                {row.feature}
              </p>
              <dl className="mt-4 space-y-3">
                {HOME_COMPARISON_COLUMNS.map((column, index) => (
                  <div key={`${row.feature}-${column}`}>
                    <dt
                      className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                        index === 0
                          ? "text-[var(--accent-strong)]"
                          : "text-[var(--text-soft)]"
                      }`}
                    >
                      {column}
                    </dt>
                    <dd
                      className={`mt-1 text-sm leading-relaxed ${
                        index === 0
                          ? "font-medium text-[var(--heading)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {row.values[index]}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>

        {/* Desktop: comparison table (unchanged structure). */}
        <div className="mt-8 hidden overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_30px_rgba(0,0,0,0.2)] md:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Comparison of MAP eSIM, typical roaming, and airport SIM shops
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                <th
                  scope="col"
                  className="px-4 py-4 font-semibold text-[var(--text-soft)] sm:px-5"
                >
                  Feature
                </th>
                {HOME_COMPARISON_COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-4 py-4 font-semibold text-[var(--heading)] sm:px-5"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOME_COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-4 font-semibold text-[var(--heading)] sm:px-5"
                  >
                    {row.feature}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.feature}-${HOME_COMPARISON_COLUMNS[index]}`}
                      className={`px-4 py-4 leading-relaxed text-[var(--text-muted)] sm:px-5 ${
                        index === 0 ? "text-[var(--heading)]" : ""
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link
            href={HOME_DISCOVERY_CTA_HREF}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-7 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            {HOME_DISCOVERY_CTA_LABEL}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
          <p className="text-sm text-[var(--text-muted)]">
            Browse destination plans next — compare data and validity on each
            country page.
          </p>
        </div>
      </div>
    </section>
  );
}
