import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerWalletTransactions } from "@/app/lib/wallet/read";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";

export const dynamic = "force-dynamic";

const WALLET_UNAVAILABLE =
  "Wallet data is temporarily unavailable. Please refresh shortly.";

function buildWalletHref(page: number): string {
  if (page <= 1) return "/account/wallet";
  return `/account/wallet?page=${page}`;
}

export default async function AccountWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const params = await searchParams;
  const gatewayReady = isPaymentGatewayConfigured();

  let data: Awaited<ReturnType<typeof getCustomerWalletTransactions>>;
  try {
    data = await getCustomerWalletTransactions(user.id, params.page);
  } catch {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)] break-words">
            {WALLET_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)] break-words">
            {WALLET_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
            Your MAP eSIM wallet balance and history.
          </p>
        </div>
        {data.hasWallet ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/account/esim/buy"
              className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Buy eSIM with wallet
            </Link>
            {gatewayReady ? (
              <Link
                href="/account/wallet/top-up"
                className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Add funds
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
          Available balance
        </p>
        <p className="mt-2 break-words text-3xl font-bold tracking-tight text-[var(--heading)]">
          {data.balanceLabel}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">USD</p>
        <p className="mt-4 max-w-full text-sm leading-relaxed text-[var(--text-muted)] break-words [overflow-wrap:anywhere]">
          {gatewayReady
            ? "Add funds securely. Your payment amount is confirmed at checkout, and only a verified payment can credit this wallet."
            : "Online funding is not available yet. Use your existing balance to buy an eSIM, or contact support if you need funds added."}
        </p>
      </div>

      <section className="min-w-0 w-full max-w-full space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Transaction history</h2>

        {data.rows.length === 0 ? (
          <div className="min-w-0 w-full max-w-full rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
            No wallet transactions yet.
          </div>
        ) : (
          <>
            <ul className="min-w-0 space-y-3">
              {data.rows.map((row) => (
                <li
                  key={row.id}
                  className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-[var(--heading)]">
                        {row.typeLabel}
                      </p>
                      <p className="mt-1 break-words text-[var(--text-muted)]">
                        {row.directionLabel} · {row.statusLabel}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-[var(--heading)]">
                      {row.amountLabel}
                    </p>
                  </div>
                  <p className="mt-2 break-words text-xs text-[var(--text-soft)]">
                    {row.createdAtLabel}
                  </p>
                  {row.referenceLabel ? (
                    <p className="mt-1 break-words text-xs text-[var(--text-soft)]">
                      Ref {row.referenceLabel}
                    </p>
                  ) : null}
                  {row.notificationLabel ? (
                    <p className="mt-1 break-words text-xs text-[var(--text-soft)]">
                      {row.notificationLabel}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            {data.totalPages > 1 ? (
              <nav
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-2 text-sm"
                aria-label="Wallet transaction pages"
              >
                <p className="text-[var(--text-muted)]">
                  Page {data.page} of {data.totalPages}
                </p>
                <div className="flex gap-3">
                  {data.page > 1 ? (
                    <Link
                      href={buildWalletHref(data.page - 1)}
                      className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="text-[var(--text-soft)]">Previous</span>
                  )}
                  {data.page < data.totalPages ? (
                    <Link
                      href={buildWalletHref(data.page + 1)}
                      className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="text-[var(--text-soft)]">Next</span>
                  )}
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
