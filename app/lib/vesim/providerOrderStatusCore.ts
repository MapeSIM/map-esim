/**
 * Pure provider-order GET response classification (offline QA safe).
 * Never returns ICCID/QR/LPA/activation secrets — presence flags only.
 */

import {
  extractInstallDetails,
  hasInstallDetails,
} from "@/app/lib/email/extract";

export type ProviderOrderLookupKind =
  | "FOUND"
  | "NOT_FOUND"
  | "UNKNOWN"
  | "TIMEOUT"
  | "AUTH_FAILURE"
  | "ENVIRONMENT_BLOCKED"
  | "PROVIDER_ERROR";

export type TriState = "yes" | "no" | "unknown";

export type SanitizedProviderOrderStatus = {
  kind: ProviderOrderLookupKind;
  observedAt: Date;
  safeStatusCode: string;
  orderExists: TriState;
  safeProviderState: string | null;
  offerMatch: TriState;
  installDataPresent: TriState;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function dig(record: JsonRecord | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record && record[key] != null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function collectContainers(root: JsonRecord): JsonRecord[] {
  const containers: JsonRecord[] = [root];
  for (const key of [
    "order",
    "data",
    "esim",
    "eSim",
    "profile",
    "profiles",
    "installation",
    "install",
    "sim",
    "result",
  ]) {
    const value = root[key];
    const asObj = asRecord(value);
    if (asObj) containers.push(asObj);
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemObj = asRecord(item);
        if (itemObj) containers.push(itemObj);
      }
    }
  }
  return containers;
}

function extractFromContainers(
  containers: JsonRecord[],
  keys: string[]
): string | undefined {
  for (const container of containers) {
    const value = firstString(...keys.map((key) => dig(container, key)));
    if (value) return value;
  }
  return undefined;
}

/** Local copy of order-id extraction — avoids importing server-only vesim/server. */
function extractOrderId(payload: JsonRecord): string | null {
  const containers = collectContainers(payload);
  const id = extractFromContainers(containers, [
    "orderId",
    "order_id",
    "providerOrderId",
    "id",
  ]);
  return id ? id.trim() : null;
}

function extractReturnedOfferId(payload: JsonRecord): string | null {
  const containers = collectContainers(payload);
  const id = extractFromContainers(containers, [
    "offerId",
    "offer_id",
    "packageId",
    "package_id",
  ]);
  return id ? id.trim() : null;
}

function installDataPresent(payload: JsonRecord): boolean {
  return hasInstallDetails(extractInstallDetails(payload));
}

function sanitizeStateToken(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const t = String(raw).trim().slice(0, 48);
  if (!t) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(t)) return null;
  return t;
}

function digState(payload: JsonRecord): string | null {
  const candidates = [
    payload.status,
    payload.state,
    payload.orderStatus,
    payload.fulfillmentStatus,
  ];
  const nested = asRecord(payload.order);
  if (nested) candidates.push(nested.status, nested.state, nested.orderStatus);
  const data = asRecord(payload.data);
  if (data) candidates.push(data.status, data.state);
  for (const c of candidates) {
    const s = sanitizeStateToken(c);
    if (s) return s;
  }
  return null;
}

/**
 * Classify a broker GET response into a sanitized observation.
 * Never returns payload fields beyond safe enums/tokens.
 */
export function classifyProviderOrderResponse(options: {
  httpStatus: number;
  payload: Record<string, unknown>;
  requestedProviderOrderId: string;
  expectedOfferId?: string | null;
  observedAt?: Date;
}): SanitizedProviderOrderStatus {
  const observedAt = options.observedAt ?? new Date();
  const status = options.httpStatus;
  const safeHttp = `http_${status}`;
  const payload = options.payload;

  if (status === 401 || status === 403) {
    return {
      kind: "AUTH_FAILURE",
      observedAt,
      safeStatusCode: safeHttp,
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  if (status === 404) {
    return {
      kind: "NOT_FOUND",
      observedAt,
      safeStatusCode: safeHttp,
      orderExists: "no",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  if (status === 408 || status === 429 || status >= 500) {
    return {
      kind: status >= 500 ? "PROVIDER_ERROR" : "UNKNOWN",
      observedAt,
      safeStatusCode: safeHttp,
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  if (status < 200 || status >= 300) {
    return {
      kind: "UNKNOWN",
      observedAt,
      safeStatusCode: safeHttp,
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  const extractedId = extractOrderId(payload);
  const requested = options.requestedProviderOrderId.trim();
  const idMatches =
    !extractedId ||
    extractedId.trim().toUpperCase() === requested.toUpperCase();

  if (!idMatches) {
    return {
      kind: "UNKNOWN",
      observedAt,
      safeStatusCode: "order_id_mismatch",
      orderExists: "unknown",
      safeProviderState: digState(payload),
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  const expectedOffer = (options.expectedOfferId ?? "").trim();
  let offerMatch: TriState = "unknown";
  if (expectedOffer) {
    const returned = extractReturnedOfferId(payload);
    if (!returned) {
      offerMatch = "unknown";
    } else {
      offerMatch =
        returned.trim().toUpperCase() === expectedOffer.toUpperCase()
          ? "yes"
          : "no";
    }
  }

  return {
    kind: "FOUND",
    observedAt,
    safeStatusCode: safeHttp,
    orderExists: "yes",
    safeProviderState: digState(payload),
    offerMatch,
    installDataPresent: installDataPresent(payload) ? "yes" : "no",
  };
}

export function lookupKindToProviderResultKind(
  kind: ProviderOrderLookupKind
): "success" | "uncertain" | "none" {
  if (kind === "FOUND") return "success";
  if (kind === "NOT_FOUND") return "none";
  return "uncertain";
}
