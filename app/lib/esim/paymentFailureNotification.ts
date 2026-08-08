import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  Role,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  renderPaymentFailureEmailHtml,
  renderPaymentFailureEmailText,
} from "@/app/lib/email/paymentFailureTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";
import { WALLET_PURCHASE_REFUND_REF } from "@/app/lib/esim/walletPurchase";
import {
  formatUsdCents,
  formatWalletDateTime,
  shortWalletTransactionReference,
} from "@/app/lib/wallet/display";

export const PAYMENT_FAILURE_EMAIL_SENDING = "sending";
export const PAYMENT_FAILURE_EMAIL_SENT = "sent";
export const PAYMENT_FAILURE_EMAIL_FAILED = "failed";
export const PAYMENT_FAILURE_EMAIL_NOT_CONFIGURED = "not_configured";
export const PAYMENT_FAILURE_EMAIL_SKIPPED = "skipped";

export const PAYMENT_FAILURE_EMAIL_SUBJECT =
  "Your MAP eSIM payment wasn’t completed";

const TERMINAL_FAILURE_STATUSES: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.FAILED,
  EsimPurchasePaymentAttemptStatus.CANCELLED,
  EsimPurchasePaymentAttemptStatus.EXPIRED,
];

export type PaymentFailureNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

async function inferWalletFundsReturned(purchaseId: string): Promise<boolean> {
  const refund = await prisma.walletTransaction.findFirst({
    where: {
      referenceType: WALLET_PURCHASE_REFUND_REF,
      referenceId: purchaseId,
      type: WalletTransactionType.REFUND_CREDIT,
      status: WalletTransactionStatus.COMPLETED,
    },
    select: { id: true },
  });
  return Boolean(refund);
}

/**
 * Send at most one customer payment-failure email for a terminal attempt.
 * Must be called AFTER durable terminal failure/cancel state is committed.
 * Never throws to callers — failures are recorded safely.
 *
 * Delivery semantics: durable once-only *scheduling/claim* via CAS on
 * failureEmailNotificationStatus (null → sending). External SMTP accept
 * before final "sent" write can theoretically double-deliver on crash
 * (same pattern as wallet transaction emails).
 */
export async function notifyPaymentFailureEmail(
  paymentAttemptId: string,
  options?: { walletFundsReturned?: boolean | null }
): Promise<PaymentFailureNotifyResult> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    let walletReturned = options?.walletFundsReturned;
    if (walletReturned == null) {
      const attemptForInfer = await prisma.esimPurchasePaymentAttempt.findUnique({
        where: { id },
        select: {
          purchaseId: true,
          purchase: { select: { walletAppliedCents: true } },
        },
      });
      if (
        attemptForInfer &&
        attemptForInfer.purchase.walletAppliedCents > 0
      ) {
        walletReturned = await inferWalletFundsReturned(
          attemptForInfer.purchaseId
        );
      } else {
        walletReturned = false;
      }
    }

    const claimed = await prisma.esimPurchasePaymentAttempt.updateMany({
      where: {
        id,
        failureEmailNotificationStatus: null,
        status: { in: TERMINAL_FAILURE_STATUSES },
      },
      data: {
        failureEmailNotificationStatus: PAYMENT_FAILURE_EMAIL_SENDING,
        failureEmailWalletReturned: Boolean(walletReturned),
      },
    });

    if (claimed.count !== 1) {
      return { status: "skipped", reason: "already_handled_or_not_terminal" };
    }

    return await dispatchPaymentFailureEmail(id);
  } catch {
    console.error("payment_failure_email", "dispatch_error");
    try {
      await prisma.esimPurchasePaymentAttempt.updateMany({
        where: {
          id,
          failureEmailNotificationStatus: PAYMENT_FAILURE_EMAIL_SENDING,
        },
        data: {
          failureEmailNotificationStatus: PAYMENT_FAILURE_EMAIL_FAILED,
        },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function dispatchPaymentFailureEmail(
  id: string
): Promise<PaymentFailureNotifyResult> {
  try {
    const row = await prisma.esimPurchasePaymentAttempt.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        gatewayAmountCents: true,
        currency: true,
        failedAt: true,
        cancelledAt: true,
        createdAt: true,
        failureEmailWalletReturned: true,
        purchase: {
          select: {
            id: true,
            destinationName: true,
            destinationCode: true,
            planName: true,
            orderId: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                deletedAt: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!row || !TERMINAL_FAILURE_STATUSES.includes(row.status)) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_SKIPPED);
      return { status: "skipped", reason: "not_terminal" };
    }

    // Never send a failure notice if a purchase already produced an order.
    if (row.purchase.orderId) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_SKIPPED);
      return { status: "skipped", reason: "order_exists" };
    }

    if (
      !Number.isInteger(row.gatewayAmountCents) ||
      row.gatewayAmountCents < 0
    ) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_SKIPPED);
      return { status: "skipped", reason: "invalid_amount" };
    }

    const user = row.purchase.customer;
    if (
      !user ||
      user.deletedAt ||
      user.role !== Role.CUSTOMER ||
      !user.email?.trim()
    ) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_SKIPPED);
      return { status: "skipped", reason: "customer_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_NOT_CONFIGURED);
      console.error("payment_failure_email", "not_configured", id);
      return { status: "not_configured" };
    }

    const occurredAt =
      row.failedAt ?? row.cancelledAt ?? row.createdAt;
    const destinationLabel =
      (row.purchase.destinationName ?? "").trim() ||
      (row.purchase.destinationCode ?? "").trim() ||
      null;
    const planLabel = (row.purchase.planName ?? "").trim() || null;
    const retryUrl = `${BRAND_SITE_URL}/account/esim/buy/review?purchase=${encodeURIComponent(row.purchase.id)}`;

    const payload = {
      customerName: (user.name ?? "").trim() || "Customer",
      purchaseReference: shortWalletTransactionReference(row.purchase.id),
      planLabel,
      destinationLabel,
      amountLabel: formatUsdCents(row.gatewayAmountCents),
      currencyLabel: (row.currency ?? "USD").trim().toUpperCase() || "USD",
      occurredAtLabel: formatWalletDateTime(occurredAt),
      walletFundsReturned: Boolean(row.failureEmailWalletReturned),
      retryUrl,
    };

    const subject = sanitizeEmailHeaderValue(PAYMENT_FAILURE_EMAIL_SUBJECT, 160);
    const text = renderPaymentFailureEmailText(payload);
    const html = renderPaymentFailureEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to: user.email.trim(),
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "payment_failed",
        "X-MAP-ESIM-Payment-Attempt": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_SENT);
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "esim.payment_failure_email_sent",
            targetType: "EsimPurchasePaymentAttempt",
            targetId: id,
            metadata: {
              notificationType: "payment_failed",
              deliveryStatus: PAYMENT_FAILURE_EMAIL_SENT,
              paymentAttemptId: id,
              purchaseId: row.purchase.id,
              userId: user.id,
              walletFundsReturned: payload.walletFundsReturned,
            },
          },
        })
        .catch(() => undefined);
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_NOT_CONFIGURED);
      console.error("payment_failure_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markFailureEmail(id, PAYMENT_FAILURE_EMAIL_FAILED);
    console.error("payment_failure_email", "send_failed", id);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("payment_failure_email", "dispatch_error");
    try {
      await prisma.esimPurchasePaymentAttempt.updateMany({
        where: {
          id,
          failureEmailNotificationStatus: PAYMENT_FAILURE_EMAIL_SENDING,
        },
        data: {
          failureEmailNotificationStatus: PAYMENT_FAILURE_EMAIL_FAILED,
        },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function markFailureEmail(id: string, status: string): Promise<void> {
  await prisma.esimPurchasePaymentAttempt.updateMany({
    where: { id },
    data: {
      failureEmailNotificationStatus: status,
      failureEmailNotifiedAt:
        status === PAYMENT_FAILURE_EMAIL_SENT ||
        status === PAYMENT_FAILURE_EMAIL_FAILED ||
        status === PAYMENT_FAILURE_EMAIL_NOT_CONFIGURED
          ? new Date()
          : undefined,
    },
  });
}

/** Fire-and-forget — never affects payment/wallet mutation callers. */
export function schedulePaymentFailureNotification(
  paymentAttemptId: string,
  options?: { walletFundsReturned?: boolean | null }
): void {
  void notifyPaymentFailureEmail(paymentAttemptId, options).catch(() => {
    console.error("payment_failure_email", "schedule_error");
  });
}
