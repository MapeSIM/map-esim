/**
 * TEMPORARY Preview-only recovery for never-started Partner purchase (224¢).
 * Hash-gated. Uses existing partner_esim_refund_<id> path only. Remove after use.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { PartnerEsimPurchaseStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { refundNeverStartedPartnerEsimPurchase } from "@/app/lib/partner/partnerEsimPurchaseProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_DB_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const BLOCKED_PROD_HASH_PREFIX = "8e9b5fcaa648d171";
const TARGET_PURCHASE_ID = "cmtn8eo520001la04na8cjl0w";
const EXPECTED_CHARGE_CENTS = 224;
const CONFIRM_PHRASE = "REFUND_NEVER_STARTED_ONCE";

function dbUrlHashPrefix(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return "missing";
  return createHash("sha256").update(url, "utf8").digest("hex").slice(0, 16);
}

export async function POST(request: Request) {
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

  try {
    let body: { confirm?: string; purchaseId?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const url = new URL(request.url);
    const confirm = (
      body.confirm ??
      url.searchParams.get("confirm") ??
      ""
    ).trim();
    if (confirm !== CONFIRM_PHRASE) {
      return NextResponse.json(
        { ok: false, error: "confirm_phrase_required" },
        { status: 400 }
      );
    }
    const purchaseId = (
      body.purchaseId ??
      url.searchParams.get("purchaseId") ??
      TARGET_PURCHASE_ID
    ).trim();
    if (purchaseId !== TARGET_PURCHASE_ID) {
      return NextResponse.json(
        { ok: false, error: "unexpected_purchase_id" },
        { status: 400 }
      );
    }

    const before = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        status: true,
        partnerChargeCents: true,
        partnerId: true,
        providerOrderId: true,
        orderId: true,
        providerRefreshClaimedAt: true,
        providerResultKind: true,
        debitTransactionId: true,
        refundTransactionId: true,
        partner: {
          select: {
            userId: true,
            walletAccount: { select: { balanceCents: true } },
          },
        },
      },
    });
    if (!before) {
      return NextResponse.json(
        { ok: false, error: "purchase_not_found", hashPrefix },
        { status: 404 }
      );
    }

    const balanceBefore = before.partner.walletAccount?.balanceCents ?? null;
    const partnerUserId = before.partner.userId;
    if (
      (before.providerOrderId ?? "").trim() ||
      (before.orderId ?? "").trim() ||
      before.providerRefreshClaimedAt ||
      (before.providerResultKind ?? "").trim()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "provider_evidence_present_abort",
          hashPrefix,
          balanceBeforeCents: balanceBefore,
          status: before.status,
        },
        { status: 409 }
      );
    }

    if (
      before.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING &&
      !(
        before.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
        before.refundTransactionId
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "unexpected_purchase_state",
          hashPrefix,
          status: before.status,
          balanceBeforeCents: balanceBefore,
        },
        { status: 409 }
      );
    }

    if (
      before.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING &&
      (before.partnerChargeCents !== EXPECTED_CHARGE_CENTS ||
        !before.debitTransactionId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "unexpected_purchase_state",
          hashPrefix,
          status: before.status,
          partnerChargeCents: before.partnerChargeCents,
          balanceBeforeCents: balanceBefore,
        },
        { status: 409 }
      );
    }

    const first = await refundNeverStartedPartnerEsimPurchase({
      purchaseId,
      partnerUserId,
      expectedPartnerChargeCents: EXPECTED_CHARGE_CENTS,
    });
    const second = await refundNeverStartedPartnerEsimPurchase({
      purchaseId,
      partnerUserId,
      expectedPartnerChargeCents: EXPECTED_CHARGE_CENTS,
    });

    const after = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        status: true,
        refundTransactionId: true,
        partner: {
          select: { walletAccount: { select: { balanceCents: true } } },
        },
      },
    });
    const balanceAfter = after?.partner.walletAccount?.balanceCents ?? null;

    return NextResponse.json({
      ok: true,
      hashPrefix,
      purchaseId,
      statusBefore: before.status,
      statusAfter: after?.status ?? null,
      balanceBeforeCents: balanceBefore,
      balanceAfterCents: balanceAfter,
      balanceAfterRepeatCents: balanceAfter,
      refundTransactionId: first.refundTransactionId,
      repeatRefundTransactionId: second.refundTransactionId,
      firstIdempotent: first.idempotent,
      repeatIdempotent: second.idempotent,
      refundIdempotencyKey: `partner_esim_refund_${purchaseId}`,
      expectedBalanceAfterCents: 1000,
    });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    return NextResponse.json(
      {
        ok: false,
        error: "recovery_failed",
        code: code || "unknown",
        message:
          error instanceof Error
            ? error.message.slice(0, 160)
            : "unknown_error",
        hashPrefix,
      },
      { status: 500 }
    );
  }
}
