/**
 * Pure Partner refund-request execution gates (offline-safe QA).
 * Does not weaken reconciliation eligibility. No money movement here.
 */

export const PARTNER_REFUND_EXECUTION_BLOCKERS = [
  "PROVIDER_UNCERTAIN",
  "ORDER_ALREADY_FULFILLED",
  "INSTALL_DETAILS_PRESENT",
  "ICCID_PRESENT",
  "INSTALL_RECOVERY_REQUIRED",
  "ALREADY_REFUNDED",
  "FINANCIAL_STATE_MISMATCH",
  "NOT_APPROVED",
  "PARTNER_UNAVAILABLE",
] as const;

export type PartnerRefundExecutionBlocker =
  (typeof PARTNER_REFUND_EXECUTION_BLOCKERS)[number];

export type PartnerRefundExecutionEvidence = {
  requestStatus: string;
  requestReason: string;
  requestPartnerId: string;
  requestPartnerChargeCents: number;
  purchasePartnerId: string;
  purchaseStatus: string;
  fundingSource: string;
  purchasePartnerChargeCents: number;
  debitTransactionId: string | null;
  debitAmountCents: number | null;
  refundTransactionId: string | null;
  orderId: string | null;
  orderStatus: string | null;
  iccidPresent: boolean;
  installEvidencePresent: boolean;
};

export type PartnerRefundExecutionLocalResult =
  | { ok: true; alreadyRefunded: boolean }
  | { ok: false; blocker: PartnerRefundExecutionBlocker };

export function partnerRefundExecutionBlockerLabel(
  code: PartnerRefundExecutionBlocker
): string {
  switch (code) {
    case "PROVIDER_UNCERTAIN":
      return "Provider result is uncertain. Refresh/reconcile before refunding.";
    case "ORDER_ALREADY_FULFILLED":
      return "A usable local order exists. Refund execution is blocked.";
    case "INSTALL_DETAILS_PRESENT":
      return "Installation data exists. Refund execution is blocked.";
    case "ICCID_PRESENT":
      return "ICCID evidence exists. Refund execution is blocked.";
    case "INSTALL_RECOVERY_REQUIRED":
      return "Installation details may be recoverable. Recover the eSIM before considering a refund.";
    case "ALREADY_REFUNDED":
      return "This purchase was already refunded.";
    case "FINANCIAL_STATE_MISMATCH":
      return "Partner debit evidence does not match the refund request.";
    case "NOT_APPROVED":
      return "Only approved Partner refund requests can be executed.";
    case "PARTNER_UNAVAILABLE":
      return "This Partner wallet is not available for a refund credit.";
    default:
      return "Refund execution is blocked.";
  }
}

export function mapProviderEvidenceBlocker(
  raw: string
): PartnerRefundExecutionBlocker {
  switch (raw) {
    case "fulfilment_install_evidence":
    case "provider_still_fulfilled":
      return raw === "fulfilment_install_evidence"
        ? "INSTALL_DETAILS_PRESENT"
        : "ORDER_ALREADY_FULFILLED";
    case "fulfilment_iccid_present":
      return "ICCID_PRESENT";
    default:
      return "PROVIDER_UNCERTAIN";
  }
}

/**
 * Local fail-closed gates for Partner refund-request execution.
 * Provider GET confirmation is applied separately by the server executor.
 */
export function evaluatePartnerRefundRequestExecutionEligibility(
  input: PartnerRefundExecutionEvidence
): PartnerRefundExecutionLocalResult {
  const requestStatus = (input.requestStatus ?? "").trim().toUpperCase();
  const purchaseStatus = (input.purchaseStatus ?? "").trim().toUpperCase();
  const hasRefund = Boolean((input.refundTransactionId ?? "").trim());
  const alreadyRefunded =
    hasRefund &&
    (purchaseStatus === "FAILED_REFUNDED" || Boolean(hasRefund));

  if (requestStatus === "COMPLETED" && hasRefund) {
    return { ok: true, alreadyRefunded: true };
  }
  if (requestStatus !== "APPROVED_PENDING_EXECUTION") {
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

  if (alreadyRefunded) {
    return { ok: true, alreadyRefunded: true };
  }
  if (hasRefund) {
    return { ok: false, blocker: "FINANCIAL_STATE_MISMATCH" };
  }

  if ((input.requestReason ?? "").trim() === "INSTALL_DETAILS_UNAVAILABLE") {
    return { ok: false, blocker: "INSTALL_RECOVERY_REQUIRED" };
  }
  if (input.iccidPresent) {
    return { ok: false, blocker: "ICCID_PRESENT" };
  }
  if (input.installEvidencePresent) {
    return { ok: false, blocker: "INSTALL_DETAILS_PRESENT" };
  }

  const orderId = (input.orderId ?? "").trim();
  const orderStatus = (input.orderStatus ?? "").trim().toUpperCase();
  if (purchaseStatus === "COMPLETED") {
    return { ok: false, blocker: "ORDER_ALREADY_FULFILLED" };
  }
  if (orderId && orderStatus && orderStatus !== "FAILED") {
    return { ok: false, blocker: "ORDER_ALREADY_FULFILLED" };
  }

  return { ok: true, alreadyRefunded: false };
}
