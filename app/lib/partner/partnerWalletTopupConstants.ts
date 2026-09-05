/**
 * Partner wallet Add Funds constants — merchant key namespace + audit labels.
 * Distinct from customer WalletTopup ids (never collide with cuid topup/attempt ids).
 */
export const PARTNER_TOPUP_USER_KEY_PREFIX = "ptop_" as const;

export const PARTNER_TOPUP_CREDIT_REFERENCE_TYPE = "PARTNER_WALLET_TOPUP";

export const PARTNER_TOPUP_MIN_CENTS = 10; // $0.10
export const PARTNER_TOPUP_MAX_CENTS = 50_000; // $500.00

export const PARTNER_TOPUP_DRAFT_CREATED = "partner.wallet_topup_draft_created";
export const PARTNER_TOPUP_CHECKOUT_CREATED =
  "partner.wallet_topup_checkout_created";
export const PARTNER_TOPUP_PAYMENT_PENDING =
  "partner.wallet_topup_payment_pending";
export const PARTNER_TOPUP_PAYMENT_CONFIRMED =
  "partner.wallet_topup_payment_confirmed";
export const PARTNER_TOPUP_CREDITED = "partner.wallet_topup_credited";
export const PARTNER_TOPUP_FAILED = "partner.wallet_topup_failed";
export const PARTNER_TOPUP_RECONCILIATION =
  "partner.wallet_topup_reconciliation";
export const PARTNER_TOPUP_WEBHOOK_DUPLICATE =
  "partner.wallet_topup_webhook_duplicate";

export function partnerTopupMerchantUserKey(topupId: string): string {
  return `${PARTNER_TOPUP_USER_KEY_PREFIX}${topupId.trim()}`;
}

export function parsePartnerTopupIdFromMerchantUserKey(
  raw: string | null | undefined
): string | null {
  const key = (raw ?? "").trim();
  if (!key.startsWith(PARTNER_TOPUP_USER_KEY_PREFIX)) return null;
  const id = key.slice(PARTNER_TOPUP_USER_KEY_PREFIX.length).trim();
  if (!id || id.length > 64) return null;
  return id;
}

export function partnerTopupCreditIdempotencyKey(topupId: string): string {
  return `partner_topup_credit_${topupId.trim()}`;
}

/** Browser return / refresh must never credit Partner wallet. */
export function browserReturnMustNotCreditPartnerWallet(): void {
  // Marker for QA + call sites — funding only via verified Inquire webhook path.
}
