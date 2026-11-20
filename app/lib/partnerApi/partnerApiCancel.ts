/**
 * Partner Public API order cancel — unused/eligible eSIM only.
 * Credits Partner wallet atomically via existing purchase refund primitives.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { getPartnerOwnedOrderUsage } from "@/app/lib/partner/partnerOrderInstall";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import { releaseOrderLifecycleAfterCompletedRefund } from "@/app/lib/orders/orderRefundLifecycle";
import {
  classifyProviderLifecycleStatus,
} from "@/app/lib/orders/providerLifecycleShared";
import {
  normalizePartnerApiCancelReason,
  type PartnerApiActor,
  type PartnerApiCancelReasonCode,
} from "@/app/lib/partnerApiAuth";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const PARTNER_API_CANCEL_AUDIT = "partner_api.order_cancelled" as const;

const CANCEL_TX = { maxWait: 10_000, timeout: 20_000 } as const;

export type PartnerApiCancelResult =
  | {
      ok: true;
      orderId: string;
      purchaseId: string;
      refundedAmountCents: number;
      refundedAmountLabel: string;
      remainingBalanceCents: number;
      remainingBalanceLabel: string;
      reason: PartnerApiCancelReasonCode;
      idempotent: boolean;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID" | "NOT_ELIGIBLE" | "UNAVAILABLE";
      error: string;
    };

function notesOk(raw: unknown): string | null {
  if (raw == null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const notes = raw.replace(/[\r\n\u0000-\u001f]/g, " ").trim();
  if (notes.length > 500) return null;
  return notes;
}

function isUnusedEligible(usage: {
  isActivated: boolean | null;
  isExpired: boolean | null;
  usedDataGB: number | null;
  remainingDataGB: number | null;
  initialDataGB: number | null;
  status?: string | null;
  statusLabel?: string | null;
  isUnlimited?: boolean;
}): boolean {
  const lifecycle = classifyProviderLifecycleStatus({
    status: usage.status,
    statusLabel: usage.statusLabel,
    isActivated: usage.isActivated,
    isExpired: usage.isExpired,
    remainingDataGB: usage.remainingDataGB,
    isUnlimited: usage.isUnlimited,
  });
  if (
    lifecycle === "ACTIVE" ||
    lifecycle === "DEPLETED" ||
    lifecycle === "EXPIRED" ||
    lifecycle === "CANCELLED"
  ) {
    return false;
  }
  if (usage.isActivated === true) return false;
  if (usage.isExpired === true) return false;
  if (
    typeof usage.usedDataGB === "number" &&
    Number.isFinite(usage.usedDataGB) &&
    usage.usedDataGB > 0.01
  ) {
    return false;
  }
  // NOT_ACTIVE / UNKNOWN with no meaningful usage → eligible
  return lifecycle === "NOT_ACTIVE" || lifecycle === "UNKNOWN";
}

export async function cancelPartnerApiOrder(options: {
  actor: PartnerApiActor;
  orderId: string;
  reason: unknown;
  notes?: unknown;
}): Promise<PartnerApiCancelResult> {
  const orderId = String(options.orderId ?? "").trim();
  if (!orderId || orderId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return { ok: false, code: "NOT_FOUND", error: "Order not found." };
  }

  const reason = normalizePartnerApiCancelReason(options.reason);
  if (!reason) {
    return {
      ok: false,
      code: "INVALID",
      error: "Invalid cancel reason. Use a CANCEL_REASON_CODES value.",
    };
  }
  const notes = notesOk(options.notes);
  if (notes == null) {
    return {
      ok: false,
      code: "INVALID",
      error: "notes must be a string of at most 500 characters.",
    };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: options.actor.partnerId,
      orderId,
    },
    select: {
      id: true,
      partnerId: true,
      orderId: true,
      status: true,
      fundingSource: true,
      partnerChargeCents: true,
      debitTransactionId: true,
      refundTransactionId: true,
      debitTransaction: { select: { amountCents: true } },
    },
  });

  if (!purchase) {
    return { ok: false, code: "NOT_FOUND", error: "Order not found." };
  }

  // Idempotent: already refunded
  if (
    purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
    (purchase.refundTransactionId ?? "").trim()
  ) {
    const wallet = await prisma.partnerWalletAccount.findUnique({
      where: { partnerId: options.actor.partnerId },
      select: { balanceCents: true },
    });
    const remainingBalanceCents = wallet?.balanceCents ?? 0;
    return {
      ok: true,
      orderId,
      purchaseId: purchase.id,
      refundedAmountCents: purchase.partnerChargeCents,
      refundedAmountLabel: `${formatUsdCents(purchase.partnerChargeCents)} USD`,
      remainingBalanceCents,
      remainingBalanceLabel: `${formatUsdCents(remainingBalanceCents)} USD`,
      reason,
      idempotent: true,
    };
  }

  if (purchase.status !== PartnerEsimPurchaseStatus.COMPLETED) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "Only completed Partner orders can be cancelled.",
    };
  }
  if (purchase.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "Only Partner-balance funded orders can be cancelled via API.",
    };
  }
  if (
    !Number.isInteger(purchase.partnerChargeCents) ||
    purchase.partnerChargeCents <= 0 ||
    !(purchase.debitTransactionId ?? "").trim() ||
    purchase.debitTransaction?.amountCents !== purchase.partnerChargeCents
  ) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "A refundable Partner debit is not available for this order.",
    };
  }

  // Usage gate: unused / not activated only
  const usageRes = await getPartnerOwnedOrderUsage(
    options.actor.userId,
    orderId
  );
  if (!usageRes.ok) {
    if (usageRes.code === "NOT_FOUND") {
      return { ok: false, code: "NOT_FOUND", error: "Order not found." };
    }
    // NO_ICCID / USAGE_UNAVAILABLE: treat as not yet usable → allow cancel
    if (
      usageRes.code !== "NO_ICCID" &&
      usageRes.code !== "USAGE_UNAVAILABLE"
    ) {
      return {
        ok: false,
        code: "UNAVAILABLE",
        error: "Unable to verify eSIM usage for cancellation. Try again shortly.",
      };
    }
  } else if (!isUnusedEligible(usageRes.usage)) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error:
        "This eSIM has been activated or used and cannot be cancelled via API.",
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.partnerEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: {
          id: true,
          partnerId: true,
          status: true,
          fundingSource: true,
          partnerChargeCents: true,
          debitTransactionId: true,
          refundTransactionId: true,
          orderId: true,
        },
      });
      if (!fresh || fresh.partnerId !== options.actor.partnerId) {
        return { status: "not_found" as const };
      }
      if (
        fresh.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
        (fresh.refundTransactionId ?? "").trim()
      ) {
        return {
          status: "refunded" as const,
          refundTransactionId: fresh.refundTransactionId!,
          outcome: "already_applied" as const,
          amountCents: fresh.partnerChargeCents,
        };
      }
      if (
        fresh.status !== PartnerEsimPurchaseStatus.COMPLETED ||
        fresh.fundingSource !== OrderFundingSource.PARTNER_BALANCE ||
        !(fresh.debitTransactionId ?? "").trim()
      ) {
        return { status: "not_eligible" as const };
      }

      const claim = await tx.partnerEsimPurchase.updateMany({
        where: {
          id: fresh.id,
          partnerId: options.actor.partnerId,
          refundTransactionId: null,
          partnerChargeCents: fresh.partnerChargeCents,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
        },
        data: { updatedAt: new Date() },
      });
      if (claim.count !== 1) {
        const raced = await tx.partnerEsimPurchase.findUnique({
          where: { id: fresh.id },
          select: { refundTransactionId: true, partnerChargeCents: true },
        });
        if ((raced?.refundTransactionId ?? "").trim()) {
          return {
            status: "refunded" as const,
            refundTransactionId: raced!.refundTransactionId!,
            outcome: "already_applied" as const,
            amountCents: raced!.partnerChargeCents,
          };
        }
        return { status: "not_eligible" as const };
      }

      const refund = await refundPartnerPurchaseFundsInTx(tx, {
        partnerId: options.actor.partnerId,
        partnerEsimPurchaseId: fresh.id,
        amountCents: fresh.partnerChargeCents,
        reason: `Partner API cancel (${reason})`,
      });

      await tx.partnerEsimPurchase.updateMany({
        where: {
          id: fresh.id,
          refundTransactionId: null,
          partnerChargeCents: fresh.partnerChargeCents,
        },
        data: {
          status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
          refundTransactionId: refund.transactionId,
          failureCategory: "partner_api_cancel",
          failureCode: reason.slice(0, 64),
          reconciliationState: "refund_completed",
        },
      });

      await releaseOrderLifecycleAfterCompletedRefund(tx, {
        orderId: fresh.orderId,
        actorUserId: options.actor.userId,
      });

      return {
        status: "refunded" as const,
        refundTransactionId: refund.transactionId,
        outcome: refund.outcome === "created" ? ("created" as const) : ("already_applied" as const),
        amountCents: fresh.partnerChargeCents,
      };
    }, CANCEL_TX);

    if (result.status === "not_found") {
      return { ok: false, code: "NOT_FOUND", error: "Order not found." };
    }
    if (result.status === "not_eligible") {
      return {
        ok: false,
        code: "NOT_ELIGIBLE",
        error: "This order is not eligible for cancellation.",
      };
    }

    const wallet = await prisma.partnerWalletAccount.findUnique({
      where: { partnerId: options.actor.partnerId },
      select: { balanceCents: true },
    });
    const remainingBalanceCents = wallet?.balanceCents ?? 0;
    const idempotent = result.outcome !== "created";

    await writeAuditLog({
      actorUserId: options.actor.userId,
      action: PARTNER_API_CANCEL_AUDIT,
      targetType: "PartnerEsimPurchase",
      targetId: purchase.id,
      metadata: {
        orderId,
        reason,
        notes: notes || null,
        refundTransactionId: result.refundTransactionId,
        amountCents: result.amountCents,
        idempotent,
        apiKeyId: options.actor.apiKeyId,
      },
    });

    return {
      ok: true,
      orderId,
      purchaseId: purchase.id,
      refundedAmountCents: result.amountCents,
      refundedAmountLabel: `${formatUsdCents(result.amountCents)} USD`,
      remainingBalanceCents,
      remainingBalanceLabel: `${formatUsdCents(remainingBalanceCents)} USD`,
      reason,
      idempotent,
    };
  } catch (error) {
    if (error instanceof PartnerPurchaseWalletError) {
      return { ok: false, code: "UNAVAILABLE", error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Unique idempotency — treat as already refunded race
      const again = await prisma.partnerEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: {
          refundTransactionId: true,
          partnerChargeCents: true,
          status: true,
        },
      });
      if (
        again?.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
        (again.refundTransactionId ?? "").trim()
      ) {
        const wallet = await prisma.partnerWalletAccount.findUnique({
          where: { partnerId: options.actor.partnerId },
          select: { balanceCents: true },
        });
        const remainingBalanceCents = wallet?.balanceCents ?? 0;
        return {
          ok: true,
          orderId,
          purchaseId: purchase.id,
          refundedAmountCents: again.partnerChargeCents,
          refundedAmountLabel: `${formatUsdCents(again.partnerChargeCents)} USD`,
          remainingBalanceCents,
          remainingBalanceLabel: `${formatUsdCents(remainingBalanceCents)} USD`,
          reason,
          idempotent: true,
        };
      }
    }
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Cancellation is temporarily unavailable. Please try again shortly.",
    };
  }
}
