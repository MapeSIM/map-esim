import "server-only";

import { RefundRequestStatus, Role } from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  refundStatusEmailSubject,
  renderRefundStatusEmailHtml,
  renderRefundStatusEmailText,
  type RefundStatusEmailKind,
} from "@/app/lib/email/refundStatusTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";
import {
  REFUND_AUDIT,
  type RefundStatusEmailEvent,
} from "@/app/lib/refunds/refundRequestConstants";
import {
  formatUsdCents,
  formatWalletDateTime,
} from "@/app/lib/wallet/display";

export const REFUND_EMAIL_SENDING = "sending";
export const REFUND_EMAIL_SENT = "sent";
export const REFUND_EMAIL_FAILED = "failed";
export const REFUND_EMAIL_NOT_CONFIGURED = "not_configured";
export const REFUND_EMAIL_SKIPPED = "skipped";

export type RefundStatusNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

/** Process-local once-only claim (same pattern family as order deliveryStore). */
const inFlightClaims = new Set<string>();

function claimKey(requestId: string, event: RefundStatusEmailEvent): string {
  return `${requestId}:${event}`;
}

function auditActionFor(event: RefundStatusEmailEvent): string {
  switch (event) {
    case "received":
      return REFUND_AUDIT.EMAIL_RECEIVED;
    case "under_review":
      return REFUND_AUDIT.EMAIL_UNDER_REVIEW;
    case "approved_pending_execution":
      return REFUND_AUDIT.EMAIL_APPROVED_PENDING;
    case "rejected":
      return REFUND_AUDIT.EMAIL_REJECTED;
  }
}

function expectedStatus(event: RefundStatusEmailEvent): RefundRequestStatus {
  switch (event) {
    case "received":
      return RefundRequestStatus.REQUESTED;
    case "under_review":
      return RefundRequestStatus.UNDER_REVIEW;
    case "approved_pending_execution":
      return RefundRequestStatus.APPROVED_PENDING_EXECUTION;
    case "rejected":
      return RefundRequestStatus.REJECTED;
  }
}

function shortOrderReference(orderId: string): string {
  const id = orderId.trim();
  if (!id) return "—";
  if (id.length <= 8) return "••••";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

async function recordEmailAudit(options: {
  requestId: string;
  actorUserId: string | null;
  event: RefundStatusEmailEvent;
  deliveryStatus: string;
  orderId?: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actorUserId,
        action: auditActionFor(options.event),
        targetType: "RefundRequest",
        targetId: options.requestId,
        metadata: {
          notificationType: "refund_status",
          emailEvent: options.event,
          deliveryStatus: options.deliveryStatus,
          orderId: options.orderId ?? null,
          moneyMoved: false,
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
  event: RefundStatusEmailEvent
): Promise<boolean> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: "RefundRequest",
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
  // Block only active/completed delivery. FAILED / missing allow a later retry.
  return status === REFUND_EMAIL_SENT || status === REFUND_EMAIL_SENDING;
}

/**
 * Send one customer-facing refund-status email for a committed status event.
 * Never throws to callers. Email failure never undoes refund status.
 *
 * Idempotency (no new schema):
 * 1) Callers schedule only after successful create / under_review / approve / reject CAS.
 * 2) Process-local claim key.
 * 3) AuditLog prior-delivery check for the same request+event.
 */
export async function notifyRefundStatusEmail(
  requestId: string,
  event: RefundStatusEmailEvent
): Promise<RefundStatusNotifyResult> {
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

    const row = await prisma.refundRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        orderId: true,
        customerUserId: true,
        refundAmountCents: true,
        currency: true,
        createdAt: true,
        reviewedAt: true,
        decidedAt: true,
        customer: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            deletedAt: true,
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
    const user = row.customer;
    if (!user || user.deletedAt || user.role !== Role.CUSTOMER) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: row.customerUserId,
        event,
        deliveryStatus: REFUND_EMAIL_SKIPPED,
        orderId: row.orderId,
        extra: { reason: "customer_unavailable" },
      });
      return { status: "skipped", reason: "customer_unavailable" };
    }
    const to = (user.email ?? "").trim();
    if (!to || !to.includes("@")) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: REFUND_EMAIL_SKIPPED,
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
        deliveryStatus: REFUND_EMAIL_NOT_CONFIGURED,
        orderId: row.orderId,
      });
      console.error("refund_status_email", "not_configured", id, event);
      return { status: "not_configured" };
    }

    // Claim before SMTP so retries see prior audit and skip.
    await recordEmailAudit({
      requestId: id,
      actorUserId: user.id,
      event,
      deliveryStatus: REFUND_EMAIL_SENDING,
      orderId: row.orderId,
    });

    const kind = event as RefundStatusEmailKind;
    const amountLabel = formatUsdCents(Math.max(0, row.refundAmountCents));
    const currencyLabel = (row.currency || "USD").trim().toUpperCase() || "USD";
    const orderUrl = `${BRAND_SITE_URL}/account/orders/${encodeURIComponent(row.orderId)}`;
    const when =
      event === "received"
        ? row.createdAt
        : event === "under_review"
          ? row.reviewedAt ?? row.createdAt
          : row.decidedAt ?? row.createdAt;

    const payload = {
      kind,
      customerName: (user.name || "").trim() || "Customer",
      orderReference: shortOrderReference(row.orderId),
      amountLabel,
      currencyLabel,
      orderUrl,
      requestedAtLabel: formatWalletDateTime(when),
    };

    const subject = refundStatusEmailSubject(kind);
    const text = renderRefundStatusEmailText(payload);
    const html = renderRefundStatusEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to,
      subject: `[MAP eSIM Billing] ${sanitizeEmailHeaderValue(subject, 160)}`,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "refund_status",
        "X-MAP-ESIM-Refund-Event": sanitizeEmailHeaderValue(event, 40),
        "X-MAP-ESIM-Refund-Request-ID": sanitizeEmailHeaderValue(id, 64),
      },
    });

    if (sendResult.ok) {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: REFUND_EMAIL_SENT,
        orderId: row.orderId,
      });
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await recordEmailAudit({
        requestId: id,
        actorUserId: user.id,
        event,
        deliveryStatus: REFUND_EMAIL_NOT_CONFIGURED,
        orderId: row.orderId,
      });
      console.error("refund_status_email", "not_configured", id, event);
      return { status: "not_configured" };
    }

    await recordEmailAudit({
      requestId: id,
      actorUserId: user.id,
      event,
      deliveryStatus: REFUND_EMAIL_FAILED,
      orderId: row.orderId,
      extra: { reason: sendResult.reason },
    });
    console.error("refund_status_email", "send_failed", id, event);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("refund_status_email", "dispatch_error", id, event);
    try {
      await recordEmailAudit({
        requestId: id,
        actorUserId: null,
        event,
        deliveryStatus: REFUND_EMAIL_FAILED,
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

/** Fire-and-forget — never affects refund create/decision callers. */
export function scheduleRefundStatusNotification(
  requestId: string,
  event: RefundStatusEmailEvent
): void {
  void notifyRefundStatusEmail(requestId, event).catch(() => {
    console.error("refund_status_email", "schedule_error");
  });
}
