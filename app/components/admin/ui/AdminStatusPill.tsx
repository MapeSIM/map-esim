import type { ReactNode } from "react";

export type AdminStatusPillTone =
  | "success"
  | "neutral"
  | "muted"
  | "warning"
  | "high"
  | "critical"
  | "info";

const TONE_CLASS: Record<AdminStatusPillTone, string> = {
  success:
    "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]",
  neutral:
    "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]",
  muted: "bg-[var(--surface)] text-[var(--text-muted)]",
  warning:
    "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]",
  high: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  critical: "bg-red-500/10 text-red-700 dark:text-red-300",
  info: "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]",
};

/**
 * Map common admin status labels to a tone (Overview system status + alert severities).
 */
export function resolveAdminStatusPillTone(
  value: string
): AdminStatusPillTone {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (
    normalized === "CONFIGURED" ||
    normalized === "OPERATIONAL" ||
    normalized === "HEALTHY" ||
    normalized === "ENABLED" ||
    normalized === "ACTIVE" ||
    normalized === "YES" ||
    normalized === "EXPECTED" ||
    normalized === "COMPLETED" ||
    normalized === "CONFIRMED" ||
    normalized === "PAYMENT_CONFIRMED" ||
    normalized === "VERIFIED" ||
    normalized === "PRESENT" ||
    normalized === "LINKED" ||
    normalized === "VALID" ||
    normalized === "CREDITED" ||
    normalized === "RESOLVED" ||
    normalized === "ESCALATED"
  ) {
    return "success";
  }
  if (
    normalized === "CRITICAL" ||
    normalized === "FAILED" ||
    normalized === "CANCELLED" ||
    normalized === "CANCELED" ||
    normalized === "BLOCKED" ||
    normalized === "DELETED" ||
    normalized === "EXPIRED" ||
    normalized === "PAUSED" ||
    normalized === "UNAVAILABLE" ||
    normalized === "INVALID"
  ) {
    return "critical";
  }
  if (
    normalized === "HIGH" ||
    normalized === "RECONCILIATION_REQUIRED" ||
    normalized === "PARTIALLY_PAUSED"
  ) {
    return "high";
  }
  if (
    normalized === "WARNING" ||
    normalized === "DEGRADED" ||
    normalized === "PENDING" ||
    normalized === "PAYMENT_PENDING" ||
    normalized === "AWAITING_PAYMENT" ||
    normalized === "AWAITING_GATEWAY_PAYMENT" ||
    normalized === "FUNDS_RESERVED" ||
    normalized === "UNVERIFIED" ||
    normalized === "MISSING" ||
    normalized === "DRAFT" ||
    normalized === "NOT_CONFIGURED" ||
    normalized === "DISABLED" ||
    normalized === "NO" ||
    normalized === "NOT_EXPECTED" ||
    normalized === "LOCKED"
  ) {
    return "warning";
  }
  if (normalized === "INFO") return "info";
  if (
    normalized === "UNKNOWN" ||
    normalized === "GUEST" ||
    normalized === "NONE" ||
    normalized === "N/A" ||
    normalized === "—" ||
    normalized === "-" ||
    normalized === "NOT_IMPLEMENTED" ||
    normalized === "NOT_AVAILABLE" ||
    normalized === "ON_DEMAND" ||
    normalized === "NOT_CHECKED" ||
    normalized === "NOT_IMPLEMENTED_/_DISABLED" ||
    normalized.includes("NOT_IMPLEMENTED")
  ) {
    return "muted";
  }
  return "neutral";
}

export type AdminStatusPillProps = {
  children: ReactNode;
  /** Explicit tone; when omitted, derived from string children when possible. */
  tone?: AdminStatusPillTone;
  /** When children is a string and tone is omitted, auto-map known statuses. */
  value?: string;
  className?: string;
};

/**
 * Presentational status badge. Supports Overview config pills and alert-style tones.
 */
export function AdminStatusPill({
  children,
  tone,
  value,
  className,
}: AdminStatusPillProps) {
  const resolvedTone =
    tone ??
    (typeof value === "string"
      ? resolveAdminStatusPillTone(value)
      : typeof children === "string"
        ? resolveAdminStatusPillTone(children)
        : "neutral");

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        TONE_CLASS[resolvedTone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
