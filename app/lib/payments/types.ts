/**
 * Provider-neutral payment types for wallet top-up adapters.
 * Safe fields only — never card data, secrets, or raw gateway JSON.
 */

export type PaymentGatewayProviderName =
  | "SIMPAISA"
  | "PAYFAST"
  | "SAFEPAY"
  | "JAZZCASH"
  | "EASYPAISA"
  | "MANUAL_TEST"
  | "UNCONFIGURED";

export type NormalizedPaymentStatus =
  | "confirmed"
  | "pending"
  | "failed"
  | "uncertain";

export type CreateCheckoutSessionInput = {
  localTopupId: string;
  customerUserId: string;
  creditAmountCents: number;
  checkoutIdempotencyKey: string;
  returnPath: string;
  cancelPath: string;
};

export type CreateCheckoutSessionResult =
  | {
      ok: true;
      provider: PaymentGatewayProviderName;
      checkoutUrl: string;
      providerPaymentRef: string | null;
      chargeCurrency: string;
      chargeAmountMinor: number;
      fxRateSnapshot: string | null;
      expiresAt: Date | null;
    }
  | {
      ok: false;
      code: "GATEWAY_UNAVAILABLE" | "INVALID_REQUEST" | "UNAVAILABLE";
      message: string;
    };

export type WebhookVerificationInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
};

export type WebhookVerificationResult =
  | { ok: true }
  | { ok: false; code: "INVALID_SIGNATURE" | "GATEWAY_UNAVAILABLE" };

/**
 * Normalized payment event after adapter signature verification + parse.
 * Crediting requires signatureVerified === true and paid status confirmed.
 */
export type NormalizedPaymentEvent = {
  signatureVerified: boolean;
  provider: PaymentGatewayProviderName;
  eventId: string;
  providerPaymentRef: string | null;
  localTopupId: string;
  paymentStatus: NormalizedPaymentStatus;
  chargeCurrency: string;
  chargeAmountMinor: number;
  confirmedAt: Date | null;
  failureCategory: string | null;
};

export type FetchPaymentStatusInput = {
  providerPaymentRef: string;
  localTopupId: string;
};

export type RequestRefundInput = {
  providerPaymentRef: string;
  localTopupId: string;
  amountMinor: number;
  currency: string;
};

export type RequestRefundResult =
  | { ok: true; providerRefundRef: string | null }
  | { ok: false; code: "GATEWAY_UNAVAILABLE" | "UNSUPPORTED" | "FAILED" };
