/**
 * Admin void / cancel for stuck pending WALLET_ESIM_PURCHASE debit rows.
 * Reuses refundReservedFundsInTx({ restoreReady: true }) — never invents amounts.
 */
import "server-only";

import {
  Role,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { isAdminVoidablePendingWalletDebit } from "@/app/lib/admin/walletPendingVoidShared";
import { prisma } from "@/app/lib/db";
import {
  refundReservedFundsInTx,
  WalletEsimPurchaseError,
  WALLET_PURCHASE_DEBIT_REF,
  WALLET_PURCHASE_REFUND_REF,
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

/**
 * Hard-set a still-PENDING WALLET_ESIM_PURCHASE debit to REVERSED.
 * Used when the reservation is already known released (UI "already released")
 * so the badge cannot stay Pending and Void/Cancel is removed.
 */
export async function forceReverseReleasedPurchaseDebit(input: {
  walletTransactionId: string;
  customerUserId?: string | null;
}): Promise<boolean> {
  const walletTransactionId = (input.walletTransactionId ?? "").trim();
  if (
    !walletTransactionId ||
    walletTransactionId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(walletTransactionId)
  ) {
    return false;
  }
  const customerUserId = (input.customerUserId ?? "").trim() || null;

  const updated = await prisma.walletTransaction.updateMany({
    where: {
      id: walletTransactionId,
      type: WalletTransactionType.PURCHASE_DEBIT,
      status: WalletTransactionStatus.PENDING,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
      ...(customerUserId
        ? { wallet: { userId: customerUserId } }
        : {}),
    },
    data: { status: WalletTransactionStatus.REVERSED },
  });
  return updated.count === 1;
}

/**
 * If a PURCHASE_DEBIT is still PENDING but the reservation was already released
 * (purchase no longer holds the debit, or a release_gw_* refund credit exists),
 * flip the debit to REVERSED so admin UI stops showing Pending / Void.
 */
export async function healReleasedPendingPurchaseDebit(input: {
  walletTransactionId: string;
  customerUserId?: string | null;
}): Promise<{ healed: boolean }> {
  const walletTransactionId = (input.walletTransactionId ?? "").trim();
  if (
    !walletTransactionId ||
    walletTransactionId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(walletTransactionId)
  ) {
    return { healed: false };
  }

  const customerUserId = (input.customerUserId ?? "").trim() || null;

  const debit = await prisma.walletTransaction.findFirst({
    where: {
      id: walletTransactionId,
      type: WalletTransactionType.PURCHASE_DEBIT,
      status: WalletTransactionStatus.PENDING,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
      ...(customerUserId
        ? { wallet: { userId: customerUserId } }
        : {}),
    },
    select: {
      id: true,
      referenceId: true,
      walletId: true,
    },
  });
  if (!debit) return { healed: false };

  const purchaseId = (debit.referenceId ?? "").trim();
  if (!purchaseId) return { healed: false };

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      status: true,
      debitTransactionId: true,
      orderId: true,
    },
  });

  const releaseKeyExact = `release_gw_${purchaseId}_${debit.id}`.slice(0, 128);
  const releaseKeyLegacy = `release_gw_${purchaseId}`.slice(0, 128);
  const releaseCredit = await prisma.walletTransaction.findFirst({
    where: {
      walletId: debit.walletId,
      type: WalletTransactionType.REFUND_CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      OR: [
        { idempotencyKey: releaseKeyExact },
        { idempotencyKey: releaseKeyLegacy },
        {
          referenceType: WALLET_PURCHASE_REFUND_REF,
          referenceId: purchaseId,
        },
      ],
    },
    select: { id: true },
  });

  const debitUnlinked =
    !purchase ||
    (purchase.debitTransactionId ?? "").trim() !== debit.id;
  const purchaseStatus = String(purchase?.status ?? "").trim();
  // Only heal when funds were clearly released — never for FUNDED/completed holds.
  const releasedPurchaseState =
    purchaseStatus === "READY" || purchaseStatus === "FAILED_REFUNDED";
  const safeToHeal =
    Boolean(releaseCredit) ||
    (debitUnlinked && (!purchase || releasedPurchaseState));

  if (!safeToHeal) {
    return { healed: false };
  }

  const forced = await forceReverseReleasedPurchaseDebit({
    walletTransactionId: debit.id,
    customerUserId,
  });
  return { healed: forced };
}

/**
 * Batch-heal orphaned PENDING purchase debits on a wallet (admin ledger/summary).
 * Never credits balance — only flips status when release evidence already exists.
 */
export async function healReleasedPendingPurchaseDebitsForWallet(input: {
  walletId: string;
  limit?: number;
}): Promise<number> {
  const walletId = (input.walletId ?? "").trim();
  if (!walletId) return 0;
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);

  const pending = await prisma.walletTransaction.findMany({
    where: {
      walletId,
      type: WalletTransactionType.PURCHASE_DEBIT,
      status: WalletTransactionStatus.PENDING,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true },
  });

  let healed = 0;
  for (const row of pending) {
    const result = await healReleasedPendingPurchaseDebit({
      walletTransactionId: row.id,
    });
    if (result.healed) healed += 1;
  }
  return healed;
}

/**
 * One-time force reverse for a known stuck released debit (ref suffix + customer).
 * Idempotent: no-op when already REVERSED or not found.
 */
export async function forceReverseKnownStuckReleasedDebit(input: {
  customerUserId: string;
  referenceIdSuffix: string;
}): Promise<{ updated: boolean; walletTransactionId: string | null }> {
  const customerUserId = (input.customerUserId ?? "").trim();
  const suffix = (input.referenceIdSuffix ?? "").trim().toLowerCase();
  if (!customerUserId || customerUserId.length > 64) {
    return { updated: false, walletTransactionId: null };
  }
  if (!suffix || suffix.length < 4 || suffix.length > 32) {
    return { updated: false, walletTransactionId: null };
  }
  if (!/^[a-z0-9_-]+$/.test(suffix)) {
    return { updated: false, walletTransactionId: null };
  }

  const debit = await prisma.walletTransaction.findFirst({
    where: {
      type: WalletTransactionType.PURCHASE_DEBIT,
      status: WalletTransactionStatus.PENDING,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
      referenceId: { endsWith: suffix },
      wallet: { userId: customerUserId },
    },
    select: { id: true },
  });
  if (!debit) {
    return { updated: false, walletTransactionId: null };
  }

  const updated = await forceReverseReleasedPurchaseDebit({
    walletTransactionId: debit.id,
    customerUserId,
  });
  return { updated, walletTransactionId: debit.id };
}

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

  const debitId = debit.id;
  const ownerCustomerId = customer.id;

  async function markAlreadyReleased(): Promise<VoidPendingWalletReservationResult> {
    // UI message "already released" must always leave debit REVERSED — never Pending.
    await forceReverseReleasedPurchaseDebit({
      walletTransactionId: debitId,
      customerUserId: ownerCustomerId,
    });
    return {
      ok: true,
      refundTransactionId: null,
      alreadyReleased: true,
    };
  }

  // One-time / idempotent heal for already-released rows (e.g. …hzh8bfhx)
  // still showing PENDING after a prior release_gw credit.
  if (debit.status === WalletTransactionStatus.PENDING) {
    const healed = await healReleasedPendingPurchaseDebit({
      walletTransactionId: debit.id,
      customerUserId: customer.id,
    });
    if (healed.healed) {
      return markAlreadyReleased();
    }
  }

  if (debit.status !== WalletTransactionStatus.PENDING) {
    return {
      ok: true,
      refundTransactionId: null,
      alreadyReleased: true,
    };
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
    // Debit unlinked from purchase — reservation already released; force badge.
    return markAlreadyReleased();
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
    const healed = await healReleasedPendingPurchaseDebit({
      walletTransactionId: debit.id,
      customerUserId: customer.id,
    });
    if (healed.healed) {
      return markAlreadyReleased();
    }
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
      await forceReverseReleasedPurchaseDebit({
        walletTransactionId: debitId,
        customerUserId: ownerCustomerId,
      });
      scheduleWalletTransactionNotification(createdRefundId);
      return {
        ok: true,
        refundTransactionId: createdRefundId,
        alreadyReleased: false,
      };
    }

    // already_refunded / linked_existing — force REVERSED so UI cannot stay Pending.
    return markAlreadyReleased();
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
