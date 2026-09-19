/**
 * Temporary customer payment-initiation kill switches (display + gate only).
 * Does not delete Simpaisa/Safepay code, webhooks, or admin tooling.
 *
 * Revert all-customer checkout kill switch later:
 * 1) Set CUSTOMER_PAYMENT_CHECKOUT_HARD_DISABLED = false below, OR
 * 2) Ensure CUSTOMER_PAYMENT_CHECKOUT_DISABLED is not exact "true".
 *
 * Revert Safepay customer hosted-checkout kill switch later:
 * 1) Set CUSTOMER_SAFEPAY_CHECKOUT_HARD_DISABLED = false below, AND
 * 2) Ensure CUSTOMER_SAFEPAY_CHECKOUT_DISABLED is not exact "true", AND
 * 3) Set PAYMENT_GATEWAY_PROVIDER=SAFEPAY when card checkout should be active.
 */

/** Flip to false to re-enable customer payment initiation in code. */
export const CUSTOMER_PAYMENT_CHECKOUT_HARD_DISABLED = false;

export const CUSTOMER_PAYMENT_CHECKOUT_DISABLED_ENV =
  "CUSTOMER_PAYMENT_CHECKOUT_DISABLED";

export const CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "Payments are temporarily unavailable. Please check back soon.";

/**
 * When true, customer hosted checkout never selects Safepay.
 * Default Simpaisa remains; Safepay webhook + admin tools stay intact.
 */
export const CUSTOMER_SAFEPAY_CHECKOUT_HARD_DISABLED = true;

export const CUSTOMER_SAFEPAY_CHECKOUT_DISABLED_ENV =
  "CUSTOMER_SAFEPAY_CHECKOUT_DISABLED";

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

/**
 * Exact env "true" forces Safepay customer checkout off even when the hard flag is false.
 * Exact env "false" cannot override the hard flag.
 */
export function isCustomerSafepayCheckoutDisabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (CUSTOMER_SAFEPAY_CHECKOUT_HARD_DISABLED) return true;
  return env[CUSTOMER_SAFEPAY_CHECKOUT_DISABLED_ENV] === "true";
}
