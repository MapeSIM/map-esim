import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listPaymentRecoveryCandidates } from "@/app/lib/admin/paymentRecovery";
import {
  PAYMENT_RECOVERY_POLICY_BLURB,
  buildAdminPaymentRecoveryHref,
} from "@/app/lib/admin/paymentRecoveryShared";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Payment recovery data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPaymentRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof listPaymentRecoveryCandidates>>;
  try {
    data = await listPaymentRecoveryCandidates({ page: params.page });
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Payment recovery</h1>
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
        <p className="text-sm">
          <Link
            href="/admin/payments"
            className="font-semibold text-[var(--accent-strong)]"
          >
            ← Payments
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Payment recovery
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          {PAYMENT_RECOVERY_POLICY_BLURB}
        </p>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Candidates: PAYMENT_PENDING or RECONCILIATION_REQUIRED · SIMPAISA /
          SAFEPAY · provider ref present · webhook missing · stale ≥{" "}
          {data.staleMinutes} minutes (updatedAt).
        </p>
      </header>

      <p className="text-xs text-[var(--text-soft)]">
        Showing {data.rows.length} of {data.totalCount} · page {data.page} /{" "}
        {data.totalPages}
      </p>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No recovery candidates match the stale threshold right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Attempt ID</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Provider</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Age</th>
                <th className="px-3 py-3 font-semibold">Webhook status</th>
                <th className="px-3 py-3 font-semibold">
                  Last investigation decision
                </th>
                <th className="px-3 py-3 font-semibold">Suggested safe action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {data.rows.map((row) => (
                <tr key={row.attemptId}>
                  <td className="px-3 py-3 align-top">
                    <Link
                      href={row.href}
                      className="font-semibold text-[var(--accent-strong)]"
                    >
                      {row.attemptId}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      purchase {row.purchaseId}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                    {row.customerHref ? (
                      <Link
                        href={row.customerHref}
                        className="font-medium text-[var(--accent-strong)]"
                      >
                        {row.customerLabel}
                      </Link>
                    ) : (
                      row.customerLabel
                    )}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.providerLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.amountLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.ageLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.webhookStatusLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    <p className="font-medium">{row.lastDecisionLabel}</p>
                    {row.lastDecisionAtLabel ? (
                      <p className="mt-1 text-xs text-[var(--text-soft)]">
                        {row.lastDecisionAtLabel}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                    {row.suggestedSafeAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.totalPages > 1 ? (
        <nav className="flex gap-3 text-sm" aria-label="Recovery pagination">
          {data.page > 1 ? (
            <Link
              href={buildAdminPaymentRecoveryHref({ page: data.page - 1 })}
              className="font-semibold text-[var(--accent-strong)]"
            >
              Previous
            </Link>
          ) : (
            <span className="text-[var(--text-soft)]">Previous</span>
          )}
          {data.page < data.totalPages ? (
            <Link
              href={buildAdminPaymentRecoveryHref({ page: data.page + 1 })}
              className="font-semibold text-[var(--accent-strong)]"
            >
              Next
            </Link>
          ) : (
            <span className="text-[var(--text-soft)]">Next</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
