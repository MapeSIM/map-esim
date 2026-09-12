/**
 * Destination-page conversion copy (display only).
 * Does not change retail prices, offer IDs, or checkout targets.
 */

export const PLAN_CARD_RECOMMENDED_LABEL = "Recommended";

/** Guest / signed-out Buy Now helper. Public QR/install access copy removed. */
export const PLAN_PURCHASE_TRUST_LINE_GUEST = "";

/** Authenticated customer / partner Buy Now helper. Public QR/install access copy removed. */
export const PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED = "";

/** @deprecated Prefer planPurchaseTrustLine(signedIn) — aliases guest copy. */
export const PLAN_PURCHASE_TRUST_LINE = PLAN_PURCHASE_TRUST_LINE_GUEST;

export const PLAN_STICKY_TRUST_LINE = "Digital delivery after checkout.";

/** Display-only trust line under Buy Now. */
export function planPurchaseTrustLine(signedIn: boolean): string {
  return signedIn
    ? PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED
    : PLAN_PURCHASE_TRUST_LINE_GUEST;
}
