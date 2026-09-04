/**
 * Partner catalog buy orchestration (prepare → reserve → provider).
 * Server-authoritative — never trusts client money fields.
 */
import "server-only";

import { PartnerEsimPurchaseStatus } from "@prisma/client";
import {
  PartnerEsimPurchaseError,
  preparePartnerEsimPurchase,
  reservePartnerEsimPurchase,
  type PartnerOfferVerifier,
} from "@/app/lib/partner/partnerEsimPurchase";
import {
  compensateNeverStartedPartnerPurchaseIfEligible,
  executePartnerEsimProviderPurchase,
  type PartnerProviderCheckoutExecutor,
} from "@/app/lib/partner/partnerEsimPurchaseProvider";
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
  /** Test seams only. */
  verifyOffer?: PartnerOfferVerifier;
  providerCheckout?: PartnerProviderCheckoutExecutor;
  /** Test seam — abort after reserve/debit before provider claim. */
  beforeProviderClaim?: () => Promise<void>;
};

/**
 * Full Partner buy: prepare → reserve → provider execution.
 * Returns Partner-safe action state (no provider internals).
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
      try {
        const executed = await executePartnerEsimProviderPurchase({
          partnerUserId: actor.userId,
          purchaseId: purchaseId!,
          providerCheckout: input.providerCheckout,
          beforeProviderClaim: input.beforeProviderClaim,
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
      } catch (error) {
        // Gap after debit / before claim: ensure never-started rows are compensated.
        try {
          const compensated =
            await compensateNeverStartedPartnerPurchaseIfEligible({
              purchaseId: purchaseId!,
              partnerUserId: actor.userId,
            });
          if (compensated) {
            return mapPartnerPurchaseErrorCode("PROVIDER_FAILED", purchaseId);
          }
        } catch {
          // Fall through to original error mapping.
        }
        if (error instanceof PartnerEsimPurchaseError) {
          return mapPartnerPurchaseErrorCode(error.code, purchaseId);
        }
        return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
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

    return mapPartnerPurchaseErrorCode("INVALID_STATE", purchaseId);
  } catch (error) {
    if (purchaseId) {
      try {
        const compensated =
          await compensateNeverStartedPartnerPurchaseIfEligible({
            purchaseId,
            partnerUserId: actor.userId,
          });
        if (compensated) {
          return mapPartnerPurchaseErrorCode("PROVIDER_FAILED", purchaseId);
        }
      } catch {
        // Fall through.
      }
    }
    if (error instanceof PartnerEsimPurchaseError) {
      return mapPartnerPurchaseErrorCode(error.code, purchaseId);
    }
    return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
  }
}
