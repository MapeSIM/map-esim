import Link from "next/link";
import type { AbandonedCheckoutNonConfirmableGuidance } from "@/app/lib/esim/customerPurchaseStatusMessaging";

/**
 * Display-only panel when an owned abandoned-review link cannot be confirmed.
 * Does not change purchase status, funding, or auth.
 */
export default function AbandonedCheckoutNonConfirmablePanel({
  guidance,
}: {
  guidance: AbandonedCheckoutNonConfirmableGuidance;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
      role="status"
      data-abandoned-review-non-confirmable={guidance.kind}
    >
      <h1 className="text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
        {guidance.title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)]">
        {guidance.body}
      </p>
      <Link
        href="/account/esim/buy"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        {guidance.startNewPurchaseLabel}
      </Link>
    </div>
  );
}
