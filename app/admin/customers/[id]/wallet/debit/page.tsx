import Link from "next/link";
import { notFound } from "next/navigation";
import AdminWalletDebitForm from "@/app/components/admin/AdminWalletDebitForm";
import { getAdminCustomerWalletSummary } from "@/app/lib/admin/wallet";
import { ADMIN_DEBIT_MIN_CENTS } from "@/app/lib/wallet/amount";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Customer wallet data is temporarily unavailable. Please refresh shortly.";

export default async function AdminCustomerWalletDebitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let summary: Awaited<ReturnType<typeof getAdminCustomerWalletSummary>>;
  try {
    summary = await getAdminCustomerWalletSummary(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!summary) {
    notFound();
  }

  if (!summary.accountActive) {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(summary.customerId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Deduct wallet funds</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Debits cannot be issued to deleted customer accounts.
          </p>
        </div>
      </div>
    );
  }

  if (
    !summary.hasWallet ||
    summary.balanceCents < ADMIN_DEBIT_MIN_CENTS
  ) {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(summary.customerId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Deduct wallet funds</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            No wallet funds are available to deduct.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href={`/admin/customers/${encodeURIComponent(summary.customerId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to customer
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Deduct wallet funds
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          ADMIN-only manual USD debit. The wallet balance cannot become negative.
        </p>
      </div>

      <AdminWalletDebitForm
        customerUserId={summary.customerId}
        customerName={summary.customerName}
        customerEmailMasked={summary.customerEmailMasked}
        balanceLabel={summary.balanceLabel}
      />
    </div>
  );
}
