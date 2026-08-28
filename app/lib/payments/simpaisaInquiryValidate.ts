/**
 * Pure Simpaisa authoritative inquiry validation (no I/O).
 * Webhook postbacks are triggers only — funding requires Inquire 0000 + field match.
 */

import {
  isSimpaisaWalletOperatorId,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_WALLET_TRANSACTION_TYPE,
  type SimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";

export type SimpaisaInquiryFields = {
  status: "confirmed" | "pending" | "failed" | "uncertain";
  merchantId: string | null;
  operatorId: string | null;
  userKey: string | null;
  providerTransactionId: string | null;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  transactionType: string | null;
};

export type SimpaisaInquiryValidationFailure =
  | "INQUIRY_NOT_CONFIRMED"
  | "MERCHANT_MISMATCH"
  | "OPERATOR_MISMATCH"
  | "OPERATOR_MISSING"
  | "USERKEY_MISMATCH"
  | "USERKEY_MISSING"
  | "TRANSACTION_MISMATCH"
  | "TRANSACTION_MISSING"
  | "AMOUNT_MISMATCH"
  | "AMOUNT_MISSING"
  | "CURRENCY_MISMATCH"
  | "TRANSACTION_TYPE_MISMATCH";

export type SimpaisaInquiryExpected = {
  merchantId: string;
  operatorId: string;
  userKey: string;
  transactionId: string | null;
  chargeAmountMinor: number;
  chargeCurrency?: string;
};

/**
 * Confirm Inquire status=0000 (mapped to confirmed) and cross-check provider fields
 * against the webhook trigger / local attempt expectations.
 */
export function validateSimpaisaAuthoritativeInquiry(input: {
  inquiry: SimpaisaInquiryFields;
  expected: SimpaisaInquiryExpected;
}):
  | { ok: true }
  | { ok: false; reason: SimpaisaInquiryValidationFailure } {
  if (input.inquiry.status !== "confirmed") {
    return { ok: false, reason: "INQUIRY_NOT_CONFIRMED" };
  }

  const expectedMerchant = input.expected.merchantId.trim();
  const inquiryMerchant = (input.inquiry.merchantId ?? "").trim();
  if (!inquiryMerchant || inquiryMerchant !== expectedMerchant) {
    return { ok: false, reason: "MERCHANT_MISMATCH" };
  }

  const expectedOperator = input.expected.operatorId.trim();
  const inquiryOperator = (input.inquiry.operatorId ?? "").trim();
  if (!inquiryOperator) {
    return { ok: false, reason: "OPERATOR_MISSING" };
  }
  if (!isSimpaisaWalletOperatorId(inquiryOperator)) {
    return { ok: false, reason: "OPERATOR_MISMATCH" };
  }
  if (inquiryOperator !== expectedOperator) {
    return { ok: false, reason: "OPERATOR_MISMATCH" };
  }

  const expectedUserKey = input.expected.userKey.trim();
  const inquiryUserKey = (input.inquiry.userKey ?? "").trim();
  if (!inquiryUserKey) {
    return { ok: false, reason: "USERKEY_MISSING" };
  }
  if (inquiryUserKey !== expectedUserKey) {
    return { ok: false, reason: "USERKEY_MISMATCH" };
  }

  const expectedTxn = (input.expected.transactionId ?? "").trim();
  const inquiryTxn = (input.inquiry.providerTransactionId ?? "").trim();
  if (expectedTxn) {
    if (!inquiryTxn) {
      return { ok: false, reason: "TRANSACTION_MISSING" };
    }
    if (inquiryTxn !== expectedTxn) {
      return { ok: false, reason: "TRANSACTION_MISMATCH" };
    }
  }

  if (
    input.inquiry.chargeAmountMinor == null ||
    !Number.isInteger(input.inquiry.chargeAmountMinor) ||
    input.inquiry.chargeAmountMinor <= 0
  ) {
    return { ok: false, reason: "AMOUNT_MISSING" };
  }
  if (input.inquiry.chargeAmountMinor !== input.expected.chargeAmountMinor) {
    return { ok: false, reason: "AMOUNT_MISMATCH" };
  }

  const expectedCurrency = (
    input.expected.chargeCurrency ?? SIMPAISA_CHARGE_CURRENCY
  )
    .trim()
    .toUpperCase();
  const inquiryCurrency = (input.inquiry.chargeCurrency ?? SIMPAISA_CHARGE_CURRENCY)
    .trim()
    .toUpperCase();
  if (inquiryCurrency !== expectedCurrency) {
    return { ok: false, reason: "CURRENCY_MISMATCH" };
  }

  const inquiryType = (input.inquiry.transactionType ?? "").trim();
  if (
    inquiryType &&
    inquiryType !== SIMPAISA_WALLET_TRANSACTION_TYPE
  ) {
    return { ok: false, reason: "TRANSACTION_TYPE_MISMATCH" };
  }

  void (expectedOperator as SimpaisaWalletOperatorId);
  return { ok: true };
}
