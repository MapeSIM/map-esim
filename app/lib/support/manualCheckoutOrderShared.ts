/**
 * Pure helpers for Manual Payment pending checkout orders.
 */

export const MANUAL_CHECKOUT_PAYMENT_METHOD = "MANUAL" as const;

export function generateManualOrderReference(nowMs = Date.now()): string {
  const suffix = nowMs.toString(36).toUpperCase().slice(-5);
  return `MP-${suffix}`;
}

export function clipManualProofUrl(raw: unknown, max = 4_000_000): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > max) return null;
  if (
    !(
      value.startsWith("data:image/") ||
      value.startsWith("https://") ||
      value.startsWith("http://") ||
      value.startsWith("blob:")
    )
  ) {
    return null;
  }
  return value;
}

export function clipManualSenderName(raw: unknown, max = 120): string | null {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return value || null;
}
