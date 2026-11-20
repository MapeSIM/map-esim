/**
 * Partner Public API order list/detail + ICCID usage.
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  getPartnerOwnedOrderInstall,
  getPartnerOwnedOrderUsage,
} from "@/app/lib/partner/partnerOrderInstall";
import {
  partnerOrderIsRefunded,
  partnerOrderStatusFromPurchase,
} from "@/app/lib/partner/partnerOrdersDisplay";
import { resolveOrderIccidPlaintext } from "@/app/lib/orders/orderIccidResolve";
import { formatUsdCents } from "@/app/lib/wallet/display";
import type { PartnerApiActor } from "@/app/lib/partnerApiAuth";
import {
  hashIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";

export type PartnerApiOrderRow = {
  orderId: string;
  purchaseId: string;
  status: string;
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  amountCents: number;
  amountLabel: string;
  currency: "USD";
  iccid: string | null;
  createdAt: string;
  completedAt: string | null;
  lpa: string | null;
  qrUrl: string | null;
  refunded: boolean;
};

async function mapPurchaseToApiOrder(options: {
  actor: PartnerApiActor;
  purchase: {
    id: string;
    status: PartnerEsimPurchaseStatus;
    destinationName: string | null;
    destinationCode: string | null;
    planName: string | null;
    dataAllowance: string | null;
    validity: string | null;
    partnerChargeCents: number;
    createdAt: Date;
    completedAt: Date | null;
    orderId: string | null;
    refundTransactionId: string | null;
    order: {
      id: string;
      providerLifecycleStatus: string | null;
      refundRequests?: { id: string }[];
      partnerRefundRequests?: { id: string }[];
    } | null;
  };
  includeInstall: boolean;
}): Promise<PartnerApiOrderRow | null> {
  const orderId = (options.purchase.orderId ?? options.purchase.order?.id ?? "").trim();
  if (!orderId) return null;

  const hasCompletedRefund =
    (options.purchase.order?.refundRequests?.length ?? 0) > 0 ||
    (options.purchase.order?.partnerRefundRequests?.length ?? 0) > 0 ||
    options.purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
    Boolean((options.purchase.refundTransactionId ?? "").trim());

  const statusBadge = partnerOrderStatusFromPurchase(options.purchase.status, {
    hasCompletedRefund,
    providerLifecycleStatus: options.purchase.order?.providerLifecycleStatus,
  });

  const iccid = await resolveOrderIccidPlaintext(orderId);
  let lpa: string | null = null;
  let qrUrl: string | null = null;
  if (options.includeInstall) {
    const install = await getPartnerOwnedOrderInstall(
      options.actor.userId,
      orderId
    );
    if (install.ok) {
      lpa = install.dto.lpa;
      qrUrl = install.dto.qrViewHref ?? install.dto.qrDownloadHref;
    }
  }

  return {
    orderId,
    purchaseId: options.purchase.id,
    status: statusBadge,
    destination:
      options.purchase.destinationName ||
      options.purchase.destinationCode ||
      null,
    planName: options.purchase.planName,
    dataAllowance: options.purchase.dataAllowance,
    validity: options.purchase.validity,
    amountCents: options.purchase.partnerChargeCents,
    amountLabel: `${formatUsdCents(options.purchase.partnerChargeCents)} USD`,
    currency: "USD",
    iccid,
    createdAt: options.purchase.createdAt.toISOString(),
    completedAt: options.purchase.completedAt?.toISOString() ?? null,
    lpa,
    qrUrl,
    refunded:
      partnerOrderIsRefunded(statusBadge) ||
      hasCompletedRefund,
  };
}

export async function listPartnerApiOrders(options: {
  actor: PartnerApiActor;
  page?: number;
  limit?: number;
}): Promise<{
  orders: PartnerApiOrderRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));

  const where = {
    partnerId: options.actor.partnerId,
    orderId: { not: null },
    status: {
      in: [
        PartnerEsimPurchaseStatus.COMPLETED,
        PartnerEsimPurchaseStatus.FAILED_REFUNDED,
        PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
      ],
    },
  };

  const total = await prisma.partnerEsimPurchase.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);

  const rows = await prisma.partnerEsimPurchase.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (safePage - 1) * limit,
    take: limit,
    select: {
      id: true,
      status: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      partnerChargeCents: true,
      createdAt: true,
      completedAt: true,
      orderId: true,
      refundTransactionId: true,
      order: {
        select: {
          id: true,
          providerLifecycleStatus: true,
          refundRequests: {
            where: { status: RefundRequestStatus.COMPLETED },
            select: { id: true },
            take: 1,
          },
          partnerRefundRequests: {
            where: { status: RefundRequestStatus.COMPLETED },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  const orders: PartnerApiOrderRow[] = [];
  for (const row of rows) {
    const mapped = await mapPurchaseToApiOrder({
      actor: options.actor,
      purchase: row,
      includeInstall: false,
    });
    if (mapped) orders.push(mapped);
  }

  return { orders, page: safePage, limit, total, totalPages };
}

export async function getPartnerApiOrder(options: {
  actor: PartnerApiActor;
  orderId: string;
}): Promise<PartnerApiOrderRow | null> {
  const orderId = options.orderId.trim();
  if (!orderId || orderId.length > 64) return null;

  const row = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: options.actor.partnerId,
      orderId,
    },
    select: {
      id: true,
      status: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      partnerChargeCents: true,
      createdAt: true,
      completedAt: true,
      orderId: true,
      refundTransactionId: true,
      order: {
        select: {
          id: true,
          providerLifecycleStatus: true,
          refundRequests: {
            where: { status: RefundRequestStatus.COMPLETED },
            select: { id: true },
            take: 1,
          },
          partnerRefundRequests: {
            where: { status: RefundRequestStatus.COMPLETED },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!row) return null;
  return mapPurchaseToApiOrder({
    actor: options.actor,
    purchase: row,
    includeInstall: true,
  });
}

export async function getPartnerApiEsimUsageByIccid(options: {
  actor: PartnerApiActor;
  iccid: string;
}): Promise<
  | { ok: true; orderId: string; usage: Record<string, unknown> }
  | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE" | "RATE_LIMITED"; error: string; retryAfterSec?: number }
> {
  const digits = normalizeIccid(options.iccid);
  if (!validateIccid(digits) || !isIccidEncryptionConfigured()) {
    return { ok: false, code: "NOT_FOUND", error: "eSIM not found." };
  }

  let iccidHash: string;
  try {
    iccidHash = hashIccid(digits);
  } catch {
    return { ok: false, code: "NOT_FOUND", error: "eSIM not found." };
  }

  const order = await prisma.order.findFirst({
    where: {
      iccidHash,
      partnerEsimPurchase: { partnerId: options.actor.partnerId },
    },
    select: { id: true },
  });
  if (!order) {
    return { ok: false, code: "NOT_FOUND", error: "eSIM not found." };
  }

  const usage = await getPartnerOwnedOrderUsage(options.actor.userId, order.id);
  if (!usage.ok) {
    if (usage.code === "RATE_LIMITED") {
      return {
        ok: false,
        code: "RATE_LIMITED",
        error: "Usage lookup rate limited. Try again shortly.",
        retryAfterSec: usage.retryAfterSec,
      };
    }
    if (usage.code === "NOT_FOUND") {
      return { ok: false, code: "NOT_FOUND", error: "eSIM not found." };
    }
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Usage is temporarily unavailable.",
    };
  }

  const u = usage.usage;
  return {
    ok: true,
    orderId: order.id,
    usage: {
      status: u.status,
      statusLabel: u.statusLabel,
      initialDataGB: u.initialDataGB,
      remainingDataGB: u.remainingDataGB,
      usedDataGB: u.usedDataGB,
      usagePercent: u.usagePercent,
      isUnlimited: u.isUnlimited,
      activatedAt: u.activatedAt,
      expiresAt: u.expiresAt,
      daysRemaining: u.daysRemaining,
      isActivated: u.isActivated,
      isExpired: u.isExpired,
    },
  };
}
