/**
 * Admin Users management: invite / deactivate / reactivate / team access.
 * Portal login stays Role.ADMIN. Team access is permission-based.
 * History via AuditLog. No temp passwords.
 */
import "server-only";

import { AdminPermissionEffect, AdminTeamRole, Prisma, Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import {
  findActiveAdminActor,
  isActiveAdminForProtection,
  resolveAdminAccountStatus,
  type AdminAccountStatusLabel,
} from "@/app/lib/auth/adminAccess";
import { actorHasAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  ADMIN_TEAM_ROLE_LABELS,
  grantsFromPermissionSelection,
  parseAdminTeamRole,
  resolveAdminPermissions,
  type AdminTeamRoleName,
} from "@/app/lib/admin/adminPermissions";
import { isValidEmailFormat, normalizeEmail } from "@/app/lib/auth/email";
import {
  buildAdminInviteSetupUrl,
  mintAdminInviteSetupToken,
} from "@/app/lib/admin/adminInviteSetup";
import { sendAdminInviteEmail } from "@/app/lib/email/sendAdminInviteEmail";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import type { AdminUserListRow } from "@/app/lib/admin/adminUsersShared";
import {
  acquireAdminStatusXactLock,
  assignAdminTeamRoleAtomic,
  disableActiveAdminUnderLock,
} from "@/app/lib/admin/adminUsersLock";
import { randomUUID } from "node:crypto";

export type { AdminUserListRow } from "@/app/lib/admin/adminUsersShared";

export const ADMIN_INVITED_AUDIT = "admin.invited";
export const ADMIN_INVITATION_RESENT_AUDIT = "admin.invitation_resent";
export const ADMIN_DEACTIVATED_AUDIT = "admin.deactivated";
export const ADMIN_REACTIVATED_AUDIT = "admin.reactivated";
export const ADMIN_TEAM_ROLE_CHANGED_AUDIT = "admin.team_role_changed";
export const ADMIN_PERMISSIONS_CHANGED_AUDIT = "admin.permissions_changed";
export const ADMIN_MANAGEMENT_BLOCKED_AUDIT = "admin.management_action_blocked";

const NAME_MIN = 1;
const NAME_MAX = 120;

class AdminUsersCasConflictError extends Error {
  constructor() {
    super("admin_users_cas_conflict");
    this.name = "AdminUsersCasConflictError";
  }
}

class AdminUsersLastActiveError extends Error {
  constructor() {
    super("admin_users_last_active");
    this.name = "AdminUsersLastActiveError";
  }
}

/** Prisma Accelerate/interactive tx default is 5s; production P2028 exceeded that. */
const ADMIN_USERS_TX = { maxWait: 10_000, timeout: 20_000 } as const;

const ADMIN_USERS_TEMPORARY =
  "This update could not be completed. Please reload and try again.";

function isAdminUsersTxExpired(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  );
}

function unexpectedAdminUsersMutationResult(
  error: unknown
): AdminUsersMutationResult {
  console.error(
    "Admin users mutation failed:",
    isAdminUsersTxExpired(error)
      ? "P2028"
      : error instanceof Error
        ? error.name
        : "unknown"
  );
  return { ok: false, error: ADMIN_USERS_TEMPORARY };
}

export type AdminUsersMutationResult =
  | {
      ok: true;
      message: string;
      adminStatusVersion?: number;
      status?: AdminAccountStatusLabel;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<"name" | "email" | "expectedVersion" | "teamRole", string>
      >;
    };

async function requireAdminManager(
  actorUserId: string
): Promise<{ id: string } | null> {
  const actor = await findActiveAdminActor(actorUserId);
  if (!actor) return null;
  if (!(await actorHasAdminPermission(actor.id, "MANAGE_ADMINS"))) {
    return null;
  }
  return actor;
}

function formatLastAdminLogin(value: Date | null): string {
  if (!value) return "Never";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC"
  );
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

function parseName(raw: FormDataEntryValue | string | null | undefined): {
  ok: true;
  name: string;
} | {
  ok: false;
  error: string;
} {
  const name = String(raw ?? "").trim();
  if (name.length < NAME_MIN) {
    return { ok: false, error: "Name is required." };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be at most ${NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

async function auditBlocked(options: {
  actorUserId: string;
  targetId?: string | null;
  failureCode: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: options.actorUserId,
    action: ADMIN_MANAGEMENT_BLOCKED_AUDIT,
    targetType: "user",
    targetId: options.targetId ?? null,
    metadata: {
      failureCode: options.failureCode,
      ...(options.metadata && typeof options.metadata === "object"
        ? (options.metadata as Record<string, unknown>)
        : {}),
    },
  });
}

export async function listAdminUsers(actorUserId: string): Promise<AdminUserListRow[]> {
  const actor = await requireAdminManager(actorUserId);
  if (!actor) return [];

  const rows = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
      createdAt: true,
      adminStatusVersion: true,
      adminTeamRole: true,
      lastAdminLoginAt: true,
      adminPermissionGrants: {
        select: { permission: true, effect: true },
      },
    },
  });

  return rows.map((row) => {
    const resolved = resolveAdminAccountStatus(row);
    const status: AdminUserListRow["status"] =
      resolved === "OTHER" ? "DISABLED" : resolved;
    const permissions = [
      ...resolveAdminPermissions({
        teamRole: row.adminTeamRole,
        grants: row.adminPermissionGrants,
      }),
    ];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      status,
      createdAt: row.createdAt,
      adminStatusVersion: row.adminStatusVersion,
      isSelf: row.id === actorUserId,
      teamRole: row.adminTeamRole,
      teamRoleLabel: ADMIN_TEAM_ROLE_LABELS[row.adminTeamRole],
      lastAdminLoginLabel: formatLastAdminLogin(row.lastAdminLoginAt),
      permissions,
    };
  });
}

/**
 * Invite a new ADMIN by email. Sends a one-time password setup link (30 minutes).
 * Sets emailVerifiedAt so credentials login works after password is established (ACTIVE).
 * No temporary password. No numeric setup code.
 */
export async function inviteAdminUser(options: {
  adminUserId: string;
  name: FormDataEntryValue | string | null;
  email: FormDataEntryValue | string | null;
  teamRole?: FormDataEntryValue | string | null;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const teamRole = parseAdminTeamRole(options.teamRole) ?? "SUPPORT";
  if (options.teamRole != null && String(options.teamRole).trim() && !parseAdminTeamRole(options.teamRole)) {
    return {
      ok: false,
      error: "Select a valid team role.",
      fieldErrors: { teamRole: "Select a valid team role." },
    };
  }

  const nameParsed = parseName(options.name);
  if (!nameParsed.ok) {
    return {
      ok: false,
      error: nameParsed.error,
      fieldErrors: { name: nameParsed.error },
    };
  }

  const email = normalizeEmail(String(options.email ?? ""));
  if (!isValidEmailFormat(email)) {
    return {
      ok: false,
      error: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  });

  if (existing) {
    if (existing.deletedAt) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: existing.id,
        failureCode: "deleted_collision",
      });
      return {
        ok: false,
        error:
          "This email cannot be used for a new admin invitation. Contact support if you need help.",
      };
    }

    if (existing.role === Role.CUSTOMER) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: existing.id,
        failureCode: "customer_collision",
      });
      return {
        ok: false,
        error:
          "This email belongs to a customer account and cannot be invited as an admin.",
      };
    }

    if (existing.role === Role.ADMIN) {
      const status = resolveAdminAccountStatus(existing);
      if (status === "DISABLED") {
        await auditBlocked({
          actorUserId: actor.id,
          targetId: existing.id,
          failureCode: "disabled_use_reactivate",
          metadata: { previousStatus: status },
        });
        return {
          ok: false,
          error: "This admin is disabled. Use Reactivate instead of inviting again.",
        };
      }
      if (status === "ACTIVE") {
        await auditBlocked({
          actorUserId: actor.id,
          targetId: existing.id,
          failureCode: "already_active_admin",
          metadata: { previousStatus: status },
        });
        return { ok: false, error: "This email is already an active admin." };
      }
      if (status === "INVITED") {
        await auditBlocked({
          actorUserId: actor.id,
          targetId: existing.id,
          failureCode: "duplicate_invitation",
          metadata: { previousStatus: status },
        });
        return {
          ok: false,
          error:
            "An invitation is already pending for this email. Use Resend setup link instead of inviting again.",
        };
      }
      await auditBlocked({
        actorUserId: actor.id,
        targetId: existing.id,
        failureCode: "existing_admin",
      });
      return { ok: false, error: "This email cannot be invited as a new admin." };
    }
  }

  const now = new Date();
  let createdId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: nameParsed.name,
          email,
          role: Role.ADMIN,
          adminTeamRole: teamRole,
          passwordHash: null,
          // Credentials login + ACTIVE status require verification.
          // Invitee establishes password via the one-time setup link (no temp password).
          emailVerifiedAt: now,
          adminDisabledAt: null,
          adminStatusVersion: 0,
          credentialsChangedAt: now,
        },
        select: { id: true },
      });
      createdId = created.id;

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: ADMIN_INVITED_AUDIT,
          targetType: "user",
          targetId: created.id,
          metadata: {
            inviteMethod: "opaque_setup_link",
            previousStatus: null,
            adminStatusVersion: 0,
            teamRole,
          },
        },
      });
    }, ADMIN_USERS_TX);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await auditBlocked({
        actorUserId: actor.id,
        failureCode: "email_unique_conflict",
      });
      return {
        ok: false,
        error: "This email cannot be invited right now. Please reload and try again.",
      };
    }
    return unexpectedAdminUsersMutationResult(err);
  }

  // Mint/send outside the create transaction (email I/O). Never log the raw token.
  let inviteEmailDelivered = false;
  try {
    const minted = await mintAdminInviteSetupToken(createdId);
    const setupUrl = buildAdminInviteSetupUrl(minted.rawToken);
    const sent = await sendAdminInviteEmail({
      to: email,
      setupUrl,
    });
    if (sent.ok) {
      inviteEmailDelivered = true;
    } else {
      console.error("Admin invite email failed:", sent.reason);
    }
  } catch (err) {
    console.error(
      "Admin invite mint/send failed:",
      err instanceof Error ? err.name : "unknown"
    );
  }

  return {
    ok: true,
    message: inviteEmailDelivered
      ? "Admin invited. They will receive a password setup link by email (expires in 30 minutes)."
      : "Admin account created (INVITED), but the invitation email could not be sent. Use Resend setup link.",
    status: "INVITED",
    adminStatusVersion: 0,
  };
}

/**
 * Resend Admin setup link when the account is still INVITED.
 * Supersedes prior unused setup tokens. Never returns/logs the raw token.
 * Does not create another Admin account or reset an active Admin.
 */
export async function resendAdminInviteSetup(options: {
  adminUserId: string;
  targetUserId: string;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.targetUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const targetId = (options.targetUserId ?? "").trim();
  if (!targetId || targetId.length > 64) {
    return { ok: false, error: "Admin not found." };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  });

  if (!target || target.role !== Role.ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_admin",
    });
    return { ok: false, error: "Admin not found." };
  }

  const previousStatus = resolveAdminAccountStatus(target);
  if (previousStatus === "DELETED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "deleted",
      metadata: { previousStatus },
    });
    return { ok: false, error: "Deleted accounts cannot receive invitations." };
  }
  if (previousStatus === "DISABLED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "disabled_use_reactivate",
      metadata: { previousStatus },
    });
    return {
      ok: false,
      error: "Reactivate the admin before resending a setup link.",
    };
  }
  if (previousStatus === "ACTIVE") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "already_active_admin",
      metadata: { previousStatus },
    });
    return {
      ok: false,
      error:
        "This admin already has a password. Use Forgot Password for recovery.",
    };
  }
  if (previousStatus !== "INVITED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_invited",
      metadata: { previousStatus },
    });
    return { ok: false, error: "A setup link can only be resent for invited admins." };
  }

  let inviteEmailDelivered = false;
  try {
    const minted = await mintAdminInviteSetupToken(target.id);
    const setupUrl = buildAdminInviteSetupUrl(minted.rawToken);
    const sent = await sendAdminInviteEmail({
      to: target.email,
      setupUrl,
    });
    inviteEmailDelivered = sent.ok;
    if (!sent.ok) {
      console.error("Admin invite resend email failed:", sent.reason);
    }
  } catch (err) {
    console.error(
      "Admin invite resend failed:",
      err instanceof Error ? err.name : "unknown"
    );
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: ADMIN_INVITATION_RESENT_AUDIT,
    targetType: "user",
    targetId: target.id,
    metadata: {
      previousStatus,
      emailDelivered: inviteEmailDelivered,
    },
  });

  return {
    ok: true,
    message: inviteEmailDelivered
      ? "Setup link resent. The previous unused link is no longer valid."
      : "A new setup link was generated, but the email could not be sent. Try again shortly.",
    status: "INVITED",
  };
}

export async function deactivateAdminUser(options: {
  adminUserId: string;
  targetUserId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.targetUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const targetId = (options.targetUserId ?? "").trim();
  if (!targetId || targetId.length > 64) {
    return { ok: false, error: "Admin not found." };
  }

  if (targetId === actor.id) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "self_deactivate",
    });
    return { ok: false, error: "You cannot deactivate your own admin account." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
      adminStatusVersion: true,
    },
  });

  if (!target || target.role !== Role.ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_admin",
    });
    return { ok: false, error: "Admin not found." };
  }

  const previousStatus = resolveAdminAccountStatus(target);
  if (previousStatus === "DELETED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "deleted",
      metadata: { previousStatus },
    });
    return { ok: false, error: "Deleted accounts cannot be deactivated." };
  }
  if (previousStatus === "DISABLED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "already_disabled",
      metadata: { previousStatus },
    });
    return { ok: false, error: "This admin is already disabled." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;
  const targetIsActive = isActiveAdminForProtection(target);

  try {
    await prisma.$transaction(async (tx) => {
      if (targetIsActive) {
        // Transaction-scoped advisory lock serializes ACTIVE admin disables so
        // concurrent READ COMMITTED updates cannot race to zero ACTIVE admins.
        const disableResult = await disableActiveAdminUnderLock(tx, {
          actorId: actor.id,
          targetId: target.id,
          expectedVersion,
          now,
        });
        if (disableResult === "last_active") {
          throw new AdminUsersLastActiveError();
        }
        if (disableResult !== "ok") {
          throw new AdminUsersCasConflictError();
        }
      } else {
        // INVITED: still take the same lock so status mutations stay serialized.
        await acquireAdminStatusXactLock(tx);
        const updated = await tx.user.updateMany({
          where: {
            id: target.id,
            role: Role.ADMIN,
            deletedAt: null,
            adminDisabledAt: null,
            adminStatusVersion: expectedVersion,
            passwordHash: null,
          },
          data: {
            adminDisabledAt: now,
            adminStatusVersion: { increment: 1 },
            adminSessionVersion: { increment: 1 },
            credentialsChangedAt: now,
          },
        });
        if (updated.count !== 1) {
          throw new AdminUsersCasConflictError();
        }
      }

      await tx.session.deleteMany({ where: { userId: target.id } });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: ADMIN_DEACTIVATED_AUDIT,
          targetType: "user",
          targetId: target.id,
          metadata: {
            previousStatus,
            adminStatusVersion: nextVersion,
          },
        },
      });
    }, ADMIN_USERS_TX);
  } catch (err) {
    if (err instanceof AdminUsersLastActiveError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "last_active_admin",
        metadata: { previousStatus, expectedVersion },
      });
      return {
        ok: false,
        error: "Cannot disable the last Super Admin account.",
      };
    }
    if (err instanceof AdminUsersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "stale_version",
        metadata: { previousStatus, expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    return unexpectedAdminUsersMutationResult(err);
  }

  return {
    ok: true,
    message: "Admin deactivated.",
    adminStatusVersion: nextVersion,
    status: "DISABLED",
  };
}

export async function reactivateAdminUser(options: {
  adminUserId: string;
  targetUserId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.targetUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const targetId = (options.targetUserId ?? "").trim();
  if (!targetId || targetId.length > 64) {
    return { ok: false, error: "Admin not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
      adminStatusVersion: true,
    },
  });

  if (!target || target.role !== Role.ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_admin",
    });
    return { ok: false, error: "Admin not found." };
  }

  const previousStatus = resolveAdminAccountStatus(target);
  if (previousStatus === "DELETED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "deleted",
      metadata: { previousStatus },
    });
    return { ok: false, error: "Deleted accounts cannot be reactivated here." };
  }
  if (previousStatus !== "DISABLED") {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_disabled",
      metadata: { previousStatus },
    });
    return { ok: false, error: "Only disabled admins can be reactivated." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      await acquireAdminStatusXactLock(tx);

      const updated = await tx.user.updateMany({
        where: {
          id: target.id,
          role: Role.ADMIN,
          deletedAt: null,
          adminDisabledAt: { not: null },
          adminStatusVersion: expectedVersion,
        },
        data: {
          adminDisabledAt: null,
          adminStatusVersion: { increment: 1 },
          adminSessionVersion: { increment: 1 },
          credentialsChangedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new AdminUsersCasConflictError();
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: ADMIN_REACTIVATED_AUDIT,
          targetType: "user",
          targetId: target.id,
          metadata: {
            previousStatus,
            adminStatusVersion: nextVersion,
          },
        },
      });
    }, ADMIN_USERS_TX);
  } catch (err) {
    if (err instanceof AdminUsersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "stale_version",
        metadata: { previousStatus, expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    return unexpectedAdminUsersMutationResult(err);
  }

  const restored = resolveAdminAccountStatus({
    role: Role.ADMIN,
    deletedAt: null,
    adminDisabledAt: null,
    passwordHash: target.passwordHash,
    emailVerifiedAt: target.emailVerifiedAt,
  });

  return {
    ok: true,
    message:
      restored === "INVITED"
        ? "Admin reactivated. Invitation is still pending until they set a password."
        : "Admin reactivated.",
    adminStatusVersion: nextVersion,
    status: restored,
  };
}

export async function assignAdminTeamRole(options: {
  adminUserId: string;
  targetUserId: string;
  teamRole: FormDataEntryValue | string | null;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.targetUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const targetId = (options.targetUserId ?? "").trim();
  if (!targetId || targetId.length > 64) {
    return { ok: false, error: "Admin not found." };
  }
  if (targetId === actor.id) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "self_role_change",
    });
    return { ok: false, error: "You cannot change your own team role." };
  }

  const teamRole = parseAdminTeamRole(options.teamRole);
  if (!teamRole) {
    return {
      ok: false,
      error: "Select a valid team role.",
      fieldErrors: { teamRole: "Select a valid team role." },
    };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      passwordHash: true,
      emailVerifiedAt: true,
      adminStatusVersion: true,
      adminTeamRole: true,
    },
  });

  if (!target || target.role !== Role.ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_admin",
    });
    return { ok: false, error: "Admin not found." };
  }

  const previousStatus = resolveAdminAccountStatus(target);
  if (previousStatus === "DELETED") {
    return { ok: false, error: "Deleted accounts cannot be updated." };
  }

  const previousRole = target.adminTeamRole as AdminTeamRoleName;
  const nextVersion = expectedVersion + 1;

  try {
    const saved = await assignAdminTeamRoleAtomic(prisma, {
      targetId: target.id,
      expectedVersion,
      teamRole: teamRole as AdminTeamRole,
      actorId: actor.id,
      auditId: randomUUID(),
      action: ADMIN_TEAM_ROLE_CHANGED_AUDIT,
      previousRole: previousRole as AdminTeamRole,
      previousStatus,
      nextVersion,
    });

    if (saved.updatedCount !== 1) {
      const lastSuperBlocked =
        previousRole === "SUPER_ADMIN" &&
        teamRole !== "SUPER_ADMIN" &&
        isActiveAdminForProtection(target) &&
        saved.activeSuperCount <= 1 &&
        saved.currentVersion === expectedVersion;

      if (lastSuperBlocked) {
        throw new AdminUsersLastActiveError();
      }
      throw new AdminUsersCasConflictError();
    }
  } catch (err) {
    if (err instanceof AdminUsersLastActiveError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "last_active_admin",
        metadata: { previousRole, teamRole },
      });
      return {
        ok: false,
        error: "Cannot change the last Super Admin account to another role.",
      };
    }
    if (err instanceof AdminUsersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    return unexpectedAdminUsersMutationResult(err);
  }

  return {
    ok: true,
    message: `Role updated to ${ADMIN_TEAM_ROLE_LABELS[teamRole]}. Custom permissions were reset to that role.`,
    adminStatusVersion: nextVersion,
    status: previousStatus === "OTHER" ? "DISABLED" : previousStatus,
  };
}

export async function updateAdminPermissions(options: {
  adminUserId: string;
  targetUserId: string;
  selectedPermissions: Iterable<FormDataEntryValue | string | null>;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<AdminUsersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.targetUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await requireAdminManager(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const targetId = (options.targetUserId ?? "").trim();
  if (!targetId || targetId.length > 64) {
    return { ok: false, error: "Admin not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      adminTeamRole: true,
      adminStatusVersion: true,
    },
  });

  if (!target || target.role !== Role.ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "not_admin",
    });
    return { ok: false, error: "Admin not found." };
  }
  if (target.deletedAt) {
    return { ok: false, error: "Deleted accounts cannot be updated." };
  }
  if (target.adminTeamRole === AdminTeamRole.SUPER_ADMIN) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId,
      failureCode: "super_admin_permissions_locked",
    });
    return {
      ok: false,
      error: "Super Admin always has full access. Change the role first to limit permissions.",
    };
  }

  const selected = [...options.selectedPermissions]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const grants = grantsFromPermissionSelection({
    teamRole: target.adminTeamRole,
    selected,
  });
  const nextVersion = expectedVersion + 1;
  const effective = [
    ...resolveAdminPermissions({
      teamRole: target.adminTeamRole,
      grants,
    }),
  ];

  try {
    await prisma.$transaction(async (tx) => {
      await acquireAdminStatusXactLock(tx);

      const updated = await tx.user.updateMany({
        where: {
          id: target.id,
          role: Role.ADMIN,
          deletedAt: null,
          adminStatusVersion: expectedVersion,
        },
        data: { adminStatusVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new AdminUsersCasConflictError();
      }

      await tx.adminPermissionGrant.deleteMany({ where: { userId: target.id } });
      if (grants.length > 0) {
        await tx.adminPermissionGrant.createMany({
          data: grants.map((grant) => ({
            userId: target.id,
            permission: grant.permission,
            effect:
              grant.effect === "GRANT"
                ? AdminPermissionEffect.GRANT
                : AdminPermissionEffect.DENY,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: ADMIN_PERMISSIONS_CHANGED_AUDIT,
          targetType: "user",
          targetId: target.id,
          metadata: {
            teamRole: target.adminTeamRole,
            permissions: effective,
            adminStatusVersion: nextVersion,
          },
        },
      });
    }, ADMIN_USERS_TX);
  } catch (err) {
    if (err instanceof AdminUsersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: target.id,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    return unexpectedAdminUsersMutationResult(err);
  }

  return {
    ok: true,
    message: "Permissions updated.",
    adminStatusVersion: nextVersion,
  };
}
