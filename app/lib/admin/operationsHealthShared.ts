/**
 * Pure Admin Operations health status helpers (offline-QA safe).
 * No Prisma, no network, no secret values.
 */

export const HEALTH_STATUSES = [
  "HEALTHY",
  "DEGRADED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "NOT_IMPLEMENTED",
  "UNKNOWN",
] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const DATA_FRESHNESS = [
  "LIVE_LOCAL",
  "DATABASE_DERIVED",
  "CONFIGURATION_DERIVED",
  "NOT_AVAILABLE",
] as const;

export type DataFreshness = (typeof DATA_FRESHNESS)[number];

export const APP_ENV_LABELS = [
  "development",
  "staging",
  "production",
  "unknown",
] as const;

export type AppEnvLabel = (typeof APP_ENV_LABELS)[number];

export const CSP_MODES = ["report-only", "enforced", "unknown"] as const;
export type CspMode = (typeof CSP_MODES)[number];

export const HSTS_EXPECTATIONS = [
  "expected",
  "not_expected",
  "unknown",
] as const;
export type HstsExpectation = (typeof HSTS_EXPECTATIONS)[number];

export const PROVIDER_MODE_LABELS = [
  "staging",
  "production",
  "unknown",
] as const;
export type ProviderModeLabel = (typeof PROVIDER_MODE_LABELS)[number];

export const BROKER_HOST_CLASSES = [
  "STAGING_APPROVED",
  "LIVE_UNCONFIRMED",
  "INVALID",
  "MISSING",
  "UNKNOWN",
] as const;
export type BrokerHostClass = (typeof BROKER_HOST_CLASSES)[number];

export type OpsWarningCode =
  | "CRITICAL_RECONCILIATION"
  | "HIGH_RECONCILIATION"
  | "PROVIDER_UNCERTAIN"
  | "REFUND_PENDING"
  | "EMAIL_FAILURES"
  | "SMTP_NOT_CONFIGURED"
  | "VESIM_LIVE_UNCONFIRMED"
  | "VESIM_INVALID"
  | "PAYMENT_NOT_IMPLEMENTED"
  | "GUEST_CHECKOUT_DISABLED"
  | "DATABASE_UNHEALTHY"
  | "DEPLOYMENT_VERSION_UNAVAILABLE"
  | "ICCID_KEY_MISSING"
  | "AUTH_SECRET_MISSING"
  | "OPERATIONAL_CONTROL_PAUSED"
  | "TRANSACTIONS_PAUSED";

export type OpsWarning = {
  code: OpsWarningCode;
  severity: "critical" | "high" | "info";
  message: string;
  href?: string;
};

export function isHealthStatus(raw: string | null | undefined): raw is HealthStatus {
  return (HEALTH_STATUSES as readonly string[]).includes((raw ?? "").trim());
}

export function sanitizeHealthStatus(
  raw: string | null | undefined
): HealthStatus {
  const v = (raw ?? "").trim().toUpperCase();
  return isHealthStatus(v) ? v : "UNKNOWN";
}

/** Map DB probe outcomes to allowlisted statuses only. */
export function mapDatabaseProbeToStatus(input: {
  ok: boolean;
  timedOut?: boolean;
  errorCode?: string | null;
}): HealthStatus {
  if (input.ok) return "HEALTHY";
  if (input.timedOut) return "DEGRADED";
  const code = (input.errorCode ?? "").trim().toUpperCase();
  if (code === "P1001" || code === "P1000" || code === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  if (code) return "DEGRADED";
  return "UNAVAILABLE";
}

export function classifyAppEnvironment(input: {
  nodeEnv?: string | null;
  vesimMode?: string | null;
}): AppEnvLabel {
  const node = (input.nodeEnv ?? "").trim().toLowerCase();
  if (node === "production") return "production";
  if (node === "test") return "development";
  if (node === "development") {
    const vesim = (input.vesimMode ?? "").trim().toLowerCase();
    if (vesim === "staging") return "staging";
    return "development";
  }
  return "unknown";
}

/** Safe deploy/version token — reject secrets-shaped values. */
export function sanitizeDeploymentVersion(
  raw: string | null | undefined
): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 64) return null;
  if (!/^[A-Za-z0-9._@+/-]+$/.test(v)) return null;
  if (/secret|password|token|key=/i.test(v)) return null;
  return v;
}

export function pickDeploymentVersion(env: {
  MAP_ESIM_DEPLOYMENT_VERSION?: string | null;
  APP_VERSION?: string | null;
  VERCE_GIT_COMMIT_SHA?: string | null;
  VERCEL_GIT_COMMIT_SHA?: string | null;
}): string | null {
  return (
    sanitizeDeploymentVersion(env.MAP_ESIM_DEPLOYMENT_VERSION) ??
    sanitizeDeploymentVersion(env.APP_VERSION) ??
    sanitizeDeploymentVersion(env.VERCEL_GIT_COMMIT_SHA) ??
    sanitizeDeploymentVersion(env.VERCE_GIT_COMMIT_SHA) ??
    null
  );
}

export function classifyAuthUrlSecure(input: {
  nodeEnv?: string | null;
  authUrl?: string | null;
}): "yes" | "no" | "unknown" {
  const authUrl = (input.authUrl ?? "").trim().toLowerCase();
  if (!authUrl) return "unknown";
  if (authUrl.includes("localhost") || authUrl.includes("127.0.0.1")) {
    return "no";
  }
  if (!authUrl.startsWith("https://")) return "no";
  return "yes";
}

export function classifyHstsExpectation(input: {
  nodeEnv?: string | null;
  authUrl?: string | null;
}): HstsExpectation {
  const node = (input.nodeEnv ?? "").trim();
  if (node !== "production") return "not_expected";
  const auth = classifyAuthUrlSecure(input);
  if (auth === "yes") return "expected";
  if (auth === "no") return "not_expected";
  return "unknown";
}

/** Project currently ships CSP Report-Only only. */
export function classifyCspMode(): CspMode {
  return "report-only";
}

export function formatAgeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

export function formatUtcTimestamp(value: Date | null | undefined): string {
  if (!value || !(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return "—";
  }
  try {
    return value.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "—";
  }
}

export type OpsWarningInput = {
  databaseStatus: HealthStatus;
  criticalPriorityCount: number;
  highPriorityCount: number;
  providerUncertainCount: number;
  refundPendingCount: number;
  failedEmailCount: number;
  billingSmtpConfigured: boolean;
  vesimConfigValid: boolean;
  vesimMode: ProviderModeLabel;
  vesimHostClass: BrokerHostClass;
  guestCheckoutEnabled: boolean;
  deploymentVersion: string | null;
  authSecretConfigured: boolean;
  iccidKeyConfigured: boolean;
  /** Number of allowlisted controls currently paused (0 if unknown). */
  pausedOperationalControlCount?: number;
  /** True when TRANSACTION_MAINTENANCE is paused. */
  transactionsMaintenancePaused?: boolean;
};

export function buildOperationsWarnings(input: OpsWarningInput): OpsWarning[] {
  const warnings: OpsWarning[] = [];

  if (
    input.databaseStatus === "UNAVAILABLE" ||
    input.databaseStatus === "DEGRADED"
  ) {
    warnings.push({
      code: "DATABASE_UNHEALTHY",
      severity: "critical",
      message: "Database health check is not healthy.",
    });
  }

  if (input.criticalPriorityCount > 0) {
    warnings.push({
      code: "CRITICAL_RECONCILIATION",
      severity: "critical",
      message: "CRITICAL-priority reconciliation cases exist.",
      href: "/admin/reconciliation?filter=escalated",
    });
  }

  if (input.highPriorityCount > 0) {
    warnings.push({
      code: "HIGH_RECONCILIATION",
      severity: "high",
      message: "HIGH-priority reconciliation cases exist.",
      href: "/admin/reconciliation?filter=escalated",
    });
  }

  if (input.providerUncertainCount > 0) {
    warnings.push({
      code: "PROVIDER_UNCERTAIN",
      severity: "high",
      message: "Provider-uncertain reconciliation cases exist.",
      href: "/admin/reconciliation?filter=provider_uncertain",
    });
  }

  if (input.refundPendingCount > 0) {
    warnings.push({
      code: "REFUND_PENDING",
      severity: "high",
      message: "Refund-required or refund-pending cases exist.",
      href: "/admin/reconciliation?filter=refund_pending",
    });
  }

  if (input.failedEmailCount > 0) {
    warnings.push({
      code: "EMAIL_FAILURES",
      severity: "high",
      message: "Failed customer email or wallet notification cases exist.",
      href: "/admin/reconciliation?filter=order_email_failed",
    });
  }

  if (!input.billingSmtpConfigured) {
    warnings.push({
      code: "SMTP_NOT_CONFIGURED",
      severity: "high",
      message: "Billing SMTP is not configured.",
    });
  }

  if (!input.vesimConfigValid) {
    if (
      input.vesimMode === "production" ||
      input.vesimHostClass === "LIVE_UNCONFIRMED"
    ) {
      warnings.push({
        code: "VESIM_LIVE_UNCONFIRMED",
        severity: "critical",
        message: "VeSIM production/live host is unconfirmed or invalid.",
      });
    } else {
      warnings.push({
        code: "VESIM_INVALID",
        severity: "high",
        message: "VeSIM provider configuration is not valid.",
      });
    }
  }

  warnings.push({
    code: "PAYMENT_NOT_IMPLEMENTED",
    severity: "info",
    message: "Payment gateway is not implemented.",
  });

  if (!input.guestCheckoutEnabled) {
    warnings.push({
      code: "GUEST_CHECKOUT_DISABLED",
      severity: "info",
      message: "Guest VeSIM checkout is NOT_IMPLEMENTED / DISABLED.",
    });
  }

  if (input.transactionsMaintenancePaused) {
    warnings.push({
      code: "TRANSACTIONS_PAUSED",
      severity: "critical",
      message:
        "All new purchase/assignment transactions are paused (TRANSACTION_MAINTENANCE).",
    });
  } else if (
    typeof input.pausedOperationalControlCount === "number" &&
    input.pausedOperationalControlCount > 0
  ) {
    warnings.push({
      code: "OPERATIONAL_CONTROL_PAUSED",
      severity: "high",
      message: `${input.pausedOperationalControlCount} operational control(s) are paused for new transactions.`,
    });
  }

  if (!input.deploymentVersion) {
    warnings.push({
      code: "DEPLOYMENT_VERSION_UNAVAILABLE",
      severity: "info",
      message: "Deployment version identifier is unavailable.",
    });
  }

  if (!input.authSecretConfigured) {
    warnings.push({
      code: "AUTH_SECRET_MISSING",
      severity: "critical",
      message: "AUTH_SECRET is not configured.",
    });
  }

  if (!input.iccidKeyConfigured) {
    warnings.push({
      code: "ICCID_KEY_MISSING",
      severity: "critical",
      message: "ICCID encryption key is not configured.",
    });
  }

  return warnings;
}

export function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

export function smtpReadinessStatus(configured: boolean | null): HealthStatus {
  if (configured === null) return "UNKNOWN";
  return configured ? "HEALTHY" : "NOT_CONFIGURED";
}

export function paymentGatewayCardDefaults() {
  return {
    integrationStatus: "NOT_IMPLEMENTED" as HealthStatus,
    productionCredentials: "NOT_CONFIGURED" as HealthStatus,
    webhookVerification: "NOT_IMPLEMENTED" as HealthStatus,
    paymentReconciliation: "NOT_IMPLEMENTED" as HealthStatus,
    guestCheckout: "NOT_IMPLEMENTED / DISABLED" as const,
  };
}
