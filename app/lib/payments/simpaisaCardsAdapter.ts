/**
 * Simpaisa Cards PaymentGatewayAdapter stub.
 * Does not touch wallet Simpaisa adapter or wallet HTTP client.
 * Feature disabled / WAITING_FOR_SIMPAISA — no HTTP, no card data, no funding.
 */
import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";
import {
  SIMPAISA_CARDS_CONTRACT_STATUS,
  SIMPAISA_CARDS_PROVIDER_CONTRACTS,
  SIMPAISA_CARDS_RAIL_ID,
  resolveSimpaisaCardsAdapterConfig,
  logSimpaisaCardsConfigFailure,
} from "@/app/lib/payments/simpaisaCardsConfig";
import { assertSafeSimpaisaCardsReturnPath } from "@/app/lib/payments/simpaisaCardsReturn";

const WAITING_MESSAGE =
  "Simpaisa Cards Hosted Page is not available yet. Waiting for provider confirmation.";

const MISCONFIGURED_MESSAGE =
  "Simpaisa Cards configuration is incomplete or disabled.";

/**
 * Fail-closed Cards adapter. createCheckoutSession always declines until
 * Hosted Page contracts leave WAITING_FOR_SIMPAISA.
 */
export function createSimpaisaCardsDisabledAdapter(): PaymentGatewayAdapter {
  return {
    provider: SIMPAISA_CARDS_RAIL_ID,
    enabled: false,

    async createCheckoutSession(input) {
      // Still validate return paths so wiring mistakes fail closed early.
      try {
        assertSafeSimpaisaCardsReturnPath(input.returnPath);
        assertSafeSimpaisaCardsReturnPath(input.cancelPath);
      } catch {
        return {
          ok: false,
          code: "INVALID_REQUEST",
          message: "Invalid return or cancel path.",
        };
      }

      void SIMPAISA_CARDS_PROVIDER_CONTRACTS.createHostedSession;
      return {
        ok: false,
        code: "GATEWAY_UNAVAILABLE",
        message: WAITING_MESSAGE,
      };
    },

    async verifyWebhookSignature() {
      void SIMPAISA_CARDS_PROVIDER_CONTRACTS.webhookAuthenticate;
      return { ok: false, code: "GATEWAY_UNAVAILABLE" };
    },

    async parseWebhookEvent() {
      void SIMPAISA_CARDS_PROVIDER_CONTRACTS.webhookParse;
      return null;
    },

    async fetchPaymentStatus() {
      void SIMPAISA_CARDS_PROVIDER_CONTRACTS.inquiry;
      return null;
    },

    async requestRefund() {
      return { ok: false, code: "GATEWAY_UNAVAILABLE" };
    },
  };
}

/**
 * Try to create a live Cards adapter. Foundation always returns null because
 * providerContractsReady is hard-false in resolveSimpaisaCardsAdapterConfig.
 * Does not register into getActivePaymentAdapter (wallet SIMPAISA unchanged).
 */
export function tryCreateSimpaisaCardsAdapter(): PaymentGatewayAdapter | null {
  const resolved = resolveSimpaisaCardsAdapterConfig();
  if (!resolved.ok) {
    if (resolved.code !== "CARDS_DISABLED") {
      logSimpaisaCardsConfigFailure(resolved.code);
    }
    return null;
  }
  // Contracts still WAITING_FOR_SIMPAISA — never return an enabled adapter.
  void resolved.config.contractStatus;
  void SIMPAISA_CARDS_CONTRACT_STATUS;
  return null;
}

export function getSimpaisaCardsAdapterOrDisabled(): PaymentGatewayAdapter {
  return tryCreateSimpaisaCardsAdapter() ?? createSimpaisaCardsDisabledAdapter();
}
