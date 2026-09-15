import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";
import {
  logSimpaisaConfigFailure,
  resolveSimpaisaAdapterConfig,
  resolveSimpaisaWebhookConfig,
  type SimpaisaValidatedConfig,
} from "@/app/lib/payments/simpaisaConfig";
import { assertSafePaymentReturnPath } from "@/app/lib/payments/safepayCheckoutUrls";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
} from "@/app/lib/payments/simpaisaHttp";
import {
  isSimpaisaWalletOperatorId,
  isSimpaisaWebhookSignatureContractAvailable,
  normalizeSimpaisaMsisdn,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_WEBHOOK_PATH,
} from "@/app/lib/payments/simpaisaPolicy";
import { SIMPAISA_PKR_USD_RATE } from "@/app/lib/payments/simpaisaPkrQuote";
import { parseSimpaisaWebhookEvent } from "@/app/lib/payments/simpaisaWebhookParse";
import { verifySimpaisaWebhookSignature } from "@/app/lib/payments/simpaisaWebhookCrypto";
import { simpaisaSignatureHeader } from "@/app/lib/payments/simpaisaWebhookObservability";
import { partnerTopupMerchantUserKey } from "@/app/lib/partner/partnerWalletTopupConstants";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  FetchPaymentStatusInput,
  NormalizedPaymentEvent,
  NormalizedPaymentStatus,
  RequestRefundInput,
  RequestRefundResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "@/app/lib/payments/types";

const PUBLIC_UNAVAILABLE =
  "Payment gateway is not available yet. Please try again after payment provider setup is complete.";
const PUBLIC_MISCONFIGURED =
  "Payment gateway configuration is incomplete. Please try again later.";

function merchantUserKey(input: CreateCheckoutSessionInput): string {
  if (input.purpose === "WALLET_TOPUP") return input.localTopupId.trim();
  if (input.purpose === "PARTNER_WALLET_TOPUP") {
    return partnerTopupMerchantUserKey(input.localPartnerTopupId);
  }
  return input.paymentAttemptId.trim();
}

function productReference(input: CreateCheckoutSessionInput): string {
  if (input.purpose === "WALLET_TOPUP") return input.localTopupId.trim();
  if (input.purpose === "PARTNER_WALLET_TOPUP") {
    return partnerTopupMerchantUserKey(input.localPartnerTopupId);
  }
  return input.purchaseId.trim();
}

function validateCheckoutInput(
  input: CreateCheckoutSessionInput
): string | null {
  if (
    !Number.isInteger(input.chargeAmountMinor) ||
    input.chargeAmountMinor <= 0
  ) {
    return "Invalid charge amount.";
  }
  if (input.chargeCurrency.trim().toUpperCase() !== SIMPAISA_CHARGE_CURRENCY) {
    return "Simpaisa wallet collection requires PKR.";
  }
  if (
    !input.checkoutIdempotencyKey.trim() ||
    input.checkoutIdempotencyKey.length > 128
  ) {
    return "Invalid checkout key.";
  }
  if (!input.customerUserId.trim() || input.customerUserId.length > 64) {
    return "Invalid customer.";
  }
  if (!isSimpaisaWalletOperatorId(input.walletOperatorId)) {
    return "Select a supported mobile wallet.";
  }
  if (!normalizeSimpaisaMsisdn(input.customerMsisdn)) {
    return "Enter a valid Pakistani mobile number.";
  }

  if (input.purpose === "WALLET_TOPUP") {
    if (!input.localTopupId.trim() || input.localTopupId.length > 64) {
      return "Invalid top-up reference.";
    }
  } else if (input.purpose === "PARTNER_WALLET_TOPUP") {
    if (
      !input.localPartnerTopupId.trim() ||
      input.localPartnerTopupId.length > 64
    ) {
      return "Invalid partner top-up reference.";
    }
  } else if (input.purpose === "ESIM_PURCHASE") {
    if (
      !input.paymentAttemptId.trim() ||
      input.paymentAttemptId.length > 64 ||
      !input.purchaseId.trim() ||
      input.purchaseId.length > 64
    ) {
      return "Invalid purchase payment reference.";
    }
  } else {
    return "Unsupported checkout purpose.";
  }

  try {
    assertSafePaymentReturnPath(input.returnPath);
    assertSafePaymentReturnPath(input.cancelPath);
  } catch {
    return "Invalid return path.";
  }

  return null;
}

function createSimpaisaAdapter(
  config: SimpaisaValidatedConfig
): PaymentGatewayAdapter {
  const client = new SimpaisaHttpClient(config);

  return {
    provider: "SIMPAISA",
    enabled: true,

    async createCheckoutSession(
      input: CreateCheckoutSessionInput
    ): Promise<CreateCheckoutSessionResult> {
      const invalid = validateCheckoutInput(input);
      if (invalid) {
        console.error("simpaisa_adapter", "CREATE_CHECKOUT_REJECTED", {
          reason: "INVALID_REQUEST",
          purpose: input.purpose,
        });
        return { ok: false, code: "INVALID_REQUEST", message: invalid };
      }

      // Relative MAP waiting path — next/navigation redirect() + useActionState
      // hang on absolute same-origin URLs ("Starting payment…" forever).
      const waitingPath = assertSafePaymentReturnPath(input.returnPath);
      let apiHost: string | null = null;
      try {
        apiHost = new URL(config.apiBaseUrl).hostname;
      } catch {
        apiHost = null;
      }
      console.info("simpaisa_adapter", "VERIFY_START", {
        purpose: input.purpose,
        environment: config.environment,
        apiHost,
        endpoint: "/v2/wallets/transaction/verify",
      });

      try {
        // Non-OTP Verify is not final. Only 0037 is accepted-as-pending; never paid.
        // Unexpected Verify 0000 is rejected here and requires Inquire/reconciliation.
        const verified = await client.verifyWalletTransaction({
          chargeAmountMinor: input.chargeAmountMinor,
          chargeCurrency: input.chargeCurrency.trim().toUpperCase(),
          purpose: input.purpose,
          checkoutIdempotencyKey: input.checkoutIdempotencyKey,
          merchantUserKey: merchantUserKey(input),
          productReference: productReference(input),
          walletOperatorId: input.walletOperatorId!.trim(),
          customerMsisdn: input.customerMsisdn!,
        });

        console.info("simpaisa_adapter", "VERIFY_OK", {
          purpose: input.purpose,
          environment: config.environment,
          apiHost,
          pending: verified.pending,
          // response code only — never MSISDN, body, or secrets
          responseCode: verified.responseCode,
        });

        return {
          ok: true,
          provider: "SIMPAISA",
          checkoutUrl: waitingPath,
          providerPaymentRef: verified.providerTransactionId,
          chargeCurrency: SIMPAISA_CHARGE_CURRENCY,
          chargeAmountMinor: input.chargeAmountMinor,
          fxRateSnapshot: `USD:PKR:${SIMPAISA_PKR_USD_RATE}`,
          expiresAt: null,
        };
      } catch (error) {
        if (error instanceof SimpaisaHttpError) {
          console.error("simpaisa_adapter", "VERIFY_FAILED", {
            purpose: input.purpose,
            environment: config.environment,
            apiHost,
            code: error.code,
          });
          return {
            ok: false,
            code:
              error.code === "INVALID_REQUEST"
                ? "INVALID_REQUEST"
                : "UNAVAILABLE",
            message: error.message,
          };
        }
        console.error("simpaisa_adapter", "CREATE_CHECKOUT_FAILED", {
          purpose: input.purpose,
          environment: config.environment,
          apiHost,
        });
        return {
          ok: false,
          code: "UNAVAILABLE",
          message: PUBLIC_UNAVAILABLE,
        };
      }
    },

    async verifyWebhookSignature(
      input: WebhookVerificationInput
    ): Promise<WebhookVerificationResult> {
      if (typeof input.rawBody !== "string" || !input.rawBody.trim()) {
        return { ok: false, code: "INVALID_SIGNATURE" };
      }
      if (!isSimpaisaWebhookSignatureContractAvailable()) {
        return { ok: false, code: "INVALID_SIGNATURE" };
      }
      const webhookConfig = resolveSimpaisaWebhookConfig();
      if (!webhookConfig.ok) {
        return { ok: false, code: "MISCONFIGURED" };
      }
      const signature = simpaisaSignatureHeader(input.headers);
      if (
        !verifySimpaisaWebhookSignature({
          rawBody: input.rawBody,
          signatureHeader: signature,
          webhookSecret: webhookConfig.config.webhookSecret,
        })
      ) {
        return { ok: false, code: "INVALID_SIGNATURE" };
      }
      return { ok: true };
    },

    async parseWebhookEvent(
      input: WebhookVerificationInput
    ): Promise<NormalizedPaymentEvent | null> {
      const verified = await this.verifyWebhookSignature(input);
      try {
        return parseSimpaisaWebhookEvent({
          rawBody: input.rawBody,
          headers: input.headers,
          expectedConfig: config,
          signatureVerified: verified.ok,
        });
      } catch {
        console.error("simpaisa_adapter", "PARSE_WEBHOOK_FAILED");
        return null;
      }
    },

    async fetchPaymentStatus(
      input: FetchPaymentStatusInput
    ): Promise<NormalizedPaymentStatus | null> {
      try {
        const userKey = (
          input.paymentAttemptId ??
          input.localTopupId ??
          ""
        ).trim();
        const transactionId = (input.providerPaymentRef ?? "").trim();
        const result = await client.inquireTransaction({
          userKey: userKey || null,
          transactionId: transactionId || null,
        });
        return result.status;
      } catch {
        return null;
      }
    },

    async requestRefund(
      input: RequestRefundInput
    ): Promise<RequestRefundResult> {
      try {
        const result = await client.refundTransaction({
          transactionId: input.providerPaymentRef,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        return { ok: true, providerRefundRef: result.providerRefundRef };
      } catch (error) {
        if (error instanceof SimpaisaHttpError) {
          return {
            ok: false,
            code: error.code === "INVALID_REQUEST" ? "FAILED" : "FAILED",
          };
        }
        console.error("simpaisa_adapter", "REFUND_FAILED");
        return { ok: false, code: "FAILED" };
      }
    },
  };
}

/**
 * Build a Simpaisa adapter when config is valid.
 * Returns null-equivalent failure when disabled/misconfigured.
 */
export function tryCreateSimpaisaAdapter(
  env: NodeJS.ProcessEnv = process.env
):
  | { ok: true; adapter: PaymentGatewayAdapter }
  | { ok: false; code: "GATEWAY_DISABLED" | "MISCONFIGURED"; message: string } {
  const resolved = resolveSimpaisaAdapterConfig(env);
  if (!resolved.ok) {
    if (resolved.code === "GATEWAY_DISABLED") {
      return {
        ok: false,
        code: "GATEWAY_DISABLED",
        message: PUBLIC_UNAVAILABLE,
      };
    }
    logSimpaisaConfigFailure(resolved.code);
    return {
      ok: false,
      code: "MISCONFIGURED",
      message: PUBLIC_MISCONFIGURED,
    };
  }
  return { ok: true, adapter: createSimpaisaAdapter(resolved.config) };
}

/**
 * Resume the MAP waiting page for an in-flight wallet collection.
 * Does not re-initiate a Simpaisa transaction.
 */
export function resumeSimpaisaWalletCheckout(input: {
  returnPath: string;
}):
  | { ok: true; checkoutUrl: string }
  | {
      ok: false;
      code: "GATEWAY_UNAVAILABLE" | "INVALID_REQUEST" | "MISCONFIGURED";
      message: string;
    } {
  let returnPath: string;
  try {
    returnPath = assertSafePaymentReturnPath(input.returnPath);
  } catch {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Invalid return path.",
    };
  }

  const resolved = resolveSimpaisaAdapterConfig();
  if (!resolved.ok) {
    if (resolved.code === "GATEWAY_DISABLED") {
      return { ok: false, code: "GATEWAY_UNAVAILABLE", message: PUBLIC_UNAVAILABLE };
    }
    logSimpaisaConfigFailure(resolved.code);
    return { ok: false, code: "MISCONFIGURED", message: PUBLIC_MISCONFIGURED };
  }

  // Relative path — absolute same-origin URLs break useActionState redirect UX.
  console.info("simpaisa_adapter", "RESUME_WAITING_PAGE", {
    environment: resolved.config.environment,
  });
  return { ok: true, checkoutUrl: returnPath };
}
