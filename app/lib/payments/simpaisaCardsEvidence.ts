/**
 * Verified evidence gate for Simpaisa Cards → applyVerifiedPaymentEvent.
 * Pure internal shapes only — no invented Simpaisa request/response fields.
 *
 * Provider webhook/inquiry parsers remain WAITING_FOR_SIMPAISA.
 * Browser return query params are NEVER treated as verified evidence.
 */

import { SIMPAISA_CARDS_CONTRACT_STATUS } from "@/app/lib/payments/simpaisaCardsPolicy";
import type {
  NormalizedPaymentEvent,
  PaymentCheckoutPurpose,
} from "@/app/lib/payments/types";

/**
 * Internal MAP evidence after an authoritative Cards callback or inquiry.
 * Field names are MAP-owned; provider payload mapping is WAITING_FOR_SIMPAISA.
 */
export type SimpaisaCardsVerifiedEvidence = {
  /** Must be true only after documented authenticity + parse succeed. */
  evidenceVerified: boolean;
  purpose: PaymentCheckoutPurpose;
  eventId: string;
  providerPaymentRef: string | null;
  localTopupId: string | null;
  paymentAttemptId: string | null;
  purchaseId: string | null;
  paymentStatus: "confirmed" | "pending" | "failed" | "uncertain";
  chargeCurrency: string;
  chargeAmountMinor: number;
  confirmedAt: Date | null;
  failureCategory: string | null;
  /** Provenance for audit — never a browser return. */
  evidenceSource: "provider_callback" | "provider_inquiry";
};

export type SimpaisaCardsEvidenceBuildResult =
  | { ok: true; evidence: SimpaisaCardsVerifiedEvidence }
  | {
      ok: false;
      code:
        | "UNSIGNED_OR_UNVERIFIED"
        | "INVALID_EVIDENCE"
        | "BROWSER_RETURN_FORBIDDEN"
        | "PROVIDER_CONTRACT_WAITING";
    };

/**
 * Browser return must never produce verified evidence.
 * Call this from return handlers to keep the invariant explicit.
 */
export function rejectBrowserReturnAsCardsEvidence(): SimpaisaCardsEvidenceBuildResult {
  return { ok: false, code: "BROWSER_RETURN_FORBIDDEN" };
}

/**
 * Build MAP evidence from already-verified internal fields.
 * Does not parse provider payloads (WAITING_FOR_SIMPAISA).
 */
export function buildSimpaisaCardsVerifiedEvidence(input: {
  evidenceVerified: boolean;
  evidenceSource: "provider_callback" | "provider_inquiry";
  purpose: PaymentCheckoutPurpose;
  eventId: string;
  providerPaymentRef?: string | null;
  localTopupId?: string | null;
  paymentAttemptId?: string | null;
  purchaseId?: string | null;
  paymentStatus: SimpaisaCardsVerifiedEvidence["paymentStatus"];
  chargeCurrency: string;
  chargeAmountMinor: number;
  confirmedAt?: Date | null;
  failureCategory?: string | null;
}): SimpaisaCardsEvidenceBuildResult {
  if (!input.evidenceVerified) {
    return { ok: false, code: "UNSIGNED_OR_UNVERIFIED" };
  }
  const eventId = (input.eventId ?? "").trim();
  if (!eventId || eventId.length > 128) {
    return { ok: false, code: "INVALID_EVIDENCE" };
  }
  if (
    !Number.isInteger(input.chargeAmountMinor) ||
    input.chargeAmountMinor <= 0
  ) {
    return { ok: false, code: "INVALID_EVIDENCE" };
  }
  const chargeCurrency = (input.chargeCurrency ?? "").trim().toUpperCase();
  if (!chargeCurrency || chargeCurrency.length > 8) {
    return { ok: false, code: "INVALID_EVIDENCE" };
  }

  return {
    ok: true,
    evidence: {
      evidenceVerified: true,
      evidenceSource: input.evidenceSource,
      purpose: input.purpose,
      eventId,
      providerPaymentRef: input.providerPaymentRef?.trim() || null,
      localTopupId: input.localTopupId?.trim() || null,
      paymentAttemptId: input.paymentAttemptId?.trim() || null,
      purchaseId: input.purchaseId?.trim() || null,
      paymentStatus: input.paymentStatus,
      chargeCurrency,
      chargeAmountMinor: input.chargeAmountMinor,
      confirmedAt: input.confirmedAt ?? null,
      failureCategory: input.failureCategory ?? null,
    },
  };
}

/**
 * Map verified Cards evidence to NormalizedPaymentEvent for
 * applyVerifiedPaymentEvent. Throws if evidence is not verified.
 */
export function toNormalizedPaymentEventForApply(
  evidence: SimpaisaCardsVerifiedEvidence
): NormalizedPaymentEvent {
  if (!evidence.evidenceVerified) {
    throw new Error("UNSIGNED_PAYMENT_EVENT");
  }
  return {
    signatureVerified: true,
    provider: "SIMPAISA_CARDS",
    purpose: evidence.purpose,
    eventId: evidence.eventId,
    providerPaymentRef: evidence.providerPaymentRef,
    localTopupId: evidence.localTopupId,
    paymentAttemptId: evidence.paymentAttemptId,
    purchaseId: evidence.purchaseId,
    paymentStatus: evidence.paymentStatus,
    chargeCurrency: evidence.chargeCurrency,
    chargeAmountMinor: evidence.chargeAmountMinor,
    confirmedAt: evidence.confirmedAt,
    failureCategory: evidence.failureCategory,
  };
}

/** Placeholder — real parse stays blocked. */
export function simpaisaCardsWebhookParseContractStatus(): typeof SIMPAISA_CARDS_CONTRACT_STATUS {
  return SIMPAISA_CARDS_CONTRACT_STATUS;
}

export function simpaisaCardsInquiryParseContractStatus(): typeof SIMPAISA_CARDS_CONTRACT_STATUS {
  return SIMPAISA_CARDS_CONTRACT_STATUS;
}
