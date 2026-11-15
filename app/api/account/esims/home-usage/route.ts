import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth/session";
import { getCustomerMobileEsimSnapshot } from "@/app/lib/orders/customerMobileEsimSnapshot";
import {
  getCustomerOwnedOrderUsage,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";
import {
  homeUsageStatusBadge,
  type HomeEsimUsageCard,
} from "@/app/lib/esim/homeUsageLookupShared";
import { resolveCheckoutBackHref } from "@/app/lib/plans/checkoutBackHref";
import { customerFlagImageUrl } from "@/app/lib/orders/customerOrderDisplay";
import { prisma } from "@/app/lib/db";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

function cardFromSnapshot(input: {
  orderId: string;
  destination: string;
  planName: string;
  flagUrl: string | null;
  destinationCode: string | null;
  usage: CustomerUsageSnapshot | null;
  lifecycleLabel: string | null;
  lifecycleStatus: string | null;
  remainingDataGb: number | null;
  initialDataGb: number | null;
  usedDataGb: number | null;
  expiresAtIso: string | null;
  syncedAt: string | null;
}): HomeEsimUsageCard {
  const back = resolveCheckoutBackHref({
    destinationCode: input.destinationCode,
    destinationName: input.destination,
  });
  const destinationHref = back.href.startsWith("/countries/")
    ? back.href
    : "/countries";

  const statusBadge = homeUsageStatusBadge({
    lifecycleStatus: input.lifecycleStatus,
    statusLabel: input.usage?.statusLabel ?? input.lifecycleLabel,
    isActivated: input.usage?.isActivated ?? null,
    isExpired: input.usage?.isExpired ?? null,
  });

  return {
    orderId: input.orderId,
    destination: input.destination,
    planName: input.planName,
    flagUrl: input.flagUrl ?? customerFlagImageUrl(input.destinationCode),
    destinationHref,
    statusBadge,
    statusLabel:
      input.usage?.statusLabel || input.lifecycleLabel || statusBadge,
    remainingDataGB:
      input.usage?.remainingDataGB ?? input.remainingDataGb ?? null,
    initialDataGB: input.usage?.initialDataGB ?? input.initialDataGb ?? null,
    usedDataGB: input.usage?.usedDataGB ?? input.usedDataGb ?? null,
    isUnlimited: input.usage?.isUnlimited === true,
    reportsDataAllowance: input.usage
      ? input.usage.reportsDataAllowance !== false
      : true,
    daysRemaining: input.usage?.daysRemaining ?? null,
    expiresAt: input.usage?.expiresAt ?? input.expiresAtIso,
    isActivated: input.usage?.isActivated ?? null,
    isExpired: input.usage?.isExpired ?? null,
    detailHref: `/account/orders/${encodeURIComponent(input.orderId)}`,
    topUpHref: destinationHref,
    lastUpdatedAt: input.syncedAt || new Date().toISOString(),
  };
}

/**
 * Logged-in customer primary eSIM for the Home usage widget.
 * Cache-first; pass ?refresh=1 to hit VeSIM (respects existing 30s rate limit).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401, headers: NO_STORE }
      );
    }

    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    const snapshot = await getCustomerMobileEsimSnapshot(user.id);
    if (!snapshot) {
      return NextResponse.json(
        { success: true, card: null },
        { status: 200, headers: NO_STORE }
      );
    }

    const destRow = await prisma.order.findUnique({
      where: { id: snapshot.orderId },
      select: {
        walletEsimPurchase: { select: { destinationCode: true } },
        adminPackageAssignment: { select: { destinationCode: true } },
      },
    });
    const destinationCode =
      destRow?.walletEsimPurchase?.destinationCode ||
      destRow?.adminPackageAssignment?.destinationCode ||
      null;

    let usage: CustomerUsageSnapshot | null = null;
    if (refresh) {
      const live = await getCustomerOwnedOrderUsage(snapshot.orderId);
      if (live.ok) {
        usage = live.usage;
      } else if (live.code === "RATE_LIMITED") {
        const headers: Record<string, string> = { ...NO_STORE };
        if (live.retryAfterSec) {
          headers["Retry-After"] = String(live.retryAfterSec);
        }
        return NextResponse.json(
          {
            success: false,
            error:
              "Please wait a moment before refreshing usage again (about 30 seconds).",
            card: cardFromSnapshot({
              orderId: snapshot.orderId,
              destination: snapshot.destination,
              planName: snapshot.planName,
              flagUrl: snapshot.flagUrl,
              destinationCode,
              usage: null,
              lifecycleLabel: snapshot.lifecycle.lifecycleLabel,
              lifecycleStatus: snapshot.lifecycle.lifecycleStatus,
              remainingDataGb: snapshot.lifecycle.remainingDataGb,
              initialDataGb: snapshot.lifecycle.initialDataGb,
              usedDataGb: snapshot.lifecycle.usedDataGb,
              expiresAtIso: snapshot.lifecycle.expiresAtIso,
              syncedAt: snapshot.lifecycle.syncedAtLabel
                ? new Date().toISOString()
                : null,
            }),
          },
          { status: 429, headers }
        );
      }
    }

    // Re-read cache after live refresh so remaining/expiry stay aligned.
    const fresh = refresh
      ? await getCustomerMobileEsimSnapshot(user.id)
      : snapshot;
    const row = fresh ?? snapshot;

    return NextResponse.json(
      {
        success: true,
        card: cardFromSnapshot({
          orderId: row.orderId,
          destination: row.destination,
          planName: row.planName,
          flagUrl: row.flagUrl,
          destinationCode,
          usage,
          lifecycleLabel: row.lifecycle.lifecycleLabel,
          lifecycleStatus: row.lifecycle.lifecycleStatus,
          remainingDataGb: row.lifecycle.remainingDataGb,
          initialDataGb: row.lifecycle.initialDataGb,
          usedDataGb: row.lifecycle.usedDataGb,
          expiresAtIso: row.lifecycle.expiresAtIso,
          syncedAt: row.lifecycle.syncedAtLabel
            ? new Date().toISOString()
            : usage
              ? new Date().toISOString()
              : null,
        }),
      },
      { status: 200, headers: NO_STORE }
    );
  } catch {
    console.error("account_home_esim_usage_failed");
    return NextResponse.json(
      {
        success: false,
        error: "Usage is temporarily unavailable. Please try again later.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
