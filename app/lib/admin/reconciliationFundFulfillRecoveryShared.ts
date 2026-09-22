/**
 * Pure eligibility for admin “Recover Payment & Create eSIM”
 * (Simpaisa claim_failed → FUNDED → fulfillFundedEsimPurchase).
 * Offline QA safe — no I/O.
 */

import {
  normalizeCaseManagementSourceType,
  type CaseManagementSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";

export const RECOVER_PAYMENT_CREATE_ESIM_PHRASE =
  "RECOVER PAYMENT AND CREATE ESIM";

export const FUND_FULFILL_RECOVERY_SOURCE_TYPES = [
  "wallet_purchase",
] as const;

export type FundFulfillRecoverySourceType =
  (typeof FUND_FULFILL_RECOVERY_SOURCE_TYPES)[number];

export function isFundFulfillRecoverySourceType(
  raw: string | null | undefined
): raw is FundFulfillRecoverySourceType {
  const v = (raw ?? "").trim();
  return (FUND_FULFILL_RECOVERY_SOURCE_TYPES as readonly string[]).includes(v);
}

export type FundFulfillRecoveryMode = "fund_and_fulfill" | "fulfill_only";

export type FundFulfillRecoveryLocalInput = {
  sourceType: CaseManagementSourceType | string;
  alreadyResolved: boolean;
  locked: boolean;
  lockedByAdminId?: string | null;
  currentAdminId: string;
  status?: string | null;
  failureCategory?: string | null;
  failureCode?: string | null;
  orderId?: string | null;
  providerOrderId?: string | null;
  refundTransactionId?: string | null;
  walletAppliedCents?: number | null;
  debitTransactionId?: string | null;
  debitStatus?: string | null;
  gatewayProvider?: string | null;
  gatewayPaymentRef?: string | null;
  chargeAmountMinor?: number | null;
  gatewayAmountCents?: number | null;
  providerRefreshInProgress?: boolean;
};

export type FundFulfillRecoveryEligibility = {
  allowed: boolean;
  blockers: string[];
  supported: boolean;
  /** Purchase already COMPLETED with a linked order (idempotent confirm). */
  alreadyCompleted: boolean;
  mode: FundFulfillRecoveryMode | null;
};

function hasClaimFailedFundingSignal(input: {
  failureCategory?: string | null;
  failureCode?: string | null;
}): boolean {
  const category = (input.failureCategory ?? "").trim().toLowerCase();
  const code = (input.failureCode ?? "").trim().toLowerCase();
  return (
    category === "funding_finalize_failed" || code === "claim_failed"
  );
}

function hasUsableChargeSnapshot(input: {
  chargeAmountMinor?: number | null;
  gatewayAmountCents?: number | null;
}): boolean {
  if (
    Number.isInteger(input.chargeAmountMinor) &&
    (input.chargeAmountMinor ?? 0) > 0
  ) {
    return true;
  }
  return (
    Number.isInteger(input.gatewayAmountCents) &&
    (input.gatewayAmountCents ?? 0) > 0
  );
}

function pushWalletReservationBlockers(
  blockers: string[],
  input: FundFulfillRecoveryLocalInput
): void {
  const walletApplied = input.walletAppliedCents ?? 0;
  if (!Number.isInteger(walletApplied) || walletApplied < 0) {
    blockers.push("wallet_applied_invalid");
    return;
  }
  if (walletApplied === 0) return;

  if (!(input.debitTransactionId ?? "").trim()) {
    blockers.push("wallet_reservation_missing");
    return;
  }
  const debitStatus = (input.debitStatus ?? "").trim().toUpperCase();
  if (debitStatus !== "PENDING" && debitStatus !== "COMPLETED") {
    blockers.push("wallet_reservation_released");
  }
}

/**
 * Local gates only — live Simpaisa Inquire is enforced on submit.
 */
export function evaluateFundFulfillRecoveryEligibility(
  input: FundFulfillRecoveryLocalInput
): FundFulfillRecoveryEligibility {
  const blockers: string[] = [];
  const normalized =
    normalizeCaseManagementSourceType(input.sourceType) ??
    (input.sourceType ?? "").trim();

  if (!isFundFulfillRecoverySourceType(normalized)) {
    return {
      allowed: false,
      blockers: ["unsupported_source"],
      supported: false,
      alreadyCompleted: false,
      mode: null,
    };
  }

  const status = (input.status ?? "").trim().toUpperCase();
  const hasOrder = Boolean((input.orderId ?? "").trim());
  const providerRef = (input.providerOrderId ?? "").trim();
  const alreadyCompleted = status === "COMPLETED" && hasOrder;

  if (input.alreadyResolved) blockers.push("already_resolved");
  if (!input.locked) blockers.push("case_unlocked");
  if (input.locked) {
    const owner = (input.lockedByAdminId ?? "").trim();
    const actor = (input.currentAdminId ?? "").trim();
    if (!owner || !actor || owner !== actor) {
      blockers.push("lock_not_owned");
    }
  }
  if (input.providerRefreshInProgress) {
    blockers.push("provider_refresh_in_progress");
  }

  const gatewayProvider = (input.gatewayProvider ?? "").trim().toUpperCase();
  if (gatewayProvider !== "SIMPAISA") {
    blockers.push("not_simpaisa_provider");
  }
  if (!(input.gatewayPaymentRef ?? "").trim()) {
    blockers.push("missing_gateway_payment_ref");
  }
  if (!hasUsableChargeSnapshot(input)) {
    blockers.push("missing_charge_snapshot");
  }

  if (alreadyCompleted) {
    return {
      allowed: blockers.length === 0,
      blockers,
      supported: true,
      alreadyCompleted: true,
      mode: "fulfill_only",
    };
  }

  if ((input.refundTransactionId ?? "").trim()) {
    blockers.push("refund_present");
  }
  if (providerRef) blockers.push("provider_order_already_present");
  if (hasOrder) blockers.push("local_order_already_present");

  pushWalletReservationBlockers(blockers, input);

  let mode: FundFulfillRecoveryMode | null = null;

  if (status === "FUNDED") {
    mode = "fulfill_only";
  } else if (status === "RECONCILIATION_REQUIRED") {
    if (!hasClaimFailedFundingSignal(input)) {
      blockers.push("not_claim_failed_funding_signal");
    }
    mode = "fund_and_fulfill";
  } else {
    blockers.push("not_fund_fulfill_recovery_state");
  }

  return {
    allowed: blockers.length === 0 && mode !== null,
    blockers,
    supported: true,
    alreadyCompleted: false,
    mode,
  };
}

export function fundFulfillRecoveryBlockerLabel(code: string): string {
  switch (code) {
    case "unsupported_source":
      return "This case type does not support payment recovery into eSIM fulfillment.";
    case "already_resolved":
      return "Resolved cases cannot run payment recovery.";
    case "case_unlocked":
      return "Lock this case before recovering payment and creating the eSIM.";
    case "lock_not_owned":
      return "Only the admin who locked this case can run payment recovery.";
    case "provider_refresh_in_progress":
      return "A provider status refresh is in progress.";
    case "not_simpaisa_provider":
      return "Payment recovery requires a linked Simpaisa payment attempt.";
    case "missing_gateway_payment_ref":
      return "Gateway payment reference is missing on the payment attempt.";
    case "missing_charge_snapshot":
      return "Stored Simpaisa charge snapshot is missing or invalid.";
    case "refund_present":
      return "A refund is already linked; payment recovery is blocked.";
    case "provider_order_already_present":
      return "A provider order reference already exists; use other recovery tools.";
    case "local_order_already_present":
      return "A local order is already linked; payment recovery is blocked.";
    case "wallet_applied_invalid":
      return "Wallet applied amount on the purchase is invalid.";
    case "wallet_reservation_missing":
      return "Wallet funds were applied but the debit reservation is missing.";
    case "wallet_reservation_released":
      return "Wallet reservation was released; recovering payment would underfund.";
    case "not_claim_failed_funding_signal":
      return "Case is not a funding claim failure (funding_finalize_failed / claim_failed).";
    case "not_fund_fulfill_recovery_state":
      return "Purchase is not in RECONCILIATION_REQUIRED or FUNDED recovery state.";
    case "inquiry_not_confirmed":
      return "Live Simpaisa Inquire did not confirm payment success.";
    case "inquiry_validation_failed":
      return "Live Simpaisa Inquire fields did not match the stored charge snapshot.";
    case "inquiry_unavailable":
      return "Simpaisa status check is unavailable. Try again shortly.";
    case "fund_cas_failed":
      return "Could not safely mark the purchase as FUNDED (state changed).";
    case "fulfill_failed":
      return "Payment is FUNDED but eSIM fulfillment did not complete. Retry while still FUNDED.";
    default:
      return "Payment recovery is not available for this case.";
  }
}
