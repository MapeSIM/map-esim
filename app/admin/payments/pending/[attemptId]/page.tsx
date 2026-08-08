import Link from "next/link";
import { notFound } from "next/navigation";
import PendingPaymentVerifyForm from "@/app/components/admin/PendingPaymentVerifyForm";
import { getPendingGatewayPaymentAttemptDetail } from "@/app/lib/admin/pendingPaymentVerify";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPendingPaymentDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireRole("ADMIN");
  const { attemptId: raw } = await params;
  const detail = await getPendingGatewayPaymentAttemptDetail(raw);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm">
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            ← Pending payments
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment attempt
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Read-only local state plus authenticated Safepay verification. Funding
          remains webhook-authoritative.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Attempt id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.attemptId}
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
              Local statuses
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              attempt {detail.attemptStatus} · purchase {detail.purchaseStatus}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Expected charge
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.chargeAmountMinor ?? detail.gatewayAmountCents}{" "}
              {detail.chargeCurrency ?? detail.currency}
            </dd>
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
              Webhook / VeSIM
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              webhook {detail.webhookEventIdPresent ? "present" : "missing"} ·
              order {detail.orderId ? detail.orderId : "none"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Tracker
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.trackerRefMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Created
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.createdAt.toISOString()}
            </dd>
          </div>
        </dl>
      </section>

      <PendingPaymentVerifyForm
        paymentAttemptId={detail.attemptId}
        trackerRefMasked={detail.trackerRefMasked}
      />
    </div>
  );
}
