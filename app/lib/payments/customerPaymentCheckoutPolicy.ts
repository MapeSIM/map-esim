/**
 * Temporary customer payment-initiation kill switch (display + gate only).
 * Does not delete Simpaisa/Safepay code, webhooks, or admin tooling.
 *
 * Revert later:
 * 1) Set CUSTOMER_PAYMENT_CHECKOUT_HARD_DISABLED = false below, OR
 * 2) Ensure CUSTOMER_PAYMENT_CHECKOUT_DISABLED is not exact "true".
 */

/** Flip to false to re-enable customer payment initiation in code. */
export const CUSTOMER_PAYMENT_CHECKOUT_HARD_DISABLED = true;

export const CUSTOMER_PAYMENT_CHECKOUT_DISABLED_ENV =
  "CUSTOMER_PAYMENT_CHECKOUT_DISABLED";

export const CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "Payments are temporarily unavailable. Please check back soon.";

/**
 * Exact env "true" forces disable even when the hard flag is false.
 * Exact env "false" cannot override the hard flag (fail closed while hard-disabled).
 */
export function isCustomerPaymentCheckoutDisabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (CUSTOMER_PAYMENT_CHECKOUT_HARD_DISABLED) return true;
  return env[CUSTOMER_PAYMENT_CHECKOUT_DISABLED_ENV] === "true";
}
