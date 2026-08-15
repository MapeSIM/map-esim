import Link from "next/link";
import { PartnerCreateForm } from "@/app/components/admin/PartnerCreateForm";
import { listPartnersPage } from "@/app/lib/partner/partners";

export const dynamic = "force-dynamic";

const PARTNERS_UNAVAILABLE =
  "Partner data is temporarily unavailable. Please refresh shortly.";

function buildPartnersHref(options: {
  q: string;
  status: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status && options.status !== "ALL") {
    params.set("status", options.status);
  }
  if (options.page > 1) params.set("page", String(options.page));
  const qs = params.toString();
  return qs ? `/admin/partners?${qs}` : "/admin/partners";
}

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof listPartnersPage>>;
  try {
    data = await listPartnersPage({
      q: params.q,
      status: params.status,
      page: params.page,
    });
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {PARTNERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  const filterBase = { q: data.search, status: data.status };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Manage reseller PARTNER accounts, discounts, and prepaid wallet
          balances. Password hashes and OTP codes are never displayed.
        </p>
      </header>

      <PartnerCreateForm />

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2"
      >
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Name, email, or partner ID"
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
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="DISABLED">Disabled</option>
            <option value="DELETED">Deleted</option>
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Apply filters
          </button>
          <Link
            href="/admin/partners"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Clear
          </Link>
        </div>
      </form>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-soft)]">
          No partners match the selected filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Created</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Email</th>
                <th className="px-3 py-3 font-semibold">Discount</th>
                <th className="px-3 py-3 font-semibold">Balance</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((partner) => (
                <tr
                  key={partner.id}
                  className="border-t border-[var(--border)] text-[var(--text)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {partner.createdAtLabel}
                  </td>
                  <td className="px-3 py-3">{partner.name}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {partner.emailMasked}
                  </td>
                  <td className="px-3 py-3">{partner.discountPercentLabel}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {partner.balanceLabel}
                  </td>
                  <td className="px-3 py-3">{partner.statusLabel}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/partners/${partner.id}`}
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
          {data.totalCount} partner{data.totalCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={buildPartnersHref({ ...filterBase, page: data.page - 1 })}
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
              href={buildPartnersHref({ ...filterBase, page: data.page + 1 })}
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
