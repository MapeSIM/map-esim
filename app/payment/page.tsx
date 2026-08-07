import Link from "next/link";

/**
 * Soft-launch: public card payment is not available.
 * Keep this route as a reserved future gateway entry; do not present a fake checkout button.
 * Normal purchase CTAs must not link here — they use wallet buy instead.
 */
export default function PaymentPage() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <section className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Card checkout unavailable
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Online card payment is not available yet. You can buy an eSIM with an
          existing wallet balance after signing in.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/account/esim/buy"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Buy with wallet
          </Link>
          <Link
            href="/countries"
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
          >
            Browse destinations
          </Link>
        </div>
      </section>
    </main>
  );
}
