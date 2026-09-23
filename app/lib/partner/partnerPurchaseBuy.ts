/**
 * Partner catalog buy orchestration (prepare → reserve → provider).
 * Server-authoritative — never trusts client money fields.
 *
 * Phase 2: when PARTNER_ESIM_SPLIT_PAYMENT_ENABLED and gateway remainder > 0,
 * start hosted checkout instead of VeSIM. Wallet-only path unchanged when
 * flag off or wallet covers partnerChargeCents.
 */
import "server-only";

import { PartnerEsimPurchaseStatus, Prisma } from "@prisma/client";
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

  try {
    const prepared = await preparePartnerEsimPurchase({
      partnerUserId: actor.userId,
      offerId,
      idempotencyKey: input.idempotencyKey,
      countryHint: input.countryHint,
      verifyOffer: input.verifyOffer,
    });
    purchaseId = prepared.purchaseId;

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

    // Phase 2 split: remainder via gateway — never VeSIM before payment confirmation.
    if (
      isPartnerEsimSplitPaymentEnabled() &&
      (status === PartnerEsimPurchaseStatus.READY ||
        status === PartnerEsimPurchaseStatus.DRAFT ||
        status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT)
    ) {
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
      const reserved = await reservePartnerEsimPurchase({
        partnerUserId: actor.userId,
        purchaseId: prepared.purchaseId,
        countryHint: input.countryHint,
        verifyOffer: input.verifyOffer,
      });
      purchaseId = reserved.purchaseId;
      status = reserved.status;
    }

    if (status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
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
