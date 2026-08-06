/**
 * Shared reconciliation case-management constants (client + QA safe).
 */

export const CASE_REASON_MIN = 5;
export const CASE_REASON_MAX = 200;

export const LOCK_CASE_PHRASE = "LOCK CASE";
export const UNLOCK_CASE_PHRASE = "UNLOCK CASE";
export const RESOLVE_CASE_PHRASE = "RESOLVE CASE";

export const ESCALATION_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type EscalationPriority = (typeof ESCALATION_PRIORITIES)[number];

export const RESOLUTION_CODES = [
  "NO_LONGER_ACTIONABLE",
  "ALREADY_RECOVERED",
  "DATA_CORRECTED",
  "DUPLICATE_TEST_DATA",
] as const;

export type ResolutionCode = (typeof RESOLUTION_CODES)[number];

export const CASE_MANAGEMENT_SOURCE_TYPES = [
  "wallet_purchase",
  "assignment",
  "topup",
  "order_email",
  "wallet_email",
  "iccid",
] as const;

export type CaseManagementSourceType =
  (typeof CASE_MANAGEMENT_SOURCE_TYPES)[number];

const PRIORITY_RANK: Record<EscalationPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function escalationPriorityRank(priority: EscalationPriority): number {
  return PRIORITY_RANK[priority];
}

export function parseCaseReason(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < CASE_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason (at least ${CASE_REASON_MIN} characters).`,
    };
  }
  if (reason.length > CASE_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${CASE_REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

export function parseEscalationPriority(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; priority: EscalationPriority } | { ok: false; error: string } {
  const v = String(raw ?? "").trim().toUpperCase();
  if ((ESCALATION_PRIORITIES as readonly string[]).includes(v)) {
    return { ok: true, priority: v as EscalationPriority };
  }
  return { ok: false, error: "Select a valid escalation priority." };
}

export function parseResolutionCode(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; code: ResolutionCode } | { ok: false; error: string } {
  const v = String(raw ?? "").trim().toUpperCase();
  if ((RESOLUTION_CODES as readonly string[]).includes(v)) {
    return { ok: true, code: v as ResolutionCode };
  }
  return { ok: false, error: "Select a valid resolution code." };
}

export function parseConfirmPhrase(
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

export function normalizeCaseManagementSourceType(
  raw: string | null | undefined
): CaseManagementSourceType | null {
  const v = (raw ?? "").trim();
  if (v === "wallet_topup") return "topup";
  if (v === "wallet_notification") return "wallet_email";
  if ((CASE_MANAGEMENT_SOURCE_TYPES as readonly string[]).includes(v)) {
    return v as CaseManagementSourceType;
  }
  return null;
}

export function isCaseManagementSourceType(
  raw: string | null | undefined
): raw is CaseManagementSourceType {
  return normalizeCaseManagementSourceType(raw) != null;
}

export function canRaiseOrKeepEscalation(
  current: EscalationPriority | null | undefined,
  next: EscalationPriority
): boolean {
  if (!current) return true;
  return escalationPriorityRank(next) >= escalationPriorityRank(current);
}

function isFailedEmail(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "invalid_email";
}

function isFailedWalletEmail(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "not_configured";
}

function refreshInProgress(input: {
  providerRefreshResult?: string | null;
  providerRefreshClaimedAt?: Date | string | null;
  providerRefreshCompletedAt?: Date | string | null;
}): boolean {
  const result = (input.providerRefreshResult ?? "").trim().toUpperCase();
  if (result !== "IN_PROGRESS") return false;
  if (!input.providerRefreshClaimedAt) return false;
  if (
    input.providerRefreshCompletedAt &&
    new Date(input.providerRefreshCompletedAt).getTime() >=
      new Date(input.providerRefreshClaimedAt).getTime()
  ) {
    return false;
  }
  return true;
}

/** Pure DB-field resolution blockers — never calls VeSIM. */
export type ResolutionBlockInput = {
  locked: boolean;
  alreadyResolved: boolean;
  status?: string | null;
  providerResultKind?: string | null;
  providerOrderId?: string | null;
  failureCategory?: string | null;
  failureCode?: string | null;
  debitStatus?: string | null;
  refundTransactionId?: string | null;
  orderId?: string | null;
  emailDeliveryStatus?: string | null;
  emailNotificationStatus?: string | null;
  iccidHash?: string | null;
  iccidCapturedAt?: Date | string | null;
  providerRefreshResult?: string | null;
  providerRefreshClaimedAt?: Date | string | null;
  providerRefreshCompletedAt?: Date | string | null;
  sourceType: CaseManagementSourceType;
};

export type ResolutionEligibility = {
  allowed: boolean;
  blockers: string[];
};

/**
 * Safe resolution eligibility from local fields only.
 * Blocks whenever any active financial/provider/email/ICCID risk remains.
 */
export function evaluateResolutionEligibility(
  input: ResolutionBlockInput
): ResolutionEligibility {
  const blockers: string[] = [];

  if (input.alreadyResolved) blockers.push("already_resolved");
  if (input.locked) blockers.push("case_locked");
  if (refreshInProgress(input)) blockers.push("provider_refresh_in_progress");

  const status = (input.status ?? "").trim().toUpperCase();
  const failureCategory = (input.failureCategory ?? "").trim().toLowerCase();
  const failureCode = (input.failureCode ?? "").trim().toLowerCase();
  const resultKind = (input.providerResultKind ?? "").trim().toLowerCase();
  const hasProviderRef = Boolean((input.providerOrderId ?? "").trim());
  const debitStatus = (input.debitStatus ?? "").trim().toUpperCase();
  const hasRefund = Boolean((input.refundTransactionId ?? "").trim());
  const hasOrder = Boolean((input.orderId ?? "").trim());

  if (input.sourceType === "order_email") {
    if (isFailedEmail(input.emailDeliveryStatus)) {
      blockers.push("order_email_failed");
    }
    return { allowed: blockers.length === 0, blockers };
  }

  if (input.sourceType === "wallet_email") {
    if (isFailedWalletEmail(input.emailNotificationStatus)) {
      blockers.push("wallet_notification_failed");
    }
    return { allowed: blockers.length === 0, blockers };
  }

  if (input.sourceType === "iccid") {
    if (!input.iccidHash && !input.iccidCapturedAt) {
      blockers.push("iccid_pending");
    }
    return { allowed: blockers.length === 0, blockers };
  }

  if (input.sourceType === "topup") {
    if (
      status === "RECONCILIATION_REQUIRED" ||
      status === "PAYMENT_CONFIRMED" ||
      status === "PAYMENT_PENDING" ||
      status === "AWAITING_PAYMENT"
    ) {
      blockers.push("reconciliation_still_active");
    }
    return { allowed: blockers.length === 0, blockers };
  }

  // wallet_purchase | assignment
  if (status === "FUNDS_RESERVED" || status === "PROVIDER_PENDING") {
    blockers.push("funds_or_provider_pending");
  }
  if (debitStatus === "PENDING") {
    blockers.push("debit_pending");
  }
  if (refreshInProgress(input)) {
    // already added above
  }

  const finalizeFailed =
    failureCategory === "local_finalize_failed" ||
    failureCode === "order_persist_error" ||
    failureCode === "order_id_missing";
  if (finalizeFailed && !hasOrder) {
    blockers.push("finalization_failed");
  }

  const providerUncertain =
    resultKind === "uncertain" ||
    failureCategory.includes("uncertain") ||
    failureCategory.includes("provider_timeout") ||
    failureCategory.includes("provider_unavailable");

  if (
    providerUncertain &&
    (status === "RECONCILIATION_REQUIRED" ||
      status === "FUNDS_RESERVED" ||
      status === "PROVIDER_PENDING") &&
    !hasOrder &&
    !hasRefund
  ) {
    blockers.push("provider_uncertain");
  }

  if (
    status === "RECONCILIATION_REQUIRED" &&
    !hasProviderRef &&
    !hasOrder &&
    !hasRefund
  ) {
    blockers.push("missing_provider_reference");
  }

  if (
    failureCategory.includes("refund") ||
    failureCode.includes("refund")
  ) {
    if (!hasRefund && status !== "FAILED_REFUNDED" && !hasOrder) {
      blockers.push("refund_incomplete");
    }
  }

  if (isFailedEmail(input.emailDeliveryStatus)) {
    blockers.push("order_email_failed");
  }

  const recovered =
    (status === "COMPLETED" && (hasOrder || input.sourceType === "assignment")) ||
    (status === "FAILED_REFUNDED" && hasRefund) ||
    (status === "FAILED" && input.sourceType === "assignment") ||
    (status === "RECONCILIATION_REQUIRED" && (hasOrder || hasRefund));

  if (
    !recovered &&
    (status === "RECONCILIATION_REQUIRED" ||
      status === "FUNDS_RESERVED" ||
      status === "PROVIDER_PENDING")
  ) {
    blockers.push("reconciliation_still_active");
  }

  return { allowed: blockers.length === 0, blockers };
}

export function resolutionBlockerLabel(code: string): string {
  switch (code) {
    case "already_resolved":
      return "Case is already resolved.";
    case "case_locked":
      return "Unlock the case before resolving.";
    case "funds_or_provider_pending":
      return "Funds are still reserved or the provider call is pending.";
    case "debit_pending":
      return "Wallet debit is still pending.";
    case "refund_incomplete":
      return "Refund is incomplete or missing.";
    case "provider_uncertain":
      return "Provider result is still uncertain.";
    case "provider_refresh_in_progress":
      return "A provider status refresh is in progress.";
    case "finalization_failed":
      return "Local finalization still failed.";
    case "missing_provider_reference":
      return "Provider reference is still missing.";
    case "order_email_failed":
      return "Order email delivery still failed.";
    case "wallet_notification_failed":
      return "Wallet notification still failed.";
    case "iccid_pending":
      return "ICCID capture is still pending.";
    case "reconciliation_still_active":
      return "Reconciliation risk is still active.";
    default:
      return "This case cannot be resolved yet.";
  }
}

export function caseManagementStateLabel(options: {
  resolvedAt?: Date | string | null;
  lockedAt?: Date | string | null;
  escalatedAt?: Date | string | null;
}): "Resolved" | "Locked" | "Escalated" | "Open" {
  if (options.resolvedAt) return "Resolved";
  if (options.lockedAt) return "Locked";
  if (options.escalatedAt) return "Escalated";
  return "Open";
}
