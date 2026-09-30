import { PartnerCreateForm } from "@/app/components/admin/PartnerCreateForm";
import { PartnerListRowActions } from "@/app/components/admin/PartnerListRowActions";
import {
  AdminButton,
  AdminEmptyState,
  AdminFilterField,
  AdminFilterPanel,
  adminFilterControlClassName,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_KPI_GRID_CLASS,
  ADMIN_PAGE_STACK_CLASS,
  ADMIN_SOFT_COPY_CLASS,
} from "@/app/components/admin/ui";
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

function partnerStatusPillValue(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "DISABLED") return "DISABLED";
  if (normalized === "DELETED") return "DELETED";
  if (normalized === "INVITED") return "PENDING";
  return status;
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
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title="Partners" />
        <AdminEmptyState title="Temporarily unavailable">
          {PARTNERS_UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  const filterBase = { q: data.search, status: data.status };

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title="Partners"
        description="Manage reseller PARTNER accounts, discounts, and prepaid wallet balances. List metrics are read-only aggregates from completed purchases."
      />

      <section
        className={ADMIN_KPI_GRID_CLASS}
        aria-label="Partner status counts"
      >
        <AdminKpiCard label="Total partners" value={String(data.kpis.totalCount)} />
        <AdminKpiCard label="Active" value={String(data.kpis.activeCount)} />
        <AdminKpiCard label="Invited" value={String(data.kpis.invitedCount)} />
        <AdminKpiCard label="Disabled" value={String(data.kpis.disabledCount)} />
      </section>

      <PartnerCreateForm />

      <AdminFilterPanel aria-label="Partner filters">
        <AdminFilterField label="Search" className="sm:col-span-2">
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Name, email, or partner ID"
            className={adminFilterControlClassName}
          />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <select
            name="status"
            defaultValue={data.status}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="DISABLED">Disabled</option>
            <option value="DELETED">Deleted</option>
          </select>
        </AdminFilterField>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <AdminButton type="submit" variant="primary" size="sm">
            Apply filters
          </AdminButton>
          <AdminButton href="/admin/partners" variant="secondary" size="sm">
            Clear
          </AdminButton>
        </div>
      </AdminFilterPanel>

      <p className={ADMIN_SOFT_COPY_CLASS}>
        Showing {data.rows.length} of {data.totalCount} · page {data.page} /{" "}
        {data.totalPages}
      </p>

      {data.rows.length === 0 ? (
        <AdminEmptyState title="No partners match">
          No partners match the selected filters.
        </AdminEmptyState>
      ) : (
        <AdminTableShell caption="Partners" minWidthClassName="min-w-[1100px]">
          <AdminTableHead>
            <tr>
              <th className="px-3 py-3 font-semibold">Partner name</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Wallet balance</th>
              <th className="px-3 py-3 font-semibold">Total orders</th>
              <th className="px-3 py-3 font-semibold">Revenue</th>
              <th className="px-3 py-3 font-semibold">Discount / savings</th>
              <th className="px-3 py-3 font-semibold">Created</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {data.rows.map((partner) => (
              <tr key={partner.id}>
                <td className="px-3 py-3 align-top font-medium text-[var(--heading)]">
                  {partner.name}
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs text-[var(--text-muted)]">
                  {partner.emailMasked}
                </td>
                <td className="px-3 py-3 align-top">
                  <AdminStatusPill value={partnerStatusPillValue(partner.statusLabel)}>
                    {partner.statusLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3 align-top tabular-nums text-[var(--heading)]">
                  {partner.balanceLabel}
                </td>
                <td className="px-3 py-3 align-top tabular-nums text-[var(--heading)]">
                  {partner.totalOrdersLabel}
                </td>
                <td className="px-3 py-3 align-top tabular-nums text-[var(--heading)]">
                  {partner.revenueLabel}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  <p className="tabular-nums">{partner.discountSavingsLabel}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                    Rate {partner.discountPercentLabel}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-[var(--text-muted)]">
                  {partner.createdAtLabel}
                </td>
                <td className="px-3 py-3 align-top">
                  <PartnerListRowActions
                    partnerId={partner.id}
                    statusLabel={partner.statusLabel}
                    statusVersion={partner.statusVersion}
                  />
                </td>              </tr>
            ))}
          </AdminTableBody>
        </AdminTableShell>
      )}

      {data.totalPages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Partners pagination">
          {data.page > 1 ? (
            <AdminButton
              href={buildPartnersHref({ ...filterBase, page: data.page - 1 })}
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
              href={buildPartnersHref({ ...filterBase, page: data.page + 1 })}
              variant="secondary"
            >
              Next
            </AdminButton>
          ) : (
            <AdminButton variant="secondary" disabled>
              Next
            </AdminButton>
          )}
        </nav>
      ) : null}
    </div>
  );
}
