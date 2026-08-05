import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminFailedRefundedWalletPurchase } from "@/app/lib/esim/adminWalletPurchaseRead";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerWalletBuyFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ purchase?: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) {
    notFound();
  }

  const purchase = await getAdminFailedRefundedWalletPurchase(
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
          Wallet purchase failed
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The provider declined the order. The customer wallet amount was
          restored.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5 text-sm">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer
          </dt>
          <dd className="font-semibold text-[var(--heading)] break-words">
            {purchase.customerName} · {purchase.customerEmailMasked}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Amount restored
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {purchase.priceLabel}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {purchase.statusLabel}
          </dd>
        </div>
      </dl>

      <Link
        href={`/admin/customers/${encodeURIComponent(purchase.customerId)}`}
        className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--heading)]"
      >
        Back to customer
      </Link>
    </div>
  );
}
