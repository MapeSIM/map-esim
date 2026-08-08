import "server-only";

import {
  WalletDirection,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { sendChannelMail } from "@/app/lib/email/transport";
import {
  renderWalletTransactionEmailHtml,
  renderWalletTransactionEmailText,
} from "@/app/lib/email/walletTransactionTemplate";
import { prisma } from "@/app/lib/db";
import {
  formatUsdCents,
  formatWalletDateTime,
  shortWalletTransactionReference,
} from "@/app/lib/wallet/display";

export const WALLET_TX_EMAIL_SENDING = "sending";
export const WALLET_TX_EMAIL_SENT = "sent";
export const WALLET_TX_EMAIL_FAILED = "failed";
export const WALLET_TX_EMAIL_NOT_CONFIGURED = "not_configured";
export const WALLET_TX_EMAIL_SKIPPED = "skipped";

export type WalletTxNotificationResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

function customerFacingTypeLabel(
  type: WalletTransactionType,
  direction: WalletDirection
): string {
  switch (type) {
    case WalletTransactionType.REFUND_CREDIT:
      return "Wallet funds returned";
    case WalletTransactionType.TOPUP_CREDIT:
    case WalletTransactionType.ADMIN_CREDIT:
    case WalletTransactionType.ADJUSTMENT_CREDIT:
      return "Credit";
    case WalletTransactionType.PURCHASE_DEBIT:
    case WalletTransactionType.ADJUSTMENT_DEBIT:
      return "Debit";
    case WalletTransactionType.REVERSAL:
      return direction === WalletDirection.CREDIT
        ? "Wallet funds returned"
        : "Debit";
    default:
      return direction === WalletDirection.CREDIT ? "Credit" : "Debit";
  }
}

function walletTransactionEmailSubject(
  type: WalletTransactionType,
  direction: WalletDirection
): string {
  switch (type) {
    case WalletTransactionType.REFUND_CREDIT:
      return "Funds returned to your MAP eSIM wallet";
    case WalletTransactionType.PURCHASE_DEBIT:
      return "MAP eSIM wallet payment completed";
    case WalletTransactionType.TOPUP_CREDIT:
    case WalletTransactionType.ADMIN_CREDIT:
    case WalletTransactionType.ADJUSTMENT_CREDIT:
      return "Your MAP eSIM wallet was credited";
    case WalletTransactionType.ADJUSTMENT_DEBIT:
      return "MAP eSIM wallet payment completed";
    case WalletTransactionType.REVERSAL:
      return direction === WalletDirection.CREDIT
        ? "Funds returned to your MAP eSIM wallet"
        : "MAP eSIM wallet payment completed";
    default:
      return direction === WalletDirection.CREDIT
        ? "Your MAP eSIM wallet was credited"
        : "MAP eSIM wallet payment completed";
  }
}

function safeDescription(options: {
  type: WalletTransactionType;
  referenceType: string | null;
  hasOrder: boolean;
}): string {
  switch (options.type) {
    case WalletTransactionType.PURCHASE_DEBIT:
      return options.hasOrder
        ? "eSIM package purchase"
        : "eSIM purchase";
    case WalletTransactionType.REFUND_CREDIT:
      // Customer-facing release/reversal — not a card/gateway refund claim.
      return "Wallet funds returned. No eSIM was created for this attempt.";
    case WalletTransactionType.TOPUP_CREDIT:
      return "Wallet top-up credit";
    case WalletTransactionType.ADMIN_CREDIT:
      return "Account credit applied by MAP eSIM";
    case WalletTransactionType.ADJUSTMENT_DEBIT:
      return "Account adjustment debit by MAP eSIM";
    case WalletTransactionType.ADJUSTMENT_CREDIT:
      return "Account adjustment credit by MAP eSIM";
    default:
      return "Wallet balance update";
  }
}

function amountDisplayLabel(amountCents: number, direction: WalletDirection): string {
  if (direction === WalletDirection.DEBIT) {
    return formatUsdCents(-Math.abs(amountCents));
  }
  const body = formatUsdCents(Math.abs(amountCents));
  return body === "$0.00" ? body : `+${body}`;
}

function shortOrderReference(orderId: string): string {
  const id = orderId.trim();
  if (!id) return "—";
  if (id.length <= 8) return "••••";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export async function resendFailedWalletTransactionNotification(
  walletTransactionId: string
): Promise<WalletTxNotificationResult> {
  const id = (walletTransactionId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    const claimed = await prisma.walletTransaction.updateMany({
      where: {
        id,
        status: WalletTransactionStatus.COMPLETED,
        emailNotificationStatus: {
          in: [WALLET_TX_EMAIL_FAILED, WALLET_TX_EMAIL_NOT_CONFIGURED],
        },
      },
      data: {
        emailNotificationStatus: WALLET_TX_EMAIL_SENDING,
      },
    });

    if (claimed.count !== 1) {
      return { status: "skipped", reason: "not_retryable_or_in_progress" };
    }

    return await dispatchWalletTransactionEmail(id);
  } catch {
    console.error("wallet_tx_email", "resend_error");
    try {
      await prisma.walletTransaction.updateMany({
        where: { id, emailNotificationStatus: WALLET_TX_EMAIL_SENDING },
        data: { emailNotificationStatus: WALLET_TX_EMAIL_FAILED },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

/**
 * Send at most one billing email for a completed wallet ledger movement.
 * Must be called AFTER the Prisma wallet mutation commits.
 * Never throws to callers — failures are recorded safely.
 */
export async function notifyCompletedWalletTransaction(
  walletTransactionId: string
): Promise<WalletTxNotificationResult> {
  const id = (walletTransactionId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { status: "skipped", reason: "invalid_id" };
  }

  try {
    const claimed = await prisma.walletTransaction.updateMany({
      where: {
        id,
        status: WalletTransactionStatus.COMPLETED,
        emailNotificationStatus: null,
      },
      data: {
        emailNotificationStatus: WALLET_TX_EMAIL_SENDING,
      },
    });

    if (claimed.count !== 1) {
      return { status: "skipped", reason: "already_handled_or_incomplete" };
    }

    return await dispatchWalletTransactionEmail(id);
  } catch {
    console.error("wallet_tx_email", "dispatch_error");
    try {
      await prisma.walletTransaction.updateMany({
        where: { id, emailNotificationStatus: WALLET_TX_EMAIL_SENDING },
        data: { emailNotificationStatus: WALLET_TX_EMAIL_FAILED },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function dispatchWalletTransactionEmail(
  id: string
): Promise<WalletTxNotificationResult> {
  try {
    const row = await prisma.walletTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        direction: true,
        status: true,
        amountCents: true,
        balanceBeforeCents: true,
        balanceAfterCents: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
        wallet: {
          select: {
            userId: true,
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
        purchaseAsDebit: {
          select: { orderId: true },
        },
        purchaseAsRefund: {
          select: { orderId: true },
        },
      },
    });

    if (!row || row.status !== WalletTransactionStatus.COMPLETED) {
      await prisma.walletTransaction.updateMany({
        where: { id, emailNotificationStatus: WALLET_TX_EMAIL_SENDING },
        data: { emailNotificationStatus: WALLET_TX_EMAIL_SKIPPED },
      });
      return { status: "skipped", reason: "not_completed" };
    }

    if (
      !Number.isInteger(row.amountCents) ||
      row.amountCents <= 0 ||
      typeof row.balanceAfterCents !== "number" ||
      !Number.isInteger(row.balanceAfterCents) ||
      row.balanceAfterCents < 0
    ) {
      await markNotification(id, WALLET_TX_EMAIL_SKIPPED);
      return { status: "skipped", reason: "invalid_balance_snapshot" };
    }

    const user = row.wallet.user;
    if (!user || user.deletedAt || !user.email?.trim()) {
      await markNotification(id, WALLET_TX_EMAIL_SKIPPED);
      return { status: "skipped", reason: "customer_unavailable" };
    }

    if (!isEmailConfigured("billing")) {
      await markNotification(id, WALLET_TX_EMAIL_NOT_CONFIGURED);
      console.error("wallet_tx_email", "not_configured", id);
      return { status: "not_configured" };
    }

    const orderId =
      row.purchaseAsDebit?.orderId?.trim() ||
      row.purchaseAsRefund?.orderId?.trim() ||
      null;

    let balanceBefore = row.balanceBeforeCents;
    if (
      typeof balanceBefore !== "number" ||
      !Number.isInteger(balanceBefore) ||
      balanceBefore < 0
    ) {
      // Derive only from durable after-balance + amount (never client input).
      balanceBefore =
        row.direction === WalletDirection.CREDIT
          ? row.balanceAfterCents - row.amountCents
          : row.balanceAfterCents + row.amountCents;
    }
    if (!Number.isInteger(balanceBefore) || balanceBefore < 0) {
      await markNotification(id, WALLET_TX_EMAIL_SKIPPED);
      return { status: "skipped", reason: "invalid_previous_balance" };
    }

    const payload = {
      customerName: (user.name ?? "").trim() || "Customer",
      transactionTypeLabel: customerFacingTypeLabel(row.type, row.direction),
      amountLabel: amountDisplayLabel(row.amountCents, row.direction),
      currencyLabel: "USD",
      description: safeDescription({
        type: row.type,
        referenceType: row.referenceType,
        hasOrder: Boolean(orderId),
      }),
      orderReference: orderId ? shortOrderReference(orderId) : null,
      orderUrl: orderId
        ? `${BRAND_SITE_URL}/account/orders/${encodeURIComponent(orderId)}`
        : null,
      transactionReference: shortWalletTransactionReference(row.id),
      previousBalanceLabel: formatUsdCents(balanceBefore),
      newBalanceLabel: formatUsdCents(row.balanceAfterCents),
      occurredAtLabel: formatWalletDateTime(row.createdAt),
      walletUrl: `${BRAND_SITE_URL}/account/wallet`,
    };

    const subject = sanitizeEmailHeaderValue(
      walletTransactionEmailSubject(row.type, row.direction),
      160
    );
    const text = renderWalletTransactionEmailText(payload);
    const html = renderWalletTransactionEmailHtml(payload);

    const sendResult = await sendChannelMail({
      channel: "billing",
      to: user.email.trim(),
      subject,
      text,
      html,
      headers: {
        "X-MAP-ESIM-Billing-Kind": "wallet_transaction",
        "X-MAP-ESIM-Wallet-Tx": sanitizeEmailHeaderValue(row.id, 64),
      },
    });

    if (sendResult.ok) {
      await markNotification(id, WALLET_TX_EMAIL_SENT);
      await prisma.auditLog.create({
        data: {
          actorUserId: null,
          action: "wallet.transaction_email_sent",
          targetType: "WalletTransaction",
          targetId: id,
          metadata: {
            notificationType: "wallet_balance_change",
            deliveryStatus: WALLET_TX_EMAIL_SENT,
            walletTransactionId: id,
            userId: user.id,
          },
        },
      });
      return { status: "sent" };
    }

    if (sendResult.reason === "not_configured") {
      await markNotification(id, WALLET_TX_EMAIL_NOT_CONFIGURED);
      console.error("wallet_tx_email", "not_configured", id);
      return { status: "not_configured" };
    }

    await markNotification(id, WALLET_TX_EMAIL_FAILED);
    console.error("wallet_tx_email", "send_failed", id);
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: "wallet.transaction_email_failed",
          targetType: "WalletTransaction",
          targetId: id,
          metadata: {
            notificationType: "wallet_balance_change",
            deliveryStatus: WALLET_TX_EMAIL_FAILED,
            errorCode: sendResult.reason,
            walletTransactionId: id,
            userId: user.id,
          },
        },
      })
      .catch(() => undefined);
    return { status: "failed", reason: sendResult.reason };
  } catch {
    console.error("wallet_tx_email", "dispatch_error");
    try {
      await prisma.walletTransaction.updateMany({
        where: { id, emailNotificationStatus: WALLET_TX_EMAIL_SENDING },
        data: { emailNotificationStatus: WALLET_TX_EMAIL_FAILED },
      });
    } catch {
      // ignore
    }
    return { status: "failed", reason: "dispatch_error" };
  }
}

async function markNotification(id: string, status: string): Promise<void> {
  await prisma.walletTransaction.updateMany({
    where: { id },
    data: {
      emailNotificationStatus: status,
      emailNotifiedAt:
        status === WALLET_TX_EMAIL_SENT ||
        status === WALLET_TX_EMAIL_FAILED ||
        status === WALLET_TX_EMAIL_NOT_CONFIGURED
          ? new Date()
          : undefined,
    },
  });
}

/** Fire-and-forget safe wrapper — never affects wallet mutation callers. */
export function scheduleWalletTransactionNotification(
  walletTransactionId: string
): void {
  void notifyCompletedWalletTransaction(walletTransactionId).catch(() => {
    console.error("wallet_tx_email", "schedule_error");
  });
}

export function walletEmailNotificationLabel(
  status: string | null | undefined
): string | null {
  switch ((status ?? "").trim()) {
    case WALLET_TX_EMAIL_SENT:
      return "Notification sent";
    case WALLET_TX_EMAIL_SENDING:
      return "Notification pending";
    case WALLET_TX_EMAIL_FAILED:
      return "Notification failed";
    case WALLET_TX_EMAIL_NOT_CONFIGURED:
      return "Notification pending";
    case WALLET_TX_EMAIL_SKIPPED:
      return null;
    default:
      return null;
  }
}

// Re-export support contact for templates/tests without leaking SMTP.
export const WALLET_NOTIFICATION_SUPPORT = BRAND_SUPPORT_EMAIL;
