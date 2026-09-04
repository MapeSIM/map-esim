/**
 * TEMPORARY Preview-only read-only Partner purchase diagnostic.
 * No writes, no VeSIM calls, no refunds. Delete after one use.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_PREVIEW_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const FORBIDDEN_PROD_HASH_PREFIX = "8e9b5fcaa648d171";

function sha16(v: string) {
  return createHash("sha256").update(v).digest("hex").slice(0, 16).toLowerCase();
}

function deny(reason: string) {
  return NextResponse.json({ ok: false, error: reason }, { status: 403 });
}

function isSandboxHost(req: NextRequest) {
  const appBase = (process.env.APP_BASE_URL ?? "").toLowerCase();
  const host = (req.headers.get("host") ?? "").toLowerCase();
  return (
    appBase.includes("simpaisa-sandbox") ||
    host.includes("simpaisa-sandbox") ||
    host.includes("git-simpaisa-sandbox")
  );
}

export async function GET(req: NextRequest) {
  if ((process.env.VERCEL_ENV ?? "").trim() !== "preview") return deny("not_preview");
  if ((process.env.SIMPAISA_ENVIRONMENT ?? "").trim().toLowerCase() !== "sandbox") {
    return deny("not_sandbox");
  }
  if (!isSandboxHost(req)) return deny("host_mismatch");

  const dbUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!dbUrl || dbUrl === "[SENSITIVE]") {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 500 });
  }
  const hash = sha16(dbUrl);
  if (hash === FORBIDDEN_PROD_HASH_PREFIX) return deny("production_blocked");
  if (hash !== EXPECTED_PREVIEW_HASH_PREFIX) return deny("unexpected_db_hash");

  const vesimEnv = (process.env.VESIM_ENVIRONMENT ?? "").trim();
  let vesimHostClass: string | null = null;
  try {
    const base = (process.env.VESIM_BASE_URL ?? "").trim();
    if (base) vesimHostClass = new URL(base).hostname.toLowerCase();
  } catch {
    vesimHostClass = "unparseable";
  }

  const purchases = await prisma.partnerEsimPurchase.findMany({
    where: {
      OR: [
        { offerId: { contains: "ESIM-AX-7D-1GB-NOROAM", mode: "insensitive" } },
        { partnerChargeCents: 233 },
        { retailPriceCents: 233 },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      offerId: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      retailPriceCents: true,
      partnerChargeCents: true,
      providerCostCents: true,
      idempotencyKey: true,
      debitTransactionId: true,
      refundTransactionId: true,
      orderId: true,
      providerOrderId: true,
      providerResultKind: true,
      safeProviderStatusCode: true,
      providerObservedAt: true,
      failureCategory: true,
      failureCode: true,
      reconciliationState: true,
      providerRefreshClaimedAt: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      partnerId: true,
    },
  });

  // Also recent partner purchases (any) for context
  const recent = await prisma.partnerEsimPurchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      offerId: true,
      partnerChargeCents: true,
      providerOrderId: true,
      debitTransactionId: true,
      refundTransactionId: true,
      failureCategory: true,
      failureCode: true,
      safeProviderStatusCode: true,
      providerResultKind: true,
      providerRefreshClaimedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const wallet = await prisma.partnerWalletAccount.findFirst({
    where: { partner: { user: { email: "partner-sandbox@mapesim.com" } } },
    select: {
      id: true,
      balanceCents: true,
      version: true,
      currency: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          type: true,
          amountCents: true,
          balanceBeforeCents: true,
          balanceAfterCents: true,
          reason: true,
          referenceType: true,
          referenceId: true,
          idempotencyKey: true,
          createdAt: true,
        },
      },
    },
  });

  const audits = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: "PartnerEsimPurchase" },
        { action: { contains: "partner", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      metadata: true,
    },
  });

  const orderCountForProviderIds = await prisma.order.count({
    where: {
      providerOrderId: {
        in: purchases
          .map((p) => p.providerOrderId)
          .filter((x): x is string => !!x),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    PREVIEW_DB_HASH_PREFIX: hash,
    vesim: {
      VESIM_ENVIRONMENT: vesimEnv || null,
      vesimHostClass,
    },
    matchedPurchases: purchases,
    recentPurchases: recent,
    partnerSandboxWallet: wallet
      ? {
          balanceCents: wallet.balanceCents,
          version: wallet.version,
          currency: wallet.currency,
          recentTx: wallet.transactions,
        }
      : null,
    recentAudits: audits.map((a) => ({
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      createdAt: a.createdAt,
      // metadata may contain safe codes only by design for these audits
      metadata: a.metadata,
    })),
    localOrdersMatchingProviderIds: orderCountForProviderIds,
  });
}
