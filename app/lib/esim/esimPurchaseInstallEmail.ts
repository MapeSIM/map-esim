/**
 * Shared post-success MAP eSIM QR/install email delivery.
 * Called only after provider success, Order persist, and install details exist.
 * Uses WalletEsimPurchase.emailDeliveryStatus as the durable CAS claim.
 * Never retries provider checkout, wallet debit, or payment success.
 */
import "server-only";

import { OrderStatus, Prisma, WalletEsimPurchaseStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { deliverOrderEmailAfterCheckout } from "@/app/lib/email/deliverAfterCheckout";
import { createOrderAccessToken } from "@/app/lib/vesim/orderAccess";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";
import { classifyAutomaticInstallEmailStatus } from "@/app/lib/esim/esimPurchaseInstallEmailStatus";
import { resolveFrozenInstallDeliveryEmail } from "@/app/lib/esim/esimDeliveryEmail";
import { schedulePaymentReceivedPendingNotification } from "@/app/lib/esim/paymentReceivedPendingNotification";

export const WALLET_DELIVERY_EMAIL_FAILED = "esim.wallet_delivery_email_failed";
export const WALLET_DELIVERY_EMAIL_UNCERTAIN =
  "esim.wallet_delivery_email_uncertain";

export {
  classifyAutomaticInstallEmailStatus,
  isAutomaticInstallEmailClaimableStatus,
  type AutomaticInstallEmailDecision,
} from "@/app/lib/esim/esimPurchaseInstallEmailStatus";

type JsonRecord = Record<string, unknown>;

export type DeliverCompletedWalletPurchaseInstallEmailResult = {
  decision:
    | "sent"
    | "skipped_already_sent"
    | "skipped_failed_awaiting_admin"
    | "skipped_sending_in_progress"
    | "skipped_not_ready"
    | "skipped_no_install_details"
    | "skipped_other"
    | "recorded_failure";
  emailDeliveryStatus: string | null;
};

function offerFromPurchaseSnapshot(row: {
  offerId: string;
  planName: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  priceCents: number;
  providerCostCents: number | null;
  currency: string;
}): VerifiedCheckoutOffer {
  const durationMatch = (row.validity ?? "").match(/(\d+)/);
  const priceUSD = row.priceCents > 0 ? row.priceCents / 100 : 0;
  const providerUsd =
    row.providerCostCents && row.providerCostCents > 0
      ? row.providerCostCents / 100
      : 0;
  return {
    offerId: row.offerId,
    name: (row.planName ?? "").trim() || "eSIM",
    countryCode: (row.destinationCode ?? "").trim() || null,
    countryName: (row.destinationName ?? "").trim() || null,
    dataFormatted: (row.dataAllowance ?? "").trim() || "—",
    durationDays: durationMatch ? Number(durationMatch[1]) : null,
    priceUSD,
    providerPriceUSD: providerUsd > 0 ? providerUsd : priceUSD,
    currency: (row.currency ?? "USD").trim() || "USD",
  };
}

async function auditInstallEmail(options: {
  actorUserId?: string | null;
  purchaseId: string;
  action: string;
  failureCode: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actorUserId ?? null,
        action: options.action,
        targetType: "WalletEsimPurchase",
        targetId: options.purchaseId,
        metadata: {
          method: "post_fulfillment_install_email",
          purchaseId: options.purchaseId,
          failureCategory: "email_delivery",
          failureCode: options.failureCode,
        } satisfies Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit must never affect purchase, order, payment, or provider state.
  }
}

async function persistDeliveryStatus(
  purchaseId: string,
  status: string
): Promise<boolean> {
  const updated = await prisma.walletEsimPurchase.updateMany({
    where: { id: purchaseId, emailDeliveryStatus: "sending" },
    data: { emailDeliveryStatus: status },
  });
  return updated.count === 1;
}

/**
 * Best-effort MAP branded QR/install email for a completed wallet purchase.
 * Recipient is frozen Order.alternateDeliveryEmail ?? Order.customerEmail.
 * Never throws. Never retries provider checkout or mutates wallet/payment.
 */
export async function deliverCompletedWalletPurchaseInstallEmail(options: {
  purchaseId: string;
  checkoutPayload?: JsonRecord;
  verifiedOffer?: VerifiedCheckoutOffer;
  actorUserId?: string | null;
  assistedWalletPurchaseNotice?: boolean;
}): Promise<DeliverCompletedWalletPurchaseInstallEmailResult> {
  const purchaseId = options.purchaseId.trim();
  if (!purchaseId) {
    return { decision: "skipped_not_ready", emailDeliveryStatus: null };
  }

  try {
    const purchase = await prisma.walletEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        status: true,
        orderId: true,
        providerOrderId: true,
        emailDeliveryStatus: true,
        offerId: true,
        planName: true,
        destinationName: true,
        destinationCode: true,
        dataAllowance: true,
        validity: true,
        priceCents: true,
        providerCostCents: true,
        currency: true,
        adminUserId: true,
        order: {
          select: {
            id: true,
            status: true,
            customerEmail: true,
            alternateDeliveryEmail: true,
            providerOrderId: true,
          },
        },
      },
    });

    if (
      !purchase ||
      purchase.status !== WalletEsimPurchaseStatus.COMPLETED ||
      !purchase.orderId ||
      !purchase.providerOrderId ||
      !purchase.order ||
      purchase.order.status !== OrderStatus.COMPLETED
    ) {
      return {
        decision: "skipped_not_ready",
        emailDeliveryStatus: purchase?.emailDeliveryStatus ?? null,
      };
    }

    const classified = classifyAutomaticInstallEmailStatus(
      purchase.emailDeliveryStatus
    );
    if (classified === "skip_sent") {
      return {
        decision: "skipped_already_sent",
        emailDeliveryStatus: purchase.emailDeliveryStatus,
      };
    }
    if (classified === "skip_failed_for_admin") {
      return {
        decision: "skipped_failed_awaiting_admin",
        emailDeliveryStatus: purchase.emailDeliveryStatus,
      };
    }
    if (classified === "uncertain_sending") {
      await auditInstallEmail({
        actorUserId: options.actorUserId,
        purchaseId,
        action: WALLET_DELIVERY_EMAIL_UNCERTAIN,
        failureCode: "sending_in_progress",
      });
      return {
        decision: "skipped_sending_in_progress",
        emailDeliveryStatus: purchase.emailDeliveryStatus,
      };
    }
    if (classified === "skip_other") {
      await auditInstallEmail({
        actorUserId: options.actorUserId,
        purchaseId,
        action: WALLET_DELIVERY_EMAIL_UNCERTAIN,
        failureCode: "unknown_email_delivery_status",
      });
      return {
        decision: "skipped_other",
        emailDeliveryStatus: purchase.emailDeliveryStatus,
      };
    }

    const claimed = await prisma.walletEsimPurchase.updateMany({
      where: {
        id: purchaseId,
        status: WalletEsimPurchaseStatus.COMPLETED,
        orderId: { not: null },
        providerOrderId: { not: null },
        OR: [
          { emailDeliveryStatus: null },
          { emailDeliveryStatus: "skipped_no_install_details" },
        ],
      },
      data: { emailDeliveryStatus: "sending" },
    });
    if (claimed.count !== 1) {
      const again = await prisma.walletEsimPurchase.findUnique({
        where: { id: purchaseId },
        select: { emailDeliveryStatus: true },
      });
      const againClass = classifyAutomaticInstallEmailStatus(
        again?.emailDeliveryStatus
      );
      if (againClass === "skip_sent") {
        return {
          decision: "skipped_already_sent",
          emailDeliveryStatus: again?.emailDeliveryStatus ?? null,
        };
      }
      if (againClass === "skip_failed_for_admin") {
        return {
          decision: "skipped_failed_awaiting_admin",
          emailDeliveryStatus: again?.emailDeliveryStatus ?? null,
        };
      }
      await auditInstallEmail({
        actorUserId: options.actorUserId,
        purchaseId,
        action: WALLET_DELIVERY_EMAIL_UNCERTAIN,
        failureCode:
          againClass === "uncertain_sending"
            ? "sending_in_progress"
            : "claim_conflict",
      });
      return {
        decision: "skipped_sending_in_progress",
        emailDeliveryStatus: again?.emailDeliveryStatus ?? "sending",
      };
    }

    const frozenEmail = resolveFrozenInstallDeliveryEmail(purchase.order);
    const providerOrderId =
      purchase.providerOrderId.trim() ||
      (purchase.order.providerOrderId ?? "").trim();
    const verifiedOffer =
      options.verifiedOffer ?? offerFromPurchaseSnapshot(purchase);
    const accessToken = createOrderAccessToken(providerOrderId);

    const emailResult = await deliverOrderEmailAfterCheckout({
      orderId: providerOrderId,
      customerEmail: frozenEmail,
      verifiedOffer,
      checkoutPayload: options.checkoutPayload,
      accessToken: accessToken || undefined,
      assistedWalletPurchaseNotice:
        options.assistedWalletPurchaseNotice ?? Boolean(purchase.adminUserId),
    });

    const persisted = await persistDeliveryStatus(
      purchaseId,
      emailResult.emailDelivery
    );
    if (!persisted) {
      await auditInstallEmail({
        actorUserId: options.actorUserId,
        purchaseId,
        action: WALLET_DELIVERY_EMAIL_UNCERTAIN,
        failureCode: "status_persist_conflict",
      });
    }

    if (emailResult.emailDelivery === "skipped_no_install_details") {
      schedulePaymentReceivedPendingNotification(purchaseId);
      return {
        decision: "skipped_no_install_details",
        emailDeliveryStatus: emailResult.emailDelivery,
      };
    }
    if (
      emailResult.emailDelivery === "sent" ||
      emailResult.emailDelivery === "already_sent"
    ) {
      return {
        decision:
          emailResult.emailDelivery === "already_sent"
            ? "skipped_already_sent"
            : "sent",
        emailDeliveryStatus: emailResult.emailDelivery,
      };
    }
    if (
      emailResult.emailDelivery === "failed" ||
      emailResult.emailDelivery === "invalid_email" ||
      emailResult.emailDelivery === "not_configured"
    ) {
      await auditInstallEmail({
        actorUserId: options.actorUserId,
        purchaseId,
        action: WALLET_DELIVERY_EMAIL_FAILED,
        failureCode: emailResult.emailDelivery,
      });
      return {
        decision: "recorded_failure",
        emailDeliveryStatus: emailResult.emailDelivery,
      };
    }

    return {
      decision: "recorded_failure",
      emailDeliveryStatus: emailResult.emailDelivery,
    };
  } catch {
    try {
      await persistDeliveryStatus(purchaseId, "failed");
    } catch {
      // ignore secondary persist failure
    }
    await auditInstallEmail({
      actorUserId: options.actorUserId,
      purchaseId,
      action: WALLET_DELIVERY_EMAIL_FAILED,
      failureCode: "exception",
    });
    return { decision: "recorded_failure", emailDeliveryStatus: "failed" };
  }
}
