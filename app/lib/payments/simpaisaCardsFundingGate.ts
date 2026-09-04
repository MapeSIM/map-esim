/**
 * In-memory Simpaisa Cards funding gate (foundation / offline QA).
 * Models durable lifecycle + exact-once funding without provider HTTP or DB.
 *
 * Rules:
 * - Browser return never funds and never marks evidence verified.
 * - Callbacks/inquiry may fund only with verified evidence + amount/currency match.
 * - Duplicate verified events are idempotent (exact-once funding).
 */
import {
  buildSimpaisaCardsVerifiedEvidence,
  rejectBrowserReturnAsCardsEvidence,
  type SimpaisaCardsVerifiedEvidence,
} from "@/app/lib/payments/simpaisaCardsEvidence";
import {
  SIMPAISA_CARDS_BROWSER_RETURN_MAY_FUND,
  canFundFromSimpaisaCardsLifecycle,
  canTransitionSimpaisaCardsAttempt,
  type SimpaisaCardsAttemptStatus,
} from "@/app/lib/payments/simpaisaCardsLifecycle";
import type { PaymentCheckoutPurpose } from "@/app/lib/payments/types";

export type SimpaisaCardsAttemptRecord = {
  attemptId: string;
  purpose: PaymentCheckoutPurpose;
  status: SimpaisaCardsAttemptStatus;
  expectedChargeAmountMinor: number;
  expectedChargeCurrency: string;
  localTopupId: string | null;
  purchaseId: string | null;
  providerPaymentRef: string | null;
  browserReturnCount: number;
  fundedOnce: boolean;
  fundingEventId: string | null;
  seenEventIds: string[];
  lastFailureCategory: string | null;
};

export type SimpaisaCardsFundingOutcome =
  | { kind: "ignored_browser_return"; funded: false }
  | { kind: "duplicate_event"; funded: false; priorEventId: string }
  | { kind: "amount_mismatch"; funded: false; status: "RECONCILIATION_REQUIRED" }
  | {
      kind: "currency_mismatch";
      funded: false;
      status: "RECONCILIATION_REQUIRED";
    }
  | {
      kind: "uncertain_recon";
      funded: false;
      status: "RECONCILIATION_REQUIRED";
    }
  | { kind: "verified_failed"; funded: false; status: "VERIFIED_FAILED" }
  | { kind: "pending_no_fund"; funded: false; status: SimpaisaCardsAttemptStatus }
  | {
      kind: "funded";
      funded: true;
      status: "VERIFIED_SUCCESS";
      eventId: string;
    }
  | { kind: "rejected"; funded: false; reason: string };

function amountsMatch(input: {
  expectedAmount: number;
  expectedCurrency: string;
  eventAmount: number;
  eventCurrency: string;
}): boolean {
  return (
    input.expectedAmount === input.eventAmount &&
    input.expectedCurrency === input.eventCurrency.toUpperCase()
  );
}

export function createSimpaisaCardsAttemptRecord(input: {
  attemptId: string;
  purpose: PaymentCheckoutPurpose;
  expectedChargeAmountMinor: number;
  expectedChargeCurrency: string;
  localTopupId?: string | null;
  purchaseId?: string | null;
}): SimpaisaCardsAttemptRecord {
  return {
    attemptId: input.attemptId,
    purpose: input.purpose,
    status: "CREATED",
    expectedChargeAmountMinor: input.expectedChargeAmountMinor,
    expectedChargeCurrency: input.expectedChargeCurrency.toUpperCase(),
    localTopupId: input.localTopupId ?? null,
    purchaseId: input.purchaseId ?? null,
    providerPaymentRef: null,
    browserReturnCount: 0,
    fundedOnce: false,
    fundingEventId: null,
    seenEventIds: [],
    lastFailureCategory: null,
  };
}

export function markSimpaisaCardsSessionPending(
  attempt: SimpaisaCardsAttemptRecord
): SimpaisaCardsAttemptRecord {
  if (!canTransitionSimpaisaCardsAttempt(attempt.status, "SESSION_PENDING")) {
    return attempt;
  }
  return { ...attempt, status: "SESSION_PENDING" };
}

export function markSimpaisaCardsCustomerActionRequired(
  attempt: SimpaisaCardsAttemptRecord
): SimpaisaCardsAttemptRecord {
  if (
    !canTransitionSimpaisaCardsAttempt(
      attempt.status,
      "CUSTOMER_ACTION_REQUIRED"
    )
  ) {
    return attempt;
  }
  return { ...attempt, status: "CUSTOMER_ACTION_REQUIRED" };
}

/**
 * Browser return: UX observation only.
 * Never verifies evidence, never funds.
 */
export function applySimpaisaCardsBrowserReturn(
  attempt: SimpaisaCardsAttemptRecord
): {
  attempt: SimpaisaCardsAttemptRecord;
  outcome: Extract<
    SimpaisaCardsFundingOutcome,
    { kind: "ignored_browser_return" }
  >;
  evidenceRejected: true;
} {
  void SIMPAISA_CARDS_BROWSER_RETURN_MAY_FUND;
  const evidence = rejectBrowserReturnAsCardsEvidence();
  if (evidence.ok) {
    throw new Error("BROWSER_RETURN_MUST_REJECT_EVIDENCE");
  }
  return {
    attempt: {
      ...attempt,
      browserReturnCount: attempt.browserReturnCount + 1,
    },
    outcome: { kind: "ignored_browser_return", funded: false },
    evidenceRejected: true,
  };
}

function applyVerifiedEvidenceToAttempt(
  attempt: SimpaisaCardsAttemptRecord,
  evidence: SimpaisaCardsVerifiedEvidence
): { attempt: SimpaisaCardsAttemptRecord; outcome: SimpaisaCardsFundingOutcome } {
  if (attempt.seenEventIds.includes(evidence.eventId)) {
    return {
      attempt,
      outcome: {
        kind: "duplicate_event",
        funded: false,
        priorEventId: evidence.eventId,
      },
    };
  }

  const nextSeen = [...attempt.seenEventIds, evidence.eventId];

  if (evidence.paymentStatus === "pending") {
    const status: SimpaisaCardsAttemptStatus = canTransitionSimpaisaCardsAttempt(
      attempt.status,
      "PROCESSING"
    )
      ? "PROCESSING"
      : attempt.status;
    return {
      attempt: {
        ...attempt,
        status,
        seenEventIds: nextSeen,
        providerPaymentRef:
          evidence.providerPaymentRef ?? attempt.providerPaymentRef,
      },
      outcome: { kind: "pending_no_fund", funded: false, status },
    };
  }

  if (evidence.paymentStatus === "failed") {
    return {
      attempt: {
        ...attempt,
        status: "VERIFIED_FAILED",
        seenEventIds: nextSeen,
        lastFailureCategory: evidence.failureCategory ?? "provider_failed",
        providerPaymentRef:
          evidence.providerPaymentRef ?? attempt.providerPaymentRef,
      },
      outcome: {
        kind: "verified_failed",
        funded: false,
        status: "VERIFIED_FAILED",
      },
    };
  }

  if (evidence.paymentStatus === "uncertain") {
    return {
      attempt: {
        ...attempt,
        status: "RECONCILIATION_REQUIRED",
        seenEventIds: nextSeen,
        lastFailureCategory: evidence.failureCategory ?? "uncertain",
        providerPaymentRef:
          evidence.providerPaymentRef ?? attempt.providerPaymentRef,
      },
      outcome: {
        kind: "uncertain_recon",
        funded: false,
        status: "RECONCILIATION_REQUIRED",
      },
    };
  }

  // confirmed
  if (evidence.chargeCurrency !== attempt.expectedChargeCurrency) {
    return {
      attempt: {
        ...attempt,
        status: "RECONCILIATION_REQUIRED",
        seenEventIds: nextSeen,
        lastFailureCategory: "currency_mismatch",
        providerPaymentRef:
          evidence.providerPaymentRef ?? attempt.providerPaymentRef,
      },
      outcome: {
        kind: "currency_mismatch",
        funded: false,
        status: "RECONCILIATION_REQUIRED",
      },
    };
  }

  if (
    !amountsMatch({
      expectedAmount: attempt.expectedChargeAmountMinor,
      expectedCurrency: attempt.expectedChargeCurrency,
      eventAmount: evidence.chargeAmountMinor,
      eventCurrency: evidence.chargeCurrency,
    })
  ) {
    return {
      attempt: {
        ...attempt,
        status: "RECONCILIATION_REQUIRED",
        seenEventIds: nextSeen,
        lastFailureCategory: "amount_mismatch",
        providerPaymentRef:
          evidence.providerPaymentRef ?? attempt.providerPaymentRef,
      },
      outcome: {
        kind: "amount_mismatch",
        funded: false,
        status: "RECONCILIATION_REQUIRED",
      },
    };
  }

  if (attempt.fundedOnce) {
    return {
      attempt: { ...attempt, seenEventIds: nextSeen },
      outcome: {
        kind: "duplicate_event",
        funded: false,
        priorEventId: attempt.fundingEventId ?? evidence.eventId,
      },
    };
  }

  const successAttempt: SimpaisaCardsAttemptRecord = {
    ...attempt,
    status: "VERIFIED_SUCCESS",
    seenEventIds: nextSeen,
    providerPaymentRef:
      evidence.providerPaymentRef ?? attempt.providerPaymentRef,
    fundedOnce: true,
    fundingEventId: evidence.eventId,
  };

  const mayFund = canFundFromSimpaisaCardsLifecycle(successAttempt.status, {
    evidenceVerified: evidence.evidenceVerified,
    fundedOnce: false,
  });
  if (!mayFund) {
    return {
      attempt: {
        ...attempt,
        status: "RECONCILIATION_REQUIRED",
        seenEventIds: nextSeen,
        lastFailureCategory: "funding_gate_blocked",
      },
      outcome: {
        kind: "rejected",
        funded: false,
        reason: "funding_gate_blocked",
      },
    };
  }

  return {
    attempt: successAttempt,
    outcome: {
      kind: "funded",
      funded: true,
      status: "VERIFIED_SUCCESS",
      eventId: evidence.eventId,
    },
  };
}

export function applySimpaisaCardsVerifiedCallback(
  attempt: SimpaisaCardsAttemptRecord,
  input: {
    eventId: string;
    paymentStatus: SimpaisaCardsVerifiedEvidence["paymentStatus"];
    chargeAmountMinor: number;
    chargeCurrency: string;
    providerPaymentRef?: string | null;
    failureCategory?: string | null;
  }
): { attempt: SimpaisaCardsAttemptRecord; outcome: SimpaisaCardsFundingOutcome } {
  const built = buildSimpaisaCardsVerifiedEvidence({
    evidenceVerified: true,
    evidenceSource: "provider_callback",
    purpose: attempt.purpose,
    eventId: input.eventId,
    providerPaymentRef: input.providerPaymentRef,
    localTopupId: attempt.localTopupId,
    paymentAttemptId: attempt.attemptId,
    purchaseId: attempt.purchaseId,
    paymentStatus: input.paymentStatus,
    chargeAmountMinor: input.chargeAmountMinor,
    chargeCurrency: input.chargeCurrency,
    failureCategory: input.failureCategory,
  });
  if (!built.ok) {
    return {
      attempt,
      outcome: { kind: "rejected", funded: false, reason: built.code },
    };
  }
  return applyVerifiedEvidenceToAttempt(attempt, built.evidence);
}

/** Inquiry recovery uses the same verified-evidence funding path. */
export function applySimpaisaCardsInquiryRecovery(
  attempt: SimpaisaCardsAttemptRecord,
  input: {
    eventId: string;
    paymentStatus: SimpaisaCardsVerifiedEvidence["paymentStatus"];
    chargeAmountMinor: number;
    chargeCurrency: string;
    providerPaymentRef?: string | null;
    failureCategory?: string | null;
  }
): { attempt: SimpaisaCardsAttemptRecord; outcome: SimpaisaCardsFundingOutcome } {
  const built = buildSimpaisaCardsVerifiedEvidence({
    evidenceVerified: true,
    evidenceSource: "provider_inquiry",
    purpose: attempt.purpose,
    eventId: input.eventId,
    providerPaymentRef: input.providerPaymentRef,
    localTopupId: attempt.localTopupId,
    paymentAttemptId: attempt.attemptId,
    purchaseId: attempt.purchaseId,
    paymentStatus: input.paymentStatus,
    chargeAmountMinor: input.chargeAmountMinor,
    chargeCurrency: input.chargeCurrency,
    failureCategory: input.failureCategory,
  });
  if (!built.ok) {
    return {
      attempt,
      outcome: { kind: "rejected", funded: false, reason: built.code },
    };
  }
  return applyVerifiedEvidenceToAttempt(attempt, built.evidence);
}
