import {
  AlertTriangle,
  Check,
  Gift,
  Shield,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import AccountActionRow from "@/app/components/account/AccountActionRow";
import ReferralShareCard from "@/app/components/account/ReferralShareCard";
import { loadConsentGateUser } from "@/app/lib/auth/legalConsentGate";
import { requireSession } from "@/app/lib/auth/session";
import { getCustomerReferralSummary } from "@/app/lib/referrals/referralRead";
import { getCustomerWalletSummary } from "@/app/lib/wallet/read";
import { getCustomerRewardSummary } from "@/app/lib/rewards/rewardRead";

export default async function AccountOverviewPage() {
  const user = await requireSession();
  // Dedupes with layout requireSession → validateSessionAndConsent.
  const consentUserPromise = loadConsentGateUser(user.id);

  let walletBalanceLabel: string | null = null;
  let rewardsPointsLabel: string | null = null;
  let referralSummary: Awaited<
    ReturnType<typeof getCustomerReferralSummary>
  > = null;

  let consentUser: Awaited<ReturnType<typeof loadConsentGateUser>>;
  if (user.role === "CUSTOMER") {
    const [consent, walletSettled, rewardsSettled, referralSettled] =
      await Promise.all([
        consentUserPromise,
        getCustomerWalletSummary(user.id).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const })
        ),
        getCustomerRewardSummary(user.id).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const })
        ),
        getCustomerReferralSummary(user.id).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const })
        ),
      ]);
    consentUser = consent;
    // Preserve prior try/catch semantics (success → label; throw → null).
    walletBalanceLabel = walletSettled.ok
      ? (walletSettled.value?.balanceLabel ?? "$0.00")
      : null;
    rewardsPointsLabel = rewardsSettled.ok
      ? rewardsSettled.value
        ? `${rewardsSettled.value.pointsBalanceLabel} points`
        : "0 points"
      : null;
    referralSummary = referralSettled.ok ? referralSettled.value : null;
  } else {
    consentUser = await consentUserPromise;
  }

  const emailVerified = Boolean(consentUser?.emailVerifiedAt);

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
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--warning-text)]"
              aria-label="Email verification status: Not verified"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Email not verified
            </span>
            <Link
              href={
                user.email
                  ? `/verify-email?email=${encodeURIComponent(user.email)}`
                  : "/verify-email"
              }
              className="inline-flex h-9 items-center justify-center rounded-[14px] bg-[var(--accent-strong)] px-3 text-xs font-semibold text-[var(--accent-ink)] transition hover:opacity-95"
            >
              Verify / resend code
            </Link>
          </div>
        )}
      </div>

      {user.role === "CUSTOMER" && referralSummary ? (
        <ReferralShareCard
          shareUrl={referralSummary.shareUrl}
          code={referralSummary.code}
          title={referralSummary.cardTitle}
          subtitle={referralSummary.cardSubtitle}
          rewardCopy={referralSummary.rewardCopy}
        />
      ) : null}

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
        {user.role === "CUSTOMER" ? (
          <AccountActionRow
            href="/account/rewards"
            title="Rewards"
            subtitle="100 points = $1 reward"
            icon={<Gift className="h-5 w-5" aria-hidden="true" />}
            trailing={
              <span className="mt-1 block text-sm font-bold text-[var(--heading)]">
                {rewardsPointsLabel ?? "Temporarily unavailable"}
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
