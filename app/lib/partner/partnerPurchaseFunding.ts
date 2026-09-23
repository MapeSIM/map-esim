/**
 * Pure Partner eSIM purchase funding breakdown (integer USD cents).
 * Charge base is partnerChargeCents (after admin discount) — never retail.
 * Never accepts browser-authoritative balances or money fields.
 */
import {
  calculatePurchaseFunding,
  PurchaseFundingError,
  type PurchaseFundingBreakdown,
} from "@/app/lib/esim/purchaseFunding";

export type PartnerPurchaseFundingInput = {
  /** Server snapshot partnerChargeCents. */
  partnerChargeCents: number;
  /** Server-loaded PartnerWalletAccount.balanceCents. */
  walletBalanceCents: number;
  useWallet?: boolean;
};

export type PartnerPurchaseFundingBreakdown = PurchaseFundingBreakdown & {
  partnerChargeCents: number;
  fundingKind: "wallet_only" | "split" | "gateway_only";
};

export { PurchaseFundingError as PartnerPurchaseFundingError };

/**
 * Calculate Partner wallet vs gateway contribution for partnerChargeCents.
 */
export function calculatePartnerPurchaseFunding(
  input: PartnerPurchaseFundingInput
): PartnerPurchaseFundingBreakdown {
  const useWallet = input.useWallet !== false;
  const base = calculatePurchaseFunding({
    priceCents: input.partnerChargeCents,
    walletBalanceCents: input.walletBalanceCents,
    useWallet,
  });

  let fundingKind: PartnerPurchaseFundingBreakdown["fundingKind"];
  if (base.gatewayAmountCents <= 0) {
    fundingKind = "wallet_only";
  } else if (base.walletAppliedCents <= 0) {
    fundingKind = "gateway_only";
  } else {
    fundingKind = "split";
  }

  return {
    ...base,
    partnerChargeCents: input.partnerChargeCents,
    fundingKind,
  };
}

/** True when hosted checkout is required for the remainder. */
export function partnerPurchaseRequiresGateway(
  funding: Pick<PartnerPurchaseFundingBreakdown, "gatewayAmountCents">
): boolean {
  return funding.gatewayAmountCents > 0;
}
