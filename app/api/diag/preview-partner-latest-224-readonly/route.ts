/**
 * TEMPORARY Preview-only READ-ONLY Partner purchase diagnostic.
 * Hash-gated. No refunds. No VeSIM writes. Remove after diagnosis.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_DB_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const BLOCKED_PROD_HASH_PREFIX = "8e9b5fcaa648d171";
const PARTNER_EMAIL = "partner-sandbox@mapesim.com";
const EXPECTED_CHARGE_CENTS = 224;

function dbUrlHashPrefix(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return "missing";
  return createHash("sha256").update(url, "utf8").digest("hex").slice(0, 16);
}

export async function GET() {
  const hashPrefix = dbUrlHashPrefix();
  if (hashPrefix === BLOCKED_PROD_HASH_PREFIX) {
    return NextResponse.json(
      { ok: false, error: "production_db_blocked", hashPrefix },
      { status: 403 }
    );
  }
  if (hashPrefix !== PREVIEW_DB_HASH_PREFIX) {
    return NextResponse.json(
      { ok: false, error: "preview_db_hash_mismatch", hashPrefix },
      { status: 403 }
    );
  }

  const partnerUser = await prisma.user.findUnique({
    where: { email: PARTNER_EMAIL },
    select: {
      id: true,
      email: true,
      partnerProfile: {
        select: {
          id: true,
          walletAccount: { select: { balanceCents: true, version: true } },
        },
      },
    },
  });

  if (!partnerUser?.partnerProfile) {
    return NextResponse.json(
      { ok: false, error: "partner_not_found", hashPrefix },
      { status: 404 }
    );
  }

  const partnerId = partnerUser.partnerProfile.id;

  const latest224 = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId,
      partnerChargeCents: EXPECTED_CHARGE_CENTS,
      offerId: "ESIM-BG-7D-1GB-NOROAM",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      offerId: true,
      partnerChargeCents: true,
      providerOrderId: true,
      orderId: true,
      debitTransactionId: true,
      refundTransactionId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      providerResultKind: true,
      safeProviderStatusCode: true,
      failureCategory: true,
      failureCode: true,
      reconciliationState: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      idempotencyKey: true,
    },
  });

  const recentPurchases = await prisma.partnerEsimPurchase.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      offerId: true,
      partnerChargeCents: true,
      providerOrderId: true,
      orderId: true,
      debitTransactionId: true,
      refundTransactionId: true,
      createdAt: true,
    },
  });

  let debitTx = null;
  if (latest224?.debitTransactionId) {
    debitTx = await prisma.partnerWalletTransaction.findUnique({
      where: { id: latest224.debitTransactionId },
      select: {
        id: true,
        type: true,
        amountCents: true,
        balanceAfterCents: true,
        referenceId: true,
        idempotencyKey: true,
        createdAt: true,
      },
    });
  }

  // Also find newest debit of 224 regardless of join, as cross-check
  const newestDebit224 = await prisma.partnerWalletTransaction.findFirst({
    where: {
      wallet: { partnerId },
      amountCents: EXPECTED_CHARGE_CENTS,
      type: "ESIM_PURCHASE_DEBIT",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      amountCents: true,
      balanceAfterCents: true,
      referenceId: true,
      idempotencyKey: true,
      createdAt: true,
    },
  });

  const neverStarted = Boolean(
    latest224 &&
      !(latest224.providerOrderId ?? "").trim() &&
      !(latest224.orderId ?? "").trim() &&
      !latest224.providerRefreshClaimedAt &&
      !(latest224.providerResultKind ?? "").trim()
  );

  const claimedButNoOrder = Boolean(
    latest224 &&
      latest224.providerRefreshClaimedAt &&
      !(latest224.providerOrderId ?? "").trim() &&
      !(latest224.orderId ?? "").trim()
  );

  return NextResponse.json({
    ok: true,
    hashPrefix,
    partnerEmail: partnerUser.email,
    partnerId,
    balanceCents: partnerUser.partnerProfile.walletAccount?.balanceCents ?? null,
    latest224,
    debitTx,
    newestDebit224,
    neverStarted,
    claimedButNoOrder,
    recentPurchases,
    gitHint:
      "Compare deployment githubCommitSha to 3a240ec locally; this route does not embed SHA.",
  });
}
