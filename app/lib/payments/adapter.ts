import "server-only";

import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  FetchPaymentStatusInput,
  NormalizedPaymentEvent,
  NormalizedPaymentStatus,
  PaymentGatewayProviderName,
  RequestRefundInput,
  RequestRefundResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "@/app/lib/payments/types";

/**
 * Provider-neutral payment gateway adapter contract.
 * Real adapters must verify signatures server-side and never credit wallets directly.
 */
export type PaymentGatewayAdapter = {
  readonly provider: PaymentGatewayProviderName;
  readonly enabled: boolean;
  createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<CreateCheckoutSessionResult>;
  verifyWebhookSignature(
    input: WebhookVerificationInput
  ): Promise<WebhookVerificationResult>;
  parseWebhookEvent(
    input: WebhookVerificationInput
  ): Promise<NormalizedPaymentEvent | null>;
  fetchPaymentStatus(
    input: FetchPaymentStatusInput
  ): Promise<NormalizedPaymentStatus | null>;
  requestRefund(input: RequestRefundInput): Promise<RequestRefundResult>;
};

export {
  type CreateCheckoutSessionInput,
  type CreateCheckoutSessionResult,
  type FetchPaymentStatusInput,
  type NormalizedPaymentEvent,
  type NormalizedPaymentStatus,
  type PaymentGatewayProviderName,
  type RequestRefundInput,
  type RequestRefundResult,
  type WebhookVerificationInput,
  type WebhookVerificationResult,
} from "@/app/lib/payments/types";
