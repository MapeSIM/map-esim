import Link from "next/link";
import {
  BookOpen,
  KeyRound,
  Package,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";

export const dynamic = "force-dynamic";

const cardClass =
  "rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-500/40 hover:bg-slate-900";

export default async function PartnerHomePage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return (
      <p className="text-sm text-slate-300">Partner access is unavailable.</p>
    );
  }

  const [summary, profile] = await Promise.all([
    getPartnerPortalSummary(user.id).catch(() => null),
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { apiEnabled: true },
    }),
  ]);
  const apiEnabled = profile?.apiEnabled === true;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
          Partner portal
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">
          Welcome back, {actor.name.split(" ")[0] || actor.name}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
          Manage catalog pricing, orders, wallet balance, and white-label share
          branding.{" "}
          {apiEnabled ? (
            <>
              Use{" "}
              <code className="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
                /api/v1/partner/...
              </code>{" "}
              on this host with your Bearer token.
            </>
          ) : (
            <>API access is locked until an admin enables it for your account.</>
          )}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Available balance
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-50">
            {summary?.balanceLabel ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Completed orders
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-50">
            {summary?.totalEsimOrdersLabel ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Partner discount
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-50">
            {summary?.discountPercentLabel ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apiEnabled ? (
          <Link href="/partner/docs" className={cardClass}>
            <BookOpen className="h-5 w-5 text-emerald-400" />
            <p className="mt-3 font-semibold text-slate-100">API documentation</p>
            <p className="mt-1 text-sm text-slate-400">
              Endpoints, cancel codes, Postman downloads.
            </p>
          </Link>
        ) : (
          <div className={cardClass}>
            <KeyRound className="h-5 w-5 text-amber-300" />
            <p className="mt-3 font-semibold text-slate-100">Request API access</p>
            <p className="mt-1 text-sm text-slate-400">
              Contact MAP eSIM support / your admin to enable Partner Public API.
            </p>
          </div>
        )}
        <Link href="/partner/catalog" className={cardClass}>
          <Package className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 font-semibold text-slate-100">Catalog</p>
          <p className="mt-1 text-sm text-slate-400">
            Browse partner-priced plans and export CSV.
          </p>
        </Link>
        <Link href="/partner/orders" className={cardClass}>
          <ShoppingBag className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 font-semibold text-slate-100">Orders</p>
          <p className="mt-1 text-sm text-slate-400">
            Track eSIMs, usage, and performance.
          </p>
        </Link>
        <Link href="/partner/wallet" className={cardClass}>
          <Wallet className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 font-semibold text-slate-100">Wallet</p>
          <p className="mt-1 text-sm text-slate-400">
            Balance, top-ups, and ledger history.
          </p>
        </Link>
        <Link href="/partner/account" className={cardClass}>
          <KeyRound className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 font-semibold text-slate-100">Account</p>
          <p className="mt-1 text-sm text-slate-400">
            API keys and Share QR branding.
          </p>
        </Link>
      </div>
    </div>
  );
}
