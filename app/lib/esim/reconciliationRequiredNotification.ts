import "server-only";

import {
  Role,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  RECON_REQUIRED_EMAIL_SUBJECT,
  renderReconciliationRequiredEmailHtml,
  renderReconciliationRequiredEmailText,
} from "@/app/lib/email/reconciliationRequiredTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";
import {
  RECON_REQUIRED_EMAIL_FAILED,
  RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
  RECON_REQUIRED_EMAIL_SENDING,
  RECON_REQUIRED_EMAIL_SENT,
  RECON_REQUIRED_EMAIL_SKIPPED,
} from "@/app/lib/esim/reconciliationRequiredEmailClaim";
import {
  formatUsdCents,
  shortWalletTransactionReference,
} from "@/app/lib/wallet/display";

export {
  RECON_REQUIRED_EMAIL_FAILED,
  RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
  RECON_REQUIRED_EMAIL_SENDING,
  RECON_REQUIRED_EMAIL_SENT,
  RECON_REQUIRED_EMAIL_SKIPPED,
  applyReconRequiredEmailTransition,
  isReconRequiredEmailClaimable,
} from "@/app/lib/esim/reconciliationRequiredEmailClaim";

/** Must match `WALLET_PURCHASE_REFUND_REF` in walletPurchase.ts (avoid import cycle). */
const WALLET_PURCHASE_REFUND_REF = "WALLET_ESIM_PURCHASE_REFUND";

export type ReconciliationRequiredNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

async function fundsAlreadyReturned(purchaseId: string): Promise<boolean> {
  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: { refundTransactionId: true },
  });
  if (purchase?.refundTransactionId) return true;

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

async function releaseSendingClaimToFailed(id: string): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: {
      id,
      reconRequiredEmailNotificationStatus: RECON_REQUIRED_EMAIL_SENDING,
    },
    data: {
      reconRequiredEmailNotificationStatus: RECON_REQUIRED_EMAIL_FAILED,
      reconRequiredEmailNotifiedAt: new Date(),
    },
  });
}

/**
 * Send at most one customer "order under review" email for a purchase that is
 * durably in RECONCILIATION_REQUIRED with funds still held.
 * Never throws to callers. Never includes provider/internal recon details.
 *
 * Claim convention (wallet-style): null | failed | not_configured → sending.
 * Failed SMTP/throws release sending → failed so a later invoke can retry.
 * sent is terminal (no duplicate customer email).
 */
export async function notifyReconciliationRequiredEmail(
  purchaseId: string
): Promise<ReconciliationRequiredNotifyResult> {
  const id = (purchaseId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    if (await fundsAlreadyReturned(id)) {
      return { status: "skipped", reason: "funds_already_returned" };
    }

    const claimed = await prisma.walletEsimPurchase.updateMany({
      where: {
        id,
        status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        refundTransactionId: null,
        OR: [
          { reconRequiredEmailNotificationStatus: null },
          {
            reconRequiredEmailNotificationStatus: {
              in: [
                RECON_REQUIRED_EMAIL_FAILED,
                RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
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

    // Re-check after claim in case a refund landed concurrently.
    if (await fundsAlreadyReturned(id)) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "funds_already_returned" };
    }

    return await dispatchReconciliationRequiredEmail(id);
  } catch {
    console.error("recon_required_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function dispatchReconciliationRequiredEmail(
  id: string
): Promise<ReconciliationRequiredNotifyResult> {
  try {
    const row = await prisma.walletEsimPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        priceCents: true,
        currency: true,
        planName: true,
        destinationName: true,
        destinationCode: true,
        refundTransactionId: true,
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
      row.status !== WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED
    ) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "not_reconciliation_required" };
    }

    if (row.refundTransactionId) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "funds_already_returned" };
    }

    if (!Number.isInteger(row.priceCents) || row.priceCents < 0) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "invalid_amount" };
    }

    const user = row.customer;
    if (
      !user ||
      user.deletedAt ||
      user.role !== Role.CUSTOMER ||
      !user.email?.trim()
    ) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SKIPPED);
      return { status: "skipped", reason: "customer_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_NOT_CONFIGURED);
      console.error("recon_required_email", "not_configured", id);
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
      supportUrl: `${BRAND_SITE_URL}/support`,
      accountOrdersUrl: `${BRAND_SITE_URL}/account/orders`,
    };

    const subject = sanitizeEmailHeaderValue(RECON_REQUIRED_EMAIL_SUBJECT, 160);
    const text = renderReconciliationRequiredEmailText(payload);
    const html = renderReconciliationRequiredEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to: user.email.trim(),
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "order_under_review",
        "X-MAP-ESIM-Purchase": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markReconEmail(id, RECON_REQUIRED_EMAIL_SENT);
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: "esim.recon_required_email_sent",
            targetType: "WalletEsimPurchase",
            targetId: id,
            metadata: {
              notificationType: "order_under_review",
              deliveryStatus: RECON_REQUIRED_EMAIL_SENT,
              purchaseId: id,
              userId: user.id,
            },
          },
        })
        .catch(() => undefined);
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      // Retryable — same convention as wallet tx not_configured.
      await markReconEmail(id, RECON_REQUIRED_EMAIL_NOT_CONFIGURED);
      console.error("recon_required_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markReconEmail(id, RECON_REQUIRED_EMAIL_FAILED);
    console.error("recon_required_email", "send_failed", id);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("recon_required_email", "dispatch_error");
    try {
      await releaseSendingClaimToFailed(id);
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function markReconEmail(id: string, status: string): Promise<void> {
  await prisma.walletEsimPurchase.updateMany({
    where: { id },
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

/**
 * Fire-and-forget — never affects purchase/reconciliation callers.
 * Email failure must not roll back RECONCILIATION_REQUIRED or alter funds.
 */
export function scheduleReconciliationRequiredNotification(
  purchaseId: string
): void {
  void notifyReconciliationRequiredEmail(purchaseId).catch(() => {
    console.error("recon_required_email", "schedule_error");
  });
}
