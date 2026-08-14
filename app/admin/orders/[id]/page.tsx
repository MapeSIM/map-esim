import Link from "next/link";
import { notFound } from "next/navigation";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import AdminEsimUsagePanel from "@/app/components/orders/AdminEsimUsagePanel";
import { getAdminOrderDetail } from "@/app/lib/admin/orders";

export const dynamic = "force-dynamic";

const ORDERS_UNAVAILABLE =
  "Order data is temporarily unavailable. Please refresh shortly.";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminOrderDetail>>;
  try {
    detail = await getAdminOrderDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to orders
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {ORDERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to orders
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Order detail</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Local order snapshots only. Provider fulfilment status is not
          refreshed from this page.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Local order ID" value={detail.id} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Destination" value={detail.destination} />
        <DetailRow label="Plan / data" value={detail.planPackage} />
        <DetailRow label="Validity" value={detail.validity} />
        <DetailRow label="Local status" value={detail.localStatus} />
        <DetailRow label="Funding" value={detail.fundingLabel} />
        <DetailRow label="Provider amount" value={detail.amountLabel} />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow label="Offer ID" value={detail.offerId} />
        <DetailRow label="Association" value={detail.associationLabel} />
        <DetailRow label="Customer email" value={detail.customerEmail} />
        <DetailRow label="Account status" value={detail.accountStatusLabel} />
        <DetailRow label="Claim status" value={detail.claimStatusLabel} />
        <DetailRow label="Claimed at" value={detail.claimedAtLabel} />
        <IccidRevealPanel
          orderId={detail.id}
          maskedLabel={detail.iccidHint}
          revealable={detail.iccidRevealable}
          revealPath={`/api/admin/orders/${encodeURIComponent(detail.id)}/iccid`}
        />
      </dl>

      <AdminEsimUsagePanel orderId={detail.id} />
    </div>
  );
}
