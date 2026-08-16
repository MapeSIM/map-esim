/**
 * Partner Orders list + detail reads.
 * Ownership: PartnerEsimPurchase.partnerId === active Partner profile id.
 * Never returns provider cost, discount internals, or full ICCID.
 */
import "server-only";

import {
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Role,
} from "@prisma/client";
import { formatStoredIccidLast4 } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { customerFlagImageUrl } from "@/app/lib/orders/customerOrderDisplay";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  PARTNER_ORDERS_PAGE_LIMIT,
  displayOrUnavailable,
  formatPartnerOrderDate,
  partnerAttentionKindFromStatus,
  partnerAttentionMessage,
  partnerAttentionTitle,
  partnerOrderStatusFromPurchase,
  shortPartnerOrderReference,
  shortPartnerPurchaseReference,
  type PartnerAttentionKind,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";
import { formatUsdCents } from "@/app/lib/wallet/display";

function partnerIccidMasked(
  last4: string | null | undefined,
  hasEncrypted: boolean,
  orderStatus: OrderStatus
): string {
  const digits = (last4 ?? "").replace(/\D+/g, "");
  if (digits.length === 4) {
    return formatStoredIccidLast4(digits);
  }
  if (hasEncrypted) return "••••••••••••••••";
  if (orderStatus === OrderStatus.FAILED) return "Not provided";
  return "Pending from provider";
}

export type PartnerOrderListRow = {
  purchaseId: string;
  orderId: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  retailPriceLabel: string;
  partnerDebitLabel: string;
  statusBadge: PartnerOrderStatusBadge;
  purchasedAtLabel: string;
  /** Masked last-4 or pending — never plaintext. */
  iccidMasked: string;
  /** True only when encrypted ICCID is stored. */
  iccidRevealable: boolean;
  /** Boolean-only; never a raw share token. */
  hasActiveShareToken: boolean;
};

export type PartnerAttentionRow = {
  purchaseId: string;
  shortReference: string;
  destination: string;
  planName: string;
  retailPriceLabel: string;
  partnerDebitLabel: string;
  statusBadge: PartnerOrderStatusBadge;
  kind: PartnerAttentionKind;
  title: string;
  message: string;
  purchasedAtLabel: string;
};

export type PartnerOrdersPageData = {
  orders: PartnerOrderListRow[];
  attention: PartnerAttentionRow[];
};

export type PartnerOrderDetail = {
  orderId: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusBadge: PartnerOrderStatusBadge;
  purchasedAtLabel: string;
  retailPriceLabel: string;
  partnerDebitLabel: string;
  /** Masked last-4 or pending — never plaintext. */
  iccidMasked: string;
  /** True only when encrypted ICCID is stored. */
  iccidRevealable: boolean;
  purchaseId: string;
};

/**
 * Completed Partner Orders for the active Partner only (newest first).
 * Also returns non-order attention purchases (pending / under review / failed-refunded).
 */
export async function listPartnerOrdersPage(
  partnerUserId: string
): Promise<PartnerOrdersPageData | null> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return null;

  const purchases = await prisma.partnerEsimPurchase.findMany({
    where: {
      partnerId: actor.partnerId,
      status: {
        in: [
          PartnerEsimPurchaseStatus.COMPLETED,
          PartnerEsimPurchaseStatus.PROVIDER_PENDING,
          PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          PartnerEsimPurchaseStatus.FAILED_REFUNDED,
        ],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PARTNER_ORDERS_PAGE_LIMIT,
    select: {
      id: true,
      status: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      retailPriceCents: true,
      partnerChargeCents: true,
      createdAt: true,
      completedAt: true,
      orderId: true,
      order: {
        select: {
          id: true,
          destination: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          status: true,
          createdAt: true,
          iccidLast4: true,
          iccidEncrypted: true,
        },
      },
    },
  });

  const orders: PartnerOrderListRow[] = [];
  const attention: PartnerAttentionRow[] = [];

  for (const row of purchases) {
    const destination = displayOrUnavailable(
      row.order?.destination || row.destinationName || row.destinationCode
    );
    const planName = displayOrUnavailable(row.order?.planName || row.planName);
    const dataAllowance = displayOrUnavailable(
      row.order?.dataAllowance || row.dataAllowance
    );
    const validity = displayOrUnavailable(row.order?.validity || row.validity);
    const retailPriceLabel = `${formatUsdCents(row.retailPriceCents)} USD`;
    const partnerDebitLabel = `${formatUsdCents(row.partnerChargeCents)} USD`;
    const statusBadge = partnerOrderStatusFromPurchase(row.status);
    const purchasedAtLabel = formatPartnerOrderDate(
      row.completedAt ?? row.createdAt
    );

    if (
      row.status === PartnerEsimPurchaseStatus.COMPLETED &&
      row.orderId &&
      row.order
    ) {
      orders.push({
        purchaseId: row.id,
        orderId: row.order.id,
        shortReference: shortPartnerOrderReference(row.order.id),
        destination,
        flagUrl: customerFlagImageUrl(row.destinationCode),
        planName,
        dataAllowance,
        validity,
        retailPriceLabel,
        partnerDebitLabel,
        statusBadge,
        purchasedAtLabel,
        iccidMasked: partnerIccidMasked(
          row.order.iccidLast4,
          Boolean(row.order.iccidEncrypted?.trim()),
          row.order.status
        ),
        iccidRevealable: Boolean(row.order.iccidEncrypted?.trim()),
        hasActiveShareToken: false,
      });
      continue;
    }

    const kind = partnerAttentionKindFromStatus(row.status);
    if (!kind) continue;

    attention.push({
      purchaseId: row.id,
      shortReference: shortPartnerPurchaseReference(row.id),
      destination,
      planName,
      retailPriceLabel,
      partnerDebitLabel,
      statusBadge,
      kind,
      title: partnerAttentionTitle(kind),
      message: partnerAttentionMessage(kind),
      purchasedAtLabel,
    });
  }

  if (orders.length > 0) {
    const activeShares = await prisma.partnerEsimShareToken.findMany({
      where: {
        partnerId: actor.partnerId,
        revokedAt: null,
        orderId: { in: orders.map((order) => order.orderId) },
      },
      select: { orderId: true },
    });
    const active = new Set(activeShares.map((token) => token.orderId));
    for (const order of orders) {
      order.hasActiveShareToken = active.has(order.orderId);
    }
  }

  return { orders, attention };
}

/**
 * Load one Order only when linked to this Partner via PartnerEsimPurchase.
 * Wrong owner / missing → null (caller uses notFound — no existence leak).
 */
export async function getPartnerOwnedOrderDetail(
  partnerUserId: string,
  orderIdRaw: string
): Promise<PartnerOrderDetail | null> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return null;

  const orderId = (orderIdRaw ?? "").trim();
  if (
    !orderId ||
    orderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(orderId)
  ) {
    return null;
  }

  // Defense-in-depth: session user must still be PARTNER (actor already checked).
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.role !== Role.PARTNER) {
    return null;
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: actor.partnerId,
      orderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
    },
    select: {
      id: true,
      status: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      retailPriceCents: true,
      partnerChargeCents: true,
      createdAt: true,
      completedAt: true,
      order: {
        select: {
          id: true,
          destination: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          status: true,
          createdAt: true,
          iccidLast4: true,
          iccidEncrypted: true,
        },
      },
    },
  });

  if (!purchase?.order) return null;

  const order = purchase.order;
  const encrypted = Boolean(order.iccidEncrypted?.trim());

  return {
    orderId: order.id,
    shortReference: shortPartnerOrderReference(order.id),
    destination: displayOrUnavailable(
      order.destination || purchase.destinationName || purchase.destinationCode
    ),
    flagUrl: customerFlagImageUrl(purchase.destinationCode),
    planName: displayOrUnavailable(order.planName || purchase.planName),
    dataAllowance: displayOrUnavailable(
      order.dataAllowance || purchase.dataAllowance
    ),
    validity: displayOrUnavailable(order.validity || purchase.validity),
    statusBadge: partnerOrderStatusFromPurchase(purchase.status),
    purchasedAtLabel: formatPartnerOrderDate(
      purchase.completedAt ?? order.createdAt
    ),
    retailPriceLabel: `${formatUsdCents(purchase.retailPriceCents)} USD`,
    partnerDebitLabel: `${formatUsdCents(purchase.partnerChargeCents)} USD`,
    iccidMasked: partnerIccidMasked(
      order.iccidLast4,
      encrypted,
      order.status
    ),
    iccidRevealable: encrypted,
    purchaseId: purchase.id,
  };
}
