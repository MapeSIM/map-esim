/**
 * Partner buy UI payment-mode visibility (client-safe, pure).
 * Matches customer checkout visibility rules; payable base is final Partner price.
 * Never accepts browser-authoritative money for server funding.
 */
import {
  calculatePartnerPurchaseFunding,
  type PartnerPurchaseFundingBreakdown,
} from "@/app/lib/partner/partnerPurchaseFunding";
import type { PartnerEsimPaymentMode } from "@/app/lib/partner/partnerPurchaseValidation";
import { useWalletFromPartnerPaymentMode } from "@/app/lib/partner/partnerPurchaseValidation";

export type PartnerPaymentModeVisibility = {
  showFullWalletOption: boolean;
  showWalletAndOnlineOption: boolean;
  showOnlinePaymentOption: boolean;
  /** Balance cannot cover payable and online pay is unavailable. */
  walletOnlyInsufficient: boolean;
  defaultMode: PartnerEsimPaymentMode;
};

/**
 * UI visibility only (funding math unchanged):
 * - Balance >= payable → "Buy with Partner balance" + "Pay online" (if gateway
 *   configured). Never show Wallet + online split.
 * - 0 < balance < payable → Wallet + online + Online (unchanged).
 * - Balance = 0 → Online only when gateway configured (unchanged).
 */
export function resolvePartnerPaymentModeVisibility(input: {
  /** Final Partner price after discount (partnerChargeCents). */
  payableCents: number;
  balanceCents: number;
  onlinePaymentsAllowed: boolean;
}): PartnerPaymentModeVisibility {
  const payable = Math.max(0, Math.trunc(Number(input.payableCents)) || 0);
  const balance = Math.max(0, Math.trunc(Number(input.balanceCents)) || 0);
  const online = input.onlinePaymentsAllowed === true;
  const hasWalletBalance = balance > 0;
  const balanceCoversPayable =
    hasWalletBalance && balance >= payable && payable > 0;
  const partialBalance =
    hasWalletBalance && balance > 0 && balance < payable;

  // Full coverage: wallet CTA + optional pay-online; never wallet+online split.
  const showFullWalletOption = balanceCoversPayable;
  const showWalletAndOnlineOption = partialBalance && online;
  // Pay online when gateway is configured (full, partial, or zero balance).
  const showOnlinePaymentOption = payable > 0 && online;
  const walletOnlyInsufficient =
    !online && payable > 0 && !balanceCoversPayable;

  let defaultMode: PartnerEsimPaymentMode = "mobile_only";
  if (showFullWalletOption) defaultMode = "full_wallet";
  else if (showWalletAndOnlineOption) defaultMode = "wallet_and_mobile";
  else if (showOnlinePaymentOption) defaultMode = "mobile_only";
  else if (balanceCoversPayable) defaultMode = "full_wallet";

  return {
    showFullWalletOption,
    showWalletAndOnlineOption,
    showOnlinePaymentOption,
    walletOnlyInsufficient,
    defaultMode,
  };
}

export function previewPartnerPaymentFunding(input: {
  payableCents: number;
  balanceCents: number;
  mode: PartnerEsimPaymentMode;
}): PartnerPurchaseFundingBreakdown {
  return calculatePartnerPurchaseFunding({
    partnerChargeCents: Math.max(0, Math.trunc(Number(input.payableCents)) || 0),
    walletBalanceCents: Math.max(0, Math.trunc(Number(input.balanceCents)) || 0),
    useWallet: useWalletFromPartnerPaymentMode(input.mode),
  });
}

export function clampPartnerPaymentMode(
  mode: PartnerEsimPaymentMode,
  visibility: PartnerPaymentModeVisibility
): PartnerEsimPaymentMode {
  if (mode === "full_wallet" && visibility.showFullWalletOption) {
    return "full_wallet";
  }
  if (
    mode === "wallet_and_mobile" &&
    visibility.showWalletAndOnlineOption
  ) {
    return "wallet_and_mobile";
  }
  if (mode === "mobile_only" && visibility.showOnlinePaymentOption) {
    return "mobile_only";
  }
  return visibility.defaultMode;
}
