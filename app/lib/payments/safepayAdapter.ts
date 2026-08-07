import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";
import {
  logSafepayConfigFailure,
  resolveSafepayAdapterConfig,
  resolveSafepayWebhookConfig,
  type SafepayValidatedConfig,
} from "@/app/lib/payments/safepayConfig";
import { assertSafePaymentReturnPath } from "@/app/lib/payments/safepayCheckoutUrls";
import {
  SafepayHttpClient,
  SafepayHttpError,
} from "@/app/lib/payments/safepayHttp";
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

function absoluteAppUrl(relativePath: string): string {
  const base = (
    process.env.APP_BASE_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!base.startsWith("https://") && !base.startsWith("http://")) {
    throw new SafepayHttpError(
      "INVALID_REQUEST",
      "Application base URL is not configured."
    );
  }
  const path = assertSafePaymentReturnPath(relativePath);
  return `${base}${path}`;
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
  if (!/^[A-Za-z]{3}$/.test(input.chargeCurrency.trim())) {
    return "Invalid charge currency.";
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

  if (input.purpose === "WALLET_TOPUP") {
    if (!input.localTopupId.trim() || input.localTopupId.length > 64) {
      return "Invalid top-up reference.";
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

function createSafepayAdapter(
  config: SafepayValidatedConfig
): PaymentGatewayAdapter {
  const client = new SafepayHttpClient(config);

  return {
    provider: "SAFEPAY",
    enabled: true,

    async createCheckoutSession(
      input: CreateCheckoutSessionInput
    ): Promise<CreateCheckoutSessionResult> {
      const invalid = validateCheckoutInput(input);
      if (invalid) {
        return { ok: false, code: "INVALID_REQUEST", message: invalid };
      }

      try {
        const session = await client.createPaymentSession({
          chargeAmountMinor: input.chargeAmountMinor,
          chargeCurrency: input.chargeCurrency.trim().toUpperCase(),
          purpose: input.purpose,
          checkoutIdempotencyKey: input.checkoutIdempotencyKey,
          localTopupId:
            input.purpose === "WALLET_TOPUP" ? input.localTopupId : undefined,
          paymentAttemptId:
            input.purpose === "ESIM_PURCHASE"
              ? input.paymentAttemptId
              : undefined,
          purchaseId:
            input.purpose === "ESIM_PURCHASE" ? input.purchaseId : undefined,
          customerEmail:
            input.purpose === "ESIM_PURCHASE" ? input.customerEmail : undefined,
          metadata:
            input.purpose === "ESIM_PURCHASE" ? input.metadata : undefined,
        });

        const passport = await client.createPassportToken();
        const checkoutUrl = client.buildHostedCheckoutUrl({
          trackerToken: session.trackerToken,
          passportToken: passport.token,
          redirectUrl: absoluteAppUrl(input.returnPath),
          cancelUrl: absoluteAppUrl(input.cancelPath),
        });

        return {
          ok: true,
          provider: "SAFEPAY",
          checkoutUrl,
          providerPaymentRef: session.trackerToken,
          chargeCurrency: session.quoteCurrency,
          chargeAmountMinor: session.quoteAmountMinor,
          fxRateSnapshot: session.conversionRate,
          expiresAt: session.expiresAt,
        };
      } catch (error) {
        if (error instanceof SafepayHttpError) {
          return {
            ok: false,
            code:
              error.code === "INVALID_REQUEST"
                ? "INVALID_REQUEST"
                : "UNAVAILABLE",
            message: error.message,
          };
        }
        console.error("safepay_adapter", "CREATE_CHECKOUT_FAILED");
        return {
          ok: false,
          code: "UNAVAILABLE",
          message: PUBLIC_UNAVAILABLE,
        };
      }
    },

    async verifyWebhookSignature(
      // PG4 will consume headers/rawBody for signature verification.
      input: WebhookVerificationInput
    ): Promise<WebhookVerificationResult> {
      void input;
      // PG4 will implement signature verification. Fail closed for now.
      const webhook = resolveSafepayWebhookConfig();
      if (!webhook.ok) {
        logSafepayConfigFailure(webhook.code);
        return { ok: false, code: "MISCONFIGURED" };
      }
      return { ok: false, code: "GATEWAY_UNAVAILABLE" };
    },

    async parseWebhookEvent(
      input: WebhookVerificationInput
    ): Promise<NormalizedPaymentEvent | null> {
      void input;
      // No mutation path in PG3-A.
      return null;
    },

    async fetchPaymentStatus(
      input: FetchPaymentStatusInput
    ): Promise<NormalizedPaymentStatus | null> {
      try {
        const result = await client.fetchTrackerStatus(input.providerPaymentRef);
        return result.status;
      } catch {
        return null;
      }
    },

    async requestRefund(
      input: RequestRefundInput
    ): Promise<RequestRefundResult> {
      void input;
      return { ok: false, code: "UNSUPPORTED" };
    },
  };
}

/**
 * Build a Safepay adapter when config is valid.
 * Returns null when disabled/misconfigured (caller should use disabled adapter).
 */
export function tryCreateSafepayAdapter(
  env: NodeJS.ProcessEnv = process.env
):
  | { ok: true; adapter: PaymentGatewayAdapter }
  | { ok: false; code: "GATEWAY_DISABLED" | "MISCONFIGURED"; message: string } {
  const resolved = resolveSafepayAdapterConfig(env);
  if (!resolved.ok) {
    if (resolved.code === "GATEWAY_DISABLED") {
      return {
        ok: false,
        code: "GATEWAY_DISABLED",
        message: PUBLIC_UNAVAILABLE,
      };
    }
    logSafepayConfigFailure(resolved.code);
    return {
      ok: false,
      code: "MISCONFIGURED",
      message: PUBLIC_MISCONFIGURED,
    };
  }
  return { ok: true, adapter: createSafepayAdapter(resolved.config) };
}
