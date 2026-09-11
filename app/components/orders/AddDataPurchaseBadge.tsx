/**
 * Display-only label for orders created by an Add More Data top-up purchase.
 * Do not use for addDataEligible (CTA on a source eSIM).
 */
export function AddDataPurchaseBadge({
  isAddDataPurchase,
}: {
  isAddDataPurchase: boolean;
}) {
  if (!isAddDataPurchase) return null;
  return (
    <span className="inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold tracking-wide text-[var(--heading)]">
      Add More Data
    </span>
  );
}
