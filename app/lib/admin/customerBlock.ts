/**
 * Admin Block / Reactivate customer (Model 2).
 * Durable CAS on accountStatusVersion. History via AuditLog only.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { resolveCustomerAccountStatus } from "@/app/lib/auth/customerAccountStatus";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";

export const CUSTOMER_BLOCKED_AUDIT = "customer.blocked";
export const CUSTOMER_REACTIVATED_AUDIT = "customer.reactivated";
export const CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT =
  "customer.block_action_blocked";

const REASON_MIN = 8;
const REASON_MAX = 500;

/** Thrown inside $transaction when CAS updateMany matches 0 rows. */
class CustomerBlockCasConflictError extends Error {
  constructor() {
    super("customer_block_cas_conflict");
    this.name = "CustomerBlockCasConflictError";
  }
}

export type CustomerBlockMutationResult =
  | {
      ok: true;
      message: string;
      accountStatusVersion: number;
      accountStatusLabel: "ACTIVE" | "BLOCKED";
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"reason" | "expectedVersion", string>>;
    };

function parseReason(raw: FormDataEntryValue | string | null | undefined): {
  ok: true;
  reason: string;
} | {
  ok: false;
  error: string;
} {
  const reason = String(raw ?? "").trim();
  if (reason.length < REASON_MIN) {
    return {
      ok: false,
      error: `Reason must be at least ${REASON_MIN} characters.`,
    };
  }
  if (reason.length > REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

function parseExpectedVersion(
  raw: FormDataEntryValue | string | number | null | undefined
): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function requireActiveAdminActor(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    return null;
  }
  return admin;
}

/**
 * Block an ACTIVE customer. Sessions remain valid (Model 2).
 */
export async function blockCustomerAccount(options: {
  adminUserId: string;
  customerUserId: string;
  reason: FormDataEntryValue | string | null;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<CustomerBlockMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: options.customerUserId,
      metadata: { failureCode: "same_origin" },
    });
    return { ok: false, error: "This action could not be completed." };
  }

  const admin = await requireActiveAdminActor(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const customerUserId = (options.customerUserId ?? "").trim();
  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer not found." };
  }

  const reasonParsed = parseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null || expectedVersion < 0) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      blockedAt: true,
      accountStatusVersion: true,
    },
  });

  if (!customer || customer.role !== Role.CUSTOMER) {
    return { ok: false, error: "Customer not found." };
  }

  const previousStatus = resolveCustomerAccountStatus(customer);
  if (previousStatus === "DELETED") {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: customer.id,
      metadata: { failureCode: "deleted", previousStatus },
    });
    return {
      ok: false,
      error: "Deleted customers cannot be blocked.",
    };
  }
  if (previousStatus === "BLOCKED") {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: customer.id,
      metadata: { failureCode: "already_blocked", previousStatus },
    });
    return {
      ok: false,
      error: "This customer is already blocked.",
    };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;
  try {
    // CAS status change + success audit must commit together.
    // Do not use writeAuditLog here: it swallows errors and would leave a block without audit.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: customer.id,
          role: Role.CUSTOMER,
          deletedAt: null,
          blockedAt: null,
          accountStatusVersion: expectedVersion,
        },
        data: {
          blockedAt: now,
          blockedReason: reasonParsed.reason,
          blockedByAdminId: admin.id,
          accountStatusVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new CustomerBlockCasConflictError();
      }
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: CUSTOMER_BLOCKED_AUDIT,
          targetType: "user",
          targetId: customer.id,
          metadata: {
            reason: reasonParsed.reason,
            previousStatus,
            accountStatusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof CustomerBlockCasConflictError) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
        targetType: "user",
        targetId: customer.id,
        metadata: {
          failureCode: "stale_version",
          previousStatus,
          expectedVersion,
        },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Customer blocked.",
    accountStatusVersion: nextVersion,
    accountStatusLabel: "BLOCKED",
  };
}

/**
 * Reactivate a BLOCKED customer. Clears block fields; history remains in AuditLog.
 */
export async function reactivateCustomerAccount(options: {
  adminUserId: string;
  customerUserId: string;
  reason: FormDataEntryValue | string | null;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<CustomerBlockMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: options.customerUserId,
      metadata: { failureCode: "same_origin" },
    });
    return { ok: false, error: "This action could not be completed." };
  }

  const admin = await requireActiveAdminActor(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const customerUserId = (options.customerUserId ?? "").trim();
  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer not found." };
  }

  const reasonParsed = parseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null || expectedVersion < 0) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      blockedAt: true,
      accountStatusVersion: true,
    },
  });

  if (!customer || customer.role !== Role.CUSTOMER) {
    return { ok: false, error: "Customer not found." };
  }

  const previousStatus = resolveCustomerAccountStatus(customer);
  if (previousStatus === "DELETED") {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: customer.id,
      metadata: { failureCode: "deleted", previousStatus },
    });
    return {
      ok: false,
      error: "Deleted customers cannot be reactivated.",
    };
  }
  if (previousStatus === "ACTIVE") {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
      targetType: "user",
      targetId: customer.id,
      metadata: { failureCode: "already_active", previousStatus },
    });
    return {
      ok: false,
      error: "This customer is already active.",
    };
  }

  const nextVersion = expectedVersion + 1;
  try {
    // CAS status change + success audit must commit together.
    // Do not use writeAuditLog here: it swallows errors and would leave a reactivation without audit.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: customer.id,
          role: Role.CUSTOMER,
          deletedAt: null,
          blockedAt: { not: null },
          accountStatusVersion: expectedVersion,
        },
        data: {
          blockedAt: null,
          blockedReason: null,
          blockedByAdminId: null,
          accountStatusVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new CustomerBlockCasConflictError();
      }
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: CUSTOMER_REACTIVATED_AUDIT,
          targetType: "user",
          targetId: customer.id,
          metadata: {
            reason: reasonParsed.reason,
            previousStatus,
            accountStatusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof CustomerBlockCasConflictError) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CUSTOMER_BLOCK_ACTION_BLOCKED_AUDIT,
        targetType: "user",
        targetId: customer.id,
        metadata: {
          failureCode: "stale_version",
          previousStatus,
          expectedVersion,
        },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Customer reactivated.",
    accountStatusVersion: nextVersion,
    accountStatusLabel: "ACTIVE",
  };
}
