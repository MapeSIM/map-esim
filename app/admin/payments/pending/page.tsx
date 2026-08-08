import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listPendingGatewayPaymentAttempts } from "@/app/lib/admin/pendingPaymentVerify";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Pending payment data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPendingPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listPendingGatewayPaymentAttempts>>;
  try {
    rows = await listPendingGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Pending payments</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">{UNAVAILABLE}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Pending payments</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Inspect gateway payment attempts with authenticated Safepay reporter
          checks. Successful evidence still requires an authoritative webhook
          before funding.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No awaiting gateway payment attempts right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.attemptId}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--heading)]">
                    Attempt {row.attemptId}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Purchase {row.purchaseId}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {row.gatewayAmountCents} {row.currency} · attempt{" "}
                    {row.attemptStatus} · purchase {row.purchaseStatus}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    Tracker {row.trackerRefMasked}
                    {row.walletAppliedCents > 0
                      ? ` · wallet reserved ${row.walletAppliedCents}`
                      : " · gateway-only"}
                  </p>
                </div>
                <Link
                  href={`/admin/payments/pending/${encodeURIComponent(row.attemptId)}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
