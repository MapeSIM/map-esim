/**
 * Pure failed/cancelled payment-attempt display helpers (offline-QA safe).
 * Display only — no Prisma, no payment writes, no gateway enablement.
 */

export const FAILED_PAYMENT_ATTEMPT_STATUSES = [
  "FAILED",
  "CANCELLED",
] as const;

export type FailedPaymentAttemptStatus =
  (typeof FAILED_PAYMENT_ATTEMPT_STATUSES)[number];

export const FAILED_PAYMENT_ATTEMPTS_LIMIT = 50;

export function failedPaymentAttemptStatusLabel(status: string): string {
  const value = (status ?? "").trim();
  if (value === "FAILED") return "Failed";
  if (value === "CANCELLED") return "Cancelled";
  return "Not available";
}

export function formatFailedPaymentReason(
  category: string | null | undefined,
  code: string | null | undefined
): string {
  const cat = (category ?? "").trim().slice(0, 80);
  const failureCode = (code ?? "").trim().slice(0, 80);
  if (cat && failureCode) return `${cat} · ${failureCode}`;
  if (cat) return cat;
  if (failureCode) return failureCode;
  return "Not available";
}

export function failedPaymentOccurredAt(input: {
  failedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}): Date | string | null {
  return (
    input.failedAt ??
    input.cancelledAt ??
    input.updatedAt ??
    input.createdAt ??
    null
  );
}
