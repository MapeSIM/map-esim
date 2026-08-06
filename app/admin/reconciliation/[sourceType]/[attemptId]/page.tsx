import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReconciliationDetail,
  requireActiveAdminForReconciliation,
} from "@/app/lib/admin/reconciliation";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Reconciliation data is temporarily unavailable. Please refresh shortly.";

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

function timelineStateLabel(state: string): string {
  if (state === "done") return "Done";
  if (state === "failed") return "Failed";
  if (state === "pending") return "Pending";
  return "Unknown";
}

export default async function AdminReconciliationDetailPage({
  params,
}: {
  params: Promise<{ sourceType: string; attemptId: string }>;
}) {
  await requireActiveAdminForReconciliation();
  const { sourceType, attemptId } = await params;

  let detail: Awaited<ReturnType<typeof getReconciliationDetail>>;
  try {
    detail = await getReconciliationDetail(sourceType, attemptId);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/reconciliation"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to reconciliation
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

  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/reconciliation"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to reconciliation
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Reconciliation case
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Read-only sanitized timeline. No recovery actions in this phase.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
      >
        Recovery actions will be available only after provider evidence and
        financial safety checks are confirmed.
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Attempt ID" value={detail.attemptId} />
        <DetailRow label="Source" value={detail.sourceType} />
        <DetailRow label="Purchase type" value={detail.purchaseType} />
        <DetailRow label="Category" value={detail.categoryLabel} />
        <DetailRow label="Customer" value={detail.customerLabel} />
        <DetailRow label="Package" value={detail.destinationPackage} />
        <DetailRow label="Amount" value={detail.amountLabel} />
        <DetailRow
          label="Wallet debit / refund"
          value={detail.walletDebitRefundLabel}
        />
        <DetailRow
          label="Provider result"
          value={detail.providerResultKindLabel}
        />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow label="Local order" value={detail.localOrderLabel} />
        <DetailRow label="Failure" value={detail.failureLabel} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Resolution / lock" value={detail.resolutionLabel} />
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <ol className="space-y-2">
          {detail.timeline.map((event) => (
            <li
              key={event.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--heading)]">
                  {event.label}
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  {timelineStateLabel(event.state)}
                </p>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)] break-words">
                {event.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Related</h2>
        <ul className="flex flex-wrap gap-3">
          {detail.relatedLinks.map((link) => (
            <li key={`${link.label}:${link.href}`}>
              <Link
                href={link.href}
                className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
