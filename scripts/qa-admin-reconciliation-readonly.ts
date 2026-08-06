/**
 * Offline QA for Phase 8G-A read-only Admin Reconciliation Center.
 * Does not call VeSIM, place orders, mutate wallets, send email, or run backfill.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyReconciliationCase,
  categoryMatchesFilter,
  parseReconciliationFilter,
  RECONCILIATION_FILTERS,
  RECONCILIATION_STUCK_AGE_MS,
} from "../app/lib/admin/reconciliationClassify";
import { maskProviderOrderRef } from "../app/lib/admin/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260806200000_add_reconciliation_foundation/migration.sql";
  assert.ok(existsSync(join(root, migrationPath)));
  const migration = read(migrationPath);
  const persist = read("app/lib/esim/providerResultPersist.ts");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const assignment = read("app/lib/esim/adminPackageAssignment.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");
  const classify = read("app/lib/admin/reconciliationClassify.ts");
  const service = read("app/lib/admin/reconciliation.ts");
  const listPage = read("app/admin/reconciliation/page.tsx");
  const detailPage = read(
    "app/admin/reconciliation/[sourceType]/[attemptId]/page.tsx"
  );
  const nav = read("app/components/admin/AdminNav.tsx");
  const layout = read("app/admin/layout.tsx");
  const authConfig = read("auth.config.ts");
  const headersSrc = read("app/lib/security/headers.ts");
  const pkg = read("package.json");

  assert.match(schema, /providerResultKind\s+String\?/);
  assert.match(schema, /providerObservedAt\s+DateTime\?/);
  assert.match(schema, /safeProviderStatusCode\s+String\?/);
  assert.match(schema, /reconciliationResolvedAt\s+DateTime\?/);
  assert.match(schema, /reconciliationResolvedByAdminId\s+String\?/);
  assert.match(schema, /reconciliationResolutionReason\s+String\?/);
  assert.match(schema, /reconciliationLockedAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[providerOrderId\]\)/);
  assert.match(schema, /@@index\(\[providerResultKind\]\)/);
  assert.match(schema, /@@index\(\[status, updatedAt\]\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "providerResultKind"/);
  assert.match(migration, /WalletEsimPurchase_providerOrderId_idx/);
  console.log("PASS schema_and_nullable_migration");

  assert.match(persist, /persistWalletPurchaseProviderObservation/);
  assert.match(persist, /persistAssignmentProviderObservation/);
  assert.match(persist, /conflict_existing_different/);
  assert.match(persist, /conflict_other_attempt/);
  assert.doesNotMatch(persist, /rawProvider|JSON\.stringify|checkoutPayload/);
  assert.match(persist, /Never stores raw provider payloads/);
  assert.match(walletPurchase, /providerObservation/);
  assert.match(walletPurchase, /persistWalletPurchaseProviderObservation/);
  assert.match(walletPurchase, /providerResultKind:\s*"success"/);
  assert.match(walletPurchase, /providerResultKind:\s*"uncertain"/);
  assert.match(assignment, /persistAssignmentProviderObservation/);
  assert.match(assignment, /providerOrderId: providerOrderId!/);
  assert.match(checkout, /providerOrderId\?:/);
  assert.match(checkout, /providerOrderId,/);
  console.log("PASS providerOrderId_persistence_before_recon");

  assert.equal(RECONCILIATION_STUCK_AGE_MS, 15 * 60 * 1000);
  assert.equal(parseReconciliationFilter("funds_reserved"), "funds_reserved");
  assert.equal(parseReconciliationFilter("nope"), "needs_review");
  assert.equal(RECONCILIATION_FILTERS.length, 10);

  const observed = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "RECONCILIATION_REQUIRED",
    providerOrderId: "PO-ABC-123456",
    providerResultKind: "success",
    failureCategory: "local_finalize_failed",
    failureCode: "order_persist_error",
    updatedAt: new Date(),
  });
  assert.equal(observed, "LOCAL_FINALIZATION_FAILED");

  const missing = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "RECONCILIATION_REQUIRED",
    providerOrderId: null,
    providerResultKind: "uncertain",
    failureCategory: "provider_uncertain",
    updatedAt: new Date(),
  });
  assert.equal(missing, "MISSING_PROVIDER_REFERENCE");

  const stuck = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "FUNDS_RESERVED",
    debitTransactionId: "tx1",
    updatedAt: new Date(Date.now() - RECONCILIATION_STUCK_AGE_MS - 1000),
  });
  assert.equal(stuck, "FUNDS_RESERVED_STUCK");

  const resolved = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "RECONCILIATION_REQUIRED",
    reconciliationResolvedAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(resolved, "RESOLVED");
  assert.equal(categoryMatchesFilter(resolved, "needs_review"), false);
  assert.equal(categoryMatchesFilter(resolved, "resolved"), true);

  const emailCat = classifyReconciliationCase({
    sourceType: "order_email",
    status: "COMPLETED",
    emailDeliveryStatus: "failed",
    updatedAt: new Date(),
  });
  assert.equal(emailCat, "ORDER_EMAIL_FAILED");
  console.log("PASS classifier_local_db_only");

  assert.match(service, /import "server-only"/);
  assert.match(service, /requireActiveAdminForReconciliation/);
  assert.match(service, /role !== Role\.ADMIN/);
  assert.match(service, /deletedAt/);
  assert.doesNotMatch(service, /executeCreditCheckout|getBrokerToken|\/api\/checkout\/credit/);
  assert.doesNotMatch(service, /broker\/orders|fetchBrokerOrder/);
  assert.doesNotMatch(service, /deliverOrderEmail|scheduleWalletTransactionNotification/);
  assert.doesNotMatch(service, /refundReservedFunds|balanceCents:\s*\{/);
  assert.doesNotMatch(service, /iccidEncrypted|qrValue|activationCode|smDp|matchingId/i);
  assert.doesNotMatch(
    service,
    /Mark resolved|refundReservedFunds|deliverOrderEmail|scheduleWallet|backfill-order/i
  );
  assert.doesNotMatch(service, /"use server"/);
  assert.match(service, /maskProviderOrderRef/);
  assert.match(service, /RECONCILIATION_REQUIRED/);
  assert.match(service, /FUNDS_RESERVED/);
  assert.match(service, /emailNotificationStatus/);
  assert.match(service, /iccidHash:\s*null/);
  console.log("PASS reconciliation_service_readonly_no_vesim");

  assert.match(listPage, /requireActiveAdminForReconciliation/);
  assert.match(listPage, /Recovery actions will be available only after provider evidence/);
  assert.doesNotMatch(listPage, /"use server"/);
  assert.doesNotMatch(
    listPage,
    /Mark resolved|Refund now|Finalize order|Resend email|Run backfill/i
  );
  assert.doesNotMatch(listPage, /iccidEncrypted|activationCode|qrValue/i);
  assert.match(detailPage, /requireActiveAdminForReconciliation/);
  assert.match(detailPage, /notFound/);
  assert.match(detailPage, /Timeline/);
  assert.doesNotMatch(detailPage, /"use server"/);
  assert.doesNotMatch(
    detailPage,
    /Mark resolved|Refund now|Finalize order|Resend email|Run backfill/i
  );
  assert.doesNotMatch(detailPage, /<button/i);
  assert.match(nav, /Reconciliation/);
  assert.match(nav, /\/admin\/reconciliation/);
  console.log("PASS readonly_ui_and_nav");

  assert.match(layout, /requireRole\("ADMIN"\)/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false/);
  assert.match(authConfig, /pathname === "\/admin"/);
  assert.match(headersSrc, /"\/admin"/);
  assert.match(headersSrc, /"\/admin\/:path\*"/);
  assert.match(headersSrc, /PRIVATE_NO_STORE/);
  console.log("PASS admin_auth_private_noindex");

  const masked = maskProviderOrderRef("ABCDEFGHIJKLMNOP");
  assert.match(masked, /^ABCD…MNOP$/);
  assert.ok(!masked.includes("EFGHIJKL"));
  assert.doesNotMatch(listPage, /providerOrderId\s*[:=]/);
  assert.doesNotMatch(detailPage, /JSON\.stringify/);
  console.log("PASS provider_ref_masked_no_secrets");

  // Existing purchase / assignment / notification flows must remain intact.
  assert.match(walletPurchase, /executeCreditCheckout/);
  assert.match(walletPurchase, /FAILED_REFUNDED/);
  assert.match(walletPurchase, /scheduleWalletTransactionNotification/);
  assert.match(assignment, /\/api\/checkout\/credit/);
  assert.match(assignment, /COMPANY_FUNDED/);
  assert.ok(!/balanceCents:\s*\{\s*(increment|decrement)/.test(assignment));
  const notify = read("app/lib/wallet/transactionNotification.ts");
  assert.match(notify, /emailNotificationStatus/);
  console.log("PASS existing_flows_unchanged_markers");

  assert.match(pkg, /qa:admin-reconciliation-readonly/);
  assert.doesNotMatch(persist, /checkout\/credit/);
  assert.doesNotMatch(classify, /fetch\(|getBrokerToken|executeCreditCheckout/i);
  assert.match(classify, /no Prisma, no VeSIM/);
  console.log("PASS no_provider_call_in_classify_or_persist");

  console.log("ALL_QA_PASSED=12");
}

main();
