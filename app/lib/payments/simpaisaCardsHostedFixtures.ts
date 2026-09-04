/**
 * Mocked Hosted-Page-style fixtures for Simpaisa Cards foundation QA.
 * Uses MAP-owned abstract fields only.
 *
 * Provider payload field maps for create-session / redirect query / webhook /
 * inquiry remain WAITING_FOR_SIMPAISA — do not invent Simpaisa JSON keys here.
 */
import { SIMPAISA_CARDS_CONTRACT_STATUS } from "@/app/lib/payments/simpaisaCardsPolicy";
import {
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
} from "@/app/lib/payments/simpaisaCardsReturn";
import type { PaymentCheckoutPurpose } from "@/app/lib/payments/types";

export type SimpaisaCardsMockHostedSession = {
  /** Placeholder only — real hosted URL shape WAITING_FOR_SIMPAISA. */
  contractStatus: typeof SIMPAISA_CARDS_CONTRACT_STATUS;
  attemptId: string;
  purpose: PaymentCheckoutPurpose;
  returnPath: string;
  cancelPath: string;
  expectedChargeAmountMinor: number;
  expectedChargeCurrency: string;
  /** Opaque mock ref — not a documented Simpaisa field name. */
  mockSessionRef: string;
};

export type SimpaisaCardsMockBrowserReturn = {
  attemptId: string;
  /**
   * Query keys from a future Hosted Page redirect are unknown.
   * Fixtures expose an empty bag so handlers cannot trust invented fields.
   */
  untrustedQuery: Record<string, never>;
  mayFund: false;
};

export type SimpaisaCardsMockVerifiedCallback = {
  contractStatus: typeof SIMPAISA_CARDS_CONTRACT_STATUS;
  eventId: string;
  paymentStatus: "confirmed" | "pending" | "failed" | "uncertain";
  chargeAmountMinor: number;
  chargeCurrency: string;
  providerPaymentRef: string;
  /** MAP-owned; real webhook body keys WAITING_FOR_SIMPAISA. */
  evidenceSource: "provider_callback";
};

export type SimpaisaCardsMockInquiryResult = {
  contractStatus: typeof SIMPAISA_CARDS_CONTRACT_STATUS;
  eventId: string;
  paymentStatus: "confirmed" | "pending" | "failed" | "uncertain";
  chargeAmountMinor: number;
  chargeCurrency: string;
  providerPaymentRef: string;
  evidenceSource: "provider_inquiry";
};

export function createMockSimpaisaCardsHostedSession(input: {
  attemptId: string;
  purpose: PaymentCheckoutPurpose;
  expectedChargeAmountMinor: number;
  expectedChargeCurrency: string;
}): SimpaisaCardsMockHostedSession {
  return {
    contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    attemptId: input.attemptId,
    purpose: input.purpose,
    returnPath: esimPurchasePaymentReturnPath(input.attemptId),
    cancelPath: esimPurchasePaymentCancelPath(input.attemptId),
    expectedChargeAmountMinor: input.expectedChargeAmountMinor,
    expectedChargeCurrency: input.expectedChargeCurrency.toUpperCase(),
    mockSessionRef: `mock_cards_session_${input.attemptId}`,
  };
}

export function createMockSimpaisaCardsBrowserReturn(
  attemptId: string
): SimpaisaCardsMockBrowserReturn {
  return {
    attemptId,
    untrustedQuery: {},
    mayFund: false,
  };
}

export function createMockSimpaisaCardsVerifiedCallback(input: {
  attemptId: string;
  eventId: string;
  paymentStatus?: SimpaisaCardsMockVerifiedCallback["paymentStatus"];
  chargeAmountMinor: number;
  chargeCurrency: string;
}): SimpaisaCardsMockVerifiedCallback {
  return {
    contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    eventId: input.eventId,
    paymentStatus: input.paymentStatus ?? "confirmed",
    chargeAmountMinor: input.chargeAmountMinor,
    chargeCurrency: input.chargeCurrency.toUpperCase(),
    providerPaymentRef: `mock_cards_ref_${input.attemptId}`,
    evidenceSource: "provider_callback",
  };
}

export function createMockSimpaisaCardsInquiryResult(input: {
  attemptId: string;
  eventId: string;
  paymentStatus?: SimpaisaCardsMockInquiryResult["paymentStatus"];
  chargeAmountMinor: number;
  chargeCurrency: string;
}): SimpaisaCardsMockInquiryResult {
  return {
    contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    eventId: input.eventId,
    paymentStatus: input.paymentStatus ?? "confirmed",
    chargeAmountMinor: input.chargeAmountMinor,
    chargeCurrency: input.chargeCurrency.toUpperCase(),
    providerPaymentRef: `mock_cards_inquiry_${input.attemptId}`,
    evidenceSource: "provider_inquiry",
  };
}
