import "server-only";

import type { PaymentGatewayAdapter } from "@/app/lib/payments/adapter";
import { parsePaymentGatewayProvider } from "@/app/lib/payments/gatewaySelect";
import { tryCreateSafepayAdapter } from "@/app/lib/payments/safepayAdapter";
import { isPaymentGatewayEnabledFlag } from "@/app/lib/payments/safepayConfig";
import { tryCreateSimpaisaAdapter } from "@/app/lib/payments/simpaisaAdapter";

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

/** Fail-closed adapter used when enable flag is on but selected provider config is invalid. */
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
 * Requires PAYMENT_GATEWAY_ENABLED exact "true" + valid selected provider config.
 * PAYMENT_GATEWAY_PROVIDER unset selects Simpaisa; SAFEPAY remains available when set.
 * Never falls back to a fake/success adapter.
 */
export function getActivePaymentAdapter(): PaymentGatewayAdapter {
  if (!isPaymentGatewayEnabledFlag(process.env.PAYMENT_GATEWAY_ENABLED)) {
    return disabledPaymentAdapter;
  }

  const selected = parsePaymentGatewayProvider(
    process.env.PAYMENT_GATEWAY_PROVIDER
  );
  if (!selected) {
    return misconfiguredPaymentAdapter;
  }

  if (selected === "SIMPAISA") {
    const created = tryCreateSimpaisaAdapter();
    if (!created.ok) {
      return created.code === "GATEWAY_DISABLED"
        ? disabledPaymentAdapter
        : misconfiguredPaymentAdapter;
    }
    return created.adapter;
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
 * True only when gateway enable flag is set and the selected adapter config is valid.
 * Customer UI remains fail-closed while env is unset (current soft-launch state).
 */
export function isPaymentGatewayConfigured(): boolean {
  if (!isPaymentGatewayEnabledFlag(process.env.PAYMENT_GATEWAY_ENABLED)) {
    return false;
  }
  const selected = parsePaymentGatewayProvider(
    process.env.PAYMENT_GATEWAY_PROVIDER
  );
  if (!selected) return false;
  if (selected === "SIMPAISA") {
    const created = tryCreateSimpaisaAdapter();
    return created.ok;
  }
  const created = tryCreateSafepayAdapter();
  return created.ok;
}
