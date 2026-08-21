import Link from "next/link";
import type { CustomerPendingWalletPurchase } from "@/app/lib/esim/walletPurchaseRead";

function pendingBadgeClass(statusLabel: string): string {
  if (statusLabel === "Under review") {
    return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
  }
  return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
}

export default function CustomerPendingPurchases({
  purchases,
}: {
  purchases: CustomerPendingWalletPurchase[];
}) {
  if (purchases.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="pending-purchases-heading">
      <div>
        <h2
          id="pending-purchases-heading"
          className="text-lg font-bold tracking-tight text-[var(--heading)]"
        >
          Unfinished purchases
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Continue checkout if payment is not completed, or view status for a
          purchase that is already being prepared or reviewed.
        </p>
      </div>
      <ul className="space-y-3">
        {purchases.map((purchase) => (
          <li key={purchase.purchaseId}>
            <article className="min-w-0 rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--heading)] break-words">
                      {purchase.destination}
                    </h3>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pendingBadgeClass(purchase.statusLabel)}`}
                    >
                      {purchase.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
                    {purchase.planName}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {purchase.summary}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--heading)]">
                  {purchase.priceLabel}
                </p>
              </div>
              <div className="mt-4">
                <Link
                  href={purchase.href}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
                >
                  {purchase.ctaLabel}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
