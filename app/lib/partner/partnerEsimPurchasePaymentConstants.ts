/**
 * Partner eSIM purchase payment attempt merchant-key namespace.
 * Distinct from partner top-up (ptop_) and customer eSIM attempt ids.
 */
export const PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX = "pesim_" as const;

export const PARTNER_ESIM_PURCHASE_CHECKOUT_CREATED =
  "partner.esim_purchase_checkout_created";
export const PARTNER_ESIM_PURCHASE_FUNDED = "partner.esim_purchase_funded";
export const PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE =
  "partner.esim_purchase_payment_webhook_duplicate";
export const PARTNER_ESIM_PAYMENT_FAILED =
  "partner.esim_purchase_payment_failed";
export const PARTNER_ESIM_PAYMENT_RECONCILIATION =
  "partner.esim_purchase_payment_reconciliation";

export function partnerEsimPurchaseMerchantUserKey(attemptId: string): string {
  return `${PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX}${attemptId.trim()}`;
}

export function parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey(
  raw: string | null | undefined
): string | null {
  const key = (raw ?? "").trim();
  if (!key.startsWith(PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX)) return null;
  const id = key.slice(PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX.length).trim();
  if (!id || id.length > 64) return null;
  return id;
}

export function partnerEsimGatewayCheckoutIdempotencyKey(
  purchaseIdempotencyKey: string
): string {
  return `${purchaseIdempotencyKey.trim()}:partner-esim-gw`.slice(0, 128);
}

/** Browser return must never fund purchase or call VeSIM. */
export function browserReturnMustNotFundPartnerEsimPurchase(): void {
  // Marker for QA + call sites — funding only via verified webhook.
}
