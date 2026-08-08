import Image from "next/image";
import Link from "next/link";
import { requireSession } from "@/app/lib/auth/session";
import { listCustomerOrders } from "@/app/lib/orders/customerOrders";
import type { CustomerEsimStatusBadge } from "@/app/lib/orders/customerOrderDisplay";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Review needed":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Refunded":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    case "Failed":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

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
        <h1 className="text-2xl font-bold tracking-tight">My eSIMs</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your purchased and assigned eSIMs. Open an order for installation
          options and secure ICCID reveal.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
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
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </span>
          <select
            name="status"
            defaultValue={result.status}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="REVIEW_NEEDED">Review needed</option>
            <option value="REFUNDED">Refunded</option>
            <option value="FAILED">Failed</option>
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
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
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
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Apply filters
          </button>
          <Link
            href="/account/orders"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Clear
          </Link>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]"
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
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  Browse destinations
                </Link>
                <Link
                  href="/account/esim/buy"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  Buy eSIM
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {result.rows.map((order) => (
            <li key={order.id}>
              <article className="min-w-0 rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-4 sm:p-5">
                <div className="flex min-w-0 flex-wrap items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    {order.flagUrl ? (
                      <Image
                        src={order.flagUrl}
                        alt=""
                        width={48}
                        height={36}
                        className="h-8 w-auto object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-xs font-bold text-[var(--text-soft)]">
                        eSIM
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-[var(--heading)] break-words">
                        {order.destination}
                      </h2>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(order.statusBadge)}`}
                      >
                        {order.statusBadge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      Ref {order.shortReference}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
                      {order.planName}
                      {order.dataAllowance !== "Not available"
                        ? ` · ${order.dataAllowance}`
                        : ""}
                      {order.validity !== "Not available"
                        ? ` · ${order.validity}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--heading)]">
                    {order.amountLabel}
                  </p>
                </div>

                <dl className="mt-3 grid gap-1 text-xs text-[var(--text-soft)] sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold">Purchased: </dt>
                    <dd className="inline">{order.createdAtLabel}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">ICCID: </dt>
                    <dd className="inline">{order.iccidMasked}</dd>
                  </div>
                  {order.emailDeliveryLabel ? (
                    <div>
                      <dt className="inline font-semibold">Email: </dt>
                      <dd className="inline">{order.emailDeliveryLabel}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Link
                    href={`/account/orders/${encodeURIComponent(order.id)}`}
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
                  >
                    View details
                  </Link>
                  {order.statusBadge === "Completed" ? (
                    <Link
                      href={`/account/orders/${encodeURIComponent(order.id)}?usage=1`}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[var(--accent-strong)]/50 bg-[var(--accent-strong)]/10 px-4 text-sm font-bold text-[var(--heading)] transition hover:bg-[var(--accent-strong)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
                    >
                      View usage
                    </Link>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
