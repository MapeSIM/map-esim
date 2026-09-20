/**
 * Offline QA for Phase 5.3A wallet reservation monitor (Operations).
 * Read-only — does not mutate payments, wallets, statuses, or release/refund.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MONITORING_THRESHOLDS } from "../app/lib/admin/monitoringAlertShared";
import {
  ADMIN_WALLET_RESERVATIONS_HREF,
  WALLET_RESERVATION_ALERT_INVENTORY_CODES,
  WALLET_RESERVATION_MONITOR_POLICY_BLURB,
  WALLET_RESERVATION_MONITOR_STALE_MS,
  WALLET_RESERVATION_MONITOR_TAKE,
  formatWalletReservationTotalUsd,
  isOpenWalletReservation,
  isSplitPaymentReservation,
  isStaleWalletReservation,
  isWalletReservationAlertInventoryCode,
  sumReservedWalletCents,
  walletReservationAgeLabel,
  walletReservationPackageLabel,
} from "../app/lib/admin/walletReservationMonitorShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(
      join(root, "app/admin/operations/wallet-reservations/page.tsx")
    )
  );
  assert.ok(
    existsSync(join(root, "app/lib/admin/walletReservationMonitor.ts"))
  );
  assert.ok(
    existsSync(join(root, "app/lib/admin/walletReservationMonitorShared.ts"))
  );

  assert.equal(
    WALLET_RESERVATION_MONITOR_STALE_MS,
    MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS
  );
  assert.equal(WALLET_RESERVATION_MONITOR_TAKE, 200);
  assert.match(WALLET_RESERVATION_MONITOR_POLICY_BLURB, /Read-only/i);
  assert.match(WALLET_RESERVATION_MONITOR_POLICY_BLURB, /mark paid/i);

  assert.equal(
    isOpenWalletReservation({
      status: "FUNDS_RESERVED",
      walletAppliedCents: 1500,
    }),
    true
  );
  assert.equal(
    isOpenWalletReservation({
      status: "AWAITING_GATEWAY_PAYMENT",
      walletAppliedCents: 500,
    }),
    true
  );
  assert.equal(
    isOpenWalletReservation({
      status: "RECONCILIATION_REQUIRED",
      walletAppliedCents: 900,
    }),
    true
  );
  assert.equal(
    isOpenWalletReservation({
      status: "FUNDS_RESERVED",
      walletAppliedCents: 0,
    }),
    false
  );
  assert.equal(
    isOpenWalletReservation({
      status: "FUNDS_RESERVED",
      walletAppliedCents: 1500,
      refundTransactionId: "refund_1",
    }),
    false
  );
  assert.equal(
    isOpenWalletReservation({
      status: "COMPLETED",
      walletAppliedCents: 1500,
    }),
    false
  );
  console.log("PASS open_reservation_rules");

  assert.equal(
    isSplitPaymentReservation({
      status: "AWAITING_GATEWAY_PAYMENT",
      walletAppliedCents: 500,
      gatewayAmountCents: 1000,
    }),
    true
  );
  assert.equal(
    isSplitPaymentReservation({
      status: "FUNDS_RESERVED",
      walletAppliedCents: 1500,
      gatewayAmountCents: 0,
    }),
    false
  );
  console.log("PASS split_reservation_rules");

  const now = Date.UTC(2026, 8, 20, 12, 0, 0);
  const staleUpdated = new Date(now - 16 * 60 * 1000);
  const freshUpdated = new Date(now - 5 * 60 * 1000);
  assert.equal(
    isStaleWalletReservation({
      updatedAt: staleUpdated,
      nowMs: now,
    }),
    true
  );
  assert.equal(
    isStaleWalletReservation({
      updatedAt: freshUpdated,
      nowMs: now,
    }),
    false
  );
  assert.match(walletReservationAgeLabel(staleUpdated, now), /16m/);
  assert.equal(
    walletReservationPackageLabel({
      destinationName: "Pakistan",
      planName: "1GB",
      dataAllowance: "1 GB",
      validity: "7 days",
    }),
    "Pakistan — 1GB · 1 GB · 7 days"
  );
  assert.equal(sumReservedWalletCents([{ walletAppliedCents: 100 }, { walletAppliedCents: 50 }]), 150);
  assert.equal(formatWalletReservationTotalUsd(1500), "$15.00");
  console.log("PASS stale_age_package_totals");

  assert.equal(
    ADMIN_WALLET_RESERVATIONS_HREF,
    "/admin/operations/wallet-reservations"
  );
  assert.deepEqual([...WALLET_RESERVATION_ALERT_INVENTORY_CODES], [
    "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER",
    "WALLET_PURCHASE_RECONCILIATION_REQUIRED",
    "WALLET_PURCHASE_REFUND_INCOMPLETE",
    "PAYMENT_AWAITING_GATEWAY_STALE",
  ]);
  assert.equal(
    isWalletReservationAlertInventoryCode(
      "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER"
    ),
    true
  );
  assert.equal(
    isWalletReservationAlertInventoryCode("EMAIL_ORDER_FAILED"),
    false
  );
  console.log("PASS alert_inventory_nav_helpers");

  const page = read("app/admin/operations/wallet-reservations/page.tsx");
  const service = read("app/lib/admin/walletReservationMonitor.ts");
  const shared = read("app/lib/admin/walletReservationMonitorShared.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const access = read("app/lib/admin/adminPageAccess.ts");
  const opsPage = read("app/admin/operations/page.tsx");
  const alertsPage = read("app/admin/alerts/page.tsx");
  const pkg = read("package.json");

  assert.match(page, /requireActiveAdminForOperations/);
  assert.match(page, /getWalletReservationMonitorDashboard/);
  assert.match(page, /Open wallet reservations/);
  assert.match(page, /Total reserved USD/);
  assert.match(page, /Stale reservations/);
  assert.match(page, /Split payment reservations/);
  assert.match(page, /Payment detail/);
  assert.match(page, /Reconciliation/);
  assert.doesNotMatch(page, /Release Reservation|Refund wallet funds|markPaid/i);
  assert.doesNotMatch(
    service,
    /refundReservedFunds|maybeReleasePendingGatewayReservation|markPaid/
  );
  assert.doesNotMatch(service, /prisma\.\w+\.update\(/);
  assert.doesNotMatch(
    shared,
    /from ["']@prisma|prisma\.|refundReserved|maybeRelease/
  );
  assert.match(service, /server-only/);
  assert.match(service, /walletAppliedCents:\s*\{\s*gt:\s*0\s*\}/);
  assert.match(service, /FUNDS_RESERVED/);
  assert.match(service, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(service, /RECONCILIATION_REQUIRED/);

  assert.match(nav, /\/admin\/operations\/wallet-reservations/);
  assert.match(nav, /Wallet Reservations/);
  assert.match(access, /\/admin\/operations\/wallet-reservations/);
  assert.match(opsPage, /\/admin\/operations\/wallet-reservations/);
  assert.match(alertsPage, /ADMIN_WALLET_RESERVATIONS_HREF/);
  assert.match(alertsPage, /isWalletReservationAlertInventoryCode/);
  assert.match(alertsPage, /Wallet Reservations/);
  assert.match(alertsPage, /Wallet reservation inventory/);
  assert.match(pkg, /"qa:admin-wallet-reservation-monitor"/);
  console.log("PASS ui_nav_and_no_mutations");

  console.log("ALL_ADMIN_WALLET_RESERVATION_MONITOR_CHECKS_PASSED");
}

main();
