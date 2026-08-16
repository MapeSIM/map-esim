import {
  AlertTriangle,
  Check,
  Shield,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import AccountActionRow from "@/app/components/account/AccountActionRow";
import { requireSession } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { getCustomerWalletSummary } from "@/app/lib/wallet/read";

export default async function AccountOverviewPage() {
  const user = await requireSession();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });
  const emailVerified = Boolean(dbUser?.emailVerifiedAt);

  let walletBalanceLabel: string | null = null;
  if (user.role === "CUSTOMER") {
    try {
      const summary = await getCustomerWalletSummary(user.id);
      walletBalanceLabel = summary?.balanceLabel ?? "$0.00";
    } catch {
      walletBalanceLabel = null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Manage your MAP eSIM purchases, wallet, and account settings.
          </p>
        </div>
        {emailVerified ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--heading)]"
            aria-label="Email verification status: Verified"
          >
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-ink)]"
              aria-hidden="true"
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            Email verified
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--warning-text)]"
            aria-label="Email verification status: Not verified"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Email not verified
          </span>
        )}
      </div>

      <div className="grid gap-3">
        <AccountActionRow
          href="/account/orders"
          title="My eSIMs"
          subtitle="View, install, and manage purchased eSIMs"
          icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
          emphasize
        />
        {user.role === "CUSTOMER" ? (
          <AccountActionRow
            href="/account/wallet"
            title="Wallet"
            subtitle="Available balance and top-ups"
            icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
            trailing={
              <span className="mt-1 block text-sm font-bold text-[var(--heading)]">
                {walletBalanceLabel ?? "Temporarily unavailable"}
                {walletBalanceLabel ? (
                  <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">
                    USD
                  </span>
                ) : null}
              </span>
            }
          />
        ) : null}
        <AccountActionRow
          href="/account/profile"
          title="Profile"
          subtitle="Customer account information"
          icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
        />
        <AccountActionRow
          href="/account/security"
          title="Security"
          subtitle="Password and security controls"
          icon={<Shield className="h-5 w-5" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}
