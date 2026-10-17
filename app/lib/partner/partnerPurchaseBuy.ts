/**
 * Partner catalog buy orchestration (prepare → reserve → provider).
 * Server-authoritative — never trusts client money fields.
 *
 * Wallet-only: reserve (DB debit) commits before VeSIM; provider finalize/refund
 * are separate DB txs. VeSIM fetch never runs inside Prisma $transaction.
 *
 * Phase 2: when PARTNER_ESIM_SPLIT_PAYMENT_ENABLED and gateway remainder > 0,
 * start hosted checkout instead of VeSIM. Wallet-only path unchanged when
 * flag off or wallet covers partnerChargeCents.
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
 * restore wallet and return the purchase to READY so the same idempotency key
 * can retry. Never releases after a provider claim or provider order evidence.
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

    await prisma.$transaction(async (tx) => {
      await releasePartnerFullWalletStaleReservationInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: purchaseId,
        amountCents: purchase.walletAppliedCents,
      });
    });
    console.error("partner_buy", {
      step: "released_unclaimed_provider_pending",
      purchaseId,
      partnerId,
    });
    return true;
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

type ProviderResumeResult =
  | {
      kind: "completed";
      purchaseId: string;
      duplicate: boolean;
    }
  | {
      kind: "released_ready";
    }
  | {
      kind: "failed_mapped";
      state: PartnerPurchaseActionState;
    };

/**
 * Resume a stuck PROVIDER_PENDING purchase, or refund the unclaimed debit so
 * the same buy click can reserve + call VeSIM again.
 */
async function tryCompleteOrHealUnclaimedProviderPending(options: {
  partnerUserId: string;
  purchaseId: string;
  partnerId: string;
  providerCheckout?: PartnerProviderCheckoutExecutor;
}): Promise<ProviderResumeResult> {
  const purchaseId = options.purchaseId.trim();
  const partnerId = options.partnerId.trim();

  const row = await prisma.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      status: true,
      partnerId: true,
      debitTransactionId: true,
      orderId: true,
      providerOrderId: true,
      providerResultKind: true,
      providerRefreshClaimedAt: true,
      gatewayAmountCents: true,
    },
  });

  if (!row || row.partnerId !== partnerId) {
    return {
      kind: "failed_mapped",
      state: mapPartnerPurchaseErrorCode("INVALID_STATE", purchaseId),
    };
  }

  if (row.status === PartnerEsimPurchaseStatus.COMPLETED && row.orderId) {
    return { kind: "completed", purchaseId, duplicate: true };
  }

  if (row.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED) {
    return {
      kind: "failed_mapped",
      state: mapPartnerPurchaseErrorCode("PROVIDER_FAILED", purchaseId),
    };
  }

  if (row.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    return {
      kind: "failed_mapped",
      state: mapPartnerPurchaseErrorCode("RECONCILIATION_REQUIRED", purchaseId),
    };
  }

  if (row.status === PartnerEsimPurchaseStatus.READY) {
    return { kind: "released_ready" };
  }

  if (row.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    return {
      kind: "failed_mapped",
      state: mapPartnerPurchaseErrorCode("INVALID_STATE", purchaseId),
    };
  }

  const hasProviderEvidence =
    Boolean((row.providerOrderId ?? "").trim()) ||
    (row.providerResultKind ?? "").trim() === "success" ||
    Boolean(row.providerRefreshClaimedAt);

  try {
    const executed = await executePartnerEsimProviderPurchase({
      partnerUserId: options.partnerUserId,
      purchaseId,
      providerCheckout: options.providerCheckout,
    });
    if (executed.status === PartnerEsimPurchaseStatus.COMPLETED) {
      return {
        kind: "completed",
        purchaseId: executed.purchaseId,
        duplicate: executed.duplicate,
      };
    }
    return {
      kind: "failed_mapped",
      state: mapPartnerPurchaseErrorCode("UNAVAILABLE", executed.purchaseId),
    };
  } catch (error) {
    // Re-read after execute: claim may have been set mid-call.
    const after = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        status: true,
        providerRefreshClaimedAt: true,
        providerOrderId: true,
        providerResultKind: true,
        orderId: true,
      },
    });
    if (after?.status === PartnerEsimPurchaseStatus.READY) {
      return { kind: "released_ready" };
    }
    if (
      after?.status === PartnerEsimPurchaseStatus.COMPLETED &&
      after.orderId
    ) {
      return { kind: "completed", purchaseId, duplicate: true };
    }

    const claimedNow =
      hasProviderEvidence ||
      Boolean(after?.providerRefreshClaimedAt) ||
      Boolean((after?.providerOrderId ?? "").trim()) ||
      (after?.providerResultKind ?? "").trim() === "success";

    // Claimed / provider-evidence rows must not be auto-released.
    if (!claimedNow) {
      const released = await releaseUnclaimedPartnerDebitAfterProviderFailure({
        purchaseId,
        partnerId,
      });
      if (released) {
        console.error("partner_buy", {
          step: "healed_unclaimed_provider_pending_to_ready",
          purchaseId,
          partnerId,
          code:
            error instanceof PartnerEsimPurchaseError
              ? error.code
              : undefined,
          message:
            error instanceof Error
              ? error.message.slice(0, 300)
              : String(error).slice(0, 300),
        });
        return { kind: "released_ready" };
      }
    }
    if (error instanceof PartnerEsimPurchaseError) {
      return {
        kind: "failed_mapped",
        state: mapPartnerPurchaseErrorCode(error.code, purchaseId),
      };
    }
    throw error;
  }
}

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

/**
 * Full Partner buy: prepare → (wallet-only reserve → provider) OR (split checkout).
 * Returns Partner-safe action state (no provider internals).
 * checkout_redirect must be handled by the server action via redirect().
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
  let partnerId: string | undefined;
  let lastStep = "start";

  try {
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
      return {
        ok: true,
        kind: "duplicate_success",
        purchaseId: prepared.purchaseId,
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
    // Only skip the second live offer fetch when prepare just created this READY row.
    let skipLiveOfferRecheck =
      !prepared.duplicate && status === PartnerEsimPurchaseStatus.READY;

    // Stuck PROVIDER_PENDING (prior timeout / failed VeSIM before claim): try to
    // finish VeSIM once; if that fails with no provider evidence, refund wallet
    // back to READY and continue reserve→provider in this same click.
    if (status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
      lastStep = "provider_resume";
      const resume = await tryCompleteOrHealUnclaimedProviderPending({
        partnerUserId: actor.userId,
        purchaseId: prepared.purchaseId,
        partnerId: prepared.partnerId,
        providerCheckout: input.providerCheckout,
      });
      if (resume.kind === "completed") {
        return {
          ok: true,
          kind: resume.duplicate ? "duplicate_success" : "success",
          purchaseId: resume.purchaseId,
          message: resume.duplicate
            ? "This eSIM purchase was already completed."
            : "Your eSIM purchase completed successfully.",
        };
      }
      if (resume.kind === "failed_mapped") {
        return resume.state;
      }
      // Released to READY — fall through to reserve + provider with live re-verify.
      status = PartnerEsimPurchaseStatus.READY;
      skipLiveOfferRecheck = false;
      purchaseId = prepared.purchaseId;
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
      let tryGatewayResume = status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;

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
            // May already have left READY (race) — try gateway resume below.
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
            // Full wallet after funding change while awaiting — fall through.
            // else: full wallet coverage → fall through to wallet-only path
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
      // else: full wallet coverage → fall through to wallet-only path
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
      try {
        const executed = await executePartnerEsimProviderPurchase({
          partnerUserId: actor.userId,
          purchaseId: purchaseId!,
          providerCheckout: input.providerCheckout,
        });

        if (executed.status === PartnerEsimPurchaseStatus.COMPLETED) {
          return {
            ok: true,
            kind: executed.duplicate ? "duplicate_success" : "success",
            purchaseId: executed.purchaseId,
            message: executed.duplicate
              ? "This eSIM purchase was already completed."
              : "Your eSIM purchase completed successfully.",
          };
        }

        return mapPartnerPurchaseErrorCode("UNAVAILABLE", executed.purchaseId);
      } catch (providerError) {
        // Reserve already committed. If VeSIM never claimed, restore wallet now
        // so partners are not left with a silent debit and no Order.
        if (purchaseId && partnerId) {
          await releaseUnclaimedPartnerDebitAfterProviderFailure({
            purchaseId,
            partnerId,
          });
        }
        throw providerError;
      }
    }

    if (status === PartnerEsimPurchaseStatus.COMPLETED) {
      return {
        ok: true,
        kind: "duplicate_success",
        purchaseId: purchaseId!,
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
    // Outer safety net (e.g. unexpected throw after reserve, before provider try).
    if (
      purchaseId &&
      partnerId &&
      (lastStep === "provider" || lastStep === "reserve")
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
