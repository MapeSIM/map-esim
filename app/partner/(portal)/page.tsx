import {
  CreditCard,
  Palette,
  Shield,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import AccountActionRow from "@/app/components/account/AccountActionRow";
import PartnerSignOutRow from "@/app/components/partner/PartnerSignOutRow";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Partner data is temporarily unavailable. Please refresh shortly.";

export default async function PartnerDashboardPage() {
  const user = await requireRole("PARTNER");

  let summary: Awaited<ReturnType<typeof getPartnerPortalSummary>>;
  try {
    summary = await getPartnerPortalSummary(user.id);
  } catch {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Manage Partner balance, purchases, and account settings.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Partner Balance
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--heading)]">
            {summary.balanceLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">USD</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Current Partner Discount
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--heading)]">
            {summary.discountPercentLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Applied automatically at purchase
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Quick Actions</h2>
        <div className="grid gap-3">
          <AccountActionRow
            href="/countries"
            title="Buy eSIM"
            subtitle="Browse the same destinations and plans as customers"
            icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
            emphasize
          />
          <AccountActionRow
            href="/partner/wallet"
            title="My Wallet"
            subtitle="Partner balance and transaction history"
            icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
            trailing={
              <span className="mt-1 block text-sm font-bold text-[var(--heading)]">
                {summary.balanceLabel}
                <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">
                  USD
                </span>
              </span>
            }
          />
          <AccountActionRow
            href="/partner/orders"
            title="My eSIMs"
            subtitle="Install, usage, and ICCID for Partner purchases"
            icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
          />
          <AccountActionRow
            href="/partner/profile"
            title="Account / Share Branding"
            subtitle="Profile details and share-page branding"
            icon={<Palette className="h-5 w-5" aria-hidden="true" />}
          />
          <PartnerSignOutRow />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Profile Information
        </h2>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-sm">
          <p>
            <span className="text-[var(--text-soft)]">Name:</span>{" "}
            <b>{user.name}</b>
          </p>
          <p className="mt-2">
            <span className="text-[var(--text-soft)]">Email:</span>{" "}
            <b>{user.email}</b>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Account Info</h2>
        <div className="grid gap-3">
          <AccountActionRow
            href="/partner/profile"
            title="Profile"
            subtitle="Partner account information"
            icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
          />
          <AccountActionRow
            href="/partner/security"
            title="Password & Security"
            subtitle="Password and security controls"
            icon={<Shield className="h-5 w-5" aria-hidden="true" />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Share Branding</h2>
        <AccountActionRow
          href="/partner/profile"
          title="Share Branding"
          subtitle="Company name, support email, website, logo, and button colors"
          icon={<Palette className="h-5 w-5" aria-hidden="true" />}
        />
      </section>
    </div>
  );
}
