import "server-only";

import { OrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { customerFlagImageUrl } from "@/app/lib/orders/customerOrderDisplay";
import {
  formatLifecycleGb,
  providerLifecycleLabel,
  toProviderLifecycleCacheView,
  type ProviderLifecycleCacheView,
} from "@/app/lib/orders/providerLifecycleShared";

export type CustomerMobileEsimSnapshot = {
  orderId: string;
  destination: string;
  planName: string;
  flagUrl: string | null;
  remainingDataLabel: string | null;
  expiryLabel: string | null;
  lifecycle: ProviderLifecycleCacheView;
  /** True when remaining GB or expiry came from local provider lifecycle cache. */
  fromCache: boolean;
};

/**
 * Instant mobile dashboard snapshot for the customer's primary eSIM.
 * Reads Order provider-lifecycle cache only — never calls VeSIM on this path.
 * Prefer ACTIVE lines, then the most recently synced / created completed order.
 */
export async function getCustomerMobileEsimSnapshot(
  customerUserId: string
): Promise<CustomerMobileEsimSnapshot | null> {
  const userId = customerUserId.trim();
  if (!userId || userId.length > 64) return null;

  const select = {
    id: true,
    destination: true,
    planName: true,
    dataAllowance: true,
    providerLifecycleStatus: true,
    providerRemainingDataGb: true,
    providerUsedDataGb: true,
    providerInitialDataGb: true,
    providerUsagePercent: true,
    providerActivatedAt: true,
    providerExpiresAt: true,
    providerUsageSyncedAt: true,
    walletEsimPurchase: { select: { destinationCode: true } },
    adminPackageAssignment: { select: { destinationCode: true } },
  } as const;

  const preferActive = await prisma.order.findFirst({
    where: {
      userId,
      status: OrderStatus.COMPLETED,
      providerLifecycleStatus: "ACTIVE",
    },
    orderBy: [{ providerUsageSyncedAt: "desc" }, { createdAt: "desc" }],
    select,
  });

  const row =
    preferActive ??
    (await prisma.order.findFirst({
      where: {
        userId,
        status: OrderStatus.COMPLETED,
      },
      orderBy: [{ providerUsageSyncedAt: "desc" }, { createdAt: "desc" }],
      select,
    }));

  if (!row) return null;

  const lifecycle = toProviderLifecycleCacheView({
    providerLifecycleStatus: row.providerLifecycleStatus,
    providerRemainingDataGb: row.providerRemainingDataGb,
    providerUsedDataGb: row.providerUsedDataGb,
    providerInitialDataGb: row.providerInitialDataGb,
    providerUsagePercent: row.providerUsagePercent,
    providerActivatedAt: row.providerActivatedAt,
    providerExpiresAt: row.providerExpiresAt,
    providerUsageSyncedAt: row.providerUsageSyncedAt,
  });

  const remainingDataLabel =
    formatLifecycleGb(row.providerRemainingDataGb) ??
    (row.dataAllowance?.trim() ? row.dataAllowance.trim() : null);

  const flagCode =
    row.walletEsimPurchase?.destinationCode ||
    row.adminPackageAssignment?.destinationCode ||
    null;

  const fromCache = Boolean(
    row.providerUsageSyncedAt ||
      row.providerRemainingDataGb != null ||
      row.providerLifecycleStatus
  );

  return {
    orderId: row.id,
    destination: (row.destination || "eSIM").trim() || "eSIM",
    planName: (row.planName || "Plan").trim() || "Plan",
    flagUrl: customerFlagImageUrl(flagCode),
    remainingDataLabel,
    expiryLabel: lifecycle.expiresAtLabel,
    lifecycle: {
      ...lifecycle,
      lifecycleLabel:
        lifecycle.lifecycleLabel ??
        providerLifecycleLabel(lifecycle.lifecycleStatus),
    },
    fromCache,
  };
}
