import { requireRole } from "@/app/lib/auth/session";
import { getAdminTopupsPage } from "@/app/lib/admin/topups";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Wallet top-up data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm";

function buildHref(page: number): string {
  if (page <= 1) return "/admin/wallet-topups";
  return `/admin/wallet-topups?page=${page}`;
}

export default async function AdminWalletTopupsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminTopupsPage>>;
  try {
    data = await getAdminTopupsPage(params.page);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Wallet top-ups</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Wallet top-ups</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Read-only gateway-independent top-up records. Manual paid marking and
          webhook replay are not available.
        </p>
      </header>

      {data.rows.length === 0 ? (
        <div className={EMPTY_CLASS}>No wallet top-ups yet.</div>
      ) : (
        <ul className="min-w-0 space-y-3">
          {data.rows.map((row) => (
            <li key={row.id} className={CARD_CLASS}>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 font-semibold text-[var(--heading)]">
                      {row.customerLabel}
                    </p>
                    <AdminStatusPill value={row.statusLabel}>
                      {row.statusLabel}
                    </AdminStatusPill>
                  </div>
                  <p className="text-[var(--text-muted)]">{row.gatewayLabel}</p>
                  <p className="font-semibold tabular-nums text-[var(--heading)]">
                    {row.creditAmountLabel} USD
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    Charge {row.chargeLabel} · Created {row.createdAtLabel}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    Provider ref {row.providerRefMasked} · Ledger{" "}
                    {row.walletTransactionLabel}
                  </p>
                </div>
                <AdminButton
                  href={`/admin/wallet-topups/${encodeURIComponent(row.id)}`}
                  variant="primary"
                  className="shrink-0"
                >
                  View top-up
                </AdminButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]"
          aria-label="Wallet top-up pages"
        >
          <p>
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <AdminButton href={buildHref(data.page - 1)} variant="secondary">
                Previous
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" disabled>
                Previous
              </AdminButton>
            )}
            {data.page < data.totalPages ? (
              <AdminButton href={buildHref(data.page + 1)} variant="secondary">
                Next
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" disabled>
                Next
              </AdminButton>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
