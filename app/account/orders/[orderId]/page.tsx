import Link from "next/link";
import { notFound } from "next/navigation";
import OrderInstallActions from "@/app/components/install/OrderInstallActions";
import { requireSession } from "@/app/lib/auth/session";
import { getCustomerOwnedOrderDetail } from "@/app/lib/orders/customerOrders";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireSession(
    `/account/orders/${encodeURIComponent(orderId)}`
  );

  let detail: Awaited<ReturnType<typeof getCustomerOwnedOrderDetail>>;
  try {
    detail = await getCustomerOwnedOrderDetail(user.id, orderId);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/account/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to orders
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Order details are temporarily unavailable. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  const actions = detail.installActions;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/account/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to orders
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Order details</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Package summary and secure installation options for this order.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Destination" value={detail.destination} />
        <DetailRow label="Package / data" value={detail.planPackage} />
        <DetailRow label="Validity" value={detail.validity} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Order date" value={detail.createdAtLabel} />
      </dl>

      {detail.installAvailable && actions ? (
        <OrderInstallActions
          hasInstallDetails={actions.hasInstallDetails}
          hasVerifiedLpa={actions.hasVerifiedLpa}
          hasOfficialIphoneActivationUrl={
            actions.hasOfficialIphoneActivationUrl
          }
          iphoneInstallHref={actions.iphoneInstallHref}
          iphoneGuideHref={actions.iphoneGuideHref}
          qrDownloadHref={actions.qrDownloadHref}
          qrViewHref={actions.qrViewHref}
          androidGuideHref={actions.androidGuideHref}
          androidActivationUrl={actions.androidActivationUrl}
        />
      ) : (
        <div
          className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5 text-sm text-[var(--text-muted)]"
          role="status"
        >
          Installation details are not available yet. Please check again shortly
          or contact support if this order should already be ready to install.
        </div>
      )}
    </div>
  );
}
