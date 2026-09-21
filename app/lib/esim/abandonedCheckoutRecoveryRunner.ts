/**
 * Cron runner: find idle unfinished self-serve checkouts and trigger
 * once-only abandoned-checkout recovery emails.
 * Never mutates payment, wallet, pricing, or checkout state.
 *
 * Per run: at most one email per customer (newest idle purchase by updatedAt).
 * Sibling abandoned purchases in the same batch are not scheduled.
 */
import "server-only";

import { WalletEsimPurchaseStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  ABANDONED_CHECKOUT_EMAIL_FAILED,
  ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED,
} from "@/app/lib/esim/abandonedCheckoutEmailClaim";
import { scheduleAbandonedCheckoutNotification } from "@/app/lib/esim/abandonedCheckoutNotification";
import {
  ABANDONED_CHECKOUT_BATCH_SIZE,
  coalesceAbandonedCheckoutCandidatesByCustomer,
  resolveAbandonedCheckoutIdleMs,
  resolveAbandonedCheckoutMaxAgeMs,
  type AbandonedCheckoutCandidateRef,
} from "@/app/lib/esim/abandonedCheckoutRecoveryShared";

export type AbandonedCheckoutRecoveryRunCounts = {
  /** Raw eligible purchase rows before per-customer coalescing. */
  candidates: number;
  /** Purchases scheduled after coalescing (≤ one per customer). */
  scheduled: number;
  /** Sibling purchases dropped so the same customer is not emailed twice. */
  coalescedSkipped: number;
  /** Coalesced candidates listed but not scheduled (dry-run mode). */
  dryRunListed: number;
};

export type AbandonedCheckoutRecoveryRunResult = {
  ok: boolean;
  counts: AbandonedCheckoutRecoveryRunCounts;
  idleMs: number;
  maxAgeMs: number;
  errorCode?: string;
};

function emptyCounts(): AbandonedCheckoutRecoveryRunCounts {
  return {
    candidates: 0,
    scheduled: 0,
    coalescedSkipped: 0,
    dryRunListed: 0,
  };
}

/**
 * Select self-serve WalletEsimPurchase rows idle past the threshold and not
 * already claimed as sent/skipped/sending.
 */
export async function listAbandonedCheckoutRecoveryCandidates(options: {
  now?: Date;
  take?: number;
  idleMs?: number;
  maxAgeMs?: number;
}): Promise<AbandonedCheckoutCandidateRef[]> {
  const now = options.now instanceof Date ? options.now : new Date();
  const idleMs = options.idleMs ?? resolveAbandonedCheckoutIdleMs();
  const maxAgeMs = options.maxAgeMs ?? resolveAbandonedCheckoutMaxAgeMs();
  const take = Math.min(
    Math.max(1, options.take ?? ABANDONED_CHECKOUT_BATCH_SIZE),
    100
  );

  const idleBefore = new Date(now.getTime() - idleMs);
  const notOlderThan = new Date(now.getTime() - maxAgeMs);

  const rows = await prisma.walletEsimPurchase.findMany({
    where: {
      adminUserId: null,
      status: {
        in: [
          WalletEsimPurchaseStatus.READY,
          WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        ],
      },
      updatedAt: {
        lte: idleBefore,
        gte: notOlderThan,
      },
      OR: [
        { abandonedCheckoutEmailNotificationStatus: null },
        {
          abandonedCheckoutEmailNotificationStatus: {
            in: [
              ABANDONED_CHECKOUT_EMAIL_FAILED,
              ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED,
            ],
          },
        },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true, customerUserId: true, updatedAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    customerUserId: row.customerUserId,
    updatedAt: row.updatedAt,
  }));
}

export async function runAbandonedCheckoutRecovery(options?: {
  now?: Date;
  take?: number;
  dryRun?: boolean;
}): Promise<AbandonedCheckoutRecoveryRunResult> {
  const idleMs = resolveAbandonedCheckoutIdleMs();
  const maxAgeMs = resolveAbandonedCheckoutMaxAgeMs();
  const counts = emptyCounts();
  const dryRun = Boolean(options?.dryRun);

  try {
    const candidates = await listAbandonedCheckoutRecoveryCandidates({
      now: options?.now,
      take: options?.take,
      idleMs,
      maxAgeMs,
    });
    counts.candidates = candidates.length;

    const coalesced = coalesceAbandonedCheckoutCandidatesByCustomer(candidates);
    counts.coalescedSkipped = Math.max(
      0,
      candidates.length - coalesced.length
    );

    for (const row of coalesced) {
      if (dryRun) {
        counts.dryRunListed += 1;
        continue;
      }
      scheduleAbandonedCheckoutNotification(row.id);
      counts.scheduled += 1;
    }

    console.info("abandoned_checkout_recovery", {
      ok: true,
      dryRun,
      idleMs,
      maxAgeMs,
      ...counts,
    });

    return { ok: true, counts, idleMs, maxAgeMs };
  } catch (error) {
    console.error("abandoned_checkout_recovery", "runner_error", error);
    return {
      ok: false,
      counts,
      idleMs,
      maxAgeMs,
      errorCode: "runner_error",
    };
  }
}
