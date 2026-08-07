import "server-only";

import type { SafepayValidatedConfig } from "@/app/lib/payments/safepayConfig";
import type { PaymentCheckoutPurpose } from "@/app/lib/payments/types";

export type SafepaySessionSetupInput = {
  chargeAmountMinor: number;
  chargeCurrency: string;
  purpose: PaymentCheckoutPurpose;
  checkoutIdempotencyKey: string;
  localTopupId?: string;
  paymentAttemptId?: string;
  purchaseId?: string;
  customerEmail?: string | null;
  metadata?: Readonly<Record<string, string>>;
};

export type SafepaySessionSetupResult = {
  trackerToken: string;
  quoteCurrency: string;
  quoteAmountMinor: number;
  baseCurrency: string | null;
  baseAmountMinor: number | null;
  conversionRate: string | null;
  expiresAt: Date | null;
};

export type SafepayPassportResult = {
  token: string;
};

export type SafepayHostedCheckoutUrlInput = {
  trackerToken: string;
  passportToken: string;
  redirectUrl: string;
  cancelUrl: string;
};

export type SafepayTrackerStatusResult = {
  state: string;
  status: "confirmed" | "pending" | "failed" | "uncertain";
};

type SafepayJson = Record<string, unknown>;

function asRecord(value: unknown): SafepayJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SafepayJson;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Thin direct HTTP client for Safepay Card Payments Hosted Checkout.
 * Secrets stay in memory only; never log request/response bodies or tokens.
 */
export class SafepayHttpClient {
  constructor(private readonly config: SafepayValidatedConfig) {}

  async createPaymentSession(
    input: SafepaySessionSetupInput
  ): Promise<SafepaySessionSetupResult> {
    if (
      !Number.isInteger(input.chargeAmountMinor) ||
      input.chargeAmountMinor <= 0
    ) {
      throw new SafepayHttpError("INVALID_REQUEST", "Invalid charge amount.");
    }
    const currency = input.chargeCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new SafepayHttpError("INVALID_REQUEST", "Invalid charge currency.");
    }

    const metadata: Record<string, string> = {
      purpose: input.purpose,
      checkout_idempotency_key: input.checkoutIdempotencyKey,
      ...(input.metadata ?? {}),
    };
    if (input.localTopupId) metadata.local_topup_id = input.localTopupId;
    if (input.paymentAttemptId) {
      metadata.payment_attempt_id = input.paymentAttemptId;
    }
    if (input.purchaseId) metadata.purchase_id = input.purchaseId;

    const body: Record<string, unknown> = {
      merchant_api_key: this.config.apiKey,
      intent: this.config.intent,
      mode: "payment",
      currency,
      amount: input.chargeAmountMinor,
      metadata,
    };

    const json = await this.requestJson("POST", "/order/payments/v3/", body);
    const data = asRecord(json.data);
    const tracker = asRecord(data?.tracker);
    const trackerToken = asString(tracker?.token);
    if (!trackerToken) {
      throw new SafepayHttpError("UNAVAILABLE", "Payment session incomplete.");
    }

    const purchaseTotals = asRecord(tracker?.purchase_totals);
    const quote = asRecord(purchaseTotals?.quote_amount);
    const base = asRecord(purchaseTotals?.base_amount);
    const conversion = asRecord(purchaseTotals?.conversion_rate);

    const quoteCurrency =
      asString(quote?.currency)?.toUpperCase() ?? currency;
    const quoteAmountMinor =
      asNumber(quote?.amount) ?? input.chargeAmountMinor;
    const baseCurrency = asString(base?.currency)?.toUpperCase() ?? null;
    const baseAmountMinor = asNumber(base?.amount);
    const rate = asNumber(conversion?.rate);

    return {
      trackerToken,
      quoteCurrency,
      quoteAmountMinor,
      baseCurrency,
      baseAmountMinor,
      conversionRate:
        rate != null && baseCurrency
          ? `${baseCurrency}:${quoteCurrency}:${rate}`
          : null,
      expiresAt: null,
    };
  }

  async createPassportToken(): Promise<SafepayPassportResult> {
    const json = await this.requestJson("POST", "/client/passport/v1/token", {});
    const token = asString(json.data);
    if (!token) {
      throw new SafepayHttpError("UNAVAILABLE", "Authentication token missing.");
    }
    return { token };
  }

  buildHostedCheckoutUrl(input: SafepayHostedCheckoutUrlInput): string {
    const params = new URLSearchParams({
      tracker: input.trackerToken,
      tbt: input.passportToken,
      environment: this.config.environment,
      source: "hosted",
      redirect_url: input.redirectUrl,
      cancel_url: input.cancelUrl,
    });
    return `${this.config.checkoutBaseUrl}?${params.toString()}`;
  }

  async fetchTrackerStatus(
    trackerToken: string
  ): Promise<SafepayTrackerStatusResult> {
    const token = trackerToken.trim();
    if (!token || token.length > 190) {
      throw new SafepayHttpError("INVALID_REQUEST", "Invalid tracker reference.");
    }

    const json = await this.requestJson(
      "GET",
      `/reporter/api/v1/payments/${encodeURIComponent(token)}`
    );
    const data = asRecord(json.data);
    const tracker = asRecord(data?.tracker);
    const state = asString(tracker?.state) ?? "UNKNOWN";

    let status: SafepayTrackerStatusResult["status"] = "uncertain";
    if (state === "TRACKER_ENDED") status = "confirmed";
    else if (
      state === "TRACKER_STARTED" ||
      state === "TRACKER_PENDING" ||
      state.includes("PENDING")
    ) {
      status = "pending";
    } else if (state.includes("FAIL") || state.includes("ERROR")) {
      status = "failed";
    }

    return { state, status };
  }

  private async requestJson(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>
  ): Promise<SafepayJson> {
    const url = `${this.config.apiBaseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.config.secretKey,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch {
      console.error("safepay_http", "NETWORK_ERROR", method, path);
      throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
    }

    if (!response.ok) {
      console.error("safepay_http", "HTTP_ERROR", method, path, response.status);
      throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      console.error("safepay_http", "INVALID_JSON", method, path);
      throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
    }

    const record = asRecord(json);
    if (!record) {
      throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
    }
    return record;
  }
}

export class SafepayHttpError extends Error {
  readonly code: "INVALID_REQUEST" | "UNAVAILABLE";

  constructor(code: "INVALID_REQUEST" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "SafepayHttpError";
    this.code = code;
  }
}
