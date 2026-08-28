/**
 * Active hosted-checkout provider selector (pure — no secrets, no I/O).
 * Unset PAYMENT_GATEWAY_PROVIDER selects Simpaisa (primary production provider).
 * Explicit SAFEPAY still selects Safepay; invalid values fail closed.
 */

export const PAYMENT_GATEWAY_PROVIDER_IDS = ["SAFEPAY", "SIMPAISA"] as const;
export type SelectedPaymentGatewayProvider =
  (typeof PAYMENT_GATEWAY_PROVIDER_IDS)[number];

export function parsePaymentGatewayProvider(
  raw: string | undefined | null
): SelectedPaymentGatewayProvider | null {
  const value = (raw ?? "").trim();
  if (!value) return "SIMPAISA";
  if (value === "SAFEPAY" || value === "SIMPAISA") return value;
  return null;
}
