/**
 * Cron runner: find idle unfinished self-serve checkouts and trigger
 * once-only abandoned-checkout recovery emails.
 * Never mutates payment, wallet, pricing, or checkout state.
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
  resolveAbandonedCheckoutIdleMs,
  resolveAbandonedCheckoutMaxAgeMs,
} from "@/app/lib/esim/abandonedCheckoutRecoveryShared";

export type AbandonedCheckoutRecoveryRunCounts = {
  candidates: number;
  scheduled: number;
  /** Candidates listed but not scheduled (dry-run mode). */
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
  return { candidates: 0, scheduled: 0, dryRunListed: 0 };
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
}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const idleMs = options.idleMs ?? resolveAbandonedCheckoutIdleMs();
  const maxAgeMs = options.maxAgeMs ?? resolveAbandonedCheckoutMaxAgeMs();
  const take = Math.min(
    Math.max(1, options.take ?? ABANDONED_CHECKOUT_BATCH_SIZE),
    100
  );

  const idleBefore = new Date(now.getTime() - idleMs);
  const notOlderThan = new Date(now.getTime() - maxAgeMs);

  return prisma.walletEsimPurchase.findMany({
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
    select: { id: true },
  });
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

    for (const row of candidates) {
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
