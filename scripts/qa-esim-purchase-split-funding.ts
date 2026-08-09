/**
 * Offline QA for Phase PG1 split-payment persistence + funding math.
 * Does not call VeSIM, gateways, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculatePurchaseFunding,
  PurchaseFundingError,
  walletOnlyPurchaseFunding,
} from "../app/lib/esim/purchaseFunding";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260807120000_add_esim_purchase_split_funding_foundation/migration.sql"
  );
  const fundingSrc = read("app/lib/esim/purchaseFunding.ts");
  const service = read("app/lib/esim/walletPurchase.ts");
  const disabledAdapter = read("app/lib/payments/disabledAdapter.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const paymentPage = read("app/payment/page.tsx");
  const buyPage = read("app/account/esim/buy/page.tsx");
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const pkg = read("package.json");

  // --- Funding math (4 required cases) ---
  const cases: Array<{
    name: string;
    price: number;
    balance: number;
    useWallet: boolean;
    wallet: number;
    gateway: number;
  }> = [
    {
      name: "partial_wallet_selected",
      price: 500,
      balance: 100,
      useWallet: true,
      wallet: 100,
      gateway: 400,
    },
    {
      name: "exact_wallet_selected",
      price: 500,
      balance: 500,
      useWallet: true,
      wallet: 500,
      gateway: 0,
    },
    {
      name: "surplus_wallet_selected",
      price: 500,
      balance: 1000,
      useWallet: true,
      wallet: 500,
      gateway: 0,
    },
    {
      name: "wallet_not_selected",
      price: 500,
      balance: 100,
      useWallet: false,
      wallet: 0,
      gateway: 500,
    },
  ];

  for (const c of cases) {
    const result = calculatePurchaseFunding({
      priceCents: c.price,
      walletBalanceCents: c.balance,
      useWallet: c.useWallet,
    });
    assert.equal(result.walletAppliedCents, c.wallet, c.name);
    assert.equal(result.gatewayAmountCents, c.gateway, c.name);
    assert.equal(
      result.walletAppliedCents + result.gatewayAmountCents,
      c.price,
      `${c.name}_sum`
    );
    assert.ok(result.walletAppliedCents >= 0, `${c.name}_wallet_nonneg`);
    assert.ok(result.gatewayAmountCents >= 0, `${c.name}_gateway_nonneg`);
    console.log(`PASS funding_math_${c.name}`);
  }

  assert.throws(
    () =>
      calculatePurchaseFunding({
        priceCents: 0,
        walletBalanceCents: 100,
        useWallet: true,
      }),
    (err: unknown) =>
      err instanceof PurchaseFundingError && err.code === "INVALID_PRICE"
  );
  assert.throws(
    () =>
      calculatePurchaseFunding({
        priceCents: 500,
        walletBalanceCents: -1,
        useWallet: true,
      }),
    (err: unknown) =>
      err instanceof PurchaseFundingError && err.code === "INVALID_BALANCE"
  );
  console.log("PASS funding_math_rejects_invalid_inputs");

  const walletOnly = walletOnlyPurchaseFunding(500);
  assert.equal(walletOnly.useWallet, true);
  assert.equal(walletOnly.walletAppliedCents, 500);
  assert.equal(walletOnly.gatewayAmountCents, 0);
  console.log("PASS wallet_only_persistence_helper");

  // --- Schema / migration ---
  assert.match(schema, /useWallet\s+Boolean/);
  assert.match(schema, /walletAppliedCents\s+Int/);
  assert.match(schema, /gatewayAmountCents\s+Int/);
  assert.match(schema, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(schema, /\bFUNDED\b/);
  assert.match(schema, /CUSTOMER_SPLIT/);
  assert.match(schema, /model EsimPurchasePaymentAttempt/);
  assert.match(schema, /checkoutIdempotencyKey/);
  assert.match(schema, /webhookEventId/);
  assert.match(migration, /walletAppliedCents" = "priceCents"/);
  assert.match(migration, /gatewayAmountCents" = 0/);
  assert.match(migration, /useWallet" = TRUE/);
  assert.match(migration, /WalletEsimPurchase_funding_breakdown_check/);
  assert.match(migration, /EsimPurchasePaymentAttempt/);
  assert.match(migration, /CUSTOMER_SPLIT/);
  assert.match(migration, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(migration, /\bFUNDED\b/);
  console.log("PASS schema_and_migration_pg1_fields");

  // --- Migration-first backward compatibility trigger ---
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION "WalletEsimPurchase_legacy_funding_compat"/
  );
  assert.match(
    migration,
    /CREATE TRIGGER "WalletEsimPurchase_legacy_funding_compat_bi"/
  );
  assert.match(migration, /BEFORE INSERT ON "WalletEsimPurchase"/);
  assert.match(migration, /IF NEW\."walletAppliedCents" IS NULL THEN/);
  assert.match(migration, /NEW\."useWallet" := TRUE;/);
  assert.match(migration, /NEW\."walletAppliedCents" := NEW\."priceCents";/);
  assert.match(migration, /NEW\."gatewayAmountCents" := 0;/);
  // Trigger must be created before NOT NULL / CHECK enforcement.
  assert.ok(
    migration.indexOf('CREATE TRIGGER "WalletEsimPurchase_legacy_funding_compat_bi"') <
      migration.indexOf('ALTER COLUMN "walletAppliedCents" SET NOT NULL')
  );
  assert.ok(
    migration.indexOf('CREATE TRIGGER "WalletEsimPurchase_legacy_funding_compat_bi"') <
      migration.indexOf("WalletEsimPurchase_funding_breakdown_check")
  );
  // Explicit PG1 values must not be overwritten (only NULL branch fills).
  assert.ok(!/IF NEW\."walletAppliedCents" IS NOT NULL/.test(migration));
  assert.match(migration, /IF NEW\."walletAppliedCents" IS NULL THEN/);
  console.log("PASS migration_legacy_funding_compat_trigger");

  // --- Current wallet-only confirm path unchanged ---
  assert.match(service, /walletOnlyPurchaseFunding\(snapshot\.priceCents\)/);
  assert.match(service, /amountCents:\s*snapshot\.priceCents/);
  assert.match(service, /fundingSource:\s*OrderFundingSource\.CUSTOMER_WALLET/);
  assert.match(service, /reserveWalletPurchaseFundsInTx/);
  // CUSTOMER_SPLIT may be persisted for gateway-required READY rows (PG2); confirm path stays wallet-only.
  assert.match(service, /OrderFundingSource\.CUSTOMER_SPLIT/);
  // Wallet-only confirm must not transition into gateway-awaiting; restoreReady
  // release may reference AWAITING_GATEWAY_PAYMENT as a CAS allow-list only.
  assert.doesNotMatch(
    service,
    /status:\s*WalletEsimPurchaseStatus\.AWAITING_GATEWAY_PAYMENT/
  );
  assert.match(
    service,
    /restoreReady[\s\S]*AWAITING_GATEWAY_PAYMENT[\s\S]*FUNDS_RESERVED/
  );
  console.log("PASS wallet_only_flow_still_full_price");

  // --- Partial reservation primitive ---
  assert.match(service, /export async function reserveWalletPurchaseFundsInTx/);
  assert.match(service, /balanceCents:\s*\{\s*gte:\s*amountCents/);
  assert.match(service, /balanceCents:\s*\{\s*decrement:\s*amountCents/);
  assert.match(service, /idempotencyKey:\s*options\.debitIdempotencyKey/);
  assert.match(service, /WalletTransactionStatus\.PENDING/);
  assert.match(service, /refund_\$\{options\.purchaseId\}/);
  console.log("PASS partial_reservation_primitive");

  // --- Gateway remains env-gated; UI fail-closed when not configured ---
  assert.match(confirmForm, /Continue to Payment/);
  assert.match(
    confirmForm,
    /CARD_PAYMENT_UNAVAILABLE_MESSAGE|Online payment will be available once payment setup is completed/
  );
  assert.match(confirmForm, /paymentGatewayConfigured/);
  assert.ok(!/createCheckoutSession/.test(confirmForm));
  assert.match(
    read("app/lib/esim/walletPurchaseActions.ts"),
    /isPaymentGatewayConfigured/
  );
  assert.match(
    read("app/lib/esim/esimPurchaseGatewayCheckout.ts"),
    /isPaymentGatewayConfigured/
  );
  assert.match(disabledAdapter, /isPaymentGatewayEnabledFlag|PAYMENT_GATEWAY_ENABLED/);
  assert.match(disabledAdapter, /tryCreateSafepayAdapter/);
  assert.match(disabledAdapter, /return false/);
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.match(paymentPage, /Card checkout unavailable/);
  assert.match(pkg, /"qa:esim-purchase-split-funding"/);
  console.log("PASS no_gateway_session_gateway_still_disabled");

  assert.match(fundingSrc, /Math\.min\(walletBalanceCents, priceCents\)/);
  console.log("PASS funding_helper_pure_integer_cents");

  console.log("ALL_PG1_CHECKS_PASSED");
}

main();
