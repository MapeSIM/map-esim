import Link from "next/link";

/** Non-authoritative informational UI only — never funds or orders. */
export function EsimPurchasePaymentReturnView({
  purchaseId,
}: {
  purchaseId: string;
}) {
  const reviewHref = `/account/esim/buy/review?purchase=${encodeURIComponent(purchaseId)}`;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment processing</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We received your return from the payment page. Your payment is being
          verified. This page does not confirm payment or activate an eSIM.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
        role="status"
      >
        <p className="text-sm text-[var(--heading)]">
          You will be able to access your eSIM only after payment is verified.
          No wallet funds were charged from this return page.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={reviewHref}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          Back to checkout
        </Link>
        <Link
          href="/account"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          Account
        </Link>
      </div>
    </div>
  );
}
