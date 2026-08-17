import { Gift } from "lucide-react";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerRewardSummary } from "@/app/lib/rewards/rewardRead";

export const dynamic = "force-dynamic";

export default async function AccountRewardsPage() {
  const user = await requireRole("CUSTOMER");
  let summary: Awaited<ReturnType<typeof getCustomerRewardSummary>> = null;
  try {
    summary = await getCustomerRewardSummary(user.id);
  } catch {
    summary = null;
  }

  if (!summary) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
        <p className="text-sm text-[var(--heading)]" role="status">
          Rewards are temporarily unavailable. Please refresh shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Earn points on completed customer eSIM purchases.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Rewards
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--heading)]">
              {summary.pointsBalanceLabel}{" "}
              <span className="text-base font-semibold text-[var(--text-soft)]">
                points
              </span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {summary.rateCopy}
            </p>
            <p className="mt-1 text-sm text-[var(--heading)]">{summary.statusCopy}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
        <h2 className="text-base font-bold text-[var(--heading)]">History</h2>
        {summary.history.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No rewards earned yet. Points are added after a completed eSIM
            purchase.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {summary.history.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {row.dateLabel}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[var(--heading)]">
                  {row.pointsLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
