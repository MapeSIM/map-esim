/**
 * Customer eSIM gateway stale/expired reservation recovery runner.
 * Releases reserved customer wallet amounts for abandoned / expired attempts.
 * Never funds purchases and never calls VeSIM.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { expireStaleCustomerGatewayPaymentAttempt } from "@/app/lib/esim/esimPurchasePaymentApply";
import {
  CUSTOMER_GATEWAY_STALE_ATTEMPT_STATUSES,
  CUSTOMER_GATEWAY_STALE_BATCH_SIZE,
  isCustomerGatewayAttemptStale,
  resolveCustomerGatewayStaleIdleMs,
  resolveCustomerGatewayStaleMaxAgeMs,
} from "@/app/lib/esim/esimPurchaseGatewayStaleShared";

export type CustomerGatewayStaleRecoveryResult = {
  ok: boolean;
  counts: {
    scanned: number;
    eligible: number;
    released: number;
    skipped: number;
    errors: number;
  };
  idleMs: number;
  maxAgeMs: number;
  errorCode?: string;
};

export async function runCustomerGatewayStaleReservationRecovery(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<CustomerGatewayStaleRecoveryResult> {
  const dryRun = Boolean(options?.dryRun);
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const idleMs = resolveCustomerGatewayStaleIdleMs();
  const maxAgeMs = resolveCustomerGatewayStaleMaxAgeMs();
  const staleBefore = new Date(nowMs - idleMs);
  const maxAgeAfter = new Date(nowMs - maxAgeMs);

  const counts = {
    scanned: 0,
    eligible: 0,
    released: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const rows = await prisma.esimPurchasePaymentAttempt.findMany({
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
          status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        },
        updatedAt: { gte: maxAgeAfter },
        OR: [
          { expiresAt: { lte: now } },
          { updatedAt: { lte: staleBefore } },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: CUSTOMER_GATEWAY_STALE_BATCH_SIZE,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        updatedAt: true,
        purchaseId: true,
      },
    });

    counts.scanned = rows.length;

    for (const row of rows) {
      if (
        !CUSTOMER_GATEWAY_STALE_ATTEMPT_STATUSES.includes(
          row.status as (typeof CUSTOMER_GATEWAY_STALE_ATTEMPT_STATUSES)[number]
        ) ||
        !isCustomerGatewayAttemptStale({
          nowMs,
          updatedAt: row.updatedAt,
          expiresAt: row.expiresAt,
          idleMs,
          maxAgeMs,
        })
      ) {
        counts.skipped += 1;
        continue;
      }

      counts.eligible += 1;
      if (dryRun) continue;

      try {
        const result = await expireStaleCustomerGatewayPaymentAttempt({
          attemptId: row.id,
        });
        if (result.released) {
          counts.released += 1;
        } else {
          counts.skipped += 1;
        }
      } catch {
        counts.errors += 1;
      }
    }

    return { ok: true, counts, idleMs, maxAgeMs };
  } catch {
    return {
      ok: false,
      counts,
      idleMs,
      maxAgeMs,
      errorCode: "SCAN_FAILED",
    };
  }
}
