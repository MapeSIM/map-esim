import { requireRole } from "@/app/lib/auth/session";
import { listAdminUnifiedRefundRequests } from "@/app/lib/refunds/unifiedRefundRequestAdmin";
import {
  parseUnifiedRefundSource,
  unifiedRefundSourceLabel,
  type UnifiedRefundSourceFilter,
} from "@/app/lib/refunds/unifiedRefundRequestDisplay";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Refund request data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm";

const FILTERS: { id: UnifiedRefundSourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customer", label: "Customer" },
  { id: "partner", label: "Partner" },
];

function sourceHref(source: UnifiedRefundSourceFilter): string {
  if (source === "all") return "/admin/refund-requests";
  return `/admin/refund-requests?source=${encodeURIComponent(source)}`;
}

export default async function AdminRefundRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  await requireRole("ADMIN");
  const query = await searchParams;
  const source = parseUnifiedRefundSource(query.source);

  let rows: Awaited<ReturnType<typeof listAdminUnifiedRefundRequests>>;
  try {
    rows = await listAdminUnifiedRefundRequests({ source, limit: 50 });
  } catch {
    return (
      <div className="min-w-0 space-y-6">
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
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Refund requests</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Customer and Partner refund requests for admin review. Approving does
          not move money, credit a Partner wallet, or call a provider in this
          phase.
        </p>
      </header>

      <nav
        className="flex min-w-0 flex-wrap gap-2"
        aria-label="Refund request source"
      >
        {FILTERS.map((filter) => {
          const active = filter.id === source;
          return (
            <AdminButton
              key={filter.id}
              href={sourceHref(filter.id)}
              variant={active ? "primary" : "secondary"}
              size="sm"
              className="!h-10 !px-4 !text-sm"
            >
              {filter.label}
            </AdminButton>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className={EMPTY_CLASS}>No refund requests yet.</div>
      ) : (
        <ul className="min-w-0 space-y-3">
          {rows.map((row) => (
            <li key={`${row.source}:${row.id}`} className={CARD_CLASS}>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <AdminStatusPill value={unifiedRefundSourceLabel(row.source)}>
                      {unifiedRefundSourceLabel(row.source)}
                    </AdminStatusPill>
                    <AdminStatusPill value={row.statusLabel}>
                      {row.statusLabel}
                    </AdminStatusPill>
                    <p className="min-w-0 font-semibold text-[var(--heading)]">
                      {row.reasonLabel}
                    </p>
                  </div>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.actorLabel}
                    {row.actorEmail ? ` · ${row.actorEmail}` : ""} · Ref{" "}
                    {row.orderRefLabel}
                  </p>
                  {row.source === "partner" ? (
                    <>
                      <p className="break-words text-[var(--text-muted)]">
                        {row.destinationLabel} · {row.planLabel}
                      </p>
                      <p className="break-words text-[var(--text-muted)]">
                        Partner debit {row.debitLabel} · Retail {row.retailLabel}{" "}
                        (reference only)
                      </p>
                    </>
                  ) : (
                    <p className="text-[var(--text-muted)]">{row.amountLabel}</p>
                  )}
                  <p className="text-xs text-[var(--text-soft)]">
                    Requested {row.createdAtLabel}
                  </p>
                </div>
                <AdminButton href={row.href} variant="primary" className="shrink-0">
                  Review
                </AdminButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
