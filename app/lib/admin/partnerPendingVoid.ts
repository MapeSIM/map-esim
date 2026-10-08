/**
 * Admin void / cancel for unprovisioned Partner eSIM wallet holds.
 * Restores partner balance and purchase READY — never invents amounts.
 */
import "server-only";

import { PartnerEsimPurchaseStatus, Role } from "@prisma/client";
import { isAdminVoidablePartnerPurchase } from "@/app/lib/admin/partnerPendingVoidShared";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import {
  PartnerPurchaseWalletError,
  releasePartnerFullWalletStaleReservationInTx,
  releasePartnerGatewayReservationInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";

export const PARTNER_PENDING_VOID_AUDIT = "admin.partner_pending_purchase_voided";

export type VoidPendingPartnerPurchaseResult =
  | { ok: true; refundTransactionId: string | null; alreadyReleased: boolean }
  | { ok: false; error: string };

export async function voidPendingPartnerEsimPurchaseReservation(input: {
  adminUserId: string;
  partnerId: string;
  partnerEsimPurchaseId: string;
}): Promise<VoidPendingPartnerPurchaseResult> {
  const adminUserId = (input.adminUserId ?? "").trim();
  const partnerId = (input.partnerId ?? "").trim();
  const purchaseId = (input.partnerEsimPurchaseId ?? "").trim();

  if (!adminUserId || adminUserId.length > 64) {
    return { ok: false, error: "Admin session is unavailable." };
  }
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner is unavailable." };
  }
  if (
    !purchaseId ||
    purchaseId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(purchaseId)
  ) {
    return { ok: false, error: "Purchase is unavailable." };
  }

  const partner = await prisma.partnerProfile.findFirst({
    where: {
      id: partnerId,
      user: { role: Role.PARTNER },
    },
    select: { id: true },
  });
  if (!partner) {
    return { ok: false, error: "Partner is unavailable." };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: { id: purchaseId, partnerId: partner.id },
    select: {
      id: true,
      partnerId: true,
      status: true,
      orderId: true,
      providerOrderId: true,
      providerResultKind: true,
      debitTransactionId: true,
      refundTransactionId: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
    },
  });

  if (!purchase) {
    return { ok: false, error: "Purchase is unavailable." };
  }

  if (
    purchase.status === PartnerEsimPurchaseStatus.READY &&
    !purchase.debitTransactionId
  ) {
    return { ok: true, refundTransactionId: null, alreadyReleased: true };
  }

  if (
    !isAdminVoidablePartnerPurchase({
      status: purchase.status,
      orderId: purchase.orderId,
      providerOrderId: purchase.providerOrderId,
      providerResultKind: purchase.providerResultKind,
      debitTransactionId: purchase.debitTransactionId,
      refundTransactionId: purchase.refundTransactionId,
      walletAppliedCents: purchase.walletAppliedCents,
      gatewayAmountCents: purchase.gatewayAmountCents,
    })
  ) {
    return {
      ok: false,
      error:
        "This purchase cannot be voided here. Use reconciliation if an eSIM may exist.",
    };
  }

  const amountCents = purchase.walletAppliedCents;
  const gatewayAmountCents = purchase.gatewayAmountCents;

  try {
    let refundTransactionId: string | null = null;
    let alreadyReleased = false;

    await prisma.$transaction(async (tx) => {
      const result =
        gatewayAmountCents === 0
          ? await releasePartnerFullWalletStaleReservationInTx(tx, {
              partnerId: partner.id,
              partnerEsimPurchaseId: purchase.id,
              amountCents,
            })
          : await releasePartnerGatewayReservationInTx(tx, {
              partnerId: partner.id,
              partnerEsimPurchaseId: purchase.id,
              amountCents,
            });

      if (result.outcome === "already_released") {
        alreadyReleased = true;
        refundTransactionId = result.refundTransactionId;
        return;
      }
      refundTransactionId = result.refundTransactionId;
    });

    await writeAuditLog({
      actorUserId: adminUserId,
      action: PARTNER_PENDING_VOID_AUDIT,
      targetType: "PartnerEsimPurchase",
      targetId: purchase.id,
      metadata: {
        partnerId: partner.id,
        purchaseId: purchase.id,
        amountCents,
        gatewayAmountCents,
        refundTransactionId,
        alreadyReleased,
      },
    }).catch(() => undefined);

    return {
      ok: true,
      refundTransactionId,
      alreadyReleased,
    };
  } catch (error) {
    if (error instanceof PartnerPurchaseWalletError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        "Partner reservation void is temporarily unavailable. Please try again shortly.",
    };
  }
}
