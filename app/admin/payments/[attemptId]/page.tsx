import Link from "next/link";
import { notFound } from "next/navigation";
import PendingPaymentVerifyForm from "@/app/components/admin/PendingPaymentVerifyForm";
import PendingSimpaisaInvestigateForm from "@/app/components/admin/PendingSimpaisaInvestigateForm";
import { getAdminPaymentDetail } from "@/app/lib/admin/paymentDashboard";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireRole("ADMIN");
  const { attemptId: raw } = await params;
  const detail = await getAdminPaymentDetail(raw);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm">
          <Link
            href="/admin/payments"
            className="font-semibold text-[var(--accent-strong)]"
          >
            ← Payments
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Payment detail</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Canonical payment attempt view. Investigation tools never fund or mark
          paid. Funding remains webhook-authoritative.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Payment id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.attemptId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Customer
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.customerHref ? (
                <Link
                  href={detail.customerHref}
                  className="font-semibold text-[var(--accent-strong)]"
                >
                  {detail.customerLabel}
                </Link>
              ) : (
                detail.customerLabel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Purchase id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.purchaseId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Order id
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.orderId ? (
                <Link
                  href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}
                  className="font-semibold text-[var(--accent-strong)]"
                >
                  {detail.orderId}
                </Link>
              ) : (
                "none"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Amount
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.amountLabel}
              {detail.chargeLabel ? ` · charge ${detail.chargeLabel}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Provider / method
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.providerLabel} · method {detail.methodLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Status
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              attempt {detail.attemptStatus} · purchase {detail.purchaseStatus}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Provider reference
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.providerRefMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Webhook
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.webhookLabel}
              <span className="text-[var(--text-soft)]"> · </span>
              <Link
                href="/admin/payments/webhooks"
                className="font-semibold text-[var(--accent-strong)]"
              >
                Receipts
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Inquiry
            </dt>
            <dd className="mt-1 text-[var(--heading)]">{detail.inquiryLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet reserved
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.walletAppliedCents > 0
                ? `${detail.walletAppliedCents} cents`
                : "none (gateway-only)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Created / updated
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.createdAtLabel} · {detail.updatedAtLabel}
            </dd>
          </div>
          {detail.failureCategory || detail.failureCode ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Failure
              </dt>
              <dd className="mt-1 text-[var(--heading)]">
                {[detail.failureCategory, detail.failureCode]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-sm">
          {detail.customerHref ? (
            <>
              <Link
                href={`${detail.customerHref}/timeline`}
                className="font-semibold text-[var(--accent-strong)]"
              >
                Customer timeline
              </Link>
              <span className="text-[var(--text-soft)]"> · </span>
            </>
          ) : null}
          <Link
            href={`/admin/payments/pending/${encodeURIComponent(detail.attemptId)}`}
            className="font-semibold text-[var(--accent-strong)]"
          >
            Legacy pending page
          </Link>
        </p>
      </section>

      {detail.investigationAvailable ? (
        detail.isSimpaisa ? (
          <PendingSimpaisaInvestigateForm
            paymentAttemptId={detail.attemptId}
            transactionRefMasked={detail.providerRefMasked}
            walletAppliedCents={detail.walletAppliedCents}
          />
        ) : (
          <PendingPaymentVerifyForm
            paymentAttemptId={detail.attemptId}
            trackerRefMasked={detail.providerRefMasked}
          />
        )
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]">
          Investigation tools are available when the attempt is awaiting
          gateway payment, payment pending, or reconciliation required. This
          page never funds or marks paid.
        </section>
      )}
    </div>
  );
}
