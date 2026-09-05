import Link from "next/link";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import PartnerWalletAddFundsForm from "@/app/components/partner/PartnerWalletAddFundsForm";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Wallet data is temporarily unavailable. Please refresh shortly.";

export default async function PartnerWalletPage() {
  const user = await requireRole("PARTNER");

  let summary: Awaited<ReturnType<typeof getPartnerPortalSummary>>;
  try {
    summary = await getPartnerPortalSummary(user.id);
  } catch {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {PORTAL_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Partner access is unavailable.
          </p>
        </div>
      </div>
    );
  }

  const gatewayReady = isPaymentGatewayConfigured();

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
            Your MAP eSIM Partner balance and history.
          </p>
        </div>
        <Link
          href="/countries"
          className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        >
          Buy eSIM
        </Link>
      </header>

      <div className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          Available Partner Balance
        </p>
        <p className="mt-2 break-words text-3xl font-bold tracking-tight text-[var(--heading)]">
          {summary.balanceLabel}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">USD</p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Current Partner discount:{" "}
          <span className="font-semibold text-[var(--heading)]">
            {summary.discountPercentLabel}
          </span>
          . Applied automatically when you buy. Admin funding continues to
          credit this wallet.
        </p>
      </div>

      <PartnerWalletAddFundsForm
        balanceLabel={summary.balanceLabel}
        gatewayReady={gatewayReady}
      />

      <section className="min-w-0 w-full max-w-full space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Transaction history
        </h2>
        {summary.recentTransactions.length === 0 ? (
          <div className="min-w-0 w-full max-w-full rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
            No wallet transactions yet.
          </div>
        ) : (
          <ul className="min-w-0 space-y-3">
            {summary.recentTransactions.map((tx) => (
              <li
                key={tx.id}
                className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--heading)]">
                      {tx.typeLabel}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">{tx.reason}</p>
                  </div>
                  <p className="font-semibold tabular-nums text-[var(--heading)]">
                    {tx.amountLabel}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[var(--text-soft)]">
                  {tx.createdAtLabel} · Balance after {tx.balanceAfterLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
