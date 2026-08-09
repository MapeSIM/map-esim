import Link from "next/link";
import { notFound } from "next/navigation";
import AdminRefundRequestActions from "@/app/components/admin/AdminRefundRequestActions";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminRefundRequestDetail } from "@/app/lib/refunds/refundRequestAdmin";

export const dynamic = "force-dynamic";

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

export default async function AdminRefundRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminRefundRequestDetail>>;
  try {
    detail = await getAdminRefundRequestDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/refund-requests"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to refund requests
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Refund request data is temporarily unavailable.
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
          href="/admin/refund-requests"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to refund requests
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Refund request review
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Safe order and payment evidence only. Approving does not execute a
          refund in this phase.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Request ID" value={detail.id} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Reason" value={detail.reasonLabel} />
        <DetailRow label="Requested" value={detail.createdAtLabel} />
        <DetailRow label="Customer" value={detail.customerLabel} />
        <DetailRow label="Customer email" value={detail.customerEmail} />
        <DetailRow label="Order" value={detail.orderReference} />
        <DetailRow label="Destination" value={detail.orderDestination} />
        <DetailRow label="Plan" value={detail.planName} />
        <DetailRow label="Order status" value={detail.orderStatus} />
        <DetailRow label="Refund amount" value={detail.amountLabel} />
        <DetailRow label="Payment composition" value={detail.compositionLabel} />
        <DetailRow
          label="Purchase status"
          value={detail.purchaseStatus || "Not available"}
        />
        <DetailRow
          label="Gateway attempt"
          value={detail.paymentAttemptStatus || "Not available"}
        />
        <DetailRow
          label="Provider result"
          value={detail.providerResultKind || "Not available"}
        />
        <DetailRow
          label="Provider status code"
          value={detail.safeProviderStatusCode || "Not available"}
        />
        <DetailRow
          label="Reconciliation state"
          value={detail.reconciliationState || "Not available"}
        />
        <DetailRow label="ICCID (masked)" value={detail.iccidMasked} />
        <DetailRow
          label="Customer note"
          value={detail.customerNote || "None"}
        />
        <DetailRow
          label="Admin decision note"
          value={detail.adminDecisionNote || "None"}
        />
        <DetailRow
          label="Reviewed"
          value={detail.reviewedAtLabel || "Not yet"}
        />
        <DetailRow
          label="Decided"
          value={detail.decidedAtLabel || "Not yet"}
        />
      </dl>

      <p className="text-sm text-[var(--text-muted)]">
        Local order link:{" "}
        <Link
          href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Open order
        </Link>
      </p>

      <AdminRefundRequestActions
        requestId={detail.id}
        canMarkUnderReview={detail.canMarkUnderReview}
        canApprove={detail.canApprove}
        canReject={detail.canReject}
      />
    </div>
  );
}
