import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import {
  adminHumanStatusLabel,
  ADMIN_UX_PAGE,
} from "@/app/lib/admin/adminUxCopy";
import { getAdminOrdersPage } from "@/app/lib/admin/orders";
import {
  AdminButton,
  AdminEmptyState,
  AdminFilterField,
  AdminFilterPanel,
  adminFilterControlClassName,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_PAGE_STACK_CLASS,
} from "@/app/components/admin/ui";

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
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.orders.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {ORDERS_UNAVAILABLE}
        </AdminEmptyState>
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
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.orders.title}
        description={ADMIN_UX_PAGE.orders.description}
      />

      <AdminFilterPanel aria-label="Order filters">
        {data.userId ? (
          <input type="hidden" name="userId" value={data.userId} />
        ) : null}
        <AdminFilterField
          label="Search"
          className="sm:col-span-2 lg:col-span-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Destination, plan, local ID, provider ref"
            className={adminFilterControlClassName}
          />
        </AdminFilterField>

        <AdminFilterField label="Status">
          <select
            name="status"
            defaultValue={data.status}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Association">
          <select
            name="association"
            defaultValue={data.association}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All orders</option>
            <option value="LINKED">Linked customer</option>
            <option value="GUEST">Guest order</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Currency">
          <select
            name="currency"
            defaultValue={data.currency || "ALL"}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All currencies</option>
            <option value="USD">USD</option>
          </select>
        </AdminFilterField>

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <AdminButton type="submit" variant="primary">
            Apply filters
          </AdminButton>
          <AdminButton href="/admin/orders" variant="secondary">
            Clear
          </AdminButton>
        </div>
      </AdminFilterPanel>

      {data.rows.length === 0 ? (
        <AdminEmptyState
          title="No matching orders"
          actionHref="/admin/orders"
          actionLabel="Clear filters"
        >
          No local orders match the selected filters.
        </AdminEmptyState>
      ) : (
        <AdminTableShell
          caption="Local orders"
          minWidthClassName="min-w-[900px]"
        >
          <AdminTableHead>
            <tr>
              <th className="px-3 py-3 font-semibold">Created</th>
              <th className="px-3 py-3 font-semibold">Destination</th>
              <th className="px-3 py-3 font-semibold">Plan / data</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Funding</th>
              <th className="px-3 py-3 font-semibold">Amount</th>
              <th className="px-3 py-3 font-semibold">Provider ref</th>
              <th className="px-3 py-3 font-semibold">ICCID</th>
              <th className="px-3 py-3 font-semibold">Association</th>
              <th className="px-3 py-3 font-semibold">Details</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {data.rows.map((order) => (
              <tr key={order.id} className="text-[var(--text)]">
                <td className="whitespace-nowrap px-3 py-3">
                  {order.createdAtLabel}
                </td>
                <td className="px-3 py-3">{order.destination}</td>
                <td className="px-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span>{order.planPackage}</span>
                    <AddDataPurchaseBadge
                      isAddDataPurchase={order.isAddDataPurchase}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <AdminStatusPill value={order.localStatus}>
                    {adminHumanStatusLabel(order.localStatus)}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3">{order.fundingLabel}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  {order.amountLabel}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {order.providerRefMasked}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {order.iccidMasked}
                </td>
                <td className="px-3 py-3">
                  <AdminStatusPill value={order.associationLabel}>
                    {order.associationLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3">
                  <AdminButton
                    href={`/admin/orders/${order.id}`}
                    variant="ghost"
                    size="sm"
                  >
                    View
                  </AdminButton>
                </td>
              </tr>
            ))}
          </AdminTableBody>
        </AdminTableShell>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
        <p>
          Page {data.page} of {data.totalPages}
          <span className="mx-2 text-[var(--border-strong)]">·</span>
          {data.totalCount} order{data.totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <AdminButton
              href={buildOrdersHref({ ...filterBase, page: data.page - 1 })}
              variant="secondary"
            >
              Previous
            </AdminButton>
          ) : (
            <AdminButton variant="secondary" disabled>
              Previous
            </AdminButton>
          )}
          {data.page < data.totalPages ? (
            <AdminButton
              href={buildOrdersHref({ ...filterBase, page: data.page + 1 })}
              variant="secondary"
            >
              Next
            </AdminButton>
          ) : (
            <AdminButton variant="secondary" disabled>
              Next
            </AdminButton>
          )}
        </div>
      </div>
    </div>
  );
}
