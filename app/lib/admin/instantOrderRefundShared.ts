/**
 * Pure Instant Order Refund display helpers (client + server safe).
 * Money movement lives in instantOrderRefund.ts — never invent amounts here.
 */

export const INSTANT_REFUND_REASON_MAX = 500;

export const INSTANT_REFUND_PAYMENT_METHODS = [
  "WALLET",
  "MANUAL",
  "SAFEPAY",
  "WHATSAPP",
] as const;

export type InstantRefundPaymentMethod =
  | (typeof INSTANT_REFUND_PAYMENT_METHODS)[number]
  | string;

/** Props consumed by <InstantOrderRefundButton /> (serializable). */
export type InstantOrderRefundButtonProps = {
  orderId: string;
  /** Partner purchase id when refunding a PartnerEsimPurchase path. */
  partnerPurchaseId?: string | null;
  amountLabel: string;
  paymentMethodLabel: InstantRefundPaymentMethod;
  partyLabel: string;
  alreadyRefunded: boolean;
  refundEligible: boolean;
  ineligibleReason?: string | null;
  /** Compact list-row styling. */
  compact?: boolean;
};

export function resolveInstantRefundPaymentMethodLabel(input: {
  fundingSource?: string | null;
  paymentMethodDisplay?: string | null;
}): InstantRefundPaymentMethod {
  const funding = String(input.fundingSource ?? "")
    .trim()
    .toUpperCase();
  if (
    funding === "CUSTOMER_WALLET" ||
    funding === "PARTNER_BALANCE" ||
    funding === "COMPANY_FUNDED"
  ) {
    return "WALLET";
  }
  if (funding === "CUSTOMER_SPLIT" || funding === "PARTNER_SPLIT") {
    return "WALLET";
  }
  const rail = String(input.paymentMethodDisplay ?? "")
    .trim()
    .toUpperCase();
  if (rail === "MANUAL" || rail === "WHATSAPP") return "MANUAL";
  if (rail === "SAFEPAY" || rail === "SIMPAISA") return "SAFEPAY";
  if (rail) return rail;
  if (funding === "DIRECT_PAYMENT" || funding === "PARTNER_GATEWAY") {
    return "SAFEPAY";
  }
  return "SAFEPAY";
}
