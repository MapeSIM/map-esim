/**
 * Active hosted-checkout provider selector (pure — no secrets, no I/O).
 * Unset PAYMENT_GATEWAY_PROVIDER selects Simpaisa (current customer default).
 * Explicit SIMPAISA selects Simpaisa (required for Partner Add Funds).
 * Explicit SAFEPAY is retained for code/webhook/admin, but customer hosted
 * checkout forces Simpaisa while the Safepay customer flag is on.
 * Invalid values fail closed.
 */

import { isCustomerSafepayCheckoutDisabled } from "@/app/lib/payments/customerPaymentCheckoutPolicy";

export const PAYMENT_GATEWAY_PROVIDER_IDS = ["SAFEPAY", "SIMPAISA"] as const;
export type SelectedPaymentGatewayProvider =
  (typeof PAYMENT_GATEWAY_PROVIDER_IDS)[number];

/**
 * Parse env / raw provider id.
 * Empty → SIMPAISA. Does not apply the Safepay customer kill switch
 * (use resolveHostedCheckoutProvider for checkout + customer UI).
 */
export function parsePaymentGatewayProvider(
  raw: string | undefined | null
): SelectedPaymentGatewayProvider | null {
  const value = (raw ?? "").trim();
  if (!value) return "SIMPAISA";
  if (value === "SAFEPAY" || value === "SIMPAISA") return value;
  return null;
}

/**
 * Provider used for customer/partner hosted checkout adapter selection and
 * customer payment UI labels. While Safepay customer checkout is disabled,
 * SAFEPAY resolves to SIMPAISA so card checkout does not appear or start.
 * Safepay webhook routes and admin tools do not use this helper.
 */
export function resolveHostedCheckoutProvider(
  raw: string | undefined | null = process.env.PAYMENT_GATEWAY_PROVIDER,
  env: NodeJS.ProcessEnv = process.env
): SelectedPaymentGatewayProvider | null {
  const selected = parsePaymentGatewayProvider(raw);
  if (!selected) return null;
  if (selected === "SAFEPAY" && isCustomerSafepayCheckoutDisabled(env)) {
    return "SIMPAISA";
  }
  return selected;
}
