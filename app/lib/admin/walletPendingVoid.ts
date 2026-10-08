/**
 * Admin void / cancel for stuck pending WALLET_ESIM_PURCHASE debit rows.
 * Reuses refundReservedFundsInTx({ restoreReady: true }) — never invents amounts.
 */
import "server-only";

import { Role } from "@prisma/client";
import { isAdminVoidablePendingWalletDebit } from "@/app/lib/admin/walletPendingVoidShared";
import { prisma } from "@/app/lib/db";
import {
  refundReservedFundsInTx,
  WalletEsimPurchaseError,
  WALLET_PURCHASE_DEBIT_REF,
} from "@/app/lib/esim/walletPurchase";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export type VoidPendingWalletReservationResult =
  | { ok: true; refundTransactionId: string | null; alreadyReleased: boolean }
  | { ok: false; error: string };

type PurchaseMeta = {
  id: string;
  status: string;
  orderId: string | null;
  providerOrderId: string | null;
  providerResultKind: string | null;
  debitTransactionId: string | null;
  walletAppliedCents: number;
  customerUserId: string;
  adminUserId: string | null;
};

export async function voidPendingWalletEsimPurchaseReservation(input: {
  adminUserId: string;
  customerUserId: string;
  walletTransactionId: string;
}): Promise<VoidPendingWalletReservationResult> {
  const adminUserId = (input.adminUserId ?? "").trim();
  const customerUserId = (input.customerUserId ?? "").trim();
  const walletTransactionId = (input.walletTransactionId ?? "").trim();

  if (!adminUserId || adminUserId.length > 64) {
    return { ok: false, error: "Admin session is unavailable." };
  }
  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer is unavailable." };
  }
  if (
    !walletTransactionId ||
    walletTransactionId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(walletTransactionId)
  ) {
    return { ok: false, error: "Wallet transaction is unavailable." };
  }

  const customer = await prisma.user.findFirst({
    where: { id: customerUserId, role: Role.CUSTOMER },
    select: { id: true },
  });
  if (!customer) {
    return { ok: false, error: "Customer is unavailable." };
  }

  const debit = await prisma.walletTransaction.findFirst({
    where: {
      id: walletTransactionId,
      wallet: { userId: customer.id },
    },
    select: {
      id: true,
      type: true,
      status: true,
      referenceType: true,
      referenceId: true,
      purchaseAsDebit: {
        select: {
          id: true,
          status: true,
          orderId: true,
          providerOrderId: true,
          providerResultKind: true,
          debitTransactionId: true,
          walletAppliedCents: true,
          customerUserId: true,
          adminUserId: true,
        },
      },
    },
  });

  if (!debit) {
    return { ok: false, error: "Wallet transaction is unavailable." };
  }

  const purchaseId =
    debit.purchaseAsDebit?.id ??
    (String(debit.referenceType ?? "").trim() === WALLET_PURCHASE_DEBIT_REF
      ? String(debit.referenceId ?? "").trim() || null
      : null);

  let purchaseMeta: PurchaseMeta | null = debit.purchaseAsDebit;
  if (!purchaseMeta && purchaseId) {
    purchaseMeta = await prisma.walletEsimPurchase.findFirst({
      where: { id: purchaseId, customerUserId: customer.id },
      select: {
        id: true,
        status: true,
        orderId: true,
        providerOrderId: true,
        providerResultKind: true,
        debitTransactionId: true,
        walletAppliedCents: true,
        customerUserId: true,
        adminUserId: true,
      },
    });
  }

  if (!purchaseMeta || purchaseMeta.customerUserId !== customer.id) {
    return {
      ok: false,
      error: "This pending reservation cannot be voided.",
    };
  }

  if (purchaseMeta.debitTransactionId !== debit.id) {
    return {
      ok: false,
      error: "This pending reservation cannot be voided.",
    };
  }

  if (
    !isAdminVoidablePendingWalletDebit({
      type: debit.type,
      status: debit.status,
      referenceType: debit.referenceType,
      purchaseStatus: purchaseMeta.status,
      orderId: purchaseMeta.orderId,
      providerOrderId: purchaseMeta.providerOrderId,
      providerResultKind: purchaseMeta.providerResultKind,
    })
  ) {
    return {
      ok: false,
      error: "This pending reservation cannot be voided.",
    };
  }

  const amountCents = purchaseMeta.walletAppliedCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      error: "This pending reservation cannot be voided.",
    };
  }

  try {
    let createdRefundId: string | null = null;
    let alreadyReleased = false;

    await prisma.$transaction(async (tx) => {
      const result = await refundReservedFundsInTx(tx, {
        purchaseId: purchaseMeta.id,
        customerUserId: customer.id,
        actorUserId: adminUserId,
        assisted: true,
        priceCents: amountCents,
        restoreReady: true,
      });

      if (result.outcome === "created") {
        createdRefundId = result.refundTransactionId;
      } else {
        alreadyReleased = true;
      }
    });

    if (createdRefundId) {
      scheduleWalletTransactionNotification(createdRefundId);
    }

    return {
      ok: true,
      refundTransactionId: createdRefundId,
      alreadyReleased,
    };
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        "Wallet reservation void is temporarily unavailable. Please try again shortly.",
    };
  }
}
