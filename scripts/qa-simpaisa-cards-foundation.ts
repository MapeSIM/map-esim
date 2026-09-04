/**
 * Offline QA: Simpaisa Cards V1 foundation (provider-contract-independent).
 * No live Simpaisa, no DB mutation, no PAN/CVV, no wallet HTTP.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIMPAISA_CARDS_ATTEMPT_STATUSES,
  SIMPAISA_CARDS_BROWSER_RETURN_MAY_FUND,
  canFundFromSimpaisaCardsLifecycle,
  canTransitionSimpaisaCardsAttempt,
} from "../app/lib/payments/simpaisaCardsLifecycle";
import {
  SIMPAISA_CARDS_CONTRACT_STATUS,
  SIMPAISA_CARDS_ENV_NAMES,
  SIMPAISA_CARDS_PROVIDER_CONTRACTS,
  SIMPAISA_CARDS_RAIL_ID,
  isSimpaisaCardsEnabledFlag,
  parseSimpaisaCardsEnvironment,
  validateSimpaisaCardsAdapterConfig,
  validateSimpaisaCardsWebhookConfig,
} from "../app/lib/payments/simpaisaCardsPolicy";
import {
  assertSafeSimpaisaCardsReturnPath,
  esimPurchasePaymentReturnPath,
} from "../app/lib/payments/simpaisaCardsReturn";
import {
  buildSimpaisaCardsVerifiedEvidence,
  rejectBrowserReturnAsCardsEvidence,
  toNormalizedPaymentEventForApply,
} from "../app/lib/payments/simpaisaCardsEvidence";
import {
  applySimpaisaCardsBrowserReturn,
  applySimpaisaCardsInquiryRecovery,
  applySimpaisaCardsVerifiedCallback,
  createSimpaisaCardsAttemptRecord,
  markSimpaisaCardsCustomerActionRequired,
  markSimpaisaCardsSessionPending,
} from "../app/lib/payments/simpaisaCardsFundingGate";
import {
  createMockSimpaisaCardsBrowserReturn,
  createMockSimpaisaCardsHostedSession,
  createMockSimpaisaCardsInquiryResult,
  createMockSimpaisaCardsVerifiedCallback,
} from "../app/lib/payments/simpaisaCardsHostedFixtures";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const policy = read("app/lib/payments/simpaisaCardsPolicy.ts");
  const lifecycle = read("app/lib/payments/simpaisaCardsLifecycle.ts");
  const funding = read("app/lib/payments/simpaisaCardsFundingGate.ts");
  const evidence = read("app/lib/payments/simpaisaCardsEvidence.ts");
  const fixtures = read("app/lib/payments/simpaisaCardsHostedFixtures.ts");
  const adapter = read("app/lib/payments/simpaisaCardsAdapter.ts");
  const config = read("app/lib/payments/simpaisaCardsConfig.ts");
  const cardsReturn = read("app/lib/payments/simpaisaCardsReturn.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const walletHttp = read("app/lib/payments/simpaisaHttp.ts");
  const walletAdapter = read("app/lib/payments/simpaisaAdapter.ts");
  const disabled = read("app/lib/payments/disabledAdapter.ts");
  const gatewaySelect = read("app/lib/payments/gatewaySelect.ts");
  const pkg = read("package.json");

  // --- Rail boundary / disabled by default ---
  assert.equal(SIMPAISA_CARDS_RAIL_ID, "SIMPAISA_CARDS");
  assert.equal(SIMPAISA_CARDS_CONTRACT_STATUS, "WAITING_FOR_SIMPAISA");
  assert.equal(isSimpaisaCardsEnabledFlag(undefined), false);
  assert.equal(isSimpaisaCardsEnabledFlag("true"), true);
  assert.equal(isSimpaisaCardsEnabledFlag("TRUE"), false);
  assert.equal(isSimpaisaCardsEnabledFlag("true "), false);
  assert.equal(parseSimpaisaCardsEnvironment("sandbox"), "sandbox");
  assert.equal(parseSimpaisaCardsEnvironment("Sandbox"), null);
  assert.equal(
    SIMPAISA_CARDS_PROVIDER_CONTRACTS.createHostedSession,
    "WAITING_FOR_SIMPAISA"
  );
  assert.equal(
    SIMPAISA_CARDS_PROVIDER_CONTRACTS.webhookParse,
    "WAITING_FOR_SIMPAISA"
  );
  assert.equal(
    SIMPAISA_CARDS_PROVIDER_CONTRACTS.inquiry,
    "WAITING_FOR_SIMPAISA"
  );
  console.log("PASS cards_rail_disabled_and_waiting_for_simpaisa");

  const disabledCfg = validateSimpaisaCardsAdapterConfig({
    enabledRaw: undefined,
    environmentRaw: "sandbox",
    merchantIdRaw: "mid",
    apiBaseUrlRaw: "https://example.invalid",
  });
  assert.equal(disabledCfg.ok, false);
  if (!disabledCfg.ok) assert.equal(disabledCfg.code, "CARDS_DISABLED");

  const waitingCfg = validateSimpaisaCardsAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    merchantIdRaw: "mid",
    apiBaseUrlRaw: "https://example.invalid",
    providerContractsReady: false,
  });
  assert.equal(waitingCfg.ok, false);
  if (!waitingCfg.ok) {
    assert.equal(waitingCfg.code, "PROVIDER_CONTRACT_WAITING");
  }

  const prodBlocked = validateSimpaisaCardsAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "production",
    merchantIdRaw: "mid",
    apiBaseUrlRaw: "https://example.invalid",
    allowProduction: false,
    providerContractsReady: true,
  });
  assert.equal(prodBlocked.ok, false);
  if (!prodBlocked.ok) {
    assert.equal(prodBlocked.code, "PRODUCTION_NOT_ENABLED");
  }

  const whWaiting = validateSimpaisaCardsWebhookConfig({
    webhookSecretRaw: "whsec_test",
    providerContractsReady: false,
  });
  assert.equal(whWaiting.ok, false);
  if (!whWaiting.ok) {
    assert.equal(whWaiting.code, "PROVIDER_CONTRACT_WAITING");
  }
  console.log("PASS fail_closed_config_env_names");

  assert.ok(policy.includes(SIMPAISA_CARDS_ENV_NAMES.ENABLED));
  assert.ok(policy.includes(SIMPAISA_CARDS_ENV_NAMES.MERCHANT_ID));
  assert.ok(policy.includes(SIMPAISA_CARDS_ENV_NAMES.API_BASE_URL));
  assert.ok(policy.includes(SIMPAISA_CARDS_ENV_NAMES.WEBHOOK_SECRET));
  assert.ok(policy.includes("handlesPanOrCvv"));
  assert.ok(policy.includes("isWalletRail"));
  assert.ok(!policy.includes("PAN") || policy.includes("never handles PAN"));
  console.log("PASS env_names_only_no_pan_cvv_collection");

  // --- Lifecycle ---
  assert.deepEqual(
    [...SIMPAISA_CARDS_ATTEMPT_STATUSES],
    [
      "CREATED",
      "SESSION_PENDING",
      "CUSTOMER_ACTION_REQUIRED",
      "PROCESSING",
      "VERIFIED_SUCCESS",
      "VERIFIED_FAILED",
      "RECONCILIATION_REQUIRED",
    ]
  );
  assert.equal(
    canTransitionSimpaisaCardsAttempt("CREATED", "SESSION_PENDING"),
    true
  );
  assert.equal(
    canTransitionSimpaisaCardsAttempt("CREATED", "VERIFIED_SUCCESS"),
    false
  );
  assert.equal(SIMPAISA_CARDS_BROWSER_RETURN_MAY_FUND, false);
  assert.equal(
    canFundFromSimpaisaCardsLifecycle("VERIFIED_SUCCESS", {
      evidenceVerified: true,
      fundedOnce: false,
    }),
    true
  );
  assert.equal(
    canFundFromSimpaisaCardsLifecycle("PROCESSING", {
      evidenceVerified: true,
      fundedOnce: false,
    }),
    false
  );
  assert.equal(
    canFundFromSimpaisaCardsLifecycle("VERIFIED_SUCCESS", {
      evidenceVerified: false,
      fundedOnce: false,
    }),
    false
  );
  console.log("PASS durable_lifecycle_transitions");

  // --- Safe return paths ---
  const safeReturn = assertSafeSimpaisaCardsReturnPath(
    esimPurchasePaymentReturnPath("attempt_cards_1")
  );
  assert.ok(safeReturn.startsWith("/account/esim/buy/payment/return/"));
  assert.throws(() => assertSafeSimpaisaCardsReturnPath("https://evil.example"));
  assert.throws(() => assertSafeSimpaisaCardsReturnPath("/admin"));
  assert.ok(cardsReturn.includes("safeCallbackPath"));
  assert.ok(cardsReturn.includes("isEsimPurchasePaymentReturnPath"));
  console.log("PASS safe_return_cancel_path_reuse");

  // --- Fixtures (no invented provider payload keys) ---
  const session = createMockSimpaisaCardsHostedSession({
    attemptId: "attempt_cards_1",
    purpose: "ESIM_PURCHASE",
    expectedChargeAmountMinor: 2200,
    expectedChargeCurrency: "PKR",
  });
  assert.equal(session.contractStatus, "WAITING_FOR_SIMPAISA");
  // Hosted-session fixture has no funding signal — mayFund exists only on
  // browser-return mocks (always false) and lifecycle gates, never on session.
  assert.equal(Object.hasOwn(session, "mayFund"), false);
  const browser = createMockSimpaisaCardsBrowserReturn("attempt_cards_1");
  assert.equal(browser.mayFund, false);
  assert.deepEqual(browser.untrustedQuery, {});
  assert.ok(fixtures.includes("WAITING_FOR_SIMPAISA"));
  assert.ok(!fixtures.includes("c_token"));
  assert.ok(!fixtures.includes("cardNumber"));
  assert.ok(!fixtures.includes("cvv"));
  console.log("PASS mocked_hosted_page_fixtures_no_invented_fields");

  // --- Evidence / applyVerifiedPaymentEvent gate ---
  assert.equal(rejectBrowserReturnAsCardsEvidence().ok, false);
  const built = buildSimpaisaCardsVerifiedEvidence({
    evidenceVerified: true,
    evidenceSource: "provider_callback",
    purpose: "ESIM_PURCHASE",
    eventId: "evt_1",
    paymentAttemptId: "attempt_cards_1",
    paymentStatus: "confirmed",
    chargeAmountMinor: 2200,
    chargeCurrency: "PKR",
  });
  assert.equal(built.ok, true);
  if (built.ok) {
    const normalized = toNormalizedPaymentEventForApply(built.evidence);
    assert.equal(normalized.signatureVerified, true);
    assert.equal(normalized.provider, "SIMPAISA_CARDS");
  }
  assert.throws(() =>
    toNormalizedPaymentEventForApply({
      evidenceVerified: false,
      evidenceSource: "provider_callback",
      purpose: "ESIM_PURCHASE",
      eventId: "x",
      providerPaymentRef: null,
      localTopupId: null,
      paymentAttemptId: "a",
      purchaseId: null,
      paymentStatus: "confirmed",
      chargeCurrency: "PKR",
      chargeAmountMinor: 1,
      confirmedAt: null,
      failureCategory: null,
    })
  );
  assert.match(apply, /if \(!event\.signatureVerified\)/);
  assert.match(apply, /UNSIGNED_PAYMENT_EVENT/);
  console.log("PASS evidence_required_before_applyVerifiedPaymentEvent");

  // --- Funding scenarios ---
  let attempt = createSimpaisaCardsAttemptRecord({
    attemptId: "attempt_cards_1",
    purpose: "ESIM_PURCHASE",
    expectedChargeAmountMinor: 2200,
    expectedChargeCurrency: "PKR",
    purchaseId: "purchase_1",
  });
  attempt = markSimpaisaCardsSessionPending(attempt);
  attempt = markSimpaisaCardsCustomerActionRequired(attempt);
  assert.equal(attempt.status, "CUSTOMER_ACTION_REQUIRED");

  // Duplicate browser return — never funds
  const br1 = applySimpaisaCardsBrowserReturn(attempt);
  attempt = br1.attempt;
  assert.equal(br1.outcome.funded, false);
  const br2 = applySimpaisaCardsBrowserReturn(attempt);
  attempt = br2.attempt;
  assert.equal(attempt.browserReturnCount, 2);
  assert.equal(attempt.fundedOnce, false);
  assert.equal(br2.outcome.kind, "ignored_browser_return");
  console.log("PASS duplicate_browser_return_never_funds");

  // Delayed callback after browser returns
  const cb = createMockSimpaisaCardsVerifiedCallback({
    attemptId: attempt.attemptId,
    eventId: "evt_delayed_1",
    chargeAmountMinor: 2200,
    chargeCurrency: "PKR",
  });
  const funded = applySimpaisaCardsVerifiedCallback(attempt, cb);
  attempt = funded.attempt;
  assert.equal(funded.outcome.kind, "funded");
  assert.equal(attempt.fundedOnce, true);
  assert.equal(attempt.status, "VERIFIED_SUCCESS");
  console.log("PASS delayed_callback_after_browser_return_funds_once");

  // Duplicate callback — exact-once
  const dup = applySimpaisaCardsVerifiedCallback(attempt, cb);
  assert.equal(dup.outcome.kind, "duplicate_event");
  assert.equal(dup.outcome.funded, false);
  assert.equal(dup.attempt.fundedOnce, true);
  console.log("PASS duplicate_callback_exact_once_funding");

  // Amount mismatch
  let mismatch = createSimpaisaCardsAttemptRecord({
    attemptId: "attempt_amt",
    purpose: "WALLET_TOPUP",
    expectedChargeAmountMinor: 5000,
    expectedChargeCurrency: "PKR",
    localTopupId: "topup_1",
  });
  mismatch = markSimpaisaCardsSessionPending(mismatch);
  const amt = applySimpaisaCardsVerifiedCallback(mismatch, {
    eventId: "evt_amt",
    paymentStatus: "confirmed",
    chargeAmountMinor: 4999,
    chargeCurrency: "PKR",
  });
  assert.equal(amt.outcome.kind, "amount_mismatch");
  assert.equal(amt.attempt.status, "RECONCILIATION_REQUIRED");
  assert.equal(amt.attempt.fundedOnce, false);
  console.log("PASS amount_mismatch_no_fund");

  // Currency mismatch
  let cur = createSimpaisaCardsAttemptRecord({
    attemptId: "attempt_cur",
    purpose: "ESIM_PURCHASE",
    expectedChargeAmountMinor: 2200,
    expectedChargeCurrency: "PKR",
  });
  cur = markSimpaisaCardsSessionPending(cur);
  const curOut = applySimpaisaCardsVerifiedCallback(cur, {
    eventId: "evt_cur",
    paymentStatus: "confirmed",
    chargeAmountMinor: 2200,
    chargeCurrency: "USD",
  });
  assert.equal(curOut.outcome.kind, "currency_mismatch");
  assert.equal(curOut.attempt.fundedOnce, false);
  console.log("PASS currency_mismatch_no_fund");

  // Inquiry recovery (no prior callback fund)
  let inquiryAttempt = createSimpaisaCardsAttemptRecord({
    attemptId: "attempt_inq",
    purpose: "ESIM_PURCHASE",
    expectedChargeAmountMinor: 1000,
    expectedChargeCurrency: "PKR",
  });
  inquiryAttempt = markSimpaisaCardsSessionPending(inquiryAttempt);
  applySimpaisaCardsBrowserReturn(inquiryAttempt);
  const inquiry = createMockSimpaisaCardsInquiryResult({
    attemptId: "attempt_inq",
    eventId: "evt_inq_1",
    chargeAmountMinor: 1000,
    chargeCurrency: "PKR",
  });
  const inqOut = applySimpaisaCardsInquiryRecovery(inquiryAttempt, inquiry);
  assert.equal(inqOut.outcome.kind, "funded");
  assert.equal(inqOut.attempt.fundedOnce, true);
  const inqDup = applySimpaisaCardsInquiryRecovery(inqOut.attempt, inquiry);
  assert.equal(inqDup.outcome.kind, "duplicate_event");
  console.log("PASS inquiry_recovery_exact_once");

  // --- Source guards: do not touch wallet Simpaisa; feature not in selector ---
  assert.ok(!/from ["']@\/app\/lib\/payments\/simpaisaHttp["']/.test(adapter));
  assert.ok(!/from ["']@\/app\/lib\/payments\/simpaisaHttp["']/.test(config));
  assert.ok(!/from ["']@\/app\/lib\/payments\/simpaisaHttp["']/.test(funding));
  assert.ok(!walletHttp.includes("SIMPAISA_CARDS"));
  assert.ok(!walletAdapter.includes("SIMPAISA_CARDS"));
  assert.ok(!disabled.includes("tryCreateSimpaisaCardsAdapter"));
  assert.ok(!gatewaySelect.includes("SIMPAISA_CARDS"));
  assert.ok(
    adapter.includes("WAITING_FOR_SIMPAISA") ||
      adapter.includes("Waiting for provider")
  );
  assert.ok(lifecycle.includes("CREATED"));
  assert.ok(evidence.includes("BROWSER_RETURN_FORBIDDEN"));
  assert.match(pkg, /"qa:simpaisa-cards-foundation"/);
  console.log("PASS wallet_rail_untouched_and_cards_not_selected");

  console.log("ALL PASS qa-simpaisa-cards-foundation");
}

main();
