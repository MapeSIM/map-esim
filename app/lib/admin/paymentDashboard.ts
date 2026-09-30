/**
 * Read-only Admin Payment Dashboard loaders.
 * Never funds, never marks paid, never replays webhooks, never enables the gateway.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PaymentGatewayProvider,
  Prisma,
} from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import {
  buildAdminWalletPurchaseReconciliationHref,
  isAdminWalletReconciliationLinkApplicable,
} from "@/app/lib/admin/adminWalletReservationDisplay";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  ADMIN_PAYMENTS_PAGE_SIZE,
  ADMIN_PAYMENTS_PAGE_SIZE_MAX,
  isPaymentDashboardPendingAttemptStatus,
  normalizePaymentDashboardDateRange,
  parsePaymentDashboardOwnerFilter,
  parsePaymentDashboardPage,
  parsePaymentDashboardProviderFilter,
  parsePaymentDashboardSearch,
  parsePaymentDashboardStatusFilter,
  parsePaymentDashboardWebhookFilter,
  paymentAttemptStatusesForFilter,
  paymentDashboardAttemptHref,
  paymentDashboardInquiryPlaceholder,
  paymentDashboardOwnerLabel,
  paymentDashboardWebhookLabel,
  formatAdminPaymentChargeLabel,
  type PaymentDashboardOwnerFilter,
  type PaymentDashboardProviderFilter,
  type PaymentDashboardStatusFilter,
  type PaymentDashboardWebhookFilter,
} from "@/app/lib/admin/paymentDashboardShared";
import { countPaymentRecoveryCandidates } from "@/app/lib/admin/paymentRecovery";
import {
  isPaymentRecoveryStaleReleaseEligible,
  parsePaymentRecoveryStaleMs,
} from "@/app/lib/admin/paymentRecoveryShared";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { maskSafepayTrackerRef } from "@/app/lib/payments/safepayReporterParse";

export type AdminPaymentDashboardKpis = {
  totalCount: number;
  pendingCount: number;
  failedCount: number;
  completedCount: number;
  webhookMissingAmongPendingCount: number;
  recoveryCandidateCount: number;
};

export type AdminPaymentListRow = {
  attemptId: string;
  purchaseId: string;
  orderId: string | null;
  ownerKind: "customer" | "partner";
  ownerLabel: string;
  customerLabel: string;
  customerHref: string | null;
  amountLabel: string;
  chargeLabel: string | null;
  providerLabel: string;
  methodLabel: string;
  attemptStatus: string;
  purchaseStatus: string;
  providerRefMasked: string;
  webhookLabel: string;
  webhookEventIdPresent: boolean;
  inquiryLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  createdAt: Date;
  updatedAt: Date;
  href: string;
  /** Existing detail release form — no new mutation. */
  staleReleaseEligible: boolean;
  staleReleaseHref: string | null;
  /** Existing stuck-case page — customer only when status-gated. */
  reconciliationHref: string | null;
};

export type AdminPaymentDetail = {
  attemptId: string;
  purchaseId: string;
  orderId: string | null;
  ownerKind: "customer" | "partner";
  customerUserId: string | null;
  customerLabel: string;
  customerHref: string | null;
  gatewayProvider: string | null;
  providerLabel: string;
  methodLabel: string;
  attemptStatus: string;
  purchaseStatus: string;
  gatewayAmountCents: number;
  currency: string;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  amountLabel: string;
  chargeLabel: string | null;
  providerRefMasked: string;
  webhookEventIdPresent: boolean;
  webhookLabel: string;
  inquiryLabel: string;
  walletAppliedCents: number;
  failureCategory: string | null;
  failureCode: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  createdAt: Date;
  updatedAt: Date;
  failedAt: Date | null;
  cancelledAt: Date | null;
  failedAtLabel: string | null;
  cancelledAtLabel: string | null;
  investigationAvailable: boolean;
  isSimpaisa: boolean;
};

type AttemptFilterInput = {
  status: PaymentDashboardStatusFilter;
  provider: PaymentDashboardProviderFilter;
  webhook: PaymentDashboardWebhookFilter;
  q: string;
  createdFrom: Date | null;
  createdTo: Date | null;
};

function customerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): string {
  if (!user) return "Not available";
  const name = (user.name ?? "").trim() || "Customer";
  return `${name} · ${maskAdminEmail(user.email)}`;
}

function partnerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): string {
  if (!user) return "Partner unavailable";
  const name = (user.name ?? "").trim() || "Partner";
  return `${name} · ${maskAdminEmail(user.email)}`;
}

function providerLabelFrom(
  provider: PaymentGatewayProvider | null | undefined
): string {
  if (!provider) return "unknown";
  return provider;
}

function chargeLabelFrom(
  chargeAmountMinor: number | null | undefined,
  chargeCurrency: string | null | undefined
): string | null {
  return formatAdminPaymentChargeLabel(chargeAmountMinor, chargeCurrency);
}

/** Model-agnostic common filters — assignable to both attempt WhereInput types. */
type SharedAttemptFilterFields = {
  status?: { in: EsimPurchasePaymentAttemptStatus[] };
  gatewayProvider?: PaymentGatewayProvider | null;
  webhookEventId?: null | { not: null };
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
};

function commonAttemptFilterFields(
  input: AttemptFilterInput
): SharedAttemptFilterFields {
  const fields: SharedAttemptFilterFields = {};

  const statuses = paymentAttemptStatusesForFilter(input.status);
  if (statuses) {
    fields.status = {
      in: statuses as EsimPurchasePaymentAttemptStatus[],
    };
  }

  if (input.provider === "SIMPAISA") {
    fields.gatewayProvider = PaymentGatewayProvider.SIMPAISA;
  } else if (input.provider === "SAFEPAY") {
    fields.gatewayProvider = PaymentGatewayProvider.SAFEPAY;
  } else if (input.provider === "UNKNOWN") {
    fields.gatewayProvider = null;
  }

  if (input.webhook === "MISSING") {
    fields.webhookEventId = null;
  } else if (input.webhook === "PRESENT") {
    fields.webhookEventId = { not: null };
  }

  if (input.createdFrom || input.createdTo) {
    fields.createdAt = {
      ...(input.createdFrom ? { gte: input.createdFrom } : {}),
      ...(input.createdTo ? { lte: input.createdTo } : {}),
    };
  }

  return fields;
}

function buildCustomerWhere(
  input: AttemptFilterInput
): Prisma.EsimPurchasePaymentAttemptWhereInput {
  const where: Prisma.EsimPurchasePaymentAttemptWhereInput = {
    ...commonAttemptFilterFields(input),
  };

  const q = input.q;
  if (q) {
    const or: Prisma.EsimPurchasePaymentAttemptWhereInput[] = [
      { id: { equals: q } },
      { purchaseId: { equals: q } },
      { gatewayPaymentRef: { equals: q } },
      {
        purchase: {
          orderId: { equals: q },
        },
      },
      {
        purchase: {
          customer: {
            email: { equals: q, mode: "insensitive" },
          },
        },
      },
    ];
    if (q.length >= 3 && q.includes("@")) {
      or.push({
        purchase: {
          customer: {
            email: { contains: q, mode: "insensitive" },
          },
        },
      });
    } else if (q.length >= 6) {
      or.push({ id: { contains: q } });
      or.push({ purchaseId: { contains: q } });
    }
    where.OR = or;
  }

  return where;
}

function buildPartnerWhere(
  input: AttemptFilterInput
): Prisma.PartnerEsimPurchasePaymentAttemptWhereInput {
  const where: Prisma.PartnerEsimPurchasePaymentAttemptWhereInput = {
    ...commonAttemptFilterFields(input),
  };
  const q = input.q;
  if (q) {
    const or: Prisma.PartnerEsimPurchasePaymentAttemptWhereInput[] = [
      { id: { equals: q } },
      { purchaseId: { equals: q } },
      { gatewayPaymentRef: { equals: q } },
      {
        purchase: {
          orderId: { equals: q },
        },
      },
      {
        purchase: {
          partner: {
            user: {
              email: { equals: q, mode: "insensitive" },
            },
          },
        },
      },
    ];
    if (q.length >= 3 && q.includes("@")) {
      or.push({
        purchase: {
          partner: {
            user: {
              email: { contains: q, mode: "insensitive" },
            },
          },
        },
      });
    } else if (q.length >= 6) {
      or.push({ id: { contains: q } });
      or.push({ purchaseId: { contains: q } });
    }
    where.OR = or;
  }

  return where;
}

const PENDING_STATUSES: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
  EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
];

export async function getAdminPaymentDashboardKpis(): Promise<AdminPaymentDashboardKpis> {
  const [
    customerTotal,
    partnerTotal,
    customerPending,
    partnerPending,
    customerFailed,
    partnerFailed,
    customerCompleted,
    partnerCompleted,
    customerWebhookMissing,
    partnerWebhookMissing,
    recoveryCandidateCount,
  ] = await Promise.all([
    prisma.esimPurchasePaymentAttempt.count(),
    prisma.partnerEsimPurchasePaymentAttempt.count(),
    prisma.esimPurchasePaymentAttempt.count({
      where: { status: { in: PENDING_STATUSES } },
    }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: { status: { in: PENDING_STATUSES } },
    }),
    prisma.esimPurchasePaymentAttempt.count({
      where: { status: EsimPurchasePaymentAttemptStatus.FAILED },
    }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: { status: EsimPurchasePaymentAttemptStatus.FAILED },
    }),
    prisma.esimPurchasePaymentAttempt.count({
      where: { status: EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED },
    }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: { status: EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED },
    }),
    prisma.esimPurchasePaymentAttempt.count({
      where: {
        status: { in: PENDING_STATUSES },
        webhookEventId: null,
      },
    }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: {
        status: { in: PENDING_STATUSES },
        webhookEventId: null,
      },
    }),
    countPaymentRecoveryCandidates(),
  ]);

  return {
    totalCount: customerTotal + partnerTotal,
    pendingCount: customerPending + partnerPending,
    failedCount: customerFailed + partnerFailed,
    completedCount: customerCompleted + partnerCompleted,
    webhookMissingAmongPendingCount:
      customerWebhookMissing + partnerWebhookMissing,
    recoveryCandidateCount,
  };
}

type MergedListRow = {
  ownerKind: "customer" | "partner";
  attemptId: string;
  purchaseId: string;
  orderId: string | null;
  status: string;
  purchaseStatus: string;
  gatewayProvider: PaymentGatewayProvider | null;
  gatewayAmountCents: number;
  currency: string;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  gatewayPaymentRef: string | null;
  webhookEventId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ownerUser: { id: string; name: string | null; email: string | null } | null;
  ownerProfileId: string | null;
};

export async function listAdminPayments(input: {
  q?: string | null;
  status?: string | null;
  provider?: string | null;
  webhook?: string | null;
  owner?: string | null;
  from?: string | null;
  to?: string | null;
  page?: string | null;
}): Promise<{
  rows: AdminPaymentListRow[];
  kpis: AdminPaymentDashboardKpis;
  search: string;
  status: PaymentDashboardStatusFilter;
  provider: PaymentDashboardProviderFilter;
  webhook: PaymentDashboardWebhookFilter;
  owner: PaymentDashboardOwnerFilter;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const search = parsePaymentDashboardSearch(input.q);
  const status = parsePaymentDashboardStatusFilter(input.status);
  const provider = parsePaymentDashboardProviderFilter(input.provider);
  const webhook = parsePaymentDashboardWebhookFilter(input.webhook);
  const owner = parsePaymentDashboardOwnerFilter(input.owner);
  const range = normalizePaymentDashboardDateRange(input.from, input.to);
  const page = parsePaymentDashboardPage(input.page);
  const pageSize = ADMIN_PAYMENTS_PAGE_SIZE;
  const take = Math.min(pageSize, ADMIN_PAYMENTS_PAGE_SIZE_MAX);
  const skip = (page - 1) * take;

  const filterInput: AttemptFilterInput = {
    status,
    provider,
    webhook,
    q: search,
    createdFrom: range.from,
    createdTo: range.to,
  };

  const includeCustomer = owner === "ALL" || owner === "CUSTOMER";
  const includePartner = owner === "ALL" || owner === "PARTNER";
  const customerWhere = buildCustomerWhere(filterInput);
  const partnerWhere = buildPartnerWhere(filterInput);
  const overFetch = skip + take;
  const nowMs = Date.now();
  const staleMs = parsePaymentRecoveryStaleMs();

  const [
    customerCount,
    partnerCount,
    customerRows,
    partnerRows,
    kpis,
  ] = await Promise.all([
    includeCustomer
      ? prisma.esimPurchasePaymentAttempt.count({ where: customerWhere })
      : Promise.resolve(0),
    includePartner
      ? prisma.partnerEsimPurchasePaymentAttempt.count({ where: partnerWhere })
      : Promise.resolve(0),
    includeCustomer
      ? prisma.esimPurchasePaymentAttempt.findMany({
          where: customerWhere,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: overFetch,
          select: {
            id: true,
            purchaseId: true,
            status: true,
            gatewayProvider: true,
            gatewayAmountCents: true,
            currency: true,
            chargeAmountMinor: true,
            chargeCurrency: true,
            gatewayPaymentRef: true,
            webhookEventId: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            purchase: {
              select: {
                status: true,
                orderId: true,
                customer: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    includePartner
      ? prisma.partnerEsimPurchasePaymentAttempt.findMany({
          where: partnerWhere,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: overFetch,
          select: {
            id: true,
            purchaseId: true,
            status: true,
            gatewayProvider: true,
            gatewayAmountCents: true,
            currency: true,
            chargeAmountMinor: true,
            chargeCurrency: true,
            gatewayPaymentRef: true,
            webhookEventId: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            purchase: {
              select: {
                status: true,
                orderId: true,
                partner: {
                  select: {
                    id: true,
                    user: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    getAdminPaymentDashboardKpis(),
  ]);

  const merged: MergedListRow[] = [
    ...customerRows.map((row) => {
      const purchase = row.purchase ?? null;
      return {
        ownerKind: "customer" as const,
        attemptId: row.id,
        purchaseId: row.purchaseId,
        orderId: (purchase?.orderId ?? "").trim() || null,
        status: row.status,
        purchaseStatus: purchase?.status ?? "UNKNOWN",
        gatewayProvider: row.gatewayProvider,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        chargeAmountMinor: row.chargeAmountMinor,
        chargeCurrency: row.chargeCurrency,
        gatewayPaymentRef: row.gatewayPaymentRef,
        webhookEventId: row.webhookEventId,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ownerUser: purchase?.customer ?? null,
        ownerProfileId: purchase?.customer?.id ?? null,
      };
    }),
    ...partnerRows.map((row) => {
      const purchase = row.purchase ?? null;
      const partner = purchase?.partner ?? null;
      return {
        ownerKind: "partner" as const,
        attemptId: row.id,
        purchaseId: row.purchaseId,
        orderId: (purchase?.orderId ?? "").trim() || null,
        status: row.status,
        purchaseStatus: purchase?.status ?? "UNKNOWN",
        gatewayProvider: row.gatewayProvider,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        chargeAmountMinor: row.chargeAmountMinor,
        chargeCurrency: row.chargeCurrency,
        gatewayPaymentRef: row.gatewayPaymentRef,
        webhookEventId: row.webhookEventId,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ownerUser: partner?.user ?? null,
        ownerProfileId: partner?.id ?? null,
      };
    }),
  ].sort((a, b) => {
    const byUpdated = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (byUpdated !== 0) return byUpdated;
    return b.attemptId.localeCompare(a.attemptId);
  });

  const totalCount = customerCount + partnerCount;
  const pageSlice = merged.slice(skip, skip + take);
  const totalPages = Math.max(1, Math.ceil(totalCount / take));

  return {
    rows: pageSlice.map((row) => {
      const profileId = (row.ownerProfileId ?? "").trim();
      const webhookEventIdPresent = Boolean(row.webhookEventId);
      const providerLabel = providerLabelFrom(row.gatewayProvider);
      const href = paymentDashboardAttemptHref(row.attemptId, row.ownerKind);
      const staleReleaseEligible = isPaymentRecoveryStaleReleaseEligible({
        status: row.status,
        purchaseStatus: row.purchaseStatus,
        webhookEventId: row.webhookEventId,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
        nowMs,
        staleMs,
      });
      const showRecon =
        row.ownerKind === "customer" &&
        isAdminWalletReconciliationLinkApplicable({
          purchaseStatus: row.purchaseStatus,
          attemptStatus: row.status,
        });
      return {
        attemptId: row.attemptId,
        purchaseId: row.purchaseId,
        orderId: row.orderId,
        ownerKind: row.ownerKind,
        ownerLabel: paymentDashboardOwnerLabel(row.ownerKind),
        customerLabel:
          row.ownerKind === "partner"
            ? partnerLabelFrom(row.ownerUser)
            : customerLabelFrom(row.ownerUser),
        customerHref:
          profileId && profileId.length <= 64
            ? row.ownerKind === "partner"
              ? `/admin/partners/${encodeURIComponent(profileId)}`
              : `/admin/customers/${encodeURIComponent(profileId)}`
            : null,
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        chargeLabel: chargeLabelFrom(
          row.chargeAmountMinor,
          row.chargeCurrency
        ),
        providerLabel,
        methodLabel: providerLabel,
        attemptStatus: row.status,
        purchaseStatus: row.purchaseStatus,
        providerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
        webhookLabel: paymentDashboardWebhookLabel(webhookEventIdPresent),
        webhookEventIdPresent,
        inquiryLabel: paymentDashboardInquiryPlaceholder(),
        createdAtLabel: formatUtcTimestamp(row.createdAt),
        updatedAtLabel: formatUtcTimestamp(row.updatedAt),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        href,
        staleReleaseEligible,
        staleReleaseHref: staleReleaseEligible
          ? `${href}#stale-release`
          : null,
        reconciliationHref: showRecon
          ? buildAdminWalletPurchaseReconciliationHref(row.purchaseId)
          : null,
      };
    }),
    kpis,
    search,
    status,
    provider,
    webhook,
    owner,
    from: range.fromParam,
    to: range.toParam,
    page,
    pageSize: take,
    totalCount,
    totalPages,
  };
}

export async function getAdminPaymentDetail(
  paymentAttemptId: string,
  ownerKindHint?: "customer" | "partner" | null
): Promise<AdminPaymentDetail | null> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return null;
  }

  async function loadCustomer(): Promise<AdminPaymentDetail | null> {
    try {
      const row = await prisma.esimPurchasePaymentAttempt.findUnique({
        where: { id },
        select: {
          id: true,
          purchaseId: true,
          status: true,
          gatewayProvider: true,
          gatewayAmountCents: true,
          currency: true,
          chargeAmountMinor: true,
          chargeCurrency: true,
          gatewayPaymentRef: true,
          webhookEventId: true,
          failureCategory: true,
          failureCode: true,
          createdAt: true,
          updatedAt: true,
          failedAt: true,
          cancelledAt: true,
          purchase: {
            select: {
              status: true,
              orderId: true,
              walletAppliedCents: true,
              customerUserId: true,
              customer: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (!row) return null;

      const purchase = row.purchase ?? null;
      if (!purchase) return null;

      const customerId = (
        purchase.customer?.id ??
        purchase.customerUserId ??
        ""
      ).trim();
      const webhookEventIdPresent = Boolean(row.webhookEventId);
      const isSimpaisa = row.gatewayProvider === PaymentGatewayProvider.SIMPAISA;
      const providerLabel = providerLabelFrom(row.gatewayProvider);

      return {
        attemptId: row.id,
        purchaseId: row.purchaseId,
        orderId: (purchase.orderId ?? "").trim() || null,
        ownerKind: "customer",
        customerUserId: customerId || null,
        customerLabel: customerLabelFrom(purchase.customer),
        customerHref:
          customerId && customerId.length <= 64
            ? `/admin/customers/${encodeURIComponent(customerId)}`
            : null,
        gatewayProvider: row.gatewayProvider,
        providerLabel,
        methodLabel: providerLabel,
        attemptStatus: row.status,
        purchaseStatus: purchase.status,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        chargeAmountMinor: row.chargeAmountMinor,
        chargeCurrency: row.chargeCurrency,
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        chargeLabel: chargeLabelFrom(row.chargeAmountMinor, row.chargeCurrency),
        providerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
        webhookEventIdPresent,
        webhookLabel: paymentDashboardWebhookLabel(webhookEventIdPresent),
        inquiryLabel: paymentDashboardInquiryPlaceholder(),
        walletAppliedCents: purchase.walletAppliedCents ?? 0,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        createdAtLabel: formatUtcTimestamp(row.createdAt),
        updatedAtLabel: formatUtcTimestamp(row.updatedAt),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        failedAt: row.failedAt,
        cancelledAt: row.cancelledAt,
        failedAtLabel: row.failedAt ? formatUtcTimestamp(row.failedAt) : null,
        cancelledAtLabel: row.cancelledAt
          ? formatUtcTimestamp(row.cancelledAt)
          : null,
        investigationAvailable: isPaymentDashboardPendingAttemptStatus(row.status),
        isSimpaisa,
      };
    } catch (error) {
      console.error("[admin.payments.detail] customer attempt load failed", {
        attemptId: id,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }
  }

  async function loadPartner(): Promise<AdminPaymentDetail | null> {
    try {
      const row = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
        where: { id },
        select: {
          id: true,
          purchaseId: true,
          status: true,
          gatewayProvider: true,
          gatewayAmountCents: true,
          currency: true,
          chargeAmountMinor: true,
          chargeCurrency: true,
          gatewayPaymentRef: true,
          webhookEventId: true,
          failureCategory: true,
          failureCode: true,
          createdAt: true,
          updatedAt: true,
          failedAt: true,
          cancelledAt: true,
          purchase: {
            select: {
              status: true,
              orderId: true,
              walletAppliedCents: true,
              partner: {
                select: {
                  id: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      });

      if (!row) return null;

      // Purchase / partner / user may be missing on orphaned or partially deleted rows.
      const purchase = row.purchase ?? null;
      if (!purchase) return null;
      const partner = purchase.partner ?? null;
      const partnerId = (partner?.id ?? "").trim();
      const partnerUser = partner?.user ?? null;
      const webhookEventIdPresent = Boolean(row.webhookEventId);
      const isSimpaisa = row.gatewayProvider === PaymentGatewayProvider.SIMPAISA;
      const providerLabel = providerLabelFrom(row.gatewayProvider);

      return {
        attemptId: row.id,
        purchaseId: row.purchaseId,
        orderId: (purchase.orderId ?? "").trim() || null,
        ownerKind: "partner",
        customerUserId: (partnerUser?.id ?? "").trim() || null,
        customerLabel: partnerLabelFrom(partnerUser),
        customerHref:
          partnerId && partnerId.length <= 64
            ? `/admin/partners/${encodeURIComponent(partnerId)}`
            : null,
        gatewayProvider: row.gatewayProvider,
        providerLabel,
        methodLabel: providerLabel,
        attemptStatus: row.status,
        purchaseStatus: purchase.status,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        chargeAmountMinor: row.chargeAmountMinor,
        chargeCurrency: row.chargeCurrency,
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        chargeLabel: chargeLabelFrom(row.chargeAmountMinor, row.chargeCurrency),
        providerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
        webhookEventIdPresent,
        webhookLabel: paymentDashboardWebhookLabel(webhookEventIdPresent),
        inquiryLabel: paymentDashboardInquiryPlaceholder(),
        walletAppliedCents: purchase.walletAppliedCents ?? 0,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        createdAtLabel: formatUtcTimestamp(row.createdAt),
        updatedAtLabel: formatUtcTimestamp(row.updatedAt),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        failedAt: row.failedAt,
        cancelledAt: row.cancelledAt,
        failedAtLabel: row.failedAt ? formatUtcTimestamp(row.failedAt) : null,
        cancelledAtLabel: row.cancelledAt
          ? formatUtcTimestamp(row.cancelledAt)
          : null,
        // Partner pending investigate UI is customer-attempt scoped today.
        investigationAvailable: false,
        isSimpaisa,
      };
    } catch (error) {
      console.error("[admin.payments.detail] partner attempt load failed", {
        attemptId: id,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }
  }

  if (ownerKindHint === "partner") {
    return (await loadPartner()) ?? (await loadCustomer());
  }
  if (ownerKindHint === "customer") {
    return (await loadCustomer()) ?? (await loadPartner());
  }
  return (await loadCustomer()) ?? (await loadPartner());
}
