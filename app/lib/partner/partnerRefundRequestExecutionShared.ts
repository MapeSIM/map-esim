/**
 * Pure Partner refund-request execution gates (offline-safe QA).
 * Mirrors customer refund execution: status + financial integrity only.
 * No provider GET / ICCID / install blockers on the request-execution path.
 */

export const PARTNER_REFUND_EXECUTION_BLOCKERS = [
  "NOT_APPROVED",
  "ALREADY_REFUNDED",
  "FINANCIAL_STATE_MISMATCH",
  "PARTNER_UNAVAILABLE",
] as const;

export type PartnerRefundExecutionBlocker =
  (typeof PARTNER_REFUND_EXECUTION_BLOCKERS)[number];

export type PartnerRefundExecutionEvidence = {
  requestStatus: string;
  requestPartnerId: string;
  requestPartnerChargeCents: number;
  purchasePartnerId: string;
  purchaseStatus: string;
  fundingSource: string;
  purchasePartnerChargeCents: number;
  debitTransactionId: string | null;
  debitAmountCents: number | null;
  refundTransactionId: string | null;
};

export type PartnerRefundExecutionLocalResult =
  | { ok: true; alreadyRefunded: boolean }
  | { ok: false; blocker: PartnerRefundExecutionBlocker };

export function partnerRefundExecutionBlockerLabel(
  code: PartnerRefundExecutionBlocker
): string {
  switch (code) {
    case "NOT_APPROVED":
      return "Only approved Partner refund requests can be executed.";
    case "ALREADY_REFUNDED":
      return "This purchase was already refunded.";
    case "FINANCIAL_STATE_MISMATCH":
      return "Partner debit evidence does not match the refund request.";
    case "PARTNER_UNAVAILABLE":
      return "This Partner wallet is not available for a refund credit.";
    default:
      return "Refund execution is blocked.";
  }
}

/**
 * Local gates for Partner refund-request execution (customer-parity).
 * Amount is always the stored Partner debit — never a client amount.
 */
export function evaluatePartnerRefundRequestExecutionEligibility(
  input: PartnerRefundExecutionEvidence
): PartnerRefundExecutionLocalResult {
  const requestStatus = (input.requestStatus ?? "").trim().toUpperCase();
  const purchaseStatus = (input.purchaseStatus ?? "").trim().toUpperCase();
  const hasRefund = Boolean((input.refundTransactionId ?? "").trim());

  if (requestStatus === "COMPLETED" && hasRefund) {
    return { ok: true, alreadyRefunded: true };
  }
  if (
    requestStatus !== "APPROVED_PENDING_EXECUTION" &&
    requestStatus !== "EXECUTION_FAILED"
  ) {
    return { ok: false, blocker: "NOT_APPROVED" };
  }

  const requestPartnerId = (input.requestPartnerId ?? "").trim();
  const purchasePartnerId = (input.purchasePartnerId ?? "").trim();
  if (
    !requestPartnerId ||
    !purchasePartnerId ||
    requestPartnerId !== purchasePartnerId
  ) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }
  if ((input.fundingSource ?? "").trim().toUpperCase() !== "PARTNER_BALANCE") {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }
  if (
    !Number.isInteger(input.requestPartnerChargeCents) ||
    input.requestPartnerChargeCents <= 0 ||
    !Number.isInteger(input.purchasePartnerChargeCents) ||
    input.purchasePartnerChargeCents <= 0 ||
    input.requestPartnerChargeCents !== input.purchasePartnerChargeCents
  ) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }
  if (!(input.debitTransactionId ?? "").trim()) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }
  if (
    !Number.isInteger(input.debitAmountCents) ||
    input.debitAmountCents !== input.purchasePartnerChargeCents
  ) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }

  if (hasRefund && purchaseStatus === "FAILED_REFUNDED") {
    return { ok: true, alreadyRefunded: true };
  }
  if (hasRefund) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }

  return { ok: true, alreadyRefunded: false };
}
