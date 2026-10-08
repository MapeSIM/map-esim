/**
 * Auto-release stuck Partner full-wallet reservations that never produced an Order.
 * Never funds purchases and never calls VeSIM.
 *
 * Eligible when:
 * - status ∈ PROVIDER_PENDING | FUNDS_RESERVED | RECONCILIATION_REQUIRED
 * - fundingSource = PARTNER_BALANCE
 * - gatewayAmountCents = 0
 * - no orderId / no providerOrderId / providerResultKind ≠ success
 * - debit still linked
 * - updatedAt older than idle window (default 5 minutes)
 * - provider claim null or also older than idle (never cut mid-flight)
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { releasePartnerFullWalletStaleReservationInTx } from "@/app/lib/partner/partnerPurchaseWallet";

export const PARTNER_FULL_WALLET_STALE_IDLE_MS = 5 * 60 * 1000;
export const PARTNER_FULL_WALLET_STALE_BATCH_SIZE = 25;

export type PartnerFullWalletStaleReleaseResult = {
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
  const raw = (env.PARTNER_FULL_WALLET_STALE_IDLE_MS ?? "").trim();
  if (!raw) return PARTNER_FULL_WALLET_STALE_IDLE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000 || parsed > 86_400_000) {
    return PARTNER_FULL_WALLET_STALE_IDLE_MS;
  }
  return Math.floor(parsed);
}

export async function runPartnerFullWalletStaleReservationRelease(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<PartnerFullWalletStaleReleaseResult> {
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
    const rows = await prisma.partnerEsimPurchase.findMany({
      where: {
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        gatewayAmountCents: 0,
        orderId: null,
        providerOrderId: null,
        debitTransactionId: { not: null },
        status: {
          in: [
            PartnerEsimPurchaseStatus.PROVIDER_PENDING,
            PartnerEsimPurchaseStatus.FUNDS_RESERVED,
            PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          ],
        },
        NOT: { providerResultKind: "success" },
        updatedAt: { lte: staleBefore },
        OR: [
          { providerRefreshClaimedAt: null },
          { providerRefreshClaimedAt: { lte: staleBefore } },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: PARTNER_FULL_WALLET_STALE_BATCH_SIZE,
      select: {
        id: true,
        partnerId: true,
        walletAppliedCents: true,
        debitTransactionId: true,
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

      const debit = await prisma.partnerWalletTransaction.findUnique({
        where: { id: debitId },
        select: { id: true, type: true },
      });
      if (
        !debit ||
        debit.type !== PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT
      ) {
        counts.skipped += 1;
        continue;
      }

      counts.eligible += 1;
      if (dryRun) continue;

      try {
        let released = false;
        await prisma.$transaction(async (tx) => {
          const result = await releasePartnerFullWalletStaleReservationInTx(tx, {
            partnerId: row.partnerId,
            partnerEsimPurchaseId: row.id,
            amountCents: amount,
          });
          if (
            result.outcome === "created" ||
            result.outcome === "linked_existing"
          ) {
            released = true;
          }
        });
        if (released) {
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
      errorCode: "partner_full_wallet_stale_release_failed",
    };
  }
}
