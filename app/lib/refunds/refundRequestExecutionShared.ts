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

export { REFUND_CUSTOMER_WALLET_PHRASE };
