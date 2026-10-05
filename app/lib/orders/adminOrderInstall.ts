import "server-only";

import { NextResponse } from "next/server";
import { OrderStatus, RefundRequestStatus, Role } from "@prisma/client";
import { auth } from "@/auth";
import { apiActorHasAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { prisma } from "@/app/lib/db";
import { fetchBrokerOrderPayload } from "@/app/lib/orders/customerOrderInstall";

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

export type AdminInstallOrder = {
  localOrderId: string;
  providerOrderId: string;
  destination: string | null;
};

/**
 * Admin session auth for install/QR APIs.
 * Requires ORDERS_VIEW / ORDERS_MANAGE / ESIM_FULFILLMENT.
 */
export async function authorizeAdminOrderInstall(
  localOrderIdRaw: string
): Promise<
  | { ok: true; order: AdminInstallOrder }
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
  const sessionUserId = session?.user?.id?.trim() || "";
  const sessionRole = session?.user?.role;
  if (!sessionUserId || sessionRole !== "ADMIN") {
    return { ok: false, response: notFoundResponse() };
  }

  const admin = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    return { ok: false, response: notFoundResponse() };
  }
  if (
    !(await apiActorHasAdminPermission(admin.id, [
      "ORDERS_VIEW",
      "ORDERS_MANAGE",
      "ESIM_FULFILLMENT",
    ]))
  ) {
    return { ok: false, response: notFoundResponse() };
  }

  const order = await prisma.order.findFirst({
    where: { id: localOrderId },
    select: {
      id: true,
      providerOrderId: true,
      destination: true,
      status: true,
      walletEsimPurchase: { select: { status: true } },
      partnerEsimPurchase: { select: { status: true } },
      refundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
      partnerRefundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!order || order.status !== OrderStatus.COMPLETED) {
    return { ok: false, response: notFoundResponse() };
  }

  const providerOrderId = (order.providerOrderId ?? "").trim();
  if (!providerOrderId) {
    return { ok: false, response: notFoundResponse() };
  }

  if (
    order.refundRequests.length > 0 ||
    order.partnerRefundRequests.length > 0 ||
    order.walletEsimPurchase?.status === "FAILED_REFUNDED" ||
    order.partnerEsimPurchase?.status === "FAILED_REFUNDED"
  ) {
    return { ok: false, response: notFoundResponse() };
  }

  return {
    ok: true,
    order: {
      localOrderId: order.id,
      providerOrderId,
      destination: order.destination,
    },
  };
}

export async function fetchAdminBrokerOrderPayload(
  providerOrderId: string
): Promise<Record<string, unknown> | null> {
  return fetchBrokerOrderPayload(providerOrderId);
}

export function adminInstallNotFoundResponse(): NextResponse {
  return notFoundResponse();
}

export function buildAdminSessionQrHrefs(localOrderId: string): {
  qrViewHref: string;
  qrDownloadHref: string;
} {
  const base = `/api/admin/orders/${encodeURIComponent(localOrderId.trim())}/qr`;
  return {
    qrViewHref: base,
    qrDownloadHref: `${base}?download=1`,
  };
}
