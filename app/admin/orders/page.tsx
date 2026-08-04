import Link from "next/link";
import { getAdminOrdersPage } from "@/app/lib/admin/orders";

export const dynamic = "force-dynamic";

const ORDERS_UNAVAILABLE =
  "Order data is temporarily unavailable. Please refresh shortly.";

function buildOrdersHref(options: {
  q: string;
  status: string;
  association: string;
  currency: string;
  userId: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status && options.status !== "ALL") {
    params.set("status", options.status);
  }
  if (options.association && options.association !== "ALL") {
    params.set("association", options.association);
  }
  if (options.currency) params.set("currency", options.currency);
  if (options.userId) params.set("userId", options.userId);
  if (options.page > 1) params.set("page", String(options.page));
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    association?: string;
    currency?: string;
    page?: string;
    userId?: string;
  }>;
}) {
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminOrdersPage>>;
  try {
    data = await getAdminOrdersPage({
      q: params.q,
      status: params.status,
      association: params.association,
      currency: params.currency,
      page: params.page,
      userId: params.userId,
    });
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {ORDERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  const filterBase = {
    q: data.search,
    status: data.status,
    association: data.association,
    currency: data.currency,
    userId: data.userId,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Local order snapshots only. Provider fulfilment status is not
          refreshed from this page.
        </p>
      </header>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {data.userId ? (
          <input type="hidden" name="userId" value={data.userId} />
        ) : null}
        <label className="block text-sm sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Destination, plan, local ID, provider ref"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </span>
          <select
            name="status"
            defaultValue={data.status}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Association
          </span>
          <select
            name="association"
            defaultValue={data.association}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All orders</option>
            <option value="LINKED">Linked customer</option>
            <option value="GUEST">Guest order</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Currency
          </span>
          <select
            name="currency"
            defaultValue={data.currency || "ALL"}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All currencies</option>
            <option value="USD">USD</option>
          </select>
        </label>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Apply filters
          </button>
          <Link
            href="/admin/orders"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Clear
          </Link>
        </div>
      </form>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-soft)]">
          No local orders match the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Created</th>
                <th className="px-3 py-3 font-semibold">Destination</th>
                <th className="px-3 py-3 font-semibold">Plan / data</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Funding</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Provider ref</th>
                <th className="px-3 py-3 font-semibold">Association</th>
                <th className="px-3 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((order) => (
                <tr
                  key={order.id}
                  className="border-t border-[var(--border)] text-[var(--text)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {order.createdAtLabel}
                  </td>
                  <td className="px-3 py-3">{order.destination}</td>
                  <td className="px-3 py-3">{order.planPackage}</td>
                  <td className="px-3 py-3">{order.localStatus}</td>
                  <td className="px-3 py-3">{order.fundingLabel}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {order.amountLabel}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {order.providerRefMasked}
                  </td>
                  <td className="px-3 py-3">{order.associationLabel}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
        <p>
          Page {data.page} of {data.totalPages}
          <span className="mx-2 text-[var(--border-strong)]">·</span>
          {data.totalCount} order{data.totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildOrdersHref({ ...filterBase, page: data.page - 1 })}
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-3 font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center rounded-xl border border-[var(--border)] px-3 opacity-50">
              Previous
            </span>
          )}
          {data.page < data.totalPages ? (
            <Link
              href={buildOrdersHref({ ...filterBase, page: data.page + 1 })}
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-3 font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center rounded-xl border border-[var(--border)] px-3 opacity-50">
              Next
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
