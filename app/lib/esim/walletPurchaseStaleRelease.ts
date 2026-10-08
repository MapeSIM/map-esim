/**
 * Auto-release stuck full-wallet reservations that never produced an Order.
 * Never funds purchases and never calls VeSIM.
 *
 * Eligible when:
 * - status ∈ PROVIDER_PENDING | FUNDS_RESERVED
 * - fundingSource = CUSTOMER_WALLET (gatewayAmountCents = 0)
 * - no orderId / no providerOrderId / providerResultKind ≠ success
 * - debit still linked
 * - updatedAt older than idle window (default 5 minutes)
 */
import "server-only";

import {
  OrderFundingSource,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { refundReservedFundsInTx } from "@/app/lib/esim/walletPurchase";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const FULL_WALLET_STALE_IDLE_MS = 5 * 60 * 1000;
export const FULL_WALLET_STALE_BATCH_SIZE = 25;

export type FullWalletStaleReleaseResult = {
  ok: boolean;
  counts: {
    scanned: number;
    eligible: number;
    released: number;
    skipped: number;
    errors: number;
  };
  idleMs: number;
  errorCode?: string;
};

function resolveIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.FULL_WALLET_STALE_IDLE_MS ?? "").trim();
  if (!raw) return FULL_WALLET_STALE_IDLE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000 || parsed > 86_400_000) {
    return FULL_WALLET_STALE_IDLE_MS;
  }
  return Math.floor(parsed);
}

export async function runFullWalletStaleReservationRelease(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<FullWalletStaleReleaseResult> {
  const dryRun = Boolean(options?.dryRun);
  const now = options?.now ?? new Date();
  const idleMs = resolveIdleMs();
  const staleBefore = new Date(now.getTime() - idleMs);
  const counts = {
    scanned: 0,
    eligible: 0,
    released: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const rows = await prisma.walletEsimPurchase.findMany({
      where: {
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
        gatewayAmountCents: 0,
        orderId: null,
        providerOrderId: null,
        debitTransactionId: { not: null },
        status: {
          in: [
            WalletEsimPurchaseStatus.PROVIDER_PENDING,
            WalletEsimPurchaseStatus.FUNDS_RESERVED,
          ],
        },
        NOT: { providerResultKind: "success" },
        updatedAt: { lte: staleBefore },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: FULL_WALLET_STALE_BATCH_SIZE,
      select: {
        id: true,
        customerUserId: true,
        walletAppliedCents: true,
        debitTransactionId: true,
        adminUserId: true,
        updatedAt: true,
      },
    });

    counts.scanned = rows.length;

    for (const row of rows) {
      const debitId = (row.debitTransactionId ?? "").trim();
      const amount = row.walletAppliedCents;
      if (!debitId || !Number.isInteger(amount) || amount <= 0) {
        counts.skipped += 1;
        continue;
      }

      const debit = await prisma.walletTransaction.findUnique({
        where: { id: debitId },
        select: { status: true },
      });
      if (!debit || debit.status !== WalletTransactionStatus.PENDING) {
        counts.skipped += 1;
        continue;
      }

      counts.eligible += 1;
      if (dryRun) continue;

      try {
        let createdRefundId: string | null = null;
        await prisma.$transaction(async (tx) => {
          const result = await refundReservedFundsInTx(tx, {
            purchaseId: row.id,
            customerUserId: row.customerUserId,
            actorUserId: row.customerUserId,
            assisted: Boolean(row.adminUserId),
            priceCents: amount,
            restoreReady: true,
          });
          if (result.outcome === "created") {
            createdRefundId = result.refundTransactionId;
          }
        });
        if (createdRefundId) {
          scheduleWalletTransactionNotification(createdRefundId);
          counts.released += 1;
        } else {
          counts.skipped += 1;
        }
      } catch {
        counts.errors += 1;
      }
    }

    return { ok: true, counts, idleMs };
  } catch {
    return {
      ok: false,
      counts,
      idleMs,
      errorCode: "full_wallet_stale_release_failed",
    };
  }
}
