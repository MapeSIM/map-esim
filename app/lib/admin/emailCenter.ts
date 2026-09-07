/**
 * Admin Email Center list — aggregates outgoing email attempts from AuditLog
 * plus live failed/not_configured model rows that may lack a failure audit.
 * Read-only for listing. Never mutates payment or refund money paths.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  EMAIL_CENTER_AUDIT_ACTIONS,
  EMAIL_CENTER_PAGE_LIMIT,
  deliveryStatusLabel,
  emailCenterKindFromAction,
  emailCenterKindLabel,
  isFailedEmailDeliveryStatus,
  isRefundStatusEmailEvent,
  normalizeDeliveryStatus,
  sanitizeFailureReason,
  type EmailCenterKind,
  type EmailCenterRetryKind,
  type EmailCenterTab,
} from "@/app/lib/admin/emailCenterShared";

export type EmailCenterRow = {
  id: string;
  kind: EmailCenterKind;
  kindLabel: string;
  actionLabel: string;
  deliveryStatus: string;
  deliveryStatusLabel: string;
  failureReason: string | null;
  targetType: string;
  targetId: string;
  createdAtMs: number;
  createdAtLabel: string;
  canRetry: boolean;
  retryKind: EmailCenterRetryKind | null;
  /** Refund / partner refund event, when present. */
  emailEvent: string | null;
};

function shortId(id: string): string {
  const t = id.trim();
  if (!t) return "—";
  if (t.length <= 10) return t;
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function metaRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function metaString(
  meta: Record<string, unknown>,
  key: string
): string | null {
  const v = meta[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function resolveRetry(options: {
  kind: EmailCenterKind;
  deliveryStatus: string;
  targetType: string;
  targetId: string;
  emailEvent: string | null;
}): { canRetry: boolean; retryKind: EmailCenterRetryKind | null } {
  if (!options.targetId || !isFailedEmailDeliveryStatus(options.deliveryStatus)) {
    return { canRetry: false, retryKind: null };
  }

  switch (options.kind) {
    case "refund_status":
      if (
        options.targetType === "RefundRequest" &&
        isRefundStatusEmailEvent(options.emailEvent)
      ) {
        return { canRetry: true, retryKind: "refund_status" };
      }
      return { canRetry: false, retryKind: null };
    case "partner_refund_status":
      if (
        options.targetType === "PartnerRefundRequest" &&
        isRefundStatusEmailEvent(options.emailEvent)
      ) {
        return { canRetry: true, retryKind: "partner_refund_status" };
      }
      return { canRetry: false, retryKind: null };
    case "wallet_transaction":
      if (options.targetType === "WalletTransaction") {
        return { canRetry: true, retryKind: "wallet_transaction" };
      }
      return { canRetry: false, retryKind: null };
    case "recon_required":
      if (options.targetType === "WalletEsimPurchase") {
        return { canRetry: true, retryKind: "recon_required" };
      }
      return { canRetry: false, retryKind: null };
    case "partner_recon_required":
      if (options.targetType === "PartnerEsimPurchase") {
        return { canRetry: true, retryKind: "partner_recon_required" };
      }
      return { canRetry: false, retryKind: null };
    case "payment_received_pending":
      if (options.targetType === "WalletEsimPurchase") {
        return { canRetry: true, retryKind: "payment_received_pending" };
      }
      return { canRetry: false, retryKind: null };
    case "payment_failure":
      if (options.targetType === "EsimPurchasePaymentAttempt") {
        return { canRetry: true, retryKind: "payment_failure" };
      }
      return { canRetry: false, retryKind: null };
    case "order_install":
      if (options.targetType === "WalletEsimPurchase") {
        return { canRetry: true, retryKind: "order_install_purchase" };
      }
      if (options.targetType === "AdminPackageAssignment") {
        return { canRetry: true, retryKind: "order_install_assignment" };
      }
      return { canRetry: false, retryKind: null };
    default:
      return { canRetry: false, retryKind: null };
  }
}

function rowFromAudit(log: {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
}): EmailCenterRow | null {
  const targetId = (log.targetId ?? "").trim();
  if (!targetId) return null;

  const meta = metaRecord(log.metadata);
  const kind = emailCenterKindFromAction(log.action);
  const deliveryStatus = normalizeDeliveryStatus(
    metaString(meta, "deliveryStatus"),
    log.action
  );
  const failureReason = sanitizeFailureReason(
    metaString(meta, "reason") ??
      metaString(meta, "failureCode") ??
      metaString(meta, "errorCode")
  );
  const emailEvent = metaString(meta, "emailEvent");
  const retry = resolveRetry({
    kind,
    deliveryStatus,
    targetType: log.targetType,
    targetId,
    emailEvent,
  });

  const eventSuffix = emailEvent ? ` · ${emailEvent.replace(/_/g, " ")}` : "";

  return {
    id: `audit:${log.id}`,
    kind,
    kindLabel: emailCenterKindLabel(kind),
    actionLabel: `${emailCenterKindLabel(kind)}${eventSuffix}`,
    deliveryStatus,
    deliveryStatusLabel: deliveryStatusLabel(deliveryStatus),
    failureReason,
    targetType: log.targetType,
    targetId,
    createdAtMs: log.createdAt.getTime(),
    createdAtLabel: formatUtcTimestamp(log.createdAt),
    canRetry: retry.canRetry,
    retryKind: retry.retryKind,
    emailEvent,
  };
}

function rowFromModel(options: {
  idPrefix: string;
  kind: EmailCenterKind;
  targetType: string;
  targetId: string;
  deliveryStatus: string;
  failureReason?: string | null;
  createdAt: Date;
  emailEvent?: string | null;
}): EmailCenterRow {
  const deliveryStatus = normalizeDeliveryStatus(options.deliveryStatus);
  const retry = resolveRetry({
    kind: options.kind,
    deliveryStatus,
    targetType: options.targetType,
    targetId: options.targetId,
    emailEvent: options.emailEvent ?? null,
  });
  return {
    id: `${options.idPrefix}:${options.targetId}`,
    kind: options.kind,
    kindLabel: emailCenterKindLabel(options.kind),
    actionLabel: `${emailCenterKindLabel(options.kind)} · ${shortId(options.targetId)}`,
    deliveryStatus,
    deliveryStatusLabel: deliveryStatusLabel(deliveryStatus),
    failureReason: sanitizeFailureReason(options.failureReason),
    targetType: options.targetType,
    targetId: options.targetId,
    createdAtMs: options.createdAt.getTime(),
    createdAtLabel: formatUtcTimestamp(options.createdAt),
    canRetry: retry.canRetry,
    retryKind: retry.retryKind,
    emailEvent: options.emailEvent ?? null,
  };
}

async function listModelFailedRows(limit: number): Promise<EmailCenterRow[]> {
  const take = Math.max(5, Math.floor(limit / 5));
  const failedStatuses = ["failed", "not_configured", "invalid_email"];

  const [
    walletTx,
    paymentFailures,
    purchaseInstall,
    assignmentInstall,
    reconRequired,
    partnerReconRequired,
    paymentReceived,
  ] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { emailNotificationStatus: { in: ["failed", "not_configured"] } },
      orderBy: { emailNotifiedAt: "desc" },
      take,
      select: {
        id: true,
        emailNotificationStatus: true,
        emailNotifiedAt: true,
        createdAt: true,
      },
    }),
    prisma.esimPurchasePaymentAttempt.findMany({
      where: {
        failureEmailNotificationStatus: { in: ["failed", "not_configured"] },
      },
      orderBy: { failureEmailNotifiedAt: "desc" },
      take,
      select: {
        id: true,
        failureEmailNotificationStatus: true,
        failureEmailNotifiedAt: true,
        createdAt: true,
      },
    }),
    prisma.walletEsimPurchase.findMany({
      where: { emailDeliveryStatus: { in: failedStatuses } },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        emailDeliveryStatus: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.adminPackageAssignment.findMany({
      where: { emailDeliveryStatus: { in: failedStatuses } },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        emailDeliveryStatus: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.walletEsimPurchase.findMany({
      where: {
        reconRequiredEmailNotificationStatus: {
          in: ["failed", "not_configured"],
        },
      },
      orderBy: { reconRequiredEmailNotifiedAt: "desc" },
      take,
      select: {
        id: true,
        reconRequiredEmailNotificationStatus: true,
        reconRequiredEmailNotifiedAt: true,
        createdAt: true,
      },
    }),
    prisma.partnerEsimPurchase.findMany({
      where: {
        reconRequiredEmailNotificationStatus: {
          in: ["failed", "not_configured"],
        },
      },
      orderBy: { reconRequiredEmailNotifiedAt: "desc" },
      take,
      select: {
        id: true,
        reconRequiredEmailNotificationStatus: true,
        reconRequiredEmailNotifiedAt: true,
        createdAt: true,
      },
    }),
    prisma.walletEsimPurchase.findMany({
      where: {
        paymentReceivedEmailNotificationStatus: {
          in: ["failed", "not_configured"],
        },
      },
      orderBy: { paymentReceivedEmailNotifiedAt: "desc" },
      take,
      select: {
        id: true,
        paymentReceivedEmailNotificationStatus: true,
        paymentReceivedEmailNotifiedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const rows: EmailCenterRow[] = [];

  for (const row of walletTx) {
    rows.push(
      rowFromModel({
        idPrefix: "wallet_tx",
        kind: "wallet_transaction",
        targetType: "WalletTransaction",
        targetId: row.id,
        deliveryStatus: row.emailNotificationStatus ?? "failed",
        createdAt: row.emailNotifiedAt ?? row.createdAt,
      })
    );
  }

  for (const row of paymentFailures) {
    rows.push(
      rowFromModel({
        idPrefix: "payment_failure",
        kind: "payment_failure",
        targetType: "EsimPurchasePaymentAttempt",
        targetId: row.id,
        deliveryStatus: row.failureEmailNotificationStatus ?? "failed",
        createdAt: row.failureEmailNotifiedAt ?? row.createdAt,
      })
    );
  }

  for (const row of purchaseInstall) {
    rows.push(
      rowFromModel({
        idPrefix: "order_install_purchase",
        kind: "order_install",
        targetType: "WalletEsimPurchase",
        targetId: row.id,
        deliveryStatus: row.emailDeliveryStatus ?? "failed",
        failureReason: row.emailDeliveryStatus,
        createdAt: row.updatedAt ?? row.createdAt,
      })
    );
  }

  for (const row of assignmentInstall) {
    rows.push(
      rowFromModel({
        idPrefix: "order_install_assignment",
        kind: "order_install",
        targetType: "AdminPackageAssignment",
        targetId: row.id,
        deliveryStatus: row.emailDeliveryStatus ?? "failed",
        failureReason: row.emailDeliveryStatus,
        createdAt: row.updatedAt ?? row.createdAt,
      })
    );
  }

  for (const row of reconRequired) {
    rows.push(
      rowFromModel({
        idPrefix: "recon_required",
        kind: "recon_required",
        targetType: "WalletEsimPurchase",
        targetId: row.id,
        deliveryStatus: row.reconRequiredEmailNotificationStatus ?? "failed",
        createdAt: row.reconRequiredEmailNotifiedAt ?? row.createdAt,
      })
    );
  }

  for (const row of partnerReconRequired) {
    rows.push(
      rowFromModel({
        idPrefix: "partner_recon_required",
        kind: "partner_recon_required",
        targetType: "PartnerEsimPurchase",
        targetId: row.id,
        deliveryStatus: row.reconRequiredEmailNotificationStatus ?? "failed",
        createdAt: row.reconRequiredEmailNotifiedAt ?? row.createdAt,
      })
    );
  }

  for (const row of paymentReceived) {
    rows.push(
      rowFromModel({
        idPrefix: "payment_received",
        kind: "payment_received_pending",
        targetType: "WalletEsimPurchase",
        targetId: row.id,
        deliveryStatus: row.paymentReceivedEmailNotificationStatus ?? "failed",
        createdAt: row.paymentReceivedEmailNotifiedAt ?? row.createdAt,
      })
    );
  }

  return rows;
}

function dedupeKey(row: EmailCenterRow): string {
  return `${row.kind}|${row.targetType}|${row.targetId}|${row.emailEvent ?? ""}`;
}

/**
 * Newest-first email attempt rows for Admin Email Center.
 */
export async function listAdminEmailCenter(options: {
  tab: EmailCenterTab;
  limit?: number;
}): Promise<EmailCenterRow[]> {
  const limit = Math.min(
    Math.max(1, options.limit ?? EMAIL_CENTER_PAGE_LIMIT),
    150
  );

  const audits = await prisma.auditLog.findMany({
    where: {
      action: { in: [...EMAIL_CENTER_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const fromAudit = audits
    .map(rowFromAudit)
    .filter((row): row is EmailCenterRow => row != null);

  // Model gaps: failures that never wrote an audit (e.g. payment-failure SMTP fail).
  const fromModel = await listModelFailedRows(limit);

  const seen = new Set<string>();
  const merged: EmailCenterRow[] = [];

  // Prefer audit rows (richer history); then fill gaps from model state.
  for (const row of [...fromAudit, ...fromModel]) {
    if (options.tab === "failed" && !isFailedEmailDeliveryStatus(row.deliveryStatus)) {
      continue;
    }
    const key = dedupeKey(row);
    // For "all", keep multiple audit attempts; only dedupe model vs audit.
    if (row.id.startsWith("audit:")) {
      merged.push(row);
      seen.add(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  merged.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return merged.slice(0, limit);
}
