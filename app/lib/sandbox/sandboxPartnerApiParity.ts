/**
 * Sandbox Partner API responses shaped for production parity.
 * Never calls VeSIM. Uses Neon SandboxPartner / SandboxOrder only.
 */
import "server-only";

import { SANDBOX_CATALOG } from "@/app/lib/sandbox/sandboxShared";
import {
  getSandboxOrderByIccid,
  getSandboxPartnerById,
  listSandboxOrdersForPartner,
  listSandboxWalletTxForPartner,
} from "@/app/lib/sandbox/sandboxPartnerDb";
import { prisma } from "@/app/lib/db";
import {
  PARTNER_SITE_ORIGIN,
  SANDBOX_SITE_ORIGIN,
} from "@/app/lib/domain/appDomain";

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function catalogItemByOfferId(offerId: string) {
  return SANDBOX_CATALOG.find((item) => item.id === offerId) ?? null;
}

export async function buildSandboxMePayload(partnerId: string) {
  const partner = await getSandboxPartnerById(partnerId);
  if (!partner) return null;
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      apiKeyPrefix: partner.apiKeyPrefix,
    },
    wallet: {
      balanceCents: partner.balanceCents,
      balanceUsd: Number((partner.balanceCents / 100).toFixed(2)),
      balanceLabel: `${formatUsd(partner.balanceCents)} USD`,
      currency: "USD" as const,
    },
  };
}

export async function buildSandboxWalletPayload(
  partnerId: string,
  limit = 20
) {
  const partner = await getSandboxPartnerById(partnerId);
  if (!partner) return null;
  const take = Math.min(50, Math.max(1, limit));
  const txs = await listSandboxWalletTxForPartner(partnerId);
  const sliced = txs.slice(0, take);
  let running = partner.balanceCents;
  // Reconstruct approximate before/after from newest-first ledger.
  const transactions = sliced.map((tx) => {
    const amount = Math.abs(tx.amountCents);
    const isCredit = tx.kind === "credit";
    const balanceAfterCents = running;
    const balanceBeforeCents = isCredit
      ? running - amount
      : running + amount;
    running = balanceBeforeCents;
    return {
      id: tx.id,
      type: isCredit ? "TOPUP_CREDIT" : "ESIM_PURCHASE_DEBIT",
      amountCents: isCredit ? amount : -amount,
      amountLabel: `${formatUsd(amount)} USD`,
      balanceBeforeCents,
      balanceAfterCents,
      reason: tx.label,
      referenceType: null as string | null,
      referenceId: null as string | null,
      createdAt: tx.createdAt.toISOString(),
      // Sandbox legacy alias
      label: tx.label,
      kind: isCredit ? ("credit" as const) : ("debit" as const),
    };
  });

  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    wallet: {
      balanceCents: partner.balanceCents,
      balanceUsd: Number((partner.balanceCents / 100).toFixed(2)),
      balanceLabel: `${formatUsd(partner.balanceCents)} USD`,
      currency: "USD" as const,
      transactions,
    },
    // Legacy top-level list for older sandbox clients
    transactions,
  };
}

export function buildSandboxCatalogPayload() {
  const items = SANDBOX_CATALOG.map((item) => {
    const kind =
      item.region === "Global"
        ? "global"
        : item.region === "Europe" || item.region === "Asia"
          ? "regional"
          : "country";
    return {
      offerId: item.id,
      name: item.name,
      country: item.region,
      region: item.region,
      destinationCode: item.region.slice(0, 2).toUpperCase(),
      destinationLabel: item.region,
      kind,
      dataGb: item.dataGb,
      dataLabel: `${item.dataGb} GB`,
      validityDays: item.days,
      validityLabel: `${item.days} days`,
      partnerPriceCents: item.priceCents,
      partnerPriceUsd: Number((item.priceCents / 100).toFixed(2)),
      partnerPriceLabel: formatUsd(item.priceCents),
      retailPriceUsd: Number((item.priceCents / 100).toFixed(2)),
      retailPriceCents: item.priceCents,
      retailPriceLabel: formatUsd(item.priceCents),
      currency: "USD" as const,
      supportTopUp: item.supportTopUp === true,
      supportTopUpType: item.supportTopUp
        ? item.supportTopUpType
        : null,
      // Legacy sandbox fields
      id: item.id,
      priceCents: item.priceCents,
    };
  });
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    catalog: items,
    // Production-compatible alias
    offers: items,
    items,
    count: items.length,
    page: 1,
    limit: items.length,
    total: items.length,
  };
}

function orderShareUrl(orderId: string): string {
  return `${SANDBOX_SITE_ORIGIN}/sandbox/share/preview?orderId=${encodeURIComponent(orderId)}`;
}

function mapSandboxOrderRow(
  o: {
    orderId: string;
    offerId: string;
    status: string;
    region: string;
    planName: string;
    totalCents: number;
    iccid: string;
    activationCode: string;
    matchingId: string | null;
    smdpAddress: string | null;
    createdAt: Date;
  },
  includeInstall: boolean
) {
  const catalog = catalogItemByOfferId(o.offerId);
  const lpa = o.activationCode || null;
  const qrUrl = includeInstall && lpa
    ? `${SANDBOX_SITE_ORIGIN}/sandbox/orders/${encodeURIComponent(o.orderId)}`
    : null;
  return {
    orderId: o.orderId,
    purchaseId: o.orderId,
    status: o.status,
    destination: o.region,
    planName: o.planName,
    dataAllowance: catalog ? `${catalog.dataGb} GB` : null,
    validity: catalog ? `${catalog.days} days` : null,
    amountCents: o.totalCents,
    amountLabel: formatUsd(o.totalCents),
    currency: "USD" as const,
    iccid: o.iccid,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.createdAt.toISOString(),
    lpa,
    qrUrl,
    qrCodeUrl: qrUrl,
    shareUrl: orderShareUrl(o.orderId),
    refunded: false,
    // Legacy
    offerId: o.offerId,
    region: o.region,
    totalCents: o.totalCents,
    activationCode: o.activationCode,
    matchingId: o.matchingId,
    smdpAddress: o.smdpAddress,
  };
}

export async function buildSandboxOrdersListPayload(
  partnerId: string,
  options?: { page?: number; limit?: number }
) {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  const all = await listSandboxOrdersForPartner(partnerId);
  const total = all.length;
  const start = (page - 1) * limit;
  const slice = all.slice(start, start + limit);
  const orders = slice.map((o) => mapSandboxOrderRow(o, true));
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    orders,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function buildSandboxOrderDetailPayload(
  partnerId: string,
  orderId: string
) {
  const id = (orderId ?? "").trim();
  if (!id) return null;
  const row = await prisma.sandboxOrder.findFirst({
    where: { partnerId, orderId: id },
  });
  if (!row) return null;
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    order: mapSandboxOrderRow(row, true),
  };
}

/** Deterministic-looking simulated usage from ICCID + plan size. */
export function buildSimulatedUsage(options: {
  iccid: string;
  dataGb: number;
  createdAt: Date;
}) {
  const gb = Math.max(1, options.dataGb);
  let h = 0;
  const seed = `${options.iccid}:${options.createdAt.toISOString()}`;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const usedFraction = ((h % 55) + 5) / 100; // 5%–59%
  const initialDataGB = gb;
  const usedDataGB = Number((initialDataGB * usedFraction).toFixed(2));
  const remainingDataGB = Number(
    Math.max(0, initialDataGB - usedDataGB).toFixed(2)
  );
  const usagePercent = Math.round((usedDataGB / initialDataGB) * 100);
  const activatedAt = new Date(
    options.createdAt.getTime() + 60_000
  ).toISOString();
  const expiresAt = new Date(
    options.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    )
  );
  return {
    status: "ACTIVE",
    statusLabel: "Active",
    initialDataGB,
    remainingDataGB,
    usedDataGB,
    usagePercent,
    isUnlimited: false,
    activatedAt,
    expiresAt,
    daysRemaining,
    isActivated: true,
    isExpired: false,
    // Legacy MB fields for older sandbox clients
    dataUsedMb: Math.round(usedDataGB * 1024),
    dataTotalMb: Math.round(initialDataGB * 1024),
    percentUsed: usagePercent,
  };
}

export async function buildSandboxOrderUsagePayload(
  partnerId: string,
  orderId: string
) {
  const detail = await buildSandboxOrderDetailPayload(partnerId, orderId);
  if (!detail) return null;
  const catalog = catalogItemByOfferId(detail.order.offerId);
  const usage = buildSimulatedUsage({
    iccid: detail.order.iccid,
    dataGb: catalog?.dataGb ?? 1,
    createdAt: new Date(detail.order.createdAt),
  });
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    orderId: detail.order.orderId,
    iccid: detail.order.iccid,
    usage,
  };
}

export async function buildSandboxEsimUsageByIccidPayload(
  partnerId: string,
  iccidRaw: string
) {
  const iccid = (iccidRaw ?? "").trim();
  if (!iccid) return null;
  const row = await getSandboxOrderByIccid(partnerId, iccid);
  if (!row) return null;
  const catalog = catalogItemByOfferId(row.offerId);
  const usage = buildSimulatedUsage({
    iccid: row.iccid,
    dataGb: catalog?.dataGb ?? 1,
    createdAt: row.createdAt,
  });
  return {
    success: true as const,
    environment: "sandbox" as const,
    sandbox: true as const,
    orderId: row.orderId,
    iccid: row.iccid,
    usage,
    esim: {
      iccid: row.iccid,
      status: "ACTIVE",
      smdpAddress: row.smdpAddress,
      matchingId: row.matchingId,
      activationCode: row.activationCode,
      usage,
      qr: { format: "LPA", data: row.activationCode },
      lpa: row.activationCode,
      qrCodeUrl: `${SANDBOX_SITE_ORIGIN}/sandbox/orders/${encodeURIComponent(row.orderId)}`,
      shareUrl: orderShareUrl(row.orderId),
    },
  };
}

export function productionPartnerApiBase(): string {
  return `${PARTNER_SITE_ORIGIN}/api/v1`;
}

export function sandboxPartnerApiBase(): string {
  return `${SANDBOX_SITE_ORIGIN}/api/sandbox/v1`;
}
