import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";

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
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only ledger of Partner wallet activity, including admin
          adjustments and eSIM purchase debits and refunds.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Balance
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-[var(--heading)]">
            {summary.balanceLabel} USD
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total added
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-[var(--heading)]">
            {summary.totalAddedLabel} USD
          </dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total deducted
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-[var(--heading)]">
            {summary.totalDeductedLabel} USD
          </dd>
        </div>
      </dl>

      {summary.recentTransactions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)]">
          No wallet transactions yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {summary.recentTransactions.map((tx) => (
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
    </div>
  );
}
