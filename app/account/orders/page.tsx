import Link from "next/link";
import { requireSession } from "@/app/lib/auth/session";
import { listCustomerOrders } from "@/app/lib/orders/customerOrders";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const user = await requireSession("/account/orders");
  const orders = await listCustomerOrders(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Linked eSIM orders for your account appear here.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Open an order to view package details and secure installation options.
        </p>
      )}

      {orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No linked orders yet. When an eSIM is assigned or linked to your
          account, it will show up here.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${encodeURIComponent(order.id)}`}
                className="block cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm transition hover:border-[var(--accent-strong)]/50 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                <p className="font-semibold text-[var(--heading)]">
                  {order.planPackage}
                </p>
                <p className="mt-1 text-[var(--text-muted)]">
                  {order.destination} · {order.statusLabel}
                </p>
                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  {order.createdAtLabel}
                </p>
                <p className="mt-3 text-sm font-semibold text-[var(--accent-strong)]">
                  View order details
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
