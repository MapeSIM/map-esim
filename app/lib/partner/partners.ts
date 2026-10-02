/**
 * Partner admin management: create, discount, disable/reactivate, list/detail.
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  Prisma,
  Role,
  WalletCurrency,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import { isValidEmailFormat, normalizeEmail } from "@/app/lib/auth/email";
import { sendPartnerInviteEmail } from "@/app/lib/email/sendPartnerInviteEmail";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { maskAdminEmail } from "@/app/lib/admin/display";
import {
  formatDiscountBpsAsPercent,
  parseDiscountPercentToBps,
} from "@/app/lib/partner/discount";
import {
  buildPartnerInviteSetupUrl,
  mintPartnerInviteToken,
} from "@/app/lib/partner/partnerInvite";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export const PARTNER_CREATED_AUDIT = "partner.created";
export const PARTNER_DISCOUNT_CHANGED_AUDIT = "partner.discount_changed";
export const PARTNER_DISABLED_AUDIT = "partner.disabled";
export const PARTNER_REACTIVATED_AUDIT = "partner.reactivated";
export const PARTNER_INVITATION_RESENT_AUDIT = "partner.invitation_resent";
export const PARTNER_DISPLAY_NAME_CHANGED_AUDIT =
  "partner.display_name_changed";
export const PARTNER_MANAGEMENT_BLOCKED_AUDIT = "partner.management_action_blocked";
export const PARTNER_PASSWORD_SETUP_COMPLETED_AUDIT =
  "partner.password_setup_completed";

const PARTNERS_PAGE_SIZE = 20;
const PARTNER_DETAIL_ORDERS_PAGE_SIZE = 10;
const PARTNER_DETAIL_PAYMENTS_PAGE_SIZE = 10;
const NAME_MIN = 1;
const NAME_MAX = 120;

export type PartnerStatusLabel = "Active" | "Invited" | "Disabled" | "Deleted";

export type PartnerListRow = {
  id: string;
  userId: string;
  createdAtLabel: string;
  name: string;
  emailMasked: string;
  discountPercentLabel: string;
  /** Lifetime retail − partner charge on COMPLETED purchases only (snapshot; read-only). */
  discountSavingsLabel: string;
  balanceLabel: string;
  statusLabel: PartnerStatusLabel;
  /** CAS token for existing disable / enable actions (read-only list field). */
  statusVersion: number;
  /** COMPLETED PartnerEsimPurchase count only. */
  totalOrders: number;
  totalOrdersLabel: string;
  /** Sum of partnerChargeCents on COMPLETED purchases only. */
  revenueLabel: string;
};

export type PartnerListKpis = {
  totalCount: number;
  activeCount: number;
  invitedCount: number;
  disabledCount: number;
};

export type PartnersPageResult = {
  rows: PartnerListRow[];
  kpis: PartnerListKpis;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  status: PartnerStatusFilter;
};

export type PartnerStatusFilter = "ALL" | "ACTIVE" | "INVITED" | "DISABLED" | "DELETED";

export type PartnerWalletTxRow = {
  id: string;
  typeLabel: string;
  amountLabel: string;
  balanceBeforeLabel: string;
  balanceAfterLabel: string;
  reason: string;
  referenceLabel: string | null;
  createdAtLabel: string;
  createdByAdminLabel: string;
};

/** Exact PartnerEsimPurchaseStatus values from Prisma (read-only filter allowlist). */
export const PARTNER_DETAIL_PURCHASE_STATUSES = [
  PartnerEsimPurchaseStatus.DRAFT,
  PartnerEsimPurchaseStatus.READY,
  PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
  PartnerEsimPurchaseStatus.FUNDS_RESERVED,
  PartnerEsimPurchaseStatus.FUNDED,
  PartnerEsimPurchaseStatus.PROVIDER_PENDING,
  PartnerEsimPurchaseStatus.COMPLETED,
  PartnerEsimPurchaseStatus.FAILED_REFUNDED,
  PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
] as const;

export type PartnerDetailPurchaseStatusFilter =
  | "ALL"
  | (typeof PARTNER_DETAIL_PURCHASE_STATUSES)[number];

export type PartnerDetailPurchaseRow = {
  id: string;
  planLabel: string;
  destinationLabel: string;
  dataAllowanceLabel: string;
  validityLabel: string;
  amountLabel: string;
  currencyLabel: string;
  fundingLabel: string;
  status: string;
  statusLabel: string;
  createdAtLabel: string;
  paymentAttemptId: string | null;
  paymentAttemptStatus: string | null;
  paymentAttemptStatusLabel: string | null;
  paymentHref: string | null;
};

export type PartnerDetailPaymentRow = {
  id: string;
  amountLabel: string;
  status: string;
  statusLabel: string;
  methodLabel: string;
  createdAtLabel: string;
  href: string;
};

export type PartnerDetail = {
  id: string;
  userId: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  name: string;
  email: string;
  statusLabel: PartnerStatusLabel;
  discountPercentLabel: string;
  discountBps: number;
  discountVersion: number;
  statusVersion: number;
  disabledAtLabel: string;
  deletedAtLabel: string;
  credentialsAvailableLabel: "Yes" | "No";
  balanceCents: number;
  balanceLabel: string;
  hasWallet: boolean;
  totalAddedLabel: string;
  totalDeductedLabel: string;
  transactions: PartnerWalletTxRow[];
  /** COMPLETED purchases only (read-only KPI). */
  totalOrders: number;
  totalOrdersLabel: string;
  revenueLabel: string;
  discountSavingsLabel: string;
  /** All PartnerEsimPurchase rows for this partner (optional status filter). */
  purchases: PartnerDetailPurchaseRow[];
  purchasesPage: number;
  purchasesPageSize: number;
  purchasesTotalCount: number;
  purchasesTotalPages: number;
  purchasesStatusFilter: PartnerDetailPurchaseStatusFilter;
  payments: PartnerDetailPaymentRow[];
  paymentsPage: number;
  paymentsPageSize: number;
  paymentsTotalCount: number;
  paymentsTotalPages: number;
};

export type PartnersMutationResult =
  | {
      ok: true;
      message: string;
      partnerId?: string;
      discountVersion?: number;
      statusVersion?: number;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<
          "name" | "email" | "discountPercent" | "expectedVersion" | "reason",
          string
        >
      >;
    };

class PartnersCasConflictError extends Error {
  constructor() {
    super("partners_cas_conflict");
    this.name = "PartnersCasConflictError";
  }
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "Not available";
  return formatWalletDateTime(date);
}

function resolvePartnerStatus(options: {
  deletedAt: Date | null;
  disabledAt: Date | null;
  passwordHash: string | null;
}): PartnerStatusLabel {
  if (options.deletedAt) return "Deleted";
  if (options.disabledAt) return "Disabled";
  if (!options.passwordHash) return "Invited";
  return "Active";
}

function parseExpectedVersion(
  raw: FormDataEntryValue | string | number | null | undefined
): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseName(raw: FormDataEntryValue | string | null | undefined): {
  ok: true;
  name: string;
} | {
  ok: false;
  error: string;
} {
  const name = String(raw ?? "").trim();
  if (name.length < NAME_MIN) {
    return { ok: false, error: "Name is required." };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be at most ${NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

function parsePartnerStatusFilter(raw: string | undefined): PartnerStatusFilter {
  const value = (raw ?? "ALL").trim().toUpperCase();
  if (
    value === "ACTIVE" ||
    value === "INVITED" ||
    value === "DISABLED" ||
    value === "DELETED"
  ) {
    return value;
  }
  return "ALL";
}

function parsePartnersPage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function normalizeSearch(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 100);
}

function partnerTxTypeLabel(type: PartnerWalletTransactionType): string {
  switch (type) {
    case PartnerWalletTransactionType.ADMIN_CREDIT:
      return "Admin credit";
    case PartnerWalletTransactionType.ADMIN_DEBIT:
      return "Admin debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT:
      return "Purchase debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_REFUND:
      return "Purchase refund";
    case PartnerWalletTransactionType.TOPUP_CREDIT:
      return "Add Funds";
    default:
      return "Transaction";
  }
}

function formatPartnerTxAmount(
  amountCents: number,
  type: PartnerWalletTransactionType
): string {
  if (
    type === PartnerWalletTransactionType.ADMIN_DEBIT ||
    type === PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT
  ) {
    return formatUsdCents(-Math.abs(amountCents));
  }
  const body = formatUsdCents(Math.abs(amountCents));
  if (body === "$0.00") return body;
  return `+${body}`;
}

async function auditBlocked(options: {
  actorUserId: string;
  targetId?: string | null;
  failureCode: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: options.actorUserId,
    action: PARTNER_MANAGEMENT_BLOCKED_AUDIT,
    targetType: "PartnerProfile",
    targetId: options.targetId ?? null,
    metadata: {
      failureCode: options.failureCode,
      ...(options.metadata && typeof options.metadata === "object"
        ? (options.metadata as Record<string, unknown>)
        : {}),
    },
  });
}

function buildStatusWhere(
  status: PartnerStatusFilter
): Prisma.PartnerProfileWhereInput {
  switch (status) {
    case "ACTIVE":
      return {
        disabledAt: null,
        user: { deletedAt: null, passwordHash: { not: null } },
      };
    case "INVITED":
      return {
        disabledAt: null,
        user: { deletedAt: null, passwordHash: null },
      };
    case "DISABLED":
      return { disabledAt: { not: null }, user: { deletedAt: null } };
    case "DELETED":
      return { user: { deletedAt: { not: null } } };
    default:
      return {};
  }
}

export async function listPartnersPage(options: {
  q?: string;
  status?: string;
  page?: string;
}): Promise<PartnersPageResult> {
  const search = normalizeSearch(options.q);
  const status = parsePartnerStatusFilter(options.status);
  const page = parsePartnersPage(options.page);

  const searchWhere: Prisma.PartnerProfileWhereInput | undefined = search
    ? {
        OR: [
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { id: search },
          { userId: search },
        ],
      }
    : undefined;

  const where: Prisma.PartnerProfileWhereInput = {
    ...buildStatusWhere(status),
    ...(searchWhere ?? {}),
  };

  const [
    totalCount,
    activeCount,
    invitedCount,
    disabledCount,
  ] = await Promise.all([
    prisma.partnerProfile.count({ where: searchWhere ?? {} }),
    prisma.partnerProfile.count({
      where: { ...buildStatusWhere("ACTIVE"), ...(searchWhere ?? {}) },
    }),
    prisma.partnerProfile.count({
      where: { ...buildStatusWhere("INVITED"), ...(searchWhere ?? {}) },
    }),
    prisma.partnerProfile.count({
      where: { ...buildStatusWhere("DISABLED"), ...(searchWhere ?? {}) },
    }),
  ]);

  const filteredTotalCount = await prisma.partnerProfile.count({ where });
  const totalPages =
    filteredTotalCount === 0
      ? 1
      : Math.ceil(filteredTotalCount / PARTNERS_PAGE_SIZE);
  const safePage = page > totalPages ? totalPages : page;
  const skip = (safePage - 1) * PARTNERS_PAGE_SIZE;

  const rows = await prisma.partnerProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: PARTNERS_PAGE_SIZE,
    select: {
      id: true,
      userId: true,
      discountBps: true,
      statusVersion: true,
      disabledAt: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          deletedAt: true,
          passwordHash: true,
        },
      },
      walletAccount: {
        select: { balanceCents: true },
      },
    },
  });

  const partnerIds = rows.map((row) => row.id);
  const completedAgg =
    partnerIds.length === 0
      ? []
      : await prisma.partnerEsimPurchase.groupBy({
          by: ["partnerId"],
          where: {
            partnerId: { in: partnerIds },
            status: PartnerEsimPurchaseStatus.COMPLETED,
          },
          _count: { _all: true },
          _sum: {
            partnerChargeCents: true,
            retailPriceCents: true,
          },
        });

  const aggByPartner = new Map(
    completedAgg.map((row) => [
      row.partnerId,
      {
        orders: row._count._all,
        revenueCents: row._sum.partnerChargeCents ?? 0,
        retailCents: row._sum.retailPriceCents ?? 0,
      },
    ])
  );

  return {
    rows: rows.map((row) => {
      const agg = aggByPartner.get(row.id) ?? {
        orders: 0,
        revenueCents: 0,
        retailCents: 0,
      };
      const savingsCents = Math.max(0, agg.retailCents - agg.revenueCents);
      return {
        id: row.id,
        userId: row.userId,
        createdAtLabel: formatDateTime(row.createdAt),
        name: row.user.name,
        emailMasked: maskAdminEmail(row.user.email),
        discountPercentLabel: `${formatDiscountBpsAsPercent(row.discountBps)}%`,
        discountSavingsLabel: formatUsdCents(savingsCents),
        balanceLabel: formatUsdCents(row.walletAccount?.balanceCents ?? 0),
        statusLabel: resolvePartnerStatus({
          deletedAt: row.user.deletedAt,
          disabledAt: row.disabledAt,
          passwordHash: row.user.passwordHash,
        }),
        statusVersion: row.statusVersion,
        totalOrders: agg.orders,
        totalOrdersLabel: String(agg.orders),
        revenueLabel: formatUsdCents(agg.revenueCents),
      };
    }),
    kpis: {
      totalCount,
      activeCount,
      invitedCount,
      disabledCount,
    },
    page: safePage,
    pageSize: PARTNERS_PAGE_SIZE,
    totalCount: filteredTotalCount,
    totalPages,
    search,
    status,
  };
}

function partnerPurchasePlanLabel(row: {
  destinationName: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  offerId: string;
}): string {
  const parts = [
    (row.destinationName ?? "").trim(),
    (row.planName ?? "").trim(),
    (row.dataAllowance ?? "").trim(),
    (row.validity ?? "").trim(),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  const offer = (row.offerId ?? "").trim();
  return offer || "Plan not available";
}

function partnerPurchaseDestinationLabel(row: {
  destinationName: string | null;
  destinationCode: string | null;
}): string {
  const name = (row.destinationName ?? "").trim();
  if (name) return name;
  const code = (row.destinationCode ?? "").trim();
  return code || "—";
}

function partnerPurchaseStoredLabel(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  return value || "—";
}

function partnerFundingSourceLabel(fundingSource: string | null | undefined): string {
  switch ((fundingSource ?? "").trim()) {
    case "PARTNER_BALANCE":
      return "Partner wallet";
    case "PARTNER_SPLIT":
      return "Wallet + gateway";
    case "PARTNER_GATEWAY":
      return "Gateway";
    default: {
      const value = (fundingSource ?? "").trim();
      return value ? value.replace(/_/g, " ") : "—";
    }
  }
}

function partnerPaymentMethodLabel(
  provider: string | null | undefined
): string {
  const value = (provider ?? "").trim();
  return value || "—";
}

function parsePartnerDetailPurchaseStatusFilter(
  raw: string | null | undefined
): PartnerDetailPurchaseStatusFilter {
  const value = String(raw ?? "ALL").trim().toUpperCase();
  if (value === "ALL" || !value) return "ALL";
  if (
    (PARTNER_DETAIL_PURCHASE_STATUSES as readonly string[]).includes(value)
  ) {
    return value as PartnerDetailPurchaseStatusFilter;
  }
  return "ALL";
}

function partnerDetailPurchasesWhere(
  partnerId: string,
  statusFilter: PartnerDetailPurchaseStatusFilter
): Prisma.PartnerEsimPurchaseWhereInput {
  if (statusFilter === "ALL") {
    return { partnerId };
  }
  return { partnerId, status: statusFilter };
}

export async function getPartnerDetail(
  partnerId: string,
  options?: {
    ordersPage?: string | null;
    paymentsPage?: string | null;
    purchaseStatus?: string | null;
  }
): Promise<PartnerDetail | null> {
  const id = (partnerId ?? "").trim();
  if (!id || id.length > 64) return null;

  const ordersPage = parsePartnersPage(options?.ordersPage ?? undefined);
  const paymentsPage = parsePartnersPage(options?.paymentsPage ?? undefined);
  const purchasesStatusFilter = parsePartnerDetailPurchaseStatusFilter(
    options?.purchaseStatus
  );

  const row = await prisma.partnerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      discountBps: true,
      discountVersion: true,
      statusVersion: true,
      disabledAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
          deletedAt: true,
          passwordHash: true,
        },
      },
      walletAccount: {
        select: {
          balanceCents: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              type: true,
              amountCents: true,
              balanceBeforeCents: true,
              balanceAfterCents: true,
              reason: true,
              referenceType: true,
              referenceId: true,
              createdAt: true,
              createdByAdmin: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  // KPI aggregates stay COMPLETED-only (unchanged commercial metrics).
  const completedWhere = {
    partnerId: row.id,
    status: PartnerEsimPurchaseStatus.COMPLETED,
  } as const;
  const purchasesWhere = partnerDetailPurchasesWhere(
    row.id,
    purchasesStatusFilter
  );

  const [
    creditAgg,
    debitAgg,
    completedAgg,
    purchasesTotalCount,
    paymentsTotalCount,
  ] = await Promise.all([
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_CREDIT,
        wallet: { partnerId: row.id },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_DEBIT,
        wallet: { partnerId: row.id },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerEsimPurchase.aggregate({
      where: completedWhere,
      _count: { _all: true },
      _sum: {
        partnerChargeCents: true,
        retailPriceCents: true,
      },
    }),
    prisma.partnerEsimPurchase.count({ where: purchasesWhere }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: { purchase: { partnerId: row.id } },
    }),
  ]);

  const purchasesTotalPages = Math.max(
    1,
    Math.ceil(purchasesTotalCount / PARTNER_DETAIL_ORDERS_PAGE_SIZE)
  );
  const safeOrdersPage =
    ordersPage > purchasesTotalPages ? purchasesTotalPages : ordersPage;
  const paymentsTotalPages = Math.max(
    1,
    Math.ceil(paymentsTotalCount / PARTNER_DETAIL_PAYMENTS_PAGE_SIZE)
  );
  const safePaymentsPage =
    paymentsPage > paymentsTotalPages ? paymentsTotalPages : paymentsPage;

  const [purchases, payments] = await Promise.all([
    prisma.partnerEsimPurchase.findMany({
      where: purchasesWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safeOrdersPage - 1) * PARTNER_DETAIL_ORDERS_PAGE_SIZE,
      take: PARTNER_DETAIL_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        offerId: true,
        destinationCode: true,
        destinationName: true,
        planName: true,
        dataAllowance: true,
        validity: true,
        partnerChargeCents: true,
        currency: true,
        fundingSource: true,
        status: true,
        createdAt: true,
        paymentAttempts: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
          },
        },
      },
    }),
    prisma.partnerEsimPurchasePaymentAttempt.findMany({
      where: { purchase: { partnerId: row.id } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePaymentsPage - 1) * PARTNER_DETAIL_PAYMENTS_PAGE_SIZE,
      take: PARTNER_DETAIL_PAYMENTS_PAGE_SIZE,
      select: {
        id: true,
        gatewayAmountCents: true,
        currency: true,
        status: true,
        gatewayProvider: true,
        createdAt: true,
      },
    }),
  ]);

  const balanceCents = row.walletAccount?.balanceCents ?? 0;
  const revenueCents = completedAgg._sum.partnerChargeCents ?? 0;
  const retailCents = completedAgg._sum.retailPriceCents ?? 0;
  const savingsCents = Math.max(0, retailCents - revenueCents);
  const totalOrders = completedAgg._count._all;

  return {
    id: row.id,
    userId: row.userId,
    createdAtLabel: formatDateTime(row.createdAt),
    updatedAtLabel: formatDateTime(row.updatedAt),
    name: row.user.name,
    email: row.user.email,
    statusLabel: resolvePartnerStatus({
      deletedAt: row.user.deletedAt,
      disabledAt: row.disabledAt,
      passwordHash: row.user.passwordHash,
    }),
    discountPercentLabel: `${formatDiscountBpsAsPercent(row.discountBps)}%`,
    discountBps: row.discountBps,
    discountVersion: row.discountVersion,
    statusVersion: row.statusVersion,
    disabledAtLabel: formatDateTime(row.disabledAt),
    deletedAtLabel: formatDateTime(row.user.deletedAt),
    credentialsAvailableLabel: row.user.passwordHash ? "Yes" : "No",
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    hasWallet: Boolean(row.walletAccount),
    totalAddedLabel: formatUsdCents(creditAgg._sum.amountCents ?? 0),
    totalDeductedLabel: formatUsdCents(debitAgg._sum.amountCents ?? 0),
    transactions: (row.walletAccount?.transactions ?? []).map((tx) => ({
      id: tx.id,
      typeLabel: partnerTxTypeLabel(tx.type),
      amountLabel: formatPartnerTxAmount(tx.amountCents, tx.type),
      balanceBeforeLabel: formatUsdCents(tx.balanceBeforeCents),
      balanceAfterLabel: formatUsdCents(tx.balanceAfterCents),
      reason: tx.reason,
      referenceLabel:
        tx.referenceType || tx.referenceId
          ? [tx.referenceType, tx.referenceId].filter(Boolean).join(" · ")
          : null,
      createdAtLabel: formatDateTime(tx.createdAt),
      createdByAdminLabel: tx.createdByAdmin
        ? tx.createdByAdmin.name || tx.createdByAdmin.email
        : "Not available",
    })),
    totalOrders,
    totalOrdersLabel: String(totalOrders),
    revenueLabel: formatUsdCents(revenueCents),
    discountSavingsLabel: formatUsdCents(savingsCents),
    purchases: purchases.map((purchase) => {
      const latestAttempt = purchase.paymentAttempts[0] ?? null;
      return {
        id: purchase.id,
        planLabel: partnerPurchasePlanLabel(purchase),
        destinationLabel: partnerPurchaseDestinationLabel(purchase),
        dataAllowanceLabel: partnerPurchaseStoredLabel(purchase.dataAllowance),
        validityLabel: partnerPurchaseStoredLabel(purchase.validity),
        amountLabel: formatUsdCents(purchase.partnerChargeCents),
        currencyLabel: (purchase.currency || "USD").trim() || "USD",
        fundingLabel: partnerFundingSourceLabel(purchase.fundingSource),
        status: purchase.status,
        statusLabel: purchase.status.replace(/_/g, " "),
        createdAtLabel: formatDateTime(purchase.createdAt),
        paymentAttemptId: latestAttempt?.id ?? null,
        paymentAttemptStatus: latestAttempt?.status ?? null,
        paymentAttemptStatusLabel: latestAttempt
          ? latestAttempt.status.replace(/_/g, " ")
          : null,
        paymentHref: latestAttempt
          ? `/admin/payments/${encodeURIComponent(latestAttempt.id)}?kind=partner`
          : null,
      };
    }),
    purchasesPage: safeOrdersPage,
    purchasesPageSize: PARTNER_DETAIL_ORDERS_PAGE_SIZE,
    purchasesTotalCount,
    purchasesTotalPages,
    purchasesStatusFilter,
    payments: payments.map((payment) => ({
      id: payment.id,
      amountLabel: `${formatUsdCents(payment.gatewayAmountCents)} ${payment.currency || "USD"}`,
      status: payment.status,
      statusLabel: payment.status.replace(/_/g, " "),
      methodLabel: partnerPaymentMethodLabel(payment.gatewayProvider),
      createdAtLabel: formatDateTime(payment.createdAt),
      href: `/admin/payments/${encodeURIComponent(payment.id)}?kind=partner`,
    })),
    paymentsPage: safePaymentsPage,
    paymentsPageSize: PARTNER_DETAIL_PAYMENTS_PAGE_SIZE,
    paymentsTotalCount,
    paymentsTotalPages,
  };
}

export async function createPartner(options: {
  adminUserId: string;
  name: FormDataEntryValue | string | null;
  email: FormDataEntryValue | string | null;
  discountPercentRaw: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const nameParsed = parseName(options.name);
  if (!nameParsed.ok) {
    return {
      ok: false,
      error: nameParsed.error,
      fieldErrors: { name: nameParsed.error },
    };
  }

  const email = normalizeEmail(String(options.email ?? ""));
  if (!isValidEmailFormat(email)) {
    return {
      ok: false,
      error: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  const discountParsed = parseDiscountPercentToBps(options.discountPercentRaw);
  if (!discountParsed.ok) {
    return {
      ok: false,
      error: discountParsed.error,
      fieldErrors: { discountPercent: discountParsed.error },
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, deletedAt: true },
  });

  if (existing) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: existing.id,
      failureCode: "email_collision",
      metadata: { existingRole: existing.role },
    });
    return {
      ok: false,
      error:
        "This email is already registered. Partner accounts require a dedicated email.",
      fieldErrors: {
        email:
          "This email is already registered. Partner accounts require a dedicated email.",
      },
    };
  }

  const now = new Date();
  let createdPartnerId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: nameParsed.name,
          email,
          role: Role.PARTNER,
          passwordHash: null,
          emailVerifiedAt: now,
          credentialsChangedAt: now,
        },
        select: { id: true },
      });

      const profile = await tx.partnerProfile.create({
        data: {
          userId: user.id,
          discountBps: discountParsed.discountBps,
          discountVersion: 0,
          statusVersion: 0,
        },
        select: { id: true },
      });

      await tx.partnerWalletAccount.create({
        data: {
          partnerId: profile.id,
          currency: WalletCurrency.USD,
          balanceCents: 0,
          version: 0,
        },
      });

      createdPartnerId = profile.id;

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_CREATED_AUDIT,
          targetType: "PartnerProfile",
          targetId: profile.id,
          metadata: {
            partnerUserId: user.id,
            discountBps: discountParsed.discountBps,
            inviteMethod: "opaque_setup_link",
          },
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await auditBlocked({
        actorUserId: actor.id,
        failureCode: "email_unique_conflict",
      });
      return {
        ok: false,
        error: "This email cannot be used right now. Please reload and try again.",
      };
    }
    throw err;
  }

  let inviteEmailDelivered = false;
  const user = await prisma.user.findFirst({
    where: { partnerProfile: { id: createdPartnerId } },
    select: { id: true, email: true },
  });

  if (user) {
    try {
      const minted = await mintPartnerInviteToken(user.id);
      const setupUrl = buildPartnerInviteSetupUrl(minted.rawToken);
      const sent = await sendPartnerInviteEmail({
        to: user.email,
        setupUrl,
      });
      if (sent.ok) {
        inviteEmailDelivered = true;
      } else {
        console.error("Partner invite email failed:", sent.reason);
      }
    } catch (err) {
      console.error(
        "Partner invite mint/send failed:",
        err instanceof Error ? err.name : "unknown"
      );
    }
  }

  return {
    ok: true,
    partnerId: createdPartnerId,
    message: inviteEmailDelivered
      ? "Partner invited. They will receive a password setup link by email."
      : "Partner account created, but the invitation email could not be sent. Use Resend setup link on the Partner detail page, or ask them to use Forgot Password after a link is delivered.",
  };
}

/**
 * Resend Partner setup link when passwordHash is still null (Invited).
 * Supersedes prior unused invite tokens. Never returns/logs the raw token.
 */
export async function resendPartnerInvitation(options: {
  adminUserId: string;
  partnerId: string;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner is unavailable." };
  }

  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!partner || partner.user.role !== Role.PARTNER) {
    return { ok: false, error: "Partner is unavailable." };
  }
  if (partner.user.deletedAt) {
    return { ok: false, error: "Deleted partners cannot receive invitations." };
  }
  if (partner.disabledAt) {
    return {
      ok: false,
      error: "Reactivate the Partner before resending a setup link.",
    };
  }
  if (partner.user.passwordHash) {
    return {
      ok: false,
      error:
        "This Partner already has a password. Use Forgot Password for recovery.",
    };
  }

  let inviteEmailDelivered = false;
  try {
    const minted = await mintPartnerInviteToken(partner.user.id);
    const setupUrl = buildPartnerInviteSetupUrl(minted.rawToken);
    const sent = await sendPartnerInviteEmail({
      to: partner.user.email,
      setupUrl,
    });
    inviteEmailDelivered = sent.ok;
    if (!sent.ok) {
      console.error("Partner invite resend email failed:", sent.reason);
    }
  } catch (err) {
    console.error(
      "Partner invite resend failed:",
      err instanceof Error ? err.name : "unknown"
    );
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: PARTNER_INVITATION_RESENT_AUDIT,
    targetType: "PartnerProfile",
    targetId: partner.id,
    metadata: {
      partnerUserId: partner.user.id,
      emailDelivered: inviteEmailDelivered,
    },
  });

  if (!inviteEmailDelivered) {
    return {
      ok: false,
      error:
        "Could not send the setup link email. The previous unused links were superseded; try again shortly.",
    };
  }

  return {
    ok: true,
    partnerId: partner.id,
    message: "Setup link resent. It expires in 30 minutes.",
  };
}

export async function changePartnerDiscount(options: {
  adminUserId: string;
  partnerId: string;
  discountPercentRaw: FormDataEntryValue | string | null;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const discountParsed = parseDiscountPercentToBps(options.discountPercentRaw);
  if (!discountParsed.ok) {
    return {
      ok: false,
      error: discountParsed.error,
      fieldErrors: { discountPercent: discountParsed.error },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      discountBps: true,
      discountVersion: true,
      disabledAt: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (
    !profile ||
    profile.user.role !== Role.PARTNER ||
    profile.user.deletedAt ||
    profile.disabledAt
  ) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner is unavailable." };
  }

  if (profile.discountBps === discountParsed.discountBps) {
    return {
      ok: true,
      message: "Discount unchanged.",
      discountVersion: profile.discountVersion,
    };
  }

  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          discountVersion: expectedVersion,
          disabledAt: null,
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          discountBps: discountParsed.discountBps,
          discountVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_DISCOUNT_CHANGED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            previousDiscountBps: profile.discountBps,
            discountBps: discountParsed.discountBps,
            discountVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner discount updated.",
    discountVersion: nextVersion,
  };
}

export async function disablePartner(options: {
  adminUserId: string;
  partnerId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
  reason: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const reason = String(options.reason ?? "").trim();
  if (reason.length < 8 || reason.length > 500) {
    return {
      ok: false,
      error: "Enter a reason between 8 and 500 characters.",
      fieldErrors: { reason: "Enter a reason between 8 and 500 characters." },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      userId: true,
      disabledAt: true,
      statusVersion: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (!profile || profile.user.role !== Role.PARTNER || profile.user.deletedAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner not found." };
  }

  if (profile.disabledAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "already_disabled",
    });
    return { ok: false, error: "This partner is already disabled." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          statusVersion: expectedVersion,
          disabledAt: null,
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          disabledAt: now,
          statusVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.user.update({
        where: { id: profile.userId },
        data: { credentialsChangedAt: now },
      });

      await tx.session.deleteMany({ where: { userId: profile.userId } });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_DISABLED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            reason,
            statusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner disabled.",
    statusVersion: nextVersion,
  };
}

export async function reactivatePartner(options: {
  adminUserId: string;
  partnerId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
  reason: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const reason = String(options.reason ?? "").trim();
  if (reason.length < 8 || reason.length > 500) {
    return {
      ok: false,
      error: "Enter a reason between 8 and 500 characters.",
      fieldErrors: { reason: "Enter a reason between 8 and 500 characters." },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      userId: true,
      disabledAt: true,
      statusVersion: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (!profile || profile.user.role !== Role.PARTNER || profile.user.deletedAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner not found." };
  }

  if (!profile.disabledAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "not_disabled",
    });
    return { ok: false, error: "Only disabled partners can be reactivated." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          statusVersion: expectedVersion,
          disabledAt: { not: null },
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          disabledAt: null,
          statusVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.user.update({
        where: { id: profile.userId },
        data: { credentialsChangedAt: now },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_REACTIVATED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            reason,
            statusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner reactivated.",
    statusVersion: nextVersion,
  };
}

/**
 * Safe admin profile edit: updates User.name only for a PARTNER account.
 * Does not change email, discount, wallet, status, or password.
 */
export async function updatePartnerDisplayName(options: {
  adminUserId: string;
  partnerId: string;
  name: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const nameParsed = parseName(options.name);
  if (!nameParsed.ok) {
    return {
      ok: false,
      error: nameParsed.error,
      fieldErrors: { name: nameParsed.error },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          name: true,
          role: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!profile || profile.user.role !== Role.PARTNER) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner not found." };
  }

  if (profile.user.deletedAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_deleted",
    });
    return { ok: false, error: "Deleted partners cannot be edited." };
  }

  const previousName = profile.user.name;
  if (previousName === nameParsed.name) {
    return { ok: true, message: "No name changes to save." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: profile.userId },
      data: { name: nameParsed.name },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: PARTNER_DISPLAY_NAME_CHANGED_AUDIT,
        targetType: "PartnerProfile",
        targetId: partnerId,
        metadata: {
          previousName,
          nextName: nameParsed.name,
        },
      },
    });
  });

  return {
    ok: true,
    message: "Partner name updated.",
    partnerId,
  };
}
