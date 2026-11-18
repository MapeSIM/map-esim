/**
 * Pure Monitoring Part B2 alert-notification helpers (offline-QA safe).
 * No Prisma, no network, no secrets, no recipient exposure.
 */

import {
  type AlertCategory,
  type AlertSeverity,
  type MonitoringAlert,
  type MonitoringAlertCode,
} from "@/app/lib/admin/monitoringAlertShared";
export const ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const ALERT_NOTIFICATION_CLAIM_TTL_MS = 90_000;
export const ALERT_NOTIFICATION_RUNNER_LOCK_TTL_MS = 120_000;
export const ALERT_NOTIFICATION_MAX_RECIPIENTS = 10;
export const ALERT_NOTIFICATION_MAX_ATTEMPTS = 5;
export const ALERT_NOTIFICATION_CONFIRM_PHRASE = "RUN ALERT NOTIFICATIONS";
export const ALERT_NOTIFICATION_RECIPIENTS_ENV = "ALERT_NOTIFICATION_RECIPIENTS";
/** Bound each manual admin click — keep small so SMTP stays inside maxDuration. */
export const ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN = 3;
/** Overall server-side budget for aggregation + delivery after the runner lock. */
export const ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS = 18_000;
/** Hard auth/session budget for the API route. */
export const ALERT_NOTIFICATION_AUTH_TIMEOUT_MS = 5_000;
/** Hard local-DB aggregation budget (cold Neon + batched collectors). */
export const ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS = 14_000;
/** Hard per-recipient SMTP send budget (must close transporter on expiry). */
export const ALERT_NOTIFICATION_SMTP_TIMEOUT_MS = 6_000;
/** Cap state sync/schedule loops so N+1 cannot hang the serverless run. */
export const ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN = 30;

/** Bounded retry delays after attempt N fails (attemptCount after failure). */
export const ALERT_NOTIFICATION_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

export const ALERT_NOTIFICATION_ERROR_CODES = [
  "not_configured",
  "invalid_recipients",
  "send_failed",
  "invalid_recipient",
  "paused",
  "claim_lost",
  "unknown",
] as const;
export type AlertNotificationErrorCode =
  (typeof ALERT_NOTIFICATION_ERROR_CODES)[number];

export type AlertNotificationEventType = "INITIAL" | "REMINDER" | "RECOVERY";

export type AlertNotificationDeliveryStatus =
  | "PENDING"
  | "CLAIMED"
  | "SENT"
  | "FAILED";

/**
 * Explicit HIGH allowlist — default-deny for every other HIGH code.
 * Compile-time checked against MonitoringAlertCode.
 * CONTROL_TRANSACTIONS_PAUSED intentionally excluded.
 */
export const ALERT_NOTIFICATION_HIGH_ALLOWLIST = [
  "DATABASE_DEGRADED",
  "PROVIDER_CONFIG_INVALID",
  "CONTROL_STATE_UNAVAILABLE",
  "SECURITY_AUTH_URL_INSECURE",
  "EMAIL_REPEATED_UNRESOLVED",
  "RECON_HIGH_PRIORITY",
  "RECON_LOCKED_STALE",
  "RECON_REFRESH_STUCK",
  "PROVIDER_REFRESH_STUCK",
  "RECON_REFUND_PENDING",
  "WALLET_PURCHASE_REFUND_INCOMPLETE",
  "RECON_FINALIZATION_FAILED",
  "WALLET_PURCHASE_FINALIZATION_FAILED",
  "ASSIGNMENT_FINALIZATION_FAILED",
  "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER",
  "RECON_ICCID_CONFLICT",
  "PROVIDER_UNCERTAIN_CASES",
] as const satisfies readonly MonitoringAlertCode[];

export type AlertNotificationHighAllowlistCode =
  (typeof ALERT_NOTIFICATION_HIGH_ALLOWLIST)[number];

const HIGH_ALLOWLIST_SET = new Set<string>(ALERT_NOTIFICATION_HIGH_ALLOWLIST);

export type AggregationCompleteness = {
  complete: boolean;
  databaseOk: boolean;
  recordsEvaluated: boolean;
  sectionErrors: string[];
};

export type DerivedNotificationDisplayStatus =
  | "not_eligible"
  | "pending"
  | "notified"
  | "cooldown"
  | "failed";

export function formatNotificationStatusLabel(
  status: DerivedNotificationDisplayStatus
): string {
  switch (status) {
    case "not_eligible":
      return "Not eligible";
    case "pending":
      return "Pending";
    case "notified":
      return "Notified";
    case "cooldown":
      return "Cooldown";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function isHighAllowlistedForNotification(
  code: string | null | undefined
): boolean {
  return HIGH_ALLOWLIST_SET.has(String(code ?? "").trim());
}

export function isAlertEligibleForNotification(input: {
  severity: AlertSeverity | string;
  code: MonitoringAlertCode | string;
}): boolean {
  const severity = String(input.severity ?? "").trim().toUpperCase();
  const code = String(input.code ?? "").trim();
  if (severity === "CRITICAL") return true;
  if (severity === "HIGH") return isHighAllowlistedForNotification(code);
  return false;
}

export function buildAggregationCompleteness(input: {
  sectionErrors: string[];
  databaseOk: boolean;
  recordsEvaluated: boolean;
}): AggregationCompleteness {
  const sectionErrors = [...input.sectionErrors];
  const databaseOk = Boolean(input.databaseOk);
  const recordsEvaluated = Boolean(input.recordsEvaluated);
  const hasBlocking =
    sectionErrors.includes("DATABASE") || sectionErrors.includes("RECORDS");
  return {
    complete: databaseOk && recordsEvaluated && !hasBlocking,
    databaseOk,
    recordsEvaluated,
    sectionErrors,
  };
}

/** Mask internal ids for email/UI — never full customer emails or secrets. */
export function maskInternalReference(
  raw: string | null | undefined
): string | null {
  const v = String(raw ?? "").trim();
  if (!v || v === "none" || v === "config") return v || null;
  if (v.includes("@")) return "••••";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export function sanitizeSourceType(
  raw: string | null | undefined
): string | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 64);
  return v || null;
}

export function parseAlertIdParts(alertId: string): {
  category: string;
  code: string;
  sourceType: string;
  recordId: string;
} {
  const parts = String(alertId ?? "").split(":");
  return {
    category: parts[1] ?? "unknown",
    code: parts[2] ?? "unknown",
    sourceType: parts[3] ?? "unknown",
    recordId: parts[4] ?? "unknown",
  };
}

export function reminderCooldownBucket(checkedAtMs: number): number {
  return Math.floor(checkedAtMs / ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS);
}

export function buildDeliveryEventKey(input: {
  alertId: string;
  activationSequence: number;
  eventType: AlertNotificationEventType;
  reminderBucket?: number;
}): string {
  const alertId = String(input.alertId ?? "").trim();
  const seq = Math.max(1, Math.floor(input.activationSequence));
  if (input.eventType === "INITIAL") {
    return `${alertId}:${seq}:initial`;
  }
  if (input.eventType === "RECOVERY") {
    return `${alertId}:${seq}:recovery`;
  }
  const bucket =
    typeof input.reminderBucket === "number" &&
    Number.isFinite(input.reminderBucket)
      ? Math.floor(input.reminderBucket)
      : 0;
  return `${alertId}:${seq}:reminder:${bucket}`;
}

export function buildDeterministicMessageId(eventKey: string): string {
  const safe = String(eventKey ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "_")
    .slice(0, 120);
  return `<alert-notify.${safe || "unknown"}@mapesim.com>`;
}

export function nextRetryAt(
  attemptCountAfterFailure: number,
  from: Date
): Date | null {
  const idx = attemptCountAfterFailure - 1;
  if (idx < 0 || idx >= ALERT_NOTIFICATION_RETRY_DELAYS_MS.length) {
    return null;
  }
  return new Date(from.getTime() + ALERT_NOTIFICATION_RETRY_DELAYS_MS[idx]);
}

export function normalizeOpaqueErrorCode(
  raw: string | null | undefined
): AlertNotificationErrorCode {
  const v = String(raw ?? "").trim();
  if (
    (ALERT_NOTIFICATION_ERROR_CODES as readonly string[]).includes(v)
  ) {
    return v as AlertNotificationErrorCode;
  }
  return "unknown";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type RecipientParseResult =
  | { ok: true; recipients: string[] }
  | { ok: false; errorCode: "invalid_recipients" };

/**
 * Server-only config parser — never import into client bundles with env values.
 * Callers must pass the raw env string; do not read process.env in client code.
 */
export function parseAlertNotificationRecipients(
  raw: string | null | undefined
): RecipientParseResult {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, errorCode: "invalid_recipients" };
  const parts = text
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return { ok: false, errorCode: "invalid_recipients" };
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p) || p.length > 254) {
      return { ok: false, errorCode: "invalid_recipients" };
    }
    if (seen.has(p)) continue;
    seen.add(p);
    recipients.push(p);
    if (recipients.length > ALERT_NOTIFICATION_MAX_RECIPIENTS) {
      return { ok: false, errorCode: "invalid_recipients" };
    }
  }
  if (!recipients.length) return { ok: false, errorCode: "invalid_recipients" };
  return { ok: true, recipients };
}

export function isCooldownActive(input: {
  lastNotifiedAt: Date | null | undefined;
  checkedAt: Date;
  cooldownMs?: number;
}): boolean {
  const last = input.lastNotifiedAt;
  if (!(last instanceof Date) || !Number.isFinite(last.getTime())) return false;
  const cooldown = input.cooldownMs ?? ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS;
  return input.checkedAt.getTime() - last.getTime() < cooldown;
}

export function cooldownElapsed(input: {
  lastNotifiedAt: Date | null | undefined;
  checkedAt: Date;
  cooldownMs?: number;
}): boolean {
  const last = input.lastNotifiedAt;
  if (!(last instanceof Date) || !Number.isFinite(last.getTime())) return false;
  const cooldown = input.cooldownMs ?? ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS;
  return input.checkedAt.getTime() - last.getTime() >= cooldown;
}

/**
 * Safe admin alerts deep-link from a canonical application base URL.
 * Only https://mapesim.com (or www) is accepted — omit localhost / invented hosts.
 */
export function buildSafeAdminAlertUrl(
  canonicalBaseUrl: string | null | undefined
): string | null {
  const raw = String(canonicalBaseUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (host !== "mapesim.com" && host !== "www.mapesim.com") return null;
    return "https://mapesim.com/admin/alerts";
  } catch {
    return null;
  }
}

export function evidenceSafeAlertSummary(alert: MonitoringAlert): string {
  const title = String(alert.title ?? "")
    .replace(/[<>]/g, "")
    .slice(0, 160);
  const desc = String(alert.description ?? "")
    .replace(/[<>]/g, "")
    .slice(0, 280);
  return `${title}. ${desc}`.trim();
}

export function deriveDisplayStatus(input: {
  eligible: boolean;
  latestDeliveryStatus: AlertNotificationDeliveryStatus | null;
  lastNotifiedAt: Date | null;
  checkedAt: Date;
}): DerivedNotificationDisplayStatus {
  if (!input.eligible) return "not_eligible";
  if (input.latestDeliveryStatus === "FAILED") return "failed";
  if (
    input.latestDeliveryStatus === "PENDING" ||
    input.latestDeliveryStatus === "CLAIMED"
  ) {
    return "pending";
  }
  if (
    input.lastNotifiedAt &&
    isCooldownActive({
      lastNotifiedAt: input.lastNotifiedAt,
      checkedAt: input.checkedAt,
    })
  ) {
    return "cooldown";
  }
  if (input.lastNotifiedAt || input.latestDeliveryStatus === "SENT") {
    return "notified";
  }
  return "pending";
}

export function filterEligibleAlerts(
  alerts: MonitoringAlert[]
): MonitoringAlert[] {
  return alerts.filter(
    (a) => a.state === "ACTIVE" && isAlertEligibleForNotification(a)
  );
}

export type SafeRunnerCounts = {
  eligible: number;
  sent: number;
  suppressed: number;
  cooldown: number;
  failed: number;
  recovery: number;
  /** Due PENDING/FAILED outbox rows left after this bounded run. */
  remaining: number;
};

export function emptyRunnerCounts(): SafeRunnerCounts {
  return {
    eligible: 0,
    sent: 0,
    suppressed: 0,
    cooldown: 0,
    failed: 0,
    recovery: 0,
    remaining: 0,
  };
}

/**
 * Human-safe admin banner copy for opaque SMTP / runner failure codes.
 * Never includes secrets, recipients, or raw provider stacks.
 */
export function formatAlertNotificationFailureReason(input: {
  errorCode?: string | null;
  detail?: string | null;
}): string {
  const code = String(input.errorCode ?? "")
    .trim()
    .toLowerCase();
  const detail = String(input.detail ?? "")
    .trim()
    .toLowerCase();

  if (code === "not_configured" || detail === "not_configured") {
    if (detail === "missing_channel_credentials") {
      return "Support SMTP is not configured (missing SMTP_SUPPORT_USER / SMTP_SUPPORT_PASSWORD).";
    }
    if (detail === "missing_smtp_host") {
      return "Support SMTP is not configured (missing SMTP_HOST).";
    }
    if (detail === "invalid_smtp_port") {
      return "Support SMTP is not configured (invalid SMTP_PORT).";
    }
    if (detail === "mailbox_mismatch") {
      return "Support SMTP is not configured (mailbox mismatch for support@mapesim.com).";
    }
    if (detail.startsWith("port_") || detail.includes("secure") || detail.includes("starttls")) {
      return "Support SMTP is not configured (TLS/port settings invalid).";
    }
    return "Support SMTP is not configured. Set SMTP_HOST and SMTP_SUPPORT_* credentials on the server.";
  }

  if (
    detail === "smtp_connection_timeout" ||
    code === "smtp_timeout" ||
    detail === "smtp_timeout"
  ) {
    return "SMTP connection timed out contacting the support mail server.";
  }
  if (detail === "smtp_connection_failed") {
    return "SMTP connection failed (support mail server unreachable).";
  }
  if (detail === "smtp_auth_failed") {
    return "SMTP authentication failed for the support channel.";
  }
  if (code === "send_failed") {
    return "SMTP send failed for the support channel. Check support SMTP credentials and connectivity.";
  }
  if (code === "invalid_recipients") {
    return "Alert notification recipients are not configured. Set ALERT_NOTIFICATION_RECIPIENTS on the server.";
  }
  if (code === "runner_busy") {
    return "Another notification run is already in progress.";
  }
  if (code === "aggregation_timeout") {
    const collector = String(input.detail ?? "")
      .replace(/^collector_/, "")
      .trim();
    if (collector) {
      return `Alert aggregation timed out while running collector "${collector}". Try again shortly or check Operations health.`;
    }
    return "Alert aggregation timed out. Try again shortly or check Operations health.";
  }
  if (code === "paused") {
    return "Alert notifications are paused. Resume the control before running.";
  }
  if (code === "run_budget_exhausted") {
    return "Alert notification run stopped after the server time budget. Click again to continue.";
  }
  return "Unable to run alert notifications. Please try again.";
}

/** Success banner when a bounded batch leaves more outbox work. */
export function formatAlertNotificationPartialProgress(input: {
  processed: number;
  remaining: number;
}): string | null {
  const processed = Math.max(0, Math.floor(input.processed));
  const remaining = Math.max(0, Math.floor(input.remaining));
  if (remaining <= 0) return null;
  return `Processed ${processed} alerts (${remaining} remaining — click again to continue)`;
}

export type SanitizedRecentDeliveryView = {
  eventType: AlertNotificationEventType;
  status: "SENT" | "FAILED";
  alertCode: string;
  severity: string;
  atLabel: string;
  sourceType: string | null;
  sourceRecordRef: string | null;
};

/** Type-level exhaustiveness: every allowlist entry is a MonitoringAlertCode. */
export function assertHighAllowlistTypeCheck(
  code: AlertNotificationHighAllowlistCode
): MonitoringAlertCode {
  return code;
}

export function categoryFromAlert(alert: MonitoringAlert): AlertCategory {
  return alert.category;
}
