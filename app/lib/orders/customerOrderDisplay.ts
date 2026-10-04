/**
 * Pure customer-facing order display helpers (safe for offline QA).
 * No Prisma, no secrets, no provider calls.
 */

export const CUSTOMER_ORDERS_PAGE_LIMIT = 20;

export function parseCustomerOrdersPage(
  raw: string | null | undefined
): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

export type CustomerEsimStatusBadge =
  | "Completed"
  | "Processing"
  | "Review needed"
  | "Refunded"
  | "Failed"
  /** Completed purchase whose VeSIM line cache reports ACTIVE. */
  | "Active"
  /** Completed purchase whose VeSIM line cache reports DEPLETED. */
  | "Data Depleted"
  /** Completed purchase whose VeSIM line cache reports EXPIRED. */
  | "eSIM Expired";

/** Purchase-complete badges that still represent a usable / refreshable line. */
const CUSTOMER_LINE_READY_BADGES: ReadonlySet<CustomerEsimStatusBadge> = new Set([
  "Completed",
  "Active",
  "Data Depleted",
  "eSIM Expired",
]);

/** Badges where install QR may still be offered (not refunded / expired). */
const CUSTOMER_INSTALL_ALLOWED_BADGES: ReadonlySet<CustomerEsimStatusBadge> =
  new Set(["Completed", "Active", "Data Depleted"]);

function applyProviderLifecycleToCompletedBadge(
  badge: CustomerEsimStatusBadge,
  providerLifecycleStatus: string | null | undefined
): CustomerEsimStatusBadge {
  if (badge !== "Completed") return badge;
  const lifecycle = (providerLifecycleStatus ?? "").trim().toUpperCase();
  if (lifecycle === "EXPIRED") return "eSIM Expired";
  if (lifecycle === "DEPLETED") return "Data Depleted";
  if (lifecycle === "ACTIVE") return "Active";
  // NOT_ACTIVE / UNKNOWN / unset → keep Completed ("Ready to install").
  return badge;
}

export type CustomerEsimStatusFilter =
  | "ALL"
  | "COMPLETED"
  | "PROCESSING"
  | "REVIEW_NEEDED"
  | "REFUNDED"
  | "FAILED";

export function parseCustomerEsimStatusFilter(
  raw: string | null | undefined
): CustomerEsimStatusFilter {
  const v = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (v === "COMPLETED") return "COMPLETED";
  if (v === "PROCESSING") return "PROCESSING";
  if (v === "REVIEW_NEEDED" || v === "REVIEW") return "REVIEW_NEEDED";
  if (v === "REFUNDED") return "REFUNDED";
  if (v === "FAILED") return "FAILED";
  return "ALL";
}

export function normalizeCustomerOrderSearch(
  raw: string | null | undefined
): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return v.slice(0, 100);
}

/** YYYY-MM-DD only — empty when invalid. */
export function parseCustomerOrderDateFilter(
  raw: string | null | undefined
): string {
  const v = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const t = Date.parse(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return "";
  return v;
}

export function shortCustomerOrderReference(orderId: string): string {
  const id = (orderId ?? "").trim();
  if (!id) return "—";
  if (id.length <= 8) return "••••";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function customerFundingLabel(
  fundingSource: string | null | undefined
): string {
  if (fundingSource === "COMPANY_FUNDED") return "Company-funded";
  if (fundingSource === "CUSTOMER_WALLET") return "Wallet";
  if (fundingSource === "DIRECT_PAYMENT") return "Card payment";
  return "Not available";
}

export function customerEmailDeliveryLabel(
  status: string | null | undefined
): string | null {
  const v = (status ?? "").trim().toLowerCase();
  if (!v) return null;
  switch (v) {
    case "sent":
    case "already_sent":
      return "Email sent";
    case "failed":
      return "Email failed";
    case "not_configured":
      return "Email not configured";
    case "invalid_email":
      return "Email address invalid";
    case "skipped_no_install_details":
      return "Email skipped";
    default:
      return "Email status unavailable";
  }
}

export function resolveCustomerEsimStatusBadge(input: {
  orderStatus: string;
  walletPurchaseStatus?: string | null;
  assignmentStatus?: string | null;
  /** True when a customer RefundRequest is COMPLETED for this order. */
  hasCompletedRefund?: boolean;
  /**
   * Cached VeSIM line state (ACTIVE / DEPLETED / EXPIRED / NOT_ACTIVE).
   * Never invents lifecycle from plan validity alone.
   */
  providerLifecycleStatus?: string | null;
}): CustomerEsimStatusBadge {
  const purchase = (input.walletPurchaseStatus ?? "").trim();
  const assignment = (input.assignmentStatus ?? "").trim();
  const order = (input.orderStatus ?? "").trim();

  if (input.hasCompletedRefund === true || purchase === "FAILED_REFUNDED") {
    return "Refunded";
  }
  if (
    purchase === "RECONCILIATION_REQUIRED" ||
    assignment === "RECONCILIATION_REQUIRED"
  ) {
    return "Review needed";
  }
  if (order === "FAILED" || assignment === "FAILED") return "Failed";

  let badge: CustomerEsimStatusBadge | null = null;
  if (order === "COMPLETED" && (purchase === "COMPLETED" || !purchase)) {
    if (!assignment || assignment === "COMPLETED") badge = "Completed";
  }
  if (!badge && order === "COMPLETED") badge = "Completed";
  if (
    !badge &&
    (order === "PENDING" ||
      purchase === "FUNDED" ||
      purchase === "PROVIDER_PENDING" ||
      purchase === "FUNDS_RESERVED" ||
      purchase === "READY" ||
      assignment === "PROVIDER_PENDING" ||
      assignment === "READY")
  ) {
    badge = "Processing";
  }
  if (!badge && order === "FAILED") badge = "Failed";
  if (!badge) badge = "Processing";

  // Lifecycle overrides Completed so Active / Depleted / Expired beat "Ready to install".
  return applyProviderLifecycleToCompletedBadge(
    badge,
    input.providerLifecycleStatus
  );
}

export function customerStatusMatchesFilter(
  badge: CustomerEsimStatusBadge,
  filter: CustomerEsimStatusFilter
): boolean {
  if (filter === "ALL") return true;
  if (filter === "COMPLETED") {
    return CUSTOMER_LINE_READY_BADGES.has(badge);
  }
  if (filter === "PROCESSING") return badge === "Processing";
  if (filter === "REVIEW_NEEDED") return badge === "Review needed";
  if (filter === "REFUNDED") return badge === "Refunded";
  if (filter === "FAILED") return badge === "Failed";
  return true;
}

/** Short customer-facing status shown on My eSIMs cards. */
export function customerEsimStatusLabel(
  badge: CustomerEsimStatusBadge
): string {
  switch (badge) {
    case "Completed":
      return "Ready to install";
    case "Active":
      return "Active";
    case "Data Depleted":
      return "Data Depleted";
    case "Processing":
      return "Setting up";
    case "Review needed":
      return "Needs a quick check";
    case "Refunded":
      return "Refunded";
    case "Failed":
      return "Could not complete";
    case "eSIM Expired":
      return "eSIM Expired";
    default:
      return badge;
  }
}

export function customerEsimStatusHelp(
  badge: CustomerEsimStatusBadge
): string {
  switch (badge) {
    case "Completed":
      return "Your eSIM is ready. Install it when you want to go online.";
    case "Active":
      return "Your eSIM is active and connected to the network.";
    case "Data Depleted":
      return "Your data allowance is used up. Add more data to keep using this eSIM.";
    case "Processing":
      return "We're preparing this eSIM. Installation options appear when it's ready.";
    case "Review needed":
      return "This order needs a short review. Support can help if it takes longer than expected.";
    case "Refunded":
      return "This eSIM was refunded. Installation is no longer available.";
    case "Failed":
      return "This purchase could not be completed. Open details or contact support.";
    case "eSIM Expired":
      return "This eSIM package has expired. Top up or purchase a new plan to continue using data.";
    default:
      return "";
  }
}

/** True when install QR should be offered (not refunded / expired). */
export function customerEsimInstallAllowed(
  badge: CustomerEsimStatusBadge
): boolean {
  return CUSTOMER_INSTALL_ALLOWED_BADGES.has(badge);
}

/** Completed purchase line that may still show usage / Add More Data CTAs. */
export function customerEsimLineReady(
  badge: CustomerEsimStatusBadge
): boolean {
  return CUSTOMER_LINE_READY_BADGES.has(badge);
}

/** Primary badge already reflects provider lifecycle — skip duplicate lifecycle chip. */
export function customerEsimLifecycleIsPrimaryBadge(
  badge: CustomerEsimStatusBadge
): boolean {
  return (
    badge === "Active" ||
    badge === "Data Depleted" ||
    badge === "eSIM Expired"
  );
}

import { destinationFlagcdnUrl } from "@/app/lib/vesim/destinationPresentation";

/** ISO-2 country/region code for SVG flag assets — empty when unknown. */
export function normalizeFlagCountryCode(
  code: string | null | undefined
): string {
  const v = (code ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(v)) return "";
  return v;
}

export function customerFlagImageUrl(
  countryCode: string | null | undefined
): string | null {
  return destinationFlagcdnUrl(countryCode);
}

export function formatCustomerOrderAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || !Number.isFinite(amount)) return "Not available";
  const code = (currency ?? "").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatUsdCentsAmount(cents: number | null | undefined): string {
  if (cents == null || !Number.isInteger(cents)) return "Not available";
  return formatCustomerOrderAmount(cents / 100, "USD");
}
