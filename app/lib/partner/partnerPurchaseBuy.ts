/**
 * Partner catalog buy orchestration (prepare → reserve → provider).
 * Server-authoritative — never trusts client money fields.
 *
 * Wallet-only: reserve (DB debit) commits before VeSIM; provider finalize/refund
 * are separate DB txs. VeSIM fetch never runs inside Prisma $transaction.
 *
 * Each Issue eSIM click should use a fresh idempotency key (client) so VeSIM
 * receives a brand-new checkout. Stuck unclaimed PROVIDER_PENDING debits are
 * released before prepare so the wallet is not trapped.
 *
 * Phase 2: when PARTNER_ESIM_SPLIT_PAYMENT_ENABLED and gateway remainder > 0,
 * start hosted checkout instead of VeSIM.
 */
import "server-only";

import { PartnerEsimPurchaseStatus, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  PartnerEsimPurchaseError,
  preparePartnerEsimPurchase,
  reservePartnerEsimPurchase,
  setPartnerPurchaseFundingChoice,
  type PartnerOfferVerifier,
} from "@/app/lib/partner/partnerEsimPurchase";
import {
  executePartnerEsimProviderPurchase,
  type PartnerProviderCheckoutExecutor,
} from "@/app/lib/partner/partnerEsimPurchaseProvider";
import { reportServerError } from "@/app/lib/monitoring/serverErrorMonitoring";
import {
  PartnerEsimPurchaseGatewayCheckoutError,
  startPartnerEsimPurchaseHostedCheckout,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayCheckout";
import { isPartnerEsimSplitPaymentEnabled } from "@/app/lib/partner/partnerEsimSplitPaymentPolicy";
import { partnerPurchaseRequiresGateway } from "@/app/lib/partner/partnerPurchaseFunding";
import {
  mapPartnerPurchaseErrorCode,
  type PartnerPurchaseActionState,
} from "@/app/lib/partner/partnerPurchaseFormState";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { releasePartnerFullWalletStaleReservationInTx } from "@/app/lib/partner/partnerPurchaseWallet";

/**
 * If reserve committed but VeSIM never started (no provider claim / order id),
 * restore wallet and return the purchase to READY.
 * Never releases after a provider claim or provider order evidence.
 */
async function releaseUnclaimedPartnerDebitAfterProviderFailure(options: {
  purchaseId: string;
  partnerId: string;
}): Promise<boolean> {
  const purchaseId = options.purchaseId.trim();
  const partnerId = options.partnerId.trim();
  if (!purchaseId || !partnerId) return false;

  try {
    const purchase = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        partnerId: true,
        status: true,
        walletAppliedCents: true,
        gatewayAmountCents: true,
        debitTransactionId: true,
        orderId: true,
        providerOrderId: true,
        providerResultKind: true,
        providerRefreshClaimedAt: true,
      },
    });
    if (
      !purchase ||
      purchase.partnerId !== partnerId ||
      purchase.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
      purchase.gatewayAmountCents !== 0 ||
      !purchase.debitTransactionId ||
      purchase.providerRefreshClaimedAt ||
      (purchase.orderId ?? "").trim() ||
      (purchase.providerOrderId ?? "").trim() ||
      (purchase.providerResultKind ?? "").trim() === "success" ||
      !Number.isInteger(purchase.walletAppliedCents) ||
      purchase.walletAppliedCents <= 0
    ) {
      return false;
    }

    const releaseOutcome = await prisma.$transaction(async (tx) => {
      return releasePartnerFullWalletStaleReservationInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: purchaseId,
        amountCents: purchase.walletAppliedCents,
      });
    });
    const after = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        status: true,
        debitTransactionId: true,
        refundTransactionId: true,
      },
    });
    const released =
      after?.status === PartnerEsimPurchaseStatus.READY &&
      !after.debitTransactionId;
    console.error("partner_buy", {
      step: released
        ? "released_unclaimed_provider_pending"
        : "release_unclaimed_provider_pending_noop",
      purchaseId,
      partnerId,
      outcome: releaseOutcome.outcome,
      refundTransactionId: releaseOutcome.refundTransactionId,
      statusAfter: after?.status ?? null,
    });
    return released;
  } catch (error) {
    console.error("partner_buy", {
      step: "release_unclaimed_provider_pending_failed",
      purchaseId,
      partnerId,
      name: error instanceof Error ? error.name : typeof error,
      message:
        error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300),
    });
    return false;
  }
}

/**
 * Free wallet holds from prior timed-out Issue eSIM clicks (unclaimed only).
 * Does not touch claimed / provider-evidenced rows (reconciliation).
 */
async function releaseStaleUnclaimedPartnerDebits(partnerId: string): Promise<number> {
  const id = partnerId.trim();
  if (!id) return 0;

  const rows = await prisma.partnerEsimPurchase.findMany({
    where: {
      partnerId: id,
      status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
      gatewayAmountCents: 0,
      orderId: null,
      providerOrderId: null,
      debitTransactionId: { not: null },
      providerRefreshClaimedAt: null,
      OR: [
        { providerResultKind: null },
        { providerResultKind: { not: "success" } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 25,
    select: { id: true },
  });

  let released = 0;
  for (const row of rows) {
    const ok = await releaseUnclaimedPartnerDebitAfterProviderFailure({
      purchaseId: row.id,
      partnerId: id,
    });
    if (ok) released += 1;
  }
  if (released > 0) {
    console.error("partner_buy", {
      step: "released_stale_unclaimed_batch",
      partnerId: id,
      released,
      scanned: rows.length,
    });
  }
  return released;
}

export type BuyPartnerEsimPurchaseInput = {
  partnerUserId: string;
  offerId: string;
  idempotencyKey: string;
  countryHint?: string | null;
  /**
   * Server-resolved funding flag from paymentMode / useWallet.
   * Defaults true (legacy Partner UI) when omitted.
   */
  useWallet?: boolean;
  walletOperatorId?: string;
  customerMsisdn?: string;
  /** Test seams only. */
  verifyOffer?: PartnerOfferVerifier;
  providerCheckout?: PartnerProviderCheckoutExecutor;
};

function mapGatewayCheckoutError(
  error: PartnerEsimPurchaseGatewayCheckoutError,
  purchaseId?: string
): PartnerPurchaseActionState {
  if (error.code === "INSUFFICIENT_FUNDS") {
    return mapPartnerPurchaseErrorCode("INSUFFICIENT_FUNDS", purchaseId);
  }
  if (error.code === "PRICING_CHANGED") {
    return mapPartnerPurchaseErrorCode("PRICING_CHANGED", purchaseId);
  }
  if (error.code === "PARTNER_UNAVAILABLE") {
    return mapPartnerPurchaseErrorCode("PARTNER_UNAVAILABLE", purchaseId);
  }
  if (
    error.code === "INVALID_STATE" &&
    (error.message.includes("mobile") ||
      error.message.includes("Easypaisa") ||
      error.message.includes("JazzCash") ||
      error.message.includes("wallet"))
  ) {
    const fieldErrors: {
      walletOperatorId?: string;
      customerMsisdn?: string;
    } = {};
    if (error.message.includes("mobile")) {
      fieldErrors.customerMsisdn = error.message;
    } else {
      fieldErrors.walletOperatorId = error.message;
    }
    return {
      ok: false,
      kind: "invalid",
      message: error.message,
      purchaseId,
      fieldErrors,
    };
  }
  if (error.code === "GATEWAY_UNAVAILABLE") {
    return {
      ok: false,
      kind: "unavailable",
      message: error.message,
      purchaseId,
    };
  }
  return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
}

async function runProviderStep(options: {
  partnerUserId: string;
  purchaseId: string;
  partnerId: string;
  providerCheckout?: PartnerProviderCheckoutExecutor;
}): Promise<PartnerPurchaseActionState> {
  try {
    const executed = await executePartnerEsimProviderPurchase({
      partnerUserId: options.partnerUserId,
      purchaseId: options.purchaseId,
      providerCheckout: options.providerCheckout,
    });

    if (executed.status === PartnerEsimPurchaseStatus.COMPLETED) {
      return {
        ok: true,
        kind: executed.duplicate ? "duplicate_success" : "success",
        purchaseId: executed.purchaseId,
        orderId: executed.orderId,
        message: executed.duplicate
          ? "This eSIM purchase was already completed."
          : "Your eSIM purchase completed successfully.",
      };
    }

    return mapPartnerPurchaseErrorCode("UNAVAILABLE", executed.purchaseId);
  } catch (providerError) {
    await releaseUnclaimedPartnerDebitAfterProviderFailure({
      purchaseId: options.purchaseId,
      partnerId: options.partnerId,
    });
    throw providerError;
  }
}

/**
 * Full Partner buy: prepare → (wallet-only reserve → provider) OR (split checkout).
 * Returns Partner-safe action state (no provider internals).
 * checkout_redirect / success redirects are handled by the server action.
 */
export async function buyPartnerEsimPurchase(
  input: BuyPartnerEsimPurchaseInput
): Promise<PartnerPurchaseActionState> {
  const actor = await requireActivePartnerActor(input.partnerUserId);
  if (!actor) {
    return mapPartnerPurchaseErrorCode("PARTNER_UNAVAILABLE");
  }

  const offerId = (input.offerId ?? "").trim();
  if (!offerId || offerId.length > 120) {
    return {
      ok: false,
      kind: "invalid",
      message: "Select an available package.",
      fieldErrors: { offerId: "Select an available package." },
    };
  }

  const useWallet = input.useWallet !== false;
  let purchaseId: string | undefined;
  let partnerId: string | undefined = actor.partnerId;
  let lastStep = "start";

  try {
    // Free wallet from prior timed-out Issue eSIM clicks before a new attempt.
    lastStep = "release_stale";
    await releaseStaleUnclaimedPartnerDebits(actor.partnerId);

    lastStep = "prepare";
    const prepared = await preparePartnerEsimPurchase({
      partnerUserId: actor.userId,
      offerId,
      idempotencyKey: input.idempotencyKey,
      countryHint: input.countryHint,
      verifyOffer: input.verifyOffer,
    });
    purchaseId = prepared.purchaseId;
    partnerId = prepared.partnerId;

    if (prepared.status === PartnerEsimPurchaseStatus.COMPLETED) {
      const completed = await prisma.partnerEsimPurchase.findUnique({
        where: { id: prepared.purchaseId },
        select: { orderId: true },
      });
      return {
        ok: true,
        kind: "duplicate_success",
        purchaseId: prepared.purchaseId,
        orderId: completed?.orderId ?? null,
        message: "This eSIM purchase was already completed.",
      };
    }
    if (prepared.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED) {
      return mapPartnerPurchaseErrorCode(
        "PROVIDER_FAILED",
        prepared.purchaseId
      );
    }
    if (
      prepared.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED
    ) {
      return mapPartnerPurchaseErrorCode(
        "RECONCILIATION_REQUIRED",
        prepared.purchaseId
      );
    }

    let status: PartnerEsimPurchaseStatus = prepared.status;
    // Fresh prepare in this request already live-verified the offer.
    const skipLiveOfferRecheck =
      !prepared.duplicate && status === PartnerEsimPurchaseStatus.READY;

    // Same-key double-submit while PROVIDER_PENDING: finish or release, then continue.
    if (status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
      lastStep = "provider_same_key";
      try {
        return await runProviderStep({
          partnerUserId: actor.userId,
          purchaseId: prepared.purchaseId,
          partnerId: prepared.partnerId,
          providerCheckout: input.providerCheckout,
        });
      } catch (error) {
        const again = await prisma.partnerEsimPurchase.findUnique({
          where: { id: prepared.purchaseId },
          select: { status: true },
        });
        if (again?.status === PartnerEsimPurchaseStatus.READY) {
          status = PartnerEsimPurchaseStatus.READY;
        } else if (error instanceof PartnerEsimPurchaseError) {
          return mapPartnerPurchaseErrorCode(error.code, prepared.purchaseId);
        } else {
          throw error;
        }
      }
    }

    // Phase 2 split: remainder via gateway — never VeSIM before payment confirmation.
    if (
      isPartnerEsimSplitPaymentEnabled() &&
      (status === PartnerEsimPurchaseStatus.READY ||
        status === PartnerEsimPurchaseStatus.DRAFT ||
        status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT)
    ) {
      lastStep = "split_funding";
      let funding:
        | Awaited<ReturnType<typeof setPartnerPurchaseFundingChoice>>
        | null = null;
      let tryGatewayResume =
        status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;

      if (status === PartnerEsimPurchaseStatus.READY) {
        try {
          funding = await setPartnerPurchaseFundingChoice({
            partnerUserId: actor.userId,
            purchaseId: prepared.purchaseId,
            useWallet,
          });
        } catch (error) {
          if (
            error instanceof PartnerEsimPurchaseError &&
            error.code === "INVALID_STATE"
          ) {
            funding = null;
            tryGatewayResume = true;
          } else if (error instanceof PartnerEsimPurchaseError) {
            return mapPartnerPurchaseErrorCode(error.code, prepared.purchaseId);
          } else {
            throw error;
          }
        }
      }

      const needsGateway = funding
        ? partnerPurchaseRequiresGateway(funding)
        : tryGatewayResume;

      if (needsGateway) {
        lastStep = "gateway_checkout";
        try {
          const checkout = await startPartnerEsimPurchaseHostedCheckout({
            partnerUserId: actor.userId,
            purchaseId: prepared.purchaseId,
            countryHint: input.countryHint,
            useWallet,
            walletOperatorId: input.walletOperatorId,
            customerMsisdn: input.customerMsisdn,
            verifyOffer: input.verifyOffer,
          });
          return {
            ok: true,
            kind: "checkout_redirect",
            purchaseId: checkout.purchaseId,
            checkoutUrl: checkout.checkoutUrl,
            message: "Continue to payment to complete this purchase.",
          };
        } catch (error) {
          if (error instanceof PartnerEsimPurchaseGatewayCheckoutError) {
            if (
              !(
                error.code === "INVALID_STATE" &&
                error.message.includes("does not require card payment")
              )
            ) {
              return mapGatewayCheckoutError(error, prepared.purchaseId);
            }
          } else {
            throw error;
          }
        }
      }
    }

    if (
      status === PartnerEsimPurchaseStatus.READY ||
      status === PartnerEsimPurchaseStatus.DRAFT
    ) {
      lastStep = "reserve";
      const reserved = await reservePartnerEsimPurchase({
        partnerUserId: actor.userId,
        purchaseId: prepared.purchaseId,
        countryHint: input.countryHint,
        verifyOffer: input.verifyOffer,
        skipLiveOfferRecheck,
      });
      purchaseId = reserved.purchaseId;
      status = reserved.status;
    }

    if (status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
      lastStep = "provider";
      return await runProviderStep({
        partnerUserId: actor.userId,
        purchaseId: purchaseId!,
        partnerId: partnerId!,
        providerCheckout: input.providerCheckout,
      });
    }

    if (status === PartnerEsimPurchaseStatus.COMPLETED) {
      const completed = await prisma.partnerEsimPurchase.findUnique({
        where: { id: purchaseId! },
        select: { orderId: true },
      });
      return {
        ok: true,
        kind: "duplicate_success",
        purchaseId: purchaseId!,
        orderId: completed?.orderId ?? null,
        message: "This eSIM purchase was already completed.",
      };
    }

    if (status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT) {
      return {
        ok: false,
        kind: "unavailable",
        message:
          "Complete payment for this purchase, or wait for confirmation before buying again.",
        purchaseId,
      };
    }

    return mapPartnerPurchaseErrorCode("INVALID_STATE", purchaseId);
  } catch (error) {
    console.error("partner_buy", {
      step: "buy_failed",
      lastStep,
      purchaseId,
      partnerId,
      offerId,
      name: error instanceof Error ? error.name : typeof error,
      code:
        error instanceof PartnerEsimPurchaseError
          ? error.code
          : error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code ?? "").slice(0, 64)
            : undefined,
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    });
    if (
      purchaseId &&
      partnerId &&
      (lastStep === "provider" ||
        lastStep === "provider_same_key" ||
        lastStep === "reserve")
    ) {
      await releaseUnclaimedPartnerDebitAfterProviderFailure({
        purchaseId,
        partnerId,
      });
    }
    reportServerError(error, {
      operation: "partner_buy",
      purchaseType: "partner",
      purchaseId,
      errorCode:
        error instanceof PartnerEsimPurchaseError
          ? error.code
          : error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code ?? "").slice(0, 64)
            : undefined,
      extras: { lastStep, offerId },
    });
    if (error instanceof PartnerEsimPurchaseError) {
      return mapPartnerPurchaseErrorCode(error.code, purchaseId);
    }
    if (error instanceof PartnerEsimPurchaseGatewayCheckoutError) {
      return mapGatewayCheckoutError(error, purchaseId);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Error
    ) {
      return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
    }
    return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
  }
}
