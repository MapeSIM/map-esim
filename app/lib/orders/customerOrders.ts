import "server-only";

import {
  CustomerRewardTransactionType,
  OrderStatus,
  Prisma,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import {
  formatLifecycleGb,
  toProviderLifecycleCacheView,
  type ProviderLifecycleCacheView,
} from "@/app/lib/orders/providerLifecycleShared";
import {
  iccidUnavailableLabel,
  loadOrderIccidPlaintextMap,
  resolveOrderIccidPlaintext,
} from "@/app/lib/orders/orderIccidResolve";
import { prisma } from "@/app/lib/db";
import { resolveAddDataPurchaseLabel } from "@/app/lib/esim/addDataCheckout";
import {
  CUSTOMER_ORDERS_PAGE_LIMIT,
  customerEmailDeliveryLabel,
  customerFlagImageUrl,
  customerFundingLabel,
  customerStatusMatchesFilter,
  formatCustomerOrderAmount,
  formatUsdCentsAmount,
  normalizeCustomerOrderSearch,
  parseCustomerEsimStatusFilter,
  parseCustomerOrderDateFilter,
  parseCustomerOrdersPage,
  resolveCustomerEsimStatusBadge,
  customerEsimInstallAllowed,
  customerEsimLineReady,
  customerEsimStatusLabel,
  shortCustomerOrderReference,
  type CustomerEsimStatusBadge,
  type CustomerEsimStatusFilter,
} from "@/app/lib/orders/customerOrderDisplay";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import {
  extractCountryHintFromOfferId,
  fetchPublicOffersForCountry,
  findOfferById,
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

function formatOrderDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function decimalToNumber(
  value: Prisma.Decimal | null | undefined
): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Why Add More Data is blocked — null when eligible. */
export type CustomerAddDataBlockedReason =
  | "refunded"
  | "not_ready"
  | "missing_offer"
  | "missing_provider_order"
  | "catalog_unavailable"
  | "offer_unavailable"
  | "not_supported";

export type CustomerAddDataEligibility = {
  offerId: string | null;
  supportTopUp: boolean;
  supportTopUpType: string | null;
  /** VeSIM provider order id — use as checkout rechargeOrderId (never MAP local id). */
  providerOrderId: string | null;
  /** Same as providerOrderId when present; null if provider ref missing. */
  rechargeOrderId: string | null;
  addDataEligible: boolean;
  addDataBlockedReason: CustomerAddDataBlockedReason | null;
};

type CatalogTopUpLookup =
  | {
      state: "ok";
      supportTopUp: boolean;
      supportTopUpType: string | null;
    }
  | { state: "catalog_unavailable" }
  | { state: "offer_unavailable" }
  | { state: "no_offer_id" };

function resolveCatalogCountryHint(
  destinationCode: string | null | undefined,
  offerId: string | null
): string | null {
  return (
    sanitizeCountryHint(destinationCode) ||
    (offerId ? extractCountryHintFromOfferId(offerId) : null)
  );
}

/**
 * Public browse catalog only (snapshot / cached lists). Soft-fails — never throws to callers.
 * Not used for purchase validation or pricing.
 * Uses snapshot-first / background refresh so order pages are not blocked up to 4s
 * waiting on a stale public-offer refresh.
 */
export async function lookupOfferTopUpFromCatalog(
  offerIdRaw: string | null | undefined,
  destinationCode: string | null | undefined,
  catalogCache: Map<string, VesimOffer[] | null>
): Promise<CatalogTopUpLookup> {
  const offerId = normalizeOfferId(offerIdRaw);
  if (!offerId) {
    return { state: "no_offer_id" };
  }

  const country = resolveCatalogCountryHint(destinationCode, offerId);
  if (!country) {
    return { state: "catalog_unavailable" };
  }

  let offers = catalogCache.get(country);
  if (offers === undefined) {
    try {
      offers = await fetchPublicOffersForCountry(country, {
        refreshMode: "background",
      });
      catalogCache.set(country, offers);
    } catch {
      catalogCache.set(country, null);
      return { state: "catalog_unavailable" };
    }
  }
  if (offers == null) {
    return { state: "catalog_unavailable" };
  }

  const match = findOfferById(offers, offerId);
  if (!match) {
    return { state: "offer_unavailable" };
  }

  const supportTopUpType =
    typeof match.supportTopUpType === "string" && match.supportTopUpType.trim()
      ? match.supportTopUpType.trim()
      : null;

  return {
    state: "ok",
    supportTopUp: match.supportTopUp === true,
    supportTopUpType,
  };
}

export function buildAddDataEligibility(input: {
  providerOrderId: string | null;
  offerId: string | null;
  isRefunded: boolean;
  installEligible: boolean;
  catalog: CatalogTopUpLookup;
}): CustomerAddDataEligibility {
  const offerId = input.offerId;
  const providerOrderId = (input.providerOrderId ?? "").trim() || null;
  /** VeSIM bind key only — never MAP local order id. */
  const rechargeOrderId = providerOrderId;
  const base = {
    offerId,
    providerOrderId,
    rechargeOrderId,
    supportTopUp: false,
    supportTopUpType: null as string | null,
  };

  if (input.isRefunded) {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "refunded",
    };
  }
  if (!input.installEligible) {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "not_ready",
    };
  }
  if (!providerOrderId) {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "missing_provider_order",
    };
  }
  if (input.catalog.state === "no_offer_id") {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "missing_offer",
    };
  }
  if (input.catalog.state === "catalog_unavailable") {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "catalog_unavailable",
    };
  }
  if (input.catalog.state === "offer_unavailable") {
    return {
      ...base,
      addDataEligible: false,
      addDataBlockedReason: "offer_unavailable",
    };
  }

  const supportTopUp = input.catalog.supportTopUp;
  const supportTopUpType = input.catalog.supportTopUpType;
  if (!supportTopUp) {
    return {
      offerId,
      providerOrderId,
      rechargeOrderId,
      supportTopUp: false,
      supportTopUpType,
      addDataEligible: false,
      addDataBlockedReason: "not_supported",
    };
  }

  return {
    offerId,
    providerOrderId,
    rechargeOrderId,
    supportTopUp: true,
    supportTopUpType,
    addDataEligible: true,
    addDataBlockedReason: null,
  };
}

export type CustomerOrderListRow = {
  id: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusBadge: CustomerEsimStatusBadge;
  amountLabel: string;
  currencyLabel: string;
  fundingLabel: string;
  createdAtLabel: string;
  /** Full plaintext ICCID when stored; otherwise pending/not-provided label. */
  iccidMasked: string;
  /** Full plaintext ICCID only — null when unavailable. */
  iccid: string | null;
  emailDeliveryLabel: string | null;
  installEligible: boolean;
  isRefunded: boolean;
  offerId: string | null;
  /** VeSIM provider order id (same value as rechargeOrderId when set). */
  providerOrderId: string | null;
  supportTopUp: boolean;
  supportTopUpType: string | null;
  /** VeSIM provider order id for Add Data checkout — never MAP local id. */
  rechargeOrderId: string | null;
  addDataEligible: boolean;
  addDataBlockedReason: CustomerAddDataBlockedReason | null;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase: boolean;
  /** Source MAP order id when isAddDataPurchase; never confuse with addDataEligible. */
  addDataSourceOrderId: string | null;
  /** Cached VeSIM line state when available (null until first refresh). */
  lifecycle: ProviderLifecycleCacheView;
  remainingDataLabel: string | null;
};

export type CustomerOrdersListResult = {
  rows: CustomerOrderListRow[];
  search: string;
  status: CustomerEsimStatusFilter;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  totalMatched: number;
  totalPages: number;
};

export type CustomerOrdersQueryInput = {
  q?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  page?: string | null;
};

/** List CTA only — detail/add-data still run full catalog eligibility. */
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

function buildCustomerOrdersWhere(
  userId: string,
  status: CustomerEsimStatusFilter,
  search: string,
  from: string,
  to: string
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { userId };
  const and: Prisma.OrderWhereInput[] = [];

  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) {
      createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to) {
      createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    }
    and.push({ createdAt });
  }

  if (search) {
    const searchLast4 = search.replace(/\D+/g, "").slice(-4);
    const or: Prisma.OrderWhereInput[] = [
      { id: { contains: search, mode: "insensitive" } },
      { destination: { contains: search, mode: "insensitive" } },
      { planName: { contains: search, mode: "insensitive" } },
      { dataAllowance: { contains: search, mode: "insensitive" } },
    ];
    if (searchLast4.length === 4) {
      or.push({ iccidLast4: searchLast4 });
    }
    and.push({ OR: or });
  }

  if (status === "REFUNDED") {
    and.push({
      OR: [
        { walletEsimPurchase: { status: "FAILED_REFUNDED" } },
        {
          refundRequests: {
            some: { status: RefundRequestStatus.COMPLETED },
          },
        },
      ],
    });
  } else if (status === "REVIEW_NEEDED") {
    and.push({
      OR: [
        { walletEsimPurchase: { status: "RECONCILIATION_REQUIRED" } },
        { adminPackageAssignment: { status: "RECONCILIATION_REQUIRED" } },
      ],
    });
  } else if (status === "FAILED") {
    and.push({
      OR: [
        { status: OrderStatus.FAILED },
        { adminPackageAssignment: { status: "FAILED" } },
      ],
    });
    and.push({
      NOT: {
        OR: [
          { walletEsimPurchase: { status: "FAILED_REFUNDED" } },
          {
            refundRequests: {
              some: { status: RefundRequestStatus.COMPLETED },
            },
          },
        ],
      },
    });
  } else if (status === "COMPLETED") {
    and.push({ status: OrderStatus.COMPLETED });
    and.push({
      NOT: {
        OR: [
          { walletEsimPurchase: { status: "FAILED_REFUNDED" } },
          {
            refundRequests: {
              some: { status: RefundRequestStatus.COMPLETED },
            },
          },
          { walletEsimPurchase: { status: "RECONCILIATION_REQUIRED" } },
          { adminPackageAssignment: { status: "RECONCILIATION_REQUIRED" } },
          { adminPackageAssignment: { status: "FAILED" } },
        ],
      },
    });
  } else if (status === "PROCESSING") {
    and.push({
      OR: [
        { status: OrderStatus.PENDING },
        {
          walletEsimPurchase: {
            status: {
              in: ["FUNDED", "PROVIDER_PENDING", "FUNDS_RESERVED", "READY"],
            },
          },
        },
        {
          adminPackageAssignment: {
            status: { in: ["PROVIDER_PENDING", "READY"] },
          },
        },
      ],
    });
    and.push({
      NOT: {
        OR: [
          { walletEsimPurchase: { status: "FAILED_REFUNDED" } },
          { walletEsimPurchase: { status: "RECONCILIATION_REQUIRED" } },
          { adminPackageAssignment: { status: "RECONCILIATION_REQUIRED" } },
          { status: OrderStatus.FAILED },
          { adminPackageAssignment: { status: "FAILED" } },
        ],
      },
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

/**
 * Orders linked to this CUSTOMER userId only — never by email or browser id.
 * List pages skip public-catalog top-up lookups (detail/add-data still use them).
 */
export async function listCustomerOrders(
  userId: string,
  input: CustomerOrdersQueryInput = {}
): Promise<CustomerOrdersListResult> {
  const id = (userId ?? "").trim();
  const search = normalizeCustomerOrderSearch(input.q);
  const status = parseCustomerEsimStatusFilter(input.status);
  const from = parseCustomerOrderDateFilter(input.from);
  const to = parseCustomerOrderDateFilter(input.to);
  let page = parseCustomerOrdersPage(input.page);
  const pageSize = CUSTOMER_ORDERS_PAGE_LIMIT;

  if (!id || id.length > 64) {
    return {
      rows: [],
      search,
      status,
      from,
      to,
      page: 1,
      pageSize,
      totalMatched: 0,
      totalPages: 0,
    };
  }

  const where = buildCustomerOrdersWhere(id, status, search, from, to);
  const totalMatched = await prisma.order.count({ where });
  const totalPages =
    totalMatched === 0 ? 0 : Math.ceil(totalMatched / pageSize);
  if (totalPages > 0 && page > totalPages) {
    page = totalPages;
  }

  const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        offerId: true,
        providerOrderId: true,
        destination: true,
        planName: true,
        dataAllowance: true,
        validity: true,
        status: true,
        createdAt: true,
        displayAmount: true,
        displayCurrency: true,
        providerAmount: true,
        providerCurrency: true,
        fundingSource: true,
        iccidLast4: true,
        iccidEncrypted: true,
        providerLifecycleStatus: true,
        providerRemainingDataGb: true,
        providerUsedDataGb: true,
        providerInitialDataGb: true,
        providerUsagePercent: true,
        providerActivatedAt: true,
        providerExpiresAt: true,
        providerUsageSyncedAt: true,
        walletEsimPurchase: {
          select: {
            status: true,
            offerId: true,
            destinationCode: true,
            emailDeliveryStatus: true,
            priceCents: true,
            idempotencyKey: true,
          },
        },
        adminPackageAssignment: {
          select: {
            status: true,
            offerId: true,
            destinationCode: true,
            emailDeliveryStatus: true,
          },
        },
        refundRequests: {
          where: { status: RefundRequestStatus.COMPLETED },
          select: { id: true },
          take: 1,
        },
      },
    });

  const iccidByOrderId = await loadOrderIccidPlaintextMap(rows.map((r) => r.id));
  const mapped: CustomerOrderListRow[] = [];

  for (const row of rows) {
    const hasCompletedRefund = row.refundRequests.length > 0;
    const statusBadge = resolveCustomerEsimStatusBadge({
      orderStatus: row.status,
      walletPurchaseStatus: row.walletEsimPurchase?.status,
      assignmentStatus: row.adminPackageAssignment?.status,
      hasCompletedRefund,
      providerLifecycleStatus: row.providerLifecycleStatus,
    });
    // Safety net — approximate DB status filters may include edge cases.
    if (!customerStatusMatchesFilter(statusBadge, status)) continue;

    const iccid = iccidByOrderId.get(row.id) ?? null;
    // Field name kept for DTO compatibility — value is full ICCID when present.
    const iccidMasked = iccid ?? iccidUnavailableLabel(row.status);
    const planName = displayOrUnavailable(row.planName);
    const destination = displayOrUnavailable(row.destination);
    const dataAllowance = displayOrUnavailable(row.dataAllowance);

    const amount = decimalToNumber(row.displayAmount ?? row.providerAmount);
    const currency =
      (row.displayCurrency ?? row.providerCurrency ?? "USD").trim().toUpperCase() ||
      "USD";
    const flagCode =
      row.walletEsimPurchase?.destinationCode ||
      row.adminPackageAssignment?.destinationCode ||
      null;
    const emailDeliveryLabel =
      customerEmailDeliveryLabel(
        row.walletEsimPurchase?.emailDeliveryStatus
      ) ||
      customerEmailDeliveryLabel(
        row.adminPackageAssignment?.emailDeliveryStatus
      );
    const isRefunded = statusBadge === "Refunded";
    const lineReady =
      row.status === OrderStatus.COMPLETED && customerEsimLineReady(statusBadge);
    const installEligible =
      lineReady && customerEsimInstallAllowed(statusBadge);

    const offerId =
      normalizeOfferId(row.offerId) ||
      normalizeOfferId(row.walletEsimPurchase?.offerId) ||
      normalizeOfferId(row.adminPackageAssignment?.offerId) ||
      null;
    const providerOrderId = (row.providerOrderId ?? "").trim() || null;
    // Add More Data uses line readiness (includes expired); install QR does not.
    const addDataEligible = listPageAddDataEligible({
      isRefunded,
      installEligible: lineReady,
      offerId,
      providerOrderId,
    });
    const addDataPurchase = resolveAddDataPurchaseLabel(
      row.walletEsimPurchase?.idempotencyKey
    );

    mapped.push({
      id: row.id,
      shortReference: shortCustomerOrderReference(row.id),
      destination,
      flagUrl: customerFlagImageUrl(flagCode),
      planName,
      dataAllowance,
      validity: displayOrUnavailable(row.validity),
      statusBadge,
      amountLabel: formatCustomerOrderAmount(amount, currency),
      currencyLabel: currency,
      fundingLabel: customerFundingLabel(row.fundingSource),
      createdAtLabel: formatOrderDate(row.createdAt),
      iccidMasked,
      iccid,
      emailDeliveryLabel,
      installEligible,
      isRefunded,
      offerId,
      providerOrderId,
      supportTopUp: addDataEligible,
      supportTopUpType: null,
      rechargeOrderId: providerOrderId,
      addDataEligible,
      addDataBlockedReason: addDataEligible ? null : "not_ready",
      isAddDataPurchase: addDataPurchase.isAddDataPurchase,
      addDataSourceOrderId: addDataPurchase.addDataSourceOrderId,
      lifecycle: (() => {
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
        return lifecycle;
      })(),
      remainingDataLabel: formatLifecycleGb(row.providerRemainingDataGb),
    });
  }

  return {
    rows: mapped,
    search,
    status,
    from,
    to,
    page,
    pageSize,
    totalMatched,
    totalPages,
  };
}

export type CustomerOrderDetail = {
  id: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusBadge: CustomerEsimStatusBadge;
  statusLabel: string;
  amountLabel: string;
  promoCode: string | null;
  originalAmountLabel: string | null;
  discountAmountLabel: string | null;
  finalAmountLabel: string | null;
  currencyLabel: string;
  fundingLabel: string;
  createdAtLabel: string;
  /** Full plaintext ICCID when stored; otherwise pending/not-provided label. */
  iccidMasked: string;
  /** Full plaintext ICCID only — null when unavailable. */
  iccid: string | null;
  /** True when a full ICCID is available for display. */
  iccidRevealable: boolean;
  emailDeliveryLabel: string | null;
  installEligible: boolean;
  isRefunded: boolean;
  refundStatusLabel: string | null;
  refundedAtLabel: string | null;
  /** Exact MAP Wallet credit when known — never a speculative full price. */
  refundAmountLabel: string | null;
  walletCreditedLabel: string | null;
  gatewayRefundLabel: string | null;
  rewardsEarnedPoints: number | null;
  rewardsAppliedPoints: number | null;
  offerId: string | null;
  /** Destination catalog hint for Add Data → prepare (never for pricing). */
  destinationCode: string | null;
  /** VeSIM provider order id (same value as rechargeOrderId when set). */
  providerOrderId: string | null;
  supportTopUp: boolean;
  supportTopUpType: string | null;
  /** VeSIM provider order id for Add Data checkout — never MAP local id. */
  rechargeOrderId: string | null;
  addDataEligible: boolean;
  addDataBlockedReason: CustomerAddDataBlockedReason | null;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase: boolean;
  /** Source MAP order id when isAddDataPurchase; never confuse with addDataEligible. */
  addDataSourceOrderId: string | null;
  lifecycle: ProviderLifecycleCacheView;
  remainingDataLabel: string | null;
};

/**
 * Load one order only when it belongs to the signed-in CUSTOMER.
 * Local DB for order fields. Add More Data eligibility soft-reads the public
 * offer catalog by offerId. Install secrets stay on authorized API actions only.
 */
export async function getCustomerOwnedOrderDetail(
  userId: string,
  orderId: string
): Promise<CustomerOrderDetail | null> {
  const ownerId = (userId ?? "").trim();
  const localOrderId = (orderId ?? "").trim();
  if (
    !ownerId ||
    !localOrderId ||
    ownerId.length > 64 ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return null;
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    return null;
  }

  const order = await prisma.order.findFirst({
    where: {
      id: localOrderId,
      userId: owner.id,
    },
    select: {
      id: true,
      offerId: true,
      providerOrderId: true,
      destination: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      status: true,
      createdAt: true,
      displayAmount: true,
      displayCurrency: true,
      providerAmount: true,
      providerCurrency: true,
      fundingSource: true,
      iccidLast4: true,
      iccidEncrypted: true,
      providerLifecycleStatus: true,
      providerRemainingDataGb: true,
      providerUsedDataGb: true,
      providerInitialDataGb: true,
      providerUsagePercent: true,
      providerActivatedAt: true,
      providerExpiresAt: true,
      providerUsageSyncedAt: true,
      walletEsimPurchase: {
        select: {
          status: true,
          offerId: true,
          destinationCode: true,
          emailDeliveryStatus: true,
          priceCents: true,
          promoCodeNormalized: true,
          promoDiscountCents: true,
          rewardPointsRedeemed: true,
          idempotencyKey: true,
          updatedAt: true,
          completedAt: true,
          refundTransaction: {
            select: {
              amountCents: true,
              createdAt: true,
              status: true,
            },
          },
        },
      },
      adminPackageAssignment: {
        select: {
          status: true,
          offerId: true,
          destinationCode: true,
          emailDeliveryStatus: true,
        },
      },
      refundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!order) {
    return null;
  }

  const hasCompletedRefund = order.refundRequests.length > 0;
  const statusBadge = resolveCustomerEsimStatusBadge({
    orderStatus: order.status,
    walletPurchaseStatus: order.walletEsimPurchase?.status,
    assignmentStatus: order.adminPackageAssignment?.status,
    hasCompletedRefund,
    providerLifecycleStatus: order.providerLifecycleStatus,
  });
  const iccid = await resolveOrderIccidPlaintext(order.id);
  const iccidRevealable = Boolean(iccid);
  const iccidMasked = iccid ?? iccidUnavailableLabel(order.status);
  const amount = decimalToNumber(order.displayAmount ?? order.providerAmount);
  const currency =
    (order.displayCurrency ?? order.providerCurrency ?? "USD")
      .trim()
      .toUpperCase() || "USD";
  const flagCode =
    order.walletEsimPurchase?.destinationCode ||
    order.adminPackageAssignment?.destinationCode ||
    null;
  const emailDeliveryLabel =
    customerEmailDeliveryLabel(
      order.walletEsimPurchase?.emailDeliveryStatus
    ) ||
    customerEmailDeliveryLabel(
      order.adminPackageAssignment?.emailDeliveryStatus
    );
  const isRefunded = statusBadge === "Refunded";
  const lineReady =
    order.status === OrderStatus.COMPLETED && customerEsimLineReady(statusBadge);
  const installEligible =
    lineReady && customerEsimInstallAllowed(statusBadge);

  const offerId =
    normalizeOfferId(order.offerId) ||
    normalizeOfferId(order.walletEsimPurchase?.offerId) ||
    normalizeOfferId(order.adminPackageAssignment?.offerId) ||
    null;
  const providerOrderId = (order.providerOrderId ?? "").trim() || null;
  const catalog = await lookupOfferTopUpFromCatalog(
    offerId,
    flagCode,
    new Map()
  );
  const addData = buildAddDataEligibility({
    providerOrderId,
    offerId,
    isRefunded,
    // Catalog/top-up gate uses line readiness so expired lines can still surface CTA.
    installEligible: lineReady,
    catalog,
  });
  // Expired lines may buy a fresh eSIM even when catalog supportTopUp is false.
  const lifecycleExpired =
    statusBadge === "eSIM Expired" ||
    (order.providerLifecycleStatus ?? "").trim().toUpperCase() === "EXPIRED";
  const addDataEligible =
    addData.addDataEligible ||
    (lifecycleExpired && !isRefunded && lineReady && Boolean(offerId));
  const addDataBlockedReason = addDataEligible
    ? null
    : addData.addDataBlockedReason;
  const addDataPurchase = resolveAddDataPurchaseLabel(
    order.walletEsimPurchase?.idempotencyKey
  );

  let rewardsAppliedPoints: number | null = null;
  let rewardsEarnedPoints: number | null = null;
  if (
    order.walletEsimPurchase &&
    order.walletEsimPurchase.rewardPointsRedeemed > 0
  ) {
    rewardsAppliedPoints = order.walletEsimPurchase.rewardPointsRedeemed;
  }
  if (installEligible && order.walletEsimPurchase) {
    const earn = await prisma.customerRewardTransaction.findFirst({
      where: {
        customerUserId: owner.id,
        orderId: order.id,
        type: CustomerRewardTransactionType.PURCHASE_EARN,
        pointsDelta: { gt: 0 },
      },
      select: { pointsDelta: true },
    });
    if (earn && earn.pointsDelta > 0) {
      rewardsEarnedPoints = earn.pointsDelta;
    }
  }

  let refundStatusLabel: string | null = null;
  let refundedAtLabel: string | null = null;
  let refundAmountLabel: string | null = null;
  let walletCreditedLabel: string | null = null;
  let gatewayRefundLabel: string | null = null;
  if (isRefunded) {
    refundStatusLabel = "Refund completed";
    const refundTx = order.walletEsimPurchase?.refundTransaction;
    if (refundTx?.createdAt) {
      refundedAtLabel = formatOrderDate(refundTx.createdAt);
    } else if (order.walletEsimPurchase?.updatedAt) {
      refundedAtLabel = formatOrderDate(order.walletEsimPurchase.updatedAt);
    }
    // Prefer the ledger credit amount; never invent full priceCents.
    if (
      refundTx &&
      Number.isInteger(refundTx.amountCents) &&
      refundTx.amountCents > 0
    ) {
      walletCreditedLabel = formatUsdCentsAmount(refundTx.amountCents);
      refundAmountLabel = walletCreditedLabel;
    } else {
      const completedRequest = await prisma.refundRequest.findFirst({
        where: {
          orderId: order.id,
          customerUserId: owner.id,
          status: "COMPLETED",
          executedAmountCents: { gt: 0 },
        },
        orderBy: [{ executedAt: "desc" }, { id: "desc" }],
        select: {
          executedAmountCents: true,
          executedAt: true,
        },
      });
      if (
        completedRequest &&
        Number.isInteger(completedRequest.executedAmountCents) &&
        (completedRequest.executedAmountCents ?? 0) > 0
      ) {
        walletCreditedLabel = formatUsdCentsAmount(
          completedRequest.executedAmountCents!
        );
        refundAmountLabel = walletCreditedLabel;
        if (!refundedAtLabel && completedRequest.executedAt) {
          refundedAtLabel = formatOrderDate(completedRequest.executedAt);
        }
      }
    }
    gatewayRefundLabel = "Not issued";
  }

  return {
    id: order.id,
    shortReference: shortCustomerOrderReference(order.id),
    destination: displayOrUnavailable(order.destination),
    flagUrl: customerFlagImageUrl(flagCode),
    planName: displayOrUnavailable(order.planName),
    dataAllowance: displayOrUnavailable(order.dataAllowance),
    validity: displayOrUnavailable(order.validity),
    statusBadge,
    statusLabel: customerEsimStatusLabel(statusBadge),
    amountLabel: formatCustomerOrderAmount(amount, currency),
    promoCode: order.walletEsimPurchase?.promoCodeNormalized || null,
    originalAmountLabel:
      order.walletEsimPurchase &&
      order.walletEsimPurchase.promoDiscountCents > 0
        ? formatUsdCentsAmount(order.walletEsimPurchase.priceCents)
        : null,
    discountAmountLabel:
      order.walletEsimPurchase &&
      order.walletEsimPurchase.promoDiscountCents > 0
        ? formatUsdCentsAmount(order.walletEsimPurchase.promoDiscountCents)
        : null,
    finalAmountLabel:
      order.walletEsimPurchase &&
      order.walletEsimPurchase.promoDiscountCents > 0
        ? formatUsdCentsAmount(
            Math.max(
              0,
              order.walletEsimPurchase.priceCents -
                order.walletEsimPurchase.promoDiscountCents
            )
          )
        : null,
    currencyLabel: currency,
    fundingLabel: customerFundingLabel(order.fundingSource),
    createdAtLabel: formatOrderDate(order.createdAt),
    iccidMasked,
    iccid,
    iccidRevealable,
    emailDeliveryLabel,
    installEligible,
    isRefunded,
    refundStatusLabel,
    refundedAtLabel,
    refundAmountLabel,
    walletCreditedLabel,
    gatewayRefundLabel,
    rewardsEarnedPoints,
    rewardsAppliedPoints,
    offerId: addData.offerId,
    destinationCode: flagCode ? sanitizeCountryHint(flagCode) : null,
    providerOrderId: addData.providerOrderId,
    supportTopUp: addData.supportTopUp,
    supportTopUpType: addData.supportTopUpType,
    rechargeOrderId: addData.rechargeOrderId,
    addDataEligible,
    addDataBlockedReason,
    isAddDataPurchase: addDataPurchase.isAddDataPurchase,
    addDataSourceOrderId: addDataPurchase.addDataSourceOrderId,
    lifecycle: toProviderLifecycleCacheView({
      providerLifecycleStatus: order.providerLifecycleStatus,
      providerRemainingDataGb: order.providerRemainingDataGb,
      providerUsedDataGb: order.providerUsedDataGb,
      providerInitialDataGb: order.providerInitialDataGb,
      providerUsagePercent: order.providerUsagePercent,
      providerActivatedAt: order.providerActivatedAt,
      providerExpiresAt: order.providerExpiresAt,
      providerUsageSyncedAt: order.providerUsageSyncedAt,
    }),
    remainingDataLabel: formatLifecycleGb(order.providerRemainingDataGb),
  };
}
