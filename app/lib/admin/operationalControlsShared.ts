/**
 * Pure operational-control helpers (offline-QA safe).
 * No Prisma, no network, no secrets.
 */

export const OPERATIONAL_CONTROL_KEYS = [
  "TRANSACTION_MAINTENANCE",
  "CUSTOMER_WALLET_PURCHASES",
  "ADMIN_WALLET_PURCHASES",
  "COMPANY_ASSIGNMENTS",
  "PROVIDER_ORDER_CREATION",
  "PARTNER_WALLET_PURCHASES",
  "ALERT_NOTIFICATIONS",
] as const;

export type OperationalControlKeyName =
  (typeof OPERATIONAL_CONTROL_KEYS)[number];

/** Keys that affect purchase/assignment/provider initiation status only. */
export const TRANSACTION_OPERATIONAL_CONTROL_KEYS = [
  "TRANSACTION_MAINTENANCE",
  "CUSTOMER_WALLET_PURCHASES",
  "ADMIN_WALLET_PURCHASES",
  "COMPANY_ASSIGNMENTS",
  "PROVIDER_ORDER_CREATION",
  "PARTNER_WALLET_PURCHASES",
] as const satisfies readonly OperationalControlKeyName[];

export const OPERATIONAL_CONTROL_REASON_MIN = 5;
export const OPERATIONAL_CONTROL_REASON_MAX = 240;
export const OPERATIONAL_CONTROL_REASON_UI_MAX = 80;

/** Safe default when a control row is missing: ACTIVE (not paused). */
export const OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED = false as const;

export const OPERATIONAL_CONTROL_PUBLIC_ERROR =
  "Unable to update this control right now.";

export const OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE =
  "This action is temporarily unavailable. Please try again shortly.";

export const CONTROL_CONFIRM_PHRASES = {
  TRANSACTION_MAINTENANCE: {
    pause: "PAUSE ALL TRANSACTIONS",
    resume: "RESUME ALL TRANSACTIONS",
  },
  CUSTOMER_WALLET_PURCHASES: {
    pause: "PAUSE CUSTOMER PURCHASES",
    resume: "RESUME CUSTOMER PURCHASES",
  },
  ADMIN_WALLET_PURCHASES: {
    pause: "PAUSE ADMIN PURCHASES",
    resume: "RESUME ADMIN PURCHASES",
  },
  COMPANY_ASSIGNMENTS: {
    pause: "PAUSE COMPANY ASSIGNMENTS",
    resume: "RESUME COMPANY ASSIGNMENTS",
  },
  PROVIDER_ORDER_CREATION: {
    pause: "PAUSE PROVIDER ORDERS",
    resume: "RESUME PROVIDER ORDERS",
  },
  PARTNER_WALLET_PURCHASES: {
    pause: "PAUSE PARTNER PURCHASES",
    resume: "RESUME PARTNER PURCHASES",
  },
  ALERT_NOTIFICATIONS: {
    pause: "PAUSE ALERT NOTIFICATIONS",
    resume: "RESUME ALERT NOTIFICATIONS",
  },
} as const satisfies Record<
  OperationalControlKeyName,
  { pause: string; resume: string }
>;

export const CONTROL_DISPLAY = {
  TRANSACTION_MAINTENANCE: {
    name: "All transactions",
    scope:
      "Pauses initiation of new purchase and assignment transactions. Browsing, account access, My eSIMs, admin tools, reconciliation, refunds, and email recovery remain available.",
  },
  CUSTOMER_WALLET_PURCHASES: {
    name: "Customer wallet purchases",
    scope: "Pauses new customer self-serve wallet-funded eSIM purchases.",
  },
  ADMIN_WALLET_PURCHASES: {
    name: "Admin-assisted wallet purchases",
    scope: "Pauses new admin-assisted customer-wallet eSIM purchases.",
  },
  COMPANY_ASSIGNMENTS: {
    name: "Company package assignments",
    scope: "Pauses new company-funded / admin package assignments.",
  },
  PROVIDER_ORDER_CREATION: {
    name: "Provider order creation",
    scope:
      "Pauses initiating new VeSIM/provider-backed orders on supported purchase paths. Never enables order creation when environment or other gates block it.",
  },
  PARTNER_WALLET_PURCHASES: {
    name: "Partner wallet purchases",
    scope:
      "Pauses new Partner prepaid-wallet eSIM purchases. Enforcement is wired in Partner Phase 2 purchase slices.",
  },
  ALERT_NOTIFICATIONS: {
    name: "Alert notification emails",
    scope:
      "Pauses outbound admin alert notification emails only. Alert aggregation and the Alerts dashboard remain active. This pause is never emailed.",
  },
} as const satisfies Record<
  OperationalControlKeyName,
  { name: string; scope: string }
>;

export type TransactionFlow =
  | "customer_wallet_purchase"
  | "admin_wallet_purchase"
  | "company_assignment"
  | "provider_order";

export function isOperationalControlKey(
  raw: string | null | undefined
): raw is OperationalControlKeyName {
  return (OPERATIONAL_CONTROL_KEYS as readonly string[]).includes(
    (raw ?? "").trim()
  );
}

export function normalizeOperationalControlKey(
  raw: string | null | undefined
): OperationalControlKeyName | null {
  const v = (raw ?? "").trim();
  return isOperationalControlKey(v) ? v : null;
}

export function parseOperationalControlReason(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < OPERATIONAL_CONTROL_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason (at least ${OPERATIONAL_CONTROL_REASON_MIN} characters).`,
    };
  }
  if (reason.length > OPERATIONAL_CONTROL_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${OPERATIONAL_CONTROL_REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

export function parseOperationalConfirmPhrase(
  raw: FormDataEntryValue | string | null | undefined,
  expected: string
): { ok: true } | { ok: false; error: string } {
  const v = String(raw ?? "").trim();
  if (v !== expected) {
    return {
      ok: false,
      error: `Type ${expected} exactly to confirm.`,
    };
  }
  return { ok: true };
}

export function truncateControlReason(
  reason: string | null | undefined,
  max = OPERATIONAL_CONTROL_REASON_UI_MAX
): string | null {
  const v = String(reason ?? "").trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1))}…`;
}

export function controlStateLabel(paused: boolean): "PAUSED" | "ACTIVE" {
  return paused ? "PAUSED" : "ACTIVE";
}

export function requiredControlsForFlow(
  flow: TransactionFlow,
  options?: { includeProviderOrder?: boolean }
): OperationalControlKeyName[] {
  const keys: OperationalControlKeyName[] = ["TRANSACTION_MAINTENANCE"];
  if (flow === "customer_wallet_purchase") {
    keys.push("CUSTOMER_WALLET_PURCHASES");
  } else if (flow === "admin_wallet_purchase") {
    keys.push("ADMIN_WALLET_PURCHASES");
  } else if (flow === "company_assignment") {
    keys.push("COMPANY_ASSIGNMENTS");
  } else if (flow === "provider_order") {
    keys.push("PROVIDER_ORDER_CREATION");
  }
  if (
    options?.includeProviderOrder &&
    flow !== "provider_order" &&
    !keys.includes("PROVIDER_ORDER_CREATION")
  ) {
    keys.push("PROVIDER_ORDER_CREATION");
  }
  return keys;
}

export function evaluateFlowControls(
  flow: TransactionFlow,
  pausedByKey: Partial<Record<OperationalControlKeyName, boolean>>,
  options?: { includeProviderOrder?: boolean }
): { blocked: boolean; blockingKeys: OperationalControlKeyName[] } {
  const required = requiredControlsForFlow(flow, options);
  const blockingKeys: OperationalControlKeyName[] = [];
  for (const key of required) {
    const paused =
      pausedByKey[key] ?? OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED;
    if (paused) blockingKeys.push(key);
  }
  return { blocked: blockingKeys.length > 0, blockingKeys };
}

/** Overall transactions status for health dashboard. */
export function overallTransactionsStatus(
  pausedByKey: Partial<Record<OperationalControlKeyName, boolean>>
): "ACTIVE" | "PARTIALLY_PAUSED" | "PAUSED" {
  const maint =
    pausedByKey.TRANSACTION_MAINTENANCE ??
    OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED;
  if (maint) return "PAUSED";
  // Alert-notification pause must not affect transactions status.
  const others = TRANSACTION_OPERATIONAL_CONTROL_KEYS.filter(
    (k) => k !== "TRANSACTION_MAINTENANCE"
  );
  const pausedCount = others.filter(
    (k) => pausedByKey[k] ?? OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED
  ).length;
  if (pausedCount === 0) return "ACTIVE";
  if (pausedCount === others.length) return "PAUSED";
  return "PARTIALLY_PAUSED";
}

/** Client-safe sanitized control row for Operations UI. */
export type SanitizedOperationalControlView = {
  key: OperationalControlKeyName;
  name: string;
  scope: string;
  state: "ACTIVE" | "PAUSED";
  paused: boolean;
  version: number;
  reasonTruncated: string | null;
  updatedAtLabel: string;
  updatedByAdminIdSafe: string | null;
  pausePhrase: string;
  resumePhrase: string;
};
