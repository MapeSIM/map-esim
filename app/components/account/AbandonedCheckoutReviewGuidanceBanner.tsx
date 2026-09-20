import Link from "next/link";
import type { AbandonedCheckoutReviewGuidance } from "@/app/lib/esim/customerPurchaseStatusMessaging";

/**
 * Display-only banner for abandoned-checkout review deep links.
 * Does not change purchase status, funding, or auth.
 */
export default function AbandonedCheckoutReviewGuidanceBanner({
  guidance,
}: {
  guidance: AbandonedCheckoutReviewGuidance;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      role="status"
      data-abandoned-review-guidance={guidance.kind}
    >
      <p className="text-sm font-semibold text-[var(--heading)]">
        {guidance.title}
      </p>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">{guidance.body}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link
          href="/account/esim/buy"
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          {guidance.startNewPurchaseLabel}
        </Link>
        <p className="flex h-11 items-center text-sm text-[var(--text-muted)] sm:px-1">
          {guidance.continueLabel} is still available below.
        </p>
      </div>
    </div>
  );
}
