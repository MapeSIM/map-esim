/**
 * Pure reconciliation case classification from local DB fields only.
 * Safe for offline QA — no Prisma, no VeSIM, no secrets.
 */

export const RECONCILIATION_STUCK_AGE_MS = 15 * 60 * 1000;

export const RECONCILIATION_FILTERS = [
  "needs_review",
  "provider_uncertain",
  "funds_reserved",
  "refund_pending",
  "finalization_failed",
  "missing_provider_reference",
  "iccid_pending",
  "order_email_failed",
  "wallet_notification_failed",
  "resolved",
] as const;

export type ReconciliationFilter = (typeof RECONCILIATION_FILTERS)[number];

export type ReconciliationCategory =
  | "PROVIDER_UNKNOWN"
  | "PROVIDER_ORDER_OBSERVED"
  | "LOCAL_FINALIZATION_FAILED"
  | "FUNDS_RESERVED_STUCK"
  | "REFUND_INCOMPLETE"
  | "MISSING_PROVIDER_REFERENCE"
  | "ORDER_EMAIL_FAILED"
  | "WALLET_EMAIL_FAILED"
  | "ICCID_PENDING"
  | "ICCID_CONFLICT"
  | "RESOLVED";

export type ReconciliationSourceType =
  | "wallet_purchase"
  | "assignment"
  | "topup"
  | "order_email"
  | "wallet_email"
  | "iccid";

export type ReconciliationPurchaseType =
  | "Self-service wallet"
  | "Admin-assisted wallet"
  | "Company-funded"
  | "Top-up"
  | "Email issue"
  | "ICCID issue";

export type ClassifyReconciliationInput = {
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
  iccidCapturedAt?: Date | string | null;
  reconciliationResolvedAt?: Date | string | null;
  updatedAt: Date | string;
  now?: Date;
  stuckAgeMs?: number;
};

export function parseReconciliationFilter(
  raw: string | null | undefined
): ReconciliationFilter {
  const v = (raw ?? "").trim().toLowerCase();
  if ((RECONCILIATION_FILTERS as readonly string[]).includes(v)) {
    return v as ReconciliationFilter;
  }
  return "needs_review";
}

export function isStuckAttemptAge(
  updatedAt: Date | string,
  now: Date = new Date(),
  stuckAgeMs: number = RECONCILIATION_STUCK_AGE_MS
): boolean {
  const t =
    updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t >= stuckAgeMs;
}

export function isFailedEmailDelivery(
  status: string | null | undefined
): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "invalid_email";
}

export function isFailedWalletNotification(
  status: string | null | undefined
): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "failed" || v === "not_configured";
}

/**
 * Classify a reconciliation case from local fields only.
 * Priority: resolved → email/iccid dedicated sources → stuck → failure codes → provider refs.
 */
export function classifyReconciliationCase(
  input: ClassifyReconciliationInput
): ReconciliationCategory {
  if (input.reconciliationResolvedAt) {
    return "RESOLVED";
  }

  if (input.sourceType === "order_email") {
    return "ORDER_EMAIL_FAILED";
  }
  if (input.sourceType === "wallet_email") {
    return "WALLET_EMAIL_FAILED";
  }
  if (input.sourceType === "iccid") {
    return "ICCID_PENDING";
  }

  const status = (input.status ?? "").trim().toUpperCase();
  const now = input.now ?? new Date();
  const stuckAge = input.stuckAgeMs ?? RECONCILIATION_STUCK_AGE_MS;
  const failureCategory = (input.failureCategory ?? "").trim().toLowerCase();
  const failureCode = (input.failureCode ?? "").trim().toLowerCase();
  const hasProviderRef = Boolean((input.providerOrderId ?? "").trim());
  const resultKind = (input.providerResultKind ?? "").trim().toLowerCase();

  if (
    (status === "FUNDS_RESERVED" || status === "PROVIDER_PENDING") &&
    isStuckAttemptAge(input.updatedAt, now, stuckAge)
  ) {
    if (
      input.debitTransactionId &&
      !input.refundTransactionId &&
      status === "FUNDS_RESERVED"
    ) {
      return "FUNDS_RESERVED_STUCK";
    }
    if (status === "FUNDS_RESERVED") return "FUNDS_RESERVED_STUCK";
    if (!hasProviderRef) return "MISSING_PROVIDER_REFERENCE";
    return "PROVIDER_UNKNOWN";
  }

  if (
    failureCategory === "local_finalize_failed" ||
    failureCode === "order_persist_error" ||
    failureCode === "order_id_missing"
  ) {
    return "LOCAL_FINALIZATION_FAILED";
  }

  if (
    status === "RECONCILIATION_REQUIRED" &&
    input.debitTransactionId &&
    !input.refundTransactionId &&
    failureCategory !== "local_finalize_failed" &&
    resultKind !== "success"
  ) {
    // Funds reserved / pending without confirmed refund path — incomplete refund review.
    if (
      failureCategory.includes("refund") ||
      failureCode.includes("refund")
    ) {
      return "REFUND_INCOMPLETE";
    }
  }

  if (status === "RECONCILIATION_REQUIRED" && !hasProviderRef) {
    if (resultKind === "uncertain" || failureCategory.includes("uncertain")) {
      return "MISSING_PROVIDER_REFERENCE";
    }
    return "MISSING_PROVIDER_REFERENCE";
  }

  if (status === "RECONCILIATION_REQUIRED" && hasProviderRef) {
    if (
      resultKind === "success" ||
      failureCategory === "local_finalize_failed"
    ) {
      return "PROVIDER_ORDER_OBSERVED";
    }
    if (resultKind === "uncertain" || failureCategory.includes("uncertain")) {
      return "PROVIDER_ORDER_OBSERVED";
    }
    return "PROVIDER_ORDER_OBSERVED";
  }

  if (status === "RECONCILIATION_REQUIRED") {
    return "PROVIDER_UNKNOWN";
  }

  if (isFailedEmailDelivery(input.emailDeliveryStatus)) {
    return "ORDER_EMAIL_FAILED";
  }
  if (isFailedWalletNotification(input.emailNotificationStatus)) {
    return "WALLET_EMAIL_FAILED";
  }

  return "PROVIDER_UNKNOWN";
}

export function categoryMatchesFilter(
  category: ReconciliationCategory,
  filter: ReconciliationFilter
): boolean {
  if (filter === "needs_review") {
    return category !== "RESOLVED";
  }
  if (filter === "resolved") {
    return category === "RESOLVED";
  }
  if (filter === "provider_uncertain") {
    return (
      category === "PROVIDER_UNKNOWN" ||
      category === "PROVIDER_ORDER_OBSERVED" ||
      category === "MISSING_PROVIDER_REFERENCE"
    );
  }
  if (filter === "funds_reserved") {
    return category === "FUNDS_RESERVED_STUCK";
  }
  if (filter === "refund_pending") {
    return category === "REFUND_INCOMPLETE";
  }
  if (filter === "finalization_failed") {
    return category === "LOCAL_FINALIZATION_FAILED";
  }
  if (filter === "missing_provider_reference") {
    return category === "MISSING_PROVIDER_REFERENCE";
  }
  if (filter === "iccid_pending") {
    return category === "ICCID_PENDING" || category === "ICCID_CONFLICT";
  }
  if (filter === "order_email_failed") {
    return category === "ORDER_EMAIL_FAILED";
  }
  if (filter === "wallet_notification_failed") {
    return category === "WALLET_EMAIL_FAILED";
  }
  return true;
}

export function categoryLabel(category: ReconciliationCategory): string {
  switch (category) {
    case "PROVIDER_UNKNOWN":
      return "Provider uncertain";
    case "PROVIDER_ORDER_OBSERVED":
      return "Provider order observed";
    case "LOCAL_FINALIZATION_FAILED":
      return "Finalization failed";
    case "FUNDS_RESERVED_STUCK":
      return "Funds reserved (stuck)";
    case "REFUND_INCOMPLETE":
      return "Refund pending";
    case "MISSING_PROVIDER_REFERENCE":
      return "Missing provider reference";
    case "ORDER_EMAIL_FAILED":
      return "Order email failed";
    case "WALLET_EMAIL_FAILED":
      return "Wallet notification failed";
    case "ICCID_PENDING":
      return "ICCID pending";
    case "ICCID_CONFLICT":
      return "ICCID conflict";
    case "RESOLVED":
      return "Resolved";
    default:
      return "Needs review";
  }
}

export function filterLabel(filter: ReconciliationFilter): string {
  switch (filter) {
    case "needs_review":
      return "Needs review";
    case "provider_uncertain":
      return "Provider uncertain";
    case "funds_reserved":
      return "Funds reserved";
    case "refund_pending":
      return "Refund pending";
    case "finalization_failed":
      return "Finalization failed";
    case "missing_provider_reference":
      return "Missing provider reference";
    case "iccid_pending":
      return "ICCID pending/conflict";
    case "order_email_failed":
      return "Order email failed";
    case "wallet_notification_failed":
      return "Wallet notification failed";
    case "resolved":
      return "Resolved";
    default:
      return "Needs review";
  }
}

export function isValidReconciliationSourceType(
  raw: string | null | undefined
): raw is ReconciliationSourceType {
  const v = (raw ?? "").trim();
  return (
    v === "wallet_purchase" ||
    v === "assignment" ||
    v === "topup" ||
    v === "order_email" ||
    v === "wallet_email" ||
    v === "iccid"
  );
}
