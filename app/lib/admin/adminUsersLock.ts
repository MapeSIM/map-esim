/**
 * PostgreSQL xact advisory lock + ACTIVE admin counting for Admin Users mutations.
 * Pure DB helpers (no server-only) so concurrency QA can import them.
 */
import { AdminTeamRole, Prisma, Role, type PrismaClient } from "@prisma/client";

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

export function activeSuperAdminWhere(): Prisma.UserWhereInput {
  return {
    ...activeAdminWhere(),
    adminTeamRole: AdminTeamRole.SUPER_ADMIN,
  };
}

export async function countActiveSuperAdminsTx(
  tx: Pick<Prisma.TransactionClient, "user">
): Promise<number> {
  return tx.user.count({ where: activeSuperAdminWhere() });
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

  const target = await tx.user.findUnique({
    where: { id: options.targetId },
    select: { adminTeamRole: true },
  });
  if (target?.adminTeamRole === AdminTeamRole.SUPER_ADMIN) {
    const activeCount = await countActiveSuperAdminsTx(tx);
    if (activeCount <= 1) {
      return "last_active";
    }
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

/**
 * One-statement role save: advisory lock, last-SUPER_ADMIN guard, CAS role
 * update, permission-grant reset, and audit. Avoids interactive $transaction
 * round-trips that expire on Prisma Accelerate (P2028).
 */
export async function assignAdminTeamRoleAtomic(
  client: Pick<PrismaClient, "$queryRaw">,
  options: {
    targetId: string;
    expectedVersion: number;
    teamRole: AdminTeamRole;
    actorId: string;
    auditId: string;
    action: string;
    previousRole: AdminTeamRole;
    previousStatus: string;
    nextVersion: number;
  }
): Promise<{
  updatedCount: number;
  activeSuperCount: number;
  currentVersion: number | null;
}> {
  const teamRoleSql = Prisma.raw(`'${options.teamRole}'::"AdminTeamRole"`);
  const teamRoleCompareSql = Prisma.raw(
    `'${options.teamRole}'::"AdminTeamRole"`
  );
  const metadataSql = Prisma.raw(
    `'${JSON.stringify({
      previousRole: options.previousRole,
      teamRole: options.teamRole,
      previousStatus: options.previousStatus,
      adminStatusVersion: options.nextVersion,
    }).replace(/\\/g, "\\\\").replace(/'/g, "''")}'::jsonb`
  );

  const rows = await client.$queryRaw<
    Array<{
      updated_count: bigint | number;
      active_super_count: bigint | number;
      current_version: bigint | number | null;
    }>
  >`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(774201, 1001) AS acquired
    ),
    active_supers AS (
      SELECT COUNT(*)::int AS n
      FROM "User"
      WHERE role = 'ADMIN'::"Role"
        AND "deletedAt" IS NULL
        AND "adminDisabledAt" IS NULL
        AND "passwordHash" IS NOT NULL
        AND "emailVerifiedAt" IS NOT NULL
        AND "adminTeamRole" = 'SUPER_ADMIN'::"AdminTeamRole"
    ),
    updated AS (
      UPDATE "User" AS u
      SET
        "adminTeamRole" = ${teamRoleSql},
        "adminStatusVersion" = u."adminStatusVersion" + 1
      FROM locked, active_supers
      WHERE u.id = ${options.targetId}
        AND u.role = 'ADMIN'::"Role"
        AND u."deletedAt" IS NULL
        AND u."adminStatusVersion" = ${options.expectedVersion}
        AND (
          NOT (
            u."adminTeamRole" = 'SUPER_ADMIN'::"AdminTeamRole"
            AND ${teamRoleCompareSql} <> 'SUPER_ADMIN'::"AdminTeamRole"
            AND u."adminDisabledAt" IS NULL
            AND u."passwordHash" IS NOT NULL
            AND u."emailVerifiedAt" IS NOT NULL
          )
          OR active_supers.n > 1
        )
      RETURNING u.id
    ),
    cleared AS (
      DELETE FROM "AdminPermissionGrant" AS g
      USING updated
      WHERE g."userId" = updated.id
      RETURNING g.id
    ),
    audited AS (
      INSERT INTO "AuditLog" (
        "id",
        "actorUserId",
        "action",
        "targetType",
        "targetId",
        "metadata",
        "createdAt"
      )
      SELECT
        ${options.auditId},
        ${options.actorId},
        ${options.action},
        'user',
        updated.id,
        ${metadataSql},
        NOW()
      FROM updated
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*)::int FROM updated) AS updated_count,
      (SELECT n FROM active_supers) AS active_super_count,
      (SELECT u."adminStatusVersion" FROM "User" u WHERE u.id = ${options.targetId}) AS current_version
  `;

  const row = rows[0];
  return {
    updatedCount: Number(row?.updated_count ?? 0),
    activeSuperCount: Number(row?.active_super_count ?? 0),
    currentVersion:
      row?.current_version == null ? null : Number(row.current_version),
  };
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
