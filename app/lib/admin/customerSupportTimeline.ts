/**
 * Read-only admin customer support timeline.
 * Aggregates existing records — never writes a timeline table, never funds,
 * never replays webhooks, never calls VeSIM, never enables the gateway.
 */
import "server-only";

import { Role } from "@prisma/client";
import { formatSafeAuditDetails } from "@/app/lib/admin/display";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS,
  ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT,
  clipSupportTimelineDetail,
  humanizeSupportTimelineStatus,
  joinSupportTimelineDetail,
  selectNewestSupportTimelineEvents,
  supportTimelineAuditTitle,
  supportTimelineEmailStatusLabel,
  supportTimelinePaymentAttemptTitle,
  supportTimelinePurchaseTitle,
  supportTimelineSourceLabel,
  type AdminCustomerSupportTimelineSource,
} from "@/app/lib/admin/customerSupportTimelineShared";
import { formatFailedPaymentReason } from "@/app/lib/admin/failedPaymentAttemptsShared";
import {
  formatWebhookReceiptOutcome,
  webhookReceiptParseLabel,
  webhookReceiptSignatureLabel,
} from "@/app/lib/admin/paymentWebhookReceiptsShared";
import { prisma } from "@/app/lib/db";
import {
  refundReasonLabel,
  refundStatusLabel,
} from "@/app/lib/refunds/refundRequestConstants";
import {
  formatUsdCents,
  formatWalletTransactionAmount,
  walletDirectionLabel,
  walletStatusLabel,
  walletTransactionTypeLabel,
} from "@/app/lib/wallet/display";

export type AdminCustomerSupportTimelineEvent = {
  id: string;
  occurredAtLabel: string;
  source: AdminCustomerSupportTimelineSource;
  sourceLabel: string;
  title: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
};

export type AdminCustomerSupportTimelineResult = {
  customerId: string;
  customerName: string;
  events: AdminCustomerSupportTimelineEvent[];
};

type DraftEvent = AdminCustomerSupportTimelineEvent & {
  occurredAtMs: number;
};

function displayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed : "Customer";
}

function planDestinationLabel(input: {
  planName?: string | null;
  destinationName?: string | null;
  destinationCode?: string | null;
  destination?: string | null;
}): string | null {
  const plan = (input.planName ?? "").trim();
  const dest = (
    input.destinationName ??
    input.destination ??
    input.destinationCode ??
    ""
  ).trim();
  if (plan && dest) return `${dest} — ${plan}`;
  if (plan) return plan;
  if (dest) return dest;
  return null;
}

function msFrom(value: Date | null | undefined): number | null {
  if (!value || !(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return null;
  }
  return value.getTime();
}

function pushEvent(
  events: DraftEvent[],
  input: {
    id: string;
    occurredAt: Date | null | undefined;
    source: AdminCustomerSupportTimelineSource;
    title: string;
    detail: string;
    href?: string | null;
    hrefLabel?: string | null;
  }
): void {
  const occurredAtMs = msFrom(input.occurredAt);
  if (occurredAtMs === null) return;
  events.push({
    id: input.id,
    occurredAtMs,
    occurredAtLabel: formatUtcTimestamp(input.occurredAt),
    source: input.source,
    sourceLabel: supportTimelineSourceLabel(input.source),
    title: input.title,
    detail: clipSupportTimelineDetail(input.detail),
    href: input.href ?? null,
    hrefLabel: input.hrefLabel ?? null,
  });
}

function purchaseHref(row: {
  id: string;
  orderId: string | null;
  status: string;
}): { href: string; hrefLabel: string } | { href: null; hrefLabel: null } {
  if (row.orderId) {
    return {
      href: `/admin/orders/${encodeURIComponent(row.orderId)}`,
      hrefLabel: "View order",
    };
  }
  if (row.status === "RECONCILIATION_REQUIRED") {
    return {
      href: `/admin/reconciliation/wallet_purchase/${encodeURIComponent(row.id)}`,
      hrefLabel: "View reconciliation",
    };
  }
  return { href: null, hrefLabel: null };
}

/**
 * CUSTOMER-only support timeline. Missing / non-customer / invalid id → null.
 */
export async function getAdminCustomerSupportTimeline(
  customerUserId: string
): Promise<AdminCustomerSupportTimelineResult | null> {
  const customerId = (customerUserId ?? "").trim();
  if (!customerId || customerId.length > 64) return null;

  const customer = await prisma.user.findFirst({
    where: { id: customerId, role: Role.CUSTOMER },
    select: { id: true, name: true },
  });
  if (!customer) return null;

  const take = ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT;

  const [purchases, attempts, orders, refunds, wallet, topups] =
    await Promise.all([
      prisma.walletEsimPurchase.findMany({
        where: { customerUserId: customer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          status: true,
          planName: true,
          destinationName: true,
          destinationCode: true,
          priceCents: true,
          orderId: true,
          createdAt: true,
          completedAt: true,
          reconRequiredEmailNotifiedAt: true,
          reconRequiredEmailNotificationStatus: true,
        },
      }),
      prisma.esimPurchasePaymentAttempt.findMany({
        where: { purchase: { customerUserId: customer.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          status: true,
          gatewayAmountCents: true,
          failureCategory: true,
          failureCode: true,
          createdAt: true,
          paymentConfirmedAt: true,
          cancelledAt: true,
          failedAt: true,
          refundedAt: true,
          failureEmailNotifiedAt: true,
          failureEmailNotificationStatus: true,
        },
      }),
      prisma.order.findMany({
        where: { userId: customer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          status: true,
          destination: true,
          planName: true,
          createdAt: true,
        },
      }),
      prisma.refundRequest.findMany({
        where: { customerUserId: customer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          status: true,
          reason: true,
          refundAmountCents: true,
          createdAt: true,
          decidedAt: true,
        },
      }),
      prisma.walletAccount.findFirst({
        where: { userId: customer.id },
        select: {
          transactions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            select: {
              id: true,
              type: true,
              direction: true,
              status: true,
              amountCents: true,
              createdAt: true,
              emailNotificationStatus: true,
              emailNotifiedAt: true,
            },
          },
        },
      }),
      prisma.walletTopup.findMany({
        where: { customerUserId: customer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: { id: true },
      }),
    ]);

  const attemptIds = attempts.map((row) => row.id);
  const topupIds = topups.map((row) => row.id);
  const receiptOr: Array<
    | { paymentAttemptId: { in: string[] } }
    | { topupId: { in: string[] } }
  > = [];
  if (attemptIds.length) {
    receiptOr.push({ paymentAttemptId: { in: attemptIds } });
  }
  if (topupIds.length) {
    receiptOr.push({ topupId: { in: topupIds } });
  }

  const targetIds = [
    ...purchases.map((row) => row.id),
    ...attemptIds,
    ...orders.map((row) => row.id),
    ...refunds.map((row) => row.id),
    ...topupIds,
    ...(wallet?.transactions.map((row) => row.id) ?? []),
  ];

  const [receipts, audits] = await Promise.all([
    receiptOr.length
      ? prisma.paymentWebhookReceipt.findMany({
          where: { OR: receiptOr },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          take,
          select: {
            id: true,
            receivedAt: true,
            logCode: true,
            signatureOk: true,
            parseOk: true,
            applyOutcome: true,
            errorCategory: true,
            trackerMasked: true,
            eventType: true,
            provider: true,
          },
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: {
        action: { in: [...ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS] },
        OR: [
          { actorUserId: customer.id },
          ...(targetIds.length ? [{ targetId: { in: targetIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        action: true,
        targetType: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  const drafts: DraftEvent[] = [];

  for (const row of purchases) {
    const link = purchaseHref(row);
    pushEvent(drafts, {
      id: `purchase:${row.id}`,
      occurredAt: row.completedAt ?? row.createdAt,
      source: "purchase",
      title: supportTimelinePurchaseTitle(row.status),
      detail: joinSupportTimelineDetail([
        humanizeSupportTimelineStatus(row.status),
        formatUsdCents(row.priceCents),
        planDestinationLabel(row),
      ]),
      href: link.href,
      hrefLabel: link.hrefLabel,
    });
    if (row.reconRequiredEmailNotifiedAt) {
      pushEvent(drafts, {
        id: `email:purchase-recon:${row.id}`,
        occurredAt: row.reconRequiredEmailNotifiedAt,
        source: "email",
        title: "Reconciliation email",
        detail: joinSupportTimelineDetail([
          supportTimelineEmailStatusLabel(
            row.reconRequiredEmailNotificationStatus
          ) ?? "notified",
          planDestinationLabel(row),
        ]),
        href: link.href,
        hrefLabel: link.hrefLabel,
      });
    }
  }

  for (const row of attempts) {
    const occurredAt =
      row.paymentConfirmedAt ??
      row.failedAt ??
      row.cancelledAt ??
      row.refundedAt ??
      row.createdAt;
    pushEvent(drafts, {
      id: `payment_attempt:${row.id}`,
      occurredAt,
      source: "payment_attempt",
      title: supportTimelinePaymentAttemptTitle(row.status),
      detail: joinSupportTimelineDetail([
        humanizeSupportTimelineStatus(row.status),
        formatUsdCents(row.gatewayAmountCents),
        (row.failureCategory ?? "").trim() || (row.failureCode ?? "").trim()
          ? formatFailedPaymentReason(row.failureCategory, row.failureCode)
          : null,
      ]),
    });
    if (row.failureEmailNotifiedAt) {
      pushEvent(drafts, {
        id: `email:payment-failure:${row.id}`,
        occurredAt: row.failureEmailNotifiedAt,
        source: "email",
        title: "Payment failure email",
        detail: joinSupportTimelineDetail([
          supportTimelineEmailStatusLabel(row.failureEmailNotificationStatus) ??
            "notified",
          formatUsdCents(row.gatewayAmountCents),
        ]),
      });
    }
  }

  for (const row of receipts) {
    pushEvent(drafts, {
      id: `webhook_receipt:${row.id}`,
      occurredAt: row.receivedAt,
      source: "webhook_receipt",
      title: "Payment webhook received",
      detail: joinSupportTimelineDetail([
        row.provider,
        row.logCode,
        webhookReceiptSignatureLabel(row.signatureOk),
        webhookReceiptParseLabel(row.parseOk),
        formatWebhookReceiptOutcome(
          row.logCode,
          row.applyOutcome,
          row.errorCategory
        ),
        (row.eventType ?? "").trim() || null,
        (row.trackerMasked ?? "").trim()
          ? `tracker ${(row.trackerMasked ?? "").trim()}`
          : null,
      ]),
      href: "/admin/payments/webhooks",
      hrefLabel: "Webhook receipts",
    });
  }

  for (const row of orders) {
    pushEvent(drafts, {
      id: `order:${row.id}`,
      occurredAt: row.createdAt,
      source: "order",
      title: "eSIM order",
      detail: joinSupportTimelineDetail([
        humanizeSupportTimelineStatus(row.status),
        planDestinationLabel({
          planName: row.planName,
          destination: row.destination,
        }),
      ]),
      href: `/admin/orders/${encodeURIComponent(row.id)}`,
      hrefLabel: "View order",
    });
  }

  for (const row of wallet?.transactions ?? []) {
    pushEvent(drafts, {
      id: `wallet_transaction:${row.id}`,
      occurredAt: row.createdAt,
      source: "wallet_transaction",
      title: "Wallet ledger entry",
      detail: joinSupportTimelineDetail([
        walletTransactionTypeLabel(row.type),
        walletDirectionLabel(row.direction),
        formatWalletTransactionAmount(row.amountCents, row.direction),
        walletStatusLabel(row.status),
      ]),
    });
    if (row.emailNotifiedAt) {
      pushEvent(drafts, {
        id: `email:wallet:${row.id}`,
        occurredAt: row.emailNotifiedAt,
        source: "email",
        title: "Wallet notification email",
        detail: joinSupportTimelineDetail([
          supportTimelineEmailStatusLabel(row.emailNotificationStatus) ??
            "notified",
          walletTransactionTypeLabel(row.type),
          formatWalletTransactionAmount(row.amountCents, row.direction),
        ]),
      });
    }
  }

  for (const row of refunds) {
    const refundHref = `/admin/refund-requests/${encodeURIComponent(row.id)}`;
    pushEvent(drafts, {
      id: `refund_request:${row.id}`,
      occurredAt: row.createdAt,
      source: "refund_request",
      title: "Refund request",
      detail: joinSupportTimelineDetail([
        refundStatusLabel(row.status),
        refundReasonLabel(row.reason),
        formatUsdCents(row.refundAmountCents),
      ]),
      href: refundHref,
      hrefLabel: "View refund request",
    });
    if (row.decidedAt) {
      pushEvent(drafts, {
        id: `refund_request-decided:${row.id}`,
        occurredAt: row.decidedAt,
        source: "refund_request",
        title: "Refund request decided",
        detail: joinSupportTimelineDetail([
          refundStatusLabel(row.status),
          refundReasonLabel(row.reason),
          formatUsdCents(row.refundAmountCents),
        ]),
        href: refundHref,
        hrefLabel: "View refund request",
      });
    }
  }

  for (const row of audits) {
    pushEvent(drafts, {
      id: `audit:${row.id}`,
      occurredAt: row.createdAt,
      source: "audit",
      title: supportTimelineAuditTitle(row.action),
      detail: joinSupportTimelineDetail([
        (row.targetType ?? "").trim() || null,
        formatSafeAuditDetails(row.metadata),
      ]),
    });
  }

  const newest = selectNewestSupportTimelineEvents(drafts);
  return {
    customerId: customer.id,
    customerName: displayName(customer.name),
    events: newest.map((event) => ({
      id: event.id,
      occurredAtLabel: event.occurredAtLabel,
      source: event.source,
      sourceLabel: event.sourceLabel,
      title: event.title,
      detail: event.detail,
      href: event.href,
      hrefLabel: event.hrefLabel,
    })),
  };
}
