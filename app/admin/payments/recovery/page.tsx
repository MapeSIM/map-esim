import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { ADMIN_UX_NAV, ADMIN_UX_PAGE } from "@/app/lib/admin/adminUxCopy";
import { listPaymentRecoveryCandidates } from "@/app/lib/admin/paymentRecovery";
import { buildAdminPaymentRecoveryHref } from "@/app/lib/admin/paymentRecoveryShared";
import {
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_PAGE_STACK_CLASS,
  ADMIN_SOFT_COPY_CLASS,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Stale unpaid holds data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPaymentRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof listPaymentRecoveryCandidates>>;
  try {
    data = await listPaymentRecoveryCandidates({ page: params.page });
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.staleUnpaidHolds.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.staleUnpaidHolds.title}
        description={ADMIN_UX_PAGE.staleUnpaidHolds.description}
        meta={
          <>
            Candidates: customer + partner · awaiting payment / payment pending /
            needs reconciliation · SIMPAISA / SAFEPAY · provider ref present ·
            webhook missing · stale ≥ {data.staleMinutes} minutes.
          </>
        }
        actions={
          <>
            <AdminButton href="/admin/payments" variant="ghost" size="sm">
              ← {ADMIN_UX_NAV.payments}
            </AdminButton>
            <AdminButton
              href="/admin/payments/pending"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.verifyPending}
            </AdminButton>
          </>
        }
      />

      <p className={ADMIN_SOFT_COPY_CLASS}>
        Showing {data.rows.length} of {data.totalCount} · page {data.page} /{" "}
        {data.totalPages}
      </p>

      {data.rows.length === 0 ? (
        <AdminEmptyState
          title="No stale unpaid holds"
          actionHref="/admin/payments/pending"
          actionLabel="Open Verify Pending"
        >
          No recovery candidates match the stale threshold right now.
        </AdminEmptyState>
      ) : (
        <AdminTableShell
          caption="Stale unpaid holds"
          minWidthClassName="min-w-[960px]"
        >
          <AdminTableHead>
            <tr>
              <th className="px-3 py-3 font-semibold">Attempt ID</th>
              <th className="px-3 py-3 font-semibold">Owner</th>
              <th className="px-3 py-3 font-semibold">Provider</th>
              <th className="px-3 py-3 font-semibold">Amount</th>
              <th className="px-3 py-3 font-semibold">Age</th>
              <th className="px-3 py-3 font-semibold">Webhook status</th>
              <th className="px-3 py-3 font-semibold">
                Last investigation decision
              </th>
              <th className="px-3 py-3 font-semibold">Suggested safe action</th>
              <th className="px-3 py-3 font-semibold"> </th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {data.rows.map((row) => (
              <tr key={`${row.ownerKind}-${row.attemptId}`}>
                <td className="px-3 py-3 align-top">
                  <p className="break-all font-medium text-[var(--heading)]">
                    {row.attemptId}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">
                    {row.ownerKind === "partner" ? "Partner" : "Customer"} ·
                    purchase {row.purchaseId}
                  </p>
                </td>
                <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                  {row.ownerHref ? (
                    <Link
                      href={row.ownerHref}
                      className="font-medium text-[var(--accent-strong)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                    >
                      {row.ownerLabel}
                    </Link>
                  ) : (
                    row.ownerLabel
                  )}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  {row.providerLabel}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  {row.amountLabel}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  {row.ageLabel}
                </td>
                <td className="px-3 py-3 align-top">
                  <AdminStatusPill value={row.webhookStatusLabel}>
                    {row.webhookStatusLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  <p className="font-medium">{row.lastDecisionLabel}</p>
                  {row.lastDecisionAtLabel ? (
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      {row.lastDecisionAtLabel}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                  {row.suggestedSafeAction}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-2">
                    <AdminButton href={row.href} variant="primary" size="sm">
                      Open
                    </AdminButton>
                    {row.ownerKind === "customer" ? (
                      <AdminButton
                        href={`/admin/payments/pending/${encodeURIComponent(row.attemptId)}`}
                        variant="secondary"
                        size="sm"
                      >
                        {ADMIN_UX_NAV.verifyPending}
                      </AdminButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </AdminTableBody>
        </AdminTableShell>
      )}

      {data.totalPages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Recovery pagination">
          {data.page > 1 ? (
            <AdminButton
              href={buildAdminPaymentRecoveryHref({ page: data.page - 1 })}
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
              href={buildAdminPaymentRecoveryHref({ page: data.page + 1 })}
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
