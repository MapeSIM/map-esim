import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminTopupDetail } from "@/app/lib/admin/topups";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminWalletTopupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminTopupDetail>>;
  try {
    detail = await getAdminTopupDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/wallet-topups"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet top-ups
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Wallet top-up data is temporarily unavailable.
          </p>
        </div>
      </div>
    );
  }

  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/wallet-topups"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet top-ups
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Wallet top-up detail
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Read-only view. Provider internals and mark-paid controls are not
          available.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Customer" value={detail.customerLabel} />
        <DetailRow label="Wallet credit" value={`${detail.creditAmountLabel} USD`} />
        <DetailRow label="Charge" value={detail.chargeLabel} />
        <DetailRow label="Gateway" value={detail.gatewayLabel} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow
          label="Payment confirmed"
          value={detail.paymentConfirmedAtLabel}
        />
        <DetailRow
          label="Wallet credited"
          value={detail.walletCreditedAtLabel}
        />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow
          label="Linked wallet transaction"
          value={detail.walletTransactionLabel}
        />
        <DetailRow
          label="Failure category"
          value={detail.failureCategoryLabel}
        />
      </dl>

      <p>
        <Link
          href={`/admin/customers/${encodeURIComponent(detail.customerUserId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          View customer
        </Link>
      </p>
    </div>
  );
}
