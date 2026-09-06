/**
 * Active hosted-checkout provider selector (pure — no secrets, no I/O).
 * Unset PAYMENT_GATEWAY_PROVIDER selects Safepay (current Production default).
 * Explicit SIMPAISA selects Simpaisa (required for Partner Add Funds).
 * Invalid values fail closed.
 */

export const PAYMENT_GATEWAY_PROVIDER_IDS = ["SAFEPAY", "SIMPAISA"] as const;
export type SelectedPaymentGatewayProvider =
  (typeof PAYMENT_GATEWAY_PROVIDER_IDS)[number];

export function parsePaymentGatewayProvider(
  raw: string | undefined | null
): SelectedPaymentGatewayProvider | null {
  const value = (raw ?? "").trim();
  if (!value) return "SAFEPAY";
  if (value === "SAFEPAY" || value === "SIMPAISA") return value;
  return null;
}
