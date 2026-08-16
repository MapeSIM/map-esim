/**
 * Token-authorized public share-page reads (Phase 3 Slice 2).
 * Valid opaque token is the only authorization. No login.
 * Never returns wallet, discount, provider cost, payment, admin, or raw provider payloads.
 */
import "server-only";

import { createHash } from "node:crypto";
import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
} from "@prisma/client";
import { extractInstallDetails, hasInstallDetails } from "@/app/lib/email/extract";
import {
  generateEsimQrDataUrl,
  isValidInstallQrValue,
} from "@/app/lib/email/qr";
import { prisma } from "@/app/lib/db";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import {
  fetchBrokerOrderPayload,
} from "@/app/lib/orders/customerOrderInstall";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";
import { displayOrUnavailable } from "@/app/lib/partner/partnerOrdersDisplay";
import { resolvePartnerEsimShareToken } from "@/app/lib/partner/partnerEsimShareToken";
import { loadPublicShareBrandingForPartner } from "@/app/lib/partner/partnerShareBranding";
import type { PartnerShareBrandingFields } from "@/app/lib/partner/partnerShareBrandingValidate";
import { SHARE_PAGE_UNAVAILABLE_MESSAGE } from "@/app/lib/share/shareSurface";

export const SHARE_STATUS_READY = "Ready";

export type PartnerEsimSharePublicBranding = PartnerShareBrandingFields;

export type PartnerEsimSharePageData = {
  destinationName: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusLabel: typeof SHARE_STATUS_READY;
  qrDataUrl: string | null;
  smdpAddress: string | null;
  activationCode: string | null;
  lpa: string | null;
  fullIccid: string | null;
  hasInstallDetails: boolean;
  installDetailsAvailable: boolean;
  branding: PartnerEsimSharePublicBranding;
};

export type ShareBrokerLookup = (
  providerOrderId: string
) => Promise<Record<string, unknown> | null>;

export type ShareUsageLookup = (
  iccid: string
) => Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; kind: "not_found" | "temporary" }
>;

type JsonRecord = Record<string, unknown>;

function tokenHashForRateLimit(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function qrContainsShareToken(qrValue: string, rawToken: string): boolean {
  const q = qrValue.toLowerCase();
  return (
    q.includes("/share/") ||
    q.includes(rawToken.toLowerCase())
  );
}

async function resolveStoredIccid(encrypted: string | null | undefined): Promise<string | null> {
  const value = (encrypted ?? "").trim();
  if (!value || !isIccidEncryptionConfigured()) return null;
  try {
    const plain = decryptIccid(value);
    const normalized = normalizeIccid(plain);
    return validateIccid(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

async function loadCompletedShareOrder(orderId: string): Promise<{
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  iccidEncrypted: string | null;
  providerOrderId: string;
  purchaseDestination: string | null;
  purchasePlanName: string | null;
  purchaseData: string | null;
  purchaseValidity: string | null;
} | null> {
  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      orderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
    },
    select: {
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      order: {
        select: {
          id: true,
          status: true,
          fundingSource: true,
          destination: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          iccidEncrypted: true,
          providerOrderId: true,
        },
      },
    },
  });

  if (!purchase?.order) return null;
  if (purchase.order.status !== OrderStatus.COMPLETED) return null;
  if (purchase.order.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
    return null;
  }

  return {
    destination: purchase.order.destination,
    planName: purchase.order.planName,
    dataAllowance: purchase.order.dataAllowance,
    validity: purchase.order.validity,
    iccidEncrypted: purchase.order.iccidEncrypted,
    providerOrderId: purchase.order.providerOrderId,
    purchaseDestination: purchase.destinationName || purchase.destinationCode,
    purchasePlanName: purchase.planName,
    purchaseData: purchase.dataAllowance,
    purchaseValidity: purchase.validity,
  };
}

/**
 * Public share-page DTO. Invalid/revoked/malformed/non-completed → null
 * (caller renders the same generic unavailable experience).
 */
export async function getPartnerEsimSharePageData(
  rawToken: string,
  options?: { fetchBrokerPayload?: ShareBrokerLookup }
): Promise<PartnerEsimSharePageData | null> {
  const resolved = await resolvePartnerEsimShareToken(rawToken);
  if (!resolved.ok) return null;

  const row = await loadCompletedShareOrder(resolved.orderId);
  if (!row) return null;

  const fetchBroker = options?.fetchBrokerPayload ?? fetchBrokerOrderPayload;
  let broker: JsonRecord | null = null;
  try {
    broker = await fetchBroker(row.providerOrderId);
  } catch {
    broker = null;
  }

  const install = broker ? extractInstallDetails(broker) : {};
  const lpaCandidate = install.qrValue?.trim() || "";
  const lpa =
    lpaCandidate &&
    isValidInstallQrValue(lpaCandidate) &&
    !qrContainsShareToken(lpaCandidate, rawToken)
      ? lpaCandidate
      : null;

  let qrDataUrl: string | null = null;
  if (lpa) {
    qrDataUrl = await generateEsimQrDataUrl(lpa);
  }

  const fromBroker = install.iccid
    ? normalizeIccid(install.iccid)
    : "";
  const storedIccid = await resolveStoredIccid(row.iccidEncrypted);
  const fullIccid =
    storedIccid ||
    (fromBroker && validateIccid(fromBroker) ? fromBroker : null);

  const installAvailable = Boolean(
    hasInstallDetails(install) || fullIccid || lpa
  );

  const branding = await loadPublicShareBrandingForPartner(resolved.partnerId);

  return {
    destinationName: displayOrUnavailable(
      row.destination || row.purchaseDestination
    ),
    planName: displayOrUnavailable(row.planName || row.purchasePlanName),
    dataAllowance: displayOrUnavailable(
      row.dataAllowance || row.purchaseData
    ),
    validity: displayOrUnavailable(row.validity || row.purchaseValidity),
    statusLabel: SHARE_STATUS_READY,
    qrDataUrl,
    smdpAddress: install.smdpAddress?.trim() || null,
    activationCode: install.activationCode?.trim() || null,
    lpa,
    fullIccid,
    hasInstallDetails: installAvailable,
    installDetailsAvailable: Boolean(lpa || install.smdpAddress || install.activationCode),
    branding,
  };
}

export type ShareUsageErrorCode =
  | "UNAVAILABLE"
  | "NO_ICCID"
  | "USAGE_UNAVAILABLE"
  | "TEMPORARY_ERROR"
  | "RATE_LIMITED";

export type ShareUsageResult =
  | { ok: true; usage: CustomerUsageSnapshot }
  | { ok: false; code: ShareUsageErrorCode; retryAfterSec?: number };

const USAGE_RATE_WINDOW_MS = 30_000;

/**
 * Token-authorized read-only usage. ICCID / provider order id stay server-side.
 */
export async function getPartnerEsimShareUsage(
  rawToken: string,
  options?: {
    fetchBrokerPayload?: ShareBrokerLookup;
    usageLookup?: ShareUsageLookup;
  }
): Promise<ShareUsageResult> {
  const resolved = await resolvePartnerEsimShareToken(rawToken);
  if (!resolved.ok) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const row = await loadCompletedShareOrder(resolved.orderId);
  if (!row) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const rate = consumeRateLimit({
    key: `share-usage:${tokenHashForRateLimit(rawToken.trim())}`,
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

  const storedIccid = await resolveStoredIccid(row.iccidEncrypted);
  const fetchBroker = options?.fetchBrokerPayload ?? fetchBrokerOrderPayload;
  let broker: JsonRecord | null = null;
  try {
    broker = await fetchBroker(row.providerOrderId);
  } catch {
    broker = null;
  }

  const fromBroker = broker
    ? normalizeIccid(extractInstallDetails(broker).iccid ?? "")
    : "";
  const iccid =
    storedIccid ||
    (fromBroker && validateIccid(fromBroker) ? fromBroker : null);

  if (!iccid) {
    return { ok: false, code: "NO_ICCID" };
  }

  const lookup = options?.usageLookup ?? fetchProviderUsage;
  const usageRes = await lookup(iccid);
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

export function shareUsagePublicError(code: ShareUsageErrorCode): {
  status: number;
  message: string;
} {
  switch (code) {
    case "RATE_LIMITED":
      return {
        status: 429,
        message:
          "Please wait a moment before refreshing usage again (about 30 seconds).",
      };
    case "NO_ICCID":
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
    case "UNAVAILABLE":
    default:
      return { status: 404, message: SHARE_PAGE_UNAVAILABLE_MESSAGE };
  }
}
