/**
 * Map sandbox orders into Partner order-card shapes for UI parity with partneresim.com.
 */

import type { PartnerOrderListRow } from "@/app/lib/partner/partnerOrders";
import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import { SANDBOX_CATALOG } from "@/app/lib/sandbox/sandboxShared";

const EMPTY_LIFECYCLE: ProviderLifecycleCacheView = {
  lifecycleStatus: "NOT_ACTIVE",
  lifecycleLabel: "Ready to install",
  remainingDataGb: null,
  usedDataGb: null,
  initialDataGb: null,
  usagePercent: null,
  activatedAtLabel: null,
  expiresAtLabel: null,
  syncedAtLabel: null,
  activatedAtIso: null,
  expiresAtIso: null,
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function shortRef(orderId: string): string {
  if (orderId.length <= 10) return orderId;
  return `${orderId.slice(0, 4)}…${orderId.slice(-4)}`;
}

function catalogHints(planName: string): { data: string; validity: string } {
  const lower = planName.toLowerCase();
  const match = SANDBOX_CATALOG.find(
    (item) =>
      lower.includes(item.name.toLowerCase()) ||
      lower.includes(`${item.dataGb} gb`)
  );
  if (match) {
    return {
      data: `${match.dataGb} GB`,
      validity: `${match.days} days`,
    };
  }
  return { data: "Sandbox plan", validity: "—" };
}

/** PartnerEsimOrderCard / list UI adapter for sandbox demo orders. */
export function sandboxOrderToPartnerRow(
  order: SandboxStoredOrder
): PartnerOrderListRow {
  const hints = catalogHints(order.planName);
  const amount = formatUsd(order.totalCents);
  return {
    purchaseId: order.orderId,
    orderId: order.orderId,
    shortReference: shortRef(order.orderId),
    destination: order.region || "Destination",
    flagUrl: null,
    planName: order.planName,
    dataAllowance: hints.data,
    validity: hints.validity,
    retailPriceLabel: amount,
    partnerDebitLabel: amount,
    statusBadge: "Completed",
    purchasedAtLabel: new Date(order.createdAt).toLocaleString(),
    iccidMasked: order.iccid || "Pending",
    iccid: order.iccid || null,
    iccidRevealable: Boolean(order.iccid),
    hasActiveShareToken: false,
    addDataEligible: false,
    isAddDataPurchase: false,
    addDataSourceOrderId: null,
    lifecycle: {
      ...EMPTY_LIFECYCLE,
      initialDataGb: Number.parseFloat(hints.data) || null,
    },
    remainingDataLabel: null,
  };
}

export function parseSandboxLpa(activationCode: string): {
  lpa: string;
  smdpAddress: string;
  matchingId: string;
} {
  const lpa = (activationCode || "").trim();
  const parts = lpa.split("$");
  if (parts.length >= 3 && parts[0]?.startsWith("LPA:")) {
    return {
      lpa,
      smdpAddress: parts[1] || "",
      matchingId: parts[2] || "",
    };
  }
  return { lpa, smdpAddress: "", matchingId: lpa };
}
