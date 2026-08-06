/**
 * Shared reconciliation case-management constants (client + QA safe).
 */

export const CASE_REASON_MIN = 5;
export const CASE_REASON_MAX = 200;

export const LOCK_CASE_PHRASE = "LOCK CASE";
export const UNLOCK_CASE_PHRASE = "UNLOCK CASE";
export const RESOLVE_CASE_PHRASE = "RESOLVE CASE";
export const DEESCALATE_CASE_PHRASE = "DE-ESCALATE CASE";
export const RESEND_EMAIL_PHRASE = "RESEND EMAIL";

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

/** True only when next is strictly lower than an existing escalation priority. */
export function canLowerEscalation(
  current: EscalationPriority | null | undefined,
  next: EscalationPriority
): boolean {
  if (!current) return false;
  return escalationPriorityRank(next) < escalationPriorityRank(current);
}

export function lowerEscalationPriorities(
  current: EscalationPriority
): EscalationPriority[] {
  const rank = escalationPriorityRank(current);
  return ESCALATION_PRIORITIES.filter((p) => escalationPriorityRank(p) < rank);
}

export function parseKnownEscalationPriority(
  raw: string | null | undefined
): EscalationPriority | null {
  const v = (raw ?? "").trim().toUpperCase();
  if ((ESCALATION_PRIORITIES as readonly string[]).includes(v)) {
    return v as EscalationPriority;
  }
  return null;
}

function isFailedEmail(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "invalid_email";
}

function isFailedWalletEmail(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "not_configured";
}

/** Pure email-resend eligibility from local DB fields (no VeSIM). */
export type EmailResendBlockInput = {
  sourceType: CaseManagementSourceType;
  alreadyResolved: boolean;
  status?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
  providerOrderId?: string | null;
  customerEmail?: string | null;
  emailDeliveryStatus?: string | null;
  emailNotificationStatus?: string | null;
  walletTransactionStatus?: string | null;
  amountCents?: number | null;
  balanceAfterCents?: number | null;
};

export type EmailResendEligibility = {
  allowed: boolean;
  blockers: string[];
  channel: "order_email" | "wallet_email" | null;
};

export function evaluateEmailResendEligibility(
  input: EmailResendBlockInput
): EmailResendEligibility {
  const blockers: string[] = [];
  const source = input.sourceType;

  if (source !== "order_email" && source !== "wallet_email") {
    return { allowed: false, blockers: ["unsupported_source"], channel: null };
  }

  if (input.alreadyResolved) blockers.push("already_resolved");

  if (source === "order_email") {
    const emailStatus = (input.emailDeliveryStatus ?? "").trim().toLowerCase();
    if (emailStatus !== "failed" && emailStatus !== "not_configured") {
      // invalid_email is not safely resendable without correcting the address.
      if (emailStatus === "invalid_email") blockers.push("invalid_email");
      else if (emailStatus === "sent" || emailStatus === "already_sent") {
        blockers.push("email_already_sent");
      } else {
        blockers.push("email_not_failed");
      }
    }
    const status = (input.status ?? "").trim().toUpperCase();
    if (status !== "COMPLETED") blockers.push("order_not_completed");
    if (!(input.orderId ?? "").trim()) blockers.push("missing_local_order");
    if ((input.orderStatus ?? "").trim().toUpperCase() === "FAILED") {
      blockers.push("local_order_failed");
    }
    if (!(input.providerOrderId ?? "").trim()) {
      blockers.push("missing_provider_reference");
    }
    const email = (input.customerEmail ?? "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      blockers.push("customer_email_unavailable");
    }
    return {
      allowed: blockers.length === 0,
      blockers,
      channel: "order_email",
    };
  }

  // wallet_email
  const notify = (input.emailNotificationStatus ?? "").trim().toLowerCase();
  if (notify !== "failed" && notify !== "not_configured") {
    if (notify === "sent") blockers.push("email_already_sent");
    else if (notify === "sending") blockers.push("email_send_in_progress");
    else blockers.push("email_not_failed");
  }
  if ((input.walletTransactionStatus ?? "").trim().toUpperCase() !== "COMPLETED") {
    blockers.push("ledger_not_completed");
  }
  if (
    !Number.isInteger(input.amountCents) ||
    (input.amountCents ?? 0) <= 0 ||
    typeof input.balanceAfterCents !== "number" ||
    !Number.isInteger(input.balanceAfterCents) ||
    (input.balanceAfterCents ?? -1) < 0
  ) {
    blockers.push("incomplete_ledger_snapshot");
  }
  const email = (input.customerEmail ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    blockers.push("customer_email_unavailable");
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    channel: "wallet_email",
  };
}

export function emailResendBlockerLabel(code: string): string {
  switch (code) {
    case "unsupported_source":
      return "This case type does not support email resend.";
    case "already_resolved":
      return "Resolved cases cannot resend email.";
    case "invalid_email":
      return "Customer email is invalid; correct it before resending.";
    case "email_already_sent":
      return "Email was already sent successfully.";
    case "email_not_failed":
      return "Email is not in a failed state.";
    case "email_send_in_progress":
      return "An email send is already in progress.";
    case "order_not_completed":
      return "Underlying purchase/assignment is not completed.";
    case "missing_local_order":
      return "Local order is missing.";
    case "local_order_failed":
      return "Local order is failed.";
    case "missing_provider_reference":
      return "Provider reference is missing.";
    case "customer_email_unavailable":
      return "Customer email is unavailable.";
    case "ledger_not_completed":
      return "Wallet ledger entry is not completed.";
    case "incomplete_ledger_snapshot":
      return "Wallet balance snapshot is incomplete.";
    default:
      return "Email cannot be resent for this case.";
  }
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
