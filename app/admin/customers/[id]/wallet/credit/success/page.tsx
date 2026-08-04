import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminCompletedWalletCredit } from "@/app/lib/admin/wallet";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function parseTxId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerWalletCreditSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tx?: string; amount?: string; balance?: string }>;
}) {
  await requireRole("ADMIN");

  const { id } = await params;
  const query = await searchParams;
  const transactionId = parseTxId(query.tx);
  if (!transactionId) {
    notFound();
  }

  // Ignore any client-supplied amount/balance query values entirely.
  const credit = await getAdminCompletedWalletCredit(id, transactionId);
  if (!credit) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credit completed</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The wallet ledger was updated successfully.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Amount credited
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {credit.amountLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            New wallet balance
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {credit.balanceAfterLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Local transaction reference
          </dt>
          <dd className="text-sm font-medium text-[var(--heading)] break-all">
            {credit.transactionId}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/customers/${encodeURIComponent(credit.customerId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          Back to customer detail
        </Link>
        <span className="inline-flex h-11 items-center text-[var(--text-soft)]">
          Full admin wallet history coming soon
        </span>
      </div>
    </div>
  );
}
