import "server-only";

import { Prisma, Role } from "@prisma/client";
import {
  ADMIN_RECENT_ORDERS_LIMIT,
  maskProviderOrderRef,
} from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { areAllEmailChannelsConfigured } from "@/app/lib/email/config";

export type AdminRecentOrderRow = {
  createdAtLabel: string;
  destination: string;
  planPackage: string;
  localStatus: string;
  amountLabel: string;
  providerRefMasked: string;
};

export type AdminSystemStatus = {
  googleOAuth: "Configured" | "Not configured";
  smtp: "Configured" | "Not configured";
  vesim: "Configured" | "Not configured";
  database: "Operational" | "Not configured";
};

export type AdminOverviewData = {
  activeCustomerCount: number;
  verifiedCustomerCount: number;
  googleCustomerCount: number;
  credentialsCustomerCount: number;
  totalLocalOrders: number;
  completedLocalOrders: number;
  stagingProviderTotalUsd: string;
  recentOrders: AdminRecentOrderRow[];
  systemStatus: AdminSystemStatus;
};

export { ADMIN_RECENT_ORDERS_LIMIT, maskProviderOrderRef };

function envPresent(...names: string[]): boolean {
  return names.every((name) => Boolean((process.env[name] ?? "").trim()));
}

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

function formatCreatedAt(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function formatUsdAmount(amount: Prisma.Decimal | null | undefined): string {
  if (amount == null) return "Not available";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatOrderAmount(
  amount: Prisma.Decimal | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null) return "Not available";
  const code = (currency ?? "").trim().toUpperCase() || "USD";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Not available";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

function planPackageLabel(
  planName: string | null | undefined,
  dataAllowance: string | null | undefined
): string {
  const plan = (planName ?? "").trim();
  const data = (dataAllowance ?? "").trim();
  if (plan && data) return `${plan} · ${data}`;
  if (plan) return plan;
  if (data) return data;
  return "Not available";
}

function readSystemStatus(databaseOperational: boolean): AdminSystemStatus {
  return {
    googleOAuth: envPresent("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET")
      ? "Configured"
      : "Not configured",
    smtp: areAllEmailChannelsConfigured() ? "Configured" : "Not configured",
    vesim: envPresent("VESIM_BASE_URL", "VESIM_EMAIL", "VESIM_PASSWORD")
      ? "Configured"
      : "Not configured",
    // Successful overview queries prove connectivity — no separate health probe.
    database: databaseOperational ? "Operational" : "Not configured",
  };
}

/**
 * Aggregated admin overview. Call only after requireRole("ADMIN").
 *
 * Uses Prisma's sequential batch `$transaction([...])` (not an interactive
 * callback) so remote DB latency cannot expire a held interactive transaction.
 * Avoids Promise.all fan-out that exhausts the connection pool.
 */
export async function getAdminOverview(): Promise<AdminOverviewData> {
  const activeCustomerWhere = {
    role: Role.CUSTOMER,
    deletedAt: null,
  } as const;

  const [
    activeCustomerCount,
    verifiedCustomerCount,
    googleCustomerCount,
    credentialsCustomerCount,
    totalLocalOrders,
    completedLocalOrders,
    stagingUsd,
    recentRaw,
  ] = await prisma.$transaction([
    prisma.user.count({ where: activeCustomerWhere }),
    prisma.user.count({
      where: {
        ...activeCustomerWhere,
        emailVerifiedAt: { not: null },
      },
    }),
    prisma.user.count({
      where: {
        ...activeCustomerWhere,
        accounts: { some: { provider: "google" } },
      },
    }),
    prisma.user.count({
      where: {
        ...activeCustomerWhere,
        passwordHash: { not: null },
        accounts: { none: { provider: "google" } },
      },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.order.aggregate({
      _sum: { providerAmount: true },
      where: {
        providerAmount: { not: null },
        OR: [
          { providerCurrency: "USD" },
          { providerCurrency: "usd" },
          { providerCurrency: null },
        ],
      },
    }),
    prisma.order.findMany({
      take: ADMIN_RECENT_ORDERS_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        destination: true,
        planName: true,
        dataAllowance: true,
        status: true,
        providerAmount: true,
        providerCurrency: true,
        providerOrderId: true,
      },
    }),
  ]);

  const recentOrders: AdminRecentOrderRow[] = recentRaw.map((row) => ({
    createdAtLabel: formatCreatedAt(row.createdAt),
    destination: displayOrUnavailable(row.destination),
    planPackage: planPackageLabel(row.planName, row.dataAllowance),
    localStatus: displayOrUnavailable(row.status),
    amountLabel: formatOrderAmount(row.providerAmount, row.providerCurrency),
    providerRefMasked: maskProviderOrderRef(row.providerOrderId),
  }));

  return {
    activeCustomerCount,
    verifiedCustomerCount,
    googleCustomerCount,
    credentialsCustomerCount,
    totalLocalOrders,
    completedLocalOrders,
    stagingProviderTotalUsd: formatUsdAmount(stagingUsd._sum.providerAmount),
    recentOrders,
    systemStatus: readSystemStatus(true),
  };
}
