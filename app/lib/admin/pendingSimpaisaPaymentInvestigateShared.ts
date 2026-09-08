/**
 * Shared Simpaisa pending-payment investigation constants / pure decision helpers.
 * QA-safe: no Prisma / network.
 *
 * Identity mapping (from checkout + webhook):
 * - userKey = EsimPurchasePaymentAttempt.id
 * - transactionId = attempt.gatewayPaymentRef (Simpaisa provider txn id)
 * - operatorId is not stored on eSIM attempts; Inquire may omit it
 */

import { maskSafepayTrackerRef } from "@/app/lib/payments/safepayReporterParse";
import type { SimpaisaInquiryValidationFailure } from "@/app/lib/payments/simpaisaInquiryValidate";

export {
  parsePendingPaymentVerifyReason,
  PENDING_PAYMENT_VERIFY_REASON_MIN,
  PENDING_PAYMENT_VERIFY_REASON_MAX,
} from "@/app/lib/admin/pendingPaymentVerifyShared";

export const SIMPAISA_PENDING_INVESTIGATE_AUDIT =
  "admin.pending_simpaisa_payment.investigate";
export const SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT =
  "admin.pending_simpaisa_payment.investigate_blocked";
export const SIMPAISA_PENDING_RELEASE_AUDIT =
  "admin.pending_simpaisa_payment.reservation_release";
export const SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT =
  "admin.pending_simpaisa_payment.reservation_release_blocked";

export const SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE =
  "Simpaisa Inquire confirms payment, but the authoritative payment webhook is still required. Admin must not fund or mark paid.";

export const SIMPAISA_PENDING_INVESTIGATE_DECISIONS = [
  "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED",
  "VERIFIED_FAILED",
  "PENDING",
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "REF_MISMATCH",
  "UNKNOWN",
  "PROVIDER_UNAVAILABLE",
  "NOT_SIMPAISA",
] as const;

export type SimpaisaPendingInvestigateDecision =
  (typeof SIMPAISA_PENDING_INVESTIGATE_DECISIONS)[number];

export type SimpaisaPendingInvestigateEvidenceView = {
  attemptId: string;
  purchaseId: string;
  gatewayProvider: "SIMPAISA";
  localAttemptStatus: string;
  localPurchaseStatus: string;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  observedAmountMinor: number | null;
  observedCurrency: string | null;
  inquiryStatus: string | null;
  transactionRefMasked: string;
  userKeyMatch: boolean | null;
  transactionMatch: boolean | null;
  validatedConfirmed: boolean;
  validationReason: string | null;
  verifiedAt: string;
  decision: SimpaisaPendingInvestigateDecision;
  message: string;
  /** True when UI may offer step-2 release (server still re-inquires). */
  releaseEligible: boolean;
  reservationReleased: boolean;
  /** Always false — investigation never funds. */
  fundingApplied: false;
  vesimOrderCreated: false;
};

export function maskSimpaisaTransactionRef(
  ref: string | null | undefined
): string {
  return maskSafepayTrackerRef(ref);
}

export function messageForSimpaisaInvestigateDecision(
  decision: SimpaisaPendingInvestigateDecision
): string {
  switch (decision) {
    case "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED":
      return SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE;
    case "VERIFIED_FAILED":
      return "Simpaisa Inquire reports a failed or terminal unpaid payment. Wallet reservation may be released in a separate step when reserved funds remain.";
    case "PENDING":
      return "Simpaisa Inquire reports the payment is still pending or uncertain. Do not release reservation.";
    case "AMOUNT_MISMATCH":
      return "Simpaisa Inquire amount does not match the local payment attempt.";
    case "CURRENCY_MISMATCH":
      return "Simpaisa Inquire currency does not match the local payment attempt.";
    case "REF_MISMATCH":
      return "Simpaisa Inquire reference fields do not match this payment attempt.";
    case "PROVIDER_UNAVAILABLE":
      return "Simpaisa Inquire is unavailable. No local payment state was changed.";
    case "NOT_SIMPAISA":
      return "This payment attempt is not a Simpaisa gateway payment.";
    default:
      return "Simpaisa payment state could not be classified. No local payment state was changed.";
  }
}

function mapValidationReasonToDecision(
  reason: SimpaisaInquiryValidationFailure | string | null | undefined
): SimpaisaPendingInvestigateDecision {
  switch (reason) {
    case "AMOUNT_MISMATCH":
    case "AMOUNT_MISSING":
      return "AMOUNT_MISMATCH";
    case "CURRENCY_MISMATCH":
      return "CURRENCY_MISMATCH";
    case "USERKEY_MISMATCH":
    case "USERKEY_MISSING":
    case "TRANSACTION_MISMATCH":
    case "TRANSACTION_MISSING":
    case "MERCHANT_MISMATCH":
    case "OPERATOR_MISMATCH":
    case "OPERATOR_MISSING":
    case "TRANSACTION_TYPE_MISMATCH":
      return "REF_MISMATCH";
    case "INQUIRY_NOT_CONFIRMED":
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

/**
 * Pure decision from Inquire outcome. Never funds. Release is never automatic here —
 * releaseEligible only gates the separate Admin release action.
 */
export function decideSimpaisaPendingInvestigate(input: {
  providerUnavailable?: boolean;
  notSimpaisa?: boolean;
  inquiryStatus: "confirmed" | "pending" | "failed" | "uncertain" | null;
  validationOk?: boolean;
  validationReason?: SimpaisaInquiryValidationFailure | string | null;
  localUserKey: string;
  inquiryUserKey: string | null;
  localTransactionId: string;
  inquiryTransactionId: string | null;
  localExpectedAmountMinor: number;
  inquiryAmountMinor: number | null;
  localExpectedCurrency: string;
  inquiryCurrency: string | null;
  walletAppliedCents: number;
}): {
  decision: SimpaisaPendingInvestigateDecision;
  message: string;
  releaseEligible: boolean;
  userKeyMatch: boolean | null;
  transactionMatch: boolean | null;
  validatedConfirmed: boolean;
} {
  if (input.notSimpaisa) {
    const decision = "NOT_SIMPAISA" as const;
    return {
      decision,
      message: messageForSimpaisaInvestigateDecision(decision),
      releaseEligible: false,
      userKeyMatch: null,
      transactionMatch: null,
      validatedConfirmed: false,
    };
  }

  if (input.providerUnavailable || input.inquiryStatus == null) {
    const decision = "PROVIDER_UNAVAILABLE" as const;
    return {
      decision,
      message: messageForSimpaisaInvestigateDecision(decision),
      releaseEligible: false,
      userKeyMatch: null,
      transactionMatch: null,
      validatedConfirmed: false,
    };
  }

  const localUser = input.localUserKey.trim();
  const inquiryUser = (input.inquiryUserKey ?? "").trim();
  const localTxn = input.localTransactionId.trim();
  const inquiryTxn = (input.inquiryTransactionId ?? "").trim();
  const userKeyMatch = inquiryUser ? inquiryUser === localUser : null;
  const transactionMatch = inquiryTxn ? inquiryTxn === localTxn : null;

  if (input.inquiryStatus === "failed") {
    const decision = "VERIFIED_FAILED" as const;
    const releaseEligible =
      Number.isInteger(input.walletAppliedCents) &&
      input.walletAppliedCents > 0;
    return {
      decision,
      message: messageForSimpaisaInvestigateDecision(decision),
      releaseEligible,
      userKeyMatch,
      transactionMatch,
      validatedConfirmed: false,
    };
  }

  if (
    input.inquiryStatus === "pending" ||
    input.inquiryStatus === "uncertain"
  ) {
    const decision = "PENDING" as const;
    return {
      decision,
      message: messageForSimpaisaInvestigateDecision(decision),
      releaseEligible: false,
      userKeyMatch,
      transactionMatch,
      validatedConfirmed: false,
    };
  }

  // confirmed — require field validation; never fund from Admin.
  if (input.validationOk) {
    const decision = "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED" as const;
    return {
      decision,
      message: messageForSimpaisaInvestigateDecision(decision),
      releaseEligible: false,
      userKeyMatch: userKeyMatch ?? true,
      transactionMatch: transactionMatch ?? true,
      validatedConfirmed: true,
    };
  }

  const decision = mapValidationReasonToDecision(input.validationReason);
  return {
    decision,
    message: messageForSimpaisaInvestigateDecision(decision),
    releaseEligible: false,
    userKeyMatch,
    transactionMatch,
    validatedConfirmed: false,
  };
}

export function canOfferSimpaisaReservationRelease(input: {
  decision: SimpaisaPendingInvestigateDecision;
  walletAppliedCents: number;
}): boolean {
  return (
    input.decision === "VERIFIED_FAILED" &&
    Number.isInteger(input.walletAppliedCents) &&
    input.walletAppliedCents > 0
  );
}

export function buildSimpaisaPendingInvestigateEvidenceView(input: {
  attemptId: string;
  purchaseId: string;
  localAttemptStatus: string;
  localPurchaseStatus: string;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  localGatewayPaymentRef: string | null;
  inquiryStatus: string | null;
  inquiryAmountMinor: number | null;
  inquiryCurrency: string | null;
  decision: SimpaisaPendingInvestigateDecision;
  message: string;
  releaseEligible: boolean;
  userKeyMatch: boolean | null;
  transactionMatch: boolean | null;
  validatedConfirmed: boolean;
  validationReason: string | null;
  reservationReleased?: boolean;
}): SimpaisaPendingInvestigateEvidenceView {
  return {
    attemptId: input.attemptId,
    purchaseId: input.purchaseId,
    gatewayProvider: "SIMPAISA",
    localAttemptStatus: input.localAttemptStatus,
    localPurchaseStatus: input.localPurchaseStatus,
    localExpectedAmountMinor: input.localExpectedAmountMinor,
    localExpectedCurrency: input.localExpectedCurrency,
    observedAmountMinor: input.inquiryAmountMinor,
    observedCurrency: input.inquiryCurrency,
    inquiryStatus: input.inquiryStatus,
    transactionRefMasked: maskSimpaisaTransactionRef(
      input.localGatewayPaymentRef
    ),
    userKeyMatch: input.userKeyMatch,
    transactionMatch: input.transactionMatch,
    validatedConfirmed: input.validatedConfirmed,
    validationReason: input.validationReason,
    verifiedAt: new Date().toISOString(),
    decision: input.decision,
    message: input.message,
    releaseEligible: input.releaseEligible,
    reservationReleased: Boolean(input.reservationReleased),
    fundingApplied: false,
    vesimOrderCreated: false,
  };
}
