/**
 * Provider-evidence ICCID capture/backfill for reconciliation cases.
 * GET-only provider lookup. Reuses captureIccidForProviderOrder.
 * Never places/retries VeSIM orders, mutates wallets, refunds, resends email,
 * creates assignments, or auto-resolves/unlocks cases.
 */
import "server-only";

import type { Prisma } from "@prisma/client";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { extractInstallDetails } from "@/app/lib/email/extract";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  BACKFILL_ICCID_PHRASE,
  evaluateIccidBackfillLocalEligibility,
  evaluateProviderIccidEvidence,
  iccidBackfillBlockerLabel,
  isIccidBackfillSourceType,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  type CaseManagementSourceType,
  type IccidBackfillEligibility,
  type IccidBackfillSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import { captureIccidForProviderOrder } from "@/app/lib/orders/iccidCapture";
import {
  classifyProviderOrderResponse,
  PROVIDER_LOOKUP_TIMEOUT_MS,
} from "@/app/lib/vesim/providerOrderStatus";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";

export const ICCID_BACKFILLED = "reconciliation.iccid_backfilled";
export const ICCID_ACTION_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR = "Unable to backfill ICCID for this case right now.";

type JsonRecord = Record<string, unknown>;

type ResolvedIds = {
  sourceType: IccidBackfillSourceType;
  attemptId: string;
  recordId: string;
  targetType: string;
};

type LinkedOrderContext = {
  caseResolved: boolean;
  caseLocked: boolean;
  lockedByAdminId: string | null;
  providerRefreshInProgress: boolean;
  attemptProviderOrderId: string;
  orderId: string;
  orderProviderOrderId: string;
  orderStatus: string | null;
  orderOfferId: string | null;
  localIccidPresent: boolean;
};

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): ResolvedIds | null {
  if (!isIccidBackfillSourceType(sourceType)) return null;
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    targetType:
      sourceType === "iccid"
        ? "Order"
        : sourceType === "assignment"
          ? "AdminPackageAssignment"
          : "WalletEsimPurchase",
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) return null;
  return admin;
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

async function loadLinkedOrderContext(
  ids: ResolvedIds
): Promise<LinkedOrderContext | null> {
  if (ids.sourceType === "iccid") {
    const row = await prisma.order.findUnique({
      where: { id: ids.recordId },
      select: {
        id: true,
        status: true,
        providerOrderId: true,
        offerId: true,
        iccidHash: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: false,
      attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderId: row.id,
      orderProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderStatus: row.status,
      orderOfferId: (row.offerId ?? "").trim() || null,
      localIccidPresent: Boolean(row.iccidHash),
    };
  }

  if (ids.sourceType === "wallet_purchase") {
    const row = await prisma.walletEsimPurchase.findUnique({
      where: { id: ids.recordId },
      select: {
        providerOrderId: true,
        orderId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
        order: {
          select: {
            id: true,
            status: true,
            providerOrderId: true,
            offerId: true,
            iccidHash: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: isRefreshInProgress(row),
      attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderId: row.order?.id ?? (row.orderId ?? "").trim(),
      orderProviderOrderId: (row.order?.providerOrderId ?? "").trim(),
      orderStatus: row.order?.status ?? null,
      orderOfferId: (row.order?.offerId ?? "").trim() || null,
      localIccidPresent: Boolean(row.order?.iccidHash),
    };
  }

  const row = await prisma.adminPackageAssignment.findUnique({
    where: { id: ids.recordId },
    select: {
      providerOrderId: true,
      orderId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      order: {
        select: {
          id: true,
          status: true,
          providerOrderId: true,
          offerId: true,
          iccidHash: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    caseResolved: Boolean(row.reconciliationResolvedAt),
    caseLocked: Boolean(row.reconciliationLockedAt),
    lockedByAdminId: row.reconciliationLockedByAdminId,
    providerRefreshInProgress: isRefreshInProgress(row),
    attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
    orderId: row.order?.id ?? (row.orderId ?? "").trim(),
    orderProviderOrderId: (row.order?.providerOrderId ?? "").trim(),
    orderStatus: row.order?.status ?? null,
    orderOfferId: (row.order?.offerId ?? "").trim() || null,
    localIccidPresent: Boolean(row.order?.iccidHash),
  };
}

function localEligibilityFromContext(
  sourceType: IccidBackfillSourceType,
  ctx: LinkedOrderContext,
  currentAdminId: string
): IccidBackfillEligibility {
  return evaluateIccidBackfillLocalEligibility({
    sourceType,
    alreadyResolved: ctx.caseResolved,
    locked: ctx.caseLocked,
    lockedByAdminId: ctx.lockedByAdminId,
    currentAdminId,
    providerOrderId: ctx.attemptProviderOrderId,
    localOrderId: ctx.orderId,
    orderProviderOrderId: ctx.orderProviderOrderId,
    orderStatus: ctx.orderStatus,
    providerRefreshInProgress: ctx.providerRefreshInProgress,
    localIccidPresent: ctx.localIccidPresent,
  });
}

/**
 * GET-only broker order fetch for ICCID evidence.
 * Returns classification + ephemeral ICCID only — never logs payload.
 */
async function fetchProviderIccidEvidence(options: {
  providerOrderId: string;
  expectedOfferId?: string | null;
}): Promise<
  | { ok: true; normalizedIccid: string; lookupKind: string }
  | { ok: false; blocker: string }
> {
  const providerOrderId = options.providerOrderId.trim();
  if (!providerOrderId || providerOrderId.length > 128) {
    return { ok: false, blocker: "missing_provider_reference" };
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(providerOrderId)) {
    return { ok: false, blocker: "missing_provider_reference" };
  }

  const observedAt = new Date();
  let httpStatus = 0;
  let payload: JsonRecord = {};

  try {
    getVesimBaseUrl();
  } catch (error) {
    if (error instanceof VesimEnvironmentError) {
      return { ok: false, blocker: "provider_environment_blocked" };
    }
    return { ok: false, blocker: "provider_environment_blocked" };
  }

  try {
    let token: { tokenType: string; accessToken: string };
    try {
      token = await getBrokerToken();
    } catch (error) {
      if (error instanceof VesimEnvironmentError) {
        return { ok: false, blocker: "provider_environment_blocked" };
      }
      return { ok: false, blocker: "provider_auth_failure" };
    }

    const baseUrl = getVesimBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PROVIDER_LOOKUP_TIMEOUT_MS
    );
    try {
      const response = await fetch(
        `${baseUrl}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `${token.tokenType} ${token.accessToken}`,
          },
          cache: "no-store",
          signal: controller.signal,
        }
      );
      httpStatus = response.status;
      payload = (await readJsonSafe(response)) ?? {};
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError");
    if (aborted) return { ok: false, blocker: "provider_uncertain" };
    return { ok: false, blocker: "provider_uncertain" };
  }

  const classified = classifyProviderOrderResponse({
    httpStatus,
    payload,
    requestedProviderOrderId: providerOrderId,
    expectedOfferId: options.expectedOfferId,
    observedAt,
  });

  // Extract ICCID only after classification; never persist/log payload.
  const extracted = extractInstallDetails(payload).iccid ?? null;
  // Drop payload reference for GC / avoid accidental reuse.
  payload = {};

  const evidence = evaluateProviderIccidEvidence({
    lookupKind: classified.kind,
    orderExists: classified.orderExists,
    offerMatch: classified.offerMatch,
    safeProviderState: classified.safeProviderState,
    extractedIccid: extracted,
    hasExpectedOfferId: Boolean((options.expectedOfferId ?? "").trim()),
  });

  if (!evidence.ok) return { ok: false, blocker: evidence.blocker };
  return {
    ok: true,
    normalizedIccid: evidence.normalizedIccid,
    lookupKind: classified.kind,
  };
}

export async function getIccidBackfillUiEligibility(options: {
  sourceType: string;
  attemptId: string;
  adminUserId: string;
}): Promise<
  | (IccidBackfillEligibility & { message: string })
  | null
> {
  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return null;
  if (!isIccidBackfillSourceType(sourceType)) {
    return {
      allowed: false,
      blockers: ["unsupported_source"],
      supported: false,
      localIccidPresent: false,
      message: iccidBackfillBlockerLabel("unsupported_source"),
    };
  }
  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return null;
  const ctx = await loadLinkedOrderContext(ids);
  if (!ctx) return null;
  const eligibility = localEligibilityFromContext(
    sourceType,
    ctx,
    options.adminUserId
  );
  let message: string;
  if (!eligibility.allowed) {
    message = eligibility.blockers.map(iccidBackfillBlockerLabel).join(" ");
  } else if (eligibility.localIccidPresent) {
    message =
      "Local ICCID is already present. Submit only to confirm identical provider evidence (idempotent).";
  } else {
    message =
      "Case is locked by you with a linked provider reference. Provider evidence will be verified on submit.";
  }
  return { ...eligibility, message };
}

export async function backfillReconciliationIccid(options: {
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
  if (!sourceType || !isIccidBackfillSourceType(sourceType)) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(
    options.confirmPhrase,
    BACKFILL_ICCID_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-iccid-backfill:admin:${admin.id}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many ICCID backfill attempts. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-iccid-backfill:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode: "case_rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many ICCID backfill attempts for this case. Please wait.",
    };
  }

  const ctx = await loadLinkedOrderContext(ids);
  if (!ctx) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode: "missing_local_record",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  const localEligibility = localEligibilityFromContext(
    ids.sourceType,
    ctx,
    admin.id
  );
  if (!localEligibility.allowed) {
    const failureCode = localEligibility.blockers[0] ?? "blocked";
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: iccidBackfillBlockerLabel(failureCode),
    };
  }

  const providerEvidence = await fetchProviderIccidEvidence({
    providerOrderId: ctx.orderProviderOrderId || ctx.attemptProviderOrderId,
    expectedOfferId: ctx.orderOfferId,
  });
  if (!providerEvidence.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode: providerEvidence.blocker,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: iccidBackfillBlockerLabel(providerEvidence.blocker),
    };
  }

  // Ephemeral ICCID — never written to audit metadata.
  const normalizedIccid = providerEvidence.normalizedIccid;

  try {
    const captureResult = await prisma.$transaction(async (tx) => {
      // Re-check eligibility inside the transaction (CAS-style).
      const fresh = await loadLinkedOrderContextInTx(tx, ids);
      if (!fresh) {
        return { status: "blocked" as const, failureCode: "missing_local_record" };
      }
      const again = localEligibilityFromContext(ids.sourceType, fresh, admin.id);
      if (!again.allowed) {
        return {
          status: "blocked" as const,
          failureCode: again.blockers[0] ?? "blocked",
        };
      }
      if (
        fresh.orderProviderOrderId.toUpperCase() !==
          (ctx.orderProviderOrderId || ctx.attemptProviderOrderId).toUpperCase()
      ) {
        return {
          status: "blocked" as const,
          failureCode: "provider_reference_mismatch",
        };
      }

      const result = await captureIccidForProviderOrder(
        {
          providerOrderId: fresh.orderProviderOrderId,
          iccid: normalizedIccid,
        },
        tx
      );
      return { status: "capture" as const, capture: result.status };
    });

    if (captureResult.status === "blocked") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: ICCID_ACTION_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "iccid_backfill",
          failureCode: captureResult.failureCode,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error: iccidBackfillBlockerLabel(captureResult.failureCode),
      };
    }

    const status = captureResult.capture;
    if (status === "stored" || status === "already_same") {
      const idempotent = status === "already_same";
      await writeAuditLog({
        actorUserId: admin.id,
        action: ICCID_BACKFILLED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          orderId: ctx.orderId,
          action: "iccid_backfill",
          result: status,
          idempotent,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: true,
        idempotent,
        message: idempotent
          ? "ICCID already matched provider evidence."
          : "ICCID captured from provider evidence.",
      };
    }

    const failureCode =
      status === "conflict"
        ? "iccid_conflict"
        : status === "duplicate_other_order"
          ? "iccid_duplicate_other_order"
          : status === "skipped_no_encryption"
            ? "encryption_unavailable"
            : status === "skipped_invalid" || status === "skipped_empty"
              ? "provider_iccid_malformed"
              : "blocked";

    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode,
        captureStatus: status,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: iccidBackfillBlockerLabel(failureCode) };
  } catch {
    await writeAuditLog({
      actorUserId: admin.id,
      action: ICCID_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "iccid_backfill",
        failureCode: "transaction_failed",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }
}

type TxClient = Prisma.TransactionClient;

async function loadLinkedOrderContextInTx(
  tx: TxClient,
  ids: ResolvedIds
): Promise<LinkedOrderContext | null> {
  if (ids.sourceType === "iccid") {
    const row = await tx.order.findUnique({
      where: { id: ids.recordId },
      select: {
        id: true,
        status: true,
        providerOrderId: true,
        offerId: true,
        iccidHash: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: false,
      attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderId: row.id,
      orderProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderStatus: row.status,
      orderOfferId: (row.offerId ?? "").trim() || null,
      localIccidPresent: Boolean(row.iccidHash),
    };
  }

  if (ids.sourceType === "wallet_purchase") {
    const row = await tx.walletEsimPurchase.findUnique({
      where: { id: ids.recordId },
      select: {
        providerOrderId: true,
        orderId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
        order: {
          select: {
            id: true,
            status: true,
            providerOrderId: true,
            offerId: true,
            iccidHash: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: isRefreshInProgress(row),
      attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
      orderId: row.order?.id ?? (row.orderId ?? "").trim(),
      orderProviderOrderId: (row.order?.providerOrderId ?? "").trim(),
      orderStatus: row.order?.status ?? null,
      orderOfferId: (row.order?.offerId ?? "").trim() || null,
      localIccidPresent: Boolean(row.order?.iccidHash),
    };
  }

  const row = await tx.adminPackageAssignment.findUnique({
    where: { id: ids.recordId },
    select: {
      providerOrderId: true,
      orderId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      order: {
        select: {
          id: true,
          status: true,
          providerOrderId: true,
          offerId: true,
          iccidHash: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    caseResolved: Boolean(row.reconciliationResolvedAt),
    caseLocked: Boolean(row.reconciliationLockedAt),
    lockedByAdminId: row.reconciliationLockedByAdminId,
    providerRefreshInProgress: isRefreshInProgress(row),
    attemptProviderOrderId: (row.providerOrderId ?? "").trim(),
    orderId: row.order?.id ?? (row.orderId ?? "").trim(),
    orderProviderOrderId: (row.order?.providerOrderId ?? "").trim(),
    orderStatus: row.order?.status ?? null,
    orderOfferId: (row.order?.offerId ?? "").trim() || null,
    localIccidPresent: Boolean(row.order?.iccidHash),
  };
}
