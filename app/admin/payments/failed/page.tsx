import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listFailedGatewayPaymentAttempts } from "@/app/lib/admin/failedPaymentAttempts";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Failed payment data is temporarily unavailable. Please refresh shortly.";

export default async function AdminFailedPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listFailedGatewayPaymentAttempts>>;
  try {
    rows = await listFailedGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Failed payments</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Failed payments</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Failed and cancelled gateway payment attempts. This list is
          read-only and does not cancel, refund, or mark a purchase funded.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Pending payments
          </Link>
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No failed or cancelled gateway payment attempts right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.attemptId}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-[var(--heading)]">
                    {row.statusLabel} · {row.amountLabel}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.customerLabel}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.planLabel}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Reason {row.failureReason}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    {row.occurredAtLabel} · attempt {row.attemptId} · purchase{" "}
                    {row.purchaseId}
                  </p>
                </div>
                {row.customerHref ? (
                  <Link
                    href={row.customerHref}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)]"
                  >
                    View customer
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
