/**
 * Phase 8G-Final — combined reconciliation regression and operational review.
 *
 * Offline matrix/safety contracts + orchestrates all reconciliation QA scripts.
 * Never places VeSIM orders, mutates wallets, or calls live provider write APIs.
 *
 * Manual smoke-test checklist (safe mocked/local records only; no live provider mutation):
 * 1. List filters: needs_review / funds / provider / email / iccid / resolved — badges + priority.
 * 2. Detail page: sanitized fields, masked provider ref, no full ICCID/QR/activation in HTML.
 * 3. Lock then unlock: phrase LOCK CASE / UNLOCK CASE; resolved cases refuse both.
 * 4. Escalate then de-escalate: priority raise/lower; DE-ESCALATE CASE phrase; resolved refuse.
 * 5. Provider refresh (wallet_purchase|assignment): GET-only; reason required; observations only.
 * 6. Email resend (order_email|wallet_email): RESEND EMAIL; failed delivery only; no order create.
 * 7. ICCID backfill (iccid|wallet_purchase|assignment): BACKFILL ICCID; conflict never overwrites.
 * 8. Local finalization (wallet_purchase|assignment): FINALIZE LOCAL RECORD; no charge/email.
 * 9. Wallet refund (wallet_purchase only): REFUND WALLET FUNDS; amount from debit; assignment blocked.
 * 10. Manual resolve after unlock when eligibility clears; resolved case permanently read-only.
 * 11. After each recovery: case remains locked and open (no auto unlock/resolve/de-escalate).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASE_MANAGEMENT_SOURCE_TYPES,
  ICCID_BACKFILL_SOURCE_TYPES,
  isIccidBackfillSourceType,
  isLocalFinalizationSourceType,
  isWalletRefundSourceType,
  LOCAL_FINALIZATION_SOURCE_TYPES,
  WALLET_REFUND_SOURCE_TYPES,
  evaluateProviderRefundEvidence,
  evaluateWalletRefundLocalEligibility,
} from "../app/lib/admin/reconciliationCaseShared";
import { isProviderRefreshSourceType } from "../app/lib/admin/providerRefreshShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

type ActionKey =
  | "provider_refresh"
  | "lock"
  | "unlock"
  | "escalate"
  | "deescalate"
  | "mark_resolved"
  | "email_resend"
  | "clear_stuck_send"
  | "iccid_backfill"
  | "local_finalization"
  | "wallet_refund";

const ALL_ACTIONS: ActionKey[] = [
  "provider_refresh",
  "lock",
  "unlock",
  "escalate",
  "deescalate",
  "mark_resolved",
  "email_resend",
  "clear_stuck_send",
  "iccid_backfill",
  "local_finalization",
  "wallet_refund",
];

function emailResendSupported(source: string): boolean {
  return source === "order_email" || source === "wallet_email";
}

function clearStuckSendSupported(source: string): boolean {
  return source === "order_email";
}

function caseMgmtSupported(source: string): boolean {
  return (CASE_MANAGEMENT_SOURCE_TYPES as readonly string[]).includes(source);
}

function expectedSupport(source: string, action: ActionKey): boolean {
  switch (action) {
    case "provider_refresh":
      return isProviderRefreshSourceType(source);
    case "lock":
    case "unlock":
    case "escalate":
    case "deescalate":
    case "mark_resolved":
      return caseMgmtSupported(source);
    case "email_resend":
      return emailResendSupported(source);
    case "clear_stuck_send":
      return clearStuckSendSupported(source);
    case "iccid_backfill":
      return isIccidBackfillSourceType(source);
    case "local_finalization":
      return isLocalFinalizationSourceType(source);
    case "wallet_refund":
      return isWalletRefundSourceType(source);
  }
}

const RECON_QA_SCRIPTS = [
  "qa:admin-reconciliation-readonly",
  "qa:admin-reconciliation-provider-refresh",
  "qa:admin-reconciliation-case-management",
  "qa:admin-reconciliation-deescalate-email-resend",
  "qa:admin-reconciliation-clear-stuck-send",
  "qa:admin-reconciliation-iccid-backfill",
  "qa:admin-reconciliation-local-finalization",
  "qa:admin-reconciliation-wallet-refund",
] as const;

function runNpmScript(script: string) {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`Script ${script} failed (exit ${result.status}):\n${out}`);
  }
}

function main() {
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const listPage = read("app/admin/reconciliation/page.tsx");
  const detailPage = read(
    "app/admin/reconciliation/[sourceType]/[attemptId]/page.tsx"
  );
  const providerRefresh = read("app/lib/admin/providerRefresh.ts");
  const walletRefund = read("app/lib/admin/reconciliationWalletRefund.ts");
  const localFinalize = read(
    "app/lib/admin/reconciliationLocalFinalization.ts"
  );
  const iccidBackfill = read("app/lib/admin/reconciliationIccidBackfill.ts");
  const emailResend = read("app/lib/admin/reconciliationEmailResend.ts");
  const clearStuck = read("app/lib/admin/reconciliationClearStuckSend.ts");
  const caseMgmt = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const refreshActions = read("app/lib/admin/providerRefreshActions.ts");
  const pkg = read("package.json");

  // --- Source / action matrix ---
  const sources = [
    "wallet_purchase",
    "assignment",
    "topup",
    "order_email",
    "wallet_email",
    "iccid",
  ] as const;

  const matrix: Record<string, Record<ActionKey, boolean>> = {};
  for (const source of sources) {
    matrix[source] = {} as Record<ActionKey, boolean>;
    for (const action of ALL_ACTIONS) {
      matrix[source][action] = expectedSupport(source, action);
    }
  }

  assert.deepEqual(matrix.wallet_purchase, {
    provider_refresh: true,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: false,
    clear_stuck_send: false,
    iccid_backfill: true,
    local_finalization: true,
    wallet_refund: true,
  });
  assert.deepEqual(matrix.assignment, {
    provider_refresh: true,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: false,
    clear_stuck_send: false,
    iccid_backfill: true,
    local_finalization: true,
    wallet_refund: false,
  });
  assert.deepEqual(matrix.topup, {
    provider_refresh: false,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: false,
    clear_stuck_send: false,
    iccid_backfill: false,
    local_finalization: false,
    wallet_refund: false,
  });
  assert.deepEqual(matrix.order_email, {
    provider_refresh: false,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: true,
    clear_stuck_send: true,
    iccid_backfill: false,
    local_finalization: false,
    wallet_refund: false,
  });
  assert.deepEqual(matrix.wallet_email, {
    provider_refresh: false,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: true,
    clear_stuck_send: false,
    iccid_backfill: false,
    local_finalization: false,
    wallet_refund: false,
  });
  assert.deepEqual(matrix.iccid, {
    provider_refresh: false,
    lock: true,
    unlock: true,
    escalate: true,
    deescalate: true,
    mark_resolved: true,
    email_resend: false,
    clear_stuck_send: false,
    iccid_backfill: true,
    local_finalization: false,
    wallet_refund: false,
  });

  assert.deepEqual([...WALLET_REFUND_SOURCE_TYPES], ["wallet_purchase"]);
  assert.deepEqual([...LOCAL_FINALIZATION_SOURCE_TYPES], [
    "wallet_purchase",
    "partner_purchase",
    "assignment",
  ]);
  assert.deepEqual([...ICCID_BACKFILL_SOURCE_TYPES], [
    "iccid",
    "wallet_purchase",
    "assignment",
  ]);
  console.log("PASS source_action_matrix");

  // --- UI fail-closed for unsupported recoveries ---
  assert.match(panel, /props\.walletRefundSupported\s*\?/);
  assert.match(panel, /props\.localFinalizationSupported\s*\?/);
  assert.match(panel, /props\.iccidBackfillSupported\s*\?/);
  assert.match(panel, /props\.emailResendSupported\s*\?/);
  assert.match(panel, /props\.clearStuckSendAllowed\s*\?/);
  assert.match(panel, /Refund wallet funds/);
  assert.match(detailPage, /sourceType === "wallet_purchase"/);
  assert.match(detailPage, /sourceType === "assignment"/);
  assert.match(detailPage, /ProviderRefreshForm/);
  console.log("PASS ui_unsupported_controls_gated");

  // --- State transitions: recoveries must not auto unlock/resolve/de-escalate ---
  for (const [name, src] of [
    ["wallet_refund", walletRefund],
    ["local_finalization", localFinalize],
    ["iccid_backfill", iccidBackfill],
    ["email_resend", emailResend],
    ["clear_stuck_send", clearStuck],
    ["provider_refresh", providerRefresh],
  ] as const) {
    assert.doesNotMatch(
      src,
      /reconciliationResolvedAt:\s*new Date/,
      `${name} must not auto-resolve`
    );
    // Clear-lock assignment (data: { reconciliationLockedAt: null }) — allow CAS predicates.
    assert.doesNotMatch(
      src,
      /data:\s*\{[^}]*reconciliationLockedAt:\s*null/,
      `${name} must not auto-unlock`
    );
    assert.doesNotMatch(
      src,
      /data:\s*\{[^}]*reconciliationEscalatedAt:\s*null/,
      `${name} must not auto-de-escalate`
    );
    assert.doesNotMatch(
      src,
      /reconciliationLockedByAdminId:\s*null/,
      `${name} must not clear lock owner`
    );
  }
  assert.match(caseMgmt, /reconciliationLockedAt:\s*null/);
  assert.match(caseMgmt, /reconciliationResolvedAt:\s*(now|new Date)/);
  assert.match(shared, /evaluateResolutionEligibility/);
  assert.match(shared, /case_locked/);
  console.log("PASS state_transition_no_auto_recovery_side_effects");

  // --- Provider GET-only across recovery paths ---
  for (const [name, src] of [
    ["provider_refresh", providerRefresh],
    ["wallet_refund", walletRefund],
    ["local_finalization", localFinalize],
    ["iccid_backfill", iccidBackfill],
    ["email_resend", emailResend],
    ["clear_stuck_send", clearStuck],
  ] as const) {
    assert.doesNotMatch(src, /\/api\/checkout\/credit/);
    assert.doesNotMatch(src, /executeCreditCheckout/);
    assert.doesNotMatch(src, /method:\s*["']POST["']/);
    assert.doesNotMatch(src, /method:\s*["']PUT["']/);
    assert.doesNotMatch(src, /method:\s*["']PATCH["']/);
    assert.doesNotMatch(src, /method:\s*["']DELETE["']/);
    void name;
  }
  assert.match(providerRefresh, /lookupProviderOrderStatus|method:\s*"GET"|GET-only/);
  assert.match(walletRefund, /classifyProviderOrderResponse/);
  assert.match(localFinalize, /classifyProviderOrderResponse|lookupProviderOrderStatus|\/api\/broker\/orders\//);
  console.log("PASS provider_get_only_no_mutation");

  // --- Financial / refund invariants ---
  assert.match(walletRefund, /refundReservedFundsInTx/);
  assert.match(walletRefund, /priceCents:\s*fresh\.priceCents/);
  assert.match(actions, /void formData\.get\("amountCents"\)|void formData\.get\("amount"\)/);
  assert.match(actions, /refundReconciliationWalletPurchase/);
  assert.equal(isWalletRefundSourceType("assignment"), false);
  assert.equal(isWalletRefundSourceType("wallet_purchase"), true);

  const refundBlockedOrder = evaluateWalletRefundLocalEligibility({
    sourceType: "wallet_purchase",
    alreadyResolved: false,
    locked: true,
    lockedByAdminId: "a1",
    currentAdminId: "a1",
    status: "RECONCILIATION_REQUIRED",
    fundingSource: "CUSTOMER_WALLET",
    orderId: "ord_1",
    orderStatus: "COMPLETED",
    providerOrderId: "PO-1",
    offerId: "offer_1",
    customerUserId: "c1",
    priceCents: 1000,
    debitAmountCents: 1000,
    debitStatus: "PENDING",
    debitTransactionId: "d1",
    refundTransactionId: null,
    fulfilmentIccidPresent: false,
    providerInstallDataPresent: false,
    providerRefreshInProgress: false,
  });
  assert.equal(refundBlockedOrder.allowed, false);
  assert.ok(refundBlockedOrder.blockers.includes("usable_local_order_exists"));

  const refundBlockedIccid = evaluateWalletRefundLocalEligibility({
    sourceType: "wallet_purchase",
    alreadyResolved: false,
    locked: true,
    lockedByAdminId: "a1",
    currentAdminId: "a1",
    status: "RECONCILIATION_REQUIRED",
    fundingSource: "CUSTOMER_WALLET",
    orderId: null,
    orderStatus: null,
    providerOrderId: "PO-1",
    offerId: "offer_1",
    customerUserId: "c1",
    priceCents: 1000,
    debitAmountCents: 1000,
    debitStatus: "PENDING",
    debitTransactionId: "d1",
    refundTransactionId: null,
    fulfilmentIccidPresent: true,
    providerInstallDataPresent: false,
    providerRefreshInProgress: false,
  });
  assert.equal(refundBlockedIccid.allowed, false);
  assert.ok(refundBlockedIccid.blockers.includes("fulfilment_iccid_present"));

  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "failed",
      hasExpectedOfferId: true,
    }).ok,
    true
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "completed",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "NOT_FOUND",
      orderExists: "no",
      offerMatch: "unknown",
      installDataPresent: "no",
      safeProviderState: null,
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "TIMEOUT",
      orderExists: "unknown",
      offerMatch: "unknown",
      installDataPresent: "unknown",
      safeProviderState: null,
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  console.log("PASS financial_refund_invariants");

  // --- Auth / same-origin / phrases across mutating paths ---
  for (const [name, src] of [
    ["provider_refresh", providerRefresh],
    ["case_mgmt", caseMgmt],
    ["email_resend", emailResend],
    ["clear_stuck_send", clearStuck],
    ["iccid_backfill", iccidBackfill],
    ["local_finalization", localFinalize],
    ["wallet_refund", walletRefund],
  ] as const) {
    assert.match(src, /assertSameOriginAdminRequest/, `${name} same-origin`);
    assert.match(src, /assertActiveAdmin|role !== Role\.ADMIN/, `${name} active admin`);
    assert.match(src, /consumeRateLimit/, `${name} rate limit`);
  }
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(refreshActions, /requireRole\("ADMIN"\)/);
  assert.match(shared, /LOCK CASE/);
  assert.match(shared, /UNLOCK CASE/);
  assert.match(shared, /RESOLVE CASE/);
  assert.match(shared, /DE-ESCALATE CASE/);
  assert.match(shared, /RESEND EMAIL/);
  assert.match(shared, /CLEAR STUCK SEND/);
  assert.match(shared, /BACKFILL ICCID/);
  assert.match(shared, /FINALIZE LOCAL RECORD/);
  assert.match(shared, /REFUND WALLET FUNDS/);
  console.log("PASS auth_same_origin_phrases_rate_limits");

  // --- Audit sanitization contracts (metadata blocks, not live GET auth headers) ---
  for (const [name, src] of [
    ["wallet_refund", walletRefund],
    ["local_finalization", localFinalize],
    ["iccid_backfill", iccidBackfill],
    ["email_resend", emailResend],
    ["clear_stuck_send", clearStuck],
    ["provider_refresh", providerRefresh],
    ["case_mgmt", caseMgmt],
  ] as const) {
    assert.doesNotMatch(
      src,
      /metadata:\s*\{[^}]*iccidEncrypted|metadata:\s*\{[^}]*qrValue|metadata:\s*\{[^}]*activationCode/i,
      `${name} audit must not embed install secrets`
    );
    assert.doesNotMatch(
      src,
      /writeAuditLog\([\s\S]{0,400}accessToken|writeAuditLog\([\s\S]{0,400}brokerToken/i,
      `${name} audit must not log tokens`
    );
    void name;
  }
  console.log("PASS audit_sanitization_no_sensitive_literals");

  // --- Recovery banner decision (narrowed, not removed) ---
  assert.match(
    listPage,
    /Controlled recovery requires lock ownership, a confirmed reason/
  );
  assert.match(
    listPage,
    /Unsupported source and action combinations\s+remain blocked/
  );
  assert.doesNotMatch(listPage, /Recovery actions are not available in this phase/);
  assert.doesNotMatch(detailPage, /Wallet refunds are not available here/);
  assert.match(
    detailPage,
    /Provider status observations do\s+not automatically authorize a\s+refund or\s+local finalization/
  );
  assert.match(
    detailPage,
    /Successful recoveries keep the case locked and open/
  );
  console.log("PASS recovery_banner_narrowed_accurate");

  // --- Package script ---
  assert.match(pkg, /qa:admin-reconciliation-final/);
  console.log("PASS package_script");

  // --- Orchestrate individual reconciliation QA scripts ---
  for (const script of RECON_QA_SCRIPTS) {
    runNpmScript(script);
    console.log(`PASS orchestrated_${script}`);
  }

  console.log("ALL PASS qa-admin-reconciliation-final");
  console.log("SOURCE_ACTION_MATRIX=" + JSON.stringify(matrix));
}

main();
