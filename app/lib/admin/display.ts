/**
 * Pure admin display helpers (safe for offline QA; no Prisma / env secrets).
 */

export const ADMIN_RECENT_ORDERS_LIMIT = 10;
export const ADMIN_AUDIT_LOG_LIMIT = 50;
export const ADMIN_ORDERS_PAGE_SIZE = 20;
export const ADMIN_ORDERS_PAGE_SIZE_MAX = 100;
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
]);

export type AdminOrderStatusFilter = "ALL" | "COMPLETED" | "PENDING" | "FAILED";
export type AdminOrderAssociationFilter = "ALL" | "LINKED" | "GUEST";

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
 * Reduce any ICCID-like string to last 4 digits only.
 * Empty/short values become a full mask.
 */
export function maskIccidLast4(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (!raw) return "Not available";
  if (raw.length <= 4) return "••••";
  return `••••${raw.slice(-4)}`;
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
