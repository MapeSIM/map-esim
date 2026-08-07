import { randomBytes } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import WalletPurchaseSelectForm from "@/app/components/account/WalletPurchaseSelectForm";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminAssignmentDestinations } from "@/app/lib/esim/adminPackageAssignmentRead";
import {
  prepareWalletEsimPurchase,
  WalletEsimPurchaseError,
} from "@/app/lib/esim/walletPurchase";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

function reviewPath(purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/account/esim/buy/review?${params.toString()}`;
}

function newIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

export default async function AccountWalletBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string; country?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;
  const offerIdHint = normalizeOfferId(query.offerId);
  const countryHint = sanitizeCountryHint(query.country);

  let destinations: Awaited<
    ReturnType<typeof listAdminAssignmentDestinations>
  > = [];
  let balanceLabel = "$0.00";
  let hasWallet = false;
  let loadError = false;
  let directOfferError: string | null = null;

  try {
    const wallet = await prisma.walletAccount.findUnique({
      where: { userId: user.id },
      select: { balanceCents: true },
    });
    hasWallet = Boolean(wallet);
    balanceLabel = formatUsdCents(wallet?.balanceCents ?? 0);
    destinations = await listAdminAssignmentDestinations();
  } catch {
    loadError = true;
  }

  // Valid public Buy Now hint → prepare + skip package selector.
  let directPurchaseId: string | null = null;
  if (!loadError && hasWallet && offerIdHint) {
    try {
      const prepared = await prepareWalletEsimPurchase({
        customerUserId: user.id,
        offerId: offerIdHint,
        countryHint,
        idempotencyKey: newIdempotencyKey(),
      });
      directPurchaseId = prepared.purchaseId;
    } catch (error) {
      if (error instanceof WalletEsimPurchaseError) {
        directOfferError =
          error.code === "OFFER_UNAVAILABLE"
            ? "That package is no longer available. Please choose another package."
            : error.message;
      } else {
        throw error;
      }
    }
  }
  if (directPurchaseId) {
    redirect(reviewPath(directPurchaseId));
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Purchase is temporarily unavailable. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Buy eSIM</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            A wallet is required before purchasing an eSIM.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to wallet
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Buy eSIM</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Choose a destination and package, then continue to checkout.
        </p>
      </div>

      {directOfferError ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {directOfferError}
        </div>
      ) : null}

      <WalletPurchaseSelectForm
        destinations={destinations}
        balanceLabel={balanceLabel}
      />
    </div>
  );
}
