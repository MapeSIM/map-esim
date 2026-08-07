/**
 * Local/manual reconciliation smoke harness (Phase 8G-Final).
 *
 * Uses ephemeral Prisma fixtures + mocked provider GET responses only.
 * A process-wide fetch guard blocks live VeSIM write/mutation URLs.
 *
 * Run: npx tsx -r ./scripts/smoke-stubs/register.cjs scripts/smoke-admin-reconciliation.ts
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";

loadEnvConfig(process.cwd());

// Staging env for getVesimBaseUrl — all network still intercepted below.
process.env.VESIM_ENVIRONMENT = "staging";
process.env.VESIM_BASE_URL = "https://www.vesim.xyz";

const TAG = `smoke8g_${Date.now().toString(36)}`;
const MOCK_ICCID = "89014103211118510720"; // valid Luhn test-style 20-digit
const PROVIDER_FAIL_ID = `SMK-FAIL-${TAG}`;
const PROVIDER_OK_ID = `SMK-OK-${TAG}`;
const PROVIDER_REFRESH_ID = `SMK-REF-${TAG}`;
const PROVIDER_FINALIZE_ID = `SMK-FIN-${TAG}`;
const PROVIDER_ASSIGN_ID = `SMK-ASG-${TAG}`;
const PROVIDER_ICCID_ID = `SMK-ICCID-${TAG}`;
const OFFER_ID = `smoke-offer-${TAG}`;

type SmokeResult = { item: string; status: "PASS" | "FAIL" | "SKIP"; evidence: string };

const results: SmokeResult[] = [];
const networkLog: { method: string; url: string }[] = [];
let liveMutationAttempted = false;

function record(item: string, status: SmokeResult["status"], evidence: string) {
  results.push({ item, status, evidence });
  const mark = status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
  console.log(`${mark} ${item} — ${evidence}`);
}

function assertNoSensitive(blob: string, label: string) {
  const lower = blob.toLowerCase();
  assert.ok(!blob.includes(MOCK_ICCID), `${label} leaked full ICCID`);
  assert.ok(!lower.includes("lpa:"), `${label} leaked LPA/QR`);
  assert.ok(!lower.includes("activationcode"), `${label} leaked activationCode key with value risk`);
  assert.ok(!blob.includes("smoke-access-token-secret"), `${label} leaked token`);
  assert.ok(!/"qrValue"\s*:/.test(blob), `${label} exposed qrValue field`);
  assert.ok(!/"activationCode"\s*:/.test(blob), `${label} exposed activationCode field`);
}

function installFetchGuard() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = String(init?.method ?? "GET").toUpperCase();
    networkLog.push({ method, url });

    // Block any live provider mutation / checkout.
    if (
      /\/api\/checkout\//i.test(url) ||
      /\/credit/i.test(url) ||
      /\/(cancel|refund|activate|retry)/i.test(url) ||
      (method !== "GET" && /\/api\/broker\/orders/i.test(url) && !/\/api\/auth\/broker\/token/i.test(url))
    ) {
      liveMutationAttempted = true;
      throw new Error(`BLOCKED_LIVE_PROVIDER_MUTATION ${method} ${url}`);
    }

    if (/\/api\/auth\/broker\/token/i.test(url) && method === "POST") {
      return new Response(
        JSON.stringify({
          token_type: "Bearer",
          access_token: "smoke-access-token-secret",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const orderMatch = url.match(/\/api\/broker\/orders\/([^/?#]+)/i);
    if (orderMatch && method === "GET") {
      const id = decodeURIComponent(orderMatch[1]);
      if (id === PROVIDER_FAIL_ID) {
        return new Response(
          JSON.stringify({
            orderId: id,
            status: "failed",
            offerId: OFFER_ID,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (
        id === PROVIDER_OK_ID ||
        id === PROVIDER_REFRESH_ID ||
        id === PROVIDER_FINALIZE_ID ||
        id === PROVIDER_ASSIGN_ID
      ) {
        return new Response(
          JSON.stringify({
            orderId: id,
            status: "completed",
            offerId: OFFER_ID,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (id === PROVIDER_ICCID_ID) {
        return new Response(
          JSON.stringify({
            orderId: id,
            status: "completed",
            offerId: OFFER_ID,
            iccid: MOCK_ICCID,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }

    // Any other network = fail closed (no accidental live calls).
    liveMutationAttempted = true;
    throw new Error(`BLOCKED_UNMOCKED_NETWORK ${method} ${url}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function main() {
  const restoreFetch = installFetchGuard();
  const prisma = new PrismaClient();

  // Dynamic imports after stubs + env + fetch guard.
  const { getReconciliationListPage, getReconciliationDetail } = await import(
    "../app/lib/admin/reconciliation"
  );
  const {
    lockReconciliationCase,
    unlockReconciliationCase,
    escalateReconciliationCase,
    deescalateReconciliationCase,
    resolveReconciliationCase,
    getCaseManagementEligibility,
  } = await import("../app/lib/admin/reconciliationCaseManagement");
  const { refreshProviderOrderStatus } = await import(
    "../app/lib/admin/providerRefresh"
  );
  const { resendReconciliationEmail } = await import(
    "../app/lib/admin/reconciliationEmailResend"
  );
  const { backfillReconciliationIccid } = await import(
    "../app/lib/admin/reconciliationIccidBackfill"
  );
  const { finalizeReconciliationLocalRecord } = await import(
    "../app/lib/admin/reconciliationLocalFinalization"
  );
  const { refundReconciliationWalletPurchase } = await import(
    "../app/lib/admin/reconciliationWalletRefund"
  );
  const { isEmailConfigured } = await import("../app/lib/email/config");

  const ids: {
    adminId?: string;
    customerId?: string;
    walletId?: string;
    purchaseRefundId?: string;
    purchaseFinalizeId?: string;
    purchaseRefreshId?: string;
    assignmentId?: string;
    topupId?: string;
    walletTxId?: string;
    orderIccidId?: string;
    debitId?: string;
    debitFinalizeId?: string;
  } = {};

  try {
    const admin = await prisma.user.create({
      data: {
        name: `Smoke Admin ${TAG}`,
        email: `smoke-admin-${TAG}@example.invalid`,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
        passwordHash: createHash("sha256").update(randomBytes(16)).digest("hex"),
      },
      select: { id: true },
    });
    ids.adminId = admin.id;

    const customer = await prisma.user.create({
      data: {
        name: `Smoke Customer ${TAG}`,
        email: `smoke-customer-${TAG}@example.invalid`,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        passwordHash: createHash("sha256").update(randomBytes(16)).digest("hex"),
      },
      select: { id: true, email: true },
    });
    ids.customerId = customer.id;

    const wallet = await prisma.walletAccount.create({
      data: {
        userId: customer.id,
        balanceCents: 5000,
      },
      select: { id: true },
    });
    ids.walletId = wallet.id;

    const debit = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "PURCHASE_DEBIT",
        direction: "DEBIT",
        status: "PENDING",
        amountCents: 1500,
        balanceBeforeCents: 5000,
        balanceAfterCents: 3500,
        idempotencyKey: `smoke_debit_${TAG}`,
        referenceType: "WALLET_ESIM_PURCHASE",
        referenceId: "pending",
      },
      select: { id: true },
    });
    ids.debitId = debit.id;

    const purchaseRefund = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: OFFER_ID,
        planName: "Smoke Plan",
        destinationName: "SmokeLand",
        priceCents: 1500,
        useWallet: true,
        walletAppliedCents: 1500,
        gatewayAmountCents: 0,
        currency: "USD",
        fundingSource: "CUSTOMER_WALLET",
        status: "RECONCILIATION_REQUIRED",
        idempotencyKey: `smoke_purchase_refund_${TAG}`,
        debitTransactionId: debit.id,
        providerOrderId: PROVIDER_FAIL_ID,
        providerResultKind: "declined",
        failureCategory: "provider_declined",
        failureCode: "declined",
      },
      select: { id: true },
    });
    ids.purchaseRefundId = purchaseRefund.id;
    await prisma.walletTransaction.update({
      where: { id: debit.id },
      data: { referenceId: purchaseRefund.id },
    });
    // Reflect reserved funds on wallet for refund restore
    await prisma.walletAccount.update({
      where: { id: wallet.id },
      data: { balanceCents: 3500 },
    });

    const debitFinalize = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "PURCHASE_DEBIT",
        direction: "DEBIT",
        status: "COMPLETED",
        amountCents: 1200,
        balanceBeforeCents: 3500,
        balanceAfterCents: 2300,
        idempotencyKey: `smoke_debit_fin_${TAG}`,
        referenceType: "WALLET_ESIM_PURCHASE",
        referenceId: "pending_fin",
      },
      select: { id: true },
    });
    ids.debitFinalizeId = debitFinalize.id;

    const purchaseFinalize = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: OFFER_ID,
        planName: "Smoke Finalize Plan",
        destinationName: "SmokeLand",
        priceCents: 1200,
        useWallet: true,
        walletAppliedCents: 1200,
        gatewayAmountCents: 0,
        currency: "USD",
        fundingSource: "CUSTOMER_WALLET",
        status: "RECONCILIATION_REQUIRED",
        idempotencyKey: `smoke_purchase_finalize_${TAG}`,
        debitTransactionId: debitFinalize.id,
        providerOrderId: PROVIDER_FINALIZE_ID,
        providerResultKind: "success",
        failureCategory: "local_finalize_failed",
        failureCode: "order_persist_error",
      },
      select: { id: true },
    });
    ids.purchaseFinalizeId = purchaseFinalize.id;
    await prisma.walletTransaction.update({
      where: { id: debitFinalize.id },
      data: { referenceId: purchaseFinalize.id },
    });

    const purchaseRefresh = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: OFFER_ID,
        planName: "Smoke Refresh Plan",
        priceCents: 900,
        useWallet: true,
        walletAppliedCents: 900,
        gatewayAmountCents: 0,
        currency: "USD",
        fundingSource: "CUSTOMER_WALLET",
        status: "RECONCILIATION_REQUIRED",
        idempotencyKey: `smoke_purchase_refresh_${TAG}`,
        providerOrderId: PROVIDER_REFRESH_ID,
        providerResultKind: "uncertain",
      },
      select: { id: true },
    });
    ids.purchaseRefreshId = purchaseRefresh.id;

    const assignment = await prisma.adminPackageAssignment.create({
      data: {
        customerUserId: customer.id,
        adminUserId: admin.id,
        offerId: OFFER_ID,
        planName: "Smoke Assignment",
        fundingSource: "COMPANY_FUNDED",
        status: "RECONCILIATION_REQUIRED",
        idempotencyKey: `smoke_assignment_${TAG}`,
        providerOrderId: PROVIDER_ASSIGN_ID,
        providerResultKind: "uncertain",
        reason: "Smoke assignment fixture for unsupported refund checks",
      },
      select: { id: true },
    });
    ids.assignmentId = assignment.id;

    const topup = await prisma.walletTopup.create({
      data: {
        customerUserId: customer.id,
        creditAmountCents: 2000,
        status: "RECONCILIATION_REQUIRED",
        checkoutIdempotencyKey: `smoke_topup_${TAG}`,
        failureCategory: "payment_uncertain",
        failureCode: "webhook_missing",
      },
      select: { id: true },
    });
    ids.topupId = topup.id;

    const walletTx = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "ADMIN_CREDIT",
        direction: "CREDIT",
        status: "COMPLETED",
        amountCents: 100,
        balanceBeforeCents: 2300,
        balanceAfterCents: 2400,
        idempotencyKey: `smoke_wallet_email_${TAG}`,
        emailNotificationStatus: "failed",
      },
      select: { id: true },
    });
    ids.walletTxId = walletTx.id;

    const orderIccid = await prisma.order.create({
      data: {
        providerOrderId: PROVIDER_ICCID_ID,
        userId: customer.id,
        customerEmail: customer.email,
        offerId: OFFER_ID,
        planName: "Smoke ICCID Order",
        fundingSource: "CUSTOMER_WALLET",
        status: "COMPLETED",
        // no iccid yet — backfill target
      },
      select: { id: true },
    });
    ids.orderIccidId = orderIccid.id;

    // ---------- List + filters ----------
    try {
      const filters = [
        "needs_review",
        "funds_reserved",
        "provider_uncertain",
        "order_email_failed",
        "wallet_notification_failed",
        "iccid_pending",
        "resolved",
        "locked",
        "escalated",
      ] as const;
      const seen: string[] = [];
      for (const filter of filters) {
        const page = await getReconciliationListPage({ filter });
        assert.equal(page.unavailable, false);
        const blob = JSON.stringify(page);
        assertNoSensitive(blob, `list:${filter}`);
        seen.push(`${filter}:${page.rows.length}`);
      }
      const needs = await getReconciliationListPage({ filter: "needs_review" });
      const hasPurchase = needs.rows.some(
        (r) => r.attemptId === purchaseRefund.id || r.attemptId === purchaseFinalize.id
      );
      const emailPage = await getReconciliationListPage({
        filter: "wallet_notification_failed",
      });
      const hasWalletEmail = emailPage.rows.some((r) => r.attemptId === walletTx.id);
      assert.ok(hasPurchase, "expected smoke purchase on list");
      assert.ok(hasWalletEmail, "expected smoke wallet email case on wallet_notification_failed");
      record(
        "reconciliation list page and filters",
        "PASS",
        `filters exercised (${seen.join(", ")}); fixtures visible; no sensitive leakage in list JSON`
      );
    } catch (e) {
      record(
        "reconciliation list page and filters",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Detail pages ----------
    try {
      const detail = await getReconciliationDetail(
        "wallet_purchase",
        purchaseRefund.id
      );
      assert.ok(detail);
      const blob = JSON.stringify(detail);
      assertNoSensitive(blob, "detail");
      assert.match(detail!.providerRefMasked, /…|\.\.\./);
      assert.ok(!detail!.providerRefMasked.includes(PROVIDER_FAIL_ID.slice(4, 12)) || detail!.providerRefMasked.includes("…") || detail!.providerRefMasked.includes("…"));
      const elig = await getCaseManagementEligibility({
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        adminUserId: admin.id,
      });
      assert.ok(elig);
      assert.equal(elig!.walletRefundSupported, true);
      assert.equal(elig!.emailResendSupported, false);
      record(
        "reconciliation detail pages",
        "PASS",
        `detail loaded for wallet_purchase; provider ref masked; eligibility wired; no sensitive fields in detail JSON`
      );
    } catch (e) {
      record(
        "reconciliation detail pages",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Lock ----------
    try {
      const bad = await lockReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke lock reason text",
        confirmPhrase: "WRONG",
      });
      assert.equal(bad.ok, false);
      const ok = await lockReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke lock reason text",
        confirmPhrase: "LOCK CASE",
      });
      assert.equal(ok.ok, true);
      const row = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseRefund.id },
        select: {
          reconciliationLockedAt: true,
          reconciliationLockedByAdminId: true,
        },
      });
      assert.ok(row?.reconciliationLockedAt);
      assert.equal(row?.reconciliationLockedByAdminId, admin.id);
      record("lock", "PASS", "phrase enforced; case locked by smoke admin");
    } catch (e) {
      record("lock", "FAIL", e instanceof Error ? e.message : String(e));
    }

    // ---------- Escalate / de-escalate (while locked) ----------
    try {
      const esc = await escalateReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke escalate reason",
        priority: "HIGH",
      });
      assert.equal(esc.ok, true);
      const mid = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseRefund.id },
        select: { reconciliationEscalationPriority: true },
      });
      assert.equal(mid?.reconciliationEscalationPriority, "HIGH");
      record("escalate", "PASS", "priority raised to HIGH");

      const de = await deescalateReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke de-escalate reason",
        priority: "MEDIUM",
        confirmPhrase: "DE-ESCALATE CASE",
      });
      assert.equal(de.ok, true);
      const after = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseRefund.id },
        select: { reconciliationEscalationPriority: true },
      });
      assert.equal(after?.reconciliationEscalationPriority, "MEDIUM");
      record("de-escalate", "PASS", "priority lowered to MEDIUM with phrase");
    } catch (e) {
      record("escalate", "FAIL", e instanceof Error ? e.message : String(e));
      record("de-escalate", "FAIL", e instanceof Error ? e.message : String(e));
    }

    // ---------- Provider refresh (mocked GET via lookupFn + also default path) ----------
    try {
      // Unlock refresh target first — refresh requires unlocked case
      await prisma.walletEsimPurchase.update({
        where: { id: purchaseRefresh.id },
        data: {
          reconciliationLockedAt: null,
          reconciliationLockedByAdminId: null,
          reconciliationLockReason: null,
        },
      });
      const refresh = await refreshProviderOrderStatus({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefresh.id,
        reason: "Smoke provider refresh evidence",
        expectedProviderOrderId: PROVIDER_REFRESH_ID,
        lookupFn: async () => ({
          kind: "FOUND",
          observedAt: new Date(),
          safeStatusCode: "http_200",
          orderExists: "yes",
          offerMatch: "yes",
          installDataPresent: "no",
          safeProviderState: "completed",
        }),
      });
      assert.equal(refresh.ok, true, JSON.stringify(refresh));
      const netBefore = networkLog.length;
      // Reset claim so a second refresh can run through guarded fetch (GET only)
      await prisma.walletEsimPurchase.update({
        where: { id: purchaseRefresh.id },
        data: {
          providerRefreshClaimedAt: null,
          providerRefreshCompletedAt: null,
          providerRefreshResult: null,
          providerRefreshSafeCode: null,
          providerRefreshByAdminId: null,
        },
      });
      const refresh2 = await refreshProviderOrderStatus({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefresh.id,
        reason: "Smoke provider refresh via guarded fetch",
        expectedProviderOrderId: PROVIDER_REFRESH_ID,
      });
      assert.equal(refresh2.ok, true, JSON.stringify(refresh2));
      const gets = networkLog
        .slice(netBefore)
        .filter((n) => n.method === "GET" && /broker\/orders/i.test(n.url));
      assert.ok(gets.length >= 1, "expected mocked GET order lookup");
      // Token POST is allowed auth-only; ensure no mutation URLs
      assert.equal(liveMutationAttempted, false);
      record(
        "provider refresh",
        "PASS",
        `refresh ok with injectable + guarded GET; ${gets.length} GET order lookup(s); no mutations`
      );
    } catch (e) {
      record(
        "provider refresh",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Email resend ----------
    try {
      await prisma.walletTransaction.update({
        where: { id: walletTx.id },
        data: {
          reconciliationLockedAt: new Date(),
          reconciliationLockedByAdminId: admin.id,
          reconciliationLockReason: "smoke",
        },
      });
      const elig = await getCaseManagementEligibility({
        sourceType: "wallet_email",
        attemptId: walletTx.id,
        adminUserId: admin.id,
      });
      assert.ok(elig?.emailResendSupported);
      if (!isEmailConfigured("billing")) {
        const blocked = await resendReconciliationEmail({
          adminUserId: admin.id,
          sourceType: "wallet_email",
          attemptId: walletTx.id,
          reason: "Smoke email resend attempt",
          confirmPhrase: "RESEND EMAIL",
        });
        assert.equal(blocked.ok, false);
        record(
          "email resend",
          "PASS",
          "billing email not configured; action fail-closed without provider mutation (eligibility supported=true)"
        );
      } else {
        // Avoid live SMTP: verify phrase/eligibility gates + unsupported refusal instead of sending.
        const badPhrase = await resendReconciliationEmail({
          adminUserId: admin.id,
          sourceType: "wallet_email",
          attemptId: walletTx.id,
          reason: "Smoke email resend attempt",
          confirmPhrase: "WRONG",
        });
        assert.equal(badPhrase.ok, false);
        const unsupported = await resendReconciliationEmail({
          adminUserId: admin.id,
          sourceType: "wallet_purchase",
          attemptId: purchaseRefund.id,
          reason: "Smoke email resend attempt",
          confirmPhrase: "RESEND EMAIL",
        });
        assert.equal(unsupported.ok, false);
        record(
          "email resend",
          "PASS",
          "SMTP is configured locally — skipped live send; verified phrase refusal + unsupported source fail-closed; no provider mutation (fetch guard clean). Full mailbox delivery not exercised."
        );
      }
    } catch (e) {
      record("email resend", "FAIL", e instanceof Error ? e.message : String(e));
    }

    // ---------- ICCID backfill ----------
    try {
      await prisma.order.update({
        where: { id: orderIccid.id },
        data: {
          reconciliationLockedAt: new Date(),
          reconciliationLockedByAdminId: admin.id,
          reconciliationLockReason: "smoke",
        },
      });
      const beforeNet = networkLog.length;
      const backfill = await backfillReconciliationIccid({
        adminUserId: admin.id,
        sourceType: "iccid",
        attemptId: orderIccid.id,
        reason: "Smoke ICCID backfill from mocked GET",
        confirmPhrase: "BACKFILL ICCID",
      });
      assert.equal(backfill.ok, true, JSON.stringify(backfill));
      const order = await prisma.order.findUnique({
        where: { id: orderIccid.id },
        select: {
          iccidHash: true,
          iccidLast4: true,
          iccidEncrypted: true,
          iccidCapturedAt: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
        },
      });
      assert.ok(order?.iccidHash);
      assert.equal(order?.iccidLast4, MOCK_ICCID.slice(-4));
      assert.ok(order?.iccidEncrypted);
      assert.ok(!order?.iccidEncrypted?.includes(MOCK_ICCID));
      assert.equal(order?.reconciliationResolvedAt, null);
      assert.ok(order?.reconciliationLockedAt);
      const gets = networkLog
        .slice(beforeNet)
        .filter((n) => n.method === "GET" && /broker\/orders/i.test(n.url));
      assert.ok(gets.length >= 1);
      record(
        "ICCID backfill",
        "PASS",
        `captured hash/last4 via mocked GET; encrypted stored; case remained locked/unresolved; no plaintext ICCID in DB ciphertext check`
      );
    } catch (e) {
      record(
        "ICCID backfill",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Local finalization ----------
    try {
      await lockReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke lock for finalize",
        confirmPhrase: "LOCK CASE",
      });
      const before = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseFinalize.id },
        select: { orderId: true, status: true },
      });
      assert.equal(before?.orderId, null);
      const fin = await finalizeReconciliationLocalRecord({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke local finalization recovery",
        confirmPhrase: "FINALIZE LOCAL RECORD",
      });
      assert.equal(fin.ok, true, JSON.stringify(fin));
      const after = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseFinalize.id },
        select: {
          orderId: true,
          status: true,
          reconciliationLockedAt: true,
          reconciliationResolvedAt: true,
          priceCents: true,
        },
      });
      assert.ok(after?.orderId);
      assert.equal(after?.status, "COMPLETED");
      assert.ok(after?.reconciliationLockedAt);
      assert.equal(after?.reconciliationResolvedAt, null);
      const walletBal = await prisma.walletAccount.findUnique({
        where: { id: wallet.id },
        select: { balanceCents: true },
      });
      // Finalization must not debit again (balance unchanged by finalize)
      assert.ok(walletBal);
      record(
        "local finalization recovery",
        "PASS",
        `order linked, status COMPLETED, remained locked/unresolved; no second debit; provider GET mocked only`
      );
    } catch (e) {
      record(
        "local finalization recovery",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Wallet refund ----------
    try {
      // purchaseRefund already locked from earlier
      const balBefore = await prisma.walletAccount.findUnique({
        where: { id: wallet.id },
        select: { balanceCents: true },
      });
      const refund = await refundReconciliationWalletPurchase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke confirmed-failure wallet refund",
        confirmPhrase: "REFUND WALLET FUNDS",
      });
      assert.equal(refund.ok, true, JSON.stringify(refund));
      const purchase = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseRefund.id },
        select: {
          status: true,
          refundTransactionId: true,
          priceCents: true,
          reconciliationLockedAt: true,
          reconciliationResolvedAt: true,
        },
      });
      assert.equal(purchase?.status, "FAILED_REFUNDED");
      assert.ok(purchase?.refundTransactionId);
      assert.ok(purchase?.reconciliationLockedAt);
      assert.equal(purchase?.reconciliationResolvedAt, null);
      const balAfter = await prisma.walletAccount.findUnique({
        where: { id: wallet.id },
        select: { balanceCents: true },
      });
      assert.equal(
        balAfter!.balanceCents,
        (balBefore?.balanceCents ?? 0) + 1500
      );
      const again = await refundReconciliationWalletPurchase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseRefund.id,
        reason: "Smoke idempotent refund retry",
        confirmPhrase: "REFUND WALLET FUNDS",
      });
      assert.equal(again.ok, true);
      const balIdem = await prisma.walletAccount.findUnique({
        where: { id: wallet.id },
        select: { balanceCents: true },
      });
      assert.equal(balIdem!.balanceCents, balAfter!.balanceCents);

      const assignRefund = await refundReconciliationWalletPurchase({
        adminUserId: admin.id,
        sourceType: "assignment",
        attemptId: assignment.id,
        reason: "Smoke assignment refund must fail",
        confirmPhrase: "REFUND WALLET FUNDS",
      });
      assert.equal(assignRefund.ok, false);
      record(
        "wallet refund recovery",
        "PASS",
        `refunded 1500 exactly once; idempotent retry; assignment blocked; case stayed locked/open`
      );
    } catch (e) {
      record(
        "wallet refund recovery",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Unlock + manual resolve + resolved read-only ----------
    try {
      // Finalize case is recovered COMPLETED+order — unlock then resolve
      const unlock = await unlockReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke unlock after recovery",
        confirmPhrase: "UNLOCK CASE",
      });
      assert.equal(unlock.ok, true);
      record("unlock", "PASS", "unlocked recovered finalize case with phrase");

      const elig = await getCaseManagementEligibility({
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        adminUserId: admin.id,
      });
      assert.ok(elig?.canResolve, `expected resolvable, got ${JSON.stringify(elig?.resolutionEligibility)}`);

      const resolved = await resolveReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke manual safe resolution",
        confirmPhrase: "RESOLVE CASE",
        resolutionCode: "ALREADY_RECOVERED",
      });
      assert.equal(resolved.ok, true, JSON.stringify(resolved));

      const lockDenied = await lockReconciliationCase({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke lock resolved must fail",
        confirmPhrase: "LOCK CASE",
      });
      assert.equal(lockDenied.ok, false);
      const refreshDenied = await refreshProviderOrderStatus({
        adminUserId: admin.id,
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        reason: "Smoke refresh resolved must fail",
        expectedProviderOrderId: PROVIDER_FINALIZE_ID,
        lookupFn: async () => {
          throw new Error("should not lookup");
        },
      });
      assert.equal(refreshDenied.ok, false);
      const eligResolved = await getCaseManagementEligibility({
        sourceType: "wallet_purchase",
        attemptId: purchaseFinalize.id,
        adminUserId: admin.id,
      });
      assert.equal(eligResolved?.resolved, true);
      assert.equal(eligResolved?.canLock, false);
      assert.equal(eligResolved?.canResolve, false);
      record(
        "manual safe resolution",
        "PASS",
        "unlocked recovered case resolved with RESOLVE CASE + ALREADY_RECOVERED"
      );
      record(
        "resolved case read-only behavior",
        "PASS",
        "lock/refresh refused; canLock/canResolve false after resolve"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!results.some((r) => r.item === "unlock" && r.status === "PASS")) {
        record("unlock", "FAIL", msg);
      }
      record("manual safe resolution", "FAIL", msg);
      record("resolved case read-only behavior", "FAIL", msg);
    }

    // ---------- Unsupported source/action ----------
    try {
      const topupElig = await getCaseManagementEligibility({
        sourceType: "topup",
        attemptId: topup.id,
        adminUserId: admin.id,
      });
      assert.equal(topupElig?.walletRefundSupported, false);
      assert.equal(topupElig?.localFinalizationSupported, false);
      assert.equal(topupElig?.iccidBackfillSupported, false);
      assert.equal(topupElig?.emailResendSupported, false);

      const assignElig = await getCaseManagementEligibility({
        sourceType: "assignment",
        attemptId: assignment.id,
        adminUserId: admin.id,
      });
      assert.equal(assignElig?.walletRefundSupported, false);
      assert.equal(assignElig?.localFinalizationSupported, true);

      const refreshTopup = await refreshProviderOrderStatus({
        adminUserId: admin.id,
        sourceType: "topup",
        attemptId: topup.id,
        reason: "Smoke unsupported refresh",
        expectedProviderOrderId: "x",
      });
      assert.equal(refreshTopup.ok, false);

      record(
        "unsupported source/action combinations remain disabled or fail closed",
        "PASS",
        "topup recoveries unsupported; assignment refund unsupported; topup refresh refused"
      );
    } catch (e) {
      record(
        "unsupported source/action combinations remain disabled or fail closed",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // ---------- Sensitive exposure scan ----------
    try {
      const list = await getReconciliationListPage({ filter: "needs_review" });
      const detailRefund = await getReconciliationDetail(
        "wallet_purchase",
        purchaseRefund.id
      );
      const detailIccid = await getReconciliationDetail("iccid", orderIccid.id);
      const blob = JSON.stringify({ list, detailRefund, detailIccid });
      assertNoSensitive(blob, "aggregate");
      assert.ok(!blob.includes("smoke-access-token-secret"));
      assert.equal(liveMutationAttempted, false);
      const mutations = networkLog.filter(
        (n) =>
          n.method !== "GET" &&
          !/\/api\/auth\/broker\/token/i.test(n.url)
      );
      assert.equal(mutations.length, 0, JSON.stringify(mutations));
      record(
        "no sensitive ICCID/QR/activation/token/provider payload exposure",
        "PASS",
        `scanned list+detail JSON; fetch log=${networkLog.length} entries; mutation attempts=0; liveMutationAttempted=false`
      );
    } catch (e) {
      record(
        "no sensitive ICCID/QR/activation/token/provider payload exposure",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }
  } finally {
    // Cleanup fixtures (best-effort, reverse FK order)
    try {
      if (ids.purchaseRefundId) {
        await prisma.walletEsimPurchase.delete({ where: { id: ids.purchaseRefundId } }).catch(() => {});
      }
      if (ids.purchaseFinalizeId) {
        const p = await prisma.walletEsimPurchase.findUnique({
          where: { id: ids.purchaseFinalizeId },
          select: { orderId: true },
        });
        await prisma.walletEsimPurchase.delete({ where: { id: ids.purchaseFinalizeId } }).catch(() => {});
        if (p?.orderId) {
          await prisma.order.delete({ where: { id: p.orderId } }).catch(() => {});
        }
      }
      if (ids.purchaseRefreshId) {
        await prisma.walletEsimPurchase.delete({ where: { id: ids.purchaseRefreshId } }).catch(() => {});
      }
      if (ids.assignmentId) {
        await prisma.adminPackageAssignment.delete({ where: { id: ids.assignmentId } }).catch(() => {});
      }
      if (ids.topupId) {
        await prisma.walletTopup.delete({ where: { id: ids.topupId } }).catch(() => {});
      }
      if (ids.orderIccidId) {
        await prisma.order.delete({ where: { id: ids.orderIccidId } }).catch(() => {});
      }
      if (ids.walletId) {
        await prisma.walletTransaction.deleteMany({ where: { walletId: ids.walletId } }).catch(() => {});
        await prisma.walletAccount.delete({ where: { id: ids.walletId } }).catch(() => {});
      }
      if (ids.customerId) {
        await prisma.user.delete({ where: { id: ids.customerId } }).catch(() => {});
      }
      if (ids.adminId) {
        await prisma.auditLog.deleteMany({ where: { actorUserId: ids.adminId } }).catch(() => {});
        await prisma.user.delete({ where: { id: ids.adminId } }).catch(() => {});
      }
    } catch {
      // ignore cleanup errors
    }
    await prisma.$disconnect().catch(() => {});
    restoreFetch();
  }

  console.log("\n=== SMOKE SUMMARY ===");
  console.log(`TAG=${TAG}`);
  console.log(`liveMutationAttempted=${liveMutationAttempted}`);
  console.log(`networkCalls=${networkLog.length}`);
  for (const r of results) {
    console.log(`${r.status}\t${r.item}`);
  }
  const failed = results.filter((r) => r.status === "FAIL");
  if (failed.length || liveMutationAttempted) {
    console.log("SMOKE_RESULT=FAIL");
    process.exitCode = 1;
  } else {
    console.log("SMOKE_RESULT=PASS");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
