/**
 * Admin-triggered VeSIM refund-review email (informational only).
 * Does not change RefundRequest status or move money.
 * Full ICCID is used in the email body only — never logged or returned to clients.
 */
import "server-only";

import { Role } from "@prisma/client";
import { isEmailConfigured } from "@/app/lib/email/config";
import {
  sendChannelMail,
  type SendChannelMailResult,
} from "@/app/lib/email/transport";
import {
  renderVesimRefundReviewEmailHtml,
  renderVesimRefundReviewEmailText,
  vesimRefundReviewEmailSubject,
} from "@/app/lib/email/vesimRefundReviewTemplate";
import { prisma } from "@/app/lib/db";
import { getAdminOrderUsage } from "@/app/lib/orders/adminEsimUsage";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import {
  REFUND_AUDIT,
  VESIM_REVIEW_ALREADY_SENT_MESSAGE,
  VESIM_REVIEW_EMAIL_FAILED,
  VESIM_REVIEW_EMAIL_SENDING,
  VESIM_REVIEW_EMAIL_SENT,
  VESIM_REVIEW_ICCID_UNAVAILABLE_MESSAGE,
  VESIM_REVIEW_PROVIDER_REF_UNAVAILABLE_MESSAGE,
  VESIM_REVIEW_SENT_SUCCESS_MESSAGE,
  refundReasonLabel,
} from "@/app/lib/refunds/refundRequestConstants";
import { loadVesimRefundReviewRecipientsFromEnv } from "@/app/lib/refunds/vesimRefundReviewRecipients";
import {
  formatUsdCents,
  formatWalletDateTime,
} from "@/app/lib/wallet/display";
import type { CustomerUsageSnapshot } from "@/app/lib/orders/customerEsimUsage";

export type VesimReviewSendResult =
  | { ok: true; status: "sent"; message: string }
  | { ok: true; status: "already_sent"; message: string }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "FORBIDDEN"
        | "NO_ICCID"
        | "NO_PROVIDER_ORDER"
        | "INVALID_CONFIG"
        | "NOT_CONFIGURED"
        | "SEND_FAILED"
        | "IN_FLIGHT"
        | "UNAVAILABLE";
      message: string;
    };

const inFlightClaims = new Set<string>();

type MailSender = (options: {
  channel: "billing";
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}) => Promise<SendChannelMailResult>;

async function defaultMailSender(
  options: Parameters<MailSender>[0]
): Promise<SendChannelMailResult> {
  return sendChannelMail(options);
}

function formatPurchaseDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function formatUsageSummary(usage: CustomerUsageSnapshot): string {
  const parts: string[] = [];
  if (usage.statusLabel || usage.status) {
    parts.push(`status ${usage.statusLabel || usage.status}`);
  }
  if (usage.isUnlimited || usage.planUnlimited) {
    parts.push("unlimited data plan");
  } else if (
    usage.remainingDataGB != null &&
    Number.isFinite(usage.remainingDataGB)
  ) {
    parts.push(`${usage.remainingDataGB.toFixed(2)} GB remaining`);
  }
  if (usage.usedDataGB != null && Number.isFinite(usage.usedDataGB)) {
    parts.push(`${usage.usedDataGB.toFixed(2)} GB used`);
  }
  if (usage.daysRemaining != null && Number.isFinite(usage.daysRemaining)) {
    parts.push(`${usage.daysRemaining} day(s) remaining`);
  }
  if (usage.isExpired === true) parts.push("expired");
  if (usage.isActivated === false) parts.push("not activated");
  return parts.length ? parts.join(" · ") : "Not available";
}

async function resolveLocalIccidPlain(
  encrypted: string | null | undefined
): Promise<string | null> {
  const ciphertext = (encrypted ?? "").trim();
  if (!ciphertext || !isIccidEncryptionConfigured()) return null;
  try {
    const plain = decryptIccid(ciphertext);
    const normalized = normalizeIccid(plain);
    return validateIccid(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

async function optionalUsageSummary(orderId: string): Promise<string> {
  try {
    const result = await getAdminOrderUsage(orderId);
    if (result.ok) return formatUsageSummary(result.usage);
  } catch {
    // Usage is optional — never block send on lookup failure.
  }
  return "Not available";
}

async function recordVesimReviewAudit(options: {
  action: string;
  requestId: string;
  actorUserId: string;
  orderId: string;
  providerOrderId: string | null;
  deliveryStatus: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actorUserId,
        action: options.action,
        targetType: "RefundRequest",
        targetId: options.requestId,
        metadata: {
          notificationType: "vesim_refund_review",
          deliveryStatus: options.deliveryStatus,
          refundRequestId: options.requestId,
          orderId: options.orderId,
          providerOrderId: options.providerOrderId,
          moneyMoved: false,
          refundStatusChanged: false,
          gatewayRefundCalled: false,
          providerRefundCalled: false,
          ...(options.extra ?? {}),
        },
      },
    });
  } catch {
    // Never fail the send path solely on audit write.
  }
}

/**
 * True when a successful VeSIM review send audit already exists for this request.
 */
export async function hasSuccessfulVesimReviewEmail(
  requestId: string
): Promise<boolean> {
  const id = (requestId ?? "").trim();
  if (!id || id.length > 64) return false;

  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: "RefundRequest",
      targetId: id,
      action: REFUND_AUDIT.VESIM_REVIEW_EMAIL_SENT,
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
  // Prefer explicit sent; treat missing status on SENT action as success.
  return !status || status === VESIM_REVIEW_EMAIL_SENT;
}

/**
 * Send VeSIM provider refund-review email for a customer RefundRequest.
 * Informational only — does not mutate refund status or wallets.
 */
export async function sendVesimRefundReviewEmail(options: {
  adminUserId: string;
  requestId: string;
  /** Test hook — defaults to billing sendChannelMail. */
  mailSender?: MailSender;
}): Promise<VesimReviewSendResult> {
  const requestId = (options.requestId ?? "").trim();
  const adminUserId = (options.adminUserId ?? "").trim();
  if (
    !requestId ||
    requestId.length > 64 ||
    !adminUserId ||
    adminUserId.length > 64
  ) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Refund request was not found.",
    };
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
    },
  });
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You are not allowed to send VeSIM refund review emails.",
    };
  }

  if (inFlightClaims.has(requestId)) {
    return {
      ok: false,
      code: "IN_FLIGHT",
      message: "A VeSIM review email is already being sent for this request.",
    };
  }
  inFlightClaims.add(requestId);

  try {
    if (await hasSuccessfulVesimReviewEmail(requestId)) {
      return {
        ok: true,
        status: "already_sent",
        message: VESIM_REVIEW_ALREADY_SENT_MESSAGE,
      };
    }

    const recipients = loadVesimRefundReviewRecipientsFromEnv();
    if (!recipients.ok) {
      return {
        ok: false,
        code: "INVALID_CONFIG",
        message:
          "VeSIM review email is not configured correctly. Check recipient environment variables.",
      };
    }

    if (!isEmailConfigured("billing")) {
      return {
        ok: false,
        code: "NOT_CONFIGURED",
        message: "Billing email channel is not configured.",
      };
    }

    const row = await prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        reason: true,
        refundAmountCents: true,
        adminDecisionNote: true,
        orderId: true,
        order: {
          select: {
            id: true,
            providerOrderId: true,
            destination: true,
            planName: true,
            status: true,
            createdAt: true,
            iccidEncrypted: true,
          },
        },
      },
    });

    if (!row) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Refund request was not found.",
      };
    }

    const providerOrderId = (row.order.providerOrderId ?? "").trim();
    if (!providerOrderId) {
      return {
        ok: false,
        code: "NO_PROVIDER_ORDER",
        message: VESIM_REVIEW_PROVIDER_REF_UNAVAILABLE_MESSAGE,
      };
    }

    const iccid = await resolveLocalIccidPlain(row.order.iccidEncrypted);
    if (!iccid) {
      return {
        ok: false,
        code: "NO_ICCID",
        message: VESIM_REVIEW_ICCID_UNAVAILABLE_MESSAGE,
      };
    }

    const usageSummary = await optionalUsageSummary(row.order.id);
    const amountLabel = `${formatUsdCents(row.refundAmountCents)} USD`;
    const payload = {
      mapOrderId: row.order.id,
      providerOrderId,
      iccid,
      destination: (row.order.destination ?? "").trim() || "Not available",
      planName: (row.order.planName ?? "").trim() || "Not available",
      purchaseDateLabel: formatPurchaseDate(row.order.createdAt),
      refundReasonLabel: refundReasonLabel(row.reason),
      requestedAmountLabel: amountLabel,
      orderStatusLabel: String(row.order.status || "Not available"),
      usageSummary,
      adminNote: row.adminDecisionNote,
    };

    const subject = vesimRefundReviewEmailSubject(row.order.id);
    const text = renderVesimRefundReviewEmailText(payload);
    const html = renderVesimRefundReviewEmailHtml(payload);

    await recordVesimReviewAudit({
      action: REFUND_AUDIT.VESIM_REVIEW_EMAIL_SENDING,
      requestId: row.id,
      actorUserId: admin.id,
      orderId: row.order.id,
      providerOrderId,
      deliveryStatus: VESIM_REVIEW_EMAIL_SENDING,
    });

    // Re-check after claim write to reduce double-send races.
    if (await hasSuccessfulVesimReviewEmail(row.id)) {
      return {
        ok: true,
        status: "already_sent",
        message: VESIM_REVIEW_ALREADY_SENT_MESSAGE,
      };
    }

    const mailSender = options.mailSender ?? defaultMailSender;
    const sendResult = await mailSender({
      channel: "billing",
      to: recipients.to,
      cc: recipients.cc,
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "vesim_refund_review",
      },
    });

    if (!sendResult.ok) {
      await recordVesimReviewAudit({
        action: REFUND_AUDIT.VESIM_REVIEW_EMAIL_FAILED,
        requestId: row.id,
        actorUserId: admin.id,
        orderId: row.order.id,
        providerOrderId,
        deliveryStatus: VESIM_REVIEW_EMAIL_FAILED,
        extra: { reason: sendResult.reason },
      });
      return {
        ok: false,
        code:
          sendResult.reason === "not_configured"
            ? "NOT_CONFIGURED"
            : "SEND_FAILED",
        message:
          sendResult.reason === "invalid_recipient"
            ? "VeSIM review email recipients are invalid."
            : "VeSIM review email could not be sent. Try again shortly.",
      };
    }

    await recordVesimReviewAudit({
      action: REFUND_AUDIT.VESIM_REVIEW_EMAIL_SENT,
      requestId: row.id,
      actorUserId: admin.id,
      orderId: row.order.id,
      providerOrderId,
      deliveryStatus: VESIM_REVIEW_EMAIL_SENT,
      extra: {
        sentAtLabel: formatWalletDateTime(new Date()),
        refundStatusSnapshot: row.status,
      },
    });

    return {
      ok: true,
      status: "sent",
      message: VESIM_REVIEW_SENT_SUCCESS_MESSAGE,
    };
  } catch {
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "VeSIM review email is temporarily unavailable.",
    };
  } finally {
    inFlightClaims.delete(requestId);
  }
}

/** Test helper — clears process-local in-flight claims. */
export function clearVesimReviewInFlightClaimsForTests(): void {
  inFlightClaims.clear();
}
