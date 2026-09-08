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
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  ADMIN_PAYMENTS_PAGE_SIZE,
  ADMIN_PAYMENTS_PAGE_SIZE_MAX,
  isPaymentDashboardPendingAttemptStatus,
  parsePaymentDashboardPage,
  parsePaymentDashboardProviderFilter,
  parsePaymentDashboardSearch,
  parsePaymentDashboardStatusFilter,
  parsePaymentDashboardWebhookFilter,
  paymentAttemptStatusesForFilter,
  paymentDashboardInquiryPlaceholder,
  paymentDashboardMethodPlaceholder,
  paymentDashboardWebhookLabel,
  type PaymentDashboardProviderFilter,
  type PaymentDashboardStatusFilter,
  type PaymentDashboardWebhookFilter,
} from "@/app/lib/admin/paymentDashboardShared";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { maskSafepayTrackerRef } from "@/app/lib/payments/safepayReporterParse";

export type AdminPaymentDashboardKpis = {
  pendingCount: number;
  failedLast24hCount: number;
  webhookMissingAmongPendingCount: number;
};

export type AdminPaymentListRow = {
  attemptId: string;
  purchaseId: string;
  orderId: string | null;
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
  href: string;
};

export type AdminPaymentDetail = {
  attemptId: string;
  purchaseId: string;
  orderId: string | null;
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
  investigationAvailable: boolean;
  isSimpaisa: boolean;
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
  if (
    chargeAmountMinor == null ||
    !Number.isInteger(chargeAmountMinor) ||
    !(chargeCurrency ?? "").trim()
  ) {
    return null;
  }
  return `${chargeAmountMinor} ${chargeCurrency!.trim().toUpperCase()}`;
}

function buildWhere(input: {
  status: PaymentDashboardStatusFilter;
  provider: PaymentDashboardProviderFilter;
  webhook: PaymentDashboardWebhookFilter;
  q: string;
}): Prisma.EsimPurchasePaymentAttemptWhereInput {
  const where: Prisma.EsimPurchasePaymentAttemptWhereInput = {};

  const statuses = paymentAttemptStatusesForFilter(input.status);
  if (statuses) {
    where.status = {
      in: statuses as EsimPurchasePaymentAttemptStatus[],
    };
  }

  if (input.provider === "SIMPAISA") {
    where.gatewayProvider = PaymentGatewayProvider.SIMPAISA;
  } else if (input.provider === "SAFEPAY") {
    where.gatewayProvider = PaymentGatewayProvider.SAFEPAY;
  } else if (input.provider === "UNKNOWN") {
    where.gatewayProvider = null;
  }

  if (input.webhook === "MISSING") {
    where.webhookEventId = null;
  } else if (input.webhook === "PRESENT") {
    where.webhookEventId = { not: null };
  }

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
    // Soft contains for longer email-like / partial ids (still capped).
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

export async function getAdminPaymentDashboardKpis(): Promise<AdminPaymentDashboardKpis> {
  const pendingStatuses = [
    EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
    EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
    EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
  ];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pendingCount, failedLast24hCount, webhookMissingAmongPendingCount] =
    await Promise.all([
      prisma.esimPurchasePaymentAttempt.count({
        where: { status: { in: pendingStatuses } },
      }),
      prisma.esimPurchasePaymentAttempt.count({
        where: {
          status: {
            in: [
              EsimPurchasePaymentAttemptStatus.FAILED,
              EsimPurchasePaymentAttemptStatus.CANCELLED,
            ],
          },
          OR: [
            { failedAt: { gte: since } },
            { cancelledAt: { gte: since } },
            {
              AND: [
                { failedAt: null },
                { cancelledAt: null },
                { updatedAt: { gte: since } },
              ],
            },
          ],
        },
      }),
      prisma.esimPurchasePaymentAttempt.count({
        where: {
          status: { in: pendingStatuses },
          webhookEventId: null,
        },
      }),
    ]);

  return {
    pendingCount,
    failedLast24hCount,
    webhookMissingAmongPendingCount,
  };
}

export async function listAdminPayments(input: {
  q?: string | null;
  status?: string | null;
  provider?: string | null;
  webhook?: string | null;
  page?: string | null;
}): Promise<{
  rows: AdminPaymentListRow[];
  kpis: AdminPaymentDashboardKpis;
  search: string;
  status: PaymentDashboardStatusFilter;
  provider: PaymentDashboardProviderFilter;
  webhook: PaymentDashboardWebhookFilter;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const search = parsePaymentDashboardSearch(input.q);
  const status = parsePaymentDashboardStatusFilter(input.status);
  const provider = parsePaymentDashboardProviderFilter(input.provider);
  const webhook = parsePaymentDashboardWebhookFilter(input.webhook);
  const page = parsePaymentDashboardPage(input.page);
  const pageSize = ADMIN_PAYMENTS_PAGE_SIZE;
  const take = Math.min(pageSize, ADMIN_PAYMENTS_PAGE_SIZE_MAX);
  const skip = (page - 1) * take;

  const where = buildWhere({ status, provider, webhook, q: search });

  const [totalCount, rows, kpis] = await Promise.all([
    prisma.esimPurchasePaymentAttempt.count({ where }),
    prisma.esimPurchasePaymentAttempt.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take,
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
    }),
    getAdminPaymentDashboardKpis(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / take));

  return {
    rows: rows.map((row) => {
      const customerId = (row.purchase.customer?.id ?? "").trim();
      const webhookEventIdPresent = Boolean(row.webhookEventId);
      return {
        attemptId: row.id,
        purchaseId: row.purchaseId,
        orderId: (row.purchase.orderId ?? "").trim() || null,
        customerLabel: customerLabelFrom(row.purchase.customer),
        customerHref:
          customerId && customerId.length <= 64
            ? `/admin/customers/${encodeURIComponent(customerId)}`
            : null,
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        chargeLabel: chargeLabelFrom(
          row.chargeAmountMinor,
          row.chargeCurrency
        ),
        providerLabel: providerLabelFrom(row.gatewayProvider),
        methodLabel: paymentDashboardMethodPlaceholder(),
        attemptStatus: row.status,
        purchaseStatus: row.purchase.status,
        providerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
        webhookLabel: paymentDashboardWebhookLabel(webhookEventIdPresent),
        webhookEventIdPresent,
        inquiryLabel: paymentDashboardInquiryPlaceholder(),
        createdAtLabel: formatUtcTimestamp(row.createdAt),
        updatedAtLabel: formatUtcTimestamp(row.updatedAt),
        href: `/admin/payments/${encodeURIComponent(row.id)}`,
      };
    }),
    kpis,
    search,
    status,
    provider,
    webhook,
    page,
    pageSize: take,
    totalCount,
    totalPages,
  };
}

export async function getAdminPaymentDetail(
  paymentAttemptId: string
): Promise<AdminPaymentDetail | null> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return null;
  }

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

  const customerId = (row.purchase.customer?.id ?? row.purchase.customerUserId ?? "")
    .trim();
  const webhookEventIdPresent = Boolean(row.webhookEventId);
  const isSimpaisa = row.gatewayProvider === PaymentGatewayProvider.SIMPAISA;

  return {
    attemptId: row.id,
    purchaseId: row.purchaseId,
    orderId: (row.purchase.orderId ?? "").trim() || null,
    customerUserId: customerId || null,
    customerLabel: customerLabelFrom(row.purchase.customer),
    customerHref:
      customerId && customerId.length <= 64
        ? `/admin/customers/${encodeURIComponent(customerId)}`
        : null,
    gatewayProvider: row.gatewayProvider,
    providerLabel: providerLabelFrom(row.gatewayProvider),
    methodLabel: paymentDashboardMethodPlaceholder(),
    attemptStatus: row.status,
    purchaseStatus: row.purchase.status,
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
    walletAppliedCents: row.purchase.walletAppliedCents,
    failureCategory: row.failureCategory,
    failureCode: row.failureCode,
    createdAtLabel: formatUtcTimestamp(row.createdAt),
    updatedAtLabel: formatUtcTimestamp(row.updatedAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    investigationAvailable: isPaymentDashboardPendingAttemptStatus(row.status),
    isSimpaisa,
  };
}
