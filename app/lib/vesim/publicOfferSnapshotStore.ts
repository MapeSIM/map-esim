/**
 * PostgreSQL last-good public offer snapshots (CAS + lease + advisory lock).
 * Pure DB helpers so isolated QA can pass a PrismaClient.
 */
import { Prisma, type PrismaClient, type PublicDestinationOfferSnapshot } from "@prisma/client";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import { logPublicOfferSnapshotFailure } from "@/app/lib/vesim/publicOfferSnapshotGuard";
import {
  PUBLIC_OFFER_SNAPSHOT_LEASE_MS,
  decidePublicOfferSnapshotWrite,
  normalizePublicSnapshotOffers,
  storedSnapshotIntegrityMatches,
  type PublicOfferSnapshotRowView,
} from "@/app/lib/vesim/publicOfferSnapshot";

/** Distinct from admin-status lock class 774201. */
export const PUBLIC_OFFER_SNAPSHOT_LOCK_CLASS = 774202;

export type SnapshotPrisma = PrismaClient;

function asOfferArray(value: Prisma.JsonValue | null): VesimOffer[] | null {
  if (!Array.isArray(value)) return null;
  return value as unknown as VesimOffer[];
}

function rowView(
  row: PublicDestinationOfferSnapshot
): PublicOfferSnapshotRowView {
  return {
    offerIds: row.offerIds,
    idFingerprint: row.idFingerprint,
    pendingIdFingerprint: row.pendingIdFingerprint,
    pendingConfirmCount: row.pendingConfirmCount,
    pendingFirstSeenAt: row.pendingFirstSeenAt,
  };
}

function acceptedWriteData(
  normalized: NonNullable<ReturnType<typeof normalizePublicSnapshotOffers>>,
  now: Date
) {
  return {
    offerIds: normalized.offerIds,
    offersJson: normalized.offers as unknown as Prisma.InputJsonValue,
    offerCount: normalized.offerCount,
    idFingerprint: normalized.idFingerprint,
    payloadFingerprint: normalized.payloadFingerprint,
    acceptedAt: now,
    providerCheckedAt: now,
    version: { increment: 1 },
    refreshClaimToken: null,
    refreshClaimedAt: null,
    refreshClaimExpiresAt: null,
    pendingOfferIds: [] as string[],
    pendingOffersJson: Prisma.DbNull,
    pendingOfferCount: null,
    pendingIdFingerprint: null,
    pendingPayloadFingerprint: null,
    pendingFirstSeenAt: null,
    pendingConfirmCount: 0,
  };
}

export async function acquireDestinationSnapshotLock(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  destinationCode: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(774202, hashtext(${destinationCode}))`;
}

export function isMissingSnapshotTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2021";
}

export function prismaErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : "unknown";
}

export async function readPublicOfferSnapshotControl(
  client: SnapshotPrisma
): Promise<
  | { ok: true; publicReadsOn: boolean }
  | { ok: false; missingTable: boolean; code: string }
> {
  try {
    const row = await client.publicOfferSnapshotControl.findUnique({
      where: { id: "default" },
      select: { publicReadsOn: true },
    });
    return { ok: true, publicReadsOn: row?.publicReadsOn === true };
  } catch (error) {
    const missingTable = isMissingSnapshotTableError(error);
    const code = prismaErrorCode(error);
    logPublicOfferSnapshotFailure(
      missingTable ? "missing_table" : "control_read",
      code
    );
    return { ok: false, missingTable, code };
  }
}

export async function readPublicDestinationOfferSnapshot(
  client: SnapshotPrisma,
  destinationCode: string
): Promise<PublicDestinationOfferSnapshot | null> {
  if (!destinationCode) return null;
  try {
    return await client.publicDestinationOfferSnapshot.findUnique({
      where: { destinationCode },
    });
  } catch (error) {
    if (isMissingSnapshotTableError(error)) {
      logPublicOfferSnapshotFailure("missing_table", prismaErrorCode(error));
      return null;
    }
    throw error;
  }
}

export function parseStoredPublicOffers(
  row: PublicDestinationOfferSnapshot | null
): VesimOffer[] | null {
  if (!row) return null;
  const offers = asOfferArray(row.offersJson);
  if (!offers) return null;
  if (
    !storedSnapshotIntegrityMatches({
      offers,
      offerIds: row.offerIds,
      offerCount: row.offerCount,
      idFingerprint: row.idFingerprint,
      payloadFingerprint: row.payloadFingerprint,
    })
  ) {
    return null;
  }
  const normalized = normalizePublicSnapshotOffers(offers);
  return normalized ? normalized.offers : null;
}

export function isPublicOfferSnapshotStale(
  row: PublicDestinationOfferSnapshot,
  now: Date,
  staleMs: number
): boolean {
  return now.getTime() - row.providerCheckedAt.getTime() >= staleMs;
}

export async function claimPublicOfferSnapshotLease(
  client: SnapshotPrisma,
  destinationCode: string,
  now: Date,
  leaseMs = PUBLIC_OFFER_SNAPSHOT_LEASE_MS
): Promise<{ ok: true; claimToken: string } | { ok: false }> {
  const claimToken = crypto.randomUUID();
  const claimExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await client.publicDestinationOfferSnapshot.updateMany({
    where: {
      destinationCode,
      OR: [
        { refreshClaimToken: null },
        { refreshClaimExpiresAt: null },
        { refreshClaimExpiresAt: { lte: now } },
      ],
    },
    data: {
      refreshClaimToken: claimToken,
      refreshClaimedAt: now,
      refreshClaimExpiresAt: claimExpiresAt,
    },
  });
  if (claimed.count !== 1) return { ok: false };
  return { ok: true, claimToken };
}

export async function releasePublicOfferSnapshotLease(
  client: SnapshotPrisma,
  destinationCode: string,
  claimToken: string
): Promise<void> {
  await client.publicDestinationOfferSnapshot.updateMany({
    where: { destinationCode, refreshClaimToken: claimToken },
    data: {
      refreshClaimToken: null,
      refreshClaimedAt: null,
      refreshClaimExpiresAt: null,
    },
  });
}

/**
 * Failure/backoff: bump providerCheckedAt so the next request does not stampede
 * VeSIM, and always drop our claim.
 */
export async function touchPublicOfferSnapshotCheck(
  client: SnapshotPrisma,
  options: {
    destinationCode: string;
    now: Date;
    claimToken?: string | null;
  }
): Promise<void> {
  await client.publicDestinationOfferSnapshot.updateMany({
    where: options.claimToken
      ? {
          destinationCode: options.destinationCode,
          refreshClaimToken: options.claimToken,
        }
      : { destinationCode: options.destinationCode },
    data: {
      providerCheckedAt: options.now,
      refreshClaimToken: null,
      refreshClaimedAt: null,
      refreshClaimExpiresAt: null,
    },
  });
}

export type ApplySnapshotResult = {
  outcome:
    | "inserted"
    | "accepted"
    | "pending"
    | "touched"
    | "cas_conflict"
    | "skipped_missing";
  reason: string;
  payloadReplaced: boolean;
  offers: VesimOffer[] | null;
};

async function insertAcceptedSnapshot(
  tx: Prisma.TransactionClient,
  destinationCode: string,
  normalized: NonNullable<ReturnType<typeof normalizePublicSnapshotOffers>>,
  now: Date
): Promise<ApplySnapshotResult> {
  await tx.publicDestinationOfferSnapshot.create({
    data: {
      destinationCode,
      offerIds: normalized.offerIds,
      offersJson: normalized.offers as unknown as Prisma.InputJsonValue,
      offerCount: normalized.offerCount,
      idFingerprint: normalized.idFingerprint,
      payloadFingerprint: normalized.payloadFingerprint,
      acceptedAt: now,
      providerCheckedAt: now,
      version: 0,
      pendingOfferIds: [],
      pendingConfirmCount: 0,
    },
  });
  return {
    outcome: "inserted",
    reason: "insert",
    payloadReplaced: true,
    offers: normalized.offers,
  };
}

/**
 * Seed/cold insert: write an accepted snapshot when no row exists.
 * Concurrent inserters: unique PK — loser is treated as skip.
 */
export async function insertPublicOfferSnapshotIfAbsent(
  client: SnapshotPrisma,
  options: {
    destinationCode: string;
    offers: VesimOffer[];
    now?: Date;
  }
): Promise<ApplySnapshotResult> {
  const now = options.now ?? new Date();
  const normalized = normalizePublicSnapshotOffers(options.offers);
  if (!normalized) {
    return {
      outcome: "touched",
      reason: "invalid",
      payloadReplaced: false,
      offers: null,
    };
  }

  try {
    return await client.$transaction(async (tx) => {
      await acquireDestinationSnapshotLock(tx, options.destinationCode);
      const existing = await tx.publicDestinationOfferSnapshot.findUnique({
        where: { destinationCode: options.destinationCode },
      });
      if (existing) {
        return {
          outcome: "skipped_missing" as const,
          reason: "already_seeded",
          payloadReplaced: false,
          offers: parseStoredPublicOffers(existing),
        };
      }
      return insertAcceptedSnapshot(
        tx,
        options.destinationCode,
        normalized,
        now
      );
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        outcome: "skipped_missing",
        reason: "already_seeded",
        payloadReplaced: false,
        offers: null,
      };
    }
    throw error;
  }
}

/**
 * Compare-and-update an existing row, or insert when current is absent (seed).
 * Empty/invalid/error never replace offersJson.
 */
export async function applyPublicOfferSnapshotCandidate(
  client: SnapshotPrisma,
  options: {
    destinationCode: string;
    candidate: VesimOffer[] | null;
    now?: Date;
    claimToken?: string | null;
    allowInsert?: boolean;
    error?: boolean;
  }
): Promise<ApplySnapshotResult> {
  const now = options.now ?? new Date();
  const destinationCode = options.destinationCode;

  if (options.error) {
    await touchPublicOfferSnapshotCheck(client, {
      destinationCode,
      now,
      claimToken: options.claimToken,
    });
    return {
      outcome: "touched",
      reason: "error",
      payloadReplaced: false,
      offers: null,
    };
  }

  return client.$transaction(async (tx) => {
    await acquireDestinationSnapshotLock(tx, destinationCode);
    const current = await tx.publicDestinationOfferSnapshot.findUnique({
      where: { destinationCode },
    });

    const decision = decidePublicOfferSnapshotWrite({
      current: current ? rowView(current) : null,
      candidate: options.candidate,
      now,
    });

    if (decision.action === "touch") {
      if (current) {
        await tx.publicDestinationOfferSnapshot.updateMany({
          where: {
            destinationCode,
            version: current.version,
            ...(options.claimToken
              ? { refreshClaimToken: options.claimToken }
              : {}),
          },
          data: {
            providerCheckedAt: now,
            refreshClaimToken: null,
            refreshClaimedAt: null,
            refreshClaimExpiresAt: null,
          },
        });
      }
      return {
        outcome: "touched" as const,
        reason: decision.reason,
        payloadReplaced: false,
        offers: parseStoredPublicOffers(current),
      };
    }

    if (!current) {
      if (!options.allowInsert || decision.action !== "accept") {
        return {
          outcome: "skipped_missing" as const,
          reason: "missing_row",
          payloadReplaced: false,
          offers: null,
        };
      }
      return insertAcceptedSnapshot(
        tx,
        destinationCode,
        decision.normalized,
        now
      );
    }

    if (decision.action === "accept") {
      const updated = await tx.publicDestinationOfferSnapshot.updateMany({
        where: {
          destinationCode,
          version: current.version,
        },
        data: acceptedWriteData(decision.normalized, now),
      });
      if (updated.count !== 1) {
        return {
          outcome: "cas_conflict" as const,
          reason: "cas_conflict",
          payloadReplaced: false,
          offers: parseStoredPublicOffers(current),
        };
      }
      return {
        outcome: "accepted" as const,
        reason: decision.reason,
        payloadReplaced: true,
        offers: decision.normalized.offers,
      };
    }

    const pendingFirstSeenAt = decision.reset
      ? now
      : current.pendingFirstSeenAt ?? now;
    const pendingUpdated = await tx.publicDestinationOfferSnapshot.updateMany({
      where: {
        destinationCode,
        version: current.version,
      },
      data: {
        providerCheckedAt: now,
        version: { increment: 1 },
        refreshClaimToken: null,
        refreshClaimedAt: null,
        refreshClaimExpiresAt: null,
        pendingOfferIds: decision.normalized.offerIds,
        pendingOffersJson: decision.normalized
          .offers as unknown as Prisma.InputJsonValue,
        pendingOfferCount: decision.normalized.offerCount,
        pendingIdFingerprint: decision.normalized.idFingerprint,
        pendingPayloadFingerprint: decision.normalized.payloadFingerprint,
        pendingFirstSeenAt,
        pendingConfirmCount: decision.nextConfirmCount,
      },
    });
    if (pendingUpdated.count !== 1) {
      return {
        outcome: "cas_conflict" as const,
        reason: "cas_conflict",
        payloadReplaced: false,
        offers: parseStoredPublicOffers(current),
      };
    }
    return {
      outcome: "pending" as const,
      reason: decision.reason,
      payloadReplaced: false,
      offers: parseStoredPublicOffers(current),
    };
  });
}
