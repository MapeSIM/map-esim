/**
 * TEMPORARY Preview-only READ-ONLY Partner purchase diagnostic.
 * Hash-gated. No writes, no VeSIM purchase, no refunds. Delete after one use.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { PartnerEsimPurchaseStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  getOperationalControlsHealthSnapshot,
  loadOperationalControlPausedMapSoft,
} from "@/app/lib/admin/operationalControlsPolicy";
import { getVesimBaseUrl } from "@/app/lib/vesim/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_PREVIEW_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const FORBIDDEN_PROD_HASH_PREFIX = "8e9b5fcaa648d171";
const KNOWN_PRIOR = new Set([
  "cmtn4zy370001ky045do2im0n",
  "cmtn8eo520001la04na8cjl0w",
]);

function sha16(v: string) {
  return createHash("sha256").update(v, "utf8").digest("hex").slice(0, 16);
}

function deny(reason: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: reason, ...extra },
    { status: 403 }
  );
}

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  const hashPrefix = url ? sha16(url) : "missing";

  if (hashPrefix === FORBIDDEN_PROD_HASH_PREFIX) {
    return deny("production_db_blocked", { hashPrefix });
  }
  if (hashPrefix !== EXPECTED_PREVIEW_HASH_PREFIX) {
    return deny("preview_db_hash_mismatch", { hashPrefix });
  }

  try {
    const recent = await prisma.partnerEsimPurchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        offerId: true,
        partnerChargeCents: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        debitTransactionId: true,
        refundTransactionId: true,
        providerRefreshClaimedAt: true,
        providerOrderId: true,
        orderId: true,
        providerResultKind: true,
        safeProviderStatusCode: true,
        failureCategory: true,
        failureCode: true,
      },
    });

    const focus =
      recent.find(
        (p) =>
          !KNOWN_PRIOR.has(p.id) &&
          (p.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
            p.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED ||
            p.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING)
      ) ?? recent.find((p) => !KNOWN_PRIOR.has(p.id)) ?? recent[0];

    if (!focus) {
      return NextResponse.json({ ok: false, error: "no_purchases", hashPrefix });
    }

    const full = await prisma.partnerEsimPurchase.findUnique({
      where: { id: focus.id },
      include: {
        partner: {
          select: {
            userId: true,
            walletAccount: { select: { balanceCents: true } },
          },
        },
      },
    });
    if (!full) {
      return NextResponse.json({
        ok: false,
        error: "purchase_not_found",
        hashPrefix,
      });
    }

    const debitTx = full.debitTransactionId
      ? await prisma.walletTransaction.findUnique({
          where: { id: full.debitTransactionId },
          select: {
            id: true,
            type: true,
            amountCents: true,
            balanceAfterCents: true,
            idempotencyKey: true,
            createdAt: true,
          },
        })
      : null;
    const refundTx = full.refundTransactionId
      ? await prisma.walletTransaction.findUnique({
          where: { id: full.refundTransactionId },
          select: {
            id: true,
            type: true,
            amountCents: true,
            balanceAfterCents: true,
            idempotencyKey: true,
            createdAt: true,
          },
        })
      : null;

    const refundKey = `partner_esim_refund_${full.id}`;
    const refundByKeyCount = await prisma.walletTransaction.count({
      where: { idempotencyKey: refundKey },
    });

    const audits = await prisma.auditLog.findMany({
      where: { targetType: "PartnerEsimPurchase", targetId: full.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true, metadata: true },
    });

    const windowStart = new Date(full.createdAt.getTime() - 60_000);
    const windowEnd = new Date(full.updatedAt.getTime() + 180_000);
    const nearbyOrders = await prisma.order.findMany({
      where: {
        customerUserId: full.partner.userId,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true,
        providerOrderId: true,
        status: true,
        fundingSource: true,
        createdAt: true,
      },
      take: 10,
    });

    let vesimConfig: { ok: boolean; code?: string } = { ok: false };
    try {
      getVesimBaseUrl();
      vesimConfig = { ok: true };
    } catch (error) {
      vesimConfig = {
        ok: false,
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code ?? "unknown")
            : "unknown",
      };
    }

    const opsPaused = await loadOperationalControlPausedMapSoft();
    let opsHealth: unknown = null;
    try {
      opsHealth = await getOperationalControlsHealthSnapshot();
    } catch (error) {
      opsHealth = {
        error:
          error instanceof Error ? error.message.slice(0, 120) : "ops_failed",
      };
    }

    return NextResponse.json({
      ok: true,
      hashPrefix,
      recent: recent.map((p) => ({
        id: p.id,
        offerId: p.offerId,
        amount: p.partnerChargeCents,
        status: p.status,
        createdAt: p.createdAt,
        claimed: !!p.providerRefreshClaimedAt,
        providerOrderId: p.providerOrderId,
        safeProviderStatusCode: p.safeProviderStatusCode,
        failureCode: p.failureCode,
      })),
      purchase: {
        id: full.id,
        offerId: full.offerId,
        partnerChargeCents: full.partnerChargeCents,
        status: full.status,
        debitTransactionId: full.debitTransactionId,
        refundTransactionId: full.refundTransactionId,
        providerRefreshClaimedAt: full.providerRefreshClaimedAt,
        providerOrderId: full.providerOrderId,
        orderId: full.orderId,
        providerResultKind: full.providerResultKind,
        safeProviderStatusCode: full.safeProviderStatusCode,
        failureCategory: full.failureCategory,
        failureCode: full.failureCode,
        reconciliationState: full.reconciliationState,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      },
      balanceCents: full.partner.walletAccount?.balanceCents ?? null,
      debitTx,
      refundTx,
      refundByKeyCount,
      audits,
      nearbyOrders,
      vesimConfig,
      opsPaused,
      opsHealth,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "diag_failed",
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        hashPrefix,
      },
      { status: 500 }
    );
  }
}
