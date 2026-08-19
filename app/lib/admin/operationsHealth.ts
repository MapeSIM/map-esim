/**
 * Server-only Admin Operations & System Health aggregator (Part A1).
 * Read-only. Never mutates wallets/orders/reconciliation/email/ICCID/provider state.
 * Never exposes secrets, connection strings, tokens, ICCID, QR, or provider payloads.
 */
import "server-only";

import {
  Role,
  WalletEsimPurchaseStatus,
  AdminPackageAssignmentStatus,
  WalletTopupStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth/session";
import { isEmailConfigured } from "@/app/lib/email/config";
import { isIccidEncryptionConfigured } from "@/app/lib/orders/iccidCrypto";
import { isGuestVesimCheckoutEnabled } from "@/app/lib/vesim/guestCheckoutGate";
import {
  isVesimEnvironmentConfigured,
  resolveLiveBrokerHosts,
} from "@/app/lib/vesim/environment";
import {
  parseVesimBaseUrl,
  parseVesimEnvironmentMode,
  validateVesimEnvironmentConfig,
} from "@/app/lib/vesim/environmentPolicy";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import {
  classifyReconciliationCase,
  categoryMatchesFilter,
  isFailedEmailDelivery,
  isFailedWalletNotification,
  isOrderEmailInboxMatch,
  isVisibleOrderEmailDelivery,
  orderEmailInboxStatusOr,
  RECONCILIATION_STUCK_AGE_MS,
  type ReconciliationCategory,
  type ReconciliationSourceType,
} from "@/app/lib/admin/reconciliationClassify";
import {
  buildOperationsWarnings,
  classifyAppEnvironment,
  classifyAuthUrlSecure,
  classifyCspMode,
  classifyHstsExpectation,
  formatAgeMs,
  formatUtcTimestamp,
  mapDatabaseProbeToStatus,
  paymentGatewayCardDefaults,
  pickDeploymentVersion,
  sanitizeHealthStatus,
  smtpReadinessStatus,
  yesNo,
  type AppEnvLabel,
  type BrokerHostClass,
  type DataFreshness,
  type HealthStatus,
  type HstsExpectation,
  type OpsWarning,
  type ProviderModeLabel,
  type CspMode,
} from "@/app/lib/admin/operationsHealthShared";
import {
  getOperationalControlsHealthSnapshot,
  type OperationalControlsHealthSnapshot,
} from "@/app/lib/admin/operationalControlsPolicy";

const METRICS_TAKE = 500;

export type HealthCardMeta = {
  checkedAtLabel: string;
  freshness: DataFreshness;
};

export type ApplicationDatabaseHealth = HealthCardMeta & {
  applicationStatus: HealthStatus;
  databaseStatus: HealthStatus;
  databaseLatencyMs: number | null;
  environmentLabel: AppEnvLabel;
  deploymentVersion: string | null;
};

export type ReconciliationOpsHealth = HealthCardMeta & {
  actionableCount: number;
  openCount: number;
  lockedCount: number;
  resolvedCount: number;
  highPriorityCount: number;
  criticalPriorityCount: number;
  providerUncertainCount: number;
  finalizationFailedCount: number;
  refundPendingCount: number;
  failedEmailCount: number;
  orderEmailFailedCount: number;
  walletNotificationFailedCount: number;
  iccidPendingCount: number;
  oldestUnresolvedAgeLabel: string;
  refreshOrRecoveryInProgressCount: number;
  truncated: boolean;
};

export type EmailNotificationHealth = HealthCardMeta & {
  billingSmtpStatus: HealthStatus;
  orderEmailFailureCount: number;
  walletNotificationFailureCount: number;
  notConfiguredEmailCount: number;
  oldestUnresolvedEmailAgeLabel: string;
  latestSuccessLabel: string;
  latestFailureLabel: string;
};

export type ProviderReadinessHealth = HealthCardMeta & {
  environmentStatus: HealthStatus;
  modeLabel: ProviderModeLabel;
  configurationValid: boolean;
  brokerHostClass: BrokerHostClass;
  latestSuccessfulObservationLabel: string;
  latestFailureOrUncertaintyLabel: string;
  providerUncertainCount: number;
  refreshInProgressCount: number;
  balanceSupport: "NOT_AVAILABLE" | "ON_DEMAND";
};

export type PaymentReadinessHealth = HealthCardMeta & {
  integrationStatus: HealthStatus;
  productionCredentials: HealthStatus;
  webhookVerification: HealthStatus;
  paymentReconciliation: HealthStatus;
  guestCheckout: "NOT_IMPLEMENTED / DISABLED" | "DISABLED" | "ENABLED";
};

export type SecurityReadinessHealth = HealthCardMeta & {
  authSecretConfigured: "yes" | "no";
  iccidEncryptionConfigured: "yes" | "no";
  authUrlSecure: "yes" | "no" | "unknown";
  hstsExpectation: HstsExpectation;
  cspMode: CspMode;
  billingSmtpConfigured: "yes" | "no";
  googleOAuthConfigured: "yes" | "no";
  vesimConfigurationValid: "yes" | "no";
  guestCheckoutEnabled: "yes" | "no";
  environmentLabel: AppEnvLabel;
  deploymentVersion: string | null;
  latestMigrationName: string | null;
  latestMigrationFinishedLabel: string;
};

export type OperationsHealthDashboard = {
  generatedAtLabel: string;
  applicationDatabase: ApplicationDatabaseHealth;
  reconciliation: ReconciliationOpsHealth;
  email: EmailNotificationHealth;
  provider: ProviderReadinessHealth;
  payment: PaymentReadinessHealth;
  security: SecurityReadinessHealth;
  operationalControls: OperationalControlsHealthSnapshot;
  warnings: OpsWarning[];
};

function nowLabel(d = new Date()): string {
  return formatUtcTimestamp(d);
}

function envPresent(...names: string[]): boolean {
  return names.every((name) => Boolean((process.env[name] ?? "").trim()));
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

function classifyBrokerHost(
  env: NodeJS.ProcessEnv
): { modeLabel: ProviderModeLabel; hostClass: BrokerHostClass; valid: boolean } {
  const mode = parseVesimEnvironmentMode(env.VESIM_ENVIRONMENT);
  const modeLabel: ProviderModeLabel =
    mode === "live" ? "production" : mode === "staging" ? "staging" : "unknown";
  const parsed = parseVesimBaseUrl(env.VESIM_BASE_URL);
  if (!parsed.ok) {
    return {
      modeLabel,
      hostClass: parsed.reason === "missing" ? "MISSING" : "INVALID",
      valid: false,
    };
  }
  const result = validateVesimEnvironmentConfig({
    environment: env.VESIM_ENVIRONMENT,
    baseUrl: env.VESIM_BASE_URL,
    liveBrokerHosts: resolveLiveBrokerHosts(env),
  });
  if (result.ok) {
    return {
      modeLabel: modeLabel === "unknown" ? "staging" : modeLabel,
      hostClass: "STAGING_APPROVED",
      valid: true,
    };
  }
  if (mode === "live") {
    return { modeLabel: "production", hostClass: "LIVE_UNCONFIRMED", valid: false };
  }
  return { modeLabel, hostClass: "INVALID", valid: false };
}

export async function requireActiveAdminForOperations() {
  const sessionUser = await requireRole("ADMIN");
  const admin = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true, name: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    redirect("/signin");
  }
  return { sessionUser, admin };
}

async function probeDatabase(): Promise<{
  status: HealthStatus;
  latencyMs: number | null;
}> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: mapDatabaseProbeToStatus({ ok: true }),
      latencyMs: Math.max(0, Date.now() - started),
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : null;
    return {
      status: mapDatabaseProbeToStatus({
        ok: false,
        errorCode: code || "UNAVAILABLE",
      }),
      latencyMs: null,
    };
  }
}

type MetricCase = {
  sourceType: ReconciliationSourceType;
  category: ReconciliationCategory;
  locked: boolean;
  escalated: boolean;
  priority: string | null;
  updatedAt: Date;
  refreshInProgress: boolean;
};

function toMetricCase(input: {
  sourceType: ReconciliationSourceType;
  status: string;
  providerOrderId?: string | null;
  providerResultKind?: string | null;
  failureCategory?: string | null;
  failureCode?: string | null;
  debitTransactionId?: string | null;
  refundTransactionId?: string | null;
  orderId?: string | null;
  emailDeliveryStatus?: string | null;
  emailNotificationStatus?: string | null;
  iccidHash?: string | null;
  iccidCapturedAt?: Date | null;
  reconciliationResolvedAt?: Date | null;
  reconciliationLockedAt?: Date | null;
  reconciliationEscalatedAt?: Date | null;
  reconciliationEscalationPriority?: string | null;
  updatedAt: Date;
  providerRefreshClaimedAt?: Date | null;
  providerRefreshCompletedAt?: Date | null;
  providerRefreshResult?: string | null;
  now: Date;
}): MetricCase {
  const category = classifyReconciliationCase({
    sourceType: input.sourceType,
    status: input.status,
    providerOrderId: input.providerOrderId,
    providerResultKind: input.providerResultKind,
    failureCategory: input.failureCategory,
    failureCode: input.failureCode,
    debitTransactionId: input.debitTransactionId,
    refundTransactionId: input.refundTransactionId,
    orderId: input.orderId,
    emailDeliveryStatus: input.emailDeliveryStatus,
    emailNotificationStatus: input.emailNotificationStatus,
    iccidHash: input.iccidHash,
    iccidCapturedAt: input.iccidCapturedAt,
    reconciliationResolvedAt: input.reconciliationResolvedAt,
    updatedAt: input.updatedAt,
    now: input.now,
  });
  return {
    sourceType: input.sourceType,
    category,
    locked: Boolean(input.reconciliationLockedAt),
    escalated: Boolean(input.reconciliationEscalatedAt),
    priority: input.reconciliationEscalationPriority ?? null,
    updatedAt: input.updatedAt,
    refreshInProgress: isRefreshInProgress(input),
  };
}

async function collectReconciliationCases(now: Date): Promise<{
  cases: MetricCase[];
  truncated: boolean;
}> {
  const stuckBefore = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS);
  const [
    purchases,
    assignments,
    topups,
    emailPurchases,
    emailAssignments,
    walletEmailTxs,
    iccidOrders,
    resolvedSample,
  ] = await Promise.all([
    prisma.walletEsimPurchase.findMany({
      where: {
        OR: [
          { status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED },
          {
            status: {
              in: [
                WalletEsimPurchaseStatus.FUNDS_RESERVED,
                WalletEsimPurchaseStatus.PROVIDER_PENDING,
              ],
            },
            updatedAt: { lte: stuckBefore },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        debitTransactionId: true,
        refundTransactionId: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
    prisma.adminPackageAssignment.findMany({
      where: {
        OR: [
          { status: AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED },
          {
            status: {
              in: [
                AdminPackageAssignmentStatus.PROVIDER_PENDING,
                AdminPackageAssignmentStatus.READY,
              ],
            },
            updatedAt: { lte: stuckBefore },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
    prisma.walletTopup.findMany({
      where: {
        OR: [
          { status: WalletTopupStatus.RECONCILIATION_REQUIRED },
          {
            status: {
              in: [
                WalletTopupStatus.AWAITING_PAYMENT,
                WalletTopupStatus.PAYMENT_PENDING,
              ],
            },
            updatedAt: { lte: stuckBefore },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        failureCategory: true,
        failureCode: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
      },
    }),
    prisma.walletEsimPurchase.findMany({
      where: {
        reconciliationResolvedAt: null,
        OR: orderEmailInboxStatusOr(now),
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        debitTransactionId: true,
        refundTransactionId: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
    prisma.adminPackageAssignment.findMany({
      where: {
        reconciliationResolvedAt: null,
        OR: orderEmailInboxStatusOr(now),
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
    prisma.walletTransaction.findMany({
      where: {
        emailNotificationStatus: { in: ["failed", "not_configured"] },
        reconciliationResolvedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        emailNotificationStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
      },
    }),
    prisma.order.findMany({
      where: {
        OR: [{ iccidHash: null }, { iccidCapturedAt: null }],
        status: "COMPLETED",
        reconciliationResolvedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        iccidHash: true,
        iccidCapturedAt: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
      },
    }),
    prisma.walletEsimPurchase.findMany({
      where: { NOT: { reconciliationResolvedAt: null } },
      orderBy: { reconciliationResolvedAt: "desc" },
      take: METRICS_TAKE,
      select: {
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        failureCategory: true,
        failureCode: true,
        debitTransactionId: true,
        refundTransactionId: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
        providerRefreshClaimedAt: true,
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
  ]);

  const truncated =
    purchases.length >= METRICS_TAKE ||
    assignments.length >= METRICS_TAKE ||
    topups.length >= METRICS_TAKE ||
    emailPurchases.length >= METRICS_TAKE ||
    emailAssignments.length >= METRICS_TAKE ||
    walletEmailTxs.length >= METRICS_TAKE ||
    iccidOrders.length >= METRICS_TAKE ||
    resolvedSample.length >= METRICS_TAKE;

  const cases: MetricCase[] = [];

  for (const row of purchases) {
    cases.push(
      toMetricCase({
        sourceType: "wallet_purchase",
        ...row,
        now,
      })
    );
  }
  for (const row of assignments) {
    cases.push(
      toMetricCase({
        sourceType: "assignment",
        ...row,
        debitTransactionId: null,
        refundTransactionId: null,
        now,
      })
    );
  }
  for (const row of topups) {
    cases.push(
      toMetricCase({
        sourceType: "topup",
        ...row,
        providerOrderId: null,
        providerResultKind: null,
        debitTransactionId: null,
        refundTransactionId: null,
        orderId: null,
        now,
      })
    );
  }
  for (const row of emailPurchases) {
    if (
      !isOrderEmailInboxMatch(row.emailDeliveryStatus, row.updatedAt, {
        status: row.status,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        now,
      })
    ) {
      continue;
    }
    cases.push(
      toMetricCase({
        sourceType: "order_email",
        ...row,
        now,
      })
    );
  }
  for (const row of emailAssignments) {
    if (
      !isOrderEmailInboxMatch(row.emailDeliveryStatus, row.updatedAt, {
        status: row.status,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        now,
      })
    ) {
      continue;
    }
    cases.push(
      toMetricCase({
        sourceType: "order_email",
        ...row,
        debitTransactionId: null,
        refundTransactionId: null,
        now,
      })
    );
  }
  for (const row of walletEmailTxs) {
    cases.push(
      toMetricCase({
        sourceType: "wallet_email",
        status: "COMPLETED",
        emailNotificationStatus: row.emailNotificationStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        reconciliationLockedAt: row.reconciliationLockedAt,
        reconciliationEscalatedAt: row.reconciliationEscalatedAt,
        reconciliationEscalationPriority: row.reconciliationEscalationPriority,
        updatedAt: row.updatedAt,
        now,
      })
    );
  }
  for (const row of iccidOrders) {
    cases.push(
      toMetricCase({
        sourceType: "iccid",
        status: row.status,
        providerOrderId: row.providerOrderId,
        iccidHash: row.iccidHash,
        iccidCapturedAt: row.iccidCapturedAt,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        reconciliationLockedAt: row.reconciliationLockedAt,
        reconciliationEscalatedAt: row.reconciliationEscalatedAt,
        reconciliationEscalationPriority: row.reconciliationEscalationPriority,
        updatedAt: row.updatedAt,
        now,
      })
    );
  }
  for (const row of resolvedSample) {
    cases.push(
      toMetricCase({
        sourceType: "wallet_purchase",
        ...row,
        now,
      })
    );
  }

  return { cases, truncated };
}

function summarizeReconciliation(
  cases: MetricCase[],
  truncated: boolean,
  checkedAt: Date
): ReconciliationOpsHealth {
  const opts = (c: MetricCase) => ({
    locked: c.locked,
    escalated: c.escalated,
  });
  const match = (filter: Parameters<typeof categoryMatchesFilter>[1]) =>
    cases.filter((c) => categoryMatchesFilter(c.category, filter, opts(c)));

  const actionable = match("needs_review");
  const open = actionable.filter((c) => !c.locked);
  const locked = match("locked");
  const resolved = match("resolved");
  const providerUncertain = match("provider_uncertain");
  const finalizationFailed = match("finalization_failed");
  const refundPending = match("refund_pending");
  const orderEmailFailed = match("order_email_failed");
  const walletNotificationFailed = match("wallet_notification_failed");
  const iccidPending = match("iccid_pending");
  const failedEmail = [...orderEmailFailed, ...walletNotificationFailed];

  let highPriorityCount = 0;
  let criticalPriorityCount = 0;
  for (const c of actionable) {
    const p = (c.priority ?? "").trim().toUpperCase();
    if (p === "HIGH") highPriorityCount += 1;
    if (p === "CRITICAL") criticalPriorityCount += 1;
  }

  let oldestMs: number | null = null;
  for (const c of actionable) {
    const age = checkedAt.getTime() - c.updatedAt.getTime();
    if (!Number.isFinite(age)) continue;
    if (oldestMs == null || age > oldestMs) oldestMs = age;
  }

  const refreshOrRecoveryInProgressCount = actionable.filter(
    (c) => c.refreshInProgress
  ).length;

  return {
    checkedAtLabel: nowLabel(checkedAt),
    freshness: "DATABASE_DERIVED",
    actionableCount: actionable.length,
    openCount: open.length,
    lockedCount: locked.length,
    resolvedCount: resolved.length,
    highPriorityCount,
    criticalPriorityCount,
    providerUncertainCount: providerUncertain.length,
    finalizationFailedCount: finalizationFailed.length,
    refundPendingCount: refundPending.length,
    failedEmailCount: failedEmail.length,
    orderEmailFailedCount: orderEmailFailed.length,
    walletNotificationFailedCount: walletNotificationFailed.length,
    iccidPendingCount: iccidPending.length,
    oldestUnresolvedAgeLabel: formatAgeMs(oldestMs),
    refreshOrRecoveryInProgressCount,
    truncated,
  };
}

async function collectEmailTimestamps(now: Date): Promise<{
  latestSuccess: Date | null;
  latestFailure: Date | null;
  oldestUnresolvedFailure: Date | null;
  notConfiguredCount: number;
}> {
  const [latestSent, latestFailedOrder, latestFailedWallet, oldestFail, notConfigured] =
    await Promise.all([
      prisma.walletTransaction.findFirst({
        where: { emailNotificationStatus: "sent", emailNotifiedAt: { not: null } },
        orderBy: { emailNotifiedAt: "desc" },
        select: { emailNotifiedAt: true },
      }),
      prisma.walletEsimPurchase.findFirst({
        where: { OR: orderEmailInboxStatusOr(now) },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.walletTransaction.findFirst({
        where: {
          emailNotificationStatus: { in: ["failed", "not_configured"] },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.walletTransaction.findFirst({
        where: {
          emailNotificationStatus: { in: ["failed", "not_configured"] },
          reconciliationResolvedAt: null,
        },
        orderBy: { updatedAt: "asc" },
        select: { updatedAt: true },
      }),
      prisma.walletTransaction.count({
        where: {
          emailNotificationStatus: "not_configured",
          reconciliationResolvedAt: null,
        },
      }),
    ]);

  const failureTimes = [latestFailedOrder?.updatedAt, latestFailedWallet?.updatedAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime());

  return {
    latestSuccess: latestSent?.emailNotifiedAt ?? null,
    latestFailure: failureTimes[0] ?? null,
    oldestUnresolvedFailure: oldestFail?.updatedAt ?? null,
    notConfiguredCount: notConfigured,
  };
}

async function collectProviderObservationTimestamps(): Promise<{
  latestSuccess: Date | null;
  latestFailureOrUncertainty: Date | null;
}> {
  const [successObs, uncertainObs, refreshDone] = await Promise.all([
    prisma.walletEsimPurchase.findFirst({
      where: {
        providerResultKind: "success",
        providerObservedAt: { not: null },
      },
      orderBy: { providerObservedAt: "desc" },
      select: { providerObservedAt: true },
    }),
    prisma.walletEsimPurchase.findFirst({
      where: {
        OR: [
          { providerResultKind: "uncertain" },
          { providerResultKind: "declined" },
        ],
        providerObservedAt: { not: null },
      },
      orderBy: { providerObservedAt: "desc" },
      select: { providerObservedAt: true },
    }),
    prisma.walletEsimPurchase.findFirst({
      where: {
        providerRefreshCompletedAt: { not: null },
        providerRefreshResult: { not: null },
      },
      orderBy: { providerRefreshCompletedAt: "desc" },
      select: {
        providerRefreshCompletedAt: true,
        providerRefreshResult: true,
      },
    }),
  ]);

  let latestSuccess = successObs?.providerObservedAt ?? null;
  let latestFailure = uncertainObs?.providerObservedAt ?? null;
  if (refreshDone?.providerRefreshCompletedAt) {
    const kind = (refreshDone.providerRefreshResult ?? "").toUpperCase();
    if (kind === "FOUND" && !latestSuccess) {
      latestSuccess = refreshDone.providerRefreshCompletedAt;
    }
    if (
      (kind === "TIMEOUT" ||
        kind === "UNKNOWN" ||
        kind === "NOT_FOUND" ||
        kind === "PROVIDER_ERROR") &&
      (!latestFailure ||
        refreshDone.providerRefreshCompletedAt.getTime() > latestFailure.getTime())
    ) {
      latestFailure = refreshDone.providerRefreshCompletedAt;
    }
  }

  return {
    latestSuccess,
    latestFailureOrUncertainty: latestFailure,
  };
}

async function readLatestMigration(): Promise<{
  name: string | null;
  finishedAt: Date | null;
}> {
  try {
    const rows = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1`;
    const row = rows[0];
    if (!row) return { name: null, finishedAt: null };
    const name = String(row.migration_name ?? "").trim().slice(0, 120);
    if (!name || !/^[A-Za-z0-9_]+$/.test(name)) {
      return { name: null, finishedAt: null };
    }
    return { name, finishedAt: row.finished_at ?? null };
  } catch {
    return { name: null, finishedAt: null };
  }
}

/**
 * Aggregate sanitized operations health. Call only after active-admin gate.
 */
export async function getOperationsHealthDashboard(): Promise<OperationsHealthDashboard> {
  const checkedAt = new Date();
  const db = await probeDatabase();
  const vesimMode = parseVesimEnvironmentMode(process.env.VESIM_ENVIRONMENT);
  const envLabel = classifyAppEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vesimMode,
  });
  const deploymentVersion = pickDeploymentVersion({
    MAP_ESIM_DEPLOYMENT_VERSION: process.env.MAP_ESIM_DEPLOYMENT_VERSION,
    APP_VERSION: process.env.APP_VERSION,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  });

  const applicationDatabase: ApplicationDatabaseHealth = {
    checkedAtLabel: nowLabel(checkedAt),
    freshness: "LIVE_LOCAL",
    applicationStatus: sanitizeHealthStatus("HEALTHY"),
    databaseStatus: db.status,
    databaseLatencyMs: db.latencyMs,
    environmentLabel: envLabel,
    deploymentVersion,
  };

  let reconciliation: ReconciliationOpsHealth;
  let emailExtra = {
    latestSuccess: null as Date | null,
    latestFailure: null as Date | null,
    oldestUnresolvedFailure: null as Date | null,
    notConfiguredCount: 0,
  };
  let providerObs = {
    latestSuccess: null as Date | null,
    latestFailureOrUncertainty: null as Date | null,
  };
  let migration = { name: null as string | null, finishedAt: null as Date | null };

  if (db.status === "HEALTHY") {
    const [{ cases, truncated }, emailTs, providerTs, mig] = await Promise.all([
      collectReconciliationCases(checkedAt),
      collectEmailTimestamps(checkedAt),
      collectProviderObservationTimestamps(),
      readLatestMigration(),
    ]);
    reconciliation = summarizeReconciliation(cases, truncated, checkedAt);
    emailExtra = emailTs;
    providerObs = providerTs;
    migration = mig;
  } else {
    reconciliation = {
      checkedAtLabel: nowLabel(checkedAt),
      freshness: "NOT_AVAILABLE",
      actionableCount: 0,
      openCount: 0,
      lockedCount: 0,
      resolvedCount: 0,
      highPriorityCount: 0,
      criticalPriorityCount: 0,
      providerUncertainCount: 0,
      finalizationFailedCount: 0,
      refundPendingCount: 0,
      failedEmailCount: 0,
      orderEmailFailedCount: 0,
      walletNotificationFailedCount: 0,
      iccidPendingCount: 0,
      oldestUnresolvedAgeLabel: "—",
      refreshOrRecoveryInProgressCount: 0,
      truncated: false,
    };
  }

  let billingConfigured = false;
  try {
    billingConfigured = isEmailConfigured("billing");
  } catch {
    billingConfigured = false;
  }

  const email: EmailNotificationHealth = {
    checkedAtLabel: nowLabel(checkedAt),
    freshness:
      db.status === "HEALTHY" ? "DATABASE_DERIVED" : "CONFIGURATION_DERIVED",
    billingSmtpStatus: smtpReadinessStatus(billingConfigured),
    orderEmailFailureCount: reconciliation.orderEmailFailedCount,
    walletNotificationFailureCount: reconciliation.walletNotificationFailedCount,
    notConfiguredEmailCount: emailExtra.notConfiguredCount,
    oldestUnresolvedEmailAgeLabel: formatAgeMs(
      emailExtra.oldestUnresolvedFailure
        ? checkedAt.getTime() - emailExtra.oldestUnresolvedFailure.getTime()
        : null
    ),
    latestSuccessLabel: formatUtcTimestamp(emailExtra.latestSuccess),
    latestFailureLabel: formatUtcTimestamp(emailExtra.latestFailure),
  };

  const broker = classifyBrokerHost(process.env);
  const vesimValid = isVesimEnvironmentConfigured();
  const provider: ProviderReadinessHealth = {
    checkedAtLabel: nowLabel(checkedAt),
    freshness:
      providerObs.latestSuccess || providerObs.latestFailureOrUncertainty
        ? "DATABASE_DERIVED"
        : "CONFIGURATION_DERIVED",
    environmentStatus: vesimValid
      ? "HEALTHY"
      : broker.hostClass === "MISSING"
        ? "NOT_CONFIGURED"
        : "DEGRADED",
    modeLabel: broker.modeLabel,
    configurationValid: vesimValid,
    brokerHostClass: broker.hostClass,
    latestSuccessfulObservationLabel: formatUtcTimestamp(providerObs.latestSuccess),
    latestFailureOrUncertaintyLabel: formatUtcTimestamp(
      providerObs.latestFailureOrUncertainty
    ),
    providerUncertainCount: reconciliation.providerUncertainCount,
    refreshInProgressCount: reconciliation.refreshOrRecoveryInProgressCount,
    balanceSupport: "ON_DEMAND",
  };

  const guestEnabled = isGuestVesimCheckoutEnabled();
  const paymentDefaults = paymentGatewayCardDefaults();
  const payment: PaymentReadinessHealth = {
    checkedAtLabel: nowLabel(checkedAt),
    freshness: "CONFIGURATION_DERIVED",
    ...paymentDefaults,
    // Guest checkout is not implemented — controls must never enable it.
    guestCheckout: "NOT_IMPLEMENTED / DISABLED",
  };

  const operationalControls = await getOperationalControlsHealthSnapshot();

  const authSecretConfigured = Boolean((process.env.AUTH_SECRET ?? "").trim());
  const iccidKeyConfigured = isIccidEncryptionConfigured();
  const googleOAuthConfigured = envPresent(
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET"
  );
  const authUrl =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || null;

  const security: SecurityReadinessHealth = {
    checkedAtLabel: nowLabel(checkedAt),
    freshness: "CONFIGURATION_DERIVED",
    authSecretConfigured: yesNo(authSecretConfigured),
    iccidEncryptionConfigured: yesNo(iccidKeyConfigured),
    authUrlSecure: classifyAuthUrlSecure({
      nodeEnv: process.env.NODE_ENV,
      authUrl,
    }),
    hstsExpectation: classifyHstsExpectation({
      nodeEnv: process.env.NODE_ENV,
      authUrl,
    }),
    cspMode: classifyCspMode(),
    billingSmtpConfigured: yesNo(billingConfigured),
    googleOAuthConfigured: yesNo(googleOAuthConfigured),
    vesimConfigurationValid: yesNo(vesimValid),
    guestCheckoutEnabled: yesNo(guestEnabled),
    environmentLabel: envLabel,
    deploymentVersion,
    latestMigrationName: migration.name,
    latestMigrationFinishedLabel: formatUtcTimestamp(migration.finishedAt),
  };

  const warnings = buildOperationsWarnings({
    databaseStatus: applicationDatabase.databaseStatus,
    criticalPriorityCount: reconciliation.criticalPriorityCount,
    highPriorityCount: reconciliation.highPriorityCount,
    providerUncertainCount: reconciliation.providerUncertainCount,
    refundPendingCount: reconciliation.refundPendingCount,
    failedEmailCount: reconciliation.failedEmailCount,
    billingSmtpConfigured: billingConfigured,
    vesimConfigValid: vesimValid,
    vesimMode: broker.modeLabel,
    vesimHostClass: broker.hostClass,
    guestCheckoutEnabled: guestEnabled,
    deploymentVersion,
    authSecretConfigured,
    iccidKeyConfigured,
    pausedOperationalControlCount:
      operationalControls.pausedControlKeys.length,
    transactionsMaintenancePaused:
      operationalControls.pausedControlKeys.includes(
        "TRANSACTION_MAINTENANCE"
      ),
  });

  return {
    generatedAtLabel: nowLabel(checkedAt),
    applicationDatabase,
    reconciliation,
    email,
    provider,
    payment,
    security,
    operationalControls,
    warnings,
  };
}

/** Exported for QA — proves email failure helpers stay aligned. */
export const __opsHealthQaHooks = {
  isFailedEmailDelivery,
  isFailedWalletNotification,
  isVisibleOrderEmailDelivery,
  mapDatabaseProbeToStatus,
  sanitizeHealthStatus,
};
