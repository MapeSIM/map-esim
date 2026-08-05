import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminCompletedWalletPurchase } from "@/app/lib/esim/adminWalletPurchaseRead";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerWalletBuySuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    purchase?: string;
    price?: string;
    status?: string;
    package?: string;
  }>;
}) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) {
    notFound();
  }

  void query.price;
  void query.status;
  void query.package;

  const purchase = await getAdminCompletedWalletPurchase(
    admin.id,
    id,
    purchaseId
  );
  if (!purchase) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Wallet purchase completed
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The customer wallet was debited and the eSIM order was created.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)] break-words">
            {purchase.customerName} · {purchase.customerEmailMasked}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Package
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.planName} · {purchase.dataAllowance}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Destination
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.destination}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Amount charged
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.priceLabel}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Funding
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.fundingLabel}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Email delivery
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.emailDeliveryStatus}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Audit log reference
          </dt>
          <dd className="text-sm font-medium text-[var(--heading)] break-all">
            {purchase.auditLogId}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/orders/${encodeURIComponent(purchase.orderId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          View order
        </Link>
        <Link
          href={`/admin/customers/${encodeURIComponent(purchase.customerId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 font-semibold text-[var(--heading)]"
        >
          Back to customer
        </Link>
        <Link
          href={`/admin/audit-logs?q=${encodeURIComponent(purchase.auditLogId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 font-semibold text-[var(--heading)]"
        >
          View audit log
        </Link>
      </div>
    </div>
  );
}
