/**
 * Customer on-demand eSIM usage (read-only VeSIM GETs).
 * Never returns ICCID, tokens, QR, IMEI, EID, or TAC to callers.
 */
import "server-only";

import { extractInstallDetails } from "@/app/lib/email/extract";
import { prisma } from "@/app/lib/db";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import {
  authorizeCustomerOwnedOrderInstall,
  fetchBrokerOrderPayload,
} from "@/app/lib/orders/customerOrderInstall";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";

export type CustomerUsageErrorCode =
  | "NOT_FOUND"
  | "NO_ICCID"
  | "USAGE_UNAVAILABLE"
  | "TEMPORARY_ERROR";

export type CustomerUsageSnapshot = {
  status: string;
  statusLabel: string;
  initialDataGB: number | null;
  remainingDataGB: number | null;
  usedDataGB: number | null;
  usagePercent: number | null;
  usagePercentForBar: number | null;
  isUnlimited: boolean;
  planUnlimited: boolean;
  reportsDataAllowance: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  isActivated: boolean | null;
  isExpired: boolean | null;
};

export type CustomerUsageResult =
  | { ok: true; usage: CustomerUsageSnapshot }
  | { ok: false; code: CustomerUsageErrorCode };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

/** True / false when flags present; unknown when absent. */
export function readUsageCapability(
  brokerPayload: JsonRecord | null
): boolean | "unknown" {
  if (!brokerPayload) return "unknown";
  const order = asRecord(brokerPayload.order) ?? brokerPayload;
  const caps = asRecord(order.providerCapabilities) ?? {};

  const available = asBoolean(order.isDataUsageAvailable);
  if (available !== null) return available;

  const supports = asBoolean(caps.supportsUsage);
  if (supports !== null) return supports;

  return "unknown";
}

async function resolveLocalIccid(localOrderId: string): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { id: localOrderId },
    select: { iccidEncrypted: true },
  });
  const encrypted = order?.iccidEncrypted?.trim();
  if (!encrypted || !isIccidEncryptionConfigured()) return null;
  try {
    const plain = decryptIccid(encrypted);
    const normalized = normalizeIccid(plain);
    return validateIccid(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function normalizeProviderUsagePayload(
  payload: JsonRecord
): CustomerUsageSnapshot | null {
  const usage = asRecord(payload.usage) ?? asRecord(payload.data) ?? payload;
  if (!usage) return null;

  const initialDataGB = asFiniteNumber(
    usage.initialDataGB ?? usage.initial_data_gb
  );
  const remainingDataGB = asFiniteNumber(
    usage.remainingDataGB ?? usage.remaining_data_gb
  );

  let usedDataGB: number | null = null;
  if (initialDataGB !== null && remainingDataGB !== null) {
    usedDataGB = Math.max(initialDataGB - remainingDataGB, 0);
  }

  const status =
    asTrimmedString(usage.status) ||
    asTrimmedString(usage.statusLabel) ||
    "Unknown";
  const statusLabel = asTrimmedString(usage.statusLabel) || status;

  const activatedAt =
    asTrimmedString(usage.activatedAt) ||
    asTrimmedString(usage.startAt) ||
    asTrimmedString(usage.activated_at) ||
    asTrimmedString(usage.start_at);

  const expiresAt =
    asTrimmedString(usage.expiresAt) ||
    asTrimmedString(usage.endAt) ||
    asTrimmedString(usage.expires_at) ||
    asTrimmedString(usage.end_at);

  const isUnlimited = asBoolean(usage.isUnlimited) === true;
  const planUnlimited = asBoolean(usage.planUnlimited) === true;
  const reportsDataAllowance = asBoolean(usage.reportsDataAllowance) !== false;

  let usagePercent = asFiniteNumber(usage.usagePercent);
  let usagePercentForBar = asFiniteNumber(usage.usagePercentForBar);
  if (usagePercent !== null) {
    usagePercent = Math.min(100, Math.max(0, usagePercent));
  }
  if (usagePercentForBar !== null) {
    usagePercentForBar = Math.min(100, Math.max(0, usagePercentForBar));
  } else if (usagePercent !== null) {
    usagePercentForBar = usagePercent;
  }

  const daysRemaining = asFiniteNumber(usage.daysRemaining);

  return {
    status,
    statusLabel,
    initialDataGB,
    remainingDataGB,
    usedDataGB,
    usagePercent,
    usagePercentForBar,
    isUnlimited: isUnlimited || planUnlimited,
    planUnlimited,
    reportsDataAllowance,
    activatedAt,
    expiresAt,
    daysRemaining:
      daysRemaining !== null && daysRemaining >= 0
        ? Math.floor(daysRemaining)
        : null,
    isActivated: asBoolean(usage.isActivated),
    isExpired: asBoolean(usage.isExpired),
  };
}

async function fetchProviderUsage(
  iccid: string
): Promise<
  | { ok: true; payload: JsonRecord }
  | { ok: false; kind: "not_found" | "temporary" }
> {
  try {
    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/esim/usage/${encodeURIComponent(iccid)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );
    const payload = (await readJsonSafe(response)) as JsonRecord;
    if (response.status === 404) {
      return { ok: false, kind: "not_found" };
    }
    if (!response.ok) {
      return { ok: false, kind: "temporary" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, kind: "temporary" };
  }
}

/**
 * Explicit customer action: load sanitized usage for an owned completed order.
 */
export async function getCustomerOwnedOrderUsage(
  localOrderIdRaw: string
): Promise<CustomerUsageResult> {
  const authz = await authorizeCustomerOwnedOrderInstall(localOrderIdRaw);
  if (!authz.ok) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const localIccid = await resolveLocalIccid(authz.order.localOrderId);
  const broker = await fetchBrokerOrderPayload(authz.order.providerOrderId);
  if (!broker && !localIccid) {
    return { ok: false, code: "TEMPORARY_ERROR" };
  }

  if (broker) {
    const capability = readUsageCapability(broker);
    if (capability === false) {
      return { ok: false, code: "USAGE_UNAVAILABLE" };
    }
  }

  const fromBroker = broker
    ? normalizeIccid(extractInstallDetails(broker).iccid ?? "")
    : "";
  const iccid =
    localIccid ||
    (fromBroker && validateIccid(fromBroker) ? fromBroker : null);

  if (!iccid) {
    return { ok: false, code: "NO_ICCID" };
  }

  const usageRes = await fetchProviderUsage(iccid);
  if (!usageRes.ok) {
    if (usageRes.kind === "not_found") {
      return { ok: false, code: "USAGE_UNAVAILABLE" };
    }
    return { ok: false, code: "TEMPORARY_ERROR" };
  }

  const normalized = normalizeProviderUsagePayload(usageRes.payload);
  if (!normalized) {
    return { ok: false, code: "TEMPORARY_ERROR" };
  }

  return { ok: true, usage: normalized };
}

export function customerUsagePublicError(code: CustomerUsageErrorCode): {
  status: number;
  message: string;
} {
  switch (code) {
    case "NO_ICCID":
      return {
        status: 404,
        message:
          "Usage details are not available yet. Please try again later.",
      };
    case "USAGE_UNAVAILABLE":
      return {
        status: 404,
        message: "Usage data isn’t available for this eSIM yet.",
      };
    case "TEMPORARY_ERROR":
      return {
        status: 503,
        message: "Usage is temporarily unavailable. Please try again later.",
      };
    case "NOT_FOUND":
    default:
      return { status: 404, message: "Not found" };
  }
}
