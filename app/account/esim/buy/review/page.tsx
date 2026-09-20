import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AbandonedCheckoutNonConfirmablePanel from "@/app/components/account/AbandonedCheckoutNonConfirmablePanel";
import AbandonedCheckoutReviewGuidanceBanner from "@/app/components/account/AbandonedCheckoutReviewGuidanceBanner";
import WalletPurchaseConfirmForm from "@/app/components/account/WalletPurchaseConfirmForm";
import { buildWalletBuyReviewReturnPath } from "@/app/lib/auth/redirects";
import { requireRole } from "@/app/lib/auth/session";
import {
  resolveAbandonedCheckoutNonConfirmableGuidance,
  resolveAbandonedCheckoutReviewGuidance,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import { getWalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";
import { resolveCheckoutBackHref } from "@/app/lib/plans/checkoutBackHref";
import { WalletEsimPurchaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AccountWalletBuyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  // Preserve review resume URL across sign-in (abandoned checkout email CTA).
  const user = await requireRole(
    "CUSTOMER",
    buildWalletBuyReviewReturnPath(purchaseId)
  );
  if (!purchaseId) notFound();

  let review: Awaited<ReturnType<typeof getWalletPurchaseReview>>;
  try {
    review = await getWalletPurchaseReview(user.id, purchaseId);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/account/esim/buy"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to package selection
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Purchase details are temporarily unavailable. Please try again shortly.
          </p>
          <Link
            href="/account/esim/buy"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Start a new purchase
          </Link>
        </div>
      </div>
    );
  }

  // Invalid id shape already 404'd above; missing / wrong-owner rows stay 404.
  if (!review) notFound();

  if (review.status === WalletEsimPurchaseStatus.COMPLETED) {
    redirect(`/account/esim/buy/success?purchase=${encodeURIComponent(review.purchaseId)}`);
  }
  if (review.status === WalletEsimPurchaseStatus.FAILED_REFUNDED) {
    redirect(`/account/esim/buy/failed?purchase=${encodeURIComponent(review.purchaseId)}`);
  }
  // Processing (FUNDED / PROVIDER_PENDING / FUNDS_RESERVED) and
  // Review Needed (RECONCILIATION_REQUIRED) share this route; copy is
  // chosen from durable purchase status on the destination page.
  if (
    review.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED ||
    review.status === WalletEsimPurchaseStatus.PROVIDER_PENDING ||
    review.status === WalletEsimPurchaseStatus.FUNDS_RESERVED ||
    review.status === WalletEsimPurchaseStatus.FUNDED
  ) {
    redirect(
      `/account/esim/buy/review-needed?purchase=${encodeURIComponent(review.purchaseId)}`
    );
  }

  // AWAITING_GATEWAY_PAYMENT stays on checkout so the customer can resume/cancel safely.

  // Owned but non-confirmable (e.g. DRAFT): friendly explanation, not a bare 404.
  if (!review.canConfirm) {
    const nonConfirmable = resolveAbandonedCheckoutNonConfirmableGuidance(
      review.status
    );
    return (
      <div className="space-y-6">
        <Link
          href="/account/esim/buy"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to package selection
        </Link>
        <AbandonedCheckoutNonConfirmablePanel guidance={nonConfirmable} />
      </div>
    );
  }

  const guidance = resolveAbandonedCheckoutReviewGuidance({
    status: review.status,
    updatedAt: review.updatedAt,
    pendingGatewayAttemptId: review.pendingGatewayAttemptId,
  });

  const back = resolveCheckoutBackHref({
    destinationCode: review.destinationCode,
    destinationName: review.destinationName,
  });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={back.href}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          {back.label}
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">Checkout</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)] sm:text-[15px]">
          Review your plan and choose how to fund this purchase.
        </p>
      </div>

      {guidance ? (
        <AbandonedCheckoutReviewGuidanceBanner guidance={guidance} />
      ) : null}

      <WalletPurchaseConfirmForm key={review.purchaseId} review={review} />
    </div>
  );
}
