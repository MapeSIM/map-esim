/**
 * Partner catalog buy result states (client + QA safe).
 * No Prisma, no secrets, no monetary client trust.
 */

export const PARTNER_INSUFFICIENT_BALANCE_MESSAGE =
  "Insufficient partner balance. Please contact MAP eSIM to add funds.";

export const PARTNER_PRICING_CHANGED_MESSAGE =
  "Plan pricing was updated. Please review the plan and try again.";

export const PARTNER_PURCHASES_PAUSED_MESSAGE =
  "Partner purchases are temporarily unavailable. Please try again shortly.";

export const PARTNER_RECONCILIATION_MESSAGE =
  "This purchase is under review. Do not buy this plan again until MAP eSIM confirms the result.";

export const PARTNER_FAILED_REFUNDED_MESSAGE =
  "The purchase could not be completed. The exact amount charged has been returned to your Partner balance.";

export const PARTNER_PURCHASE_UNAVAILABLE_MESSAGE =
  "This purchase is temporarily unavailable. Please try again shortly.";

export type PartnerPurchaseResultKind =
  | "success"
  | "duplicate_success"
  | "insufficient_balance"
  | "pricing_changed"
  | "purchases_paused"
  | "reconciliation_required"
  | "failed_refunded"
  | "invalid"
  | "unavailable";

export type PartnerPurchaseActionState =
  | { ok: true; kind: "idle" }
  | {
      ok: true;
      kind: "success" | "duplicate_success";
      purchaseId: string;
      message: string;
    }
  | {
      ok: false;
      kind: Exclude<
        PartnerPurchaseResultKind,
        "success" | "duplicate_success" | "idle"
      >;
      message: string;
      purchaseId?: string;
      fieldErrors?: {
        offerId?: string;
        destination?: string;
        idempotencyKey?: string;
      };
    };

export const initialPartnerPurchaseActionState: PartnerPurchaseActionState = {
  ok: true,
  kind: "idle",
};

/** Map domain error codes to Partner-safe UI results (pure). */
export function mapPartnerPurchaseErrorCode(
  code: string,
  purchaseId?: string | null
): Extract<PartnerPurchaseActionState, { ok: false }> {
  switch (code) {
    case "INSUFFICIENT_FUNDS":
      return {
        ok: false,
        kind: "insufficient_balance",
        message: PARTNER_INSUFFICIENT_BALANCE_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    case "PRICING_CHANGED":
    case "OFFER_UNAVAILABLE":
      return {
        ok: false,
        kind: "pricing_changed",
        message: PARTNER_PRICING_CHANGED_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    case "UNAVAILABLE":
      return {
        ok: false,
        kind: "purchases_paused",
        message: PARTNER_PURCHASES_PAUSED_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    case "RECONCILIATION_REQUIRED":
    case "PROVIDER_IN_FLIGHT":
      return {
        ok: false,
        kind: "reconciliation_required",
        message: PARTNER_RECONCILIATION_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    case "PROVIDER_FAILED":
      return {
        ok: false,
        kind: "failed_refunded",
        message: PARTNER_FAILED_REFUNDED_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    case "FORBIDDEN":
    case "PARTNER_UNAVAILABLE":
      return {
        ok: false,
        kind: "unavailable",
        message: "Partner access is unavailable.",
        purchaseId: purchaseId || undefined,
      };
    case "INVALID_STATE":
    case "INVALID_IDEMPOTENCY":
      return {
        ok: false,
        kind: "invalid",
        message: PARTNER_PURCHASE_UNAVAILABLE_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
    default:
      return {
        ok: false,
        kind: "unavailable",
        message: PARTNER_PURCHASE_UNAVAILABLE_MESSAGE,
        purchaseId: purchaseId || undefined,
      };
  }
}
