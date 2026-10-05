import Link from "next/link";
import { BRAND_NAME } from "@/app/lib/brand";

/**
 * Global 404 — public, noindex via Next defaults for not-found.
 * Keep CTAs to public catalog surfaces only (Home + Destinations).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-start justify-center px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
        That link does not match a page on {BRAND_NAME}. Check the URL, or head
        back to Home or Destinations to continue browsing travel eSIM plans.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        >
          Back to Home
        </Link>
        <Link
          href="/countries"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        >
          Browse Destinations
        </Link>
      </div>
    </main>
  );
}
