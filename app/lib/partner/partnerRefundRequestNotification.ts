import "server-only";

import { RefundRequestStatus, Role } from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { prisma } from "@/app/lib/db";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  partnerRefundStatusEmailSubject,
  renderPartnerRefundStatusEmailHtml,
  renderPartnerRefundStatusEmailText,
  type PartnerRefundStatusEmailKind,
} from "@/app/lib/email/partnerRefundStatusTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import {
  PARTNER_REFUND_AUDIT,
  sanitizePartnerRefundNote,
  type PartnerRefundStatusEmailEvent,
} from "@/app/lib/partner/partnerRefundRequestConstants";
import { shortPartnerPurchaseReference } from "@/app/lib/partner/partnerOrdersDisplay";
import {
  formatUsdCents,
  formatWalletDateTime,
} from "@/app/lib/wallet/display";

export const PARTNER_REFUND_EMAIL_SENDING = "sending";
export const PARTNER_REFUND_EMAIL_SENT = "sent";
export const PARTNER_REFUND_EMAIL_FAILED = "failed";
export const PARTNER_REFUND_EMAIL_NOT_CONFIGURED = "not_configured";
export const PARTNER_REFUND_EMAIL_SKIPPED = "skipped";

export type PartnerRefundStatusNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

/** Process-local once-only claim (same pattern family as customer refund emails). */
const inFlightClaims = new Set<string>();

function claimKey(
  requestId: string,
  event: PartnerRefundStatusEmailEvent
): string {
  return `${requestId}:${event}`;
}

function auditActionFor(event: PartnerRefundStatusEmailEvent): string {
  switch (event) {
    case "received":
      return PARTNER_REFUND_AUDIT.EMAIL_RECEIVED;
    case "under_review":
      return PARTNER_REFUND_AUDIT.EMAIL_UNDER_REVIEW;
    case "approved_pending_execution":
      return PARTNER_REFUND_AUDIT.EMAIL_APPROVED_PENDING;
    case "rejected":
      return PARTNER_REFUND_AUDIT.EMAIL_REJECTED;
    case "completed":
      return PARTNER_REFUND_AUDIT.EMAIL_COMPLETED;
  }
}

function expectedStatus(event: PartnerRefundStatusEmailEvent): RefundRequestStatus {
  switch (event) {
    case "received":
      return RefundRequestStatus.REQUESTED;
    case "under_review":
      return RefundRequestStatus.UNDER_REVIEW;
    case "approved_pending_execution":
      return RefundRequestStatus.APPROVED_PENDING_EXECUTION;
    case "rejected":
      return RefundRequestStatus.REJECTED;
    case "completed":
      return RefundRequestStatus.COMPLETED;
  }
}

async function recordEmailAudit(options: {
  requestId: string;
  actorUserId: string | null;
  event: PartnerRefundStatusEmailEvent;
  deliveryStatus: string;
  purchaseId?: string | null;
  orderId?: string | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actorUserId,
        action: auditActionFor(options.event),
        targetType: "PartnerRefundRequest",
        targetId: options.requestId,
        metadata: {
          notificationType: "partner_refund_status",
          emailEvent: options.event,
          deliveryStatus: options.deliveryStatus,
          purchaseId: options.purchaseId ?? null,
          orderId: options.orderId ?? null,
          moneyMoved: options.event === "completed",
          gatewayRefundCalled: false,
          providerRefundCalled: false,
          ...(options.extra ?? {}),
        },
      },
    });
  } catch {
    // Never fail the notification path on audit write.
  }
}

async function alreadyEmailed(
  requestId: string,
  event: PartnerRefundStatusEmailEvent
): Promise<boolean> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: "PartnerRefundRequest",
      targetId: requestId,
      action: auditActionFor(event),
    },
    select: { id: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return false;
  const meta =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const status = String(meta.deliveryStatus ?? "");
  return (
    status === PARTNER_REFUND_EMAIL_SENT ||
    status === PARTNER_REFUND_EMAIL_SENDING
  );
}

/**
 * Send one Partner-facing refund-status email for a committed status event.
 * Never throws to callers. Email failure never undoes refund status or wallet credit.
 *
 * Idempotency (no new schema):
 * 1) Callers schedule only after successful create / review / approve / reject / complete CAS.
 * 2) Process-local claim key.
 * 3) AuditLog prior-delivery check for the same request+event.
 */
export async function notifyPartnerRefundStatusEmail(
  requestId: string,
  event: PartnerRefundStatusEmailEvent
): Promise<PartnerRefundStatusNotifyResult> {
  const id = (requestId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  const key = claimKey(id, event);
  if (inFlightClaims.has(key)) {
    return { status: "skipped", reason: "in_flight" };
  }
  inFlightClaims.add(key);

  try {
    if (await alreadyEmailed(id, event)) {
      return { status: "skipped", reason: "already_emailed" };
    }

    const row = await prisma.partnerRefundRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        orderId: true,
        partnerId: true,
        partnerEsimPurchaseId: true,
        partnerChargeCents: true,
        currency: true,
        adminDecisionNote: true,
        createdAt: true,
        reviewedAt: true,
        completedAt: true,
        partner: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      return { status: "skipped", reason: "missing_request" };
    }
    if (row.status !== expectedStatus(event)) {
      return { status: "skipped", reason: "status_mismatch" };
    }

    const user = row.partner?.user;
    if (!user || user.deletedAt || user.role !== Role.PARTNER) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: null,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_SKIPPED,
        purchaseId: row.partnerEsimPurchaseId,
        orderId: row.orderId,
        extra: { reason: "partner_unavailable" },
      });
      return { status: "skipped", reason: "partner_unavailable" };
    }
    const to = (user.email ?? "").trim();
    if (!to || !to.includes("@")) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_SKIPPED,
        purchaseId: row.partnerEsimPurchaseId,
        orderId: row.orderId,
        extra: { reason: "invalid_recipient" },
      });
      return { status: "skipped", reason: "invalid_recipient" };
    }

    if (!isEmailConfigured("billing")) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_NOT_CONFIGURED,
        purchaseId: row.partnerEsimPurchaseId,
        orderId: row.orderId,
      });
      console.error("partner_refund_status_email", "not_configured", id, event);
      return { status: "not_configured" };
    }

    await recordEmailAudit({
      requestId: id,
      actorUserId: user.id,
      event,
      deliveryStatus: PARTNER_REFUND_EMAIL_SENDING,
      purchaseId: row.partnerEsimPurchaseId,
      orderId: row.orderId,
    });

    const kind = event as PartnerRefundStatusEmailKind;
    const amountCents = Math.max(0, row.partnerChargeCents);
    const amountLabel = formatUsdCents(amountCents);
    const currencyLabel = (row.currency || "USD").trim().toUpperCase() || "USD";
    const ordersUrl = `${BRAND_SITE_URL}/partner/orders`;
    const when =
      event === "received"
        ? row.createdAt
        : event === "under_review"
          ? row.reviewedAt ?? row.createdAt
          : event === "completed"
            ? row.completedAt ?? row.reviewedAt ?? row.createdAt
            : row.reviewedAt ?? row.createdAt;

    const decisionNote =
      event === "rejected"
        ? sanitizePartnerRefundNote(row.adminDecisionNote).slice(0, 500)
        : "";

    const payload = {
      kind,
      partnerName: (user.name || "").trim() || "Partner",
      purchaseReference: shortPartnerPurchaseReference(row.partnerEsimPurchaseId),
      amountLabel,
      currencyLabel,
      ordersUrl,
      eventAtLabel: formatWalletDateTime(when),
      walletCreditedLabel: event === "completed" ? amountLabel : undefined,
      decisionNote: decisionNote || undefined,
    };

    const subject = partnerRefundStatusEmailSubject(kind);
    const text = renderPartnerRefundStatusEmailText(payload);
    const html = renderPartnerRefundStatusEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to,
      subject: `[MAP eSIM Billing] ${sanitizeEmailHeaderValue(subject, 160)}`,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "partner_refund_status",
        "X-MAP-ESIM-Partner-Refund-Event": sanitizeEmailHeaderValue(event, 40),
        "X-MAP-ESIM-Partner-Refund-Request-ID": sanitizeEmailHeaderValue(id, 64),
      },
    });

    if (sendResult.ok) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_SENT,
        purchaseId: row.partnerEsimPurchaseId,
        orderId: row.orderId,
      });
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_NOT_CONFIGURED,
        purchaseId: row.partnerEsimPurchaseId,
        orderId: row.orderId,
      });
      console.error("partner_refund_status_email", "not_configured", id, event);
      return { status: "not_configured" };
    }

    await recordEmailAudit({
      requestId: id,
      actorUserId: user.id,
      event,
      deliveryStatus: PARTNER_REFUND_EMAIL_FAILED,
      purchaseId: row.partnerEsimPurchaseId,
      orderId: row.orderId,
      extra: { reason: sendResult.reason },
    });
    console.error("partner_refund_status_email", "send_failed", id, event);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("partner_refund_status_email", "dispatch_error", id, event);
    try {
      await recordEmailAudit({
        requestId: id,
        actorUserId: null,
        event,
        deliveryStatus: PARTNER_REFUND_EMAIL_FAILED,
        extra: { reason: "dispatch_error" },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  } finally {
    inFlightClaims.delete(key);
  }
}

/** Fire-and-forget — never affects Partner refund create/decision/execute callers. */
export function schedulePartnerRefundStatusNotification(
  requestId: string,
  event: PartnerRefundStatusEmailEvent
): void {
  void notifyPartnerRefundStatusEmail(requestId, event).catch(() => {
    console.error("partner_refund_status_email", "schedule_error");
  });
}

export function schedulePartnerRefundCompletedNotifications(
  requestIds: string[]
): void {
  for (const requestId of requestIds) {
    schedulePartnerRefundStatusNotification(requestId, "completed");
  }
}
