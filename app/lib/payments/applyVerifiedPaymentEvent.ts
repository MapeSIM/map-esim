import "server-only";

import { prisma } from "@/app/lib/db";
import { applyVerifiedEsimPurchasePaymentEvent } from "@/app/lib/esim/esimPurchasePaymentApply";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";
import { applyVerifiedTopupPaymentEvent } from "@/app/lib/wallet/topup";

export type ApplyVerifiedPaymentEventResult =
  | {
      kind: "esim_purchase";
      duplicate: boolean;
      outcome: string;
    }
  | {
      kind: "wallet_topup";
      duplicate: boolean;
      outcome: string;
    }
  | {
      kind: "ignored";
      reason: "unknown_reference";
    };

/**
 * Route a signature-verified normalized payment event to wallet top-up or
 * eSIM purchase funding. Gateway adapters may set purpose explicitly; when
 * metadata only carries a local id (e.g. Safepay order_id), resolve by DB.
 * Never creates VeSIM orders from top-up events.
 */
export async function applyVerifiedPaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedPaymentEventResult> {
  if (!event.signatureVerified) {
    throw new Error("UNSIGNED_PAYMENT_EVENT");
  }

  const topupId = (event.localTopupId ?? "").trim();
  const attemptId = (event.paymentAttemptId ?? "").trim();

  if (event.purpose === "WALLET_TOPUP" && topupId) {
    const result = await applyVerifiedTopupPaymentEvent(event);
    return {
      kind: "wallet_topup",
      duplicate: result.duplicate,
      outcome: result.status,
    };
  }

  if (event.purpose === "ESIM_PURCHASE" && attemptId) {
    // Ambiguous Safepay order_id: prefer an existing wallet top-up row.
    const topup = await prisma.walletTopup.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (topup) {
      const result = await applyVerifiedTopupPaymentEvent({
        ...event,
        purpose: "WALLET_TOPUP",
        localTopupId: topup.id,
        paymentAttemptId: null,
        purchaseId: null,
      });
      return {
        kind: "wallet_topup",
        duplicate: result.duplicate,
        outcome: result.status,
      };
    }

    const result = await applyVerifiedEsimPurchasePaymentEvent(event);
    return {
      kind: "esim_purchase",
      duplicate: result.duplicate,
      outcome: result.outcome,
    };
  }

  if (topupId) {
    const result = await applyVerifiedTopupPaymentEvent({
      ...event,
      purpose: "WALLET_TOPUP",
      localTopupId: topupId,
      paymentAttemptId: null,
      purchaseId: null,
    });
    return {
      kind: "wallet_topup",
      duplicate: result.duplicate,
      outcome: result.status,
    };
  }

  return { kind: "ignored", reason: "unknown_reference" };
}
