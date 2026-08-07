import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";
import { tryCreateSafepayAdapter } from "@/app/lib/payments/safepayAdapter";
import { isPaymentGatewayEnabledFlag } from "@/app/lib/payments/safepayConfig";

const UNAVAILABLE =
  "Payment gateway is not available yet. Please try again after payment provider setup is complete.";

const MISCONFIGURED =
  "Payment gateway configuration is incomplete. Please try again later.";

/**
 * Safe unconfigured adapter.
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

/** Fail-closed adapter used when enable flag is on but Safepay config is invalid. */
export const misconfiguredPaymentAdapter: PaymentGatewayAdapter = {
  provider: "UNCONFIGURED",
  enabled: false,

  async createCheckoutSession() {
    return {
      ok: false,
      code: "MISCONFIGURED",
      message: MISCONFIGURED,
    };
  },

  async verifyWebhookSignature() {
    return { ok: false, code: "MISCONFIGURED" };
  },

  async parseWebhookEvent() {
    return null;
  },

  async fetchPaymentStatus() {
    return null;
  },

  async requestRefund() {
    return { ok: false, code: "MISCONFIGURED" };
  },
};

/**
 * Active payment adapter.
 * Requires PAYMENT_GATEWAY_ENABLED exact "true" + valid Safepay sandbox config.
 * Never falls back to a fake/success adapter.
 */
export function getActivePaymentAdapter(): PaymentGatewayAdapter {
  if (!isPaymentGatewayEnabledFlag(process.env.PAYMENT_GATEWAY_ENABLED)) {
    return disabledPaymentAdapter;
  }

  const created = tryCreateSafepayAdapter();
  if (!created.ok) {
    return created.code === "GATEWAY_DISABLED"
      ? disabledPaymentAdapter
      : misconfiguredPaymentAdapter;
  }
  return created.adapter;
}

/**
 * True only when gateway enable flag is set and Safepay adapter config is valid.
 * Customer UI remains fail-closed while env is unset (current soft-launch state).
 */
export function isPaymentGatewayConfigured(): boolean {
  if (!isPaymentGatewayEnabledFlag(process.env.PAYMENT_GATEWAY_ENABLED)) {
    return false;
  }
  const created = tryCreateSafepayAdapter();
  return created.ok;
}
