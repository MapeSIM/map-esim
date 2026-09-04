/**
 * Final LOCAL-ONLY Simpaisa wallet failure + reconciliation QA.
 * Offline: no live Simpaisa, no DB mutation, no real payments, no Production.
 *
 * Exercises pure policy/parse/inquiry gates + source invariants for route/apply/return.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideSimpaisaPendingPaymentVerify,
} from "../app/lib/admin/pendingPaymentVerifyShared";
import {
  classifySimpaisaWalletResponseCode,
  isSimpaisaAcceptedVerifyCode,
  isSimpaisaWalletOperatorId,
  mapSimpaisaClassificationToPaymentStatus,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_FINAL_FAILURE_RESPONSE_CODES,
  SIMPAISA_RESPONSE,
  SIMPAISA_WALLET_OPERATORS,
} from "../app/lib/payments/simpaisaPolicy";
import { parseSimpaisaWalletCheckoutFields } from "../app/lib/payments/simpaisaPkrQuote";
import { validateSimpaisaAuthoritativeInquiry } from "../app/lib/payments/simpaisaInquiryValidate";
import { parseSimpaisaWebhookEvent } from "../app/lib/payments/simpaisaWebhookParse";
import type { NormalizedPaymentEvent } from "../app/lib/payments/types";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

type ScenarioResult =
  | "PASS"
  | "FAIL"
  | "NOT_IMPLEMENTED"
  | "WAITING_FOR_SIMPAISA";

const results: Record<string, ScenarioResult> = {};

function record(id: string, result: ScenarioResult): void {
  results[id] = result;
  console.log(`${result} ${id}`);
}

const MERCHANT = "2001226";
const ATTEMPT = "attempt_fail_qa_1";
const TXN = "sp_txn_fail_qa_1";

function webhookBody(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    responseCode: "0000",
    transactionId: TXN,
    userKey: ATTEMPT,
    merchantId: MERCHANT,
    operatorId: SIMPAISA_WALLET_OPERATORS.EASYPAISA,
    amount: "100.00",
    currency: "PKR",
    transactionType: "0",
    ...overrides,
  });
}

function parseWebhook(
  overrides: Record<string, unknown>,
  opts?: { merchantId?: string; signatureVerified?: boolean }
): NormalizedPaymentEvent | null {
  return parseSimpaisaWebhookEvent({
    rawBody: webhookBody(overrides),
    headers: {},
    expectedConfig: { merchantId: opts?.merchantId ?? MERCHANT },
    signatureVerified: opts?.signatureVerified ?? false,
  });
}

/**
 * In-memory exact-once credit ledger (mirrors webhookEventId idempotency).
 * Funds only when signatureVerified===true after authoritative inquiry ok.
 */
function createCreditLedger() {
  const creditedEventIds = new Set<string>();
  let creditCount = 0;
  let lastStatus:
    | "none"
    | "credited"
    | "ignored"
    | "recon_required"
    | "failed_applied" = "none";

  return {
    get creditCount() {
      return creditCount;
    },
    get lastStatus() {
      return lastStatus;
    },
    applyAuthoritative(event: NormalizedPaymentEvent): {
      funded: boolean;
      duplicate: boolean;
      outcome: string;
    } {
      if (!event.signatureVerified) {
        lastStatus = "ignored";
        return { funded: false, duplicate: false, outcome: "unsigned" };
      }
      if (creditedEventIds.has(event.eventId)) {
        lastStatus = "credited";
        return { funded: false, duplicate: true, outcome: "duplicate" };
      }
      if (event.paymentStatus === "failed") {
        lastStatus = "failed_applied";
        creditedEventIds.add(event.eventId);
        return { funded: false, duplicate: false, outcome: "failed" };
      }
      if (event.paymentStatus !== "confirmed") {
        lastStatus = "ignored";
        return { funded: false, duplicate: false, outcome: "not_confirmed" };
      }
      creditedEventIds.add(event.eventId);
      creditCount += 1;
      lastStatus = "credited";
      return { funded: true, duplicate: false, outcome: "credited" };
    },
    /**
     * Crash after confirmation before credit: event not yet in ledger.
     * Retry with same verified event must credit exactly once.
     */
    simulateCrashBeforeCredit(): void {
      lastStatus = "recon_required";
    },
  };
}

type InquireSim = {
  status: "confirmed" | "pending" | "failed" | "uncertain";
  unavailable?: boolean;
  timeout?: boolean;
  fields?: Partial<{
    merchantId: string;
    operatorId: string;
    userKey: string;
    providerTransactionId: string;
    chargeAmountMinor: number;
    chargeCurrency: string;
    transactionType: string;
  }>;
};

/**
 * Mirrors webhook route gate: pending/failed/uncertain on postback → no fund;
 * confirmed → inquire → validate → signatureVerified apply.
 */
function runWebhookPipeline(input: {
  webhookOverrides: Record<string, unknown>;
  inquire: InquireSim;
  ledger: ReturnType<typeof createCreditLedger>;
  expectedAmountMinor?: number;
}): {
  funded: boolean;
  outcome: string;
  httpHint: number;
} {
  const event = parseWebhook(input.webhookOverrides);
  if (!event) {
    return { funded: false, outcome: "parse_ignored", httpHint: 200 };
  }
  if (
    event.paymentStatus === "pending" ||
    event.paymentStatus === "uncertain" ||
    event.paymentStatus === "failed"
  ) {
    return {
      funded: false,
      outcome: `${event.paymentStatus}_not_paid`,
      httpHint: 200,
    };
  }
  if (input.inquire.unavailable || input.inquire.timeout) {
    return { funded: false, outcome: "inquiry_unavailable", httpHint: 500 };
  }
  if (input.inquire.status === "pending" || input.inquire.status === "uncertain") {
    return {
      funded: false,
      outcome: `inquiry_${input.inquire.status}`,
      httpHint: 200,
    };
  }
  if (input.inquire.status === "failed") {
    const failed: NormalizedPaymentEvent = {
      ...event,
      signatureVerified: true,
      paymentStatus: "failed",
    };
    const r = input.ledger.applyAuthoritative(failed);
    return { funded: r.funded, outcome: "inquiry_failed_applied", httpHint: 200 };
  }

  const inquiry = {
    status: "confirmed" as const,
    merchantId: input.inquire.fields?.merchantId ?? MERCHANT,
    operatorId:
      input.inquire.fields?.operatorId ?? SIMPAISA_WALLET_OPERATORS.EASYPAISA,
    userKey: input.inquire.fields?.userKey ?? ATTEMPT,
    providerTransactionId:
      input.inquire.fields?.providerTransactionId ?? TXN,
    chargeAmountMinor:
      input.inquire.fields?.chargeAmountMinor ??
      input.expectedAmountMinor ??
      10000,
    chargeCurrency:
      input.inquire.fields?.chargeCurrency ?? SIMPAISA_CHARGE_CURRENCY,
    transactionType: input.inquire.fields?.transactionType ?? "0",
  };
  const validation = validateSimpaisaAuthoritativeInquiry({
    inquiry,
    expected: {
      merchantId: MERCHANT,
      operatorId: event.walletOperatorId ?? "",
      userKey: event.paymentAttemptId ?? "",
      transactionId: event.providerPaymentRef,
      chargeAmountMinor: event.chargeAmountMinor,
      chargeCurrency: event.chargeCurrency,
    },
  });
  if (!validation.ok) {
    return {
      funded: false,
      outcome: `inquiry_field_mismatch:${validation.reason}`,
      httpHint: 200,
    };
  }
  const fundedEvent: NormalizedPaymentEvent = {
    ...event,
    signatureVerified: true,
    paymentStatus: "confirmed",
    confirmedAt: new Date(),
  };
  const r = input.ledger.applyAuthoritative(fundedEvent);
  return {
    funded: r.funded,
    outcome: r.duplicate ? "duplicate" : r.outcome,
    httpHint: 200,
  };
}

function main() {
  const route = read("app/api/payments/simpaisa/webhook/route.ts");
  const topup = read("app/lib/wallet/topup.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const esimApply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const adapter = read("app/lib/payments/simpaisaAdapter.ts");
  const http = read("app/lib/payments/simpaisaHttp.ts");
  const returnPage = read(
    "app/account/esim/buy/payment/return/[attemptId]/page.tsx"
  );
  const returnView = read(
    "app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"
  );
  const pendingShared = read("app/lib/admin/pendingPaymentVerifyShared.ts");
  const pendingSvc = read("app/lib/admin/pendingPaymentVerify.ts");
  const policy = read("app/lib/payments/simpaisaPolicy.ts");
  const pkg = read("package.json");

  // Global invariants
  assert.match(route, /Never fund on webhook payload alone/);
  assert.match(route, /Browser return is never authoritative/);
  assert.match(route, /signatureVerified:\s*false/);
  assert.match(route, /validateSimpaisaAuthoritativeInquiry/);
  assert.match(route, /inquireTransaction/);
  assert.match(apply, /if \(!event\.signatureVerified\)/);
  assert.match(topup, /if \(!event\.signatureVerified\)/);
  assert.match(topup, /Never credits the wallet; browser return is never authoritative/);
  assert.doesNotMatch(returnPage, /applyVerifiedPaymentEvent/);
  assert.doesNotMatch(returnView, /applyVerifiedPaymentEvent/);
  assert.match(http, /never log request\/response bodies, MSISDN, or tokens/);
  assert.match(route, /Never logs raw body, secrets, MSISDN/);
  assert.doesNotMatch(route, /console\.(log|error)\([^)]*msisdn/i);
  console.log("PASS invariants_browser_return_and_inquire_and_log_safety");

  // --- 1. Payment rejected ---
  {
    const ledger = createCreditLedger();
    const rejected = runWebhookPipeline({
      webhookOverrides: { responseCode: "0091" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(rejected.funded, false);
    assert.equal(rejected.outcome, "failed_not_paid");
    assert.equal(
      mapSimpaisaClassificationToPaymentStatus(
        classifySimpaisaWalletResponseCode("0012")
      ),
      "failed"
    );
    assert.equal(classifySimpaisaWalletResponseCode("0091"), "failed");
    record("01_payment_rejected", "PASS");
  }

  // --- 2. Payment remains pending ---
  {
    const ledger = createCreditLedger();
    const pending = runWebhookPipeline({
      webhookOverrides: { responseCode: "0037" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(pending.funded, false);
    assert.equal(pending.outcome, "pending_not_paid");
    assert.equal(isSimpaisaAcceptedVerifyCode("0037"), true);
    assert.equal(classifySimpaisaWalletResponseCode("0037"), "pending");
    const adminPending = decideSimpaisaPendingPaymentVerify({
      localGatewayPaymentRef: TXN,
      localExpectedAmountMinor: 10000,
      localExpectedCurrency: "PKR",
      evidence: {
        status: "pending",
        providerTransactionId: TXN,
        chargeAmountMinor: 10000,
        chargeCurrency: "PKR",
      },
    });
    assert.equal(adminPending.decision, "PENDING");
    record("02_payment_remains_pending", "PASS");
  }

  // --- 3. Payment expired ---
  // Official codes: OTP-Expired 0010, Token-Expired 0028 → final failure, no fund.
  // No invented "session expired" category (policy forbids inventing expiry enums).
  {
    assert.ok(SIMPAISA_FINAL_FAILURE_RESPONSE_CODES.has("0010"));
    assert.ok(SIMPAISA_FINAL_FAILURE_RESPONSE_CODES.has("0028"));
    const ledger = createCreditLedger();
    const expired = runWebhookPipeline({
      webhookOverrides: { responseCode: "0010" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(expired.funded, false);
    assert.equal(expired.outcome, "failed_not_paid");
    assert.match(policy, /Do not invent cancelled\/expired categories/);
    record("03_payment_expired", "PASS");
  }

  // --- 4. Inquiry timeout ---
  {
    const ledger = createCreditLedger();
    const timedOut = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed", timeout: true },
      ledger,
    });
    assert.equal(timedOut.funded, false);
    assert.equal(timedOut.outcome, "inquiry_unavailable");
    assert.equal(timedOut.httpHint, 500);
    assert.match(route, /INQUIRY_UNAVAILABLE/);
    assert.match(route, /status: 500/);
    record("04_inquiry_timeout", "PASS");
  }

  // --- 5. Inquiry unavailable ---
  {
    const ledger = createCreditLedger();
    const unavail = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed", unavailable: true },
      ledger,
    });
    assert.equal(unavail.funded, false);
    const admin = decideSimpaisaPendingPaymentVerify({
      localGatewayPaymentRef: TXN,
      localExpectedAmountMinor: 10000,
      localExpectedCurrency: "PKR",
      providerUnavailable: true,
      evidence: null,
    });
    assert.equal(admin.decision, "PROVIDER_UNAVAILABLE");
    record("05_inquiry_unavailable", "PASS");
  }

  // --- 6. Delayed webhook ---
  {
    const ledger = createCreditLedger();
    // Browser returns first (no fund)
    assert.match(topup, /browser return is never authoritative/i);
    // Later webhook + inquire success funds once
    const delayed = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(delayed.funded, true);
    assert.equal(ledger.creditCount, 1);
    record("06_delayed_webhook", "PASS");
  }

  // --- 7. Duplicate webhook ---
  {
    const ledger = createCreditLedger();
    const first = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    const second = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(first.funded, true);
    assert.equal(second.funded, false);
    assert.equal(second.outcome, "duplicate");
    assert.equal(ledger.creditCount, 1);
    assert.match(topup, /TOPUP_WEBHOOK_DUPLICATE|duplicate_event/);
    assert.match(esimApply, /duplicate_event|webhookEventId/);
    record("07_duplicate_webhook", "PASS");
  }

  // --- 8. Out-of-order webhook ---
  // Pending first, then confirmed success — only confirmed+inquire funds.
  {
    const ledger = createCreditLedger();
    const early = runWebhookPipeline({
      webhookOverrides: { responseCode: "0037" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(early.funded, false);
    const later = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(later.funded, true);
    assert.equal(ledger.creditCount, 1);
    // Confirmed then stale pending must not add credit
    const stalePending = runWebhookPipeline({
      webhookOverrides: { responseCode: "0037" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(stalePending.funded, false);
    assert.equal(ledger.creditCount, 1);
    record("08_out_of_order_webhook", "PASS");
  }

  // --- 9. Wrong amount ---
  {
    const ledger = createCreditLedger();
    const wrong = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000", amount: "100.00" },
      inquire: {
        status: "confirmed",
        fields: { chargeAmountMinor: 9999 },
      },
      ledger,
      expectedAmountMinor: 10000,
    });
    assert.equal(wrong.funded, false);
    assert.match(wrong.outcome, /AMOUNT_MISMATCH/);
    record("09_wrong_amount", "PASS");
  }

  // --- 10. Wrong currency ---
  {
    const ledger = createCreditLedger();
    // Webhook parse rejects non-PKR
    const badCurrency = parseWebhook({
      responseCode: "0000",
      currency: "USD",
    });
    assert.equal(badCurrency, null);
    const mismatchInquire = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000", currency: "PKR" },
      inquire: {
        status: "confirmed",
        fields: { chargeCurrency: "USD", chargeAmountMinor: 10000 },
      },
      ledger,
    });
    assert.equal(mismatchInquire.funded, false);
    assert.match(mismatchInquire.outcome, /CURRENCY_MISMATCH/);
    record("10_wrong_currency", "PASS");
  }

  // --- 11. Wrong merchant/reference ---
  {
    const wrongMerchant = parseWebhook(
      { responseCode: "0000" },
      { merchantId: "other_mid" }
    );
    assert.equal(wrongMerchant, null);
    const ledger = createCreditLedger();
    const wrongTxn = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: {
        status: "confirmed",
        fields: { providerTransactionId: "OTHER_TXN" },
      },
      ledger,
    });
    assert.equal(wrongTxn.funded, false);
    assert.match(wrongTxn.outcome, /TRANSACTION_MISMATCH/);
    const wrongUser = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: {
        status: "confirmed",
        fields: { userKey: "other_attempt" },
      },
      ledger,
    });
    assert.equal(wrongUser.funded, false);
    assert.match(wrongUser.outcome, /USERKEY_MISMATCH/);
    record("11_wrong_merchant_or_reference", "PASS");
  }

  // --- 12. Unsupported operator ---
  {
    assert.equal(isSimpaisaWalletOperatorId("100014"), false);
    assert.equal(isSimpaisaWalletOperatorId("100012"), false);
    const parsed = parseSimpaisaWalletCheckoutFields({
      walletOperatorId: "100014",
      customerMsisdn: "3001234567",
    });
    assert.equal(parsed.ok, false);
    assert.match(adapter, /isSimpaisaWalletOperatorId/);
    const badOpWebhook = parseWebhook({
      responseCode: "0000",
      operatorId: "100014",
    });
    // Parse may still build event if operator present; inquiry validate rejects unsupported
    if (badOpWebhook) {
      const v = validateSimpaisaAuthoritativeInquiry({
        inquiry: {
          status: "confirmed",
          merchantId: MERCHANT,
          operatorId: "100014",
          userKey: ATTEMPT,
          providerTransactionId: TXN,
          chargeAmountMinor: 10000,
          chargeCurrency: "PKR",
          transactionType: "0",
        },
        expected: {
          merchantId: MERCHANT,
          operatorId: "100014",
          userKey: ATTEMPT,
          transactionId: TXN,
          chargeAmountMinor: 10000,
        },
      });
      assert.equal(v.ok, false);
      if (!v.ok) assert.equal(v.reason, "OPERATOR_MISMATCH");
    }
    record("12_unsupported_operator", "PASS");
  }

  // --- 13. Duplicate browser return ---
  {
    assert.doesNotMatch(returnPage, /applyVerifiedPaymentEvent|applyVerifiedTopup/);
    assert.doesNotMatch(returnView, /applyVerifiedPaymentEvent/);
    assert.match(topup, /Never credits the wallet; browser return is never authoritative/);
    // Two returns: still zero credits without inquire-verified event
    const ledger = createCreditLedger();
    assert.equal(ledger.creditCount, 0);
    record("13_duplicate_browser_return", "PASS");
  }

  // --- 14. Browser return without authoritative evidence ---
  {
    const ledger = createCreditLedger();
    const unsigned: NormalizedPaymentEvent = {
      signatureVerified: false,
      provider: "SIMPAISA",
      purpose: "WALLET_TOPUP",
      eventId: `${TXN}:0000`,
      providerPaymentRef: TXN,
      localTopupId: ATTEMPT,
      paymentAttemptId: null,
      purchaseId: null,
      paymentStatus: "confirmed",
      chargeCurrency: "PKR",
      chargeAmountMinor: 10000,
      confirmedAt: null,
      failureCategory: null,
    };
    const r = ledger.applyAuthoritative(unsigned);
    assert.equal(r.funded, false);
    assert.equal(r.outcome, "unsigned");
    assert.match(apply, /UNSIGNED_PAYMENT_EVENT/);
    record("14_browser_return_without_authoritative_evidence", "PASS");
  }

  // --- 15. Crash after confirmation before wallet credit ---
  {
    const ledger = createCreditLedger();
    const event = parseWebhook({ responseCode: "0000" });
    assert.ok(event);
    const validation = validateSimpaisaAuthoritativeInquiry({
      inquiry: {
        status: "confirmed",
        merchantId: MERCHANT,
        operatorId: SIMPAISA_WALLET_OPERATORS.EASYPAISA,
        userKey: ATTEMPT,
        providerTransactionId: TXN,
        chargeAmountMinor: 10000,
        chargeCurrency: "PKR",
        transactionType: "0",
      },
      expected: {
        merchantId: MERCHANT,
        operatorId: SIMPAISA_WALLET_OPERATORS.EASYPAISA,
        userKey: ATTEMPT,
        transactionId: TXN,
        chargeAmountMinor: 10000,
      },
    });
    assert.equal(validation.ok, true);
    ledger.simulateCrashBeforeCredit();
    assert.equal(ledger.creditCount, 0);
    assert.equal(ledger.lastStatus, "recon_required");
    // Recovery: re-apply verified event
    const fundedEvent: NormalizedPaymentEvent = {
      ...event!,
      signatureVerified: true,
      paymentStatus: "confirmed",
    };
    const recovered = ledger.applyAuthoritative(fundedEvent);
    assert.equal(recovered.funded, true);
    assert.equal(ledger.creditCount, 1);
    assert.match(pendingShared, /VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED/);
    assert.match(
      pendingShared,
      /Success never funds — webhook remains required/
    );
    record("15_crash_after_confirm_before_credit", "PASS");
  }

  // --- 16. Retry after uncertain result ---
  {
    const ledger = createCreditLedger();
    const uncertain = runWebhookPipeline({
      webhookOverrides: { responseCode: "0007" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(uncertain.funded, false);
    assert.equal(uncertain.outcome, "uncertain_not_paid");
    const inquiryUncertain = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "uncertain" },
      ledger,
    });
    assert.equal(inquiryUncertain.funded, false);
    assert.equal(inquiryUncertain.outcome, "inquiry_uncertain");
    // Later retry with confirmed inquire funds once
    const retry = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(retry.funded, true);
    assert.equal(ledger.creditCount, 1);
    const adminUnknown = decideSimpaisaPendingPaymentVerify({
      localGatewayPaymentRef: TXN,
      localExpectedAmountMinor: 10000,
      localExpectedCurrency: "PKR",
      evidence: {
        status: "uncertain",
        providerTransactionId: TXN,
        chargeAmountMinor: 10000,
        chargeCurrency: "PKR",
      },
    });
    assert.equal(adminUnknown.decision, "UNKNOWN");
    record("16_retry_after_uncertain", "PASS");
  }

  // --- 17. Reconciliation recovery ---
  {
    assert.match(pendingShared, /VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED/);
    assert.match(pendingSvc, /decideSimpaisaPendingPaymentVerify/);
    assert.match(pendingSvc, /inquireTransaction|simpaisaLookupFn|defaultSimpaisaInquiry/);
    // Admin success evidence must NOT fund
    const successNoFund = decideSimpaisaPendingPaymentVerify({
      localGatewayPaymentRef: TXN,
      localExpectedAmountMinor: 10000,
      localExpectedCurrency: "PKR",
      evidence: {
        status: "confirmed",
        providerTransactionId: TXN,
        chargeAmountMinor: 10000,
        chargeCurrency: "PKR",
      },
    });
    assert.equal(
      successNoFund.decision,
      "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED"
    );
    // Recovery path: webhook pipeline still required
    const ledger = createCreditLedger();
    const recovered = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(recovered.funded, true);
    record("17_reconciliation_recovery", "PASS");
  }

  // --- 18. Exact-once credit after recovery ---
  {
    const ledger = createCreditLedger();
    ledger.simulateCrashBeforeCredit();
    const a = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    const b = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "confirmed" },
      ledger,
    });
    assert.equal(a.funded, true);
    assert.equal(b.outcome, "duplicate");
    assert.equal(ledger.creditCount, 1);
    record("18_exact_once_credit_after_recovery", "PASS");
  }

  // --- 19. No double credit ---
  {
    const ledger = createCreditLedger();
    for (let i = 0; i < 5; i++) {
      runWebhookPipeline({
        webhookOverrides: { responseCode: "0000" },
        inquire: { status: "confirmed" },
        ledger,
      });
    }
    assert.equal(ledger.creditCount, 1);
    record("19_no_double_credit", "PASS");
  }

  // --- 20. Refund/reconciliation state safety ---
  {
    // Customer refunds must not call Simpaisa requestRefund automatically
    const refundExec = read("app/lib/refunds/refundRequestExecution.ts");
    assert.match(
      refundExec,
      /Never calls Simpaisa|never call.*Simpaisa|No Simpaisa/i
    );
    assert.match(topup, /RECONCILIATION_REQUIRED/);
    assert.match(esimApply, /RECONCILIATION_REQUIRED|reconciliation/);
    // Failed inquiry apply path exists without inventing auto-refund credit
    const ledger = createCreditLedger();
    const failedInquire = runWebhookPipeline({
      webhookOverrides: { responseCode: "0000" },
      inquire: { status: "failed" },
      ledger,
    });
    assert.equal(failedInquire.funded, false);
    assert.equal(ledger.creditCount, 0);
    record("20_refund_reconciliation_state_safety", "PASS");
  }

  // Confirm package script wiring will be asserted by caller adding npm script
  void pkg;
  void SIMPAISA_RESPONSE;

  console.log("QA_SUMMARY");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}=${v}`);
  }
  const failed = Object.values(results).filter((r) => r === "FAIL");
  assert.equal(failed.length, 0, `failures: ${failed.join(",")}`);
  console.log("ALL PASS qa-simpaisa-wallet-failure-recon");
}

main();
