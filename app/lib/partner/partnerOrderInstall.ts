/**
 * Partner-owned completed Order install + usage reads.
 * Ownership is PartnerEsimPurchase → Order. Provider access is GET-only.
 * Never returns raw provider payload, cost, discount, wallet, or payment data.
 */
import "server-only";

import { NextResponse } from "next/server";
import {
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Role,
} from "@prisma/client";
import {
  extractOfficialActivationLinks,
  isOfficialAndroidActivationUrl,
  isOfficialAppleEsimActivationUrl,
} from "@/app/lib/email/activation";
import { extractInstallDetails, hasInstallDetails } from "@/app/lib/email/extract";
import { isValidInstallQrValue } from "@/app/lib/email/qr";
import { prisma } from "@/app/lib/db";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import {
  fetchBrokerOrderPayload,
  type CustomerSessionInstallActions,
} from "@/app/lib/orders/customerOrderInstall";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
  readUsageCapability,
  type CustomerUsageResult,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { PARTNER_INSTALL_UNAVAILABLE_MESSAGE } from "@/app/lib/partner/partnerOrderInstallClient";
import { auth } from "@/auth";

export { PARTNER_INSTALL_UNAVAILABLE_MESSAGE };

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const USAGE_RATE_WINDOW_MS = 30_000;

export type PartnerOwnedInstallOrder = {
  localOrderId: string;
  providerOrderId: string;
  destination: string | null;
};

export type PartnerOrderInstallDto = {
  hasInstallDetails: boolean;
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  iphoneInstallHref: string | null;
  iphoneGuideHref: string;
  qrDownloadHref: string | null;
  qrViewHref: string | null;
  androidGuideHref: string;
  androidActivationUrl: string | null;
  smdpAddress: string | null;
  activationCode: string | null;
  lpa: string | null;
};

export type PartnerBrokerLookup = (
  providerOrderId: string
) => Promise<Record<string, unknown> | null>;

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Not found" },
    { status: 404, headers: NO_STORE }
  );
}

/**
 * True when MAP can show QR / manual / official install actions.
 * ICCID alone is not an installation credential.
 */
export function hasPartnerInstallCapability(input: {
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  smdpAddress?: string | null;
  activationCode?: string | null;
}): boolean {
  return Boolean(
    input.hasVerifiedLpa ||
      input.hasOfficialIphoneActivationUrl ||
      input.hasOfficialAndroidActivationUrl ||
      input.smdpAddress?.trim() ||
      input.activationCode?.trim()
  );
}

export function buildPartnerSessionInstallActions(
  localOrderId: string,
  brokerPayload: Record<string, unknown>
): CustomerSessionInstallActions {
  const id = localOrderId.trim();
  const install = extractInstallDetails(brokerPayload);
  const official = extractOfficialActivationLinks(brokerPayload);
  const hasVerifiedLpa = Boolean(
    install.qrValue && isValidInstallQrValue(install.qrValue)
  );
  const hasOfficialIphoneActivationUrl = Boolean(
    official.iphoneActivationUrl &&
      isOfficialAppleEsimActivationUrl(official.iphoneActivationUrl)
  );
  const hasOfficialAndroidActivationUrl = Boolean(
    official.androidActivationUrl &&
      isOfficialAndroidActivationUrl(official.androidActivationUrl)
  );
  const base = `/api/partner/orders/${encodeURIComponent(id)}`;

  return {
    hasInstallDetails: hasInstallDetails(install),
    hasVerifiedLpa,
    hasOfficialIphoneActivationUrl,
    hasOfficialAndroidActivationUrl,
    iphoneInstallHref: hasOfficialIphoneActivationUrl
      ? `${base}/iphone`
      : undefined,
    iphoneGuideHref: "/install/iphone",
    qrDownloadHref: hasVerifiedLpa ? `${base}/qr?download=1` : undefined,
    qrViewHref: hasVerifiedLpa ? `${base}/qr` : undefined,
    androidGuideHref: "/install/android",
    androidActivationUrl: hasOfficialAndroidActivationUrl
      ? `${base}/android`
      : undefined,
  };
}

export function toPartnerOrderInstallDto(
  localOrderId: string,
  brokerPayload: Record<string, unknown>
): PartnerOrderInstallDto {
  const install = extractInstallDetails(brokerPayload);
  const actions = buildPartnerSessionInstallActions(localOrderId, brokerPayload);
  const hasVerifiedLpa = actions.hasVerifiedLpa;
  return {
    hasInstallDetails: hasPartnerInstallCapability({
      hasVerifiedLpa,
      hasOfficialIphoneActivationUrl: actions.hasOfficialIphoneActivationUrl,
      hasOfficialAndroidActivationUrl: actions.hasOfficialAndroidActivationUrl,
      smdpAddress: install.smdpAddress,
      activationCode: install.activationCode,
    }),
    hasVerifiedLpa,
    hasOfficialIphoneActivationUrl: actions.hasOfficialIphoneActivationUrl,
    hasOfficialAndroidActivationUrl: actions.hasOfficialAndroidActivationUrl,
    iphoneInstallHref: actions.iphoneInstallHref ?? null,
    iphoneGuideHref: actions.iphoneGuideHref,
    qrDownloadHref: actions.qrDownloadHref ?? null,
    qrViewHref: actions.qrViewHref ?? null,
    androidGuideHref: actions.androidGuideHref,
    androidActivationUrl: actions.androidActivationUrl ?? null,
    smdpAddress: install.smdpAddress?.trim() || null,
    activationCode: install.activationCode?.trim() || null,
    lpa: hasVerifiedLpa ? install.qrValue?.trim() || null : null,
  };
}

/**
 * Active PARTNER + own completed Partner Order only.
 * Disabled / cross-Partner / guessed IDs → NOT_FOUND (no existence leak).
 */
export async function authorizePartnerOwnedOrderInstall(
  partnerUserId: string,
  localOrderIdRaw: string
): Promise<
  | { ok: true; order: PartnerOwnedInstallOrder }
  | { ok: false; reason: "NOT_FOUND" }
> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return { ok: false, reason: "NOT_FOUND" };

  const localOrderId = (localOrderIdRaw ?? "").trim();
  if (
    !localOrderId ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.role !== Role.PARTNER) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: actor.partnerId,
      orderId: localOrderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
    },
    select: {
      order: {
        select: {
          id: true,
          providerOrderId: true,
          destination: true,
          status: true,
        },
      },
    },
  });

  if (!purchase?.order || purchase.order.status !== OrderStatus.COMPLETED) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  return {
    ok: true,
    order: {
      localOrderId: purchase.order.id,
      providerOrderId: purchase.order.providerOrderId,
      destination: purchase.order.destination,
    },
  };
}

export async function authorizePartnerOwnedOrderInstallFromSession(
  localOrderIdRaw: string
): Promise<
  | { ok: true; order: PartnerOwnedInstallOrder }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id?.trim() || "";
  const sessionRole = session?.user?.role;
  if (!userId || sessionRole !== "PARTNER") {
    return { ok: false, response: notFoundResponse() };
  }

  const authz = await authorizePartnerOwnedOrderInstall(userId, localOrderIdRaw);
  if (!authz.ok) {
    return { ok: false, response: notFoundResponse() };
  }
  return authz;
}

export function partnerInstallNotFoundResponse(): NextResponse {
  return notFoundResponse();
}

export type PartnerOrderInstallResult =
  | { ok: true; dto: PartnerOrderInstallDto }
  | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE" | "MISSING_INSTALL" };

/**
 * Read install details for a completed own Partner Order.
 * Uses durable Order identifiers, then READ-ONLY provider GET.
 * Parses with extractInstallDetails only. Never persists the payload.
 */
export async function loadPartnerOrderInstallForAuthorized(
  order: PartnerOwnedInstallOrder,
  options?: { fetchBrokerPayload?: PartnerBrokerLookup }
): Promise<PartnerOrderInstallResult> {
  const fetchBroker = options?.fetchBrokerPayload ?? fetchBrokerOrderPayload;
  const orderData = await fetchBroker(order.providerOrderId);
  if (!orderData) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const dto = toPartnerOrderInstallDto(order.localOrderId, orderData);
  if (!dto.hasInstallDetails) {
    return { ok: false, code: "MISSING_INSTALL" };
  }
  return { ok: true, dto };
}

export async function getPartnerOwnedOrderInstall(
  partnerUserId: string,
  orderId: string,
  options?: { fetchBrokerPayload?: PartnerBrokerLookup }
): Promise<PartnerOrderInstallResult> {
  const authz = await authorizePartnerOwnedOrderInstall(partnerUserId, orderId);
  if (!authz.ok) return { ok: false, code: "NOT_FOUND" };
  return loadPartnerOrderInstallForAuthorized(authz.order, options);
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

export async function getPartnerOwnedOrderUsage(
  partnerUserId: string,
  orderId: string,
  options?: {
    fetchBrokerPayload?: PartnerBrokerLookup;
    fetchUsage?: typeof fetchProviderUsage;
  }
): Promise<CustomerUsageResult> {
  const authz = await authorizePartnerOwnedOrderInstall(partnerUserId, orderId);
  if (!authz.ok) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const rate = consumeRateLimit({
    key: `partner-usage:${authz.order.localOrderId}`,
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

  const fetchBroker = options?.fetchBrokerPayload ?? fetchBrokerOrderPayload;
  const fetchUsage = options?.fetchUsage ?? fetchProviderUsage;

  const localIccid = await resolveLocalIccid(authz.order.localOrderId);
  const broker = await fetchBroker(authz.order.providerOrderId);
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

  const usageRes = await fetchUsage(iccid);
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

export type { CustomerUsageSnapshot };
