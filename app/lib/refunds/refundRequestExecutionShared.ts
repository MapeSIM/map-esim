/**
 * Pure customer refund-execution helpers (offline-safe QA).
 */

import {
  isExecutableRefundStatus,
  REFUND_CUSTOMER_WALLET_PHRASE,
} from "@/app/lib/refunds/refundRequestConstants";

export const CUSTOMER_REFUND_EXECUTION_BLOCKERS = [
  "NOT_APPROVED",
  "ALREADY_COMPLETED",
  "CUSTOMER_UNAVAILABLE",
  "FINANCIAL_STATE_MISMATCH",
  "INVALID_AMOUNT",
] as const;

export type CustomerRefundExecutionBlocker =
  (typeof CUSTOMER_REFUND_EXECUTION_BLOCKERS)[number];

export function customerRefundExecutionBlockerLabel(
  code: CustomerRefundExecutionBlocker
): string {
  switch (code) {
    case "NOT_APPROVED":
      return "Only approved (or previously failed) requests can be executed.";
    case "ALREADY_COMPLETED":
      return "This refund request is already completed.";
    case "CUSTOMER_UNAVAILABLE":
      return "The customer account is unavailable for wallet credit.";
    case "FINANCIAL_STATE_MISMATCH":
      return "Refund financial state does not match. Refresh and try again.";
    case "INVALID_AMOUNT":
      return "The approved refund amount is invalid.";
    default:
      return "Refund execution is blocked.";
  }
}

export function evaluateCustomerRefundExecutionEligibility(input: {
  requestStatus: string;
  refundAmountCents: number;
  customerRole: string | null;
  customerDeleted: boolean;
}):
  | { ok: true; alreadyCompleted: boolean }
  | { ok: false; blocker: CustomerRefundExecutionBlocker } {
  if (input.requestStatus === "COMPLETED") {
    return { ok: true, alreadyCompleted: true };
  }
  if (!isExecutableRefundStatus(input.requestStatus)) {
    return { ok: false, blocker: "NOT_APPROVED" };
  }
  if (
    !Number.isInteger(input.refundAmountCents) ||
    input.refundAmountCents <= 0
  ) {
    return { ok: false, blocker: "INVALID_AMOUNT" };
  }
  if (input.customerDeleted || input.customerRole !== "CUSTOMER") {
    return { ok: false, blocker: "CUSTOMER_UNAVAILABLE" };
  }
  return { ok: true, alreadyCompleted: false };
}

/**
 * Safe machine reason for lastExecutionError / audit metadata.
 * Never includes connection strings, SQL payloads, emails, or secrets.
 */
export function sanitizeCustomerRefundExecutionFailureReason(
  error: unknown
): string {
  const fallback = "wallet_credit_failed";
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : fallback;

  let text = String(raw)
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .replace(
      /\b(?:postgres(?:ql)?|prisma\+?postgres(?:ql)?):\/\/\S+/gi,
      "[redacted]"
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(
      /\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    )
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /timeout for this transaction was|Transaction already closed|Transaction not found|Interactive transaction|expired transaction/i.test(
      text
    )
  ) {
    return "transaction_timeout";
  }
  if (
    /Timed out fetching a new connection|P2024|connection pool/i.test(text)
  ) {
    return "db_pool_timeout";
  }
  if (!text) return fallback;

  text = text
    .replace(/^PrismaClientKnownRequestError:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/Invalid `prisma\.[\w.]+` invocation:?/gi, "prisma_error")
    .trim();

  if (!text) return fallback;
  if (
    /^(wallet_credit_failed|transaction_timeout|db_pool_timeout)$/i.test(text)
  ) {
    return text.toLowerCase();
  }
  const labeled = `${fallback}: ${text}`;
  return labeled.slice(0, 120);
}

export { REFUND_CUSTOMER_WALLET_PHRASE };
