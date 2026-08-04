import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";

const UNAVAILABLE =
  "Payment gateway is not available yet. Please try again after payment provider setup is complete.";

/**
 * Safe unconfigured adapter for Phase 6A.
 * Never invents FX/PKR quotes, never credits wallets, never calls external gateways.
 */
export const disabledPaymentAdapter: PaymentGatewayAdapter = {
  provider: "UNCONFIGURED",
  enabled: false,

  async createCheckoutSession() {
    return {
      ok: false,
      code: "GATEWAY_UNAVAILABLE",
      message: UNAVAILABLE,
    };
  },

  async verifyWebhookSignature() {
    return { ok: false, code: "GATEWAY_UNAVAILABLE" };
  },

  async parseWebhookEvent() {
    return null;
  },

  async fetchPaymentStatus() {
    return null;
  },

  async requestRefund() {
    return { ok: false, code: "GATEWAY_UNAVAILABLE" };
  },
};

/** Active adapter for this phase — always the disabled/unconfigured adapter. */
export function getActivePaymentAdapter(): PaymentGatewayAdapter {
  return disabledPaymentAdapter;
}

export function isPaymentGatewayConfigured(): boolean {
  return false;
}
