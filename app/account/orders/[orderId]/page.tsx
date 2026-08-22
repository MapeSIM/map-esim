import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerEsimInstallPanel from "@/app/components/orders/CustomerEsimInstallPanel";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import CustomerEsimUsagePanel from "@/app/components/orders/CustomerEsimUsagePanel";
import CustomerRefundRequestForm from "@/app/components/orders/CustomerRefundRequestForm";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import { requireSession } from "@/app/lib/auth/session";
import { getCustomerOwnedOrderDetail } from "@/app/lib/orders/customerOrders";
import {
  customerEsimStatusHelp,
  customerEsimStatusLabel,
  type CustomerEsimStatusBadge,
} from "@/app/lib/orders/customerOrderDisplay";
import { listCustomerRefundRequestsForOrder } from "@/app/lib/refunds/refundRequest";
import {
  isOpenRefundStatus,
  refundReasonLabel,
  refundStatusLabel,
} from "@/app/lib/refunds/refundRequestConstants";
import { formatUsdCents } from "@/app/lib/wallet/display";

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

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Review needed":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Refunded":
    case "Failed":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

export default async function AccountOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ usage?: string; refund?: string }>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const autoOpenUsage = query.usage === "1" || query.usage === "true";
  const refundJustRequested =
    query.refund === "requested" || query.refund === "1";
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
          ← Back to My eSIMs
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

  // Fail soft — never crash the order page if refund listing is unavailable.
  let refundRequests: Awaited<
    ReturnType<typeof listCustomerRefundRequestsForOrder>
  > = [];
  try {
    refundRequests = await listCustomerRefundRequestsForOrder({
      customerUserId: user.id,
      orderId: detail.id,
    });
  } catch {
    refundRequests = [];
  }
  const openRefund = refundRequests.find((row) =>
    isOpenRefundStatus(row.status)
  );
  const canRequestRefund = !detail.isRefunded && !openRefund;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/account/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to My eSIMs
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {detail.flagUrl ? (
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              <Image
                src={detail.flagUrl}
                alt=""
                width={48}
                height={36}
                className="h-8 w-auto object-cover"
                unoptimized
              />
            </div>
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {detail.destination}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Order {detail.shortReference}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(detail.statusBadge)}`}
          >
            {customerEsimStatusLabel(detail.statusBadge)}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">
          {customerEsimStatusHelp(detail.statusBadge)}
        </p>
      </div>

      {detail.isRefunded ? (
        <section
          className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-4 sm:px-5"
          role="status"
        >
          <h2 className="text-base font-bold text-[var(--heading)]">
            Order refunded
          </h2>
          <dl className="mt-2 space-y-1 text-sm text-[var(--danger-text)]">
            {detail.refundStatusLabel ? (
              <div>
                <dt className="inline font-semibold">Refund status: </dt>
                <dd className="inline">{detail.refundStatusLabel}</dd>
              </div>
            ) : null}
            {detail.refundedAtLabel ? (
              <div>
                <dt className="inline font-semibold">Refund date: </dt>
                <dd className="inline">{detail.refundedAtLabel}</dd>
              </div>
            ) : null}
            {detail.refundAmountLabel ? (
              <div>
                <dt className="inline font-semibold">Refunded amount: </dt>
                <dd className="inline">{detail.refundAmountLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-semibold">Order reference: </dt>
              <dd className="inline">{detail.shortReference}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-[var(--danger-text)]">
            Installation may no longer be available. QR codes and activation
            actions are disabled for this order.
          </p>
        </section>
      ) : null}

      <dl className="rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Destination" value={detail.destination} />
        <DetailRow label="Package / offer" value={detail.planName} />
        <DetailRow label="Data allowance" value={detail.dataAllowance} />
        <DetailRow label="Validity" value={detail.validity} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Amount" value={detail.amountLabel} />
        {detail.promoCode ? (
          <DetailRow label="Promo code" value={detail.promoCode} />
        ) : null}
        {detail.originalAmountLabel ? (
          <DetailRow label="Original" value={detail.originalAmountLabel} />
        ) : null}
        {detail.discountAmountLabel ? (
          <DetailRow label="Discount" value={`−${detail.discountAmountLabel}`} />
        ) : null}
        {detail.finalAmountLabel ? (
          <DetailRow label="Package total" value={detail.finalAmountLabel} />
        ) : null}
        {detail.rewardsAppliedPoints != null && detail.rewardsAppliedPoints > 0 ? (
          <DetailRow
            label="Rewards applied"
            value={`−${detail.rewardsAppliedPoints} points`}
          />
        ) : null}
        {detail.rewardsEarnedPoints != null && detail.rewardsEarnedPoints > 0 ? (
          <DetailRow
            label="Rewards earned"
            value={`+${detail.rewardsEarnedPoints} points`}
          />
        ) : null}
        <DetailRow label="Currency" value={detail.currencyLabel} />
        <DetailRow label="Purchased" value={detail.createdAtLabel} />
        <DetailRow label="Order reference" value={detail.shortReference} />
        <DetailRow
          label="Installation"
          value={
            detail.installEligible
              ? "Available after you open installation options"
              : detail.isRefunded
                ? "Disabled (refunded)"
                : "Not available yet"
          }
        />
        {detail.emailDeliveryLabel ? (
          <DetailRow label="Email" value={detail.emailDeliveryLabel} />
        ) : null}
        <IccidRevealPanel
          orderId={detail.id}
          maskedLabel={detail.iccidMasked}
          revealable={detail.iccidRevealable}
          revealPath={`/api/account/orders/${encodeURIComponent(detail.id)}/iccid`}
        />
      </dl>

      <CustomerEsimUsagePanel
        orderId={detail.id}
        usageEligible={detail.installEligible && !detail.isRefunded}
        autoOpen={autoOpenUsage}
      />

      <CustomerEsimInstallPanel
        orderId={detail.id}
        installEligible={detail.installEligible}
        isRefunded={detail.isRefunded}
      />
      <CustomerEsimInstallHelpLinks />

      {refundJustRequested ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="status"
        >
          Your refund request was submitted for review. No funds have been moved
          yet.
        </div>
      ) : null}

      {refundRequests.length > 0 ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
          <h2 className="text-base font-bold text-[var(--heading)]">
            Refund request status
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {refundRequests.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
              >
                <p className="font-semibold text-[var(--heading)]">
                  {refundStatusLabel(row.status)}
                </p>
                <p className="mt-1 text-[var(--text-muted)]">
                  {refundReasonLabel(row.reason)} ·{" "}
                  {formatUsdCents(row.refundAmountCents)} USD
                </p>
                {row.status === "REJECTED" && row.adminDecisionNote ? (
                  <p className="mt-1 text-[var(--text-muted)]">
                    Decision note: {row.adminDecisionNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CustomerRefundRequestForm
        orderId={detail.id}
        canRequest={canRequestRefund}
        openStatusLabel={
          openRefund ? refundStatusLabel(openRefund.status) : null
        }
      />
    </div>
  );
}
