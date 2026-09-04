/**
 * TEMPORARY Preview-only READ-ONLY diagnostic for Austria 220c / suffix z31n.
 * Hash-gated. No writes, no VeSIM, no refunds. Delete after one probe.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_PREVIEW_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const FORBIDDEN_PROD_HASH_PREFIX = "8e9b5fcaa648d171";

function sha16(v: string) {
  return createHash("sha256").update(v, "utf8").digest("hex").slice(0, 16);
}

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  const hashPrefix = url ? sha16(url) : "missing";
  if (hashPrefix === FORBIDDEN_PROD_HASH_PREFIX) {
    return NextResponse.json(
      { ok: false, error: "production_db_blocked", hashPrefix },
      { status: 403 }
    );
  }
  if (hashPrefix !== EXPECTED_PREVIEW_HASH_PREFIX) {
    return NextResponse.json(
      { ok: false, error: "preview_db_hash_mismatch", hashPrefix },
      { status: 403 }
    );
  }

  try {
    const start = new Date("2026-09-04T18:40:00.000Z");
    const end = new Date("2026-09-04T18:55:00.000Z");

    const candidates = await prisma.partnerEsimPurchase.findMany({
      where: {
        partnerChargeCents: 220,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        offerId: true,
        destinationCode: true,
        destinationName: true,
        planName: true,
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
        reconciliationState: true,
      },
    });

    const focus =
      candidates.find((p) => p.id.endsWith("z31n")) ??
      candidates.find(
        (p) =>
          (p.destinationCode ?? "").toUpperCase() === "AT" ||
          (p.offerId ?? "").toUpperCase().includes("-AT-") ||
          (p.destinationName ?? "").toLowerCase().includes("austria")
      ) ??
      (
        await prisma.partnerEsimPurchase.findMany({
          where: { id: { endsWith: "z31n" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            offerId: true,
            destinationCode: true,
            destinationName: true,
            planName: true,
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
            reconciliationState: true,
          },
        })
      )[0];

    if (!focus) {
      return NextResponse.json({
        ok: false,
        error: "purchase_not_found",
        hashPrefix,
        candidateCount: candidates.length,
        candidateIds: candidates.map((c) => c.id),
      });
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
        error: "purchase_missing",
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
    const refundByKeyCount = await prisma.walletTransaction.count({
      where: { idempotencyKey: `partner_esim_refund_${full.id}` },
    });
    const audits = await prisma.auditLog.findMany({
      where: { targetType: "PartnerEsimPurchase", targetId: full.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true, metadata: true },
    });
    const nearbyOrders = await prisma.order.findMany({
      where: {
        userId: full.partner.userId,
        createdAt: {
          gte: new Date(full.createdAt.getTime() - 60_000),
          lte: new Date(full.updatedAt.getTime() + 180_000),
        },
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
    const opsRows = await prisma.operationalControl.findMany({
      select: { key: true, paused: true },
      take: 20,
    });

    return NextResponse.json({
      ok: true,
      hashPrefix,
      candidates: candidates.map((c) => ({
        id: c.id,
        offerId: c.offerId,
        destinationCode: c.destinationCode,
        status: c.status,
        safeProviderStatusCode: c.safeProviderStatusCode,
      })),
      purchase: {
        id: full.id,
        offerId: full.offerId,
        destinationCode: full.destinationCode,
        destinationName: full.destinationName,
        planName: full.planName,
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
      opsRows,
      vesimEnv: {
        VESIM_ENVIRONMENT: process.env.VESIM_ENVIRONMENT ? "set" : "missing",
        VESIM_BASE_URL: process.env.VESIM_BASE_URL ? "set" : "missing",
        VESIM_EMAIL: process.env.VESIM_EMAIL ? "set" : "missing",
        VESIM_PASSWORD: process.env.VESIM_PASSWORD ? "set" : "missing",
        VESIM_ENVIRONMENT_len: (process.env.VESIM_ENVIRONMENT ?? "").length,
        VESIM_BASE_URL_len: (process.env.VESIM_BASE_URL ?? "").length,
      },
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
