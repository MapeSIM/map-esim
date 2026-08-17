/**
 * Controlled local finalization recovery for reconciliation cases.
 * Reuses persistAssignedOrder after GET-only provider confirmation.
 * Never places/retries VeSIM orders, creates new wallet debits/credits/refunds,
 * sends email, auto-resolves/unlocks, or overwrites conflicting records.
 */
import "server-only";

import {
  AdminPackageAssignmentStatus,
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  evaluateLocalFinalizationEligibility,
  evaluateProviderFinalizationEvidence,
  FINALIZE_LOCAL_RECORD_PHRASE,
  isLocalFinalizationSourceType,
  localFinalizationBlockerLabel,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  type CaseManagementSourceType,
  type LocalFinalizationEligibility,
  type LocalFinalizationSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import { persistAssignedOrder } from "@/app/lib/orders/persistAssignedOrder";
import { awardCustomerPurchaseEarnInTx } from "@/app/lib/rewards/rewardEarn";
import { completeRewardRedemptionInTx } from "@/app/lib/rewards/rewardRedeem";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  classifyProviderOrderResponse,
  PROVIDER_LOOKUP_TIMEOUT_MS,
} from "@/app/lib/vesim/providerOrderStatus";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";

export const LOCAL_FINALIZED = "reconciliation.local_finalized";
export const LOCAL_FINALIZE_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR =
  "Unable to finalize the local record for this case right now.";

type JsonRecord = Record<string, unknown>;
type TxClient = Prisma.TransactionClient;

type ResolvedIds = {
  sourceType: LocalFinalizationSourceType;
  attemptId: string;
  recordId: string;
  targetType: string;
};

type AttemptContext = {
  caseResolved: boolean;
  caseLocked: boolean;
  lockedByAdminId: string | null;
  providerRefreshInProgress: boolean;
  status: string;
  orderId: string | null;
  providerOrderId: string;
  providerResultKind: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  offerId: string;
  customerUserId: string;
  customerEmail: string | null;
  planName: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  priceCents: number | null;
  retailPriceCents: number | null;
  providerCostCents: number | null;
  currency: string;
  fundingSource: OrderFundingSource;
  debitTransactionId: string | null;
  debitStatus: string | null;
  refundTransactionId: string | null;
};

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): ResolvedIds | null {
  if (!isLocalFinalizationSourceType(sourceType)) return null;
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    targetType:
      sourceType === "assignment"
        ? "AdminPackageAssignment"
        : sourceType === "partner_purchase"
          ? "PartnerEsimPurchase"
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

function buildOffer(ctx: AttemptContext): VerifiedCheckoutOffer | null {
  const offerId = ctx.offerId.trim();
  if (!offerId) return null;
  const durationMatch = (ctx.validity ?? "").match(/(\d+)/);
  let retailUsd = 0;
  let providerUsd = 0;
  if (
    Number.isInteger(ctx.retailPriceCents ?? ctx.priceCents) &&
    (ctx.retailPriceCents ?? ctx.priceCents ?? 0) > 0
  ) {
    retailUsd = (ctx.retailPriceCents ?? ctx.priceCents as number) / 100;
  }
  if (
    typeof ctx.providerCostCents === "number" &&
    Number.isInteger(ctx.providerCostCents) &&
    ctx.providerCostCents > 0
  ) {
    providerUsd = ctx.providerCostCents / 100;
  }
  if (retailUsd <= 0 && providerUsd <= 0) {
    return null;
  }
  if (retailUsd <= 0) retailUsd = providerUsd;
  if (providerUsd <= 0) providerUsd = retailUsd;
  return {
    offerId,
    name: (ctx.planName ?? "").trim() || "eSIM",
    countryCode: (ctx.destinationCode ?? "").trim() || null,
    countryName: (ctx.destinationName ?? "").trim() || null,
    dataFormatted: (ctx.dataAllowance ?? "").trim() || "—",
    durationDays: durationMatch ? Number(durationMatch[1]) : null,
    priceUSD: retailUsd,
    providerPriceUSD: providerUsd,
    currency: (ctx.currency ?? "USD").trim() || "USD",
  };
}

async function loadAttemptContext(
  ids: ResolvedIds,
  client: typeof prisma | TxClient = prisma
): Promise<AttemptContext | null> {
  if (ids.sourceType === "wallet_purchase") {
    const row = await client.walletEsimPurchase.findUnique({
      where: { id: ids.recordId },
      select: {
        status: true,
        orderId: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        offerId: true,
        customerUserId: true,
        planName: true,
        destinationCode: true,
        destinationName: true,
        dataAllowance: true,
        validity: true,
        priceCents: true,
        providerCostCents: true,
        currency: true,
        fundingSource: true,
        debitTransactionId: true,
        refundTransactionId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
        customer: { select: { email: true, deletedAt: true } },
        debitTransaction: { select: { status: true } },
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: isRefreshInProgress(row),
      status: row.status,
      orderId: row.orderId,
      providerOrderId: (row.providerOrderId ?? "").trim(),
      providerResultKind: row.providerResultKind,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      offerId: row.offerId,
      customerUserId: row.customerUserId,
      customerEmail: row.customer.deletedAt ? null : row.customer.email,
      planName: row.planName,
      destinationCode: row.destinationCode,
      destinationName: row.destinationName,
      dataAllowance: row.dataAllowance,
      validity: row.validity,
      priceCents: row.priceCents,
      retailPriceCents: null,
      providerCostCents: row.providerCostCents,
      currency: row.currency,
      fundingSource: row.fundingSource,
      debitTransactionId: row.debitTransactionId,
      debitStatus: row.debitTransaction?.status ?? null,
      refundTransactionId: row.refundTransactionId,
    };
  }

  if (ids.sourceType === "partner_purchase") {
    const row = await client.partnerEsimPurchase.findUnique({
      where: { id: ids.recordId },
      select: {
        status: true,
        orderId: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        offerId: true,
        planName: true,
        destinationCode: true,
        destinationName: true,
        dataAllowance: true,
        validity: true,
        partnerChargeCents: true,
        retailPriceCents: true,
        providerCostCents: true,
        currency: true,
        fundingSource: true,
        debitTransactionId: true,
        refundTransactionId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationLockedByAdminId: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
        partner: {
          select: {
            userId: true,
            user: { select: { email: true, deletedAt: true } },
          },
        },
        debitTransaction: { select: { id: true } },
      },
    });
    if (!row) return null;
    return {
      caseResolved: Boolean(row.reconciliationResolvedAt),
      caseLocked: Boolean(row.reconciliationLockedAt),
      lockedByAdminId: row.reconciliationLockedByAdminId,
      providerRefreshInProgress: isRefreshInProgress(row),
      status: row.status,
      orderId: row.orderId,
      providerOrderId: (row.providerOrderId ?? "").trim(),
      providerResultKind: row.providerResultKind,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      offerId: row.offerId,
      customerUserId: row.partner.userId,
      customerEmail: row.partner.user.deletedAt
        ? null
        : row.partner.user.email,
      planName: row.planName,
      destinationCode: row.destinationCode,
      destinationName: row.destinationName,
      dataAllowance: row.dataAllowance,
      validity: row.validity,
      priceCents: row.partnerChargeCents,
      retailPriceCents: row.retailPriceCents,
      providerCostCents: row.providerCostCents,
      currency: row.currency,
      fundingSource: row.fundingSource,
      debitTransactionId: row.debitTransactionId,
      debitStatus: row.debitTransaction ? "COMPLETED" : null,
      refundTransactionId: row.refundTransactionId,
    };
  }

  const row = await client.adminPackageAssignment.findUnique({
    where: { id: ids.recordId },
    select: {
      status: true,
      orderId: true,
      providerOrderId: true,
      providerResultKind: true,
      failureCategory: true,
      failureCode: true,
      offerId: true,
      customerUserId: true,
      planName: true,
      destinationCode: true,
      destinationName: true,
      dataAllowance: true,
      validity: true,
      providerCostCents: true,
      providerCurrency: true,
      fundingSource: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      customer: { select: { email: true, deletedAt: true } },
    },
  });
  if (!row) return null;
  return {
    caseResolved: Boolean(row.reconciliationResolvedAt),
    caseLocked: Boolean(row.reconciliationLockedAt),
    lockedByAdminId: row.reconciliationLockedByAdminId,
    providerRefreshInProgress: isRefreshInProgress(row),
    status: row.status,
    orderId: row.orderId,
    providerOrderId: (row.providerOrderId ?? "").trim(),
    providerResultKind: row.providerResultKind,
    failureCategory: row.failureCategory,
    failureCode: row.failureCode,
    offerId: row.offerId,
    customerUserId: row.customerUserId,
    customerEmail: row.customer.deletedAt ? null : row.customer.email,
    planName: row.planName,
    destinationCode: row.destinationCode,
    destinationName: row.destinationName,
    dataAllowance: row.dataAllowance,
    validity: row.validity,
    priceCents: null,
    retailPriceCents: null,
    providerCostCents: row.providerCostCents,
    currency: row.providerCurrency,
    fundingSource: row.fundingSource,
    debitTransactionId: null,
    debitStatus: null,
    refundTransactionId: null,
  };
}

function localEligibilityFromContext(
  sourceType: LocalFinalizationSourceType,
  ctx: AttemptContext,
  currentAdminId: string
): LocalFinalizationEligibility {
  return evaluateLocalFinalizationEligibility({
    sourceType,
    alreadyResolved: ctx.caseResolved,
    locked: ctx.caseLocked,
    lockedByAdminId: ctx.lockedByAdminId,
    currentAdminId,
    status: ctx.status,
    orderId: ctx.orderId,
    providerOrderId: ctx.providerOrderId,
    providerResultKind: ctx.providerResultKind,
    failureCategory: ctx.failureCategory,
    failureCode: ctx.failureCode,
    offerId: ctx.offerId,
    customerUserId: ctx.customerUserId,
    customerEmail: ctx.customerEmail,
    priceCents: ctx.priceCents,
    fundingSource: ctx.fundingSource,
    debitStatus: ctx.debitStatus,
    debitTransactionId: ctx.debitTransactionId,
    refundTransactionId: ctx.refundTransactionId,
    providerRefreshInProgress: ctx.providerRefreshInProgress,
  });
}

/** GET-only provider confirmation. Never checkout. Payload discarded after classify. */
async function confirmProviderSuccess(options: {
  providerOrderId: string;
  expectedOfferId: string;
}): Promise<{ ok: true } | { ok: false; blocker: string }> {
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
  payload = {};

  return evaluateProviderFinalizationEvidence({
    lookupKind: classified.kind,
    orderExists: classified.orderExists,
    offerMatch: classified.offerMatch,
    safeProviderState: classified.safeProviderState,
    hasExpectedOfferId: Boolean(options.expectedOfferId.trim()),
  });
}

async function assertOrderCompatible(
  tx: TxClient,
  options: {
    providerOrderId: string;
    customerUserId: string;
    offerId: string;
    fundingSource: OrderFundingSource;
    attemptId: string;
    sourceType: LocalFinalizationSourceType;
  }
): Promise<
  { ok: true; existingOrderId: string | null } | { ok: false; blocker: string }
> {
  const existing = await tx.order.findUnique({
    where: { providerOrderId: options.providerOrderId },
    select: {
      id: true,
      userId: true,
      offerId: true,
      fundingSource: true,
      walletEsimPurchase: { select: { id: true } },
      partnerEsimPurchase: { select: { id: true } },
      adminPackageAssignment: { select: { id: true } },
    },
  });
  if (!existing) return { ok: true, existingOrderId: null };

  if (
    existing.userId &&
    existing.userId.trim() !== options.customerUserId.trim()
  ) {
    return { ok: false, blocker: "conflicting_order_record" };
  }
  if (
    (existing.offerId ?? "").trim().toUpperCase() !==
    options.offerId.trim().toUpperCase()
  ) {
    return { ok: false, blocker: "conflicting_order_record" };
  }
  if (
    existing.fundingSource &&
    existing.fundingSource !== options.fundingSource
  ) {
    return { ok: false, blocker: "conflicting_order_record" };
  }

  if (options.sourceType === "wallet_purchase") {
    const linked = existing.walletEsimPurchase?.id;
    if (linked && linked !== options.attemptId) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
    if (existing.adminPackageAssignment?.id) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
    if (existing.partnerEsimPurchase?.id) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
  } else if (options.sourceType === "partner_purchase") {
    const linked = existing.partnerEsimPurchase?.id;
    if (linked && linked !== options.attemptId) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
    if (
      existing.walletEsimPurchase?.id ||
      existing.adminPackageAssignment?.id
    ) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
  } else {
    const linked = existing.adminPackageAssignment?.id;
    if (linked && linked !== options.attemptId) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
    if (existing.walletEsimPurchase?.id) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
    if (existing.partnerEsimPurchase?.id) {
      return { ok: false, blocker: "conflicting_attempt_link" };
    }
  }

  return { ok: true, existingOrderId: existing.id };
}

export async function finalizeReconciliationLocalRecord(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
  /** Test seam only — defaults to GET-only provider confirmation. */
  confirmProviderSuccessFn?: typeof confirmProviderSuccess;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || !isLocalFinalizationSourceType(sourceType)) {
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
    FINALIZE_LOCAL_RECORD_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-local-finalize:admin:${admin.id}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many finalization attempts. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-local-finalize:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: "case_rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many finalization attempts for this case. Please wait.",
    };
  }

  const ctx = await loadAttemptContext(ids);
  if (!ctx) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: "missing_local_attempt",
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
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: localFinalizationBlockerLabel(failureCode),
    };
  }

  if (localEligibility.alreadyFinalized) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        orderId: ctx.orderId,
        action: "local_finalize",
        result: "already_finalized",
        idempotent: true,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: true,
      idempotent: true,
      message: "Local record was already finalized.",
    };
  }

  const verifiedOffer = buildOffer(ctx);
  if (!verifiedOffer) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: "missing_package_evidence",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: localFinalizationBlockerLabel("missing_package_evidence"),
    };
  }

  const confirmFn =
    options.confirmProviderSuccessFn ?? confirmProviderSuccess;
  const providerOk = await confirmFn({
    providerOrderId: ctx.providerOrderId,
    expectedOfferId: verifiedOffer.offerId,
  });
  if (!providerOk.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: providerOk.blocker,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: localFinalizationBlockerLabel(providerOk.blocker),
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await loadAttemptContext(ids, tx);
      if (!fresh) {
        return {
          status: "blocked" as const,
          failureCode: "missing_local_attempt",
        };
      }
      const again = localEligibilityFromContext(ids.sourceType, fresh, admin.id);
      if (!again.allowed) {
        return {
          status: "blocked" as const,
          failureCode: again.blockers[0] ?? "blocked",
        };
      }
      if (again.alreadyFinalized) {
        return {
          status: "idempotent" as const,
          orderId: fresh.orderId as string,
        };
      }
      if (
        fresh.providerOrderId.toUpperCase() !==
        ctx.providerOrderId.toUpperCase()
      ) {
        return {
          status: "blocked" as const,
          failureCode: "provider_reference_mismatch",
        };
      }

      const compat = await assertOrderCompatible(tx, {
        providerOrderId: fresh.providerOrderId,
        customerUserId: fresh.customerUserId,
        offerId: fresh.offerId,
        fundingSource:
          ids.sourceType === "partner_purchase"
            ? OrderFundingSource.PARTNER_BALANCE
            : fresh.fundingSource,
        attemptId: ids.recordId,
        sourceType: ids.sourceType,
      });
      if (!compat.ok) {
        return { status: "blocked" as const, failureCode: compat.blocker };
      }

      const offer = buildOffer(fresh);
      if (!offer || !(fresh.customerEmail ?? "").trim()) {
        return {
          status: "blocked" as const,
          failureCode: "missing_package_evidence",
        };
      }

      const order = await persistAssignedOrder(tx, {
        providerOrderId: fresh.providerOrderId,
        customerUserId: fresh.customerUserId,
        customerEmail: fresh.customerEmail as string,
        verifiedOffer: offer,
        fundingSource:
          ids.sourceType === "partner_purchase"
            ? OrderFundingSource.PARTNER_BALANCE
            : fresh.fundingSource,
        status: OrderStatus.COMPLETED,
      });

      if (ids.sourceType === "wallet_purchase") {
        if (fresh.debitTransactionId) {
          const debitCas = await tx.walletTransaction.updateMany({
            where: {
              id: fresh.debitTransactionId,
              status: {
                in: [
                  WalletTransactionStatus.PENDING,
                  WalletTransactionStatus.COMPLETED,
                ],
              },
            },
            data: { status: WalletTransactionStatus.COMPLETED },
          });
          if (debitCas.count === 0) {
            return {
              status: "blocked" as const,
              failureCode: "debit_state_unusable",
            };
          }
        }

        const purchaseCas = await tx.walletEsimPurchase.updateMany({
          where: {
            id: ids.recordId,
            status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
            orderId: null,
            providerOrderId: fresh.providerOrderId,
            reconciliationResolvedAt: null,
            reconciliationLockedByAdminId: admin.id,
            NOT: { reconciliationLockedAt: null },
          },
          data: {
            status: WalletEsimPurchaseStatus.COMPLETED,
            orderId: order.id,
            providerOrderId: order.providerOrderId,
            providerResultKind: "success",
            providerObservedAt: new Date(),
            completedAt: new Date(),
            failureCategory: null,
            failureCode: null,
            reconciliationState: null,
          },
        });
        if (purchaseCas.count === 0) {
          return { status: "blocked" as const, failureCode: "cas_conflict" };
        }

        await completeRewardRedemptionInTx(tx, {
          purchaseId: ids.recordId,
          orderId: order.id,
          actorUserId: admin.id,
        });

        await awardCustomerPurchaseEarnInTx(tx, {
          customerUserId: fresh.customerUserId,
          purchaseId: ids.recordId,
          orderId: order.id,
          actorUserId: admin.id,
        });
      } else if (ids.sourceType === "partner_purchase") {
        const purchaseCas = await tx.partnerEsimPurchase.updateMany({
          where: {
            id: ids.recordId,
            status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
            orderId: null,
            providerOrderId: fresh.providerOrderId,
            reconciliationResolvedAt: null,
            reconciliationLockedByAdminId: admin.id,
            NOT: { reconciliationLockedAt: null },
          },
          data: {
            status: PartnerEsimPurchaseStatus.COMPLETED,
            orderId: order.id,
            providerOrderId: order.providerOrderId,
            providerResultKind: "success",
            providerObservedAt: new Date(),
            completedAt: new Date(),
            failureCategory: null,
            failureCode: null,
            reconciliationState: null,
          },
        });
        if (purchaseCas.count === 0) {
          return { status: "blocked" as const, failureCode: "cas_conflict" };
        }
      } else {
        const assignmentCas = await tx.adminPackageAssignment.updateMany({
          where: {
            id: ids.recordId,
            status: AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED,
            orderId: null,
            providerOrderId: fresh.providerOrderId,
            reconciliationResolvedAt: null,
            reconciliationLockedByAdminId: admin.id,
            NOT: { reconciliationLockedAt: null },
          },
          data: {
            status: AdminPackageAssignmentStatus.COMPLETED,
            orderId: order.id,
            providerOrderId: order.providerOrderId,
            providerResultKind: "success",
            providerObservedAt: new Date(),
            completedAt: new Date(),
            failureCategory: null,
            failureCode: null,
            reconciliationState: null,
          },
        });
        if (assignmentCas.count === 0) {
          return { status: "blocked" as const, failureCode: "cas_conflict" };
        }
      }

      return {
        status: "stored" as const,
        orderId: order.id,
        existed: Boolean(compat.existingOrderId),
      };
    });

    if (result.status === "blocked") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: LOCAL_FINALIZE_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "local_finalize",
          failureCode: result.failureCode,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error: localFinalizationBlockerLabel(result.failureCode),
      };
    }

    const idempotent =
      result.status === "idempotent" ||
      (result.status === "stored" && result.existed);
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        orderId: result.orderId,
        action: "local_finalize",
        result:
          result.status === "idempotent" ? "already_finalized" : "finalized",
        idempotent,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });

    return {
      ok: true,
      idempotent,
      message:
        result.status === "idempotent"
          ? "Local record was already finalized."
          : "Local record finalized from provider evidence.",
    };
  } catch {
    await writeAuditLog({
      actorUserId: admin.id,
      action: LOCAL_FINALIZE_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "local_finalize",
        failureCode: "transaction_failed",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }
}
