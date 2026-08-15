import { randomBytes } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import WalletPurchaseSelectForm from "@/app/components/account/WalletPurchaseSelectForm";
import { buildWalletBuyReturnPath } from "@/app/lib/auth/redirects";
import { requireRole } from "@/app/lib/auth/session";
import {
  CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE,
  resolveCustomerAccountStatus,
} from "@/app/lib/auth/customerAccountStatus";
import { listAdminAssignmentDestinations } from "@/app/lib/esim/adminPackageAssignmentRead";
import {
  prepareWalletEsimPurchase,
  WalletEsimPurchaseError,
} from "@/app/lib/esim/walletPurchase";
import { prisma } from "@/app/lib/db";
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
  const query = await searchParams;
  // Preserve package hints across sign-in when page-level auth runs.
  const user = await requireRole(
    "CUSTOMER",
    buildWalletBuyReturnPath({
      offerId: query.offerId,
      country: query.country,
    })
  );
  const offerIdHint = normalizeOfferId(query.offerId);
  const countryHint = sanitizeCountryHint(query.country);

  let destinations: Awaited<
    ReturnType<typeof listAdminAssignmentDestinations>
  > = [];
  let hasWallet = false;
  let loadError = false;
  let directOfferError: string | null = null;
  let accountRestricted = false;

  try {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        deletedAt: true,
        blockedAt: true,
        walletAccount: { select: { id: true } },
      },
    });
    accountRestricted =
      resolveCustomerAccountStatus({
        deletedAt: account?.deletedAt ?? null,
        blockedAt: account?.blockedAt ?? null,
      }) === "BLOCKED";
    hasWallet = Boolean(account?.walletAccount);
    destinations = await listAdminAssignmentDestinations();
  } catch {
    loadError = true;
  }

  // Country-page Buy Now → /account/esim/buy?offerId=&country=
  // Prepare + redirect to review. Server-side financial guard remains authoritative.
  let directPurchaseId: string | null = null;
  if (!loadError && offerIdHint) {
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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to wallet
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
          Buy eSIM
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] sm:text-[15px]">
          Where are you traveling?
        </p>
      </div>

      {accountRestricted ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--heading)]"
          role="status"
        >
          {CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE}
        </div>
      ) : null}

      {directOfferError ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {directOfferError}
        </div>
      ) : null}

      <WalletPurchaseSelectForm destinations={destinations} />
    </div>
  );
}
