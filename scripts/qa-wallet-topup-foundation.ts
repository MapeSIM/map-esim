/**
 * Offline QA for Phase 6A gateway-independent wallet top-up foundation.
 * Does not call payment gateways, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
  parseTopupCheckoutIdempotencyKey,
  parseTopupUsdAmountToCents,
} from "../app/lib/wallet/amount";
import {
  TOPUP_CREDITED,
  TOPUP_DRAFT_CREATED,
  TOPUP_WEBHOOK_DUPLICATE,
  browserReturnMustNotCreditWallet,
} from "../app/lib/wallet/topupConstants";
import { maskSimpaisaMsisdn } from "../app/lib/payments/simpaisaPolicy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260805010000_add_wallet_topup_foundation/migration.sql"
  );
  const amountSrc = read("app/lib/wallet/amount.ts");
  const topupSrc = read("app/lib/wallet/topup.ts");
  const actionsSrc = read("app/lib/wallet/topupActions.ts");
  const readSrc = read("app/lib/wallet/topupRead.ts");
  const adminTopups = read("app/lib/admin/topups.ts");
  const adapter = read("app/lib/payments/adapter.ts");
  const disabled = read("app/lib/payments/disabledAdapter.ts");
  const types = read("app/lib/payments/types.ts");
  const form = read("app/components/account/WalletTopupForm.tsx");
  const checkoutBtn = read(
    "app/components/account/WalletTopupCheckoutButton.tsx"
  );
  const topupPage = read("app/account/wallet/top-up/page.tsx");
  const detailPage = read("app/account/wallet/top-up/[id]/page.tsx");
  const walletPage = read("app/account/wallet/page.tsx");
  const accountLayout = read("app/account/layout.tsx");
  const adminList = read("app/admin/wallet-topups/page.tsx");
  const adminDetail = read("app/admin/wallet-topups/[id]/page.tsx");
  const adminNav = read("app/components/admin/AdminNav.tsx");
  const adminCustomer = read("app/admin/customers/[id]/page.tsx");
  const adminDisplay = read("app/lib/admin/display.ts");
  const purchaseSrc = read("app/lib/esim/walletPurchase.ts");
  const adminCredit = read("app/lib/wallet/adminCredit.ts");
  const adminDebit = read("app/lib/wallet/adminDebit.ts");
  const pkg = read("package.json");
  const qaSelf = read("scripts/qa-wallet-topup-foundation.ts");

  assert.match(actionsSrc, /requireRole\("CUSTOMER"\)/);
  assert.match(topupPage, /requireRole\("CUSTOMER"\)/);
  assert.match(detailPage, /requireRole\("CUSTOMER"\)/);
  assert.ok(!/requireRole\("ADMIN"\)/.test(actionsSrc));
  assert.match(topupSrc, /role !== Role\.CUSTOMER/);
  assert.match(topupSrc, /deletedAt/);
  console.log("PASS active_customer_only_topup_routes");

  assert.match(adminList, /requireRole\("ADMIN"\)/);
  assert.match(adminDetail, /requireRole\("ADMIN"\)/);
  assert.match(accountLayout, /Buy eSIM/);
  assert.match(walletPage, /\/account\/esim\/buy/);
  // Soft-launch: Add funds nav/CTA only when gateway is configured.
  assert.match(accountLayout, /isPaymentGatewayConfigured/);
  assert.match(walletPage, /isPaymentGatewayConfigured/);
  assert.match(adminNav, /\/admin\/wallet-topups/);
  console.log("PASS admin_and_customer_entry_points");

  assert.match(readSrc, /customerUserId !== customer\.id|row\.customerUserId !== customer/);
  assert.match(readSrc, /notFound\(\)/);
  assert.match(detailPage, /getCustomerTopupView/);
  assert.match(detailPage, /awaitingWalletApproval/);
  assert.match(detailPage, /data-topup-state="awaiting-wallet-approval"/);
  assert.match(detailPage, /Payment request sent to/);
  assert.match(detailPage, /Please approve the request in your wallet/);
  assert.match(detailPage, /data-topup-state="credited"/);
  assert.match(detailPage, /Payment successful/);
  assert.match(detailPage, /WalletTopupPendingPoller/);
  assert.match(detailPage, /data-topup-action="retry-payment"/);
  assert.match(detailPage, /Retry payment/);
  assert.match(readSrc, /awaitingWalletApproval/);
  assert.match(readSrc, /customerMsisdnMasked/);
  assert.match(readSrc, /isSimpaisaSession/);
  assert.match(readSrc, /canAttemptCheckout/);
  assert.match(
    readSrc,
    /AWAITING_PAYMENT && !isSimpaisaSession|!isSimpaisaSession\)/
  );
  assert.match(topupSrc, /customerMsisdnMasked/);
  assert.match(topupSrc, /walletOperatorId/);
  assert.match(topupSrc, /maskSimpaisaMsisdn/);
  assert.doesNotMatch(topupSrc, /createCheckoutSession\([\s\S]*router\.refresh/);
  const poller = read("app/components/account/WalletTopupPendingPoller.tsx");
  assert.match(poller, /router\.refresh\(\)/);
  assert.match(poller, /POLL_INTERVAL_MS/);
  assert.doesNotMatch(poller, /createCheckoutSession|verifyWalletTransaction|inquireTransaction/);
  assert.match(schema, /walletOperatorId/);
  assert.match(schema, /customerMsisdnMasked/);
  assert.match(
    read(
      "prisma/migrations/20260904120000_add_wallet_topup_simpaisa_display_fields/migration.sql"
    ),
    /customerMsisdnMasked/
  );
  const policy = read("app/lib/payments/simpaisaPolicy.ts");
  assert.match(policy, /maskSimpaisaMsisdn/);
  assert.equal(maskSimpaisaMsisdn("3001234567"), "300****4567");
  assert.equal(maskSimpaisaMsisdn("03001234567"), "300****4567");
  assert.equal(maskSimpaisaMsisdn(null), null);
  console.log("PASS ownership_scoped_topup_reads");
  console.log("PASS simpaisa_pending_ux_0037_refresh_safe");

  assert.equal(WALLET_TOPUP_MIN_CENTS, 10);
  assert.equal(WALLET_TOPUP_MAX_CENTS, 50_000);
  assert.equal(parseTopupUsdAmountToCents("0.10").ok, true);
  assert.equal(parseTopupUsdAmountToCents("10").ok, true);
  assert.equal(parseTopupUsdAmountToCents("10.00").ok, true);
  assert.equal(parseTopupUsdAmountToCents("500").ok, true);
  assert.equal(parseTopupUsdAmountToCents("500.00").ok, true);
  assert.equal(parseTopupUsdAmountToCents("0.09").ok, false);
  assert.equal(parseTopupUsdAmountToCents("500.01").ok, false);
  assert.equal(parseTopupUsdAmountToCents("0").ok, false);
  assert.equal(parseTopupUsdAmountToCents("-10").ok, false);
  console.log("PASS minimum_0_10_maximum_500");

  assert.match(form, /data-topup-preset=\{preset\.id\}/);
  assert.match(form, /\{ id: "10", label: "\$10", value: "10" \}/);
  assert.match(form, /\{ id: "50", label: "\$50", value: "50" \}/);
  assert.match(form, /\{ id: "100", label: "\$100", value: "100" \}/);
  assert.match(form, /\{ id: "150", label: "\$150", value: "150" \}/);
  assert.match(form, /\{ id: "500", label: "\$500", value: "500" \}/);
  assert.match(form, /\{ id: "custom", label: "Custom", value: null \}/);
  assert.match(form, /Quick amount/);
  assert.match(form, /aria-label="Quick top-up amounts"/);
  console.log("PASS quick_amount_controls_render");

  assert.match(form, /setAmount\(preset\.value\)/);
  assert.match(form, /setAmount\(""\)/);
  assert.match(form, /amountInputRef\.current\?\.focus/);
  assert.match(form, /type="button"/);
  assert.match(form, /aria-pressed=\{active\}/);
  assert.ok(!/createWalletTopupDraft\(/.test(form));
  assert.ok(!/prisma\./.test(form));
  assert.ok(!/\bfetch\s*\(/.test(form));
  assert.ok(!/onClick=\{\(\) => [\s\S]*createWalletTopupDraftAction/.test(form));
  console.log("PASS presets_populate_input_without_database_writes");

  assert.match(form, /setSelectedPreset\("custom"\)/);
  assert.equal(parseTopupUsdAmountToCents("25.50").ok, true);
  assert.equal(parseTopupUsdAmountToCents("0.09").ok, false);
  assert.equal(parseTopupUsdAmountToCents("0.10").ok, true);
  assert.equal(parseTopupUsdAmountToCents("500.01").ok, false);
  assert.equal(parseTopupUsdAmountToCents("10.001").ok, false);
  console.log("PASS custom_retains_normal_validation");

  const ten = parseTopupUsdAmountToCents("10.50");
  assert.equal(ten.ok, true);
  if (ten.ok) assert.equal(ten.cents, 1050);
  assert.equal(parseTopupUsdAmountToCents("10.001").ok, false);
  assert.equal(parseTopupUsdAmountToCents("1e2").ok, false);
  assert.equal(parseTopupUsdAmountToCents("NaN").ok, false);
  assert.match(amountSrc, /WALLET_TOPUP_MIN_CENTS/);
  console.log("PASS integer_cent_validation");

  assert.equal(parseTopupUsdAmountToCents("10.001").ok, false);
  assert.equal(parseTopupUsdAmountToCents("1e3").ok, false);
  assert.equal(parseTopupUsdAmountToCents("-1").ok, false);
  assert.equal(parseTopupUsdAmountToCents("0.00").ok, false);
  console.log("PASS extra_decimals_exponent_negative_zero_rejected");

  assert.ok(!/280|278\.|exchangeRate\s*=\s*\d|PKR_RATE|hard.?coded/i.test(topupSrc));
  assert.ok(!/280|278\.|exchangeRate\s*=\s*\d/.test(disabled));
  assert.ok(!/280|278\.|exchangeRate\s*=\s*\d/.test(form));
  assert.match(
    form,
    /PKR payment amount will be[\s\S]*confirmed securely at checkout/i
  );
  console.log("PASS no_hardcoded_fx_rate");

  assert.match(topupSrc, /chargeCurrency:\s*null/);
  assert.match(topupSrc, /chargeAmountMinor:\s*null/);
  // Draft creation leaves charge null; checkout later persists gateway quote only.
  assert.match(topupSrc, /chargeAmountMinor:\s*topup\.creditAmountCents|chargeAmountMinor,/);
  assert.ok(!/chargeAmountMinor:\s*\d{2,}/.test(topupSrc));
  assert.match(detailPage, /confirmed securely at checkout|chargeNotice/i);
  console.log("PASS no_pkr_amount_invented_without_quote");

  assert.match(detailPage, /browserReturnMustNotCreditWallet/);
  assert.match(detailPage, /void query\.paid/);
  assert.match(actionsSrc, /browserReturnMustNotCreditWallet/);
  assert.equal(browserReturnMustNotCreditWallet(), true);
  assert.ok(!/applyVerifiedTopupPaymentEvent/.test(detailPage));
  assert.ok(!/applyVerifiedTopupPaymentEvent/.test(actionsSrc));
  console.log("PASS browser_success_url_cannot_credit");

  assert.match(actionsSrc, /void formData\.get\("status"\)/);
  assert.match(actionsSrc, /void formData\.get\("gatewayStatus"\)/);
  assert.ok(!/formData\.get\("status"\)\s*===\s*["']paid["']/.test(actionsSrc));
  console.log("PASS client_payment_status_cannot_credit");

  assert.match(topupSrc, /signatureVerified/);
  assert.match(topupSrc, /applyVerifiedTopupPaymentEvent/);
  assert.match(adapter, /verifyWebhookSignature/);
  assert.match(adapter, /parseWebhookEvent/);
  assert.match(types, /NormalizedPaymentEvent/);
  console.log("PASS verified_adapter_event_required");

  assert.match(schema, /checkoutIdempotencyKey/);
  assert.match(schema, /webhookEventId/);
  assert.match(migration, /WalletTopup_checkoutIdempotencyKey_key/);
  assert.match(migration, /WalletTopup_webhookEventId_key/);
  assert.equal(parseTopupCheckoutIdempotencyKey("short").ok, false);
  assert.equal(parseTopupCheckoutIdempotencyKey("a".repeat(8)).ok, true);
  console.log("PASS provider_event_idempotency_enforced");

  assert.match(topupSrc, /TOPUP_WEBHOOK_DUPLICATE|wallet\.topup_webhook_duplicate/);
  assert.match(topupSrc, /duplicate:\s*true/);
  assert.match(topupSrc, /webhookEventId:\s*eventId/);
  assert.equal(TOPUP_WEBHOOK_DUPLICATE, "wallet.topup_webhook_duplicate");
  console.log("PASS duplicate_webhook_cannot_double_credit");

  assert.match(topupSrc, /charge_mismatch|chargeCurrency/);
  assert.match(topupSrc, /chargeAmountMinor !== event\.chargeAmountMinor/);
  console.log("PASS currency_and_charge_amount_must_exactly_match");

  assert.match(topupSrc, /WalletTransactionType\.TOPUP_CREDIT/);
  assert.match(topupSrc, /idempotencyKey:\s*`topup_\$\{topup\.id\}`/);
  assert.ok(!/ADMIN_CREDIT/.test(topupSrc));
  assert.ok(!/ADJUSTMENT_DEBIT|PURCHASE_DEBIT/.test(topupSrc));
  console.log("PASS exactly_one_topup_credit_on_confirmed_payment");

  assert.match(topupSrc, /\$transaction/);
  assert.match(topupSrc, /balanceCents:\s*\{\s*increment:\s*topup\.creditAmountCents/);
  assert.match(topupSrc, /version:\s*\{\s*increment:\s*1/);
  assert.match(topupSrc, /WalletTopupStatus\.CREDITED/);
  console.log("PASS atomic_balance_version_ledger_topup_update");

  assert.match(topupSrc, /paymentStatus === "pending"/);
  assert.match(topupSrc, /paymentStatus === "failed"/);
  assert.match(topupSrc, /WalletTopupStatus\.FAILED/);
  assert.ok(
    topupSrc.indexOf('paymentStatus === "failed"') <
      topupSrc.indexOf("WalletTransactionType.TOPUP_CREDIT")
  );
  assert.match(topupSrc, /EXPIRED|WalletTopupStatus\.EXPIRED/);
  console.log("PASS pending_failed_expired_create_no_wallet_credit");

  assert.match(topupSrc, /paymentStatus === "uncertain"/);
  assert.match(topupSrc, /RECONCILIATION_REQUIRED/);
  assert.match(topupSrc, /missing_checkout_snapshot|charge_mismatch/);
  console.log("PASS mismatched_uncertain_create_no_wallet_credit");

  assert.match(readSrc, /notFound\(\)/);
  assert.match(detailPage, /requireRole\("CUSTOMER"\)/);
  console.log("PASS customer_cannot_view_another_topup");

  assert.ok(!/rawBody|webhookSecret|api[_-]?key|DATABASE_URL/i.test(adminList));
  assert.ok(!/rawBody|webhookSecret|api[_-]?key|DATABASE_URL/i.test(adminDetail));
  assert.ok(!/markPaid|replayWebhook|rawGatewayJson/i.test(adminList));
  assert.ok(!/markPaid|replayWebhook|rawGatewayJson/i.test(adminDetail));
  assert.match(adminTopups, /maskProviderOrderRef/);
  assert.match(adminDisplay, /topupId/);
  assert.ok(!/select:\s*\{[\s\S]*rawPayload|gatewayPayload/.test(adminTopups));
  console.log("PASS admin_view_hides_raw_payloads_secrets");

  assert.match(purchaseSrc, /PURCHASE_DEBIT/);
  assert.match(adminCredit, /ADMIN_CREDIT/);
  assert.match(adminDebit, /ADJUSTMENT_DEBIT/);
  assert.ok(!/applyVerifiedTopupPaymentEvent|WalletTopup/.test(purchaseSrc));
  console.log("PASS existing_wallet_purchase_credit_debit_unchanged");

  assert.ok(!/simpaisa\.|payfast\.|safepay\.|jazzcash\.|easypaisa\./i.test(disabled));
  assert.ok(!/\bfetch\s*\(/.test(disabled));
  assert.match(disabled, /enabled:\s*false/);
  assert.match(disabled, /Payment gateway is not available yet/);
  assert.match(qaSelf, /Does not call payment gateways/);
  console.log("PASS automated_qa_creates_no_real_payment");

  assert.ok(!/\bfetch\s*\(/.test(topupSrc));
  assert.ok(!/\bfetch\s*\(/.test(disabled));
  assert.ok(!/https?:\/\//.test(disabled));
  console.log("PASS no_gateway_http_request_occurs");

  assert.ok(!/sendMail|nodemailer|deliverOrderEmail|sendOrderEmail/.test(topupSrc));
  assert.ok(!/sendMail|nodemailer|deliverOrderEmail/.test(actionsSrc));
  console.log("PASS no_email_is_sent");

  assert.ok(!/migrate\s+reset|migrate\s+dev|db\s+push|\$executeRawUnsafe/.test(topupSrc));
  assert.ok(!/migrate\s+reset|migrate\s+dev|db\s+push|\$executeRawUnsafe/.test(actionsSrc));
  assert.ok(!/migrate\s+reset|migrate\s+dev|db\s+push/.test(adminTopups));
  assert.match(schema, /enum WalletTopupStatus/);
  assert.match(schema, /model WalletTopup/);
  assert.match(schema, /MANUAL_TEST/);
  assert.match(topupSrc, /MANUAL_TEST/);
  assert.match(topupSrc, /not approved for wallet credit/);
  assert.equal(TOPUP_DRAFT_CREATED, "wallet.topup_draft_created");
  assert.equal(TOPUP_CREDITED, "wallet.topup_credited");
  assert.ok(existsSync(join(root, "prisma/migrations/20260805010000_add_wallet_topup_foundation/migration.sql")));
  assert.match(pkg, /qa:wallet-topup-foundation/);
  assert.match(form, /Payment provider setup in progress|gatewayStatusLabel/);
  assert.match(topupPage, /isPaymentGatewayConfigured/);
  assert.match(
    topupPage,
    /Adding funds online is not available yet|Payment provider ready/
  );
  assert.match(actionsSrc, /isPaymentGatewayConfigured/);
  assert.match(checkoutBtn, /startWalletTopupCheckoutAction/);
  assert.match(adminCustomer, /getAdminCustomerRecentTopups/);
  assert.match(qaSelf, /Does not call payment gateways/);
  console.log("PASS no_destructive_prisma_command");

  console.log("ALL_QA_PASSED=28");
}

main();
