import "server-only";

import { Role, WalletEsimPurchaseStatus } from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT,
  renderPaymentReceivedPendingEmailHtml,
  renderPaymentReceivedPendingEmailText,
} from "@/app/lib/email/paymentReceivedPendingTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";
import {
  PAYMENT_RECEIVED_EMAIL_FAILED,
  PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED,
  PAYMENT_RECEIVED_EMAIL_SENDING,
  PAYMENT_RECEIVED_EMAIL_SENT,
  PAYMENT_RECEIVED_EMAIL_SKIPPED,
  shouldSendPaymentReceivedPendingEmail,
} from "@/app/lib/esim/paymentReceivedPendingEmailClaim";
import {
  formatUsdCents,
  shortWalletTransactionReference,
} from "@/app/lib/wallet/display";

export {
  PAYMENT_RECEIVED_EMAIL_FAILED,
  PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED,
  PAYMENT_RECEIVED_EMAIL_SENDING,
  PAYMENT_RECEIVED_EMAIL_SENT,
  PAYMENT_RECEIVED_EMAIL_SKIPPED,
  isPaymentReceivedEmailClaimable,
  shouldSendPaymentReceivedPendingEmail,
} from "@/app/lib/esim/paymentReceivedPendingEmailClaim";

export type PaymentReceivedPendingNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

async function releaseSendingClaimToFailed(id: string): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: {
      id,
      paymentReceivedEmailNotificationStatus: PAYMENT_RECEIVED_EMAIL_SENDING,
    },
    data: {
      paymentReceivedEmailNotificationStatus: PAYMENT_RECEIVED_EMAIL_FAILED,
      paymentReceivedEmailNotifiedAt: new Date(),
    },
  });
}

async function markPaymentReceivedEmail(
  id: string,
  status: string
): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: { id },
    data: {
      paymentReceivedEmailNotificationStatus: status,
      paymentReceivedEmailNotifiedAt:
        status === PAYMENT_RECEIVED_EMAIL_SENT ||
        status === PAYMENT_RECEIVED_EMAIL_FAILED ||
        status === PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED
          ? new Date()
          : undefined,
    },
  });
}

/**
 * Send at most one customer "payment received, eSIM still preparing" email.
 * Must run after payment is durably captured and after the install-email attempt.
 * Never throws to callers. Never mutates payment, wallet, or provider state.
 *
 * Delivery semantics: durable once-only claim via CAS on
 * paymentReceivedEmailNotificationStatus (null/failed/not_configured → sending).
 * External SMTP accept before final "sent" write can theoretically double-deliver
 * on crash (same pattern as wallet / payment-failure emails).
 */
export async function notifyPaymentReceivedPendingEmail(
  purchaseId: string
): Promise<PaymentReceivedPendingNotifyResult> {
  const id = (purchaseId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    const claimed = await prisma.walletEsimPurchase.updateMany({
      where: {
        id,
        status: {
          in: [
            WalletEsimPurchaseStatus.FUNDED,
            WalletEsimPurchaseStatus.PROVIDER_PENDING,
            WalletEsimPurchaseStatus.COMPLETED,
          ],
        },
        OR: [
          { paymentReceivedEmailNotificationStatus: null },
          {
            paymentReceivedEmailNotificationStatus: {
              in: [
                PAYMENT_RECEIVED_EMAIL_FAILED,
                PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED,
              ],
            },
          },
        ],
      },
      data: {
        paymentReceivedEmailNotificationStatus: PAYMENT_RECEIVED_EMAIL_SENDING,
      },
    });

    if (claimed.count !== 1) {
      return { status: "skipped", reason: "already_handled_or_not_eligible" };
    }

    return await dispatchPaymentReceivedPendingEmail(id);
  } catch {
    console.error("payment_received_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function dispatchPaymentReceivedPendingEmail(
  id: string
): Promise<PaymentReceivedPendingNotifyResult> {
  try {
    const row = await prisma.walletEsimPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        emailDeliveryStatus: true,
        planName: true,
        destinationName: true,
        destinationCode: true,
        priceCents: true,
        currency: true,
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
    });

    if (
      !row ||
      !shouldSendPaymentReceivedPendingEmail({
        purchaseStatus: row.status,
        emailDeliveryStatus: row.emailDeliveryStatus,
      })
    ) {
      await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "not_pending_fulfillment" };
    }

    const user = row.customer;
    if (
      !user ||
      user.deletedAt ||
      user.role !== Role.CUSTOMER ||
      !user.email?.trim()
    ) {
      await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "customer_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED);
      console.error("payment_received_email", "not_configured", id);
      return { status: "not_configured" };
    }

    const destinationLabel =
      (row.destinationName ?? "").trim() ||
      (row.destinationCode ?? "").trim() ||
      null;
    const planLabel = (row.planName ?? "").trim() || null;

    const payload = {
      customerName: (user.name ?? "").trim() || "Customer",
      purchaseReference: shortWalletTransactionReference(row.id),
      planLabel,
      destinationLabel,
      amountLabel: formatUsdCents(row.priceCents),
      currencyLabel: (row.currency ?? "USD").trim().toUpperCase() || "USD",
      accountOrdersUrl: `${BRAND_SITE_URL}/account/orders`,
    };

    const subject = sanitizeEmailHeaderValue(
      PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT,
      160
    );
    const text = renderPaymentReceivedPendingEmailText(payload);
    const html = renderPaymentReceivedPendingEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to: user.email.trim(),
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "payment_received_pending",
        "X-MAP-ESIM-Purchase": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_SENT);
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "esim.payment_received_pending_email_sent",
            targetType: "WalletEsimPurchase",
            targetId: id,
            metadata: {
              notificationType: "payment_received_pending",
              deliveryStatus: PAYMENT_RECEIVED_EMAIL_SENT,
              purchaseId: id,
              userId: user.id,
            },
          },
        })
        .catch(() => undefined);
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED);
      console.error("payment_received_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markPaymentReceivedEmail(id, PAYMENT_RECEIVED_EMAIL_FAILED);
    console.error("payment_received_email", "send_failed", id);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("payment_received_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

/** Fire-and-forget — never affects payment/fulfillment callers. */
export function schedulePaymentReceivedPendingNotification(
  purchaseId: string
): void {
  void notifyPaymentReceivedPendingEmail(purchaseId).catch(() => {
    console.error("payment_received_email", "schedule_error");
  });
}
