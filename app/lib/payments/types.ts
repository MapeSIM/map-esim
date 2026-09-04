/**
 * Provider-neutral payment types for wallet top-up and eSIM purchase adapters.
 * Safe fields only — never card data, secrets, or raw gateway JSON.
 */

export type PaymentGatewayProviderName =
  | "SIMPAISA"
  | "SIMPAISA_CARDS"
  | "PAYFAST"
  | "SAFEPAY"
  | "JAZZCASH"
  | "EASYPAISA"
  | "MANUAL_TEST"
  | "UNCONFIGURED";

export type PaymentCheckoutPurpose = "WALLET_TOPUP" | "ESIM_PURCHASE";

export type NormalizedPaymentStatus =
  | "confirmed"
  | "pending"
  | "failed"
  | "uncertain";

type CreateCheckoutSessionBase = {
  customerUserId: string;
  /** Server-authoritative charge amount in minor units (e.g. USD cents). */
  chargeAmountMinor: number;
  /** Server-authoritative ISO currency for the gateway charge (e.g. USD). */
  chargeCurrency: string;
  checkoutIdempotencyKey: string;
  /** Internal relative path only — never arbitrary absolute URLs. */
  returnPath: string;
  cancelPath: string;
  /** Simpaisa wallet operator id. Ignored by Safepay. */
  walletOperatorId?: string;
  /** Customer MSISDN for wallet collection. Ignored by Safepay. */
  customerMsisdn?: string;
};

export type CreateWalletTopupCheckoutInput = CreateCheckoutSessionBase & {
  purpose: "WALLET_TOPUP";
  localTopupId: string;
};

export type CreateEsimPurchaseCheckoutInput = CreateCheckoutSessionBase & {
  purpose: "ESIM_PURCHASE";
  paymentAttemptId: string;
  purchaseId: string;
  customerEmail?: string | null;
  /** Safe internal metadata only (ids/status). Never secrets or card data. */
  metadata?: Readonly<Record<string, string>>;
};

export type CreateCheckoutSessionInput =
  | CreateWalletTopupCheckoutInput
  | CreateEsimPurchaseCheckoutInput;

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
      code:
        | "GATEWAY_UNAVAILABLE"
        | "INVALID_REQUEST"
        | "UNAVAILABLE"
        | "MISCONFIGURED";
      message: string;
    };

export type WebhookVerificationInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
};

export type WebhookVerificationResult =
  | { ok: true }
  | {
      ok: false;
      code: "INVALID_SIGNATURE" | "GATEWAY_UNAVAILABLE" | "MISCONFIGURED";
    };

/**
 * Normalized payment event after adapter signature verification + parse.
 * Crediting / purchase funding requires signatureVerified === true.
 */
export type NormalizedPaymentEvent = {
  /**
   * For Safepay: HMAC signature verified on the postback.
   * For Simpaisa sandbox: set true only after authoritative Inquire 0000 + field validation.
   */
  signatureVerified: boolean;
  provider: PaymentGatewayProviderName;
  purpose: PaymentCheckoutPurpose;
  eventId: string;
  providerPaymentRef: string | null;
  localTopupId: string | null;
  paymentAttemptId: string | null;
  purchaseId: string | null;
  paymentStatus: NormalizedPaymentStatus;
  chargeCurrency: string;
  chargeAmountMinor: number;
  confirmedAt: Date | null;
  failureCategory: string | null;
  /** Simpaisa wallet operator id (100007 / 100008) when parsed from postback. */
  walletOperatorId?: string | null;
};

export type FetchPaymentStatusInput = {
  providerPaymentRef: string;
  purpose: PaymentCheckoutPurpose;
  localTopupId?: string;
  paymentAttemptId?: string;
};

export type RequestRefundInput = {
  providerPaymentRef: string;
  purpose: PaymentCheckoutPurpose;
  localTopupId?: string;
  paymentAttemptId?: string;
  amountMinor: number;
  currency: string;
};

export type RequestRefundResult =
  | { ok: true; providerRefundRef: string | null }
  | {
      ok: false;
      code: "GATEWAY_UNAVAILABLE" | "UNSUPPORTED" | "FAILED" | "MISCONFIGURED";
    };
