/**
 * Home Screen eSIM usage lookup (guest Order ID / ICCID + logged-in snapshot).
 * Never returns ICCID, tokens, QR, or install secrets.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  classifyHomeUsageQuery,
  homeUsageStatusBadge,
  type HomeEsimUsageCard,
} from "@/app/lib/esim/homeUsageLookupShared";

export type { HomeEsimUsageCard } from "@/app/lib/esim/homeUsageLookupShared";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
  persistOrderProviderLifecycleCache,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";
import { customerFlagImageUrl } from "@/app/lib/orders/customerOrderDisplay";
import {
  hashIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import { resolveOrderIccidPlaintext } from "@/app/lib/orders/orderIccidResolve";
import {
  classifyProviderLifecycleStatus,
  providerLifecycleLabel,
} from "@/app/lib/orders/providerLifecycleShared";
import { resolveCheckoutBackHref } from "@/app/lib/plans/checkoutBackHref";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";

export type HomeUsageLookupResult =
  | { ok: true; card: HomeEsimUsageCard }
  | {
      ok: false;
      code: "INVALID" | "NOT_FOUND" | "RATE_LIMITED" | "TEMPORARY";
      retryAfterSec?: number;
      message: string;
    };

const PUBLIC_LOOKUP_WINDOW_MS = 60_000;
const PUBLIC_LOOKUP_LIMIT = 5;
const PUBLIC_ICCID_WINDOW_MS = 30_000;

type OrderMetaRow = {
  id: string;
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  userId: string | null;
  providerLifecycleStatus: string | null;
  walletEsimPurchase: { destinationCode: string | null } | null;
  adminPackageAssignment: { destinationCode: string | null } | null;
};

function orderSelect() {
  return {
    id: true,
    destination: true,
    planName: true,
    dataAllowance: true,
    userId: true,
    providerLifecycleStatus: true,
    walletEsimPurchase: { select: { destinationCode: true } },
    adminPackageAssignment: { select: { destinationCode: true } },
  } as const;
}

async function findCompletedOrderByQuery(
  orderId: string
): Promise<OrderMetaRow | null> {
  const row = await prisma.order.findFirst({
    where: {
      status: OrderStatus.COMPLETED,
      OR: [{ id: orderId }, { providerOrderId: orderId }],
    },
    select: orderSelect(),
  });
  return row;
}

async function findCompletedOrderByIccidHash(
  iccid: string
): Promise<OrderMetaRow | null> {
  if (!isIccidEncryptionConfigured()) return null;
  try {
    const digest = hashIccid(iccid);
    return await prisma.order.findFirst({
      where: {
        status: OrderStatus.COMPLETED,
        iccidHash: digest,
      },
      orderBy: { createdAt: "desc" },
      select: orderSelect(),
    });
  } catch {
    return null;
  }
}

function buildCard(input: {
  order: OrderMetaRow | null;
  usage: CustomerUsageSnapshot | null;
  loggedInUserId?: string | null;
}): HomeEsimUsageCard {
  const order = input.order;
  const usage = input.usage;
  const destinationCode =
    order?.walletEsimPurchase?.destinationCode ||
    order?.adminPackageAssignment?.destinationCode ||
    null;
  const destination =
    (order?.destination || "").trim() ||
    (destinationCode ? destinationCode.toUpperCase() : "Your eSIM");
  const planName =
    (order?.planName || "").trim() ||
    (order?.dataAllowance || "").trim() ||
    "eSIM plan";
  const back = resolveCheckoutBackHref({
    destinationCode,
    destinationName: order?.destination ?? null,
  });
  const destinationHref = back.href.startsWith("/countries/")
    ? back.href
    : "/countries";

  const lifecycleStatus =
    usage != null
      ? classifyProviderLifecycleStatus({
          status: usage.status,
          statusLabel: usage.statusLabel,
          isActivated: usage.isActivated,
          isExpired: usage.isExpired,
          remainingDataGB: usage.remainingDataGB,
          isUnlimited: usage.isUnlimited,
        })
      : order?.providerLifecycleStatus ?? null;

  const statusBadge = homeUsageStatusBadge({
    lifecycleStatus,
    statusLabel: usage?.statusLabel ?? providerLifecycleLabel(
      lifecycleStatus as
        | "NOT_ACTIVE"
        | "ACTIVE"
        | "EXPIRED"
        | "DEPLETED"
        | "CANCELLED"
        | "UNKNOWN"
        | null
    ),
    isActivated: usage?.isActivated ?? null,
    isExpired: usage?.isExpired ?? null,
  });

  const statusLabel =
    usage?.statusLabel ||
    providerLifecycleLabel(
      lifecycleStatus as
        | "NOT_ACTIVE"
        | "ACTIVE"
        | "EXPIRED"
        | "DEPLETED"
        | "CANCELLED"
        | "UNKNOWN"
        | null
    ) ||
    statusBadge;

  const orderId = order?.id ?? null;
  const ownsOrder =
    Boolean(orderId) &&
    Boolean(input.loggedInUserId) &&
    order?.userId === input.loggedInUserId;

  let detailHref: string | null = null;
  if (ownsOrder && orderId) {
    detailHref = `/account/orders/${encodeURIComponent(orderId)}`;
  } else if (statusBadge === "Ready to Install") {
    detailHref = "/support";
  }

  return {
    orderId,
    destination,
    planName,
    flagUrl: customerFlagImageUrl(destinationCode),
    destinationHref,
    statusBadge,
    statusLabel,
    remainingDataGB: usage?.remainingDataGB ?? null,
    initialDataGB: usage?.initialDataGB ?? null,
    usedDataGB: usage?.usedDataGB ?? null,
    isUnlimited: usage?.isUnlimited === true,
    reportsDataAllowance: usage?.reportsDataAllowance !== false,
    daysRemaining: usage?.daysRemaining ?? null,
    expiresAt: usage?.expiresAt ?? null,
    isActivated: usage?.isActivated ?? null,
    isExpired: usage?.isExpired ?? null,
    detailHref,
    topUpHref: destinationHref,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Public / guest home lookup by Order ID or ICCID.
 * Rate-limited. Never echoes ICCID back.
 */
export async function lookupHomeEsimUsage(input: {
  query: string;
  ipKey: string;
  loggedInUserId?: string | null;
}): Promise<HomeUsageLookupResult> {
  const classified = classifyHomeUsageQuery(input.query);
  if (classified.kind === "invalid") {
    return {
      ok: false,
      code: "INVALID",
      message: "Enter a valid Order ID or ICCID to check usage.",
    };
  }

  const ip = (input.ipKey || "unknown").slice(0, 64);
  const rate = consumeRateLimit({
    key: `home-usage-lookup:${ip}`,
    limit: PUBLIC_LOOKUP_LIMIT,
    windowMs: PUBLIC_LOOKUP_WINDOW_MS,
  });
  if (!rate.ok) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSec: rate.retryAfterSec,
      message: "Please wait a moment before checking usage again.",
    };
  }

  let order: OrderMetaRow | null = null;
  let iccid: string | null = null;

  if (classified.kind === "orderId") {
    order = await findCompletedOrderByQuery(classified.value);
    if (!order) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message:
          "We couldn’t find an eSIM for that Order ID. Check the ID from your email or WhatsApp receipt.",
      };
    }
    iccid = await resolveOrderIccidPlaintext(order.id);
  } else {
    const iccidRate = consumeRateLimit({
      key: `home-usage-iccid:${ip}`,
      limit: 3,
      windowMs: PUBLIC_ICCID_WINDOW_MS,
    });
    if (!iccidRate.ok) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        retryAfterSec: iccidRate.retryAfterSec,
        message: "Please wait a moment before checking usage again.",
      };
    }
    const normalized = normalizeIccid(classified.value);
    if (!validateIccid(normalized)) {
      return {
        ok: false,
        code: "INVALID",
        message: "Enter a valid Order ID or ICCID to check usage.",
      };
    }
    iccid = normalized;
    order = await findCompletedOrderByIccidHash(normalized);
  }

  if (!iccid) {
    // Order known but ICCID not captured yet — Ready to Install card.
    if (order) {
      return {
        ok: true,
        card: buildCard({
          order,
          usage: {
            status: "NOT_ACTIVE",
            statusLabel: "Ready to Install",
            initialDataGB: null,
            remainingDataGB: null,
            usedDataGB: null,
            usagePercent: null,
            usagePercentForBar: null,
            isUnlimited: false,
            planUnlimited: false,
            reportsDataAllowance: false,
            activatedAt: null,
            expiresAt: null,
            daysRemaining: null,
            isActivated: false,
            isExpired: false,
          },
          loggedInUserId: input.loggedInUserId,
        }),
      };
    }
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Usage details aren’t available for this eSIM yet.",
    };
  }

  const usageRes = await fetchProviderUsage(iccid);
  if (!usageRes.ok) {
    if (usageRes.kind === "not_found") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Usage data isn’t available for this eSIM yet.",
      };
    }
    return {
      ok: false,
      code: "TEMPORARY",
      message: "Usage is temporarily unavailable. Please try again later.",
    };
  }

  const normalized = normalizeProviderUsagePayload(usageRes.payload);
  if (!normalized) {
    return {
      ok: false,
      code: "TEMPORARY",
      message: "Usage is temporarily unavailable. Please try again later.",
    };
  }

  if (order?.id) {
    await persistOrderProviderLifecycleCache(order.id, normalized);
  }

  return {
    ok: true,
    card: buildCard({
      order,
      usage: normalized,
      loggedInUserId: input.loggedInUserId,
    }),
  };
}

export function homeUsagePublicError(
  code: "INVALID" | "NOT_FOUND" | "RATE_LIMITED" | "TEMPORARY"
): {
  status: number;
  message: string;
} {
  switch (code) {
    case "RATE_LIMITED":
      return {
        status: 429,
        message: "Please wait a moment before checking usage again.",
      };
    case "INVALID":
      return {
        status: 400,
        message: "Enter a valid Order ID or ICCID to check usage.",
      };
    case "TEMPORARY":
      return {
        status: 503,
        message: "Usage is temporarily unavailable. Please try again later.",
      };
    case "NOT_FOUND":
    default:
      return {
        status: 404,
        message:
          "We couldn’t find usage for that Order ID or ICCID. Double-check and try again.",
      };
  }
}
