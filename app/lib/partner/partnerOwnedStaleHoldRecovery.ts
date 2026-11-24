/**
 * On-demand Partner wallet-hold recovery for portal visits.
 * Releases idle unpaid split / full-wallet reservations for the signed-in
 * partner only. Idempotent via existing CAS + debit-scoped release keys.
 * Never funds purchases and never calls VeSIM.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { expireStalePartnerGatewayPaymentAttempt } from "@/app/lib/partner/partnerEsimPurchasePaymentApply";
import {
  isPartnerGatewayAttemptStale,
  resolvePartnerGatewayStaleIdleMs,
  resolvePartnerGatewayStaleMaxAgeMs,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayStaleShared";
import { PARTNER_FULL_WALLET_STALE_IDLE_MS } from "@/app/lib/partner/partnerEsimPurchaseFullWalletStaleRelease";
import { releasePartnerFullWalletStaleReservationInTx } from "@/app/lib/partner/partnerPurchaseWallet";

const ON_DEMAND_GATEWAY_TAKE = 8;
const ON_DEMAND_FULL_WALLET_TAKE = 5;

export type PartnerOwnedStaleHoldRecoveryResult = {
  ok: boolean;
  gatewayReleased: number;
  fullWalletReleased: number;
};

function resolveFullWalletIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.PARTNER_FULL_WALLET_STALE_IDLE_MS ?? "").trim();
  if (!raw) return PARTNER_FULL_WALLET_STALE_IDLE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000 || parsed > 86_400_000) {
    return PARTNER_FULL_WALLET_STALE_IDLE_MS;
  }
  return Math.floor(parsed);
}

/**
 * Lightweight per-partner stale hold recovery. Safe to call from RSC loaders.
 * Never throws to callers. Double-refunds are impossible: release paths CAS the
 * purchase status and use unique debit-scoped refund idempotency keys.
 */
export async function recoverPartnerOwnedStaleWalletHolds(
  partnerUserId: string
): Promise<PartnerOwnedStaleHoldRecoveryResult> {
  const userId = (partnerUserId ?? "").trim();
  if (!userId || userId.length > 64) {
    return { ok: false, gatewayReleased: 0, fullWalletReleased: 0 };
  }

  let gatewayReleased = 0;
  let fullWalletReleased = 0;

  try {
    const actor = await requireActivePartnerActor(userId);
    if (!actor) {
      return { ok: true, gatewayReleased: 0, fullWalletReleased: 0 };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const idleMs = resolvePartnerGatewayStaleIdleMs();
    const maxAgeMs = resolvePartnerGatewayStaleMaxAgeMs();
    const staleBefore = new Date(nowMs - idleMs);
    const maxAgeAfter = new Date(nowMs - maxAgeMs);

    const gatewayAttempts =
      await prisma.partnerEsimPurchasePaymentAttempt.findMany({
        where: {
          status: {
            in: [
              EsimPurchasePaymentAttemptStatus.DRAFT,
              EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
              EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
            ],
          },
          webhookEventId: null,
          purchase: {
            partnerId: actor.partnerId,
            status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
            debitTransactionId: { not: null },
            walletAppliedCents: { gt: 0 },
          },
          updatedAt: { gte: maxAgeAfter },
          OR: [
            { expiresAt: { lte: now } },
            { updatedAt: { lte: staleBefore } },
          ],
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: ON_DEMAND_GATEWAY_TAKE,
        select: {
          id: true,
          updatedAt: true,
          expiresAt: true,
        },
      });

    for (const row of gatewayAttempts) {
      if (
        !isPartnerGatewayAttemptStale({
          nowMs,
          updatedAt: row.updatedAt,
          expiresAt: row.expiresAt,
          idleMs,
          maxAgeMs,
        })
      ) {
        continue;
      }
      try {
        const result = await expireStalePartnerGatewayPaymentAttempt({
          attemptId: row.id,
        });
        if (result.released) gatewayReleased += 1;
      } catch {
        // Keep scanning siblings; never fail the page load.
      }
    }

    const fullIdleMs = resolveFullWalletIdleMs();
    const fullStaleBefore = new Date(nowMs - fullIdleMs);
    const fullRows = await prisma.partnerEsimPurchase.findMany({
      where: {
        partnerId: actor.partnerId,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        gatewayAmountCents: 0,
        orderId: null,
        providerOrderId: null,
        debitTransactionId: { not: null },
        walletAppliedCents: { gt: 0 },
        status: {
          in: [
            PartnerEsimPurchaseStatus.PROVIDER_PENDING,
            PartnerEsimPurchaseStatus.FUNDS_RESERVED,
            PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          ],
        },
        updatedAt: { lte: fullStaleBefore },
        AND: [
          {
            OR: [
              { providerResultKind: null },
              { providerResultKind: { not: "success" } },
            ],
          },
          {
            OR: [
              { providerRefreshClaimedAt: null },
              { providerRefreshClaimedAt: { lte: fullStaleBefore } },
            ],
          },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: ON_DEMAND_FULL_WALLET_TAKE,
      select: {
        id: true,
        partnerId: true,
        walletAppliedCents: true,
        debitTransactionId: true,
      },
    });

    for (const row of fullRows) {
      const debitId = (row.debitTransactionId ?? "").trim();
      const amount = row.walletAppliedCents;
      if (!debitId || !Number.isInteger(amount) || amount <= 0) continue;

      const debit = await prisma.partnerWalletTransaction.findUnique({
        where: { id: debitId },
        select: { id: true, type: true },
      });
      if (
        !debit ||
        debit.type !== PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT
      ) {
        continue;
      }

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
        if (released) fullWalletReleased += 1;
      } catch {
        // Keep scanning siblings.
      }
    }

    if (gatewayReleased > 0 || fullWalletReleased > 0) {
      console.info("partner_owned_stale_hold_recovery", {
        partnerId: actor.partnerId,
        gatewayReleased,
        fullWalletReleased,
        idleMs,
        fullIdleMs,
      });
    }

    return { ok: true, gatewayReleased, fullWalletReleased };
  } catch (error) {
    console.error("partner_owned_stale_hold_recovery_failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, gatewayReleased, fullWalletReleased };
  }
}
