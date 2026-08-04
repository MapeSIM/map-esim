import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminTopupsPage } from "@/app/lib/admin/topups";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Wallet top-up data is temporarily unavailable. Please refresh shortly.";

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
      <div className="space-y-6">
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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Wallet top-ups</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Read-only gateway-independent top-up records. Manual paid marking and
          webhook replay are not available.
        </p>
      </header>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No wallet top-ups yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--heading)]">
                    {row.customerLabel}
                  </p>
                  <p className="mt-1 text-[var(--text-muted)]">
                    {row.statusLabel} · {row.gatewayLabel}
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-[var(--heading)]">
                  {row.creditAmountLabel} USD
                </p>
              </div>
              <p className="mt-2 text-xs text-[var(--text-soft)]">
                Charge {row.chargeLabel} · Created {row.createdAtLabel}
              </p>
              <p className="mt-1 text-xs text-[var(--text-soft)]">
                Provider ref {row.providerRefMasked} · Ledger{" "}
                {row.walletTransactionLabel}
              </p>
              <p className="mt-3">
                <Link
                  href={`/admin/wallet-topups/${encodeURIComponent(row.id)}`}
                  className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                >
                  View top-up
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}

      {data.totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-label="Wallet top-up pages"
        >
          <p className="text-[var(--text-muted)]">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-3">
            {data.page > 1 ? (
              <Link href={buildHref(data.page - 1)} className="font-semibold underline-offset-2 hover:underline">
                Previous
              </Link>
            ) : (
              <span className="text-[var(--text-soft)]">Previous</span>
            )}
            {data.page < data.totalPages ? (
              <Link href={buildHref(data.page + 1)} className="font-semibold underline-offset-2 hover:underline">
                Next
              </Link>
            ) : (
              <span className="text-[var(--text-soft)]">Next</span>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
