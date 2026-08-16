import "server-only";

import { OrderStatus, Prisma, Role } from "@prisma/client";
import { formatStoredIccidLast4 } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
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
  resolveCustomerEsimStatusBadge,
  shortCustomerOrderReference,
  type CustomerEsimStatusBadge,
  type CustomerEsimStatusFilter,
} from "@/app/lib/orders/customerOrderDisplay";

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

function customerIccidDisplay(
  last4: string | null | undefined,
  status: string,
  hasEncrypted: boolean
): string {
  const digits = (last4 ?? "").replace(/\D+/g, "");
  if (digits.length === 4) {
    return formatStoredIccidLast4(digits);
  }
  if (hasEncrypted) return "••••••••••••••••";
  if (status === OrderStatus.FAILED) return "Not provided";
  return "Pending from provider";
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
  /** Masked last-4 or pending — never plaintext/ciphertext. */
  iccidMasked: string;
  emailDeliveryLabel: string | null;
  installEligible: boolean;
  isRefunded: boolean;
};

export type CustomerOrdersListResult = {
  rows: CustomerOrderListRow[];
  search: string;
  status: CustomerEsimStatusFilter;
  from: string;
  to: string;
  totalMatched: number;
};

export type CustomerOrdersQueryInput = {
  q?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * Orders linked to this CUSTOMER userId only — never by email or browser id.
 * Local DB only — never calls the provider. Never returns full ICCID.
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

  if (!id || id.length > 64) {
    return { rows: [], search, status, from, to, totalMatched: 0 };
  }

  const rows = await prisma.order.findMany({
    where: { userId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CUSTOMER_ORDERS_PAGE_LIMIT,
    select: {
      id: true,
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
      walletEsimPurchase: {
        select: {
          status: true,
          destinationCode: true,
          emailDeliveryStatus: true,
          priceCents: true,
        },
      },
      adminPackageAssignment: {
        select: {
          status: true,
          destinationCode: true,
          emailDeliveryStatus: true,
        },
      },
    },
  });

  const searchLower = search.toLowerCase();
  const searchLast4 = search.replace(/\D+/g, "").slice(-4);
  const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
  const toMs = to ? Date.parse(`${to}T23:59:59.999Z`) : null;

  const mapped: CustomerOrderListRow[] = [];

  for (const row of rows) {
    const statusBadge = resolveCustomerEsimStatusBadge({
      orderStatus: row.status,
      walletPurchaseStatus: row.walletEsimPurchase?.status,
      assignmentStatus: row.adminPackageAssignment?.status,
    });
    if (!customerStatusMatchesFilter(statusBadge, status)) continue;

    if (fromMs != null && row.createdAt.getTime() < fromMs) continue;
    if (toMs != null && row.createdAt.getTime() > toMs) continue;

    const iccidMasked = customerIccidDisplay(
      row.iccidLast4,
      row.status,
      Boolean(row.iccidEncrypted?.trim())
    );
    const planName = displayOrUnavailable(row.planName);
    const destination = displayOrUnavailable(row.destination);
    const dataAllowance = displayOrUnavailable(row.dataAllowance);

    if (searchLower) {
      const hay = [
        row.id,
        destination,
        planName,
        dataAllowance,
        row.iccidLast4 ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const last4Hit =
        searchLast4.length === 4 &&
        (row.iccidLast4 ?? "").replace(/\D+/g, "") === searchLast4;
      if (!hay.includes(searchLower) && !last4Hit) continue;
    }

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
    const installEligible =
      row.status === OrderStatus.COMPLETED && statusBadge === "Completed";

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
      emailDeliveryLabel,
      installEligible,
      isRefunded,
    });
  }

  return {
    rows: mapped,
    search,
    status,
    from,
    to,
    totalMatched: mapped.length,
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
  /** Masked last-4 or pending/not-provided — never plaintext. */
  iccidMasked: string;
  /** True only when encrypted ICCID is stored (never includes ciphertext). */
  iccidRevealable: boolean;
  emailDeliveryLabel: string | null;
  installEligible: boolean;
  isRefunded: boolean;
  refundStatusLabel: string | null;
  refundedAtLabel: string | null;
  refundAmountLabel: string | null;
};

/**
 * Load one order only when it belongs to the signed-in CUSTOMER.
 * Local DB only — never fetches broker/provider payloads on page render.
 * Install secrets are loaded only via explicit authorized API actions.
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
      walletEsimPurchase: {
        select: {
          status: true,
          destinationCode: true,
          emailDeliveryStatus: true,
          priceCents: true,
          promoCodeNormalized: true,
          promoDiscountCents: true,
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
          destinationCode: true,
          emailDeliveryStatus: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  const statusBadge = resolveCustomerEsimStatusBadge({
    orderStatus: order.status,
    walletPurchaseStatus: order.walletEsimPurchase?.status,
    assignmentStatus: order.adminPackageAssignment?.status,
  });
  const iccidRevealable = Boolean(order.iccidEncrypted?.trim());
  const iccidMasked = customerIccidDisplay(
    order.iccidLast4,
    order.status,
    iccidRevealable
  );
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
  const installEligible =
    order.status === OrderStatus.COMPLETED && statusBadge === "Completed";

  let refundStatusLabel: string | null = null;
  let refundedAtLabel: string | null = null;
  let refundAmountLabel: string | null = null;
  if (isRefunded) {
    refundStatusLabel = "Refund completed";
    const refundTx = order.walletEsimPurchase?.refundTransaction;
    if (refundTx?.createdAt) {
      refundedAtLabel = formatOrderDate(refundTx.createdAt);
    } else if (order.walletEsimPurchase?.updatedAt) {
      refundedAtLabel = formatOrderDate(order.walletEsimPurchase.updatedAt);
    }
    if (refundTx && Number.isInteger(refundTx.amountCents)) {
      refundAmountLabel = formatUsdCentsAmount(refundTx.amountCents);
    } else if (
      order.walletEsimPurchase &&
      Number.isInteger(order.walletEsimPurchase.priceCents)
    ) {
      refundAmountLabel = formatUsdCentsAmount(
        order.walletEsimPurchase.priceCents
      );
    }
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
    statusLabel: statusBadge,
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
    iccidRevealable,
    emailDeliveryLabel,
    installEligible,
    isRefunded,
    refundStatusLabel,
    refundedAtLabel,
    refundAmountLabel,
  };
}
