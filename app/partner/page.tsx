import Link from "next/link";
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
        <h1 className="text-2xl font-bold tracking-tight">Partner dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Your prepaid balance and reseller discount. Catalog and order
          purchases arrive in Phase 2.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Available balance
          </dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-[var(--heading)]">
            {summary.balanceLabel}
            <span className="ml-1 text-sm font-semibold text-[var(--text-muted)]">
              USD
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Your discount
          </dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-[var(--heading)]">
            {summary.discountPercentLabel}
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total added
          </dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-[var(--heading)]">
            {summary.totalAddedLabel}
            <span className="ml-1 text-sm font-semibold text-[var(--text-muted)]">
              USD
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total deducted
          </dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-[var(--heading)]">
            {summary.totalDeductedLabel}
            <span className="ml-1 text-sm font-semibold text-[var(--text-muted)]">
              USD
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total spent
          </dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-[var(--heading)]">
            {summary.totalSpentLabel}
            <span className="ml-1 text-sm font-semibold text-[var(--text-muted)]">
              USD
            </span>
          </dd>
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Purchases not available yet in Phase 1.
          </p>
        </div>
      </dl>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent wallet activity
          </h2>
          <Link
            href="/partner/wallet"
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            View full ledger
          </Link>
        </div>

        {summary.recentTransactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)]">
            No wallet activity yet. Admin credits will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {summary.recentTransactions.slice(0, 5).map((tx) => (
              <li
                key={tx.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
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
