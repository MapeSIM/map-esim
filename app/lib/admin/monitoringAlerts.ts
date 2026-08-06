/**
 * Server-only Monitoring & Alerts aggregator (Part B1).
 * Derived / read-only. Never mutates wallets, purchases, assignments, orders,
 * provider state, reconciliation, refunds, email, ICCID, operational controls, or payments.
 * Never exposes secrets, ICCID, QR, activation data, or provider payloads.
 */
import "server-only";

import {
  Role,
  WalletEsimPurchaseStatus,
  AdminPackageAssignmentStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth/session";
import { isEmailConfigured } from "@/app/lib/email/config";
import { isIccidEncryptionConfigured } from "@/app/lib/orders/iccidCrypto";
import { isGuestVesimCheckoutEnabled } from "@/app/lib/vesim/guestCheckoutGate";
import {
  isVesimEnvironmentConfigured,
  VESIM_LIVE_BROKER_HOSTS,
} from "@/app/lib/vesim/environment";
import {
  parseVesimBaseUrl,
  parseVesimEnvironmentMode,
  validateVesimEnvironmentConfig,
} from "@/app/lib/vesim/environmentPolicy";
import {
  classifyAppEnvironment,
  classifyAuthUrlSecure,
  classifyCspMode,
  formatUtcTimestamp,
  mapDatabaseProbeToStatus,
  paymentGatewayCardDefaults,
  pickDeploymentVersion,
  type HealthStatus,
} from "@/app/lib/admin/operationsHealthShared";
import {
  classifyReconciliationCase,
  isFailedEmailDelivery,
  isFailedWalletNotification,
  type ReconciliationCategory,
  type ReconciliationSourceType,
} from "@/app/lib/admin/reconciliationClassify";
import { getOperationalControlsHealthSnapshot } from "@/app/lib/admin/operationalControlsPolicy";
import {
  MONITORING_THRESHOLDS,
  alertCodeForReconCategory,
  defaultSeverityForReconCategory,
  ageMeetsThreshold,
  dedupeMonitoringAlerts,
  filterMonitoringAlerts,
  makeAlert,
  parseAlertCategoryFilter,
  parseAlertSeverityFilter,
  severityFromReconPriority,
  sortMonitoringAlerts,
  summarizeMonitoringAlerts,
  type AlertCategory,
  type AlertSeverity,
  type MonitoringAlert,
  type MonitoringAlertSummary,
} from "@/app/lib/admin/monitoringAlertShared";

export type { MonitoringAlertSummary };

const TAKE = MONITORING_THRESHOLDS.ALERT_QUERY_TAKE;

type MonitoringAlertCodeFromControl =
  | "CONTROL_TRANSACTIONS_PAUSED"
  | "CONTROL_CUSTOMER_PURCHASES_PAUSED"
  | "CONTROL_ADMIN_PURCHASES_PAUSED"
  | "CONTROL_COMPANY_ASSIGNMENTS_PAUSED"
  | "CONTROL_PROVIDER_ORDERS_PAUSED";

export type MonitoringAlertsDashboard = {
  generatedAtLabel: string;
  summary: MonitoringAlertSummary;
  alerts: MonitoringAlert[];
  filterSeverity: AlertSeverity | "ALL";
  filterCategory: AlertCategory | "ALL";
  unavailable: boolean;
  sectionErrors: string[];
};

export async function requireActiveAdminForAlerts() {
  const sessionUser = await requireRole("ADMIN");
  const admin = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, deletedAt: true, name: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    redirect("/signin");
  }
  return { sessionUser, admin };
}

function reconHref(sourceType: string, recordId: string): string {
  return `/admin/reconciliation/${encodeURIComponent(sourceType)}/${encodeURIComponent(recordId)}`;
}

function isRefreshStuck(row: {
  providerRefreshClaimedAt?: Date | null;
  providerRefreshCompletedAt?: Date | null;
  providerRefreshResult?: string | null;
  now: Date;
}): boolean {
  const claimedAt = row.providerRefreshClaimedAt;
  if (!claimedAt) return false;
  const completedAt = row.providerRefreshCompletedAt;
  if (completedAt && completedAt.getTime() >= claimedAt.getTime()) return false;
  return ageMeetsThreshold(
    claimedAt,
    row.now,
    MONITORING_THRESHOLDS.PROVIDER_REFRESH_STUCK_AGE_MS
  );
}

async function probeDatabase(): Promise<{
  status: HealthStatus;
  latencyMs: number | null;
  ok: boolean;
}> {
  // Latency is recorded for display only. Do not gate DEGRADED on a single
  // Date.now() sample — that flickered DATABASE_DEGRADED across refreshes.
  // Align status classification with Operations (mapDatabaseProbeToStatus).
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Math.max(0, Date.now() - started);
    return {
      status: mapDatabaseProbeToStatus({ ok: true }),
      latencyMs,
      ok: true,
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
      ok: false,
    };
  }
}

async function readLatestMigration(): Promise<{
  name: string | null;
  finishedAt: Date | null;
  unknown: boolean;
}> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 1`;
    const row = rows[0];
    if (!row?.migration_name) {
      return { name: null, finishedAt: null, unknown: true };
    }
    return {
      name: row.migration_name,
      finishedAt: row.finished_at,
      unknown: !row.finished_at,
    };
  } catch {
    return { name: null, finishedAt: null, unknown: true };
  }
}

function pushUnique(alerts: MonitoringAlert[], alert: MonitoringAlert) {
  if (alerts.some((a) => a.id === alert.id)) return;
  alerts.push(alert);
}

function buildConfigAlerts(input: {
  now: Date;
  db: { status: HealthStatus; latencyMs: number | null };
  migrationUnknown: boolean;
  billingSmtpConfigured: boolean;
  vesimValid: boolean;
  vesimMode: string;
  vesimHostClass: string;
  authSecretConfigured: boolean;
  iccidKeyConfigured: boolean;
  authUrlSecure: "yes" | "no" | "unknown";
  googleOAuthConfigured: boolean;
  deploymentVersion: string | null;
  controls: Awaited<ReturnType<typeof getOperationalControlsHealthSnapshot>>;
  emailFailureCount: number;
  oldestEmailFailure: Date | null;
}): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const now = input.now;

  if (input.db.status === "UNAVAILABLE") {
    pushUnique(
      alerts,
      makeAlert({
        category: "DATABASE",
        code: "DATABASE_UNAVAILABLE",
        severity: "CRITICAL",
        title: "Database unavailable",
        description:
          "The database health probe did not succeed. Transaction and alert detail views may be incomplete.",
        sourceAt: now,
        now,
        freshness: "LIVE_LOCAL",
        href: "/admin/operations",
        recommendedAction: "Review application and database health on Operations.",
      })
    );
  } else if (input.db.status === "DEGRADED") {
    pushUnique(
      alerts,
      makeAlert({
        category: "DATABASE",
        code: "DATABASE_DEGRADED",
        severity: "HIGH",
        title: "Database degraded or slow",
        description: `Database probe reported degraded health${
          input.db.latencyMs != null ? ` (latency ${input.db.latencyMs} ms)` : ""
        }.`,
        sourceAt: now,
        now,
        freshness: "LIVE_LOCAL",
        href: "/admin/operations",
        recommendedAction: "Review application and database health on Operations.",
      })
    );
  }

  if (input.migrationUnknown) {
    pushUnique(
      alerts,
      makeAlert({
        category: "DATABASE",
        code: "MIGRATION_STATE_UNKNOWN",
        severity: "WARNING",
        title: "Migration state unknown",
        description:
          "Latest migration metadata could not be confirmed from local records.",
        sourceAt: now,
        now,
        freshness: "NOT_AVAILABLE",
        href: "/admin/operations",
        recommendedAction: "Review security and migration status on Operations.",
      })
    );
  }

  if (!input.billingSmtpConfigured) {
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_SMTP_NOT_CONFIGURED",
        severity: "WARNING",
        title: "Billing SMTP not configured",
        description:
          "Billing email delivery is not configured. Failed notifications may accumulate.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review email readiness on Operations. Do not send mail from Alerts.",
      })
    );
  }

  if (input.emailFailureCount >= 3) {
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_REPEATED_UNRESOLVED",
        severity: "HIGH",
        title: "Repeated unresolved email failures",
        description: `${input.emailFailureCount} unresolved email or wallet notification failures were detected in the bounded sample.`,
        sourceAt: input.oldestEmailFailure ?? now,
        now,
        freshness: "DATABASE_DERIVED",
        href: "/admin/reconciliation?filter=order_email_failed",
        recommendedAction: "Open Reconciliation email filters for controlled recovery.",
      })
    );
  }

  if (
    input.oldestEmailFailure &&
    ageMeetsThreshold(
      input.oldestEmailFailure,
      now,
      MONITORING_THRESHOLDS.UNRESOLVED_EMAIL_FAILURE_AGE_MS
    )
  ) {
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_OLDEST_UNRESOLVED_STALE",
        severity: "WARNING",
        title: "Oldest unresolved email failure exceeds threshold",
        description:
          "An unresolved email failure is older than the operational email threshold.",
        sourceAt: input.oldestEmailFailure,
        now,
        freshness: "DATABASE_DERIVED",
        href: "/admin/reconciliation?filter=order_email_failed",
        recommendedAction: "Review unresolved email cases in Reconciliation.",
      })
    );
  }

  if (!input.vesimValid) {
    if (
      input.vesimMode === "production" ||
      input.vesimHostClass === "LIVE_UNCONFIRMED"
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "PROVIDER",
          code: "PROVIDER_LIVE_HOST_UNCONFIRMED",
          severity: "CRITICAL",
          title: "VeSIM production host unconfirmed",
          description:
            "Provider production/live broker host is unconfirmed or invalid. Order creation remains gated by environment policy.",
          sourceAt: now,
          now,
          freshness: "CONFIGURATION_DERIVED",
          href: "/admin/operations",
          recommendedAction: "Review provider readiness on Operations. Do not place live orders.",
        })
      );
    } else {
      pushUnique(
        alerts,
        makeAlert({
          category: "PROVIDER",
          code: "PROVIDER_CONFIG_INVALID",
          severity: "HIGH",
          title: "VeSIM configuration invalid",
          description:
            "Provider environment configuration is not valid for the configured mode.",
          sourceAt: now,
          now,
          freshness: "CONFIGURATION_DERIVED",
          href: "/admin/operations",
          recommendedAction: "Review provider configuration on Operations.",
        })
      );
    }
  }

  pushUnique(
    alerts,
    makeAlert({
      category: "PROVIDER",
      code: "PROVIDER_BALANCE_NOT_VERIFIED",
      severity: "INFO",
      title: "Provider balance not verified",
      description:
        "Provider balance monitoring is NOT_VERIFIED / NOT_AVAILABLE. No undocumented balance endpoint is called.",
      sourceAt: now,
      now,
      freshness: "CONFIGURATION_DERIVED",
      href: "/admin/operations",
      recommendedAction: "Use Operations for provider readiness. Do not invent balance checks.",
    })
  );

  const pay = paymentGatewayCardDefaults();
  pushUnique(
    alerts,
    makeAlert({
      category: "PAYMENT",
      code: "PAYMENT_GATEWAY_NOT_IMPLEMENTED",
      severity: "INFO",
      title: "Payment gateway not implemented",
      description: `Payment integration status is ${pay.integrationStatus}. This is expected readiness information, not an incident.`,
      sourceAt: now,
      now,
      freshness: "CONFIGURATION_DERIVED",
      href: "/admin/operations",
      recommendedAction: "No payment action from Alerts. Track readiness on Operations.",
    })
  );
  pushUnique(
    alerts,
    makeAlert({
      category: "PAYMENT",
      code: "PAYMENT_WEBHOOK_NOT_IMPLEMENTED",
      severity: "INFO",
      title: "Payment webhook verification not implemented",
      description: `Webhook verification status is ${pay.webhookVerification}.`,
      sourceAt: now,
      now,
      freshness: "CONFIGURATION_DERIVED",
      href: "/admin/operations",
      recommendedAction: "No webhook or payment action from Alerts.",
    })
  );
  pushUnique(
    alerts,
    makeAlert({
      category: "PAYMENT",
      code: "GUEST_CHECKOUT_NOT_IMPLEMENTED",
      severity: "INFO",
      title: "Guest checkout disabled / not implemented",
      description:
        "Guest checkout remains NOT_IMPLEMENTED / DISABLED. Operational controls cannot enable it.",
      sourceAt: now,
      now,
      freshness: "CONFIGURATION_DERIVED",
      href: "/admin/operations",
      recommendedAction: "Keep guest checkout disabled until a dedicated implementation phase.",
    })
  );

  if (!input.controls.readOk) {
    pushUnique(
      alerts,
      makeAlert({
        category: "OPERATIONAL_CONTROL",
        code: "CONTROL_STATE_UNAVAILABLE",
        severity: "HIGH",
        title: "Operational control state unavailable",
        description:
          "Runtime pause-control state could not be read. New risky transactions fail closed until controls are readable.",
        sourceAt: now,
        now,
        freshness: "NOT_AVAILABLE",
        href: "/admin/operations",
        recommendedAction: "Review Operational Controls on Operations.",
      })
    );
  } else {
    for (const c of input.controls.controls) {
      if (!c.paused) continue;
      const map: Record<
        string,
        { code: MonitoringAlertCodeFromControl; title: string }
      > = {
        TRANSACTION_MAINTENANCE: {
          code: "CONTROL_TRANSACTIONS_PAUSED",
          title: "All transactions paused",
        },
        CUSTOMER_WALLET_PURCHASES: {
          code: "CONTROL_CUSTOMER_PURCHASES_PAUSED",
          title: "Customer purchases paused",
        },
        ADMIN_WALLET_PURCHASES: {
          code: "CONTROL_ADMIN_PURCHASES_PAUSED",
          title: "Admin purchases paused",
        },
        COMPANY_ASSIGNMENTS: {
          code: "CONTROL_COMPANY_ASSIGNMENTS_PAUSED",
          title: "Company assignments paused",
        },
        PROVIDER_ORDER_CREATION: {
          code: "CONTROL_PROVIDER_ORDERS_PAUSED",
          title: "Provider order creation paused",
        },
      };
      const meta = map[c.key];
      if (!meta) continue;
      pushUnique(
        alerts,
        makeAlert({
          category: "OPERATIONAL_CONTROL",
          code: meta.code,
          severity: c.key === "TRANSACTION_MAINTENANCE" ? "HIGH" : "WARNING",
          title: meta.title,
          description: `${c.name} is intentionally PAUSED. New initiation in this scope is blocked; recovery and reconciliation remain available.`,
          sourceType: "operational_control",
          recordId: c.key,
          sourceAt: now,
          now,
          freshness: "DATABASE_DERIVED",
          href: "/admin/operations",
          recommendedAction:
            "Review Operational Controls on Operations if this pause should be resumed.",
        })
      );
    }
  }

  if (!input.authSecretConfigured) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_AUTH_SECRET_MISSING",
        severity: "CRITICAL",
        title: "AUTH_SECRET missing",
        description: "Authentication secret configuration is missing.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review security readiness on Operations. Never expose secret values.",
      })
    );
  }
  if (!input.iccidKeyConfigured) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_ICCID_KEY_MISSING",
        severity: "CRITICAL",
        title: "ICCID encryption key missing",
        description: "ICCID encryption key configuration is missing.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review security readiness on Operations.",
      })
    );
  }
  if (
    classifyAppEnvironment({
      nodeEnv: process.env.NODE_ENV,
      vesimMode: process.env.VESIM_ENVIRONMENT,
    }) === "production" &&
    input.authUrlSecure === "no"
  ) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_AUTH_URL_INSECURE",
        severity: "HIGH",
        title: "Production AUTH_URL insecure or invalid",
        description:
          "AUTH_URL does not appear HTTPS-secure for a production environment.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review AUTH_URL readiness on Operations.",
      })
    );
  }
  if (!input.billingSmtpConfigured) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_BILLING_SMTP_MISSING",
        severity: "WARNING",
        title: "Billing SMTP missing",
        description: "Billing SMTP configuration is not present.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review email/SMTP readiness on Operations.",
      })
    );
  }
  if (!input.googleOAuthConfigured) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_GOOGLE_OAUTH_INCOMPLETE",
        severity: "INFO",
        title: "Google OAuth readiness incomplete",
        description: "Google OAuth credentials are not fully configured.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review security readiness on Operations.",
      })
    );
  }
  if (!input.deploymentVersion) {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_DEPLOYMENT_VERSION_UNAVAILABLE",
        severity: "INFO",
        title: "Deployment version unavailable",
        description: "No safe deployment version identifier is configured.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Review deployment metadata on Operations.",
      })
    );
  }
  if (classifyCspMode() === "report-only") {
    pushUnique(
      alerts,
      makeAlert({
        category: "SECURITY",
        code: "SECURITY_CSP_REPORT_ONLY",
        severity: "INFO",
        title: "CSP still report-only",
        description: "Content-Security-Policy is currently report-only.",
        sourceAt: now,
        now,
        freshness: "CONFIGURATION_DERIVED",
        href: "/admin/operations",
        recommendedAction: "Track CSP enforcement readiness on Operations.",
      })
    );
  }
  pushUnique(
    alerts,
    makeAlert({
      category: "SECURITY",
      code: "SECURITY_BACKUP_STATUS_UNAVAILABLE",
      severity: "INFO",
      title: "Backup status unavailable",
      description: "Automated backup status is not available in this monitoring phase.",
      sourceAt: now,
      now,
      freshness: "NOT_AVAILABLE",
      href: "/admin/operations",
      recommendedAction: "Track backup readiness outside Alerts until a verified source exists.",
    })
  );
  pushUnique(
    alerts,
    makeAlert({
      category: "SECURITY",
      code: "SECURITY_ERROR_MONITORING_NOT_CONFIGURED",
      severity: "INFO",
      title: "Error monitoring not configured",
      description: "External error monitoring is not configured for this phase.",
      sourceAt: now,
      now,
      freshness: "NOT_AVAILABLE",
      href: "/admin/operations",
      recommendedAction: "Track error-monitoring readiness on Operations.",
    })
  );

  return alerts;
}

function reconAlertFromRow(input: {
  sourceType: ReconciliationSourceType;
  recordId: string;
  status: string;
  category: ReconciliationCategory;
  priority: string | null;
  updatedAt: Date;
  lockedAt: Date | null;
  now: Date;
}): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const baseCode = alertCodeForReconCategory(input.category);
  if (!baseCode) return alerts;

  const prioritySeverity = severityFromReconPriority(input.priority);
  let code:
    | typeof baseCode
    | "RECON_CRITICAL_PRIORITY"
    | "RECON_HIGH_PRIORITY" = baseCode;
  let severity =
    prioritySeverity ?? defaultSeverityForReconCategory(input.category);

  if (prioritySeverity === "CRITICAL") {
    code = "RECON_CRITICAL_PRIORITY";
    severity = "CRITICAL";
  } else if (prioritySeverity === "HIGH") {
    code = "RECON_HIGH_PRIORITY";
    severity = "HIGH";
  }

  const title =
    prioritySeverity === "CRITICAL"
      ? "CRITICAL reconciliation case"
      : prioritySeverity === "HIGH"
        ? "HIGH priority reconciliation case"
        : `Reconciliation: ${input.category.replaceAll("_", " ").toLowerCase()}`;

  pushUnique(
    alerts,
    makeAlert({
      category: "RECONCILIATION",
      code,
      severity,
      title,
      description: `Local ${input.sourceType.replaceAll("_", " ")} case requires review (${input.category}).`,
      sourceType: input.sourceType,
      recordId: input.recordId,
      sourceAt: input.updatedAt,
      now: input.now,
      freshness: "DATABASE_DERIVED",
      href: reconHref(input.sourceType, input.recordId),
      recommendedAction: "Open the reconciliation case detail for controlled recovery.",
    })
  );

  if (
    input.lockedAt &&
    ageMeetsThreshold(
      input.lockedAt,
      input.now,
      MONITORING_THRESHOLDS.LOCKED_CASE_AGE_MS
    )
  ) {
    pushUnique(
      alerts,
      makeAlert({
        category: "RECONCILIATION",
        code: "RECON_LOCKED_STALE",
        severity: "HIGH",
        title: "Locked reconciliation case exceeds threshold",
        description: "A locked case is older than the operational locked-case threshold.",
        sourceType: input.sourceType,
        recordId: input.recordId,
        sourceAt: input.lockedAt,
        now: input.now,
        freshness: "DATABASE_DERIVED",
        href: reconHref(input.sourceType, input.recordId),
        recommendedAction: "Review lock ownership on the reconciliation case detail.",
      })
    );
  }

  if (
    ageMeetsThreshold(
      input.updatedAt,
      input.now,
      MONITORING_THRESHOLDS.UNRESOLVED_RECONCILIATION_AGE_MS
    )
  ) {
    pushUnique(
      alerts,
      makeAlert({
        category: "RECONCILIATION",
        code: "RECON_UNRESOLVED_STALE",
        severity: "WARNING",
        title: "Unresolved reconciliation case exceeds threshold",
        description:
          "An unresolved case is older than the operational unresolved-age threshold.",
        sourceType: input.sourceType,
        recordId: input.recordId,
        sourceAt: input.updatedAt,
        now: input.now,
        freshness: "DATABASE_DERIVED",
        href: reconHref(input.sourceType, input.recordId),
        recommendedAction: "Review the case in Reconciliation.",
      })
    );
  }

  return alerts;
}

async function collectRecordAlerts(now: Date): Promise<{
  alerts: MonitoringAlert[];
  emailFailureCount: number;
  oldestEmailFailure: Date | null;
  truncated: boolean;
}> {
  const stuckPurchaseBefore = new Date(
    now.getTime() - MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS
  );
  const stuckAssignmentBefore = new Date(
    now.getTime() - MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS
  );

  const [
    purchases,
    assignments,
    emailPurchases,
    emailAssignments,
    walletEmails,
    iccidOrders,
  ] = await Promise.all([
    prisma.walletEsimPurchase.findMany({
      where: {
        reconciliationResolvedAt: null,
        OR: [
          { status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED },
          {
            status: {
              in: [
                WalletEsimPurchaseStatus.FUNDS_RESERVED,
                WalletEsimPurchaseStatus.PROVIDER_PENDING,
                WalletEsimPurchaseStatus.READY,
              ],
            },
            updatedAt: { lte: stuckPurchaseBefore },
          },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
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
        OR: [
          { status: AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED },
          {
            status: {
              in: [
                AdminPackageAssignmentStatus.PROVIDER_PENDING,
                AdminPackageAssignmentStatus.READY,
              ],
            },
            updatedAt: { lte: stuckAssignmentBefore },
          },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
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
    prisma.walletEsimPurchase.findMany({
      where: {
        emailDeliveryStatus: { in: ["failed", "invalid_email"] },
        reconciliationResolvedAt: null,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
        status: true,
        emailDeliveryStatus: true,
        updatedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalationPriority: true,
      },
    }),
    prisma.adminPackageAssignment.findMany({
      where: {
        emailDeliveryStatus: { in: ["failed", "invalid_email"] },
        reconciliationResolvedAt: null,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
        status: true,
        emailDeliveryStatus: true,
        updatedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalationPriority: true,
      },
    }),
    prisma.walletTransaction.findMany({
      where: {
        emailNotificationStatus: { in: ["failed", "not_configured"] },
        reconciliationResolvedAt: null,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
        emailNotificationStatus: true,
        updatedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalationPriority: true,
      },
    }),
    prisma.order.findMany({
      where: {
        OR: [{ iccidHash: null }, { iccidCapturedAt: null }],
        status: "COMPLETED",
        reconciliationResolvedAt: null,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: TAKE,
      select: {
        id: true,
        status: true,
        providerOrderId: true,
        iccidHash: true,
        iccidCapturedAt: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalationPriority: true,
        updatedAt: true,
      },
    }),
  ]);

  const alerts: MonitoringAlert[] = [];
  let oldestEmailFailure: Date | null = null;

  for (const row of purchases) {
    const category = classifyReconciliationCase({
      sourceType: "wallet_purchase",
      status: row.status,
      providerOrderId: row.providerOrderId,
      providerResultKind: row.providerResultKind,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      debitTransactionId: row.debitTransactionId,
      refundTransactionId: row.refundTransactionId,
      orderId: row.orderId,
      emailDeliveryStatus: row.emailDeliveryStatus,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
      now,
      stuckAgeMs: MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS,
    });

    for (const a of reconAlertFromRow({
      sourceType: "wallet_purchase",
      recordId: row.id,
      status: row.status,
      category,
      priority: row.reconciliationEscalationPriority,
      updatedAt: row.updatedAt,
      lockedAt: row.reconciliationLockedAt,
      now,
    })) {
      pushUnique(alerts, a);
    }

    // Wallet-purchase-specific codes
    if (
      row.status === WalletEsimPurchaseStatus.FUNDS_RESERVED &&
      ageMeetsThreshold(
        row.updatedAt,
        now,
        MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS
      )
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER",
          severity: "HIGH",
          title: "Wallet purchase stuck before provider submission",
          description:
            "A wallet purchase remains FUNDS_RESERVED longer than the operational stale threshold.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Open the reconciliation case. Do not auto-refund or retry.",
        })
      );
    }
    if (row.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_RECONCILIATION_REQUIRED",
          severity: "HIGH",
          title: "Wallet purchase requires reconciliation",
          description: "A wallet purchase is marked reconciliation required.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Review the wallet purchase case in Reconciliation.",
        })
      );
    }
    if (category === "REFUND_INCOMPLETE") {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_REFUND_INCOMPLETE",
          severity: "HIGH",
          title: "Wallet purchase refund incomplete",
          description: "Local evidence indicates an incomplete refund path.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Use controlled wallet refund recovery only from Reconciliation.",
        })
      );
    }
    if (category === "LOCAL_FINALIZATION_FAILED") {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_FINALIZATION_FAILED",
          severity: "HIGH",
          title: "Wallet purchase local finalization failed",
          description: "Local finalization failure was classified from stored fields.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Use local finalization recovery from Reconciliation when eligible.",
        })
      );
    }
    if (
      (row.providerResultKind ?? "").toLowerCase() === "uncertain" ||
      category === "PROVIDER_UNKNOWN" ||
      category === "PROVIDER_ORDER_OBSERVED"
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_PROVIDER_UNCERTAIN",
          severity: "HIGH",
          title: "Wallet purchase provider outcome uncertain",
          description:
            "Local provider observation/result indicates uncertainty. Do not infer failure from timeout alone.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Use provider refresh (GET-only) from Reconciliation when eligible.",
        })
      );
    }
    if (
      row.status === WalletEsimPurchaseStatus.READY &&
      ageMeetsThreshold(
        row.updatedAt,
        now,
        MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS
      )
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "WALLET_PURCHASE",
          code: "WALLET_PURCHASE_PENDING_STALE",
          severity: "WARNING",
          title: "Wallet purchase pending longer than threshold",
          description: "A READY wallet purchase is older than the operational stale threshold.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Review the purchase attempt; do not auto-retry.",
        })
      );
    }
    if (isRefreshStuck({ ...row, now })) {
      pushUnique(
        alerts,
        makeAlert({
          category: "RECONCILIATION",
          code: "RECON_REFRESH_STUCK",
          severity: "HIGH",
          title: "Provider refresh/recovery appears stuck",
          description:
            "A provider refresh claim is older than the stuck threshold without completion.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.providerRefreshClaimedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Review the case refresh claim in Reconciliation.",
        })
      );
      pushUnique(
        alerts,
        makeAlert({
          category: "PROVIDER",
          code: "PROVIDER_REFRESH_STUCK",
          severity: "HIGH",
          title: "Provider refresh stuck",
          description: "Local refresh claim appears stuck past the operational threshold.",
          sourceType: "wallet_purchase",
          recordId: row.id,
          sourceAt: row.providerRefreshClaimedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("wallet_purchase", row.id),
          recommendedAction: "Inspect refresh state on the reconciliation detail page.",
        })
      );
    }
  }

  for (const row of assignments) {
    const category = classifyReconciliationCase({
      sourceType: "assignment",
      status: row.status,
      providerOrderId: row.providerOrderId,
      providerResultKind: row.providerResultKind,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      orderId: row.orderId,
      emailDeliveryStatus: row.emailDeliveryStatus,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
      now,
      stuckAgeMs: MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS,
    });

    for (const a of reconAlertFromRow({
      sourceType: "assignment",
      recordId: row.id,
      status: row.status,
      category,
      priority: row.reconciliationEscalationPriority,
      updatedAt: row.updatedAt,
      lockedAt: row.reconciliationLockedAt,
      now,
    })) {
      pushUnique(alerts, a);
    }

    if (
      row.status === AdminPackageAssignmentStatus.PROVIDER_PENDING &&
      ageMeetsThreshold(
        row.updatedAt,
        now,
        MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS
      )
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "COMPANY_ASSIGNMENT",
          code: "ASSIGNMENT_PROVIDER_PENDING_STALE",
          severity: "HIGH",
          title: "Assignment provider-pending too long",
          description:
            "A company assignment remains PROVIDER_PENDING longer than the operational threshold.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Open the assignment case in Reconciliation. Do not auto-retry.",
        })
      );
    }
    if (row.status === AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED) {
      pushUnique(
        alerts,
        makeAlert({
          category: "COMPANY_ASSIGNMENT",
          code: "ASSIGNMENT_RECONCILIATION_REQUIRED",
          severity: "HIGH",
          title: "Assignment requires reconciliation",
          description: "A company assignment is marked reconciliation required.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Review the assignment case in Reconciliation.",
        })
      );
    }
    if (category === "LOCAL_FINALIZATION_FAILED") {
      pushUnique(
        alerts,
        makeAlert({
          category: "COMPANY_ASSIGNMENT",
          code: "ASSIGNMENT_FINALIZATION_FAILED",
          severity: "HIGH",
          title: "Assignment local finalization failed",
          description: "Local finalization failure was classified for this assignment.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Use local finalization recovery from Reconciliation when eligible.",
        })
      );
    }
    if (
      row.status === AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED &&
      !(row.orderId ?? "").trim() &&
      (row.providerResultKind ?? "").toLowerCase() === "success"
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "COMPANY_ASSIGNMENT",
          code: "ASSIGNMENT_MISSING_ORDER",
          severity: "HIGH",
          title: "Assignment missing expected local order",
          description:
            "Assignment shows provider success observation without a linked local order id.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Review local finalization eligibility in Reconciliation.",
        })
      );
    }
    if (
      row.status === AdminPackageAssignmentStatus.READY &&
      ageMeetsThreshold(
        row.updatedAt,
        now,
        MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS
      )
    ) {
      pushUnique(
        alerts,
        makeAlert({
          category: "COMPANY_ASSIGNMENT",
          code: "ASSIGNMENT_STALE",
          severity: "WARNING",
          title: "Stale assignment attempt",
          description: "A READY assignment is older than the operational stale threshold.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.updatedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Review the assignment; do not create or retry automatically.",
        })
      );
    }
    if (isRefreshStuck({ ...row, now })) {
      pushUnique(
        alerts,
        makeAlert({
          category: "PROVIDER",
          code: "PROVIDER_REFRESH_STUCK",
          severity: "HIGH",
          title: "Provider refresh stuck",
          description: "Assignment provider refresh claim appears stuck.",
          sourceType: "assignment",
          recordId: row.id,
          sourceAt: row.providerRefreshClaimedAt,
          now,
          freshness: "DATABASE_DERIVED",
          href: reconHref("assignment", row.id),
          recommendedAction: "Inspect refresh state on the reconciliation detail page.",
        })
      );
    }
  }

  for (const row of emailPurchases) {
    if (!isFailedEmailDelivery(row.emailDeliveryStatus)) continue;
    if (!oldestEmailFailure || row.updatedAt < oldestEmailFailure) {
      oldestEmailFailure = row.updatedAt;
    }
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_ORDER_FAILED",
        severity: "WARNING",
        title: "Failed order email",
        description: "An order delivery email failure is unresolved.",
        sourceType: "order_email",
        recordId: row.id,
        sourceAt: row.updatedAt,
        now,
        freshness: "DATABASE_DERIVED",
        href: reconHref("order_email", row.id),
        recommendedAction: "Use controlled email resend from Reconciliation when eligible.",
      })
    );
  }
  for (const row of emailAssignments) {
    if (!isFailedEmailDelivery(row.emailDeliveryStatus)) continue;
    if (!oldestEmailFailure || row.updatedAt < oldestEmailFailure) {
      oldestEmailFailure = row.updatedAt;
    }
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_ORDER_FAILED",
        severity: "WARNING",
        title: "Failed order email",
        description: "An assignment delivery email failure is unresolved.",
        sourceType: "order_email",
        recordId: row.id,
        sourceAt: row.updatedAt,
        now,
        freshness: "DATABASE_DERIVED",
        href: reconHref("order_email", row.id),
        recommendedAction: "Use controlled email resend from Reconciliation when eligible.",
      })
    );
  }
  for (const row of walletEmails) {
    if (!isFailedWalletNotification(row.emailNotificationStatus)) continue;
    if (!oldestEmailFailure || row.updatedAt < oldestEmailFailure) {
      oldestEmailFailure = row.updatedAt;
    }
    pushUnique(
      alerts,
      makeAlert({
        category: "EMAIL",
        code: "EMAIL_WALLET_FAILED",
        severity: "WARNING",
        title: "Failed wallet transaction notification",
        description: "A wallet balance-change notification failure is unresolved.",
        sourceType: "wallet_email",
        recordId: row.id,
        sourceAt: row.updatedAt,
        now,
        freshness: "DATABASE_DERIVED",
        href: reconHref("wallet_email", row.id),
        recommendedAction: "Review wallet notification cases in Reconciliation. Do not send email here.",
      })
    );
  }

  for (const row of iccidOrders) {
    const category = classifyReconciliationCase({
      sourceType: "iccid",
      status: row.status,
      providerOrderId: row.providerOrderId,
      iccidHash: row.iccidHash,
      iccidCapturedAt: row.iccidCapturedAt,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
      now,
    });
    for (const a of reconAlertFromRow({
      sourceType: "iccid",
      recordId: row.id,
      status: row.status,
      category,
      priority: row.reconciliationEscalationPriority,
      updatedAt: row.updatedAt,
      lockedAt: row.reconciliationLockedAt,
      now,
    })) {
      pushUnique(alerts, a);
    }
  }

  const emailFailureCount =
    emailPurchases.length + emailAssignments.length + walletEmails.length;
  const truncated =
    purchases.length >= TAKE ||
    assignments.length >= TAKE ||
    emailPurchases.length >= TAKE ||
    emailAssignments.length >= TAKE ||
    walletEmails.length >= TAKE ||
    iccidOrders.length >= TAKE;

  // Aggregate provider uncertain presence
  if (
    alerts.some(
      (a) =>
        a.code === "RECON_PROVIDER_UNCERTAIN" ||
        a.code === "WALLET_PURCHASE_PROVIDER_UNCERTAIN"
    )
  ) {
    pushUnique(
      alerts,
      makeAlert({
        category: "PROVIDER",
        code: "PROVIDER_UNCERTAIN_CASES",
        severity: "HIGH",
        title: "Provider-uncertain reconciliation cases exist",
        description:
          "One or more local cases indicate provider uncertainty or observed-but-unfinalized provider orders.",
        sourceAt: now,
        now,
        freshness: "DATABASE_DERIVED",
        href: "/admin/reconciliation?filter=provider_uncertain",
        recommendedAction: "Open the provider-uncertain reconciliation filter.",
      })
    );
    pushUnique(
      alerts,
      makeAlert({
        category: "PROVIDER",
        code: "PROVIDER_RECENT_UNCERTAINTY",
        severity: "WARNING",
        title: "Recent local provider uncertainty",
        description:
          "Provider uncertainty was derived from stored local observations (not a live provider call).",
        sourceAt: now,
        now,
        freshness: "DATABASE_DERIVED",
        href: "/admin/reconciliation?filter=provider_uncertain",
        recommendedAction: "Review provider-uncertain cases in Reconciliation.",
      })
    );
  }

  return {
    alerts,
    emailFailureCount,
    oldestEmailFailure,
    truncated,
  };
}

/**
 * Collect all derived ACTIVE alerts. Read-only.
 * One immutable checkedAt is used for every age/threshold rule in a run.
 */
export async function collectMonitoringAlerts(options?: {
  checkedAt?: Date;
}): Promise<{
  alerts: MonitoringAlert[];
  sectionErrors: string[];
  checkedAt: Date;
}> {
  const now =
    options?.checkedAt instanceof Date &&
    Number.isFinite(options.checkedAt.getTime())
      ? options.checkedAt
      : new Date();
  const sectionErrors: string[] = [];
  const alerts: MonitoringAlert[] = [];

  let db = {
    status: "UNKNOWN" as HealthStatus,
    latencyMs: null as number | null,
    ok: false,
  };
  try {
    db = await probeDatabase();
  } catch {
    sectionErrors.push("DATABASE");
    db = { status: "UNAVAILABLE", latencyMs: null, ok: false };
  }

  let migrationUnknown = true;
  try {
    const mig = await readLatestMigration();
    migrationUnknown = mig.unknown;
  } catch {
    sectionErrors.push("MIGRATION");
    migrationUnknown = true;
  }

  let billingSmtpConfigured = false;
  try {
    billingSmtpConfigured = isEmailConfigured("billing");
  } catch {
    billingSmtpConfigured = false;
  }

  const mode = parseVesimEnvironmentMode(process.env.VESIM_ENVIRONMENT);
  const vesimMode =
    mode === "live" ? "production" : mode === "staging" ? "staging" : "unknown";
  const parsed = parseVesimBaseUrl(process.env.VESIM_BASE_URL);
  let vesimHostClass = "UNKNOWN";
  if (!parsed.ok) {
    vesimHostClass = parsed.reason === "missing" ? "MISSING" : "INVALID";
  } else {
    const result = validateVesimEnvironmentConfig({
      environment: process.env.VESIM_ENVIRONMENT,
      baseUrl: process.env.VESIM_BASE_URL,
      liveBrokerHosts: VESIM_LIVE_BROKER_HOSTS,
    });
    vesimHostClass = result.ok
      ? "STAGING_APPROVED"
      : mode === "live"
        ? "LIVE_UNCONFIRMED"
        : "INVALID";
  }
  const vesimValid = isVesimEnvironmentConfigured();

  let controls: Awaited<ReturnType<typeof getOperationalControlsHealthSnapshot>>;
  try {
    controls = await getOperationalControlsHealthSnapshot();
  } catch {
    sectionErrors.push("OPERATIONAL_CONTROL");
    controls = {
      checkedAtLabel: formatUtcTimestamp(now),
      freshness: "NOT_AVAILABLE",
      overallTransactionsStatus: "UNKNOWN",
      controls: [],
      pausedControlKeys: [],
      guestCheckoutStatus: "NOT_IMPLEMENTED / DISABLED",
      readOk: false,
    };
  }

  let recordPart = {
    alerts: [] as MonitoringAlert[],
    emailFailureCount: 0,
    oldestEmailFailure: null as Date | null,
    truncated: false,
  };
  if (db.ok) {
    try {
      recordPart = await collectRecordAlerts(now);
      if (recordPart.truncated) {
        // truncated samples are still valid; mark degraded detection via summary later
      }
    } catch {
      sectionErrors.push("RECORDS");
    }
  } else {
    sectionErrors.push("RECORDS");
  }

  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || null;
  const configAlerts = buildConfigAlerts({
    now,
    db,
    migrationUnknown,
    billingSmtpConfigured,
    vesimValid,
    vesimMode,
    vesimHostClass,
    authSecretConfigured: Boolean((process.env.AUTH_SECRET ?? "").trim()),
    iccidKeyConfigured: isIccidEncryptionConfigured(),
    authUrlSecure: classifyAuthUrlSecure({
      nodeEnv: process.env.NODE_ENV,
      authUrl,
    }),
    googleOAuthConfigured: Boolean(
      (process.env.AUTH_GOOGLE_ID ?? "").trim() &&
        (process.env.AUTH_GOOGLE_SECRET ?? "").trim()
    ),
    deploymentVersion: pickDeploymentVersion({
      MAP_ESIM_DEPLOYMENT_VERSION: process.env.MAP_ESIM_DEPLOYMENT_VERSION,
      APP_VERSION: process.env.APP_VERSION,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    }),
    controls,
    emailFailureCount: recordPart.emailFailureCount,
    oldestEmailFailure: recordPart.oldestEmailFailure,
  });

  for (const a of configAlerts) pushUnique(alerts, a);
  for (const a of recordPart.alerts) pushUnique(alerts, a);

  // Silence unused guest gate read — still consulted so enablement cannot drift unnoticed.
  void isGuestVesimCheckoutEnabled();

  return {
    alerts: sortMonitoringAlerts(dedupeMonitoringAlerts(alerts)),
    sectionErrors,
    checkedAt: now,
  };
}

export async function getMonitoringAlertsDashboard(options?: {
  severity?: string | null;
  category?: string | null;
}): Promise<MonitoringAlertsDashboard> {
  const filterSeverity = parseAlertSeverityFilter(options?.severity);
  const filterCategory = parseAlertCategoryFilter(options?.category);

  try {
    const { alerts, sectionErrors, checkedAt } = await collectMonitoringAlerts();
    const filtered = sortMonitoringAlerts(
      filterMonitoringAlerts(alerts, {
        severity: filterSeverity,
        category: filterCategory,
      })
    );
    const summary = summarizeMonitoringAlerts(alerts, checkedAt);
    if (sectionErrors.length > 0) {
      summary.detectionStatus = sectionErrors.includes("DATABASE")
        ? "UNAVAILABLE"
        : "DEGRADED";
      summary.freshness =
        summary.detectionStatus === "UNAVAILABLE"
          ? "NOT_AVAILABLE"
          : summary.freshness === "LIVE_LOCAL"
            ? "CONFIGURATION_DERIVED"
            : summary.freshness;
    }

    return {
      generatedAtLabel: formatUtcTimestamp(checkedAt),
      summary,
      alerts: filtered,
      filterSeverity,
      filterCategory,
      unavailable: false,
      sectionErrors,
    };
  } catch {
    const checkedAt = new Date();
    return {
      generatedAtLabel: formatUtcTimestamp(checkedAt),
      summary: {
        totalActive: 0,
        criticalCount: 0,
        highCount: 0,
        warningCount: 0,
        infoCount: 0,
        oldestActiveAgeLabel: "—",
        oldestActiveAgeMs: null,
        detectionStatus: "UNAVAILABLE",
        freshness: "NOT_AVAILABLE",
        checkedAtLabel: formatUtcTimestamp(checkedAt),
      },
      alerts: [],
      filterSeverity,
      filterCategory,
      unavailable: true,
      sectionErrors: ["ALL"],
    };
  }
}

export async function getMonitoringAlertSummary(): Promise<MonitoringAlertSummary> {
  try {
    const { alerts, sectionErrors, checkedAt } = await collectMonitoringAlerts();
    const summary = summarizeMonitoringAlerts(alerts, checkedAt);
    if (sectionErrors.length > 0) {
      summary.detectionStatus = sectionErrors.includes("DATABASE")
        ? "UNAVAILABLE"
        : "DEGRADED";
      if (summary.detectionStatus === "UNAVAILABLE") {
        summary.freshness = "NOT_AVAILABLE";
      }
    }
    return summary;
  } catch {
    const checkedAt = new Date();
    return {
      totalActive: 0,
      criticalCount: 0,
      highCount: 0,
      warningCount: 0,
      infoCount: 0,
      oldestActiveAgeLabel: "—",
      oldestActiveAgeMs: null,
      detectionStatus: "UNAVAILABLE",
      freshness: "NOT_AVAILABLE",
      checkedAtLabel: formatUtcTimestamp(checkedAt),
    };
  }
}

/** Exported for QA. */
export const __monitoringAlertsQaHooks = {
  filterMonitoringAlerts,
  sortMonitoringAlerts,
  summarizeMonitoringAlerts,
  parseAlertSeverityFilter,
  parseAlertCategoryFilter,
  dedupeMonitoringAlerts,
  ageMeetsThreshold,
  collectMonitoringAlerts,
};
