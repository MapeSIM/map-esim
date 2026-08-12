import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Shield,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import { requireSession } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { getCustomerWalletSummary } from "@/app/lib/wallet/read";

function ActionRow({
  href,
  title,
  subtitle,
  icon,
  emphasize = false,
  trailing,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  emphasize?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        emphasize
          ? "flex items-center gap-3 rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-4 py-4 transition hover:bg-[var(--accent-strong)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          : "flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      }
    >
      <span
        className={
          emphasize
            ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]"
            : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-strong)]"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-[var(--heading)]">
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
          {subtitle}
        </span>
        {trailing}
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-[var(--text-soft)]"
        aria-hidden="true"
      />
    </Link>
  );
}

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
        <ActionRow
          href="/account/orders"
          title="My eSIMs"
          subtitle="View, install, and manage purchased eSIMs"
          icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
          emphasize
        />
        {user.role === "CUSTOMER" ? (
          <ActionRow
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
        <ActionRow
          href="/account/profile"
          title="Profile"
          subtitle="Customer account information"
          icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
        />
        <ActionRow
          href="/account/security"
          title="Security"
          subtitle="Password and security controls"
          icon={<Shield className="h-5 w-5" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}
