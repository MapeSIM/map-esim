import "server-only";

import type { SimpaisaValidatedConfig } from "@/app/lib/payments/simpaisaConfig";
import {
  classifySimpaisaWalletResponseCode,
  isSimpaisaAcceptedVerifyCode,
  isSimpaisaPendingCode,
  isSimpaisaWalletOperatorId,
  mapSimpaisaClassificationToPaymentStatus,
  normalizeSimpaisaResponseCode,
  SIMPAISA_API_HEADER_MODE,
  SIMPAISA_API_HEADER_REGION,
  SIMPAISA_API_HEADER_VERSION,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_INQUIRY_PATH,
  SIMPAISA_REFUND_PATH,
  SIMPAISA_VERIFY_PATH,
  SIMPAISA_WALLET_TRANSACTION_TYPE,
  SIMPAISA_WEBHOOK_PATH,
  normalizeSimpaisaMsisdn,
  simpaisaMajorAmountFromMinor,
  simpaisaMinorAmountFromMajor,
  type SimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";
import type { PaymentCheckoutPurpose } from "@/app/lib/payments/types";

export type SimpaisaVerifyInput = {
  chargeAmountMinor: number;
  chargeCurrency: string;
  purpose: PaymentCheckoutPurpose;
  checkoutIdempotencyKey: string;
  /** MAP payment/order reference — sent as userKey (not an API secret). */
  merchantUserKey: string;
  productReference: string;
  walletOperatorId: string;
  customerMsisdn: string;
};

export type SimpaisaVerifyResult = {
  merchantUserKey: string;
  providerTransactionId: string;
  responseCode: string;
  pending: boolean;
};

export type SimpaisaInquiryResult = {
  responseCode: string;
  status: "confirmed" | "pending" | "failed" | "uncertain";
  providerTransactionId: string | null;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  merchantId: string | null;
  operatorId: string | null;
  userKey: string | null;
  transactionType: string | null;
};

export type SimpaisaRefundResult = {
  providerRefundRef: string | null;
};

type SimpaisaJson = Record<string, unknown>;

const HTTP_RETRY_DELAYS_MS = [250, 750, 1500] as const;
const HTTP_MAX_ATTEMPTS = HTTP_RETRY_DELAYS_MS.length + 1;

function asRecord(value: unknown): SimpaisaJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SimpaisaJson;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).trim() || null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstString(record: SimpaisaJson, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

function nestedData(json: SimpaisaJson): SimpaisaJson {
  return asRecord(json.data) ?? json;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryHttpStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

/**
 * Thin direct HTTP client for Simpaisa PK wallet collection (v3 contract).
 * Secrets stay in memory only; never log request/response bodies, MSISDN, or tokens.
 * Non-OTP Verify accepts only 0037 Transaction-Pending — never a paid signal.
 * Unexpected Verify 0000 is not authoritative payment success.
 */
export class SimpaisaHttpClient {
  constructor(private readonly config: SimpaisaValidatedConfig) {}

  webhookCallbackPath(): string {
    return SIMPAISA_WEBHOOK_PATH;
  }

  async verifyWalletTransaction(
    input: SimpaisaVerifyInput
  ): Promise<SimpaisaVerifyResult> {
    const currency = input.chargeCurrency.trim().toUpperCase();
    if (currency !== SIMPAISA_CHARGE_CURRENCY) {
      throw new SimpaisaHttpError(
        "INVALID_REQUEST",
        "Simpaisa wallet collection requires PKR."
      );
    }
    const amount = simpaisaMajorAmountFromMinor(input.chargeAmountMinor);
    if (!amount) {
      throw new SimpaisaHttpError("INVALID_REQUEST", "Invalid charge amount.");
    }
    if (!isSimpaisaWalletOperatorId(input.walletOperatorId)) {
      throw new SimpaisaHttpError(
        "INVALID_REQUEST",
        "Unsupported wallet operator."
      );
    }
    const msisdn = normalizeSimpaisaMsisdn(input.customerMsisdn);
    if (!msisdn) {
      throw new SimpaisaHttpError("INVALID_REQUEST", "Invalid mobile number.");
    }
    const merchantUserKey = input.merchantUserKey.trim();
    if (!merchantUserKey || merchantUserKey.length > 64) {
      throw new SimpaisaHttpError(
        "INVALID_REQUEST",
        "Invalid payment reference."
      );
    }
    const productReference = input.productReference.trim();
    if (!productReference || productReference.length > 64) {
      throw new SimpaisaHttpError(
        "INVALID_REQUEST",
        "Invalid product reference."
      );
    }
    const requestId = input.checkoutIdempotencyKey.trim();
    if (!requestId || requestId.length > 128) {
      throw new SimpaisaHttpError("INVALID_REQUEST", "Invalid checkout key.");
    }

    const operatorId: SimpaisaWalletOperatorId = input.walletOperatorId;
    const json = await this.requestJson(
      "POST",
      SIMPAISA_VERIFY_PATH,
      {
        merchantId: this.config.merchantId,
        operatorId,
        userKey: merchantUserKey,
        msisdn,
        transactionType: SIMPAISA_WALLET_TRANSACTION_TYPE,
        amount,
        productReference,
      },
      {
        operatorID: operatorId,
        "Request-Id": requestId,
        mode: SIMPAISA_API_HEADER_MODE,
        region: SIMPAISA_API_HEADER_REGION,
        version: SIMPAISA_API_HEADER_VERSION,
      }
    );

    const data = nestedData(json);
    const responseCode = normalizeSimpaisaResponseCode(
      firstString(data, ["responseCode", "response_code", "status"]) ??
        firstString(json, ["responseCode", "response_code", "status"])
    );
    if (!isSimpaisaAcceptedVerifyCode(responseCode)) {
      // Non-OTP Verify must return 0037. Unexpected 0000/other is never treated as paid.
      throw new SimpaisaHttpError(
        "UNAVAILABLE",
        "Payment provider did not accept the wallet request as pending."
      );
    }

    const providerTransactionId =
      firstString(data, ["transactionId", "transaction_id"]) ??
      firstString(json, ["transactionId", "transaction_id"]) ??
      merchantUserKey;

    return {
      merchantUserKey,
      providerTransactionId,
      responseCode,
      pending: isSimpaisaPendingCode(responseCode),
    };
  }

  async inquireTransaction(input: {
    userKey?: string | null;
    transactionId?: string | null;
  }): Promise<SimpaisaInquiryResult> {
    const userKey = (input.userKey ?? "").trim();
    const transactionId = (input.transactionId ?? "").trim();
    if (
      (!userKey && !transactionId) ||
      userKey.length > 64 ||
      transactionId.length > 190
    ) {
      throw new SimpaisaHttpError(
        "INVALID_REQUEST",
        "Invalid payment reference."
      );
    }

    const body: Record<string, unknown> = {
      merchantId: this.config.merchantId,
    };
    if (userKey) body.userKey = userKey;
    if (transactionId) body.transactionId = transactionId;

    const json = await this.requestJson(
      "POST",
      SIMPAISA_INQUIRY_PATH,
      body,
      {
        region: SIMPAISA_API_HEADER_REGION,
      }
    );
    const data = nestedData(json);
    const responseCode = normalizeSimpaisaResponseCode(
      firstString(data, ["responseCode", "response_code", "status"]) ??
        firstString(json, ["responseCode", "response_code", "status"])
    );
    if (!responseCode) {
      throw new SimpaisaHttpError("UNAVAILABLE", "Payment provider unavailable.");
    }

    const classification = classifySimpaisaWalletResponseCode(responseCode);
    const status: SimpaisaInquiryResult["status"] = classification
      ? mapSimpaisaClassificationToPaymentStatus(classification)
      : "uncertain";

    const amountRaw =
      data.amount ?? data.transactionAmount ?? json.amount ?? json.transactionAmount;
    const currency =
      firstString(data, ["currency"]) ?? firstString(json, ["currency"]);

    const merchantId =
      firstString(data, ["merchantId", "merchant_id"]) ??
      firstString(json, ["merchantId", "merchant_id"]);
    const operatorId =
      firstString(data, ["operatorId", "operator_id", "operatorID"]) ??
      firstString(json, ["operatorId", "operator_id", "operatorID"]);
    const inquiryUserKey =
      firstString(data, ["userKey", "user_key"]) ??
      firstString(json, ["userKey", "user_key"]) ??
      (userKey || null);
    const transactionType =
      firstString(data, ["transactionType", "transaction_type"]) ??
      firstString(json, ["transactionType", "transaction_type"]);

    return {
      responseCode,
      status,
      providerTransactionId:
        firstString(data, ["transactionId", "transaction_id"]) ??
        firstString(json, ["transactionId", "transaction_id"]) ??
        (transactionId || null),
      chargeAmountMinor: simpaisaMinorAmountFromMajor(
        typeof amountRaw === "number" || typeof amountRaw === "string"
          ? amountRaw
          : null
      ),
      chargeCurrency: currency ? currency.toUpperCase() : SIMPAISA_CHARGE_CURRENCY,
      merchantId,
      operatorId,
      userKey: inquiryUserKey,
      transactionType,
    };
  }

  async refundTransaction(input: {
    transactionId: string;
    amountMinor: number;
    currency: string;
  }): Promise<SimpaisaRefundResult> {
    const ref = input.transactionId.trim();
    const currency = input.currency.trim().toUpperCase();
    const amount = simpaisaMajorAmountFromMinor(input.amountMinor);
    if (!ref || ref.length > 190 || !amount || currency !== SIMPAISA_CHARGE_CURRENCY) {
      throw new SimpaisaHttpError("INVALID_REQUEST", "Invalid refund request.");
    }

    const json = await this.requestJson("POST", SIMPAISA_REFUND_PATH, {
      merchantId: this.config.merchantId,
      transactionId: ref,
      amount,
      currency,
    });
    const data = nestedData(json);
    const responseCode = normalizeSimpaisaResponseCode(
      firstString(data, ["responseCode", "response_code", "status"]) ??
        firstString(json, ["responseCode", "response_code", "status"])
    );
    if (!responseCode || responseCode !== "0000") {
      throw new SimpaisaHttpError("UNAVAILABLE", "Refund was not accepted.");
    }

    return {
      providerRefundRef:
        firstString(data, ["refundId", "refund_id", "transactionId"]) ??
        firstString(json, ["refundId", "refund_id", "transactionId"]),
    };
  }

  private async requestJson(
    method: "POST",
    path: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {}
  ): Promise<SimpaisaJson> {
    const url = `${this.config.apiBaseUrl}${path}`;
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt < HTTP_MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...extraHeaders,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      } catch {
        if (attempt < HTTP_MAX_ATTEMPTS - 1) {
          await sleep(HTTP_RETRY_DELAYS_MS[attempt] ?? 1500);
          continue;
        }
        console.error("simpaisa_http", "NETWORK_ERROR", method, path);
        throw new SimpaisaHttpError(
          "UNAVAILABLE",
          "Payment provider unavailable."
        );
      }

      lastStatus = response.status;
      if (shouldRetryHttpStatus(response.status) && attempt < HTTP_MAX_ATTEMPTS - 1) {
        await sleep(HTTP_RETRY_DELAYS_MS[attempt] ?? 1500);
        continue;
      }

      if (!response.ok) {
        console.error(
          "simpaisa_http",
          "HTTP_ERROR",
          method,
          path,
          response.status
        );
        throw new SimpaisaHttpError(
          "UNAVAILABLE",
          "Payment provider unavailable."
        );
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        console.error("simpaisa_http", "INVALID_JSON", method, path);
        throw new SimpaisaHttpError(
          "UNAVAILABLE",
          "Payment provider unavailable."
        );
      }

      const record = asRecord(json);
      if (!record) {
        throw new SimpaisaHttpError(
          "UNAVAILABLE",
          "Payment provider unavailable."
        );
      }
      return record;
    }

    console.error(
      "simpaisa_http",
      "HTTP_ERROR",
      method,
      path,
      lastStatus ?? "unknown"
    );
    throw new SimpaisaHttpError("UNAVAILABLE", "Payment provider unavailable.");
  }
}

export class SimpaisaHttpError extends Error {
  readonly code: "INVALID_REQUEST" | "UNAVAILABLE";

  constructor(code: "INVALID_REQUEST" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "SimpaisaHttpError";
    this.code = code;
  }
}
