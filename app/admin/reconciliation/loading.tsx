const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5";

export default function AdminReconciliationLoading() {
  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">
          Stuck cases
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Loading reconciliation cases…
        </p>
      </header>
      <div className={`${CARD_CLASS} px-5 py-8`} role="status" aria-busy="true">
        <p className="text-sm font-medium text-[var(--heading)]">
          Preparing KPIs and case list…
        </p>
      </div>
    </div>
  );
}
