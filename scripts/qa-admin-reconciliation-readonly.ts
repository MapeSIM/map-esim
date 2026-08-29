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
  isFailedEmailDelivery,
  isFailedWalletNotification,
  isInboxNotConfiguredOrderEmailDelivery,
  isInboxStaleSendingEmailDelivery,
  isOrderEmailInboxMatch,
  isStaleSendingEmailDelivery,
  isVisibleOrderEmailDelivery,
  orderEmailInboxStatusOr,
  parseReconciliationFilter,
  RECONCILIATION_FILTERS,
  RECONCILIATION_STUCK_AGE_MS,
} from "../app/lib/admin/reconciliationClassify";
import { ORDER_EMAIL_NOT_CONFIGURED_LABEL } from "../app/lib/admin/reconciliationCaseShared";
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
  assert.equal(RECONCILIATION_FILTERS.length, 12);

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

  const now = new Date("2026-08-19T12:00:00.000Z");
  const exactlyStale = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS);
  const justFresh = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS + 1);
  const fourteenMin = new Date(now.getTime() - 14 * 60 * 1000);
  assert.equal(isStaleSendingEmailDelivery("sending", exactlyStale, now), true);
  assert.equal(isStaleSendingEmailDelivery("sending", justFresh, now), false);
  assert.equal(isStaleSendingEmailDelivery("sending", fourteenMin, now), false);
  assert.equal(isStaleSendingEmailDelivery("failed", exactlyStale, now), false);
  assert.equal(isStaleSendingEmailDelivery(null, exactlyStale, now), false);
  assert.equal(isVisibleOrderEmailDelivery("failed", now, now), true);
  assert.equal(isVisibleOrderEmailDelivery("invalid_email", now, now), true);
  assert.equal(isVisibleOrderEmailDelivery("sending", fourteenMin, now), false);
  assert.equal(isVisibleOrderEmailDelivery("sending", exactlyStale, now), true);
  assert.equal(isVisibleOrderEmailDelivery("not_configured", exactlyStale, now), false);
  assert.equal(isVisibleOrderEmailDelivery(null, exactlyStale, now), false);
  assert.equal(isFailedEmailDelivery("not_configured"), false);
  assert.equal(isFailedEmailDelivery("failed"), true);
  assert.equal(isFailedWalletNotification("not_configured"), true);
  assert.equal(
    isInboxNotConfiguredOrderEmailDelivery("not_configured", {
      status: "COMPLETED",
    }),
    true
  );
  assert.equal(
    isInboxNotConfiguredOrderEmailDelivery("not_configured", {
      status: "FUNDS_RESERVED",
    }),
    false
  );
  assert.equal(
    isInboxNotConfiguredOrderEmailDelivery("not_configured", {
      status: "COMPLETED",
      reconciliationResolvedAt: now,
    }),
    false
  );
  assert.equal(
    isInboxNotConfiguredOrderEmailDelivery(null, { status: "COMPLETED" }),
    false
  );
  assert.equal(
    isOrderEmailInboxMatch("not_configured", now, {
      status: "COMPLETED",
      now,
    }),
    true
  );
  assert.equal(
    isOrderEmailInboxMatch("not_configured", now, {
      status: "FUNDS_RESERVED",
      now,
    }),
    false
  );
  assert.equal(
    isOrderEmailInboxMatch(null, now, { status: "COMPLETED", now }),
    false
  );

  const sendingArm = orderEmailInboxStatusOr(now).find(
    (arm) => arm.emailDeliveryStatus === "sending"
  );
  assert.ok(sendingArm);
  assert.equal(sendingArm.status, "COMPLETED");
  assert.equal(sendingArm.reconciliationResolvedAt, null);
  assert.ok(sendingArm.updatedAt?.lte instanceof Date);
  const failedArm = orderEmailInboxStatusOr(now).find(
    (arm) => typeof arm.emailDeliveryStatus === "object"
  );
  assert.ok(failedArm);
  assert.equal(failedArm.status, undefined);
  assert.equal(failedArm.reconciliationResolvedAt, undefined);
  const notConfiguredArm = orderEmailInboxStatusOr(now).find(
    (arm) => arm.emailDeliveryStatus === "not_configured"
  );
  assert.ok(notConfiguredArm);
  assert.equal(notConfiguredArm.status, "COMPLETED");
  assert.equal(notConfiguredArm.reconciliationResolvedAt, null);
  assert.equal(
    isInboxStaleSendingEmailDelivery("sending", exactlyStale, {
      status: "COMPLETED",
      now,
    }),
    true
  );
  assert.equal(
    isInboxStaleSendingEmailDelivery("sending", exactlyStale, {
      status: "COMPLETED",
      reconciliationResolvedAt: now,
      now,
    }),
    false
  );
  assert.equal(
    isInboxStaleSendingEmailDelivery("sending", exactlyStale, {
      status: "FUNDS_RESERVED",
      now,
    }),
    false
  );
  assert.equal(
    isInboxStaleSendingEmailDelivery("sending", fourteenMin, {
      status: "COMPLETED",
      now,
    }),
    false
  );
  assert.equal(
    isOrderEmailInboxMatch("failed", now, {
      status: "FUNDS_RESERVED",
      now,
    }),
    true
  );
  assert.equal(
    isOrderEmailInboxMatch("sending", exactlyStale, {
      status: "COMPLETED",
      reconciliationResolvedAt: now,
      now,
    }),
    false
  );
  assert.equal(
    isOrderEmailInboxMatch("sending", exactlyStale, {
      status: "COMPLETED",
      now,
    }),
    true
  );

  const staleSendingCat = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: exactlyStale,
    now,
  });
  assert.equal(staleSendingCat, "ORDER_EMAIL_FAILED");
  const freshSendingCat = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: fourteenMin,
    now,
  });
  assert.equal(freshSendingCat, "PROVIDER_UNKNOWN");
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
  assert.match(service, /orderEmailInboxStatusOr|emailDeliveryStatus:\s*"sending"/);
  assert.match(service, /isOrderEmailInboxMatch/);
  assert.match(service, /sending \(uncertain\)/);
  assert.match(service, /ORDER_EMAIL_NOT_CONFIGURED_LABEL|Installation email service is not configured/);
  assert.match(service, /isNotConfiguredOrderEmailDelivery/);
  assert.doesNotMatch(service, /emailDeliveryStatus:\s*"sending"[\s\S]{0,80}deliverOrderEmail/);
  console.log("PASS reconciliation_service_readonly_no_vesim");

  assert.match(listPage, /requireActiveAdminForReconciliation/);
  assert.match(
    listPage,
    /Controlled recovery requires lock ownership, a confirmed reason/
  );
  assert.match(
    listPage,
    /Provider observations never auto-authorize refund/
  );
  assert.doesNotMatch(listPage, /Recovery actions are not available in this phase/);
  assert.doesNotMatch(
    listPage,
    /Recovery actions will be available only after provider evidence/
  );
  assert.doesNotMatch(listPage, /"use server"/);
  assert.doesNotMatch(
    listPage,
    /Mark resolved|Refund now|Finalize order|Resend email|Run backfill/i
  );
  assert.doesNotMatch(listPage, /iccidEncrypted|activationCode|qrValue/i);
  assert.match(detailPage, /requireActiveAdminForReconciliation/);
  assert.match(detailPage, /notFound/);
  assert.match(detailPage, /isValidReconciliationSourceType/);
  assert.match(detailPage, /Reconciliation case unavailable/);
  assert.match(
    detailPage,
    /may already be resolved, may no longer require reconciliation/
  );
  assert.match(detailPage, /Back to Reconciliation/);
  assert.match(detailPage, /Back to Admin/);
  assert.match(
    detailPage,
    /Opening this page never moves/
  );
  assert.match(detailPage, /funds/);
  assert.match(detailPage, /Timeline/);
  assert.ok(detailPage.includes(ORDER_EMAIL_NOT_CONFIGURED_LABEL));
  assert.match(detailPage, /failureLabel === ORDER_EMAIL_NOT_CONFIGURED_LABEL/);
  assert.match(detailPage, /Delivery was not sent/);
  assert.match(detailPage, /Configure the Orders email channel before resending/);
  assert.doesNotMatch(detailPage, /"use server"/);
  // Phase 8G-B2 may add Mark resolved (case metadata only). Financial recovery stays forbidden.
  assert.doesNotMatch(
    detailPage,
    /Refund now|Finalize order|Resend email|Run backfill|ICCID backfill/i
  );
  assert.match(nav, /Reconciliation/);
  assert.match(nav, /\/admin\/reconciliation/);
  console.log("PASS readonly_ui_and_nav");

  const reviewNeeded = read(
    "app/admin/customers/[id]/esim/wallet-buy/review-needed/page.tsx"
  );
  assert.match(reviewNeeded, /Open reconciliation case/);
  assert.match(
    reviewNeeded,
    /\/admin\/reconciliation\/wallet_purchase\/\$\{encodeURIComponent\(purchase\.purchaseId\)\}/
  );
  assert.doesNotMatch(reviewNeeded, /orderId|paymentAttempt|attemptId/);
  assert.doesNotMatch(reviewNeeded, /"use server"/);
  assert.doesNotMatch(
    reviewNeeded,
    /confirmWalletEsimPurchase|finalizeReconciliation|providerRefresh|refundWallet/i
  );
  assert.match(reviewNeeded, /Back to customer/);
  assert.match(service, /href: `\/admin\/reconciliation\/wallet_purchase\/\$\{row\.id\}`/);
  console.log("PASS wallet_review_needed_recon_link");

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
  assert.match(
    classify,
    /emailDeliveryStatus:\s*"sending",[\s\S]*?status:\s*"COMPLETED",[\s\S]*?reconciliationResolvedAt:\s*null/
  );
  console.log("PASS no_provider_call_in_classify_or_persist");

  console.log("ALL_QA_PASSED=12");
}

main();
