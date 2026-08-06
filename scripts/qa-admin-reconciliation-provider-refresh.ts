/**
 * Offline QA for Phase 8G-B1 evidence-safe provider status refresh.
 * Uses mocked provider responses only — never calls real VeSIM.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseProviderRefreshReason,
  PROVIDER_REFRESH_REASON_MAX,
  PROVIDER_REFRESH_REASON_MIN,
  PROVIDER_REFRESH_STALE_CLAIM_MS,
} from "../app/lib/admin/providerRefreshShared";
import { classifyProviderOrderResponse } from "../app/lib/vesim/providerOrderStatusCore";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260806210000_add_provider_refresh_observation/migration.sql";
  assert.ok(existsSync(join(root, migrationPath)));
  const migration = read(migrationPath);
  const lookup = read("app/lib/vesim/providerOrderStatus.ts");
  const service = read("app/lib/admin/providerRefresh.ts");
  const actions = read("app/lib/admin/providerRefreshActions.ts");
  const form = read("app/components/admin/ProviderRefreshForm.tsx");
  const detail = read(
    "app/admin/reconciliation/[sourceType]/[attemptId]/page.tsx"
  );
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const pkg = read("package.json");

  assert.match(schema, /providerRefreshClaimedAt\s+DateTime\?/);
  assert.match(schema, /providerRefreshResult\s+String\?/);
  assert.match(schema, /providerRefreshSafeCode\s+String\?/);
  assert.match(schema, /@@index\(\[providerRefreshClaimedAt\]\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
  assert.match(migration, /providerRefreshClaimedAt/);
  console.log("PASS schema_and_nullable_migration");

  assert.match(lookup, /\/api\/broker\/orders\//);
  assert.doesNotMatch(lookup, /\/api\/checkout\/credit/);
  assert.match(lookup, /AbortController/);
  assert.match(lookup, /ENVIRONMENT_BLOCKED/);
  assert.match(lookup, /AUTH_FAILURE/);
  assert.match(lookup, /classifyProviderOrderResponse/);
  assert.doesNotMatch(lookup, /console\.(log|info|debug)\(.*payload/i);
  console.log("PASS provider_get_helper_no_checkout");

  const found = classifyProviderOrderResponse({
    httpStatus: 200,
    payload: {
      orderId: "PO-ABCDEFGH1234",
      status: "completed",
      offerId: "OFFER1",
      iccid: "8901234567890123456",
      qrValue: "LPA:1$example$secret",
    },
    requestedProviderOrderId: "PO-ABCDEFGH1234",
    expectedOfferId: "OFFER1",
  });
  assert.equal(found.kind, "FOUND");
  assert.equal(found.orderExists, "yes");
  assert.equal(found.offerMatch, "yes");
  assert.equal(found.installDataPresent, "yes");
  assert.equal(found.safeProviderState, "completed");
  assert.ok(!JSON.stringify(found).includes("8901234567890123456"));
  assert.ok(!JSON.stringify(found).includes("LPA:1"));

  const notFound = classifyProviderOrderResponse({
    httpStatus: 404,
    payload: {},
    requestedProviderOrderId: "PO-MISSING",
  });
  assert.equal(notFound.kind, "NOT_FOUND");
  assert.equal(notFound.orderExists, "no");

  const authFail = classifyProviderOrderResponse({
    httpStatus: 401,
    payload: {},
    requestedProviderOrderId: "PO-X",
  });
  assert.equal(authFail.kind, "AUTH_FAILURE");

  const serverErr = classifyProviderOrderResponse({
    httpStatus: 503,
    payload: {},
    requestedProviderOrderId: "PO-X",
  });
  assert.equal(serverErr.kind, "PROVIDER_ERROR");
  console.log("PASS sanitize_classification_no_secrets");

  assert.equal(PROVIDER_REFRESH_REASON_MIN, 5);
  assert.equal(PROVIDER_REFRESH_REASON_MAX, 200);
  assert.equal(PROVIDER_REFRESH_STALE_CLAIM_MS, 90_000);
  assert.equal(parseProviderRefreshReason("abcd").ok, false);
  assert.equal(parseProviderRefreshReason("Need evidence review").ok, true);
  console.log("PASS reason_validation");

  assert.match(service, /import "server-only"/);
  assert.match(service, /assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /updateMany/);
  assert.match(service, /IN_PROGRESS/);
  assert.match(service, /expectedProviderOrderId/);
  assert.match(service, /browser-supplied/);
  assert.match(actions, /void formData\.get\("providerOrderId"\)/);
  assert.match(service, /PROVIDER_REFRESH_STARTED/);
  assert.match(service, /PROVIDER_REFRESH_COMPLETED/);
  assert.match(service, /PROVIDER_REFRESH_FAILED/);
  assert.match(service, /PROVIDER_REFRESH_BLOCKED/);
  assert.match(service, /maskProviderOrderRef/);
  assert.doesNotMatch(service, /\/api\/checkout\/credit/);
  assert.doesNotMatch(service, /refundReservedFunds|balanceCents:\s*\{/);
  assert.doesNotMatch(service, /deliverOrderEmail|scheduleWalletTransactionNotification/);
  assert.doesNotMatch(service, /persistAssignedOrder|captureOrderIccid|backfill/);
  assert.doesNotMatch(service, /reconciliationResolvedAt:\s*new Date/);
  console.log("PASS refresh_service_safety");

  assert.match(actions, /"use server"/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /void formData\.get\("providerOrderId"\)/);
  assert.match(actions, /refreshProviderOrderStatus/);
  console.log("PASS server_action_csrf_pattern");

  assert.match(form, /Refresh provider status/);
  assert.match(
    form,
    /This checks an existing provider order only\. It will not place another/
  );
  assert.match(form, /name="reason"/);
  assert.doesNotMatch(form, /Mark resolved|Finalize order|Resend email|Run backfill/i);
  assert.match(detail, /ProviderRefreshForm/);
  assert.match(
    detail,
    /Provider status observations do\s+not automatically authorize a\s+refund or local finalization/
  );
  // Case management may expose Mark resolved; financial recovery actions must stay absent.
  assert.doesNotMatch(detail, /Refund now|Finalize order|Resend email|Run backfill/i);
  console.log("PASS ui_form_and_panel");

  assert.doesNotMatch(credit, /providerRefresh/);
  assert.match(pkg, /qa:admin-reconciliation-provider-refresh/);
  assert.ok(
    !service.includes("checkout/credit") && !actions.includes("checkout/credit")
  );
  console.log("PASS no_payment_logic_touched");

  // Authz / block paths present as code contracts (offline).
  assert.match(service, /Not authorized/);
  assert.match(service, /rate_limited/);
  assert.match(service, /provider_ref_mismatch/);
  assert.match(service, /in_progress/);
  assert.match(service, /missing_provider_ref|resolved|conflict|environment_blocked/);
  console.log("PASS authz_and_block_paths");

  console.log("ALL_QA_PASSED=admin-reconciliation-provider-refresh");
}

main();
