import "server-only";

import { PartnerEsimPurchaseStatus, Role } from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { prisma } from "@/app/lib/db";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  PARTNER_RECON_REQUIRED_EMAIL_SUBJECT,
  renderPartnerReconciliationRequiredEmailHtml,
  renderPartnerReconciliationRequiredEmailText,
} from "@/app/lib/email/partnerReconciliationRequiredTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import {
  RECON_REQUIRED_EMAIL_FAILED,
  RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
  RECON_REQUIRED_EMAIL_SENDING,
  RECON_REQUIRED_EMAIL_SENT,
  RECON_REQUIRED_EMAIL_SKIPPED,
} from "@/app/lib/esim/reconciliationRequiredEmailClaim";
import { shortPartnerPurchaseReference } from "@/app/lib/partner/partnerOrdersDisplay";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const PARTNER_RECON_EMAIL_DEFERRED = "deferred_partner_template";

export type PartnerReconciliationRequiredNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

async function markPartnerReconEmail(
  id: string,
  status: string
): Promise<void> {
  await prisma.partnerEsimPurchase.updateMany({
    where: {
      id,
      reconRequiredEmailNotificationStatus: RECON_REQUIRED_EMAIL_SENDING,
    },
    data: {
      reconRequiredEmailNotificationStatus: status,
      reconRequiredEmailNotifiedAt:
        status === RECON_REQUIRED_EMAIL_SENT ||
        status === RECON_REQUIRED_EMAIL_FAILED ||
        status === RECON_REQUIRED_EMAIL_NOT_CONFIGURED
          ? new Date()
          : undefined,
    },
  });
}

async function releaseSendingClaimToFailed(id: string): Promise<void> {
  await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_FAILED);
}

/**
 * Send at most one Partner purchase-under-review email.
 * null | failed | not_configured | deferred_partner_template are claimable;
 * sent is terminal. This function never throws to purchase callers.
 */
export async function notifyPartnerReconciliationRequiredEmail(
  purchaseId: string
): Promise<PartnerReconciliationRequiredNotifyResult> {
  const id = (purchaseId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    const claimed = await prisma.partnerEsimPurchase.updateMany({
      where: {
        id,
        status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        refundTransactionId: null,
        OR: [
          { reconRequiredEmailNotificationStatus: null },
          {
            reconRequiredEmailNotificationStatus: {
              in: [
                RECON_REQUIRED_EMAIL_FAILED,
                RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
                PARTNER_RECON_EMAIL_DEFERRED,
              ],
            },
          },
        ],
      },
      data: {
        reconRequiredEmailNotificationStatus: RECON_REQUIRED_EMAIL_SENDING,
      },
    });
    if (claimed.count !== 1) {
      return { status: "skipped", reason: "already_handled_or_not_eligible" };
    }

    const row = await prisma.partnerEsimPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        partnerChargeCents: true,
        currency: true,
        planName: true,
        destinationName: true,
        destinationCode: true,
        refundTransactionId: true,
        partner: {
          select: {
            id: true,
            disabledAt: true,
            user: {
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

    if (
      !row ||
      row.status !== PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED
    ) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "not_reconciliation_required" };
    }
    if (row.refundTransactionId) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "funds_already_returned" };
    }
    if (
      !Number.isInteger(row.partnerChargeCents) ||
      row.partnerChargeCents <= 0
    ) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "invalid_amount" };
    }

    const user = row.partner.user;
    if (
      row.partner.disabledAt ||
      !user ||
      user.deletedAt ||
      user.role !== Role.PARTNER ||
      !user.email?.trim()
    ) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "partner_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_NOT_CONFIGURED);
      console.error("partner_recon_required_email", "not_configured", id);
      return { status: "not_configured" };
    }

    const payload = {
      partnerName: (user.name ?? "").trim() || "Partner",
      purchaseReference: shortPartnerPurchaseReference(row.id),
      planLabel: (row.planName ?? "").trim() || null,
      destinationLabel:
        (row.destinationName ?? "").trim() ||
        (row.destinationCode ?? "").trim() ||
        null,
      amountLabel: formatUsdCents(row.partnerChargeCents),
      currencyLabel: (row.currency ?? "USD").trim().toUpperCase() || "USD",
      supportUrl: `${BRAND_SITE_URL}/support`,
      partnerOrdersUrl: `${BRAND_SITE_URL}/partner/orders`,
    };
    const subject = sanitizeEmailHeaderValue(
      PARTNER_RECON_REQUIRED_EMAIL_SUBJECT,
      160
    );
    const sendResult = await sendChannelMail({
      channel: "billing",
      to: user.email.trim(),
      subject,
      text: renderPartnerReconciliationRequiredEmailText(payload),
      html: renderPartnerReconciliationRequiredEmailHtml(payload),
      headers: {
        "X-MAP-ESIM-Billing-Kind": "partner_purchase_under_review",
        "X-MAP-ESIM-Partner-Purchase": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_SENT);
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "partner.recon_required_email_sent",
            targetType: "PartnerEsimPurchase",
            targetId: id,
            metadata: {
              purchaseId: id,
              partnerId: row.partner.id,
              userId: user.id,
            },
          },
        })
        .catch(() => undefined);
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_NOT_CONFIGURED);
      console.error("partner_recon_required_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markPartnerReconEmail(id, RECON_REQUIRED_EMAIL_FAILED);
    console.error("partner_recon_required_email", "send_failed", id);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("partner_recon_required_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // Notification failures are intentionally isolated from purchase state.
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

/** Fire-and-forget; email state can never roll back purchase or financial state. */
export function schedulePartnerReconciliationRequiredNotification(
  purchaseId: string
): void {
  void notifyPartnerReconciliationRequiredEmail(purchaseId).catch(() => {
    console.error("partner_recon_required_email", "schedule_error");
  });
}
