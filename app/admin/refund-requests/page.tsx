import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminRefundRequests } from "@/app/lib/refunds/refundRequestAdmin";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Refund request data is temporarily unavailable. Please refresh shortly.";

export default async function AdminRefundRequestsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listAdminRefundRequests>>;
  try {
    rows = await listAdminRefundRequests(50);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Refund requests</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Refund requests</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Customer refund requests for admin review. Approving does not move
          money or call a payment gateway in this phase.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No refund requests yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--heading)]">
                    {row.statusLabel} · {row.reasonLabel}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {row.customerLabel} · Order {row.orderReference}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {row.amountLabel} · {row.compositionLabel}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    Requested {row.createdAtLabel} · ID {row.id}
                  </p>
                </div>
                <Link
                  href={`/admin/refund-requests/${encodeURIComponent(row.id)}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white"
                >
                  Review
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
