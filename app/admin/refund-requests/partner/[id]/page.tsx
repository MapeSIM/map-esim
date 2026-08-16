import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPartnerRefundRequestActions from "@/app/components/admin/AdminPartnerRefundRequestActions";
import AdminPartnerRefundRequestExecute from "@/app/components/admin/AdminPartnerRefundRequestExecute";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminPartnerRefundRequestDetail } from "@/app/lib/partner/partnerRefundRequestAdmin";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-[var(--heading)]">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminPartnerRefundRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminPartnerRefundRequestDetail>>;
  try {
    detail = await getAdminPartnerRefundRequestDetail(id);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
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
            Partner refund request data is temporarily unavailable.
          </p>
        </div>
      </div>
    );
  }

  if (!detail) notFound();

  return (
    <div className="min-w-0 space-y-8">
      <div className="min-w-0">
        <Link
          href="/admin/refund-requests"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to refund requests
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Partner refund request review
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Approval does not issue the refund. Provider/order evidence must be
          verified before execution. The refund amount if eventually executed is
          the exact Partner debit — it cannot be edited here.
        </p>
      </div>

      <dl className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Source" value="Partner" />
        <DetailRow label="Request ID" value={detail.id} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Reason" value={detail.reasonLabel} />
        <DetailRow label="Submitted" value={detail.createdAtLabel} />
        <DetailRow label="Partner" value={detail.partnerLabel} />
        <DetailRow label="Partner email" value={detail.partnerEmail} />
        <DetailRow label="Order" value={detail.orderRefLabel} />
        <DetailRow label="Purchase" value={detail.purchaseRefLabel} />
        <DetailRow label="Destination" value={detail.destinationLabel} />
        <DetailRow label="Plan" value={detail.planLabel} />
        <DetailRow label="Retail price" value={`${detail.retailLabel} (reference only)`} />
        <DetailRow label="Partner paid / debit" value={detail.debitLabel} />
        <DetailRow
          label="Refund amount if eventually executed"
          value={`EXACT PARTNER DEBIT · ${detail.refundBasisLabel}`}
        />
        <DetailRow
          label="Partner note"
          value={detail.partnerNote || "None"}
        />
        <DetailRow
          label="Admin decision note"
          value={detail.adminDecisionNote || "None"}
        />
        <DetailRow
          label="Reviewed"
          value={detail.reviewedAtLabel || "Not yet"}
        />
      </dl>

      {detail.reason === "INSTALL_DETAILS_UNAVAILABLE" ? (
        <p
          className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
          role="status"
        >
          Recover installation details before considering a refund.
        </p>
      ) : null}

      {detail.appearsProvisioned ? (
        <p
          className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
          role="status"
        >
          This order appears provisioned. Refund execution will remain blocked
          unless later eligibility checks pass.
        </p>
      ) : null}

      <p className="text-sm text-[var(--text-muted)]">
        {detail.orderId ? (
          <>
            Local order link:{" "}
            <Link
              href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Open order
            </Link>
          </>
        ) : (
          "No local order link is available."
        )}
      </p>

      {detail.reconciliationHref ? (
        <p className="text-sm text-[var(--text-muted)]">
          Provider/order evidence:{" "}
          <Link
            href={detail.reconciliationHref}
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Open reconciliation case
          </Link>
          . This does not issue a refund.
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No reconciliation case is linked for this purchase. Approval still
          does not issue the refund.
        </p>
      )}

      <AdminPartnerRefundRequestActions
        requestId={detail.id}
        canMarkUnderReview={detail.canMarkUnderReview}
        canApprove={detail.canApprove}
        canReject={detail.canReject}
      />

      {detail.canExecute ? (
        <AdminPartnerRefundRequestExecute
          requestId={detail.id}
          debitLabel={detail.debitLabel}
          refundBasisLabel={detail.refundBasisLabel}
          localBlockerLabel={detail.localExecutionBlockerLabel}
        />
      ) : null}
    </div>
  );
}
