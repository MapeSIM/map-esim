/**
 * Pure webhook-receipt display helpers (offline-QA safe).
 * Display only — no Prisma, no payment writes, no gateway enablement.
 */

export const PAYMENT_WEBHOOK_RECEIPTS_LIMIT = 50;

export function webhookReceiptSignatureLabel(ok: boolean): string {
  return ok ? "verified" : "rejected";
}

export function webhookReceiptParseLabel(ok: boolean): string {
  return ok ? "parsed" : "not parsed";
}

export function formatWebhookReceiptOutcome(
  logCode: string,
  applyOutcome: string | null | undefined,
  errorCategory: string | null | undefined
): string {
  const outcome = (applyOutcome ?? "").trim().slice(0, 80);
  if (outcome) return outcome;
  const category = (errorCategory ?? "").trim().slice(0, 80);
  if (category) return category;
  const code = (logCode ?? "").trim().slice(0, 64);
  return code || "Not available";
}
