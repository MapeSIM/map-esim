import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { getOwnedEsimPurchasePaymentAttempt } from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";

export const dynamic = "force-dynamic";

function parseAttemptId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

/**
 * Informational cancel page after Safepay Hosted Checkout cancel.
 * No wallet mutation and no VeSIM order.
 */
export default async function EsimPurchasePaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{
    attempt?: string;
    tracker?: string;
    status?: string;
    purchase?: string;
  }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;

  void query.tracker;
  void query.status;
  void query.purchase;

  const attemptId = parseAttemptId(query.attempt);
  if (!attemptId) notFound();

  const attempt = await getOwnedEsimPurchasePaymentAttempt(user.id, attemptId);
  if (!attempt) notFound();

  // Idempotent pending-reservation release only — never marks gateway paid/failed.
  await maybeReleasePendingGatewayReservation({
    customerUserId: user.id,
    purchaseId: attempt.purchaseId,
    attemptId: attempt.attemptId,
  }).catch(() => undefined);

  const reviewHref = `/account/esim/buy/review?purchase=${encodeURIComponent(attempt.purchaseId)}`;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment not completed</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You left the payment page before finishing. No payment was completed
          and no eSIM was created.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
        role="status"
      >
        <p className="text-sm text-[var(--heading)]">
          You can return to checkout and try again when ready.
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
          href="/account/esim/buy"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          Choose another package
        </Link>
      </div>
    </div>
  );
}
