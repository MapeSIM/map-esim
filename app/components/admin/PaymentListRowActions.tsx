import {
  AdminButton,
  adminButtonClassName,
} from "@/app/components/admin/ui";

/**
 * Hub row action menu — deep-links only. No payment mutations here.
 */
export function PaymentListRowActions({
  detailHref,
  staleReleaseHref,
  reconciliationHref,
}: {
  detailHref: string;
  staleReleaseHref: string | null;
  reconciliationHref: string | null;
}) {
  return (
    <details className="relative">
      <summary
        className={`${adminButtonClassName("secondary", "sm")} cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden`}
      >
        Actions
      </summary>
      <div
        role="menu"
        className="absolute right-0 z-30 mt-1 w-52 space-y-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-lg"
      >
        <AdminButton
          href={detailHref}
          variant="primary"
          size="sm"
          className="w-full"
        >
          View Details
        </AdminButton>
        {staleReleaseHref ? (
          <AdminButton
            href={staleReleaseHref}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Release stale reservation
          </AdminButton>
        ) : null}
        {reconciliationHref ? (
          <AdminButton
            href={reconciliationHref}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            Reconciliation
          </AdminButton>
        ) : null}
      </div>
    </details>
  );
}
