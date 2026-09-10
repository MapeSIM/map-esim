import "server-only";

import { Role, WalletEsimPurchaseStatus } from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  ABANDONED_CHECKOUT_EMAIL_SUBJECT,
  renderAbandonedCheckoutEmailHtml,
  renderAbandonedCheckoutEmailText,
} from "@/app/lib/email/abandonedCheckoutTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";
import {
  ABANDONED_CHECKOUT_EMAIL_FAILED,
  ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED,
  ABANDONED_CHECKOUT_EMAIL_SENDING,
  ABANDONED_CHECKOUT_EMAIL_SENT,
  ABANDONED_CHECKOUT_EMAIL_SKIPPED,
  shouldSendAbandonedCheckoutEmail,
} from "@/app/lib/esim/abandonedCheckoutEmailClaim";
import { customerPendingPurchaseHref } from "@/app/lib/esim/customerPurchaseStatusMessaging";
import {
  formatUsdCents,
  shortWalletTransactionReference,
} from "@/app/lib/wallet/display";

export {
  ABANDONED_CHECKOUT_EMAIL_FAILED,
  ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED,
  ABANDONED_CHECKOUT_EMAIL_SENDING,
  ABANDONED_CHECKOUT_EMAIL_SENT,
  ABANDONED_CHECKOUT_EMAIL_SKIPPED,
  isAbandonedCheckoutEmailClaimable,
  shouldSendAbandonedCheckoutEmail,
} from "@/app/lib/esim/abandonedCheckoutEmailClaim";

export type AbandonedCheckoutNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

async function releaseSendingClaimToFailed(id: string): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: {
      id,
      abandonedCheckoutEmailNotificationStatus:
        ABANDONED_CHECKOUT_EMAIL_SENDING,
    },
    data: {
      abandonedCheckoutEmailNotificationStatus:
        ABANDONED_CHECKOUT_EMAIL_FAILED,
      abandonedCheckoutEmailNotifiedAt: new Date(),
    },
  });
}

async function markAbandonedCheckoutEmail(
  id: string,
  status: string
): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: { id },
    data: {
      abandonedCheckoutEmailNotificationStatus: status,
      abandonedCheckoutEmailNotifiedAt:
        status === ABANDONED_CHECKOUT_EMAIL_SENT ||
        status === ABANDONED_CHECKOUT_EMAIL_FAILED ||
        status === ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED
          ? new Date()
          : undefined,
    },
  });
}

/**
 * Send at most one customer abandoned-checkout recovery email for a
 * WalletEsimPurchase still in unfinished checkout.
 * Never throws to callers. Never mutates payment, wallet, or provider state.
 *
 * Delivery semantics: durable once-only claim via CAS on
 * abandonedCheckoutEmailNotificationStatus
 * (null/failed/not_configured → sending → sent/failed/…).
 */
export async function notifyAbandonedCheckoutEmail(
  purchaseId: string
): Promise<AbandonedCheckoutNotifyResult> {
  const id = (purchaseId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    const claimed = await prisma.walletEsimPurchase.updateMany({
      where: {
        id,
        adminUserId: null,
        status: {
          in: [
            WalletEsimPurchaseStatus.READY,
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          ],
        },
        OR: [
          { abandonedCheckoutEmailNotificationStatus: null },
          {
            abandonedCheckoutEmailNotificationStatus: {
              in: [
                ABANDONED_CHECKOUT_EMAIL_FAILED,
                ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED,
              ],
            },
          },
        ],
      },
      data: {
        abandonedCheckoutEmailNotificationStatus:
          ABANDONED_CHECKOUT_EMAIL_SENDING,
      },
    });

    if (claimed.count !== 1) {
      return { status: "skipped", reason: "already_handled_or_not_eligible" };
    }

    return await dispatchAbandonedCheckoutEmail(id);
  } catch {
    console.error("abandoned_checkout_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function dispatchAbandonedCheckoutEmail(
  id: string
): Promise<AbandonedCheckoutNotifyResult> {
  try {
    const row = await prisma.walletEsimPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        adminUserId: true,
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
      !shouldSendAbandonedCheckoutEmail({
        purchaseStatus: row.status,
        adminUserId: row.adminUserId,
      })
    ) {
      await markAbandonedCheckoutEmail(id, ABANDONED_CHECKOUT_EMAIL_SKIPPED);
      return { status: "skipped", reason: "not_abandoned_checkout" };
    }

    const resumePath = customerPendingPurchaseHref(row.status, row.id);
    if (!resumePath) {
      await markAbandonedCheckoutEmail(id, ABANDONED_CHECKOUT_EMAIL_SKIPPED);
      return { status: "skipped", reason: "resume_href_unavailable" };
    }

    const user = row.customer;
    const customerEmail = (user?.email ?? "").trim();
    if (
      !user ||
      user.deletedAt ||
      user.role !== Role.CUSTOMER ||
      !customerEmail
    ) {
      await markAbandonedCheckoutEmail(id, ABANDONED_CHECKOUT_EMAIL_SKIPPED);
      return { status: "skipped", reason: "customer_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markAbandonedCheckoutEmail(
        id,
        ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED
      );
      console.error("abandoned_checkout_email", "not_configured", id);
      return { status: "not_configured" };
    }

    const destinationLabel =
      (row.destinationName ?? "").trim() ||
      (row.destinationCode ?? "").trim() ||
      null;
    const planLabel = (row.planName ?? "").trim() || null;
    const resumeCheckoutUrl = `${BRAND_SITE_URL}${resumePath}`;

    const payload = {
      customerName: (user.name ?? "").trim() || "Customer",
      purchaseReference: shortWalletTransactionReference(row.id),
      planLabel,
      destinationLabel,
      amountLabel: formatUsdCents(row.priceCents),
      currencyLabel: (row.currency ?? "USD").trim().toUpperCase() || "USD",
      resumeCheckoutUrl,
    };

    const subject = sanitizeEmailHeaderValue(
      ABANDONED_CHECKOUT_EMAIL_SUBJECT,
      160
    );
    const text = renderAbandonedCheckoutEmailText(payload);
    const html = renderAbandonedCheckoutEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to: customerEmail,
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "abandoned_checkout",
        "X-MAP-ESIM-Purchase": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markAbandonedCheckoutEmail(id, ABANDONED_CHECKOUT_EMAIL_SENT);
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "esim.abandoned_checkout_email_sent",
            targetType: "WalletEsimPurchase",
            targetId: id,
            metadata: {
              notificationType: "abandoned_checkout",
              deliveryStatus: ABANDONED_CHECKOUT_EMAIL_SENT,
              purchaseId: id,
              userId: user.id,
            },
          },
        })
        .catch(() => undefined);
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await markAbandonedCheckoutEmail(
        id,
        ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED
      );
      console.error("abandoned_checkout_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markAbandonedCheckoutEmail(id, ABANDONED_CHECKOUT_EMAIL_FAILED);
    console.error("abandoned_checkout_email", "send_failed", id);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("abandoned_checkout_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

/** Fire-and-forget — never affects checkout/payment/wallet callers. */
export function scheduleAbandonedCheckoutNotification(
  purchaseId: string
): void {
  void notifyAbandonedCheckoutEmail(purchaseId).catch(() => {
    console.error("abandoned_checkout_email", "schedule_error");
  });
}
