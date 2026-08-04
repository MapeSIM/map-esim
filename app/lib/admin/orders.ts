import "server-only";

import { OrderStatus, Prisma } from "@prisma/client";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  maskProviderOrderRef,
  normalizeAdminSearchQuery,
  normalizeAdminUserIdFilter,
  parseAdminOrderAssociationFilter,
  parseAdminOrdersPage,
  parseAdminOrderStatusFilter,
  resolveAdminOrdersPageSize,
  type AdminOrderAssociationFilter,
  type AdminOrderStatusFilter,
} from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";

export type AdminOrderListRow = {
  id: string;
  createdAtLabel: string;
  destination: string;
  planPackage: string;
  localStatus: string;
  amountLabel: string;
  providerRefMasked: string;
  associationLabel: "Linked customer" | "Guest order";
  fundingLabel: string;
};

export type AdminOrdersPageResult = {
  rows: AdminOrderListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  status: AdminOrderStatusFilter;
  association: AdminOrderAssociationFilter;
  currency: string;
  /** Optional linked customer id filter (never email). */
  userId: string;
};

export type AdminOrderDetail = {
  id: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  destination: string;
  planPackage: string;
  validity: string;
  localStatus: string;
  amountLabel: string;
  providerRefMasked: string;
  offerId: string;
  associationLabel: "Linked customer" | "Guest order";
  fundingLabel: string;
  customerEmail: string;
  accountStatusLabel: string;
  claimStatusLabel: string;
  claimedAtLabel: string;
  /** Never full ICCID — last-4 mask or Not available */
  iccidHint: string;
};

function fundingSourceLabel(
  fundingSource: string | null | undefined
): string {
  if (fundingSource === "COMPANY_FUNDED") return "Company-funded";
  if (fundingSource === "CUSTOMER_WALLET") return "Wallet-funded";
  if (fundingSource === "DIRECT_PAYMENT") return "Direct payment";
  return "Not available";
}

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

function formatCreatedAt(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function formatOrderAmount(
  amount: Prisma.Decimal | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null) return "Not available";
  const code = (currency ?? "").trim().toUpperCase() || "USD";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Not available";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

function planPackageLabel(
  planName: string | null | undefined,
  dataAllowance: string | null | undefined
): string {
  const plan = (planName ?? "").trim();
  const data = (dataAllowance ?? "").trim();
  if (plan && data) return `${plan} · ${data}`;
  if (plan) return plan;
  if (data) return data;
  return "Not available";
}

function normalizeCurrencyFilter(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v || v === "ALL") return "";
  if (v.length > 8) return "";
  if (!/^[A-Z]{3}$/.test(v)) return "";
  return v;
}

function buildOrderWhere(options: {
  search: string;
  status: AdminOrderStatusFilter;
  association: AdminOrderAssociationFilter;
  currency: string;
  userId: string;
}): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (options.status !== "ALL") {
    where.status = options.status as OrderStatus;
  }

  if (options.userId) {
    // Specific customer deep-link takes precedence over association filter.
    where.userId = options.userId;
  } else if (options.association === "LINKED") {
    where.userId = { not: null };
  } else if (options.association === "GUEST") {
    where.userId = null;
  }

  if (options.currency) {
    where.OR = [
      { providerCurrency: options.currency },
      { providerCurrency: options.currency.toLowerCase() },
    ];
  }

  const q = options.search;
  if (q) {
    // Do not search customerEmail — avoids email-existence oracle.
    const searchFilter: Prisma.OrderWhereInput = {
      OR: [
        { id: { equals: q } },
        { providerOrderId: { contains: q, mode: "insensitive" } },
        { destination: { contains: q, mode: "insensitive" } },
        { planName: { contains: q, mode: "insensitive" } },
        { dataAllowance: { contains: q, mode: "insensitive" } },
      ],
    };

    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), searchFilter];
  }

  return where;
}

export type AdminOrdersQueryInput = {
  q?: string | null;
  status?: string | null;
  association?: string | null;
  currency?: string | null;
  page?: string | null;
  userId?: string | null;
};

/**
 * Paginated admin order list. Call only after requireRole("ADMIN").
 * Controlled sequential reads (count → findMany) — no Promise.all fan-out,
 * no interactive transaction callback.
 */
export async function getAdminOrdersPage(
  input: AdminOrdersQueryInput = {}
): Promise<AdminOrdersPageResult> {
  const search = normalizeAdminSearchQuery(input.q);
  const status = parseAdminOrderStatusFilter(input.status);
  const association = parseAdminOrderAssociationFilter(input.association);
  const currency = normalizeCurrencyFilter(input.currency);
  const userId = normalizeAdminUserIdFilter(input.userId);
  const pageSize = resolveAdminOrdersPageSize(ADMIN_ORDERS_PAGE_SIZE);
  let page = parseAdminOrdersPage(input.page);

  const where = buildOrderWhere({
    search,
    status,
    association,
    currency,
    userId,
  });

  const totalCount = await prisma.order.count({ where });
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  if (page > totalPages) page = totalPages;

  const skip = (page - 1) * pageSize;
  const pageRows = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    skip,
    select: {
      id: true,
      createdAt: true,
      destination: true,
      planName: true,
      dataAllowance: true,
      status: true,
      providerAmount: true,
      providerCurrency: true,
      providerOrderId: true,
      userId: true,
      fundingSource: true,
    },
  });

  const rows: AdminOrderListRow[] = pageRows.map((row) => ({
    id: row.id,
    createdAtLabel: formatCreatedAt(row.createdAt),
    destination: displayOrUnavailable(row.destination),
    planPackage: planPackageLabel(row.planName, row.dataAllowance),
    localStatus: displayOrUnavailable(row.status),
    amountLabel: formatOrderAmount(row.providerAmount, row.providerCurrency),
    providerRefMasked: maskProviderOrderRef(row.providerOrderId),
    associationLabel: row.userId ? "Linked customer" : "Guest order",
    fundingLabel: fundingSourceLabel(row.fundingSource),
  }));

  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages,
    search,
    status,
    association,
    currency,
    userId,
  };
}

/**
 * Single-order admin detail. Call only after requireRole("ADMIN").
 * Returns null when missing (caller should notFound()).
 */
export async function getAdminOrderDetail(
  id: string
): Promise<AdminOrderDetail | null> {
  const orderId = (id ?? "").trim();
  if (!orderId || orderId.length > 64) return null;

  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      destination: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      status: true,
      providerAmount: true,
      providerCurrency: true,
      providerOrderId: true,
      offerId: true,
      customerEmail: true,
      userId: true,
      claimStatus: true,
      claimedAt: true,
      iccidEncrypted: true,
      fundingSource: true,
      user: {
        select: {
          deletedAt: true,
          role: true,
        },
      },
    },
  });

  if (!row) return null;

  let accountStatusLabel: string;
  if (!row.userId) {
    accountStatusLabel = "Guest (no linked account)";
  } else if (row.user?.deletedAt) {
    accountStatusLabel = "Linked account deleted / anonymized";
  } else if (row.user) {
    accountStatusLabel = "Linked account active";
  } else {
    accountStatusLabel = "Linked account unavailable";
  }

  // Never decrypt or emit ICCID ciphertext on this page.
  const iccidHint = row.iccidEncrypted
    ? "On file (hidden)"
    : "Not available";

  return {
    id: row.id,
    createdAtLabel: formatCreatedAt(row.createdAt),
    updatedAtLabel: formatCreatedAt(row.updatedAt),
    destination: displayOrUnavailable(row.destination),
    planPackage: planPackageLabel(row.planName, row.dataAllowance),
    validity: displayOrUnavailable(row.validity),
    localStatus: displayOrUnavailable(row.status),
    amountLabel: formatOrderAmount(row.providerAmount, row.providerCurrency),
    providerRefMasked: maskProviderOrderRef(row.providerOrderId),
    offerId: displayOrUnavailable(row.offerId),
    associationLabel: row.userId ? "Linked customer" : "Guest order",
    fundingLabel: fundingSourceLabel(row.fundingSource),
    customerEmail: displayOrUnavailable(row.customerEmail),
    accountStatusLabel,
    claimStatusLabel: displayOrUnavailable(row.claimStatus),
    claimedAtLabel: row.claimedAt
      ? formatCreatedAt(row.claimedAt)
      : "Not available",
    iccidHint,
  };
}
