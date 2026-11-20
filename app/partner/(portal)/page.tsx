import Link from "next/link";
import {
  KeyRound,
  Package,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { listPartnerOrdersPage } from "@/app/lib/partner/partnerOrders";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
  partnerStatusBadgeClass,
} from "@/app/components/partner/partnerPortalUi";
import { PartnerEsimPurchaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function PartnerHomePage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return (
      <p className="text-sm text-slate-300">Partner access is unavailable.</p>
    );
  }

  const [summary, profile, recentOrders, activeEsims] = await Promise.all([
    getPartnerPortalSummary(user.id).catch(() => null),
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { apiEnabled: true },
    }),
    listPartnerOrdersPage(user.id, { page: "1" }).catch(() => null),
    prisma.order.count({
      where: {
        partnerEsimPurchase: {
          partnerId: actor.partnerId,
          status: PartnerEsimPurchaseStatus.COMPLETED,
        },
        providerLifecycleStatus: "ACTIVE",
      },
    }).catch(() => 0),
  ]);
  const apiEnabled = profile?.apiEnabled === true;
  const recent = (recentOrders?.orders ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
          Executive overview
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">
          Welcome back, {actor.name.split(" ")[0] || actor.name}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
          Monitor balance, orders, and wholesale catalog from one workspace.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Available Balance",
            value: summary?.balanceLabel ?? "—",
            hint: "USD wallet",
          },
          {
            label: "Total Orders",
            value: summary?.totalEsimOrdersLabel ?? "—",
            hint: "Completed purchases",
          },
          {
            label: "Active eSIMs",
            value: String(activeEsims),
            hint: "Lifecycle ACTIVE",
          },
          {
            label: "Total Spend",
            value: summary?.totalSpentLabel ?? "—",
            hint: "Purchase debits",
          },
        ].map((kpi) => (
          <div key={kpi.label} className={partnerCardClass + " !p-4 sm:!p-5"}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-50">
              {kpi.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/partner/catalog" className={partnerPrimaryCtaClass}>
          <ShoppingBag className="h-4 w-4" aria-hidden />
          Browse Catalog
        </Link>
        <Link href="/partner/wallet" className={partnerSecondaryCtaClass}>
          <Wallet className="h-4 w-4" aria-hidden />
          Top Up Wallet
        </Link>
        <Link
          href={apiEnabled ? "/partner/account" : "/partner/account"}
          className={partnerSecondaryCtaClass}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          {apiEnabled ? "API Keys" : "Request API Access"}
        </Link>
        <Link href="/partner/orders" className={partnerSecondaryCtaClass}>
          <Package className="h-4 w-4" aria-hidden />
          View Orders
        </Link>
      </div>

      <section className={partnerCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-50">
            Recent orders
          </h2>
          <Link
            href="/partner/orders"
            className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No orders yet.{" "}
            <Link href="/partner/catalog" className="font-semibold text-emerald-300">
              Browse the catalog
            </Link>{" "}
            to place your first purchase.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {recent.map((row) => (
              <li key={row.orderId}>
                <Link
                  href={`/partner/orders/${encodeURIComponent(row.orderId)}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 transition hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {row.destination} · {row.planName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.purchasedAtLabel} · {row.partnerDebitLabel}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${partnerStatusBadgeClass(row.statusBadge)}`}
                  >
                    {row.statusBadge}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
