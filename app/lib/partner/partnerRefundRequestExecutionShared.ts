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

/**
 * Evidence/fulfilment warnings admins may force-override after manual ICCID /
 * provider verification. Financial integrity blockers stay hard.
 */
export const PARTNER_REFUND_EVIDENCE_OVERRIDABLE_BLOCKERS = [
  "ORDER_ALREADY_FULFILLED",
  "INSTALL_DETAILS_PRESENT",
  "ICCID_PRESENT",
  "INSTALL_RECOVERY_REQUIRED",
] as const satisfies readonly PartnerRefundExecutionBlocker[];

export type PartnerRefundEvidenceOverridableBlocker =
  (typeof PARTNER_REFUND_EVIDENCE_OVERRIDABLE_BLOCKERS)[number];

const OVERRIDABLE_SET = new Set<string>(PARTNER_REFUND_EVIDENCE_OVERRIDABLE_BLOCKERS);

export function isPartnerRefundEvidenceOverridableBlocker(
  code: string
): code is PartnerRefundEvidenceOverridableBlocker {
  return OVERRIDABLE_SET.has(code);
}

/** Provider-confirm blockers that map to the same overridable evidence class. */
export const PARTNER_REFUND_PROVIDER_OVERRIDABLE_BLOCKERS = [
  "fulfilment_install_evidence",
  "fulfilment_iccid_present",
  "provider_still_fulfilled",
] as const;

export function isPartnerRefundProviderOverridableBlocker(code: string): boolean {
  return (PARTNER_REFUND_PROVIDER_OVERRIDABLE_BLOCKERS as readonly string[]).includes(
    code
  );
}

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
  | {
      ok: true;
      alreadyRefunded: boolean;
      /** Soft evidence warnings cleared only when forceEvidenceOverride is set. */
      overriddenBlockers?: PartnerRefundEvidenceOverridableBlocker[];
    }
  | {
      ok: false;
      blocker: PartnerRefundExecutionBlocker;
      /** True when an admin may force-execute after verifying ICCID/provider. */
      overridable: boolean;
    };

export function partnerRefundExecutionBlockerLabel(
  code: PartnerRefundExecutionBlocker
): string {
  switch (code) {
    case "PROVIDER_UNCERTAIN":
      return "Provider result is uncertain. Refresh/reconcile before refunding.";
    case "ORDER_ALREADY_FULFILLED":
      return "A usable local order exists. Verify ICCID/provider status before forcing a refund.";
    case "INSTALL_DETAILS_PRESENT":
      return "Installation data exists. Verify ICCID/provider status before forcing a refund.";
    case "ICCID_PRESENT":
      return "ICCID evidence exists. Verify the ICCID and provider status before forcing a refund.";
    case "INSTALL_RECOVERY_REQUIRED":
      return "Installation details may be recoverable. Prefer recovery; force refund only after verifying ICCID/provider status.";
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

function collectEvidenceWarnings(
  input: PartnerRefundExecutionEvidence
): PartnerRefundEvidenceOverridableBlocker[] {
  const warnings: PartnerRefundEvidenceOverridableBlocker[] = [];
  if ((input.requestReason ?? "").trim() === "INSTALL_DETAILS_UNAVAILABLE") {
    warnings.push("INSTALL_RECOVERY_REQUIRED");
  }
  if (input.iccidPresent) {
    warnings.push("ICCID_PRESENT");
  }
  if (input.installEvidencePresent) {
    warnings.push("INSTALL_DETAILS_PRESENT");
  }
  const orderId = (input.orderId ?? "").trim();
  const orderStatus = (input.orderStatus ?? "").trim().toUpperCase();
  const purchaseStatus = (input.purchaseStatus ?? "").trim().toUpperCase();
  if (purchaseStatus === "COMPLETED") {
    warnings.push("ORDER_ALREADY_FULFILLED");
  } else if (orderId && orderStatus && orderStatus !== "FAILED") {
    warnings.push("ORDER_ALREADY_FULFILLED");
  }
  return warnings;
}

/**
 * Local fail-closed gates for Partner refund-request execution.
 * Provider GET confirmation is applied separately by the server executor.
 *
 * When `allowEvidenceOverride` is true, provisioned/install/ICCID warnings are
 * recorded but do not block. Financial integrity gates remain hard.
 */
export function evaluatePartnerRefundRequestExecutionEligibility(
  input: PartnerRefundExecutionEvidence,
  options?: { allowEvidenceOverride?: boolean }
): PartnerRefundExecutionLocalResult {
  const allowEvidenceOverride = options?.allowEvidenceOverride === true;
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
    return { ok: false, blocker: "NOT_APPROVED", overridable: false };
  }

  const requestPartnerId = (input.requestPartnerId ?? "").trim();
  const purchasePartnerId = (input.purchasePartnerId ?? "").trim();
  if (
    !requestPartnerId ||
    !purchasePartnerId ||
    requestPartnerId !== purchasePartnerId
  ) {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }
  if ((input.fundingSource ?? "").trim().toUpperCase() !== "PARTNER_BALANCE") {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }
  if (
    !Number.isInteger(input.requestPartnerChargeCents) ||
    input.requestPartnerChargeCents <= 0 ||
    !Number.isInteger(input.purchasePartnerChargeCents) ||
    input.purchasePartnerChargeCents <= 0 ||
    input.requestPartnerChargeCents !== input.purchasePartnerChargeCents
  ) {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }
  if (!(input.debitTransactionId ?? "").trim()) {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }
  if (
    !Number.isInteger(input.debitAmountCents) ||
    input.debitAmountCents !== input.purchasePartnerChargeCents
  ) {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }

  if (alreadyRefunded) {
    return { ok: true, alreadyRefunded: true };
  }
  if (hasRefund) {
    return {
      ok: false,
      blocker: "FINANCIAL_STATE_MISMATCH",
      overridable: false,
    };
  }

  const evidenceWarnings = collectEvidenceWarnings(input);
  if (evidenceWarnings.length > 0 && !allowEvidenceOverride) {
    return {
      ok: false,
      blocker: evidenceWarnings[0]!,
      overridable: true,
    };
  }

  return {
    ok: true,
    alreadyRefunded: false,
    overriddenBlockers:
      allowEvidenceOverride && evidenceWarnings.length > 0
        ? evidenceWarnings
        : undefined,
  };
}
