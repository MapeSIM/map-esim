import "server-only";

import { NextResponse } from "next/server";
import { OrderStatus, Role } from "@prisma/client";
import { auth } from "@/auth";
import {
  extractOfficialActivationLinks,
  isOfficialAndroidActivationUrl,
  isOfficialAppleEsimActivationUrl,
} from "@/app/lib/email/activation";
import { extractInstallDetails, hasInstallDetails } from "@/app/lib/email/extract";
import { isValidInstallQrValue } from "@/app/lib/email/qr";
import { prisma } from "@/app/lib/db";
import {
  getVesimBaseUrl,
  readJsonSafe,
  vesimAuthorizedFetch,
} from "@/app/lib/vesim/server";

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Not found" },
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

export type CustomerOwnedInstallOrder = {
  localOrderId: string;
  providerOrderId: string;
  destination: string | null;
};

/**
 * Session-based authorization for customer install/QR APIs.
 * Never trusts browser-supplied access tokens. Wrong owner → generic 404.
 */
export async function authorizeCustomerOwnedOrderInstall(
  localOrderIdRaw: string
): Promise<
  | { ok: true; order: CustomerOwnedInstallOrder }
  | { ok: false; response: NextResponse }
> {
  const localOrderId = (localOrderIdRaw ?? "").trim();
  if (
    !localOrderId ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return { ok: false, response: notFoundResponse() };
  }

  const session = await auth();
  const userId = session?.user?.id?.trim() || "";
  const sessionRole = session?.user?.role;
  if (!userId || sessionRole !== "CUSTOMER") {
    return { ok: false, response: notFoundResponse() };
  }

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    return { ok: false, response: notFoundResponse() };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: localOrderId,
      userId: owner.id,
    },
    select: {
      id: true,
      providerOrderId: true,
      destination: true,
      status: true,
      walletEsimPurchase: {
        select: { status: true },
      },
      adminPackageAssignment: {
        select: { status: true },
      },
    },
  });

  if (!order || order.status !== OrderStatus.COMPLETED) {
    return { ok: false, response: notFoundResponse() };
  }

  const purchaseStatus = order.walletEsimPurchase?.status;
  const assignmentStatus = order.adminPackageAssignment?.status;
  if (
    purchaseStatus === "FAILED_REFUNDED" ||
    purchaseStatus === "RECONCILIATION_REQUIRED" ||
    assignmentStatus === "RECONCILIATION_REQUIRED"
  ) {
    return { ok: false, response: notFoundResponse() };
  }

  return {
    ok: true,
    order: {
      localOrderId: order.id,
      providerOrderId: order.providerOrderId,
      destination: order.destination,
    },
  };
}

/** Read-only broker order fetch. Never persists the payload. */
export async function fetchBrokerOrderPayload(
  providerOrderId: string
): Promise<Record<string, unknown> | null> {
  const id = providerOrderId.trim();
  if (!id || id.length > 120) return null;

  try {
    const baseUrl = getVesimBaseUrl();
    const response = await vesimAuthorizedFetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(id)}`,
      { method: "GET" }
    );
    const data = await readJsonSafe(response);
    if (!response.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export type CustomerSessionInstallActions = {
  hasInstallDetails: boolean;
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  iphoneInstallHref?: string;
  iphoneGuideHref: string;
  qrDownloadHref?: string;
  qrViewHref?: string;
  androidGuideHref: string;
  /** Session-scoped proxy path — never the raw provider activation URL. */
  androidActivationUrl?: string;
};

/**
 * Build customer install hrefs that contain only the local order ID.
 * No access tokens, JWTs, LPA, or activation secrets in URLs.
 */
export function buildCustomerSessionInstallActions(
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
  const base = `/api/account/orders/${encodeURIComponent(id)}`;

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

export function customerInstallNotFoundResponse(): NextResponse {
  return notFoundResponse();
}
