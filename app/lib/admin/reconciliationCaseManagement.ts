/**
 * Server-only reconciliation case lock / unlock / escalate / safe resolve.
 * Mutates case-management fields only — never wallets, provider orders,
 * local orders, email state, or ICCID fields.
 */
import "server-only";

import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  canRaiseOrKeepEscalation,
  canLowerEscalation,
  caseManagementStateLabel,
  emailResendBlockerLabel,
  evaluateEmailResendEligibility,
  evaluateIccidBackfillLocalEligibility,
  evaluateLocalFinalizationEligibility,
  evaluateResolutionEligibility,
  iccidBackfillBlockerLabel,
  isIccidBackfillSourceType,
  isLocalFinalizationSourceType,
  localFinalizationBlockerLabel,
  LOCK_CASE_PHRASE,
  lowerEscalationPriorities,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  parseEscalationPriority,
  parseKnownEscalationPriority,
  parseResolutionCode,
  resolutionBlockerLabel,
  DEESCALATE_CASE_PHRASE,
  RESOLVE_CASE_PHRASE,
  UNLOCK_CASE_PHRASE,
  type CaseManagementSourceType,
  type EscalationPriority,
  type ResolutionCode,
  type ResolutionEligibility,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";

export {
  CASE_REASON_MAX,
  CASE_REASON_MIN,
  DEESCALATE_CASE_PHRASE,
  ESCALATION_PRIORITIES,
  LOCK_CASE_PHRASE,
  RESOLUTION_CODES,
  RESOLVE_CASE_PHRASE,
  UNLOCK_CASE_PHRASE,
  evaluateResolutionEligibility,
  parseCaseReason,
  parseConfirmPhrase,
  parseEscalationPriority,
  parseResolutionCode,
  resolutionBlockerLabel,
} from "@/app/lib/admin/reconciliationCaseShared";

export const CASE_LOCKED = "reconciliation.case_locked";
export const CASE_UNLOCKED = "reconciliation.case_unlocked";
export const CASE_ESCALATED = "reconciliation.case_escalated";
export const CASE_DEESCALATED = "reconciliation.case_deescalated";
export const CASE_RESOLVED = "reconciliation.case_resolved";
export const CASE_ACTION_BLOCKED = "reconciliation.case_action_blocked";

export type CaseActionResult =
  | { ok: true; idempotent?: boolean; message?: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: {
        reason?: string;
        confirmPhrase?: string;
        priority?: string;
        resolutionCode?: string;
      };
    };

export type CaseManagementFields = {
  reconciliationResolvedAt: Date | null;
  reconciliationResolvedByAdminId: string | null;
  reconciliationResolutionReason: string | null;
  reconciliationResolutionCode: string | null;
  reconciliationLockedAt: Date | null;
  reconciliationLockedByAdminId: string | null;
  reconciliationLockReason: string | null;
  reconciliationEscalatedAt: Date | null;
  reconciliationEscalatedByAdminId: string | null;
  reconciliationEscalationReason: string | null;
  reconciliationEscalationPriority: string | null;
};

export type CaseManagementUiState = {
  stateLabel: "Open" | "Locked" | "Escalated" | "Resolved";
  locked: boolean;
  escalated: boolean;
  resolved: boolean;
  lockedAtLabel: string;
  lockedByLabel: string;
  lockReason: string;
  escalatedAtLabel: string;
  escalatedByLabel: string;
  escalationPriority: string;
  escalationReason: string;
  resolvedAtLabel: string;
  resolvedByLabel: string;
  resolutionReason: string;
  resolutionCode: string;
  resolutionEligibility: ResolutionEligibility;
  resolutionEligibilityMessage: string;
  canLock: boolean;
  canUnlock: boolean;
  canEscalate: boolean;
  canDeescalate: boolean;
  deescalatePriorityOptions: EscalationPriority[];
  canResolve: boolean;
  refreshBlockedByCase: boolean;
  emailResendSupported: boolean;
  emailResendAllowed: boolean;
  emailResendMessage: string;
  iccidBackfillSupported: boolean;
  iccidBackfillAllowed: boolean;
  iccidBackfillMessage: string;
  localFinalizationSupported: boolean;
  localFinalizationAllowed: boolean;
  localFinalizationMessage: string;
};

const PUBLIC_ERROR = "Unable to update this case right now.";

const CASE_FIELD_SELECT = {
  reconciliationResolvedAt: true,
  reconciliationResolvedByAdminId: true,
  reconciliationResolutionReason: true,
  reconciliationResolutionCode: true,
  reconciliationLockedAt: true,
  reconciliationLockedByAdminId: true,
  reconciliationLockReason: true,
  reconciliationEscalatedAt: true,
  reconciliationEscalatedByAdminId: true,
  reconciliationEscalationReason: true,
  reconciliationEscalationPriority: true,
} as const;

function formatTs(value: Date | null | undefined): string {
  if (!value) return "—";
  try {
    return value.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "—";
  }
}

function targetTypeFor(sourceType: CaseManagementSourceType): string {
  switch (sourceType) {
    case "wallet_purchase":
    case "order_email":
      return "WalletEsimPurchase";
    case "assignment":
      return "AdminPackageAssignment";
    case "topup":
      return "WalletTopup";
    case "wallet_email":
      return "WalletTransaction";
    case "iccid":
      return "Order";
  }
}

function resolveRecordIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): {
  sourceType: CaseManagementSourceType;
  attemptId: string;
  recordId: string;
  targetType: string;
  orderEmailOnAssignment: boolean;
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
      targetType: "AdminPackageAssignment",
      orderEmailOnAssignment: true,
    };
  }

  if (attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    targetType: targetTypeFor(sourceType),
    orderEmailOnAssignment: false,
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, name: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    return null;
  }
  return admin;
}

/**
 * Same-origin / CSRF defense for admin case mutations.
 * Relies on browser Sec-Fetch-Site and Origin/Host alignment.
 */
export async function assertSameOriginAdminRequest(): Promise<boolean> {
  const h = await headers();
  const secFetchSite = (h.get("sec-fetch-site") ?? "").toLowerCase();
  if (secFetchSite === "cross-site") return false;

  const origin = h.get("origin");
  if (!origin) {
    // Same-origin navigations / some browsers omit Origin on same-site POSTs.
    return secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none" || !secFetchSite;
  }

  try {
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return false;
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

function isRefreshInProgress(row: {
  providerRefreshClaimedAt?: Date | null;
  providerRefreshCompletedAt?: Date | null;
  providerRefreshResult?: string | null;
}): boolean {
  const claimedAt = row.providerRefreshClaimedAt;
  if (!claimedAt) return false;
  const completedAt = row.providerRefreshCompletedAt;
  if (completedAt && completedAt.getTime() >= claimedAt.getTime()) return false;
  const age = Date.now() - claimedAt.getTime();
  if ((row.providerRefreshResult ?? "").trim().toUpperCase() === "IN_PROGRESS") {
    return age < PROVIDER_REFRESH_STALE_CLAIM_MS;
  }
  return age < PROVIDER_REFRESH_STALE_CLAIM_MS && !completedAt;
}

  type LoadedCase = CaseManagementFields & {
  status?: string | null;
  providerResultKind?: string | null;
  providerOrderId?: string | null;
  failureCategory?: string | null;
  failureCode?: string | null;
  debitStatus?: string | null;
  refundTransactionId?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
  orderProviderOrderId?: string | null;
  offerId?: string | null;
  customerUserId?: string | null;
  priceCents?: number | null;
  debitTransactionId?: string | null;
  emailDeliveryStatus?: string | null;
  emailNotificationStatus?: string | null;
  customerEmail?: string | null;
  amountCents?: number | null;
  balanceAfterCents?: number | null;
  iccidHash?: string | null;
  iccidCapturedAt?: Date | null;
  providerRefreshResult?: string | null;
  providerRefreshClaimedAt?: Date | null;
  providerRefreshCompletedAt?: Date | null;
  lockedByName?: string | null;
  escalatedByName?: string | null;
  resolvedByName?: string | null;
};

async function loadCaseRow(
  sourceType: CaseManagementSourceType,
  recordId: string,
  orderEmailOnAssignment: boolean
): Promise<LoadedCase | null> {
  if (sourceType === "wallet_purchase" || (sourceType === "order_email" && !orderEmailOnAssignment)) {
    const row = await prisma.walletEsimPurchase.findUnique({
      where: { id: recordId },
      select: {
        ...CASE_FIELD_SELECT,
        status: true,
        providerResultKind: true,
        providerOrderId: true,
        failureCategory: true,
        failureCode: true,
        refundTransactionId: true,
        orderId: true,
        offerId: true,
        customerUserId: true,
        priceCents: true,
        debitTransactionId: true,
        emailDeliveryStatus: true,
        providerRefreshResult: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        debitTransaction: { select: { status: true } },
        customer: { select: { email: true, deletedAt: true } },
        order: {
          select: {
            status: true,
            providerOrderId: true,
            iccidHash: true,
            iccidCapturedAt: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...row,
      debitStatus: row.debitTransaction?.status ?? null,
      orderStatus: row.order?.status ?? null,
      customerEmail: row.customer.deletedAt ? null : row.customer.email,
      iccidHash: row.order?.iccidHash ?? null,
      iccidCapturedAt: row.order?.iccidCapturedAt ?? null,
      orderProviderOrderId: row.order?.providerOrderId ?? null,
    };
  }

  if (sourceType === "assignment" || (sourceType === "order_email" && orderEmailOnAssignment)) {
    const row = await prisma.adminPackageAssignment.findUnique({
      where: { id: recordId },
      select: {
        ...CASE_FIELD_SELECT,
        status: true,
        providerResultKind: true,
        providerOrderId: true,
        failureCategory: true,
        failureCode: true,
        orderId: true,
        offerId: true,
        customerUserId: true,
        emailDeliveryStatus: true,
        providerRefreshResult: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        customer: { select: { email: true, deletedAt: true } },
        order: {
          select: {
            status: true,
            providerOrderId: true,
            iccidHash: true,
            iccidCapturedAt: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...row,
      orderStatus: row.order?.status ?? null,
      customerEmail: row.customer.deletedAt ? null : row.customer.email,
      iccidHash: row.order?.iccidHash ?? null,
      iccidCapturedAt: row.order?.iccidCapturedAt ?? null,
      orderProviderOrderId: row.order?.providerOrderId ?? null,
    };
  }

  if (sourceType === "topup") {
    const row = await prisma.walletTopup.findUnique({
      where: { id: recordId },
      select: {
        ...CASE_FIELD_SELECT,
        status: true,
        failureCategory: true,
        failureCode: true,
        walletTransactionId: true,
      },
    });
    if (!row) return null;
    return { ...row, orderId: row.walletTransactionId };
  }

  if (sourceType === "wallet_email") {
    const row = await prisma.walletTransaction.findUnique({
      where: { id: recordId },
      select: {
        ...CASE_FIELD_SELECT,
        status: true,
        amountCents: true,
        balanceAfterCents: true,
        emailNotificationStatus: true,
        wallet: {
          select: {
            user: { select: { email: true, deletedAt: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...row,
      customerEmail: row.wallet.user?.deletedAt ? null : row.wallet.user?.email,
    };
  }

  if (sourceType === "iccid") {
    const row = await prisma.order.findUnique({
      where: { id: recordId },
      select: {
        ...CASE_FIELD_SELECT,
        id: true,
        status: true,
        providerOrderId: true,
        iccidHash: true,
        iccidCapturedAt: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      orderId: row.id,
      orderStatus: row.status,
      orderProviderOrderId: row.providerOrderId,
    };
  }

  return null;
}

async function enrichActorNames(row: LoadedCase): Promise<LoadedCase> {
  const ids = [
    row.reconciliationLockedByAdminId,
    row.reconciliationEscalatedByAdminId,
    row.reconciliationResolvedByAdminId,
  ].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return row;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, (u.name ?? "").trim() || "Administrator"]));
  return {
    ...row,
    lockedByName: row.reconciliationLockedByAdminId
      ? byId.get(row.reconciliationLockedByAdminId) ?? "Administrator"
      : null,
    escalatedByName: row.reconciliationEscalatedByAdminId
      ? byId.get(row.reconciliationEscalatedByAdminId) ?? "Administrator"
      : null,
    resolvedByName: row.reconciliationResolvedByAdminId
      ? byId.get(row.reconciliationResolvedByAdminId) ?? "Administrator"
      : null,
  };
}

function eligibilityFromRow(
  sourceType: CaseManagementSourceType,
  row: LoadedCase
): ResolutionEligibility {
  return evaluateResolutionEligibility({
    sourceType,
    locked: Boolean(row.reconciliationLockedAt),
    alreadyResolved: Boolean(row.reconciliationResolvedAt),
    status: row.status,
    providerResultKind: row.providerResultKind,
    providerOrderId: row.providerOrderId,
    failureCategory: row.failureCategory,
    failureCode: row.failureCode,
    debitStatus: row.debitStatus,
    refundTransactionId: row.refundTransactionId,
    orderId: row.orderId,
    emailDeliveryStatus: row.emailDeliveryStatus,
    emailNotificationStatus: row.emailNotificationStatus,
    iccidHash: row.iccidHash,
    iccidCapturedAt: row.iccidCapturedAt,
    providerRefreshResult: row.providerRefreshResult,
    providerRefreshClaimedAt: row.providerRefreshClaimedAt,
    providerRefreshCompletedAt: row.providerRefreshCompletedAt,
  });
}

export async function getCaseManagementEligibility(options: {
  sourceType: string;
  attemptId: string;
  adminUserId?: string;
}): Promise<CaseManagementUiState | null> {
  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return null;
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return null;

  const loaded = await loadCaseRow(
    ids.sourceType,
    ids.recordId,
    ids.orderEmailOnAssignment
  );
  if (!loaded) return null;
  const row = await enrichActorNames(loaded);
  const resolved = Boolean(row.reconciliationResolvedAt);
  const locked = Boolean(row.reconciliationLockedAt);
  const escalated = Boolean(row.reconciliationEscalatedAt);
  const eligibility = eligibilityFromRow(ids.sourceType, row);
  const refreshInProgress = isRefreshInProgress(row);
  const currentPriority = parseKnownEscalationPriority(
    row.reconciliationEscalationPriority
  );
  const deescalatePriorityOptions = currentPriority
    ? lowerEscalationPriorities(currentPriority)
    : [];

  const emailSupported =
    ids.sourceType === "order_email" || ids.sourceType === "wallet_email";
  const emailEligibility = emailSupported
    ? evaluateEmailResendEligibility({
        sourceType: ids.sourceType,
        alreadyResolved: resolved,
        status: row.status,
        orderId: row.orderId,
        orderStatus: row.orderStatus,
        providerOrderId: row.providerOrderId,
        customerEmail: row.customerEmail,
        emailDeliveryStatus: row.emailDeliveryStatus,
        emailNotificationStatus: row.emailNotificationStatus,
        walletTransactionStatus: row.status,
        amountCents: row.amountCents,
        balanceAfterCents: row.balanceAfterCents,
      })
    : null;

  const iccidSupported = isIccidBackfillSourceType(ids.sourceType);
  const iccidEligibility = iccidSupported
    ? evaluateIccidBackfillLocalEligibility({
        sourceType: ids.sourceType,
        alreadyResolved: resolved,
        locked,
        lockedByAdminId: row.reconciliationLockedByAdminId,
        currentAdminId: (options.adminUserId ?? "").trim(),
        providerOrderId: row.providerOrderId,
        localOrderId: row.orderId,
        orderProviderOrderId: row.orderProviderOrderId ?? row.providerOrderId,
        orderStatus: row.orderStatus,
        providerRefreshInProgress: refreshInProgress,
        localIccidPresent: Boolean(row.iccidHash || row.iccidCapturedAt),
      })
    : null;

  const eligibilityMessage = eligibility.allowed
    ? "Local evidence shows no active financial, provider, email, or ICCID risk."
    : eligibility.blockers.map(resolutionBlockerLabel).join(" ");

  let iccidBackfillMessage =
    "ICCID backfill is not available for this case type.";
  if (iccidEligibility) {
    if (!iccidEligibility.allowed) {
      iccidBackfillMessage = iccidEligibility.blockers
        .map(iccidBackfillBlockerLabel)
        .join(" ");
    } else if (iccidEligibility.localIccidPresent) {
      iccidBackfillMessage =
        "Local ICCID is already present. Submit only to confirm identical provider evidence (idempotent).";
    } else {
      iccidBackfillMessage =
        "Case is locked by you with a linked provider reference. Provider evidence will be verified on submit.";
    }
  }

  const localFinalizeSupported = isLocalFinalizationSourceType(ids.sourceType);
  const localFinalizeEligibility = localFinalizeSupported
    ? evaluateLocalFinalizationEligibility({
        sourceType: ids.sourceType,
        alreadyResolved: resolved,
        locked,
        lockedByAdminId: row.reconciliationLockedByAdminId,
        currentAdminId: (options.adminUserId ?? "").trim(),
        status: row.status,
        orderId: row.orderId,
        providerOrderId: row.providerOrderId,
        providerResultKind: row.providerResultKind,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        offerId: row.offerId,
        customerUserId: row.customerUserId,
        customerEmail: row.customerEmail,
        priceCents: row.priceCents,
        debitStatus: row.debitStatus,
        debitTransactionId: row.debitTransactionId,
        refundTransactionId: row.refundTransactionId,
        providerRefreshInProgress: refreshInProgress,
      })
    : null;

  let localFinalizationMessage =
    "Local finalization recovery is not available for this case type.";
  if (localFinalizeEligibility) {
    if (!localFinalizeEligibility.allowed) {
      localFinalizationMessage = localFinalizeEligibility.blockers
        .map(localFinalizationBlockerLabel)
        .join(" ");
    } else if (localFinalizeEligibility.alreadyFinalized) {
      localFinalizationMessage =
        "Local record already finalized. Submit only confirms idempotent success.";
    } else {
      localFinalizationMessage =
        "Provider success is linked and local finalization is incomplete. Provider evidence will be re-verified on submit. No email is sent.";
    }
  }

  return {
    stateLabel: caseManagementStateLabel({
      resolvedAt: row.reconciliationResolvedAt,
      lockedAt: row.reconciliationLockedAt,
      escalatedAt: row.reconciliationEscalatedAt,
    }),
    locked,
    escalated,
    resolved,
    lockedAtLabel: formatTs(row.reconciliationLockedAt),
    lockedByLabel: row.lockedByName || "—",
    lockReason: (row.reconciliationLockReason ?? "").trim() || "—",
    escalatedAtLabel: formatTs(row.reconciliationEscalatedAt),
    escalatedByLabel: row.escalatedByName || "—",
    escalationPriority:
      (row.reconciliationEscalationPriority ?? "").trim() || "—",
    escalationReason: (row.reconciliationEscalationReason ?? "").trim() || "—",
    resolvedAtLabel: formatTs(row.reconciliationResolvedAt),
    resolvedByLabel: row.resolvedByName || "—",
    resolutionReason: (row.reconciliationResolutionReason ?? "").trim() || "—",
    resolutionCode: (row.reconciliationResolutionCode ?? "").trim() || "—",
    resolutionEligibility: eligibility,
    resolutionEligibilityMessage: eligibilityMessage,
    canLock: !resolved && !locked,
    canUnlock: !resolved && locked,
    canEscalate: !resolved,
    canDeescalate: !resolved && escalated && deescalatePriorityOptions.length > 0,
    deescalatePriorityOptions,
    canResolve: !resolved && !locked && eligibility.allowed && !refreshInProgress,
    refreshBlockedByCase: resolved || locked,
    emailResendSupported: emailSupported,
    emailResendAllowed: Boolean(emailEligibility?.allowed),
    emailResendMessage: emailEligibility
      ? emailEligibility.allowed
        ? emailEligibility.channel === "wallet_email"
          ? "Local ledger evidence is complete. Safe to resend the wallet notification."
          : "Local order evidence is complete. Safe to resend the order email."
        : emailEligibility.blockers.map(emailResendBlockerLabel).join(" ")
      : "Email resend is not available for this case type.",
    iccidBackfillSupported: iccidSupported,
    iccidBackfillAllowed: Boolean(iccidEligibility?.allowed),
    iccidBackfillMessage,
    localFinalizationSupported: localFinalizeSupported,
    localFinalizationAllowed: Boolean(localFinalizeEligibility?.allowed),
    localFinalizationMessage,
  };
}

async function rateLimitCaseAction(options: {
  adminId: string;
  sourceType: string;
  attemptId: string;
  action: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminRate = consumeRateLimit({
    key: `recon-case:${options.action}:admin:${options.adminId}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    return {
      ok: false,
      error: "Too many case actions. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-case:${options.action}:case:${options.sourceType}:${options.attemptId}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    return {
      ok: false,
      error: "This case was updated recently. Please wait and try again.",
    };
  }
  return { ok: true };
}

async function auditBlocked(options: {
  adminId: string;
  sourceType: CaseManagementSourceType;
  attemptId: string;
  targetType: string;
  recordId: string;
  action: string;
  failureCode: string;
  reason?: string;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: options.adminId,
    action: CASE_ACTION_BLOCKED,
    targetType: options.targetType,
    targetId: options.recordId,
    metadata: {
      sourceType: options.sourceType,
      attemptId: options.attemptId,
      action: options.action,
      failureCode: options.failureCode,
      reason: options.reason?.slice(0, 80) ?? null,
    },
  });
}

type PrismaDelegate = {
  updateMany: (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
};

function delegateFor(
  sourceType: CaseManagementSourceType,
  orderEmailOnAssignment: boolean
): PrismaDelegate {
  if (sourceType === "wallet_purchase" || (sourceType === "order_email" && !orderEmailOnAssignment)) {
    return prisma.walletEsimPurchase as unknown as PrismaDelegate;
  }
  if (sourceType === "assignment" || (sourceType === "order_email" && orderEmailOnAssignment)) {
    return prisma.adminPackageAssignment as unknown as PrismaDelegate;
  }
  if (sourceType === "topup") return prisma.walletTopup as unknown as PrismaDelegate;
  if (sourceType === "wallet_email") {
    return prisma.walletTransaction as unknown as PrismaDelegate;
  }
  return prisma.order as unknown as PrismaDelegate;
}

export async function lockReconciliationCase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return { ok: false, error: PUBLIC_ERROR };
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(options.confirmPhrase, LOCK_CASE_PHRASE);
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const limited = await rateLimitCaseAction({
    adminId: admin.id,
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "lock",
  });
  if (!limited.ok) return limited;

  const row = await loadCaseRow(
    ids.sourceType,
    ids.recordId,
    ids.orderEmailOnAssignment
  );
  if (!row) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "lock",
      failureCode: "not_found",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  if (row.reconciliationResolvedAt) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "lock",
      failureCode: "already_resolved",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: "Resolved cases cannot be locked." };
  }

  if (row.reconciliationLockedAt) {
    // Idempotent when already locked.
    await writeAuditLog({
      actorUserId: admin.id,
      action: CASE_LOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "lock",
        reason: reasonParsed.reason.slice(0, 80),
        idempotent: true,
        previousLocked: true,
        newLocked: true,
      },
    });
    return { ok: true, idempotent: true };
  }

  if (isRefreshInProgress(row)) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "lock",
      failureCode: "provider_refresh_in_progress",
      reason: reasonParsed.reason,
    });
    return {
      ok: false,
      error: "A provider status refresh is in progress. Try again shortly.",
    };
  }

  const now = new Date();
  const delegate = delegateFor(ids.sourceType, ids.orderEmailOnAssignment);
  const updated = await delegate.updateMany({
    where: {
      id: ids.recordId,
      reconciliationResolvedAt: null,
      reconciliationLockedAt: null,
    },
    data: {
      reconciliationLockedAt: now,
      reconciliationLockedByAdminId: admin.id,
      reconciliationLockReason: reasonParsed.reason,
    },
  });

  if (updated.count === 0) {
    // Concurrent lock — treat as idempotent if now locked.
    const again = await loadCaseRow(
      ids.sourceType,
      ids.recordId,
      ids.orderEmailOnAssignment
    );
    if (again?.reconciliationLockedAt && !again.reconciliationResolvedAt) {
      return { ok: true, idempotent: true };
    }
    return { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: CASE_LOCKED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      action: "lock",
      reason: reasonParsed.reason.slice(0, 80),
      previousLocked: false,
      newLocked: true,
      lockedAt: now.toISOString(),
    },
  });

  return { ok: true };
}

export async function unlockReconciliationCase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return { ok: false, error: PUBLIC_ERROR };
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(options.confirmPhrase, UNLOCK_CASE_PHRASE);
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const limited = await rateLimitCaseAction({
    adminId: admin.id,
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "unlock",
  });
  if (!limited.ok) return limited;

  const row = await loadCaseRow(
    ids.sourceType,
    ids.recordId,
    ids.orderEmailOnAssignment
  );
  if (!row) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "unlock",
      failureCode: "not_found",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  if (row.reconciliationResolvedAt) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "unlock",
      failureCode: "already_resolved",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: "Resolved cases cannot be unlocked." };
  }

  if (!row.reconciliationLockedAt) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CASE_UNLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "unlock",
        reason: reasonParsed.reason.slice(0, 80),
        idempotent: true,
        previousLocked: false,
        newLocked: false,
      },
    });
    return { ok: true, idempotent: true };
  }

  const previousLockedAt = row.reconciliationLockedAt.toISOString();
  const delegate = delegateFor(ids.sourceType, ids.orderEmailOnAssignment);
  const updated = await delegate.updateMany({
    where: {
      id: ids.recordId,
      reconciliationResolvedAt: null,
      NOT: { reconciliationLockedAt: null },
    },
    data: {
      reconciliationLockedAt: null,
      reconciliationLockedByAdminId: null,
      reconciliationLockReason: null,
    },
  });

  if (updated.count === 0) {
    const again = await loadCaseRow(
      ids.sourceType,
      ids.recordId,
      ids.orderEmailOnAssignment
    );
    if (again && !again.reconciliationLockedAt && !again.reconciliationResolvedAt) {
      return { ok: true, idempotent: true };
    }
    return { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: CASE_UNLOCKED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      action: "unlock",
      reason: reasonParsed.reason.slice(0, 80),
      previousLocked: true,
      previousLockedAt,
      newLocked: false,
    },
  });

  return { ok: true };
}

export async function escalateReconciliationCase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  priority: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return { ok: false, error: PUBLIC_ERROR };
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const priorityParsed = parseEscalationPriority(options.priority);
  if (!priorityParsed.ok) {
    return {
      ok: false,
      error: priorityParsed.error,
      fieldErrors: { priority: priorityParsed.error },
    };
  }

  const limited = await rateLimitCaseAction({
    adminId: admin.id,
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "escalate",
  });
  if (!limited.ok) return limited;

  const row = await loadCaseRow(
    ids.sourceType,
    ids.recordId,
    ids.orderEmailOnAssignment
  );
  if (!row) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "escalate",
      failureCode: "not_found",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  if (row.reconciliationResolvedAt) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "escalate",
      failureCode: "already_resolved",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: "Resolved cases cannot be escalated." };
  }

  const currentPriority = (row.reconciliationEscalationPriority ?? "")
    .trim()
    .toUpperCase() as EscalationPriority | "";
  const currentKnown =
    currentPriority === "LOW" ||
    currentPriority === "MEDIUM" ||
    currentPriority === "HIGH" ||
    currentPriority === "CRITICAL"
      ? currentPriority
      : null;

  if (
    currentKnown &&
    currentKnown === priorityParsed.priority &&
    (row.reconciliationEscalationReason ?? "").trim() === reasonParsed.reason
  ) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CASE_ESCALATED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "escalate",
        reason: reasonParsed.reason.slice(0, 80),
        priority: priorityParsed.priority,
        idempotent: true,
      },
    });
    return { ok: true, idempotent: true };
  }

  if (
    currentKnown &&
    !canRaiseOrKeepEscalation(currentKnown, priorityParsed.priority)
  ) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "escalate",
      failureCode: "priority_downgrade_blocked",
      reason: reasonParsed.reason,
    });
    return {
      ok: false,
      error: "Escalation priority cannot be lowered in this phase.",
      fieldErrors: {
        priority: "Escalation priority cannot be lowered in this phase.",
      },
    };
  }

  const now = new Date();
  const delegate = delegateFor(ids.sourceType, ids.orderEmailOnAssignment);
  const updated = await delegate.updateMany({
    where: {
      id: ids.recordId,
      reconciliationResolvedAt: null,
    },
    data: {
      reconciliationEscalatedAt: now,
      reconciliationEscalatedByAdminId: admin.id,
      reconciliationEscalationReason: reasonParsed.reason,
      reconciliationEscalationPriority: priorityParsed.priority,
    },
  });

  if (updated.count === 0) {
    return { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: CASE_ESCALATED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      action: "escalate",
      reason: reasonParsed.reason.slice(0, 80),
      priority: priorityParsed.priority,
      previousPriority: currentKnown,
      escalatedAt: now.toISOString(),
    },
  });

  return { ok: true };
}

export async function deescalateReconciliationCase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  priority: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return { ok: false, error: PUBLIC_ERROR };
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const priorityParsed = parseEscalationPriority(options.priority);
  if (!priorityParsed.ok) {
    return {
      ok: false,
      error: priorityParsed.error,
      fieldErrors: { priority: priorityParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(
    options.confirmPhrase,
    DEESCALATE_CASE_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const limited = await rateLimitCaseAction({
    adminId: admin.id,
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "deescalate",
  });
  if (!limited.ok) return limited;

  const row = await loadCaseRow(
    ids.sourceType,
    ids.recordId,
    ids.orderEmailOnAssignment
  );
  if (!row) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "deescalate",
      failureCode: "not_found",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  if (row.reconciliationResolvedAt) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "deescalate",
      failureCode: "already_resolved",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: "Resolved cases cannot be de-escalated." };
  }

  const currentKnown = parseKnownEscalationPriority(
    row.reconciliationEscalationPriority
  );
  if (!currentKnown || !row.reconciliationEscalatedAt) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "deescalate",
      failureCode: "not_escalated",
      reason: reasonParsed.reason,
    });
    return {
      ok: false,
      error: "This case is not escalated.",
      fieldErrors: { priority: "This case is not escalated." },
    };
  }

  if (
    currentKnown === priorityParsed.priority &&
    (row.reconciliationEscalationReason ?? "").trim() === reasonParsed.reason
  ) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CASE_DEESCALATED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "deescalate",
        reason: reasonParsed.reason.slice(0, 80),
        priority: priorityParsed.priority,
        previousPriority: currentKnown,
        idempotent: true,
      },
    });
    return { ok: true, idempotent: true };
  }

  if (!canLowerEscalation(currentKnown, priorityParsed.priority)) {
    await auditBlocked({
      adminId: admin.id,
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      targetType: ids.targetType,
      recordId: ids.recordId,
      action: "deescalate",
      failureCode: "priority_not_lower",
      reason: reasonParsed.reason,
    });
    return {
      ok: false,
      error: "De-escalation requires a strictly lower priority.",
      fieldErrors: {
        priority: "De-escalation requires a strictly lower priority.",
      },
    };
  }

  const now = new Date();
  const delegate = delegateFor(ids.sourceType, ids.orderEmailOnAssignment);
  const updated = await delegate.updateMany({
    where: {
      id: ids.recordId,
      reconciliationResolvedAt: null,
      reconciliationEscalationPriority: currentKnown,
    },
    data: {
      reconciliationEscalatedAt: now,
      reconciliationEscalatedByAdminId: admin.id,
      reconciliationEscalationReason: reasonParsed.reason,
      reconciliationEscalationPriority: priorityParsed.priority,
    },
  });

  if (updated.count === 0) {
    const again = await loadCaseRow(
      ids.sourceType,
      ids.recordId,
      ids.orderEmailOnAssignment
    );
    if (
      again &&
      parseKnownEscalationPriority(again.reconciliationEscalationPriority) ===
        priorityParsed.priority
    ) {
      return { ok: true, idempotent: true };
    }
    return { ok: false, error: PUBLIC_ERROR };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: CASE_DEESCALATED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      action: "deescalate",
      reason: reasonParsed.reason.slice(0, 80),
      priority: priorityParsed.priority,
      previousPriority: currentKnown,
      escalatedAt: now.toISOString(),
    },
  });

  return { ok: true };
}

export async function resolveReconciliationCase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  resolutionCode: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return { ok: false, error: PUBLIC_ERROR };
  const ids = resolveRecordIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const codeParsed = parseResolutionCode(options.resolutionCode);
  if (!codeParsed.ok) {
    return {
      ok: false,
      error: codeParsed.error,
      fieldErrors: { resolutionCode: codeParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(options.confirmPhrase, RESOLVE_CASE_PHRASE);
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const limited = await rateLimitCaseAction({
    adminId: admin.id,
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
    action: "resolve",
  });
  if (!limited.ok) return limited;

  return prisma.$transaction(async (tx) => {
    // Reload inside transaction for eligibility re-check.
    let row: LoadedCase | null = null;
    if (
      ids.sourceType === "wallet_purchase" ||
      (ids.sourceType === "order_email" && !ids.orderEmailOnAssignment)
    ) {
      const r = await tx.walletEsimPurchase.findUnique({
        where: { id: ids.recordId },
        select: {
          ...CASE_FIELD_SELECT,
          status: true,
          providerResultKind: true,
          providerOrderId: true,
          failureCategory: true,
          failureCode: true,
          refundTransactionId: true,
          orderId: true,
          emailDeliveryStatus: true,
          providerRefreshResult: true,
          providerRefreshClaimedAt: true,
          providerRefreshCompletedAt: true,
          debitTransaction: { select: { status: true } },
        },
      });
      if (r) {
        row = { ...r, debitStatus: r.debitTransaction?.status ?? null };
      }
    } else if (
      ids.sourceType === "assignment" ||
      (ids.sourceType === "order_email" && ids.orderEmailOnAssignment)
    ) {
      row = await tx.adminPackageAssignment.findUnique({
        where: { id: ids.recordId },
        select: {
          ...CASE_FIELD_SELECT,
          status: true,
          providerResultKind: true,
          providerOrderId: true,
          failureCategory: true,
          failureCode: true,
          orderId: true,
          emailDeliveryStatus: true,
          providerRefreshResult: true,
          providerRefreshClaimedAt: true,
          providerRefreshCompletedAt: true,
        },
      });
    } else if (ids.sourceType === "topup") {
      const r = await tx.walletTopup.findUnique({
        where: { id: ids.recordId },
        select: {
          ...CASE_FIELD_SELECT,
          status: true,
          failureCategory: true,
          failureCode: true,
          walletTransactionId: true,
        },
      });
      if (r) row = { ...r, orderId: r.walletTransactionId };
    } else if (ids.sourceType === "wallet_email") {
      row = await tx.walletTransaction.findUnique({
        where: { id: ids.recordId },
        select: {
          ...CASE_FIELD_SELECT,
          status: true,
          emailNotificationStatus: true,
        },
      });
    } else if (ids.sourceType === "iccid") {
      row = await tx.order.findUnique({
        where: { id: ids.recordId },
        select: {
          ...CASE_FIELD_SELECT,
          status: true,
          providerOrderId: true,
          iccidHash: true,
          iccidCapturedAt: true,
        },
      });
    }

    if (!row) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CASE_ACTION_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "resolve",
          failureCode: "not_found",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return { ok: false, error: PUBLIC_ERROR };
    }

    if (row.reconciliationResolvedAt) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CASE_RESOLVED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "resolve",
          reason: reasonParsed.reason.slice(0, 80),
          resolutionCode: codeParsed.code,
          idempotent: true,
        },
      });
      return { ok: true, idempotent: true };
    }

    const eligibility = eligibilityFromRow(ids.sourceType, row);
    if (!eligibility.allowed) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CASE_ACTION_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "resolve",
          failureCode: eligibility.blockers[0] ?? "ineligible",
          blockers: eligibility.blockers.slice(0, 8),
          reason: reasonParsed.reason.slice(0, 80),
          resolutionCode: codeParsed.code,
        },
      });
      return {
        ok: false,
        error:
          eligibility.blockers.map(resolutionBlockerLabel).join(" ") ||
          "This case cannot be resolved yet.",
      };
    }

    const now = new Date();
    const data = {
      reconciliationResolvedAt: now,
      reconciliationResolvedByAdminId: admin.id,
      reconciliationResolutionReason: reasonParsed.reason,
      reconciliationResolutionCode: codeParsed.code as ResolutionCode,
    };

    let count = 0;
    if (
      ids.sourceType === "wallet_purchase" ||
      (ids.sourceType === "order_email" && !ids.orderEmailOnAssignment)
    ) {
      const r = await tx.walletEsimPurchase.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedAt: null,
        },
        data,
      });
      count = r.count;
    } else if (
      ids.sourceType === "assignment" ||
      (ids.sourceType === "order_email" && ids.orderEmailOnAssignment)
    ) {
      const r = await tx.adminPackageAssignment.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedAt: null,
        },
        data,
      });
      count = r.count;
    } else if (ids.sourceType === "topup") {
      const r = await tx.walletTopup.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedAt: null,
        },
        data,
      });
      count = r.count;
    } else if (ids.sourceType === "wallet_email") {
      const r = await tx.walletTransaction.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedAt: null,
        },
        data,
      });
      count = r.count;
    } else {
      const r = await tx.order.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedAt: null,
        },
        data,
      });
      count = r.count;
    }

    if (count === 0) {
      return { ok: false, error: PUBLIC_ERROR };
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: CASE_RESOLVED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "resolve",
        reason: reasonParsed.reason.slice(0, 80),
        resolutionCode: codeParsed.code,
        previousResolved: false,
        newResolved: true,
        resolvedAt: now.toISOString(),
      },
    });

    return { ok: true };
  });
}
