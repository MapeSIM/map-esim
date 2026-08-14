import Link from "next/link";
import { getAdminCustomersPage } from "@/app/lib/admin/customers";

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
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {CUSTOMERS_UNAVAILABLE}
          </p>
        </div>
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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only CUSTOMER accounts. Password hashes, OAuth tokens, and
          provider account identifiers are never displayed.
        </p>
      </header>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Name, email, or local customer ID"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Verification
          </span>
          <select
            name="verification"
            defaultValue={data.verification}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All</option>
            <option value="VERIFIED">Verified</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Authentication
          </span>
          <select
            name="auth"
            defaultValue={data.auth}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All methods</option>
            <option value="GOOGLE">Google</option>
            <option value="CREDENTIALS">Credentials</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Account
          </span>
          <select
            name="account"
            defaultValue={data.account}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All accounts</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
            <option value="DELETED">Deleted</option>
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
            href="/admin/customers"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Clear
          </Link>
        </div>
      </form>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-soft)]">
          No customers match the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
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
            </thead>
            <tbody>
              {data.rows.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-t border-[var(--border)] text-[var(--text)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {customer.createdAtLabel}
                  </td>
                  <td className="px-3 py-3">{customer.name}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {customer.emailMasked}
                  </td>
                  <td className="px-3 py-3">{customer.authMethodLabel}</td>
                  <td className="px-3 py-3">{customer.emailVerifiedLabel}</td>
                  <td className="px-3 py-3">{customer.accountStatusLabel}</td>
                  <td className="px-3 py-3">{customer.localOrderCount}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/customers/${customer.id}`}
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
          {data.totalCount} customer{data.totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildCustomersHref({
                ...filterBase,
                page: data.page - 1,
              })}
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
              href={buildCustomersHref({
                ...filterBase,
                page: data.page + 1,
              })}
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
