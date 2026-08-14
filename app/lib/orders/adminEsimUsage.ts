/**
 * Admin on-demand eSIM usage (read-only VeSIM GETs).
 * Reuses customer normalization. Never returns full ICCID to callers.
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
import { fetchBrokerOrderPayload } from "@/app/lib/orders/customerOrderInstall";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
  readUsageCapability,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";

export type AdminUsageErrorCode =
  | "NOT_FOUND"
  | "NO_ICCID"
  | "USAGE_UNAVAILABLE"
  | "BAD_ICCID"
  | "TEMPORARY_ERROR"
  | "RATE_LIMITED";

export type AdminUsageResult =
  | { ok: true; usage: CustomerUsageSnapshot; checkedAt: string }
  | {
      ok: false;
      code: AdminUsageErrorCode;
      retryAfterSec?: number;
    };

const USAGE_RATE_WINDOW_MS = 30_000;

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

/**
 * Explicit admin action: load sanitized live usage for a local order.
 * Decrypts ICCID server-side only — never returns it.
 */
export async function getAdminOrderUsage(
  localOrderIdRaw: string
): Promise<AdminUsageResult> {
  const localOrderId = (localOrderIdRaw ?? "").trim();
  if (
    !localOrderId ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const order = await prisma.order.findFirst({
    where: { id: localOrderId },
    select: {
      id: true,
      providerOrderId: true,
      iccidEncrypted: true,
    },
  });
  if (!order) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const rate = consumeRateLimit({
    key: `admin-usage:${order.id}`,
    limit: 1,
    windowMs: USAGE_RATE_WINDOW_MS,
  });
  if (!rate.ok) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSec: rate.retryAfterSec,
    };
  }

  const localIccid = await resolveLocalIccid(order.id);
  const providerOrderId = (order.providerOrderId ?? "").trim();
  const broker = providerOrderId
    ? await fetchBrokerOrderPayload(providerOrderId)
    : null;

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
      return { ok: false, code: "BAD_ICCID" };
    }
    return { ok: false, code: "TEMPORARY_ERROR" };
  }

  const normalized = normalizeProviderUsagePayload(usageRes.payload);
  if (!normalized) {
    return { ok: false, code: "TEMPORARY_ERROR" };
  }

  return {
    ok: true,
    usage: normalized,
    checkedAt: new Date().toISOString(),
  };
}

export function adminUsagePublicError(code: AdminUsageErrorCode): {
  status: number;
  message: string;
} {
  switch (code) {
    case "RATE_LIMITED":
      return {
        status: 429,
        message:
          "Please wait a moment before refreshing live usage again (about 30 seconds).",
      };
    case "NO_ICCID":
      return {
        status: 404,
        message: "ICCID is not available for this order yet.",
      };
    case "BAD_ICCID":
      return {
        status: 404,
        message: "Live usage was not found for this eSIM (bad or unknown ICCID).",
      };
    case "USAGE_UNAVAILABLE":
      return {
        status: 404,
        message: "Live usage is not available for this eSIM.",
      };
    case "TEMPORARY_ERROR":
      return {
        status: 503,
        message: "Live usage is temporarily unavailable. Please try again later.",
      };
    case "NOT_FOUND":
    default:
      return { status: 404, message: "Not found" };
  }
}
