/**
 * Shared wallet top-up constants (safe for offline QA; no DB I/O).
 */

export const TOPUP_CREDIT_REFERENCE_TYPE = "WALLET_TOPUP";
export const TOPUP_DRAFT_CREATED = "wallet.topup_draft_created";
export const TOPUP_CHECKOUT_CREATED = "wallet.topup_checkout_created";
export const TOPUP_PAYMENT_PENDING = "wallet.topup_payment_pending";
export const TOPUP_PAYMENT_CONFIRMED = "wallet.topup_payment_confirmed";
export const TOPUP_CREDITED = "wallet.topup_credited";
export const TOPUP_FAILED = "wallet.topup_failed";
export const TOPUP_RECONCILIATION = "wallet.topup_reconciliation_required";
export const TOPUP_WEBHOOK_DUPLICATE = "wallet.topup_webhook_duplicate";

/**
 * Intentionally never credits from browser return URLs or client-submitted status.
 */
export function browserReturnMustNotCreditWallet(): true {
  return true;
}
