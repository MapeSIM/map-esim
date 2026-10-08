/**
 * Shared helpers for admin Apply Verified Payment after gateway confirmation.
 * QA-safe: no Prisma / network.
 */

export {
  parsePendingPaymentVerifyReason,
  PENDING_PAYMENT_VERIFY_REASON_MIN,
  PENDING_PAYMENT_VERIFY_REASON_MAX,
} from "@/app/lib/admin/pendingPaymentVerifyShared";

export const CUSTOMER_PENDING_APPLY_AUDIT =
  "admin.pending_customer_payment.apply_verified";
export const CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT =
  "admin.pending_customer_payment.apply_blocked";

export const CUSTOMER_APPLY_SUCCESS_MESSAGE =
  "Verified payment applied through the canonical funding path (idempotent). Provider fulfillment runs outside the payment transaction.";

export const CUSTOMER_APPLY_CONFIRM_LABEL =
  "I confirm gateway evidence shows this payment succeeded and I want to apply funding / fulfill as if the webhook arrived.";

/** Safepay verify decisions that may unlock step-2 apply (server still re-checks). */
export function isSafepayCustomerApplyEligibleDecision(
  decision: string | null | undefined
): boolean {
  return String(decision ?? "").trim() === "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED";
}

/** Simpaisa investigate decisions that may unlock step-2 apply for customers. */
export function isSimpaisaCustomerApplyEligibleDecision(
  decision: string | null | undefined,
  validatedConfirmed: boolean
): boolean {
  return (
    validatedConfirmed &&
    String(decision ?? "").trim() === "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED"
  );
}

export function parseCustomerApplyConfirm(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true } | { ok: false; error: string } {
  if (String(raw ?? "").trim() === "on") return { ok: true };
  return {
    ok: false,
    error: "Confirm the checkbox before applying a verified payment.",
  };
}
