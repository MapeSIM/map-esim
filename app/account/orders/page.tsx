import Link from "next/link";
import { requireSession } from "@/app/lib/auth/session";
import { CustomerEsimOrderCard } from "@/app/components/orders/CustomerEsimOrderCard";
import { listCustomerOrders } from "@/app/lib/orders/customerOrders";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireSession("/account/orders");
  const params = await searchParams;
  const result = await listCustomerOrders(user.id, {
    q: params.q,
    status: params.status,
    from: params.from,
    to: params.to,
  });

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My eSIMs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Your purchased and assigned eSIMs. Open an order for installation
          options and secure ICCID reveal.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5"
      >
        <label className="block space-y-1 sm:col-span-2 lg:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={result.search}
            placeholder="Order ID, destination, package, or ICCID last 4"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </span>
          <select
            name="status"
            defaultValue={result.status}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All</option>
            <option value="COMPLETED">Ready to install</option>
            <option value="PROCESSING">Setting up</option>
            <option value="REVIEW_NEEDED">Needs a quick check</option>
            <option value="REFUNDED">Refunded</option>
            <option value="FAILED">Could not complete</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={result.from}
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={result.to}
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Apply filters
          </button>
          <Link
            href="/account/orders"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Clear
          </Link>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <div
          className="rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)] sm:p-8"
          role="status"
        >
          {result.search ||
          result.status !== "ALL" ||
          result.from ||
          result.to ? (
            <p>No eSIMs match your filters.</p>
          ) : (
            <>
              <p className="font-medium text-[var(--heading)]">
                You have not purchased an eSIM yet.
              </p>
              <p className="mt-2">
                Browse destinations to find a plan, or buy with your wallet
                balance.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/countries"
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  Browse destinations
                </Link>
                <Link
                  href="/account/esim/buy"
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  Buy eSIM
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {result.rows.map((order) => (
            <li key={order.id}>
              <CustomerEsimOrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
