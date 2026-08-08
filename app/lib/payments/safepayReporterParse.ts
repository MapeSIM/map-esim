/**
 * Pure Safepay reporter payment payload parsing (no I/O, no secrets).
 * Handles both nested `{ data: { tracker: {...} } }` and top-level tracker
 * shapes observed from `/reporter/api/v1/payments/:token`.
 */

export type SafepayReporterLifecycleStatus =
  | "confirmed"
  | "pending"
  | "failed"
  | "cancelled"
  | "uncertain";

export type SafepayReporterEvidence = {
  /** Full tracker token for server-side ownership compare only — never log/UI. */
  trackerToken: string | null;
  state: string;
  status: SafepayReporterLifecycleStatus;
  quoteAmountMinor: number | null;
  quoteCurrency: string | null;
  metadataOrderId: string | null;
  /** Sanitized event type names only (e.g. CAPTURE). */
  completionEventTypes: string[];
  hasCaptureEvidence: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapLifecycleStatus(state: string): SafepayReporterLifecycleStatus {
  const s = state.trim().toUpperCase();
  if (!s || s === "UNKNOWN") return "uncertain";
  if (s === "TRACKER_ENDED") return "confirmed";
  if (
    s.includes("CANCEL") ||
    s.includes("EXPIRED") ||
    s.includes("VOID") ||
    s.includes("ABANDON")
  ) {
    return "cancelled";
  }
  if (
    s === "TRACKER_STARTED" ||
    s === "TRACKER_PENDING" ||
    s.includes("PENDING")
  ) {
    return "pending";
  }
  if (s.includes("FAIL") || s.includes("ERROR") || s.includes("REJECT")) {
    return "failed";
  }
  return "uncertain";
}

function extractMetadataOrderId(metadata: unknown): string | null {
  const root = asRecord(metadata);
  if (!root) return null;
  const order = root.order_id;
  if (typeof order === "string") return asString(order);
  const nested = asRecord(order);
  return asString(nested?.value);
}

function extractEventTypes(events: unknown): string[] {
  if (!Array.isArray(events)) return [];
  const out: string[] = [];
  for (const item of events) {
    const row = asRecord(item);
    const type =
      asString(row?.type) ||
      asString(row?.name) ||
      asString(row?.event_type);
    if (!type || type.length > 64) continue;
    if (!/^[A-Za-z0-9_.-]+$/.test(type)) continue;
    if (!out.includes(type)) out.push(type);
    if (out.length >= 12) break;
  }
  return out;
}

function resolveTrackerRecord(
  json: Record<string, unknown>
): Record<string, unknown> | null {
  const data = asRecord(json.data);
  const nested = asRecord(data?.tracker);
  if (nested && (asString(nested.state) || asString(nested.token))) {
    return nested;
  }
  // Reporter often returns the tracker fields directly under `data`.
  if (data && (asString(data.state) || asString(data.token))) {
    return data;
  }
  if (asString(json.state) || asString(json.token)) {
    return json;
  }
  return data;
}

/**
 * Parse a Safepay reporter payment JSON body into sanitized evidence fields.
 */
export function parseSafepayReporterPaymentPayload(
  json: unknown
): SafepayReporterEvidence | null {
  const root = asRecord(json);
  if (!root) return null;
  const tracker = resolveTrackerRecord(root);
  if (!tracker) return null;

  const state = asString(tracker.state) ?? "UNKNOWN";
  const status = mapLifecycleStatus(state);
  const totals = asRecord(tracker.purchase_totals);
  const quote = asRecord(totals?.quote_amount);
  const charge = asRecord(asRecord(tracker.charge)?.amount);

  const quoteAmountMinor =
    asNumber(quote?.amount) ?? asNumber(charge?.amount);
  const quoteCurrency =
    asString(quote?.currency)?.toUpperCase() ??
    asString(charge?.currency)?.toUpperCase() ??
    null;

  const completionEventTypes = extractEventTypes(tracker.events);
  const hasCaptureEvidence = completionEventTypes.some(
    (t) => t.toUpperCase() === "CAPTURE"
  );

  return {
    trackerToken: asString(tracker.token),
    state,
    status,
    quoteAmountMinor,
    quoteCurrency,
    metadataOrderId: extractMetadataOrderId(tracker.metadata),
    completionEventTypes,
    hasCaptureEvidence,
  };
}

export function maskSafepayTrackerRef(token: string | null | undefined): string {
  const t = (token ?? "").trim();
  if (!t) return "(none)";
  if (t.length <= 10) return "••••";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}
