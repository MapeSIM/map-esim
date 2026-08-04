import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
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
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Welcome back. Installation details for purchases remain available only
        through your secure order link.
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-[var(--text-soft)]">Name</dt>
          <dd className="font-semibold">{user.name}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-soft)]">Email</dt>
          <dd className="font-semibold">{user.email}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-soft)]">Role</dt>
          <dd className="font-semibold">{user.role}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-soft)]">Email verification</dt>
          <dd>
            {emailVerified ? (
              <span
                className="inline-flex items-center gap-2 font-semibold text-[var(--heading)]"
                aria-label="Email verification status: Verified"
              >
                <span
                  className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-ink)]"
                  aria-hidden="true"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span>Verified</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-2 font-semibold text-[var(--heading)]"
                aria-label="Email verification status: Not verified"
              >
                <AlertTriangle
                  className="h-[18px] w-[18px] shrink-0 text-[var(--warning-text)]"
                  aria-hidden="true"
                  strokeWidth={2}
                />
                <span>Not verified</span>
              </span>
            )}
          </dd>
        </div>
      </dl>

      {user.role === "CUSTOMER" ? (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Wallet
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--text-soft)]">Available balance</dt>
              <dd className="text-xl font-bold tracking-tight text-[var(--heading)]">
                {walletBalanceLabel ?? "Temporarily unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-soft)]">Currency</dt>
              <dd className="font-semibold">USD</dd>
            </div>
          </dl>
          <Link
            href="/account/wallet"
            className="mt-4 inline-block text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
          >
            View Wallet
          </Link>
        </div>
      ) : null}
    </div>
  );
}
