import { getAdminCustomersPage } from "@/app/lib/admin/customers";
import {
  AdminButton,
  AdminEmptyState,
  AdminFilterField,
  AdminFilterPanel,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_PAGE_STACK_CLASS,
  adminFilterControlClassName,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const CUSTOMERS_UNAVAILABLE =
  "Customer data is temporarily unavailable. Please refresh shortly.";

function buildCustomersHref(options: {
  q: string;
  verification: string;
  auth: string;
  account: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.verification && options.verification !== "ALL") {
    params.set("verification", options.verification);
  }
  if (options.auth && options.auth !== "ALL") {
    params.set("auth", options.auth);
  }
  if (options.account && options.account !== "ALL") {
    params.set("account", options.account);
  }
  if (options.page > 1) params.set("page", String(options.page));
  const qs = params.toString();
  return qs ? `/admin/customers?${qs}` : "/admin/customers";
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    verification?: string;
    auth?: string;
    account?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminCustomersPage>>;
  try {
    data = await getAdminCustomersPage({
      q: params.q,
      verification: params.verification,
      auth: params.auth,
      account: params.account,
      page: params.page,
    });
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title="Customers" />
        <AdminEmptyState title="Temporarily unavailable">
          {CUSTOMERS_UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  const filterBase = {
    q: data.search,
    verification: data.verification,
    auth: data.auth,
    account: data.account,
  };

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title="Customers"
        description="Read-only CUSTOMER accounts. Password hashes, OAuth tokens, and provider account identifiers are never displayed."
      />

      <AdminFilterPanel aria-label="Customer filters">
        <AdminFilterField
          label="Search"
          className="sm:col-span-2 lg:col-span-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Name, email, or local customer ID"
            className={adminFilterControlClassName}
          />
        </AdminFilterField>

        <AdminFilterField label="Verification">
          <select
            name="verification"
            defaultValue={data.verification}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All</option>
            <option value="VERIFIED">Verified</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Authentication">
          <select
            name="auth"
            defaultValue={data.auth}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All methods</option>
            <option value="GOOGLE">Google</option>
            <option value="CREDENTIALS">Credentials</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Account">
          <select
            name="account"
            defaultValue={data.account}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All accounts</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
            <option value="DELETED">Deleted</option>
          </select>
        </AdminFilterField>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <AdminButton type="submit" variant="primary">
            Apply filters
          </AdminButton>
          <AdminButton href="/admin/customers" variant="secondary">
            Clear
          </AdminButton>
        </div>
      </AdminFilterPanel>

      {data.rows.length === 0 ? (
        <AdminEmptyState
          title="No matching customers"
          actionHref="/admin/customers"
          actionLabel="Clear filters"
        >
          No customers match the selected filters. Try clearing search or
          widening verification / auth / account filters.
        </AdminEmptyState>
      ) : (
        <AdminTableShell
          caption="Customers"
          minWidthClassName="min-w-[960px]"
        >
          <AdminTableHead>
            <tr>
              <th className="px-3 py-3 font-semibold">Created</th>
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold">Auth</th>
              <th className="px-3 py-3 font-semibold">Verified</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Orders</th>
              <th className="px-3 py-3 font-semibold">Details</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {data.rows.map((customer) => (
              <tr key={customer.id}>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--text)]">
                  {customer.createdAtLabel}
                </td>
                <td className="px-3 py-3 text-[var(--text)]">{customer.name}</td>
                <td className="break-all px-3 py-3 font-mono text-xs text-[var(--text)]">
                  {customer.emailMasked}
                </td>
                <td className="px-3 py-3 text-[var(--text)]">
                  {customer.authMethodLabel}
                </td>
                <td className="px-3 py-3">
                  <AdminStatusPill value={customer.emailVerifiedLabel}>
                    {customer.emailVerifiedLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3">
                  <AdminStatusPill value={customer.accountStatusLabel}>
                    {customer.accountStatusLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3 text-[var(--text)]">
                  {customer.localOrderCount}
                </td>
                <td className="px-3 py-3">
                  <AdminButton
                    href={`/admin/customers/${customer.id}`}
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
          {data.totalCount} customer{data.totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <AdminButton
              href={buildCustomersHref({
                ...filterBase,
                page: data.page - 1,
              })}
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
              href={buildCustomersHref({
                ...filterBase,
                page: data.page + 1,
              })}
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
