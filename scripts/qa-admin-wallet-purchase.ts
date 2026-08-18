/**
 * Offline QA for Phase 8C-B admin-assisted customer-wallet eSIM purchase.
 * Does not call VeSIM, debit wallets, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSISTED_WALLET_CONFIRM_PHRASE,
  parseAssistedWalletConfirmPhrase,
  parseAssistedWalletPurchaseReason,
} from "../app/lib/esim/adminWalletPurchaseValidation";
import { parseWalletPurchaseIdempotencyKey } from "../app/lib/esim/walletPurchaseValidation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260806130000_add_admin_assisted_wallet_purchase/migration.sql"
  );
  const service = read("app/lib/esim/walletPurchase.ts");
  const adminActions = read("app/lib/esim/adminWalletPurchaseActions.ts");
  const customerActions = read("app/lib/esim/walletPurchaseActions.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignment.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const capture = read("app/lib/orders/iccidCapture.ts");
  const emailExtract = read("app/lib/email/extract.ts");
  const emailTemplate = read("app/lib/email/template.ts");
  const customerPage = read("app/admin/customers/[id]/page.tsx");
  const selectPage = read(
    "app/admin/customers/[id]/esim/wallet-buy/page.tsx"
  );
  const reviewPage = read(
    "app/admin/customers/[id]/esim/wallet-buy/review/page.tsx"
  );
  const successPage = read(
    "app/admin/customers/[id]/esim/wallet-buy/success/page.tsx"
  );
  const confirmForm = read(
    "app/components/admin/AdminWalletBuyConfirmForm.tsx"
  );
  const selectForm = read("app/components/admin/AdminWalletBuySelectForm.tsx");
  const pkg = read("package.json");

  assert.match(schema, /adminUserId\s+String\?/);
  assert.match(schema, /assistedPurchaseReason\s+String\?/);
  assert.match(schema, /AssistedWalletPurchaseAdmin/);
  assert.match(schema, /@@index\(\[adminUserId\]\)/);
  assert.ok(existsSync(join(root, "prisma/migrations/20260806130000_add_admin_assisted_wallet_purchase/migration.sql")));
  assert.match(migration, /ADD COLUMN "adminUserId"/);
  assert.match(migration, /ADD COLUMN "assistedPurchaseReason"/);
  assert.doesNotMatch(migration, /UNIQUE.*"adminUserId"/i);
  console.log("PASS schema_and_nullable_migration");

  assert.match(adminActions, /requireRole\("ADMIN"\)/);
  assert.match(selectPage, /requireRole\("ADMIN"\)/);
  assert.match(reviewPage, /requireRole\("ADMIN"\)/);
  assert.match(successPage, /requireRole\("ADMIN"\)/);
  assert.match(service, /assertActiveAdmin/);
  assert.match(service, /role !== Role\.ADMIN/);
  assert.match(service, /emailVerifiedAt/);
  console.log("PASS admin_auth_and_active_checks");

  assert.match(service, /CUSTOMER_UNAVAILABLE/);
  assert.match(service, /requireEmailVerified:\s*isAssisted/);
  assert.match(service, /INSUFFICIENT_FUNDS/);
  assert.match(adminActions, /void formData\.get\("price"\)/);
  assert.match(adminActions, /void formData\.get\("walletBalance"\)/);
  console.log("PASS customer_and_price_not_trusted");

  assert.match(service, /verifyOfferAuthoritative/);
  assert.ok(
    service.indexOf("verifyOfferAuthoritative") <
      service.indexOf("await executeCreditCheckout")
  );
  assert.match(service, /currency !== "USD"/);
  console.log("PASS offer_revalidation_before_provider");

  assert.match(service, /assistedBy/);
  assert.match(service, /assistedByAdminUserId/);
  assert.match(service, /admin_assisted_customer_wallet_esim_purchase/);
  assert.match(service, /OrderFundingSource\.CUSTOMER_WALLET/);
  assert.ok(!/COMPANY_FUNDED/.test(service));
  assert.match(service, /balanceCents:\s*\{\s*gte:\s*amountCents/);
  assert.match(service, /amountCents:\s*snapshot\.priceCents/);
  assert.match(service, /executeCreditCheckout/);
  assert.match(service, /FAILED_REFUNDED/);
  assert.match(service, /RECONCILIATION_REQUIRED/);
  assert.match(service, /local_finalize_failed/);
  console.log("PASS shared_wallet_state_machine_reused");

  assert.match(service, /idempotencyKey/);
  assert.match(service, /updateMany/);
  assert.match(service, /status:\s*WalletEsimPurchaseStatus\.READY/);
  assert.ok(
    service.indexOf("FUNDS_RESERVED") <
      service.indexOf("await executeCreditCheckout")
  );
  console.log("PASS durable_idempotency_and_single_provider_call");

  assert.equal(ASSISTED_WALLET_CONFIRM_PHRASE, "PURCHASE");
  assert.equal(parseAssistedWalletConfirmPhrase("PURCHASE").ok, true);
  assert.equal(parseAssistedWalletConfirmPhrase("purchase").ok, false);
  assert.equal(parseAssistedWalletPurchaseReason("help").ok, false);
  assert.equal(
    parseAssistedWalletPurchaseReason("Customer requested package help").ok,
    true
  );
  assert.match(confirmForm, /ASSISTED_WALLET_CONFIRM_PHRASE/);
  assert.doesNotMatch(confirmForm, /Send eSIM details to a different email/);
  assert.match(selectForm, /name="reason"/);
  console.log("PASS mandatory_reason_and_purchase_phrase");

  assert.match(service, /targetUserId/);
  assert.match(service, /reason: assistedReason|reason: purchase\.assistedPurchaseReason/);
  assert.doesNotMatch(service, /iccidEncrypted|qrValue|activationCode|smdp/i);
  assert.doesNotMatch(adminActions, /iccid|qrValue|activationCode|VESIM_PASSWORD/i);
  console.log("PASS audit_metadata_non_sensitive");

  assert.match(emailExtract, /ASSISTED_WALLET_PURCHASE_EMAIL_NOTICE/);
  assert.match(
    emailExtract,
    /purchased for your account by MAP eSIM support using your available wallet balance/
  );
  assert.match(service, /assistedWalletPurchaseNotice:\s*isAssisted/);
  assert.match(emailTemplate, /supportPurchaseNotice/);
  console.log("PASS assisted_email_notice");

  assert.match(customerPage, /Buy eSIM with wallet/);
  assert.match(customerPage, /esim\/wallet-buy/);
  assert.match(customerPage, /esim\/assign/);
  assert.match(successPage, /auditLogId|Audit log reference/);
  assert.match(successPage, /emailDeliveryStatus|Email delivery/);
  assert.match(successPage, /admin\/orders\//);
  console.log("PASS admin_workflow_ui");

  assert.match(adminActions, /consumeRateLimit/);
  assert.match(adminActions, /admin-wallet-buy:admin:/);
  assert.match(adminActions, /admin-wallet-buy:customer:/);
  console.log("PASS rate_limiting");

  // Self-service unchanged entrypoints.
  assert.match(customerActions, /requireRole\("CUSTOMER"\)/);
  assert.doesNotMatch(customerActions, /assistedBy/);
  assert.match(customerActions, /prepareWalletEsimPurchase\(\{/);
  assert.ok(!/assistedBy:/.test(customerActions));
  console.log("PASS self_service_wallet_purchase_unchanged");

  // Company-funded assignment still separate.
  assert.match(adminAssign, /COMPANY_FUNDED/);
  assert.doesNotMatch(adminAssign, /assistedPurchaseReason/);
  assert.doesNotMatch(adminAssign, /WalletEsimPurchase/);
  console.log("PASS company_funded_assignment_unchanged");

  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.match(persist, /captureIccidForProviderOrder/);
  assert.match(capture, /import "server-only"/);
  assert.match(service, /checkoutPayload:\s*successCheckout\.payload/);
  console.log("PASS guest_gate_and_iccid_capture_preserved");

  assert.equal(parseWalletPurchaseIdempotencyKey("abcdefgh").ok, true);
  assert.match(pkg, /qa:admin-wallet-purchase/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=admin-wallet-purchase");
}

main();
