import Link from "next/link";
import type { LegalSection } from "@/app/lib/legal";
import { LEGAL_LAST_UPDATED } from "@/app/lib/legal";

export default function LegalDocument({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-10 text-[var(--heading)] sm:px-6 sm:py-14">
      <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Legal
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
          <nav
            aria-label={`${title} table of contents`}
            className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
              On this page
            </p>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-[var(--text-muted)] transition hover:text-[var(--accent-strong)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                  >
                    <span className="mr-1.5 text-[var(--text-soft)]">
                      {index + 1}.
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <p className="mt-4 text-xs leading-relaxed text-[var(--text-soft)]">
            Draft for business and legal review. Related:{" "}
            <Link
              href="/privacy-policy"
              className="text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Privacy
            </Link>
            {" · "}
            <Link
              href="/terms-and-conditions"
              className="text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Terms
            </Link>
            {" · "}
            <Link
              href="/cookie-policy"
              className="text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Cookies
            </Link>
          </p>
        </aside>

        <article className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8 md:p-10">
          <p className="max-w-[65ch] text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
            {summary}
          </p>

          <div className="mt-8 space-y-10">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-28"
                aria-labelledby={`${section.id}-heading`}
              >
                <h2
                  id={`${section.id}-heading`}
                  className="text-xl font-semibold tracking-tight"
                >
                  {section.title}
                </h2>

                {section.callout ? (
                  <p
                    className="mt-3 max-w-[65ch] rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--warning-text)]"
                    role="note"
                  >
                    {section.callout}
                  </p>
                ) : null}

                {section.paragraphs?.map((paragraph, index) => (
                  <p
                    key={`${section.id}-p-${index}`}
                    className="mt-3 max-w-[65ch] text-sm leading-relaxed text-[var(--text)] sm:text-[15px]"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets?.length ? (
                  <ul className="mt-3 max-w-[65ch] list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text)] sm:text-[15px]">
                    {section.bullets.map((item, index) => (
                      <li key={`${section.id}-b-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
