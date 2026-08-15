/**
 * PostgreSQL xact advisory lock + ACTIVE admin counting for Admin Users mutations.
 * Pure DB helpers (no server-only) so concurrency QA can import them.
 */
import { Prisma, Role, type PrismaClient } from "@prisma/client";

/** Fixed app-owned lock pair (class, obj) for admin-status mutations. */
export const ADMIN_STATUS_LOCK_CLASS = 774201;
export const ADMIN_STATUS_LOCK_OBJ = 1001;

export type AdminStatusTx = Pick<
  Prisma.TransactionClient,
  "$executeRaw" | "user" | "session" | "auditLog"
>;

export async function acquireAdminStatusXactLock(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">
): Promise<void> {
  // Two-arg form requires int4. Embed fixed app keys as literals (not bigint params).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(774201, 1001)`;
}

/** ACTIVE admin for last-admin invariant (INVITED does not count). */
export function activeAdminWhere(): Prisma.UserWhereInput {
  return {
    role: Role.ADMIN,
    deletedAt: null,
    adminDisabledAt: null,
    passwordHash: { not: null },
    emailVerifiedAt: { not: null },
  };
}

export async function countActiveAdminsTx(
  tx: Pick<Prisma.TransactionClient, "user">
): Promise<number> {
  return tx.user.count({ where: activeAdminWhere() });
}

/**
 * After advisory lock: disable an ACTIVE admin with CAS + last-ACTIVE guard.
 * Caller must already forbid self-deactivate.
 */
export async function disableActiveAdminUnderLock(
  tx: AdminStatusTx,
  options: {
    actorId: string;
    targetId: string;
    expectedVersion: number;
    now: Date;
  }
): Promise<"ok" | "last_active" | "cas_conflict"> {
  await acquireAdminStatusXactLock(tx);

  const activeCount = await countActiveAdminsTx(tx);
  if (activeCount <= 1) {
    return "last_active";
  }

  const updated = await tx.user.updateMany({
    where: {
      id: options.targetId,
      role: Role.ADMIN,
      deletedAt: null,
      adminDisabledAt: null,
      adminStatusVersion: options.expectedVersion,
      passwordHash: { not: null },
      emailVerifiedAt: { not: null },
      NOT: { id: options.actorId },
    },
    data: {
      adminDisabledAt: options.now,
      adminStatusVersion: { increment: 1 },
      adminSessionVersion: { increment: 1 },
      credentialsChangedAt: options.now,
    },
  });

  if (updated.count !== 1) {
    return "cas_conflict";
  }
  return "ok";
}

/** Concurrent QA helper: run disableActiveAdminUnderLock in a fresh transaction. */
export async function runDisableActiveAdminTransaction(
  client: PrismaClient,
  options: {
    actorId: string;
    targetId: string;
    expectedVersion: number;
    now?: Date;
  }
): Promise<"ok" | "last_active" | "cas_conflict"> {
  return client.$transaction(async (tx) => {
    return disableActiveAdminUnderLock(tx, {
      actorId: options.actorId,
      targetId: options.targetId,
      expectedVersion: options.expectedVersion,
      now: options.now ?? new Date(),
    });
  });
}
