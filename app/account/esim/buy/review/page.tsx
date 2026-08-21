import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import WalletPurchaseConfirmForm from "@/app/components/account/WalletPurchaseConfirmForm";
import { requireRole } from "@/app/lib/auth/session";
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
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
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
        </div>
      </div>
    );
  }

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

  if (!review.canConfirm) notFound();

  const back = resolveCheckoutBackHref({
    destinationCode: review.destinationCode,
    destinationName: review.destinationName,
  });

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href={back.href}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          {back.label}
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Review your plan and choose how to fund this purchase.
        </p>
      </div>

      <WalletPurchaseConfirmForm key={review.purchaseId} review={review} />
    </div>
  );
}
