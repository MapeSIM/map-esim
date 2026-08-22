/**
 * Pure customer-facing order display helpers (safe for offline QA).
 * No Prisma, no secrets, no provider calls.
 */

export const CUSTOMER_ORDERS_PAGE_LIMIT = 100;

export type CustomerEsimStatusBadge =
  | "Completed"
  | "Processing"
  | "Review needed"
  | "Refunded"
  | "Failed";

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
}): CustomerEsimStatusBadge {
  const purchase = (input.walletPurchaseStatus ?? "").trim();
  const assignment = (input.assignmentStatus ?? "").trim();
  const order = (input.orderStatus ?? "").trim();

  if (purchase === "FAILED_REFUNDED") return "Refunded";
  if (
    purchase === "RECONCILIATION_REQUIRED" ||
    assignment === "RECONCILIATION_REQUIRED"
  ) {
    return "Review needed";
  }
  if (order === "FAILED" || assignment === "FAILED") return "Failed";
  if (order === "COMPLETED" && (purchase === "COMPLETED" || !purchase)) {
    if (!assignment || assignment === "COMPLETED") return "Completed";
  }
  if (order === "COMPLETED") return "Completed";
  if (
    order === "PENDING" ||
    purchase === "FUNDED" ||
    purchase === "PROVIDER_PENDING" ||
    purchase === "FUNDS_RESERVED" ||
    purchase === "READY" ||
    assignment === "PROVIDER_PENDING" ||
    assignment === "READY"
  ) {
    return "Processing";
  }
  if (order === "FAILED") return "Failed";
  return "Processing";
}

export function customerStatusMatchesFilter(
  badge: CustomerEsimStatusBadge,
  filter: CustomerEsimStatusFilter
): boolean {
  if (filter === "ALL") return true;
  if (filter === "COMPLETED") return badge === "Completed";
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
    case "Processing":
      return "Setting up";
    case "Review needed":
      return "Needs a quick check";
    case "Refunded":
      return "Refunded";
    case "Failed":
      return "Could not complete";
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
    case "Processing":
      return "We're preparing this eSIM. Installation options appear when it's ready.";
    case "Review needed":
      return "This order needs a short review. Support can help if it takes longer than expected.";
    case "Refunded":
      return "This eSIM was refunded. Installation is no longer available.";
    case "Failed":
      return "This purchase could not be completed. Open details or contact support.";
    default:
      return "";
  }
}

/** ISO-2 country/region code for flagcdn — empty when unknown. */
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
  const code = normalizeFlagCountryCode(countryCode);
  if (!code) return null;
  return `https://flagcdn.com/w80/${code}.png`;
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
