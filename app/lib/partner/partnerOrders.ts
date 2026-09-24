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
import { resolveAddDataPurchaseLabel } from "@/app/lib/esim/addDataCheckout";
import { customerFlagImageUrl } from "@/app/lib/orders/customerOrderDisplay";
import {
  buildAddDataEligibility,
  lookupOfferTopUpFromCatalog,
  type CustomerAddDataBlockedReason,
} from "@/app/lib/orders/customerOrders";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  PARTNER_ORDERS_PAGE_LIMIT,
  displayOrUnavailable,
  formatPartnerOrderDate,
  parsePartnerOrdersPage,
  partnerOrderStatusFromPurchase,
  shortPartnerOrderReference,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { normalizeOfferId } from "@/app/lib/vesim/server";

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
  /** Add More Data CTA gate — never includes providerOrderId. */
  addDataEligible: boolean;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase: boolean;
  addDataSourceOrderId: string | null;
};

export type PartnerOrdersPageData = {
  orders: PartnerOrderListRow[];
  page: number;
  pageSize: number;
  totalMatched: number;
  totalPages: number;
};

export type PartnerOrdersQueryInput = {
  page?: string | null;
};

/** List CTA only — detail still runs catalog eligibility. */
function listPageAddDataEligible(input: {
  isRefunded: boolean;
  installEligible: boolean;
  offerId: string | null;
  providerOrderId: string | null;
}): boolean {
  return (
    !input.isRefunded &&
    input.installEligible &&
    Boolean(input.offerId) &&
    Boolean(input.providerOrderId)
  );
}

const partnerPurchaseListSelect = {
  id: true,
  status: true,
  offerId: true,
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
  providerOrderId: true,
  idempotencyKey: true,
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
      offerId: true,
      providerOrderId: true,
    },
  },
} as const;

/**
 * Completed Partner Orders for the active Partner only (newest first, paginated).
 * My eSIMs shows COMPLETED purchases with a linked order only — no pending,
 * reconciliation, failed-refunded, or other non-completed purchase states.
 * List pages skip public-catalog top-up lookups (detail still uses them).
 */
export async function listPartnerOrdersPage(
  partnerUserId: string,
  input: PartnerOrdersQueryInput = {}
): Promise<PartnerOrdersPageData | null> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return null;

  const pageSize = PARTNER_ORDERS_PAGE_LIMIT;
  let page = parsePartnerOrdersPage(input.page);

  const completedWhere = {
    partnerId: actor.partnerId,
    status: PartnerEsimPurchaseStatus.COMPLETED,
    orderId: { not: null },
  };

  const totalMatched = await prisma.partnerEsimPurchase.count({
    where: completedWhere,
  });
  const totalPages =
    totalMatched === 0 ? 0 : Math.ceil(totalMatched / pageSize);
  if (totalPages > 0 && page > totalPages) {
    page = totalPages;
  }

  const completedPurchases = await prisma.partnerEsimPurchase.findMany({
    where: completedWhere,
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: partnerPurchaseListSelect,
  });

  const orders: PartnerOrderListRow[] = [];

  for (const row of completedPurchases) {
    if (!row.orderId || !row.order) continue;

    const destination = displayOrUnavailable(
      row.order.destination || row.destinationName || row.destinationCode
    );
    const planName = displayOrUnavailable(row.order.planName || row.planName);
    const dataAllowance = displayOrUnavailable(
      row.order.dataAllowance || row.dataAllowance
    );
    const validity = displayOrUnavailable(row.order.validity || row.validity);
    const retailPriceLabel = `${formatUsdCents(row.retailPriceCents)} USD`;
    const partnerDebitLabel = `${formatUsdCents(row.partnerChargeCents)} USD`;
    const statusBadge = partnerOrderStatusFromPurchase(row.status);
    const purchasedAtLabel = formatPartnerOrderDate(
      row.completedAt ?? row.createdAt
    );
    const isRefunded = statusBadge === "Failed — balance returned";
    const installEligible =
      row.order.status === OrderStatus.COMPLETED &&
      statusBadge === "Completed";
    const offerIdForEligibility =
      normalizeOfferId(row.offerId) ||
      normalizeOfferId(row.order.offerId) ||
      null;
    const providerOrderId =
      (row.order.providerOrderId ?? "").trim() ||
      (row.providerOrderId ?? "").trim() ||
      null;
    const addDataEligible = listPageAddDataEligible({
      isRefunded,
      installEligible,
      offerId: offerIdForEligibility,
      providerOrderId,
    });
    const addDataPurchase = resolveAddDataPurchaseLabel(row.idempotencyKey);

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
      addDataEligible,
      isAddDataPurchase: addDataPurchase.isAddDataPurchase,
      addDataSourceOrderId: addDataPurchase.addDataSourceOrderId,
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

  return {
    orders,
    page,
    pageSize,
    totalMatched,
    totalPages,
  };
}

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
  /** Same gates as customer/admin Add More Data (no provider ids exposed). */
  addDataEligible: boolean;
  addDataBlockedReason: CustomerAddDataBlockedReason | null;
  /**
   * Normalized offer id for Add More Data prepare (server-side only).
   * Never render as a Partner UI secret field.
   */
  addDataOfferId: string | null;
  /** Destination code for catalog/checkout country hint (server-side only). */
  destinationCode: string | null;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase: boolean;
  /** Source MAP order id when isAddDataPurchase; never confuse with addDataEligible. */
  addDataSourceOrderId: string | null;
};

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
      offerId: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      retailPriceCents: true,
      partnerChargeCents: true,
      createdAt: true,
      completedAt: true,
      providerOrderId: true,
      idempotencyKey: true,
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
          offerId: true,
          providerOrderId: true,
        },
      },
    },
  });

  if (!purchase?.order) return null;

  const order = purchase.order;
  const encrypted = Boolean(order.iccidEncrypted?.trim());

  // Eligibility only — providerOrderId / offerId stay off the Partner DTO.
  const statusBadge = partnerOrderStatusFromPurchase(purchase.status);
  const isRefunded = statusBadge === "Failed — balance returned";
  const installEligible =
    order.status === OrderStatus.COMPLETED &&
    purchase.status === PartnerEsimPurchaseStatus.COMPLETED &&
    statusBadge === "Completed";
  const offerIdForEligibility =
    normalizeOfferId(purchase.offerId) ||
    normalizeOfferId(order.offerId) ||
    null;
  const providerOrderId =
    (order.providerOrderId ?? "").trim() ||
    (purchase.providerOrderId ?? "").trim() ||
    null;
  const destinationCode = (purchase.destinationCode ?? "").trim() || null;
  const catalog = await lookupOfferTopUpFromCatalog(
    offerIdForEligibility,
    destinationCode,
    new Map()
  );
  const addData = buildAddDataEligibility({
    providerOrderId,
    offerId: offerIdForEligibility,
    isRefunded,
    installEligible,
    catalog,
  });
  const addDataPurchase = resolveAddDataPurchaseLabel(purchase.idempotencyKey);

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
    statusBadge,
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
    addDataEligible: addData.addDataEligible,
    addDataBlockedReason: addData.addDataBlockedReason,
    addDataOfferId: offerIdForEligibility,
    destinationCode,
    isAddDataPurchase: addDataPurchase.isAddDataPurchase,
    addDataSourceOrderId: addDataPurchase.addDataSourceOrderId,
  };
}
