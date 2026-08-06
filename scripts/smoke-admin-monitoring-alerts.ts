/**
 * Local smoke for Monitoring & Alerts Part B1 (/admin/alerts).
 *
 * Evidence method: real getMonitoringAlertsDashboard() + requireActiveAdminForAlerts()
 * against ephemeral Prisma fixtures. Static route/nav assertions.
 * No browser session. No VeSIM. No email send. No business mutations from alert reads.
 *
 * Run:
 *   npx tsx -r ./scripts/smoke-stubs/register.cjs scripts/smoke-admin-monitoring-alerts.ts
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AdminPackageAssignmentStatus,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletDirection,
} from "@prisma/client";
import { isSafeAdminHref } from "../app/lib/admin/monitoringAlertShared";

loadEnvConfig(process.cwd());

process.env.SMOKE_SESSION_USER_ID =
  process.env.SMOKE_SESSION_USER_ID || "pending";
process.env.SMOKE_SESSION_ROLE = process.env.SMOKE_SESSION_ROLE || "ADMIN";

const root = join(__dirname, "..");
const TAG = `smokealert_${Date.now().toString(36)}`;
const MOCK_ICCID = "89014103211118510720";

type SmokeResult = {
  item: string;
  status: "PASS" | "FAIL" | "SKIP";
  evidence: string;
};

const results: SmokeResult[] = [];
const networkLog: { method: string; url: string }[] = [];

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function record(item: string, status: SmokeResult["status"], evidence: string) {
  results.push({ item, status, evidence });
  console.log(`${status} ${item} — ${evidence}`);
}

function installFetchGuard() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === "string" || input instanceof URL ? input : input.url
    );
    const method = String(init?.method ?? "GET").toUpperCase();
    networkLog.push({ method, url });
    throw new Error(`BLOCKED_NETWORK ${method} ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function assertNoSensitive(blob: string) {
  const patterns: Array<[RegExp | string, string]> = [
    ["DATABASE_URL", "DATABASE_URL"],
    [/smtp[_\s-]?password/i, "SMTP password"],
    [/SMTP_BILLING_PASSWORD/, "SMTP_BILLING_PASSWORD"],
    [/AUTH_GOOGLE_SECRET\s*[:=]/, "OAuth secret assignment"],
    [/client_secret/i, "OAuth client_secret"],
    [/access_token/i, "access token"],
    [/VESIM_PASSWORD/, "VESIM_PASSWORD"],
    [/AUTH_SECRET\s*[:=]\s*["'][^"']+["']/, "AUTH_SECRET value"],
    [/ICCID_ENCRYPTION_KEY\s*[:=]\s*["'][^"']+["']/, "ICCID key value"],
    [MOCK_ICCID, "full mock ICCID"],
    [/SM-DP\+/i, "SM-DP+"],
    [/LPA:/i, "LPA"],
  ];
  for (const [pat, label] of patterns) {
    if (typeof pat === "string") {
      assert.equal(blob.includes(pat), false, label);
    } else {
      assert.equal(pat.test(blob), false, label);
    }
  }
}

async function main() {
  const restoreFetch = installFetchGuard();
  const prisma = new PrismaClient();
  const ids: {
    adminId?: string;
    inactiveAdminId?: string;
    customerId?: string;
    walletId?: string;
    purchaseId?: string;
    assignmentId?: string;
    orderId?: string;
    txId?: string;
  } = {};

  try {
    const {
      requireActiveAdminForAlerts,
      getMonitoringAlertsDashboard,
      getMonitoringAlertSummary,
      collectMonitoringAlerts,
    } = await import("../app/lib/admin/monitoringAlerts");

    const admin = await prisma.user.create({
      data: {
        name: `Alert Admin ${TAG}`,
        email: `alert_admin_${TAG}@example.com`,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
    ids.adminId = admin.id;

    const inactive = await prisma.user.create({
      data: {
        name: `Alert Inactive ${TAG}`,
        email: `alert_inactive_${TAG}@example.com`,
        role: Role.ADMIN,
        deletedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });
    ids.inactiveAdminId = inactive.id;

    const customer = await prisma.user.create({
      data: {
        name: `Alert Customer ${TAG}`,
        email: `alert_cust_${TAG}@example.com`,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
    });
    ids.customerId = customer.id;

    const wallet = await prisma.walletAccount.create({
      data: { userId: customer.id, balanceCents: 25_000 },
    });
    ids.walletId = wallet.id;

    const stale = new Date(Date.now() - 45 * 60 * 1000);
    const purchase = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: `alert_offer_${TAG}`,
        destinationCode: "PK",
        destinationName: "Pakistan",
        planName: "Alert Plan",
        dataAllowance: "1GB",
        validity: "7 Days",
        priceCents: 1500,
        currency: "USD",
        fundingSource: "CUSTOMER_WALLET",
        status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
        debitTransactionId: null,
        idempotencyKey: `alert_p_${TAG}`,
        providerResultKind: "uncertain",
        failureCategory: "uncertain",
        updatedAt: stale,
        createdAt: stale,
      },
    });
    ids.purchaseId = purchase.id;

    // Force stale updatedAt (Prisma @updatedAt may overwrite)
    await prisma.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
        providerResultKind: "uncertain",
        failureCategory: "provider_uncertain",
        updatedAt: stale,
      },
    });

    const assignment = await prisma.adminPackageAssignment.create({
      data: {
        customerUserId: customer.id,
        adminUserId: admin.id,
        offerId: `alert_asg_${TAG}`,
        destinationCode: "PK",
        destinationName: "Pakistan",
        planName: "Alert Asg",
        dataAllowance: "1GB",
        validity: "7 Days",
        fundingSource: "COMPANY_FUNDED",
        status: AdminPackageAssignmentStatus.PROVIDER_PENDING,
        idempotencyKey: `alert_a_${TAG}`,
        reason: "alert fixture",
        updatedAt: stale,
        createdAt: stale,
      },
    });
    ids.assignmentId = assignment.id;
    await prisma.adminPackageAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AdminPackageAssignmentStatus.PROVIDER_PENDING,
        updatedAt: stale,
      },
    });

    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        customerEmail: `alert_ord_${TAG}@example.invalid`,
        status: "COMPLETED",
        claimStatus: "CLAIMED",
        fundingSource: "CUSTOMER_WALLET",
        offerId: `alert_ord_${TAG}`,
        destination: "PK",
        planName: "Alert Ord",
        providerOrderId: `po_${TAG}`,
      },
    });
    ids.orderId = order.id;

    const tx = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.PURCHASE_DEBIT,
        direction: WalletDirection.DEBIT,
        status: WalletTransactionStatus.COMPLETED,
        amountCents: 100,
        balanceAfterCents: 24_900,
        emailNotificationStatus: "failed",
      },
    });
    ids.txId = tx.id;

    const beforeWallet = await prisma.walletAccount.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { balanceCents: true, version: true, updatedAt: true },
    });
    const beforePurchase = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
      select: {
        status: true,
        updatedAt: true,
        refundTransactionId: true,
        reconciliationResolvedAt: true,
      },
    });
    const beforeAssignment = await prisma.adminPackageAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      select: { status: true, updatedAt: true, orderId: true },
    });
    const beforeOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { iccidHash: true, iccidEncrypted: true, updatedAt: true },
    });
    const beforeTx = await prisma.walletTransaction.findUniqueOrThrow({
      where: { id: tx.id },
      select: { emailNotificationStatus: true, updatedAt: true },
    });
    const beforeControls = await prisma.operationalControl.findMany({
      select: { key: true, paused: true, version: true, updatedAt: true },
      orderBy: { key: "asc" },
    });

    // Auth refusals
    try {
      process.env.SMOKE_SESSION_USER_ID = customer.id;
      process.env.SMOKE_SESSION_ROLE = "CUSTOMER";
      await assert.rejects(
        () => requireActiveAdminForAlerts(),
        (e: unknown) =>
          e instanceof Error && String(e.message).includes("SMOKE_REDIRECT")
      );
      record(
        "non-admin refused",
        "PASS",
        "customer redirected away from alerts"
      );
    } catch (e) {
      record("non-admin refused", "FAIL", e instanceof Error ? e.message : String(e));
    }

    try {
      process.env.SMOKE_SESSION_USER_ID = inactive.id;
      process.env.SMOKE_SESSION_ROLE = "ADMIN";
      await assert.rejects(
        () => requireActiveAdminForAlerts(),
        (e: unknown) =>
          e instanceof Error && String(e.message).includes("SMOKE_REDIRECT")
      );
      record(
        "inactive-admin refused",
        "PASS",
        "deleted admin redirected to signin"
      );
    } catch (e) {
      record(
        "inactive-admin refused",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    process.env.SMOKE_SESSION_USER_ID = admin.id;
    process.env.SMOKE_SESSION_ROLE = "ADMIN";

    try {
      await requireActiveAdminForAlerts();
      const dash = await getMonitoringAlertsDashboard();
      assert.equal(dash.unavailable, false);
      assert.ok(dash.summary.totalActive >= 1);

      const severities = new Set(dash.alerts.map((a) => a.severity));
      assert.ok(
        [...severities].some((s) =>
          ["CRITICAL", "HIGH", "WARNING", "INFO"].includes(s)
        )
      );

      // Ordering: first alert should be highest severity among returned
      if (dash.alerts.length >= 2) {
        const rank: Record<string, number> = {
          CRITICAL: 0,
          HIGH: 1,
          WARNING: 2,
          INFO: 3,
        };
        assert.ok(
          rank[dash.alerts[0].severity] <= rank[dash.alerts[1].severity]
        );
      }

      const highOnly = await getMonitoringAlertsDashboard({ severity: "HIGH" });
      assert.ok(highOnly.alerts.every((a) => a.severity === "HIGH"));

      for (const a of dash.alerts) {
        if (a.href) assert.equal(isSafeAdminHref(a.href), true);
      }

      const summary = await getMonitoringAlertSummary();
      assert.equal(typeof summary.totalActive, "number");
      assert.equal(typeof summary.criticalCount, "number");

      // Repeated unchanged runs must be identical (IDs, counts, order) — 20 runs
      const fixedCheckedAt = new Date();
      const signatures: string[] = [];
      for (let i = 0; i < 20; i++) {
        const run = await collectMonitoringAlerts({ checkedAt: fixedCheckedAt });
        assert.equal(run.checkedAt.toISOString(), fixedCheckedAt.toISOString());
        const counts = {
          ACTIVE: run.alerts.filter((a) => a.state === "ACTIVE").length,
          CRITICAL: run.alerts.filter((a) => a.severity === "CRITICAL").length,
          HIGH: run.alerts.filter((a) => a.severity === "HIGH").length,
          WARNING: run.alerts.filter((a) => a.severity === "WARNING").length,
          INFO: run.alerts.filter((a) => a.severity === "INFO").length,
        };
        signatures.push(
          `${run.alerts.map((a) => a.id).join("|")}::${counts.ACTIVE}/${counts.CRITICAL}/${counts.HIGH}/${counts.WARNING}/${counts.INFO}`
        );
      }
      assert.equal(signatures.length, 20);
      assert.equal(
        new Set(signatures).size,
        1,
        `20-run aggregation signatures diverged: ${[...new Set(signatures)].join(" || ")}`
      );
      assert.equal(
        signatures[0].includes("DATABASE_DEGRADED"),
        false,
        "healthy local probe must not emit DATABASE_DEGRADED (prior flicker ID)"
      );

      const serialized = JSON.stringify({ dash, summary });
      assertNoSensitive(serialized);
      assert.doesNotMatch(serialized, new RegExp(MOCK_ICCID));
      assert.doesNotMatch(serialized, /alert_cust_/i); // customer email local-part may appear in fixtures? avoid email
      // emails aren't in alert output by design
      assert.doesNotMatch(serialized, /@example\.com/);

      record(
        "active admin loads alert center aggregation",
        "PASS",
        `active=${dash.summary.totalActive} critical=${dash.summary.criticalCount} high=${dash.summary.highCount}`
      );
      record(
        "representative severities + filtering + safe links",
        "PASS",
        `severities=${[...severities].join(",")} highFilter=${highOnly.alerts.length}`
      );
      record(
        "repeated-run deterministic aggregation",
        "PASS",
        `20 identical signatures; no DATABASE_DEGRADED; active/high stable`
      );
      record(
        "no sensitive values in serialized output",
        "PASS",
        "JSON scan passed"
      );
    } catch (e) {
      record(
        "active admin loads alert center aggregation",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // Mutation fingerprint after reads
    try {
      const afterWallet = await prisma.walletAccount.findUniqueOrThrow({
        where: { id: wallet.id },
        select: { balanceCents: true, version: true, updatedAt: true },
      });
      const afterPurchase = await prisma.walletEsimPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
        select: {
          status: true,
          updatedAt: true,
          refundTransactionId: true,
          reconciliationResolvedAt: true,
        },
      });
      const afterAssignment = await prisma.adminPackageAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        select: { status: true, updatedAt: true, orderId: true },
      });
      const afterOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { iccidHash: true, iccidEncrypted: true, updatedAt: true },
      });
      const afterTx = await prisma.walletTransaction.findUniqueOrThrow({
        where: { id: tx.id },
        select: { emailNotificationStatus: true, updatedAt: true },
      });
      const afterControls = await prisma.operationalControl.findMany({
        select: { key: true, paused: true, version: true, updatedAt: true },
        orderBy: { key: "asc" },
      });

      assert.equal(afterWallet.balanceCents, beforeWallet.balanceCents);
      assert.equal(afterWallet.version, beforeWallet.version);
      assert.equal(afterPurchase.status, beforePurchase.status);
      assert.equal(afterAssignment.status, beforeAssignment.status);
      assert.equal(afterOrder.iccidHash, beforeOrder.iccidHash);
      assert.equal(afterTx.emailNotificationStatus, beforeTx.emailNotificationStatus);
      assert.deepEqual(
        afterControls.map((c) => ({
          key: c.key,
          paused: c.paused,
          version: c.version,
        })),
        beforeControls.map((c) => ({
          key: c.key,
          paused: c.paused,
          version: c.version,
        }))
      );
      assert.equal(networkLog.length, 0);
      record(
        "no network/provider/email and no DB mutation from reading alerts",
        "PASS",
        "fingerprints unchanged; fetch=0"
      );
    } catch (e) {
      record(
        "no network/provider/email and no DB mutation from reading alerts",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }

    // Static route/nav + operations summary wiring
    try {
      const nav = read("app/components/admin/AdminNav.tsx");
      assert.match(nav, /href: "\/admin\/alerts"/);
      assert.match(nav, /label: "Alerts"/);
      const page = read("app/admin/alerts/page.tsx");
      assert.match(page, /getMonitoringAlertsDashboard/);
      assert.match(page, /requireActiveAdminForAlerts/);
      const ops = read("app/admin/operations/page.tsx");
      assert.match(ops, /getMonitoringAlertSummary/);
      assert.match(ops, /Open alert center/);
      record(
        "alerts nav + operations summary wiring",
        "PASS",
        "AdminNav + /admin/alerts + operations summary present"
      );
    } catch (e) {
      record(
        "alerts nav + operations summary wiring",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
    }
  } finally {
    restoreFetch();
    try {
      if (ids.customerId) {
        await prisma.walletEsimPurchase.deleteMany({
          where: { customerUserId: ids.customerId },
        });
        await prisma.adminPackageAssignment.deleteMany({
          where: { customerUserId: ids.customerId },
        });
        await prisma.order.deleteMany({ where: { userId: ids.customerId } });
        if (ids.walletId) {
          await prisma.walletTransaction.deleteMany({
            where: { walletId: ids.walletId },
          });
          await prisma.walletAccount.delete({ where: { id: ids.walletId } });
        }
        await prisma.user.delete({ where: { id: ids.customerId } }).catch(() => {});
      }
      for (const id of [ids.adminId, ids.inactiveAdminId]) {
        if (id) await prisma.user.delete({ where: { id } }).catch(() => {});
      }
    } catch (cleanupErr) {
      console.error("smoke cleanup error", cleanupErr);
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n--- Alert smoke summary ---");
  for (const r of results) console.log(`${r.status} ${r.item}`);
  console.log(
    `\nEvidence method: server aggregation + static route/nav (no browser). networkCalls=${networkLog.length}`
  );
  if (failed.length) {
    console.error(`\n${failed.length} smoke item(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll Part B1 monitoring-alerts smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
