/**
 * Pure monitoring alert helpers (offline-QA safe).
 * Thresholds are operational defaults, not provider guarantees.
 * No Prisma, no network, no secrets, no client-supplied threshold overrides.
 */

import {
  formatAgeMs,
  formatUtcTimestamp,
  type DataFreshness,
} from "@/app/lib/admin/operationsHealthShared";
import type { ReconciliationCategory } from "@/app/lib/admin/reconciliationClassify";

export const ALERT_SEVERITIES = ["CRITICAL", "HIGH", "WARNING", "INFO"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATES = ["ACTIVE", "CLEARED"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export const ALERT_CATEGORIES = [
  "DATABASE",
  "RECONCILIATION",
  "WALLET_PURCHASE",
  "COMPANY_ASSIGNMENT",
  "EMAIL",
  "PROVIDER",
  "OPERATIONAL_CONTROL",
  "PAYMENT",
  "SECURITY",
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

/**
 * Centralized operational thresholds (conservative defaults).
 * Not provider SLAs. Never accept overrides from URL/forms.
 */
export const MONITORING_THRESHOLDS = {
  /** Wallet purchase READY / FUNDS_RESERVED / PROVIDER_PENDING stale age. */
  STALE_PURCHASE_AGE_MS: 15 * 60 * 1000,
  /** Assignment READY / PROVIDER_PENDING stale age. */
  STALE_ASSIGNMENT_AGE_MS: 15 * 60 * 1000,
  /** Unresolved reconciliation case age warning. */
  UNRESOLVED_RECONCILIATION_AGE_MS: 24 * 60 * 60 * 1000,
  /** Locked reconciliation case age warning. */
  LOCKED_CASE_AGE_MS: 4 * 60 * 60 * 1000,
  /** Provider refresh claim older than this with incomplete completion = stuck. */
  PROVIDER_REFRESH_STUCK_AGE_MS: 90_000,
  /** Unresolved email failure age. */
  UNRESOLVED_EMAIL_FAILURE_AGE_MS: 2 * 60 * 60 * 1000,
  /**
   * Informational probe-latency reference (ms).
   * Not used to flip ACTIVE alert presence from a single wall-clock sample —
   * that caused nondeterministic DATABASE_DEGRADED flicker. Status still comes
   * from mapDatabaseProbeToStatus (ok / timeout / error), matching Operations.
   */
  DATABASE_DEGRADED_LATENCY_MS: 500,
  /** Bounded query take for record-level alerts. */
  ALERT_QUERY_TAKE: 200,
} as const;

export type MonitoringAlertCode =
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_DEGRADED"
  | "MIGRATION_STATE_UNKNOWN"
  | "RECON_CRITICAL_PRIORITY"
  | "RECON_HIGH_PRIORITY"
  | "RECON_PROVIDER_UNCERTAIN"
  | "RECON_REFUND_PENDING"
  | "RECON_FINALIZATION_FAILED"
  | "RECON_ICCID_PENDING"
  | "RECON_ICCID_CONFLICT"
  | "RECON_EMAIL_FAILED"
  | "RECON_LOCKED_STALE"
  | "RECON_UNRESOLVED_STALE"
  | "RECON_REFRESH_STUCK"
  | "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER"
  | "WALLET_PURCHASE_PROVIDER_UNCERTAIN"
  | "WALLET_PURCHASE_RECONCILIATION_REQUIRED"
  | "WALLET_PURCHASE_REFUND_INCOMPLETE"
  | "WALLET_PURCHASE_FINALIZATION_FAILED"
  | "WALLET_PURCHASE_PENDING_STALE"
  | "ASSIGNMENT_PROVIDER_PENDING_STALE"
  | "ASSIGNMENT_RECONCILIATION_REQUIRED"
  | "ASSIGNMENT_FINALIZATION_FAILED"
  | "ASSIGNMENT_MISSING_ORDER"
  | "ASSIGNMENT_STALE"
  | "EMAIL_ORDER_FAILED"
  | "EMAIL_WALLET_FAILED"
  | "EMAIL_SMTP_NOT_CONFIGURED"
  | "EMAIL_REPEATED_UNRESOLVED"
  | "EMAIL_OLDEST_UNRESOLVED_STALE"
  | "PROVIDER_CONFIG_INVALID"
  | "PROVIDER_LIVE_HOST_UNCONFIRMED"
  | "PROVIDER_UNCERTAIN_CASES"
  | "PROVIDER_REFRESH_STUCK"
  | "PROVIDER_RECENT_UNCERTAINTY"
  | "CONTROL_TRANSACTIONS_PAUSED"
  | "CONTROL_CUSTOMER_PURCHASES_PAUSED"
  | "CONTROL_ADMIN_PURCHASES_PAUSED"
  | "CONTROL_COMPANY_ASSIGNMENTS_PAUSED"
  | "CONTROL_PROVIDER_ORDERS_PAUSED"
  | "CONTROL_PARTNER_PURCHASES_PAUSED"
  | "CONTROL_ALERT_NOTIFICATIONS_PAUSED"
  | "CONTROL_STATE_UNAVAILABLE"
  | "PAYMENT_GATEWAY_NOT_IMPLEMENTED"
  | "PAYMENT_WEBHOOK_NOT_IMPLEMENTED"
  | "GUEST_CHECKOUT_NOT_IMPLEMENTED"
  | "SECURITY_AUTH_SECRET_MISSING"
  | "SECURITY_ICCID_KEY_MISSING"
  | "SECURITY_AUTH_URL_INSECURE"
  | "SECURITY_BILLING_SMTP_MISSING"
  | "SECURITY_GOOGLE_OAUTH_INCOMPLETE"
  | "SECURITY_DEPLOYMENT_VERSION_UNAVAILABLE"
  | "SECURITY_CSP_REPORT_ONLY"
  | "SECURITY_BACKUP_STATUS_UNAVAILABLE"
  | "SECURITY_ERROR_MONITORING_NOT_CONFIGURED";

export type MonitoringAlert = {
  id: string;
  code: MonitoringAlertCode;
  severity: AlertSeverity;
  state: AlertState;
  title: string;
  description: string;
  category: AlertCategory;
  detectedAtLabel: string;
  sourceTimestampLabel: string;
  ageLabel: string;
  ageMs: number;
  freshness: DataFreshness;
  href?: string;
  recommendedAction: string;
};

export type MonitoringAlertSummary = {
  totalActive: number;
  criticalCount: number;
  highCount: number;
  warningCount: number;
  infoCount: number;
  oldestActiveAgeLabel: string;
  oldestActiveAgeMs: number | null;
  detectionStatus: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  freshness: DataFreshness;
  checkedAtLabel: string;
};

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  WARNING: 2,
  INFO: 3,
};

export function isAlertSeverity(raw: string | null | undefined): raw is AlertSeverity {
  return (ALERT_SEVERITIES as readonly string[]).includes((raw ?? "").trim().toUpperCase());
}

export function isAlertCategory(raw: string | null | undefined): raw is AlertCategory {
  return (ALERT_CATEGORIES as readonly string[]).includes((raw ?? "").trim().toUpperCase());
}

export function parseAlertSeverityFilter(
  raw: string | null | undefined
): AlertSeverity | "ALL" {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v || v === "ALL") return "ALL";
  return isAlertSeverity(v) ? v : "ALL";
}

export function parseAlertCategoryFilter(
  raw: string | null | undefined
): AlertCategory | "ALL" {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v || v === "ALL") return "ALL";
  return isAlertCategory(v) ? v : "ALL";
}

/** Safe token for deterministic ids — allowlist alphanumeric + underscore/dash. */
export function sanitizeAlertIdPart(raw: string | null | undefined): string {
  const v = String(raw ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 64);
  return v || "unknown";
}

export function buildAlertId(parts: {
  category: AlertCategory;
  code: MonitoringAlertCode;
  sourceType?: string | null;
  recordId?: string | null;
}): string {
  return [
    "alert",
    sanitizeAlertIdPart(parts.category),
    sanitizeAlertIdPart(parts.code),
    sanitizeAlertIdPart(parts.sourceType ?? "config"),
    sanitizeAlertIdPart(parts.recordId ?? "none"),
  ].join(":");
}

export function severityRank(severity: AlertSeverity): number {
  return SEVERITY_RANK[severity] ?? 99;
}

export function sortMonitoringAlerts(alerts: MonitoringAlert[]): MonitoringAlert[] {
  return [...alerts].sort((a, b) => {
    const sr = severityRank(a.severity) - severityRank(b.severity);
    if (sr !== 0) return sr;
    // Oldest first within same severity (highest risk age).
    const age = b.ageMs - a.ageMs;
    if (age !== 0) return age;
    // Stable tie-breaker so equal age/severity order never shuffles.
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

/** Pure age-threshold helper — use one immutable checkedAt for every rule. */
export function ageMeetsThreshold(
  sourceAt: Date,
  checkedAt: Date,
  thresholdMs: number
): boolean {
  return checkedAt.getTime() - sourceAt.getTime() >= thresholdMs;
}

/** Deduplicate by deterministic alert id, preserving first-seen order. */
export function dedupeMonitoringAlerts(
  alerts: MonitoringAlert[]
): MonitoringAlert[] {
  const seen = new Set<string>();
  const out: MonitoringAlert[] = [];
  for (const a of alerts) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export function filterMonitoringAlerts(
  alerts: MonitoringAlert[],
  options?: {
    severity?: AlertSeverity | "ALL";
    category?: AlertCategory | "ALL";
  }
): MonitoringAlert[] {
  const severity = options?.severity ?? "ALL";
  const category = options?.category ?? "ALL";
  return alerts.filter((a) => {
    if (severity !== "ALL" && a.severity !== severity) return false;
    if (category !== "ALL" && a.category !== category) return false;
    return true;
  });
}

export function summarizeMonitoringAlerts(
  alerts: MonitoringAlert[],
  checkedAt: Date = new Date()
): MonitoringAlertSummary {
  const active = alerts.filter((a) => a.state === "ACTIVE");
  let oldestMs: number | null = null;
  for (const a of active) {
    if (oldestMs == null || a.ageMs > oldestMs) oldestMs = a.ageMs;
  }
  return {
    totalActive: active.length,
    criticalCount: active.filter((a) => a.severity === "CRITICAL").length,
    highCount: active.filter((a) => a.severity === "HIGH").length,
    warningCount: active.filter((a) => a.severity === "WARNING").length,
    infoCount: active.filter((a) => a.severity === "INFO").length,
    oldestActiveAgeLabel: formatAgeMs(oldestMs),
    oldestActiveAgeMs: oldestMs,
    detectionStatus: "HEALTHY",
    freshness: active.length ? "DATABASE_DERIVED" : "LIVE_LOCAL",
    checkedAtLabel: formatUtcTimestamp(checkedAt),
  };
}

export function categoryLabel(category: AlertCategory): string {
  switch (category) {
    case "DATABASE":
      return "Database";
    case "RECONCILIATION":
      return "Reconciliation";
    case "WALLET_PURCHASE":
      return "Wallet purchase";
    case "COMPANY_ASSIGNMENT":
      return "Company assignment";
    case "EMAIL":
      return "Email";
    case "PROVIDER":
      return "Provider";
    case "OPERATIONAL_CONTROL":
      return "Operational control";
    case "PAYMENT":
      return "Payment";
    case "SECURITY":
      return "Security";
    default:
      return category;
  }
}

export function severityFromReconPriority(
  priority: string | null | undefined
): AlertSeverity | null {
  const p = (priority ?? "").trim().toUpperCase();
  if (p === "CRITICAL") return "CRITICAL";
  if (p === "HIGH") return "HIGH";
  if (p === "MEDIUM") return "WARNING";
  if (p === "LOW") return "INFO";
  return null;
}

export function alertCodeForReconCategory(
  category: ReconciliationCategory
): MonitoringAlertCode | null {
  switch (category) {
    case "PROVIDER_UNKNOWN":
    case "PROVIDER_ORDER_OBSERVED":
    case "MISSING_PROVIDER_REFERENCE":
      return "RECON_PROVIDER_UNCERTAIN";
    case "REFUND_INCOMPLETE":
      return "RECON_REFUND_PENDING";
    case "LOCAL_FINALIZATION_FAILED":
      return "RECON_FINALIZATION_FAILED";
    case "ICCID_PENDING":
      return "RECON_ICCID_PENDING";
    case "ICCID_CONFLICT":
      return "RECON_ICCID_CONFLICT";
    case "ORDER_EMAIL_FAILED":
    case "WALLET_EMAIL_FAILED":
      return "RECON_EMAIL_FAILED";
    case "FUNDS_RESERVED_STUCK":
      return "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER";
    case "RESOLVED":
      return null;
    default:
      return "RECON_PROVIDER_UNCERTAIN";
  }
}

export function defaultSeverityForReconCategory(
  category: ReconciliationCategory
): AlertSeverity {
  switch (category) {
    case "REFUND_INCOMPLETE":
    case "LOCAL_FINALIZATION_FAILED":
    case "FUNDS_RESERVED_STUCK":
    case "PROVIDER_UNKNOWN":
    case "MISSING_PROVIDER_REFERENCE":
    case "ICCID_CONFLICT":
      return "HIGH";
    case "PROVIDER_ORDER_OBSERVED":
    case "ICCID_PENDING":
    case "ORDER_EMAIL_FAILED":
    case "WALLET_EMAIL_FAILED":
      return "WARNING";
    case "RESOLVED":
      return "INFO";
    default:
      return "WARNING";
  }
}

export function makeAlert(input: {
  category: AlertCategory;
  code: MonitoringAlertCode;
  severity: AlertSeverity;
  title: string;
  description: string;
  sourceType?: string | null;
  recordId?: string | null;
  sourceAt: Date | null | undefined;
  now?: Date;
  freshness: DataFreshness;
  href?: string;
  recommendedAction: string;
  state?: AlertState;
}): MonitoringAlert {
  const now = input.now ?? new Date();
  const sourceAt =
    input.sourceAt instanceof Date && Number.isFinite(input.sourceAt.getTime())
      ? input.sourceAt
      : now;
  const ageMs = Math.max(0, now.getTime() - sourceAt.getTime());
  return {
    id: buildAlertId({
      category: input.category,
      code: input.code,
      sourceType: input.sourceType,
      recordId: input.recordId,
    }),
    code: input.code,
    severity: input.severity,
    state: input.state ?? "ACTIVE",
    title: input.title,
    description: input.description,
    category: input.category,
    detectedAtLabel: formatUtcTimestamp(now),
    sourceTimestampLabel: formatUtcTimestamp(sourceAt),
    ageLabel: formatAgeMs(ageMs),
    ageMs,
    freshness: input.freshness,
    href: input.href,
    recommendedAction: input.recommendedAction,
  };
}

export function isSafeAdminHref(href: string | null | undefined): boolean {
  const v = (href ?? "").trim();
  if (!v.startsWith("/admin")) return false;
  if (v.includes("://") || v.includes("//")) return false;
  if (/[<>"']/.test(v)) return false;
  return true;
}
