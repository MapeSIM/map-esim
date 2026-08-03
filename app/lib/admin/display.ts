/**
 * Pure admin display helpers (safe for offline QA; no Prisma / env secrets).
 */

export const ADMIN_RECENT_ORDERS_LIMIT = 10;
export const ADMIN_AUDIT_LOG_LIMIT = 50;

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
