import Link from "next/link";

/**
 * Display-only label for orders created by an Add More Data top-up purchase.
 * Do not use for addDataEligible (CTA on a source eSIM).
 */
export function AddDataPurchaseBadge({
  isAddDataPurchase,
  sourceOrderHref,
}: {
  isAddDataPurchase: boolean;
  /** Optional admin/customer link to the source (parent) eSIM order. */
  sourceOrderHref?: string | null;
}) {
  if (!isAddDataPurchase) return null;

  const badgeClass =
    "inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold tracking-wide text-[var(--heading)]";

  if (sourceOrderHref) {
    return (
      <Link
        href={sourceOrderHref}
        className={`${badgeClass} transition hover:border-[var(--accent-strong)]/50 hover:bg-[var(--accent-strong)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60`}
        title="View source eSIM order"
      >
        Add More Data
      </Link>
    );
  }

  return <span className={badgeClass}>Add More Data</span>;
}
