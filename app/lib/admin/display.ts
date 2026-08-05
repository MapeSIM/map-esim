/**
 * Pure admin display helpers (safe for offline QA; no Prisma / env secrets).
 */

export const ADMIN_RECENT_ORDERS_LIMIT = 10;
export const ADMIN_AUDIT_LOG_LIMIT = 50;
export const ADMIN_ORDERS_PAGE_SIZE = 20;
export const ADMIN_ORDERS_PAGE_SIZE_MAX = 100;
export const ADMIN_CUSTOMERS_PAGE_SIZE = 20;
export const ADMIN_CUSTOMERS_PAGE_SIZE_MAX = 100;
export const ADMIN_SEARCH_MAX_LENGTH = 100;

/** Harmless metadata keys only — never email, tokens, or identifiers. */
const METADATA_ALLOWLIST = new Set([
  "verification",
  "consentSource",
  "source",
  "termsVersion",
  "privacyVersion",
  "channel",
  "method",
  "role",
  "amountCents",
  "currency",
  "reason",
  "fundingSource",
  "providerCostCents",
  "failureCategory",
  "failureCode",
  "walletTransactionId",
  "purchaseId",
  "topupId",
]);

export type AdminOrderStatusFilter = "ALL" | "COMPLETED" | "PENDING" | "FAILED";
export type AdminOrderAssociationFilter = "ALL" | "LINKED" | "GUEST";

export type AdminCustomerVerificationFilter = "ALL" | "VERIFIED" | "UNVERIFIED";
export type AdminCustomerAuthFilter = "ALL" | "GOOGLE" | "CREDENTIALS";
export type AdminCustomerAccountFilter = "ALL" | "ACTIVE" | "DELETED";

/**
 * Safe short prefix/suffix of a provider order id for admin lists.
 * Never returns the full reference when longer than 8 characters.
 */
export function maskProviderOrderRef(
  providerOrderId: string | null | undefined
): string {
  const raw = (providerOrderId ?? "").trim();
  if (!raw) return "Not available";
  if (raw.length <= 8) return "••••";
  const head = raw.slice(0, 4);
  const tail = raw.slice(-4);
  return `${head}…${tail}`;
}

/**
 * Mask an ICCID-like value to last-4 only (admin list/detail safe).
 * Empty → Pending from provider. Never returns plaintext body digits.
 */
export function maskIccidLast4(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D+/g, "");
  if (!digits) return "Pending from provider";
  const last4 = digits.slice(-4);
  if (last4.length < 4) return "••••••••••••••••";
  return `•••••••••••••${last4}`;
}

/** Format stored iccidLast4 field for admin display. */
export function formatStoredIccidLast4(
  last4: string | null | undefined
): string {
  const digits = (last4 ?? "").replace(/\D+/g, "");
  if (digits.length !== 4) return "Pending from provider";
  return `•••••••••••••${digits}`;
}

/**
 * Extract only allowlisted string/number/boolean metadata values.
 * Never returns raw JSON of the full metadata object.
 */
export function sanitizeAuditMetadata(
  metadata: unknown
): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    metadata as Record<string, unknown>
  )) {
    if (!METADATA_ALLOWLIST.has(key)) continue;
    if (typeof value === "string") {
      const t = value.trim();
      if (t && t.length <= 80) out[key] = t;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value);
    } else if (typeof value === "boolean") {
      out[key] = value ? "true" : "false";
    }
  }
  return out;
}

export function formatSafeAuditDetails(metadata: unknown): string {
  const safe = sanitizeAuditMetadata(metadata);
  const parts = Object.entries(safe).map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function normalizeAdminSearchQuery(
  raw: string | null | undefined
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

export function parseAdminOrderStatusFilter(
  raw: string | null | undefined
): AdminOrderStatusFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "COMPLETED" || v === "PENDING" || v === "FAILED") return v;
  return "ALL";
}

export function parseAdminOrderAssociationFilter(
  raw: string | null | undefined
): AdminOrderAssociationFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "LINKED" || v === "GUEST") return v;
  return "ALL";
}

export function parseAdminOrdersPage(
  raw: string | null | undefined
): number {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Clamp page size; UI uses 20, hard max 100. */
export function resolveAdminOrdersPageSize(
  requested?: number | null
): number {
  if (requested == null || !Number.isFinite(requested)) {
    return ADMIN_ORDERS_PAGE_SIZE;
  }
  const n = Math.floor(requested);
  if (n < 1) return ADMIN_ORDERS_PAGE_SIZE;
  return Math.min(n, ADMIN_ORDERS_PAGE_SIZE_MAX);
}

export function parseAdminCustomersPage(
  raw: string | null | undefined
): number {
  return parseAdminOrdersPage(raw);
}

export function resolveAdminCustomersPageSize(
  requested?: number | null
): number {
  if (requested == null || !Number.isFinite(requested)) {
    return ADMIN_CUSTOMERS_PAGE_SIZE;
  }
  const n = Math.floor(requested);
  if (n < 1) return ADMIN_CUSTOMERS_PAGE_SIZE;
  return Math.min(n, ADMIN_CUSTOMERS_PAGE_SIZE_MAX);
}

export function parseAdminCustomerVerificationFilter(
  raw: string | null | undefined
): AdminCustomerVerificationFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "VERIFIED" || v === "UNVERIFIED") return v;
  return "ALL";
}

export function parseAdminCustomerAuthFilter(
  raw: string | null | undefined
): AdminCustomerAuthFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "GOOGLE" || v === "CREDENTIALS") return v;
  return "ALL";
}

export function parseAdminCustomerAccountFilter(
  raw: string | null | undefined
): AdminCustomerAccountFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "ACTIVE" || v === "DELETED") return v;
  return "ALL";
}

/**
 * Mask email for admin list rows. Full address only on ADMIN detail.
 * Example: rana@example.com → r***@example.com
 */
export function maskAdminEmail(email: string | null | undefined): string {
  const raw = (email ?? "").trim();
  if (!raw) return "Not available";
  const at = raw.indexOf("@");
  if (at <= 0 || at === raw.length - 1) return "***";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1).trim();
  if (!domain) return "***";
  const first = local.charAt(0);
  return `${first}***@${domain}`;
}

/** Normalize optional customer id filter for orders deep-link (never email). */
export function normalizeAdminUserIdFilter(
  raw: string | null | undefined
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > 64) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return "";
  return trimmed;
}
