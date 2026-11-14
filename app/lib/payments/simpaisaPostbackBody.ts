/**
 * Shared Simpaisa wallet payin postback body parser (pure — no I/O).
 * Official samples may be JSON or application/x-www-form-urlencoded.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Parse a Simpaisa callback body into a flat/nested record.
 * Accepts JSON objects and form-urlencoded key/value pairs.
 */
export function parseSimpaisaPostbackBody(
  rawBody: string
): Record<string, unknown> | null {
  const trimmed = (rawBody ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  try {
    const params = new URLSearchParams(rawBody);
    const record: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      if (!key) continue;
      record[key] = value;
    }
    return Object.keys(record).length > 0 ? record : null;
  } catch {
    return null;
  }
}
