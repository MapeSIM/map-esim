/**
 * Admin Email Center retry — reuses existing notification/send helpers only.
 * Never mutates refund request status, payment attempt funding, wallets, or
 * provider checkout.
 */
import "server-only";

import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  adminRetryFailedAssignmentInstallEmail,
  adminRetryFailedPurchaseInstallEmail,
} from "@/app/lib/admin/reconciliationEmailResend";
import {
  isRefundStatusEmailEvent,
  type EmailCenterRetryKind,
} from "@/app/lib/admin/emailCenterShared";
import { resendFailedPaymentFailureEmail } from "@/app/lib/esim/paymentFailureNotification";
import { notifyPaymentReceivedPendingEmail } from "@/app/lib/esim/paymentReceivedPendingNotification";
import { notifyReconciliationRequiredEmail } from "@/app/lib/esim/reconciliationRequiredNotification";
import { notifyPartnerReconciliationRequiredEmail } from "@/app/lib/partner/partnerReconciliationRequiredNotification";
import { notifyPartnerRefundStatusEmail } from "@/app/lib/partner/partnerRefundRequestNotification";
import { notifyRefundStatusEmail } from "@/app/lib/refunds/refundRequestNotification";
import { resendFailedWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export type EmailCenterRetryResult =
  | { ok: true; message: string; deliveryStatus: string }
  | { ok: false; error: string };

const PUBLIC_ERROR = "Unable to retry this email right now.";

const RETRY_KINDS = new Set<EmailCenterRetryKind>([
  "refund_status",
  "partner_refund_status",
  "wallet_transaction",
  "recon_required",
  "partner_recon_required",
  "payment_received_pending",
  "payment_failure",
  "order_install_purchase",
  "order_install_assignment",
]);

function parseRetryKind(raw: string): EmailCenterRetryKind | null {
  const v = raw.trim() as EmailCenterRetryKind;
  return RETRY_KINDS.has(v) ? v : null;
}

function mapNotifyStatus(
  status: string,
  reason?: string
): EmailCenterRetryResult {
  if (status === "sent") {
    return {
      ok: true,
      message: "Email sent successfully.",
      deliveryStatus: "sent",
    };
  }
  if (status === "not_configured") {
    return {
      ok: false,
      error: "Email is not configured for this channel right now.",
    };
  }
  if (status === "skipped") {
    return {
      ok: false,
      error: reason
        ? `Retry skipped (${reason.slice(0, 80)}).`
        : "Retry skipped for this email.",
    };
  }
  return {
    ok: false,
    error: reason
      ? `Send failed (${reason.slice(0, 80)}).`
      : "Send failed. Check SMTP and try again.",
  };
}

export async function retryAdminEmailCenterSend(options: {
  adminUserId: string;
  retryKind: string;
  targetId: string;
  emailEvent?: string | null;
}): Promise<EmailCenterRetryResult> {
  const retryKind = parseRetryKind(options.retryKind);
  const targetId = (options.targetId ?? "").trim();
  if (!retryKind || !targetId || targetId.length > 64) {
    return { ok: false, error: "Invalid retry request." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(targetId)) {
    return { ok: false, error: "Invalid retry target." };
  }

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "Request origin is not allowed." };
  }

  const adminRate = consumeRateLimit({
    key: `admin_email_center_retry:${options.adminUserId}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!adminRate.ok) {
    return { ok: false, error: "Too many retry attempts. Try again shortly." };
  }

  const targetRate = consumeRateLimit({
    key: `admin_email_center_retry_target:${retryKind}:${targetId}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!targetRate.ok) {
    return {
      ok: false,
      error: "This email was retried too recently. Try again shortly.",
    };
  }

  let result: EmailCenterRetryResult;

  try {
    switch (retryKind) {
      case "refund_status": {
        if (!isRefundStatusEmailEvent(options.emailEvent)) {
          result = { ok: false, error: "Missing refund email event." };
          break;
        }
        const notify = await notifyRefundStatusEmail(
          targetId,
          options.emailEvent
        );
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "partner_refund_status": {
        if (!isRefundStatusEmailEvent(options.emailEvent)) {
          result = { ok: false, error: "Missing partner refund email event." };
          break;
        }
        const notify = await notifyPartnerRefundStatusEmail(
          targetId,
          options.emailEvent
        );
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "wallet_transaction": {
        const notify = await resendFailedWalletTransactionNotification(targetId);
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "recon_required": {
        const notify = await notifyReconciliationRequiredEmail(targetId);
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "partner_recon_required": {
        const notify = await notifyPartnerReconciliationRequiredEmail(targetId);
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "payment_received_pending": {
        const notify = await notifyPaymentReceivedPendingEmail(targetId);
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "payment_failure": {
        const notify = await resendFailedPaymentFailureEmail(targetId);
        result = mapNotifyStatus(
          notify.status,
          "reason" in notify ? notify.reason : undefined
        );
        break;
      }
      case "order_install_purchase": {
        const send = await adminRetryFailedPurchaseInstallEmail(targetId);
        result = send.ok
          ? {
              ok: true,
              message: "Install email resent successfully.",
              deliveryStatus: send.deliveryStatus,
            }
          : {
              ok: false,
              error:
                send.failureCode === "not_configured"
                  ? "Orders email is not configured right now."
                  : PUBLIC_ERROR,
            };
        break;
      }
      case "order_install_assignment": {
        const send = await adminRetryFailedAssignmentInstallEmail(targetId);
        result = send.ok
          ? {
              ok: true,
              message: "Install email resent successfully.",
              deliveryStatus: send.deliveryStatus,
            }
          : {
              ok: false,
              error:
                send.failureCode === "not_configured"
                  ? "Orders email is not configured right now."
                  : PUBLIC_ERROR,
            };
        break;
      }
      default:
        result = { ok: false, error: "Unsupported email type for retry." };
    }
  } catch {
    result = { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: options.adminUserId,
    action: result.ok
      ? "admin.email_center_retry_sent"
      : "admin.email_center_retry_failed",
    targetType: "EmailCenter",
    targetId,
    metadata: {
      method: "email_center_retry",
      source: retryKind,
      ...(result.ok
        ? { reason: result.deliveryStatus }
        : { failureCode: "retry_failed", reason: result.error.slice(0, 80) }),
    },
  });

  return result;
}
