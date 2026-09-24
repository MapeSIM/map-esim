/**
 * Overview "Needs attention" cards — presentation aggregation only.
 * Reuses existing counters; does not change payment/wallet/recovery logic.
 */
import "server-only";

import { canAccessAdminPath } from "@/app/lib/admin/adminPageAccess";
import { ADMIN_UX_NAV } from "@/app/lib/admin/adminUxCopy";
import { getMonitoringAlertSummary } from "@/app/lib/admin/monitoringAlerts";
import { countPaymentRecoveryCandidates } from "@/app/lib/admin/paymentRecovery";
import { getReconciliationListPage } from "@/app/lib/admin/reconciliation";
import { getWalletReservationMonitorSummary } from "@/app/lib/admin/walletReservationMonitor";

export type AdminOverviewAttentionCard = {
  id: string;
  label: string;
  value: string | number;
  href: string;
  note: string;
};

/**
 * Build permission-filtered attention cards for Overview.
 * Each counter is loaded independently so one failure does not blank the section.
 */
export async function getAdminOverviewAttention(
  permissions: Iterable<string>
): Promise<AdminOverviewAttentionCard[]> {
  const cards: AdminOverviewAttentionCard[] = [];

  if (canAccessAdminPath(permissions, "/admin/payments/recovery")) {
    let value: string | number = "—";
    try {
      value = await countPaymentRecoveryCandidates();
    } catch {
      value = "—";
    }
    cards.push({
      id: "stale-unpaid-holds",
      label: ADMIN_UX_NAV.staleUnpaidHolds,
      value,
      href: "/admin/payments/recovery",
      note: "Unpaid gateway holds past the stale threshold",
    });
  }

  if (canAccessAdminPath(permissions, "/admin/operations/wallet-reservations")) {
    let value: string | number = "—";
    try {
      const summary = await getWalletReservationMonitorSummary();
      value = summary.staleCount;
    } catch {
      value = "—";
    }
    cards.push({
      id: "stale-wallet-holds",
      label: "Stale wallet holds",
      value,
      href: "/admin/operations/wallet-reservations",
      note: "Open wallet reservations older than the stale threshold",
    });
  }

  if (canAccessAdminPath(permissions, "/admin/reconciliation")) {
    let value: string | number = "—";
    try {
      const page = await getReconciliationListPage({});
      value = page.unavailable ? "—" : page.summary.needAction;
    } catch {
      value = "—";
    }
    cards.push({
      id: "stuck-cases",
      label: ADMIN_UX_NAV.stuckCases,
      value,
      href: "/admin/reconciliation",
      note: "Cases that need operator action",
    });
  }

  if (canAccessAdminPath(permissions, "/admin/alerts")) {
    let value: string | number = "—";
    try {
      const summary = await getMonitoringAlertSummary();
      if (summary.detectionStatus === "UNAVAILABLE") {
        value = "—";
      } else {
        value = summary.criticalCount + summary.highCount;
      }
    } catch {
      value = "—";
    }
    cards.push({
      id: "system-alerts",
      label: "Critical / high alerts",
      value,
      href: "/admin/alerts",
      note: "Active critical and high system alerts",
    });
  }

  return cards;
}
