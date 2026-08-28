/**
 * Shared pending-payment verify constants / pure decision helpers (QA-safe).
 */

import type { SafepayReporterEvidence } from "@/app/lib/payments/safepayReporterParse";
import { maskSafepayTrackerRef } from "@/app/lib/payments/safepayReporterParse";

export const PENDING_PAYMENT_VERIFY_REASON_MIN = 5;
export const PENDING_PAYMENT_VERIFY_REASON_MAX = 200;

export const PENDING_PAYMENT_VERIFY_AUDIT = "admin.pending_payment_verify";
export const PENDING_PAYMENT_VERIFY_BLOCKED_AUDIT =
  "admin.pending_payment_verify_blocked";
export const PENDING_PAYMENT_RELEASE_AUDIT =
  "admin.pending_payment_reservation_release";

export const SUCCESS_WEBHOOK_REQUIRED_MESSAGE =
  "Payment provider reports successful payment, but authoritative payment webhook is still required.";

export const PENDING_PAYMENT_VERIFY_DECISIONS = [
  "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED",
  "VERIFIED_FAILED",
  "VERIFIED_CANCELLED_OR_EXPIRED",
  "PENDING",
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "TRACKER_MISMATCH",
  "UNKNOWN",
  "PROVIDER_UNAVAILABLE",
] as const;

export type PendingPaymentVerifyDecision =
  (typeof PENDING_PAYMENT_VERIFY_DECISIONS)[number];

export type PendingPaymentVerifyEvidenceView = {
  attemptId: string;
  purchaseId: string;
  localAttemptStatus: string;
  localPurchaseStatus: string;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  observedAmountMinor: number | null;
  observedCurrency: string | null;
  trackerState: string;
  trackerLifecycle: string;
  trackerRefMasked: string;
  trackerTokenMatch: boolean;
  metadataOrderIdMatch: boolean | null;
  completionEventTypes: string[];
  hasCaptureEvidence: boolean;
  verifiedAt: string;
  decision: PendingPaymentVerifyDecision;
  message: string;
  reservationReleased: boolean;
  /** Always false — verify never funds. */
  fundingApplied: false;
  vesimOrderCreated: false;
};

export function parsePendingPaymentVerifyReason(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < PENDING_PAYMENT_VERIFY_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason (at least ${PENDING_PAYMENT_VERIFY_REASON_MIN} characters).`,
    };
  }
  if (reason.length > PENDING_PAYMENT_VERIFY_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${PENDING_PAYMENT_VERIFY_REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

export function shouldReleaseSplitReservationOnDecision(
  decision: PendingPaymentVerifyDecision,
  walletAppliedCents: number
): boolean {
  if (!Number.isInteger(walletAppliedCents) || walletAppliedCents <= 0) {
    return false;
  }
  return (
    decision === "VERIFIED_FAILED" ||
    decision === "VERIFIED_CANCELLED_OR_EXPIRED"
  );
}

function messageForDecision(decision: PendingPaymentVerifyDecision): string {
  switch (decision) {
    case "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED":
      return SUCCESS_WEBHOOK_REQUIRED_MESSAGE;
    case "VERIFIED_FAILED":
      return "Payment provider reports a failed payment. Split wallet reservation may be released when safe.";
    case "VERIFIED_CANCELLED_OR_EXPIRED":
      return "Payment provider reports a cancelled or expired payment. Split wallet reservation may be released when safe.";
    case "PENDING":
      return "Payment provider reports the payment is still pending.";
    case "AMOUNT_MISMATCH":
      return "Payment provider amount does not match the local payment attempt.";
    case "CURRENCY_MISMATCH":
      return "Payment provider currency does not match the local payment attempt.";
    case "TRACKER_MISMATCH":
      return "Payment provider reference does not match this payment attempt.";
    case "PROVIDER_UNAVAILABLE":
      return "Payment provider lookup is unavailable. No local payment state was changed.";
    default:
      return "Payment provider state could not be classified. No local payment state was changed.";
  }
}

export function decidePendingPaymentVerify(input: {
  localAttemptId: string;
  localGatewayPaymentRef: string | null;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  providerUnavailable?: boolean;
  evidence: SafepayReporterEvidence | null;
}): {
  decision: PendingPaymentVerifyDecision;
  message: string;
  trackerTokenMatch: boolean;
  metadataOrderIdMatch: boolean | null;
} {
  if (input.providerUnavailable || !input.evidence) {
    return {
      decision: "PROVIDER_UNAVAILABLE",
      message: messageForDecision("PROVIDER_UNAVAILABLE"),
      trackerTokenMatch: false,
      metadataOrderIdMatch: null,
    };
  }

  const evidence = input.evidence;
  const storedRef = (input.localGatewayPaymentRef ?? "").trim();
  const observedToken = (evidence.trackerToken ?? "").trim();
  const trackerTokenMatch = Boolean(
    storedRef && observedToken && storedRef === observedToken
  );

  if (!storedRef || !observedToken || !trackerTokenMatch) {
    return {
      decision: "TRACKER_MISMATCH",
      message: messageForDecision("TRACKER_MISMATCH"),
      trackerTokenMatch: false,
      metadataOrderIdMatch: null,
    };
  }

  const metaOrder = (evidence.metadataOrderId ?? "").trim();
  const metadataOrderIdMatch = metaOrder
    ? metaOrder === input.localAttemptId.trim()
    : null;
  if (metadataOrderIdMatch === false) {
    return {
      decision: "TRACKER_MISMATCH",
      message: messageForDecision("TRACKER_MISMATCH"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: false,
    };
  }

  const expectedCurrency = input.localExpectedCurrency.trim().toUpperCase();
  const observedCurrency = (evidence.quoteCurrency ?? "").trim().toUpperCase();
  if (
    observedCurrency &&
    expectedCurrency &&
    observedCurrency !== expectedCurrency
  ) {
    return {
      decision: "CURRENCY_MISMATCH",
      message: messageForDecision("CURRENCY_MISMATCH"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  if (
    evidence.quoteAmountMinor != null &&
    Number.isInteger(input.localExpectedAmountMinor) &&
    evidence.quoteAmountMinor !== input.localExpectedAmountMinor
  ) {
    return {
      decision: "AMOUNT_MISMATCH",
      message: messageForDecision("AMOUNT_MISMATCH"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  if (evidence.status === "confirmed") {
    // Confirmed without amount is incomplete — fail closed to UNKNOWN.
    if (evidence.quoteAmountMinor == null || !observedCurrency) {
      return {
        decision: "UNKNOWN",
        message: messageForDecision("UNKNOWN"),
        trackerTokenMatch: true,
        metadataOrderIdMatch,
      };
    }
    return {
      decision: "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED",
      message: messageForDecision("VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  if (evidence.status === "failed") {
    return {
      decision: "VERIFIED_FAILED",
      message: messageForDecision("VERIFIED_FAILED"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  if (evidence.status === "cancelled") {
    return {
      decision: "VERIFIED_CANCELLED_OR_EXPIRED",
      message: messageForDecision("VERIFIED_CANCELLED_OR_EXPIRED"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  if (evidence.status === "pending") {
    return {
      decision: "PENDING",
      message: messageForDecision("PENDING"),
      trackerTokenMatch: true,
      metadataOrderIdMatch,
    };
  }

  return {
    decision: "UNKNOWN",
    message: messageForDecision("UNKNOWN"),
    trackerTokenMatch: true,
    metadataOrderIdMatch,
  };
}

export type SimpaisaInquiryEvidence = {
  status: "confirmed" | "pending" | "failed" | "uncertain";
  providerTransactionId: string | null;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
};

/**
 * Simpaisa inquiry decision. Success never funds — webhook remains required.
 */
export function decideSimpaisaPendingPaymentVerify(input: {
  localGatewayPaymentRef: string | null;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  providerUnavailable?: boolean;
  evidence: SimpaisaInquiryEvidence | null;
}): {
  decision: PendingPaymentVerifyDecision;
  message: string;
  trackerTokenMatch: boolean;
  metadataOrderIdMatch: boolean | null;
} {
  if (input.providerUnavailable || !input.evidence) {
    return {
      decision: "PROVIDER_UNAVAILABLE",
      message: messageForDecision("PROVIDER_UNAVAILABLE"),
      trackerTokenMatch: false,
      metadataOrderIdMatch: null,
    };
  }

  const storedRef = (input.localGatewayPaymentRef ?? "").trim();
  const observedRef = (input.evidence.providerTransactionId ?? "").trim();
  const trackerTokenMatch = Boolean(
    storedRef && (!observedRef || storedRef === observedRef)
  );

  if (!storedRef || (observedRef && storedRef !== observedRef)) {
    return {
      decision: "TRACKER_MISMATCH",
      message: messageForDecision("TRACKER_MISMATCH"),
      trackerTokenMatch: false,
      metadataOrderIdMatch: null,
    };
  }

  const expectedCurrency = input.localExpectedCurrency.trim().toUpperCase();
  const observedCurrency = (input.evidence.chargeCurrency ?? "")
    .trim()
    .toUpperCase();
  if (
    observedCurrency &&
    expectedCurrency &&
    observedCurrency !== expectedCurrency
  ) {
    return {
      decision: "CURRENCY_MISMATCH",
      message: messageForDecision("CURRENCY_MISMATCH"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  if (
    input.evidence.chargeAmountMinor != null &&
    Number.isInteger(input.localExpectedAmountMinor) &&
    input.evidence.chargeAmountMinor !== input.localExpectedAmountMinor
  ) {
    return {
      decision: "AMOUNT_MISMATCH",
      message: messageForDecision("AMOUNT_MISMATCH"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  if (input.evidence.status === "confirmed") {
    return {
      decision: "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED",
      message: messageForDecision("VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  if (input.evidence.status === "failed") {
    return {
      decision: "VERIFIED_FAILED",
      message: messageForDecision("VERIFIED_FAILED"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  if (input.evidence.status === "pending") {
    return {
      decision: "PENDING",
      message: messageForDecision("PENDING"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  if (input.evidence.status === "uncertain") {
    return {
      decision: "UNKNOWN",
      message: messageForDecision("UNKNOWN"),
      trackerTokenMatch: true,
      metadataOrderIdMatch: null,
    };
  }

  return {
    decision: "UNKNOWN",
    message: messageForDecision("UNKNOWN"),
    trackerTokenMatch: true,
    metadataOrderIdMatch: null,
  };
}

export function buildPendingPaymentEvidenceView(input: {
  attemptId: string;
  purchaseId: string;
  localAttemptStatus: string;
  localPurchaseStatus: string;
  localExpectedAmountMinor: number;
  localExpectedCurrency: string;
  localGatewayPaymentRef: string | null;
  evidence: SafepayReporterEvidence | null;
  decision: PendingPaymentVerifyDecision;
  message: string;
  trackerTokenMatch: boolean;
  metadataOrderIdMatch: boolean | null;
  reservationReleased: boolean;
  verifiedAt?: Date;
}): PendingPaymentVerifyEvidenceView {
  const verifiedAt = (input.verifiedAt ?? new Date()).toISOString();
  return {
    attemptId: input.attemptId,
    purchaseId: input.purchaseId,
    localAttemptStatus: input.localAttemptStatus,
    localPurchaseStatus: input.localPurchaseStatus,
    localExpectedAmountMinor: input.localExpectedAmountMinor,
    localExpectedCurrency: input.localExpectedCurrency,
    observedAmountMinor: input.evidence?.quoteAmountMinor ?? null,
    observedCurrency: input.evidence?.quoteCurrency ?? null,
    trackerState: input.evidence?.state ?? "UNKNOWN",
    trackerLifecycle: input.evidence?.status ?? "uncertain",
    trackerRefMasked: maskSafepayTrackerRef(
      input.evidence?.trackerToken ?? input.localGatewayPaymentRef
    ),
    trackerTokenMatch: input.trackerTokenMatch,
    metadataOrderIdMatch: input.metadataOrderIdMatch,
    completionEventTypes: input.evidence?.completionEventTypes ?? [],
    hasCaptureEvidence: input.evidence?.hasCaptureEvidence ?? false,
    verifiedAt,
    decision: input.decision,
    message: input.message,
    reservationReleased: input.reservationReleased,
    fundingApplied: false,
    vesimOrderCreated: false,
  };
}
