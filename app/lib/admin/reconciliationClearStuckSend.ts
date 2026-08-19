/**
 * Admin-only CAS: stale emailDeliveryStatus "sending" → "failed".
 * Never sends email. Never mutates provider, wallet, payment, or Order.
 */
import "server-only";

import {
  AdminPackageAssignmentStatus,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  RECONCILIATION_STUCK_AGE_MS,
} from "@/app/lib/admin/reconciliationClassify";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  CLEAR_STUCK_SEND_PHRASE,
  clearStuckSendBlockerLabel,
  evaluateClearStuckSendEligibility,
  normalizeCaseManagementSourceType,
  parseConfirmPhrase,
  type CaseManagementSourceType,
  type ClearStuckSendEligibility,
} from "@/app/lib/admin/reconciliationCaseShared";

export const STALE_SENDING_CLEARED = "reconciliation.stale_sending_cleared";
export const STALE_SENDING_ACTION_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR = "Unable to clear stuck send for this case right now.";

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): {
  sourceType: CaseManagementSourceType;
  attemptId: string;
  recordId: string;
  orderEmailOnAssignment: boolean;
  targetType: string;
} | null {
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 96) return null;

  if (sourceType === "order_email" && attemptId.startsWith("assignment:")) {
    const assignmentId = attemptId.slice("assignment:".length).trim();
    if (!assignmentId || assignmentId.length > 64) return null;
    return {
      sourceType,
      attemptId,
      recordId: assignmentId,
      orderEmailOnAssignment: true,
      targetType: "AdminPackageAssignment",
    };
  }
  if (attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    orderEmailOnAssignment: false,
    targetType: "WalletEsimPurchase",
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    return null;
  }
  return admin;
}

export async function getClearStuckSendEligibility(options: {
  sourceType: string;
  attemptId: string;
  now?: Date;
}): Promise<
  | (ClearStuckSendEligibility & { message: string })
  | null
> {
  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return null;
  if (sourceType !== "order_email") {
    return {
      allowed: false,
      blockers: ["unsupported_source"],
      supported: false,
      message: clearStuckSendBlockerLabel("unsupported_source"),
    };
  }

  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return null;
  const now = options.now ?? new Date();

  if (ids.orderEmailOnAssignment) {
    const row = await prisma.adminPackageAssignment.findUnique({
      where: { id: ids.recordId },
      select: {
        status: true,
        emailDeliveryStatus: true,
        updatedAt: true,
        reconciliationResolvedAt: true,
      },
    });
    if (!row) return null;
    const eligibility = evaluateClearStuckSendEligibility({
      sourceType: "order_email",
      alreadyResolved: Boolean(row.reconciliationResolvedAt),
      status: row.status,
      emailDeliveryStatus: row.emailDeliveryStatus,
      updatedAt: row.updatedAt,
      now,
    });
    return {
      ...eligibility,
      message: eligibility.allowed
        ? "Sending has been in progress for 15 minutes or longer. This marks delivery as failed without sending email. Resend remains a separate action."
        : eligibility.blockers.map(clearStuckSendBlockerLabel).join(" "),
    };
  }

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id: ids.recordId },
    select: {
      status: true,
      emailDeliveryStatus: true,
      updatedAt: true,
      reconciliationResolvedAt: true,
    },
  });
  if (!row) return null;
  const eligibility = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: Boolean(row.reconciliationResolvedAt),
    status: row.status,
    emailDeliveryStatus: row.emailDeliveryStatus,
    updatedAt: row.updatedAt,
    now,
  });
  return {
    ...eligibility,
    message: eligibility.allowed
      ? "Sending has been in progress for 15 minutes or longer. This marks delivery as failed without sending email. Resend remains a separate action."
      : eligibility.blockers.map(clearStuckSendBlockerLabel).join(" "),
  };
}

export async function clearStuckReconciliationSend(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || sourceType !== "order_email") {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const phrase = parseConfirmPhrase(
    options.confirmPhrase,
    CLEAR_STUCK_SEND_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const auditMeta = (failureCode: string) => ({
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "clear_stuck_send",
    failureCode,
  });

  const adminRate = consumeRateLimit({
    key: `recon-clear-stuck-send:admin:${admin.id}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: STALE_SENDING_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: auditMeta("rate_limited"),
    });
    return {
      ok: false,
      error: "Too many stuck-send actions. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-clear-stuck-send:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 4,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: STALE_SENDING_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: auditMeta("rate_limited_case"),
    });
    return {
      ok: false,
      error: "This case was updated recently. Please wait and try again.",
    };
  }

  const now = new Date();
  const eligibility = await getClearStuckSendEligibility({
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    now,
  });
  if (!eligibility?.allowed) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: STALE_SENDING_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: auditMeta(eligibility?.blockers[0] ?? "ineligible"),
    });
    return { ok: false, error: eligibility?.message || PUBLIC_ERROR };
  }

  const staleBefore = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS);
  const claimed = ids.orderEmailOnAssignment
    ? await prisma.adminPackageAssignment.updateMany({
        where: {
          id: ids.recordId,
          status: AdminPackageAssignmentStatus.COMPLETED,
          reconciliationResolvedAt: null,
          emailDeliveryStatus: "sending",
          updatedAt: { lte: staleBefore },
        },
        data: { emailDeliveryStatus: "failed" },
      })
    : await prisma.walletEsimPurchase.updateMany({
        where: {
          id: ids.recordId,
          status: WalletEsimPurchaseStatus.COMPLETED,
          reconciliationResolvedAt: null,
          emailDeliveryStatus: "sending",
          updatedAt: { lte: staleBefore },
        },
        data: { emailDeliveryStatus: "failed" },
      });

  if (claimed.count !== 1) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: STALE_SENDING_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: auditMeta("cas_conflict"),
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: STALE_SENDING_CLEARED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: auditMeta("stale_sending_released"),
  });

  return {
    ok: true,
    message:
      "Stuck send marked as failed. Delivery is still unverified. Resend email is a separate action.",
  };
}
