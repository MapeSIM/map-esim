/**
 * Server-only mutation of allowlisted operational pause controls (Part A2).
 * Never mutates wallets, purchases, assignments, orders, provider, email, ICCID, or refunds.
 * Never enables guest checkout, payment gateway, or other incomplete features.
 */
import "server-only";

import { OperationalControlKey, Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  CONTROL_CONFIRM_PHRASES,
  OPERATIONAL_CONTROL_PUBLIC_ERROR,
  controlStateLabel,
  normalizeOperationalControlKey,
  parseOperationalConfirmPhrase,
  parseOperationalControlReason,
  truncateControlReason,
  type OperationalControlKeyName,
} from "@/app/lib/admin/operationalControlsShared";

export const CONTROL_PAUSED_AUDIT = "operations.control_paused";
export const CONTROL_RESUMED_AUDIT = "operations.control_resumed";
export const CONTROL_BLOCKED_AUDIT = "operations.control_action_blocked";

export type ControlMutationResult =
  | {
      ok: true;
      idempotent?: boolean;
      message: string;
      key: OperationalControlKeyName;
      state: "ACTIVE" | "PAUSED";
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"reason" | "confirmPhrase" | "controlKey", string>>;
    };

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

async function auditBlocked(options: {
  actorUserId: string | null;
  key: string | null;
  failureCode: string;
  reason?: string | null;
  requestedPaused?: boolean;
}) {
  await writeAuditLog({
    actorUserId: options.actorUserId,
    action: CONTROL_BLOCKED_AUDIT,
    targetType: "OperationalControl",
    targetId: options.key,
    metadata: {
      controlKey: options.key,
      failureCode: options.failureCode,
      requestedPaused:
        typeof options.requestedPaused === "boolean"
          ? options.requestedPaused
          : undefined,
      reason: truncateControlReason(options.reason),
    },
  });
}

/**
 * Pause or resume a single allowlisted operational control.
 * CAS on (key, version, paused=expectedPrevious). Idempotent when already in target state.
 */
export async function setOperationalControlPaused(options: {
  adminUserId: string;
  controlKey: string;
  paused: boolean;
  reason: string;
  confirmPhrase: string;
  /** Optional expected version for extra CAS; when omitted, CAS uses current paused only. */
  expectedVersion?: number | null;
}): Promise<ControlMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      key: null,
      failureCode: "same_origin",
      requestedPaused: options.paused,
    });
    return { ok: false, error: OPERATIONAL_CONTROL_PUBLIC_ERROR };
  }

  const admin = await requireActiveAdminActor(options.adminUserId);
  if (!admin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      key: null,
      failureCode: "inactive_admin",
      requestedPaused: options.paused,
    });
    return { ok: false, error: OPERATIONAL_CONTROL_PUBLIC_ERROR };
  }

  const key = normalizeOperationalControlKey(options.controlKey);
  if (!key) {
    await auditBlocked({
      actorUserId: admin.id,
      key: String(options.controlKey ?? "").slice(0, 64),
      failureCode: "invalid_control_key",
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: OPERATIONAL_CONTROL_PUBLIC_ERROR,
      fieldErrors: { controlKey: "Invalid control." },
    };
  }

  const reasonParsed = parseOperationalControlReason(options.reason);
  if (!reasonParsed.ok) {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "missing_reason",
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const expectedPhrase = options.paused
    ? CONTROL_CONFIRM_PHRASES[key].pause
    : CONTROL_CONFIRM_PHRASES[key].resume;
  const phrase = parseOperationalConfirmPhrase(
    options.confirmPhrase,
    expectedPhrase
  );
  if (!phrase.ok) {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "bad_confirm_phrase",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `ops-control:admin:${admin.id}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "admin_rate_limited",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: "Too many control updates. Please wait and try again.",
    };
  }

  const controlRate = consumeRateLimit({
    key: `ops-control:key:${key}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!controlRate.ok) {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "control_rate_limited",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: "Too many updates for this control. Please wait.",
    };
  }

  let existing: {
    id: string;
    key: OperationalControlKey;
    paused: boolean;
    version: number;
  } | null = null;
  try {
    existing = await prisma.operationalControl.findUnique({
      where: { key: key as OperationalControlKey },
      select: { id: true, key: true, paused: true, version: true },
    });
  } catch {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "read_failed",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return { ok: false, error: OPERATIONAL_CONTROL_PUBLIC_ERROR };
  }

  if (!existing) {
    // Do not create arbitrary keys. Seed migration should have inserted allowlisted rows.
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "missing_control_record",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return { ok: false, error: OPERATIONAL_CONTROL_PUBLIC_ERROR };
  }

  if (existing.paused === options.paused) {
    // Idempotent success — no pause/resume transition audit (no state change).
    return {
      ok: true,
      idempotent: true,
      message: options.paused
        ? "Control was already paused."
        : "Control was already active.",
      key,
      state: controlStateLabel(options.paused),
    };
  }

  const expectedVersion =
    typeof options.expectedVersion === "number" &&
    Number.isFinite(options.expectedVersion)
      ? Math.trunc(options.expectedVersion)
      : existing.version;

  let updatedCount = 0;
  try {
    const result = await prisma.operationalControl.updateMany({
      where: {
        id: existing.id,
        key: key as OperationalControlKey,
        paused: !options.paused,
        version: expectedVersion,
      },
      data: {
        paused: options.paused,
        version: { increment: 1 },
        reason: reasonParsed.reason,
        updatedByAdminId: admin.id,
      },
    });
    updatedCount = result.count;
  } catch {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "update_failed",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return { ok: false, error: OPERATIONAL_CONTROL_PUBLIC_ERROR };
  }

  if (updatedCount !== 1) {
    await auditBlocked({
      actorUserId: admin.id,
      key,
      failureCode: "cas_conflict",
      reason: reasonParsed.reason,
      requestedPaused: options.paused,
    });
    return {
      ok: false,
      error: "This control changed concurrently. Refresh and try again.",
    };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: options.paused ? CONTROL_PAUSED_AUDIT : CONTROL_RESUMED_AUDIT,
    targetType: "OperationalControl",
    targetId: existing.id,
    metadata: {
      controlKey: key,
      previousState: controlStateLabel(!options.paused),
      newState: controlStateLabel(options.paused),
      actorAdminId: admin.id,
      reason: truncateControlReason(reasonParsed.reason),
      idempotent: false,
    },
  });

  return {
    ok: true,
    idempotent: false,
    message: options.paused ? "Control paused." : "Control resumed.",
    key,
    state: controlStateLabel(options.paused),
  };
}
