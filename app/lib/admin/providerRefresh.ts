/**
 * Evidence-safe provider status refresh for reconciliation attempts.
 * GET-only. Never checkout, wallet, refund, finalize, email, or ICCID capture.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { maskProviderOrderRef } from "@/app/lib/admin/display";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { isVesimEnvironmentConfigured } from "@/app/lib/vesim/environment";
import {
  lookupKindToProviderResultKind,
  lookupProviderOrderStatus,
  type ProviderOrderLookupKind,
  type SanitizedProviderOrderStatus,
  type TriState,
} from "@/app/lib/vesim/providerOrderStatus";

import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  isProviderRefreshSourceType,
  parseProviderRefreshReason,
  PROVIDER_REFRESH_STALE_CLAIM_MS,
  type ProviderRefreshSourceType,
} from "@/app/lib/admin/providerRefreshShared";

export {
  isProviderRefreshSourceType,
  parseProviderRefreshReason,
  PROVIDER_REFRESH_REASON_MAX,
  PROVIDER_REFRESH_REASON_MIN,
  PROVIDER_REFRESH_STALE_CLAIM_MS,
} from "@/app/lib/admin/providerRefreshShared";

export type { ProviderRefreshSourceType } from "@/app/lib/admin/providerRefreshShared";

export const PROVIDER_REFRESH_STARTED =
  "reconciliation.provider_refresh_started";
export const PROVIDER_REFRESH_COMPLETED =
  "reconciliation.provider_refresh_completed";
export const PROVIDER_REFRESH_FAILED =
  "reconciliation.provider_refresh_failed";
export const PROVIDER_REFRESH_BLOCKED =
  "reconciliation.provider_refresh_blocked";

export type ProviderRefreshEligibility = {
  eligible: boolean;
  reasonCode:
    | "ok"
    | "unsupported_source"
    | "missing_provider_ref"
    | "resolved"
    | "locked"
    | "conflict"
    | "in_progress"
    | "environment_blocked"
    | "not_found";
  hasProviderRef: boolean;
  providerRefMasked: string;
  expectedProviderOrderId: string | null;
  refreshInProgress: boolean;
  environmentOk: boolean;
};

export type ProviderRefreshPanel = {
  lastCheckedLabel: string;
  checkedByLabel: string;
  resultLabel: string;
  safeProviderStateLabel: string;
  offerMatchLabel: string;
  installDataLabel: string;
  orderExistsLabel: string;
  safeCodeLabel: string;
  inProgress: boolean;
};

export type ProviderRefreshActionResult =
  | { ok: true; resultKind: ProviderOrderLookupKind }
  | { ok: false; error: string; fieldErrors?: { reason?: string } };

function formatTs(value: Date | null | undefined): string {
  if (!value) return "—";
  try {
    return value.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "—";
  }
}

function triLabel(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "yes") return "Yes";
  if (t === "no") return "No";
  return "Unknown";
}

function resultDisplayLabel(kind: string | null | undefined): string {
  switch ((kind ?? "").trim().toUpperCase()) {
    case "FOUND":
      return "Found";
    case "NOT_FOUND":
      return "Not found";
    case "TIMEOUT":
      return "Failed (timeout)";
    case "AUTH_FAILURE":
      return "Failed (auth)";
    case "ENVIRONMENT_BLOCKED":
      return "Failed (environment)";
    case "PROVIDER_ERROR":
      return "Failed (provider)";
    case "IN_PROGRESS":
      return "In progress";
    case "UNKNOWN":
      return "Unknown";
    default:
      return "—";
  }
}

function isRefreshInProgress(
  claimedAt: Date | null | undefined,
  completedAt: Date | null | undefined,
  result: string | null | undefined,
  now: Date
): boolean {
  if (!claimedAt) return false;
  if (completedAt && completedAt.getTime() >= claimedAt.getTime()) return false;
  if ((result ?? "").trim().toUpperCase() === "IN_PROGRESS") {
    const age = now.getTime() - claimedAt.getTime();
    return age < PROVIDER_REFRESH_STALE_CLAIM_MS;
  }
  const age = now.getTime() - claimedAt.getTime();
  return age < PROVIDER_REFRESH_STALE_CLAIM_MS && !completedAt;
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true, name: true, email: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    return null;
  }
  return admin;
}

async function checkProviderRefConflict(options: {
  providerOrderId: string;
  sourceType: ProviderRefreshSourceType;
  attemptId: string;
}): Promise<boolean> {
  const id = options.providerOrderId.trim();
  if (options.sourceType === "wallet_purchase") {
    const otherPurchase = await prisma.walletEsimPurchase.findFirst({
      where: { providerOrderId: id, NOT: { id: options.attemptId } },
      select: { id: true },
    });
    if (otherPurchase) return true;
    const otherPartnerPurchase = await prisma.partnerEsimPurchase.findFirst({
      where: { providerOrderId: id },
      select: { id: true },
    });
    if (otherPartnerPurchase) return true;
    const otherAssignment = await prisma.adminPackageAssignment.findFirst({
      where: { providerOrderId: id },
      select: { id: true },
    });
    if (otherAssignment) return true;
    return false;
  }

  if (options.sourceType === "partner_purchase") {
    const otherPartnerPurchase = await prisma.partnerEsimPurchase.findFirst({
      where: { providerOrderId: id, NOT: { id: options.attemptId } },
      select: { id: true },
    });
    if (otherPartnerPurchase) return true;
    const otherPurchase = await prisma.walletEsimPurchase.findFirst({
      where: { providerOrderId: id },
      select: { id: true },
    });
    if (otherPurchase) return true;
    const otherAssignment = await prisma.adminPackageAssignment.findFirst({
      where: { providerOrderId: id },
      select: { id: true },
    });
    return Boolean(otherAssignment);
  }

  const otherAssignment = await prisma.adminPackageAssignment.findFirst({
    where: { providerOrderId: id, NOT: { id: options.attemptId } },
    select: { id: true },
  });
  if (otherAssignment) return true;
  const otherPurchase = await prisma.walletEsimPurchase.findFirst({
    where: { providerOrderId: id },
    select: { id: true },
  });
  if (otherPurchase) return true;
  const otherPartnerPurchase = await prisma.partnerEsimPurchase.findFirst({
    where: { providerOrderId: id },
    select: { id: true },
  });
  return Boolean(otherPartnerPurchase);
}

type AttemptRow = {
  id: string;
  offerId: string;
  providerOrderId: string | null;
  reconciliationResolvedAt: Date | null;
  reconciliationLockedAt: Date | null;
  providerRefreshClaimedAt: Date | null;
  providerRefreshCompletedAt: Date | null;
  providerRefreshByAdminId: string | null;
  providerRefreshResult: string | null;
  providerRefreshSafeCode: string | null;
  providerRefreshOrderExists: string | null;
  providerRefreshOfferMatch: string | null;
  providerRefreshInstallData: string | null;
  providerRefreshSafeState: string | null;
};

async function loadAttempt(
  sourceType: ProviderRefreshSourceType,
  attemptId: string
): Promise<AttemptRow | null> {
  if (sourceType === "wallet_purchase") {
    return prisma.walletEsimPurchase.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        offerId: true,
        providerOrderId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshByAdminId: true,
        providerRefreshResult: true,
        providerRefreshSafeCode: true,
        providerRefreshOrderExists: true,
        providerRefreshOfferMatch: true,
        providerRefreshInstallData: true,
        providerRefreshSafeState: true,
      },
    });
  }
  if (sourceType === "partner_purchase") {
    return prisma.partnerEsimPurchase.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        offerId: true,
        providerOrderId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshByAdminId: true,
        providerRefreshResult: true,
        providerRefreshSafeCode: true,
        providerRefreshOrderExists: true,
        providerRefreshOfferMatch: true,
        providerRefreshInstallData: true,
        providerRefreshSafeState: true,
      },
    });
  }
  return prisma.adminPackageAssignment.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      offerId: true,
      providerOrderId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshByAdminId: true,
      providerRefreshResult: true,
      providerRefreshSafeCode: true,
      providerRefreshOrderExists: true,
      providerRefreshOfferMatch: true,
      providerRefreshInstallData: true,
      providerRefreshSafeState: true,
    },
  });
}

export async function getProviderRefreshEligibility(options: {
  sourceType: string;
  attemptId: string;
}): Promise<ProviderRefreshEligibility> {
  const now = new Date();
  const environmentOk = isVesimEnvironmentConfigured();
  if (!isProviderRefreshSourceType(options.sourceType)) {
    return {
      eligible: false,
      reasonCode: "unsupported_source",
      hasProviderRef: false,
      providerRefMasked: "Not available",
      expectedProviderOrderId: null,
      refreshInProgress: false,
      environmentOk,
    };
  }
  const attemptId = (options.attemptId ?? "").trim();
  if (!attemptId || attemptId.length > 64) {
    return {
      eligible: false,
      reasonCode: "not_found",
      hasProviderRef: false,
      providerRefMasked: "Not available",
      expectedProviderOrderId: null,
      refreshInProgress: false,
      environmentOk,
    };
  }

  const row = await loadAttempt(options.sourceType, attemptId);
  if (!row) {
    return {
      eligible: false,
      reasonCode: "not_found",
      hasProviderRef: false,
      providerRefMasked: "Not available",
      expectedProviderOrderId: null,
      refreshInProgress: false,
      environmentOk,
    };
  }

  const providerOrderId = (row.providerOrderId ?? "").trim() || null;
  const hasProviderRef = Boolean(providerOrderId);
  const refreshInProgress = isRefreshInProgress(
    row.providerRefreshClaimedAt,
    row.providerRefreshCompletedAt,
    row.providerRefreshResult,
    now
  );

  if (row.reconciliationResolvedAt) {
    return {
      eligible: false,
      reasonCode: "resolved",
      hasProviderRef,
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      expectedProviderOrderId: providerOrderId,
      refreshInProgress,
      environmentOk,
    };
  }
  if (row.reconciliationLockedAt) {
    return {
      eligible: false,
      reasonCode: "locked",
      hasProviderRef,
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      expectedProviderOrderId: providerOrderId,
      refreshInProgress,
      environmentOk,
    };
  }
  if (!providerOrderId) {
    return {
      eligible: false,
      reasonCode: "missing_provider_ref",
      hasProviderRef: false,
      providerRefMasked: "Not available",
      expectedProviderOrderId: null,
      refreshInProgress,
      environmentOk,
    };
  }

  const conflict = await checkProviderRefConflict({
    providerOrderId,
    sourceType: options.sourceType,
    attemptId,
  });
  if (conflict) {
    return {
      eligible: false,
      reasonCode: "conflict",
      hasProviderRef,
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      expectedProviderOrderId: providerOrderId,
      refreshInProgress,
      environmentOk,
    };
  }

  if (refreshInProgress) {
    return {
      eligible: false,
      reasonCode: "in_progress",
      hasProviderRef,
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      expectedProviderOrderId: providerOrderId,
      refreshInProgress: true,
      environmentOk,
    };
  }

  if (!environmentOk) {
    return {
      eligible: false,
      reasonCode: "environment_blocked",
      hasProviderRef,
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      expectedProviderOrderId: providerOrderId,
      refreshInProgress: false,
      environmentOk: false,
    };
  }

  return {
    eligible: true,
    reasonCode: "ok",
    hasProviderRef,
    providerRefMasked: maskProviderOrderRef(providerOrderId),
    expectedProviderOrderId: providerOrderId,
    refreshInProgress: false,
    environmentOk: true,
  };
}

export function buildProviderRefreshPanel(
  row: {
    providerRefreshClaimedAt?: Date | null;
    providerRefreshCompletedAt?: Date | null;
    providerRefreshByAdminId?: string | null;
    providerRefreshResult?: string | null;
    providerRefreshSafeCode?: string | null;
    providerRefreshOrderExists?: string | null;
    providerRefreshOfferMatch?: string | null;
    providerRefreshInstallData?: string | null;
    providerRefreshSafeState?: string | null;
  },
  checkedByName?: string | null
): ProviderRefreshPanel | null {
  if (
    !row.providerRefreshResult &&
    !row.providerRefreshClaimedAt &&
    !row.providerRefreshCompletedAt
  ) {
    return null;
  }
  const inProgress = isRefreshInProgress(
    row.providerRefreshClaimedAt ?? null,
    row.providerRefreshCompletedAt ?? null,
    row.providerRefreshResult ?? null,
    new Date()
  );
  return {
    lastCheckedLabel: formatTs(
      row.providerRefreshCompletedAt ?? row.providerRefreshClaimedAt
    ),
    checkedByLabel: (checkedByName ?? "").trim() || "Administrator",
    resultLabel: resultDisplayLabel(row.providerRefreshResult),
    safeProviderStateLabel: (row.providerRefreshSafeState ?? "").trim() || "—",
    offerMatchLabel: triLabel(row.providerRefreshOfferMatch),
    installDataLabel: triLabel(row.providerRefreshInstallData),
    orderExistsLabel: triLabel(row.providerRefreshOrderExists),
    safeCodeLabel: (row.providerRefreshSafeCode ?? "").trim() || "—",
    inProgress,
  };
}

async function claimRefresh(options: {
  sourceType: ProviderRefreshSourceType;
  attemptId: string;
  adminUserId: string;
  now: Date;
}): Promise<boolean> {
  const staleBefore = new Date(
    options.now.getTime() - PROVIDER_REFRESH_STALE_CLAIM_MS
  );
  const data = {
    providerRefreshClaimedAt: options.now,
    providerRefreshCompletedAt: null as Date | null,
    providerRefreshByAdminId: options.adminUserId,
    providerRefreshResult: "IN_PROGRESS",
    providerRefreshSafeCode: "claimed",
  };

  // Idle (never claimed), completed prior refresh, or stale in-progress claim.
  const where = {
    id: options.attemptId,
    reconciliationResolvedAt: null,
    reconciliationLockedAt: null,
    NOT: { providerOrderId: null },
    OR: [
      { providerRefreshClaimedAt: null },
      { providerRefreshClaimedAt: { lte: staleBefore } },
      {
        AND: [
          { providerRefreshResult: { not: "IN_PROGRESS" } },
          { providerRefreshCompletedAt: { not: null } },
        ],
      },
    ],
  };

  if (options.sourceType === "wallet_purchase") {
    const claimed = await prisma.walletEsimPurchase.updateMany({
      where,
      data,
    });
    return claimed.count === 1;
  }
  if (options.sourceType === "partner_purchase") {
    const claimed = await prisma.partnerEsimPurchase.updateMany({
      where,
      data,
    });
    return claimed.count === 1;
  }

  const claimed = await prisma.adminPackageAssignment.updateMany({
    where,
    data,
  });
  return claimed.count === 1;
}

async function completeRefresh(options: {
  sourceType: ProviderRefreshSourceType;
  attemptId: string;
  adminUserId: string;
  observation: SanitizedProviderOrderStatus;
  now: Date;
}): Promise<void> {
  const kind = options.observation.kind;
  const resultKind = lookupKindToProviderResultKind(kind);
  const data = {
    providerRefreshCompletedAt: options.now,
    providerRefreshByAdminId: options.adminUserId,
    providerRefreshResult: kind,
    providerRefreshSafeCode: options.observation.safeStatusCode,
    providerRefreshOrderExists: options.observation.orderExists,
    providerRefreshOfferMatch: options.observation.offerMatch,
    providerRefreshInstallData: options.observation.installDataPresent,
    providerRefreshSafeState: options.observation.safeProviderState,
    providerObservedAt: options.observation.observedAt,
    providerResultKind: resultKind,
    safeProviderStatusCode: options.observation.safeStatusCode,
  };

  if (options.sourceType === "wallet_purchase") {
    await prisma.walletEsimPurchase.update({
      where: { id: options.attemptId },
      data,
    });
  } else if (options.sourceType === "partner_purchase") {
    await prisma.partnerEsimPurchase.update({
      where: { id: options.attemptId },
      data,
    });
  } else {
    await prisma.adminPackageAssignment.update({
      where: { id: options.attemptId },
      data,
    });
  }
}

export async function getProviderRefreshUiState(options: {
  sourceType: string;
  attemptId: string;
}): Promise<{
  eligibility: ProviderRefreshEligibility;
  panel: ProviderRefreshPanel | null;
}> {
  const eligibility = await getProviderRefreshEligibility(options);
  if (!isProviderRefreshSourceType(options.sourceType)) {
    return { eligibility, panel: null };
  }
  const attemptId = (options.attemptId ?? "").trim();
  const row = await loadAttempt(options.sourceType, attemptId);
  if (!row) return { eligibility, panel: null };

  let checkedByName: string | null = null;
  if (row.providerRefreshByAdminId) {
    const admin = await prisma.user.findUnique({
      where: { id: row.providerRefreshByAdminId },
      select: { name: true },
    });
    checkedByName = admin?.name ?? null;
  }

  return {
    eligibility,
    panel: buildProviderRefreshPanel(row, checkedByName),
  };
}

/**
 * Execute a controlled provider-order GET refresh.
 * Loads providerOrderId from DB only — browser-supplied ids are confirmation only.
 */
export async function refreshProviderOrderStatus(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  /** Opaque confirmation of the masked/stored ref from the form — never used as lookup id. */
  expectedProviderOrderId: string;
  /** Injectable lookup for offline QA. */
  lookupFn?: typeof lookupProviderOrderStatus;
}): Promise<ProviderRefreshActionResult> {
  const publicError =
    "Provider status refresh is unavailable. Please try again shortly.";
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: publicError };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  if (!isProviderRefreshSourceType(options.sourceType)) {
    return { ok: false, error: publicError };
  }
  const sourceType = options.sourceType;
  const attemptId = (options.attemptId ?? "").trim();
  if (!attemptId || attemptId.length > 64) {
    return { ok: false, error: publicError };
  }

  const reasonParsed = parseProviderRefreshReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-provider-refresh:admin:${admin.id}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: "rate_limited",
        method: "provider_refresh",
      },
    });
    return {
      ok: false,
      error: "Too many provider status refreshes. Please wait and try again.",
    };
  }

  const attemptRate = consumeRateLimit({
    key: `recon-provider-refresh:attempt:${sourceType}:${attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!attemptRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: "rate_limited_attempt",
        method: "provider_refresh",
      },
    });
    return {
      ok: false,
      error: "This case was refreshed recently. Please wait and try again.",
    };
  }

  const eligibility = await getProviderRefreshEligibility({
    sourceType,
    attemptId,
  });
  const allowTestLookupThroughEnv =
    Boolean(options.lookupFn) &&
    eligibility.reasonCode === "environment_blocked" &&
    Boolean(eligibility.expectedProviderOrderId);
  if (
    (!eligibility.eligible || !eligibility.expectedProviderOrderId) &&
    !allowTestLookupThroughEnv
  ) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: eligibility.reasonCode,
        method: "provider_refresh",
      },
    });
    return { ok: false, error: publicError };
  }

  const expectedFromForm = (options.expectedProviderOrderId ?? "").trim();
  const storedId = eligibility.expectedProviderOrderId;
  // Confirmation only — lookup always uses DB-stored id.
  if (!expectedFromForm || expectedFromForm !== storedId) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: "provider_ref_mismatch",
        method: "provider_refresh",
      },
    });
    return { ok: false, error: publicError };
  }

  // Ignore any alternate browser-supplied providerOrderId field entirely.
  const now = new Date();
  const claimed = await claimRefresh({
    sourceType,
    attemptId,
    adminUserId: admin.id,
    now,
  });
  if (!claimed) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: "in_progress",
        method: "provider_refresh",
      },
    });
    return {
      ok: false,
      error: "A provider status refresh is already in progress for this case.",
    };
  }

  const row = await loadAttempt(sourceType, attemptId);
  const providerOrderId = (row?.providerOrderId ?? "").trim();
  if (!providerOrderId || providerOrderId !== storedId) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PROVIDER_REFRESH_BLOCKED,
      targetType:
        sourceType === "wallet_purchase"
          ? "WalletEsimPurchase"
          : sourceType === "partner_purchase"
            ? "PartnerEsimPurchase"
          : "AdminPackageAssignment",
      targetId: attemptId,
      metadata: {
        sourceType,
        attemptId,
        reason: reasonParsed.reason.slice(0, 80),
        failureCode: "provider_ref_changed",
        method: "provider_refresh",
      },
    });
    return { ok: false, error: publicError };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: PROVIDER_REFRESH_STARTED,
    targetType:
      sourceType === "wallet_purchase"
        ? "WalletEsimPurchase"
        : sourceType === "partner_purchase"
          ? "PartnerEsimPurchase"
        : "AdminPackageAssignment",
    targetId: attemptId,
    metadata: {
      sourceType,
      attemptId,
      reason: reasonParsed.reason.slice(0, 80),
      method: "provider_refresh",
      providerRefMasked: maskProviderOrderRef(providerOrderId),
    },
  });

  const lookupFn = options.lookupFn ?? lookupProviderOrderStatus;
  let observation: SanitizedProviderOrderStatus;
  try {
    observation = await lookupFn({
      providerOrderId,
      expectedOfferId: row?.offerId ?? null,
    });
  } catch {
    observation = {
      kind: "UNKNOWN",
      observedAt: now,
      safeStatusCode: "lookup_error",
      orderExists: "unknown" as TriState,
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  const completedAt = new Date();
  await completeRefresh({
    sourceType,
    attemptId,
    adminUserId: admin.id,
    observation,
    now: completedAt,
  });

  const terminalOk = observation.kind === "FOUND";
  await writeAuditLog({
    actorUserId: admin.id,
    action: terminalOk ? PROVIDER_REFRESH_COMPLETED : PROVIDER_REFRESH_FAILED,
    targetType:
      sourceType === "wallet_purchase"
        ? "WalletEsimPurchase"
        : sourceType === "partner_purchase"
          ? "PartnerEsimPurchase"
        : "AdminPackageAssignment",
    targetId: attemptId,
    metadata: {
      sourceType,
      attemptId,
      reason: reasonParsed.reason.slice(0, 80),
      method: "provider_refresh",
      providerRefMasked: maskProviderOrderRef(providerOrderId),
      failureCategory: observation.kind,
      failureCode: observation.safeStatusCode,
      refreshResult: observation.kind,
    },
  });

  // Cases remain unresolved regardless of FOUND / NOT_FOUND / UNKNOWN.
  return { ok: true, resultKind: observation.kind };
}
