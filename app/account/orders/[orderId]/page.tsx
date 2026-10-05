import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import CustomerEsimInstallPanel from "@/app/components/orders/CustomerEsimInstallPanel";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import { EsimLifecycleBadges } from "@/app/components/orders/EsimLifecycleBadges";
import CustomerRefundRequestForm from "@/app/components/orders/CustomerRefundRequestForm";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import { requireSession } from "@/app/lib/auth/session";
import { getCustomerOwnedOrderDetail } from "@/app/lib/orders/customerOrders";
import {
  customerEsimLifecycleIsPrimaryBadge,
  customerEsimLineReady,
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
    <div className="grid gap-1 border-b border-[var(--border)] py-3 last:border-b-0 sm:grid-cols-[168px_1fr] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
    case "Active":
      return "bg-[var(--accent-strong)]/18 text-[var(--heading)] border-[var(--accent-strong)]/45";
    case "Data Depleted":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Review needed":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Refunded":
    case "Failed":
    case "eSIM Expired":
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
  const showDataChip = detail.dataAllowance !== "Not available";
  const showValidityChip = detail.validity !== "Not available";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to My eSIMs
        </Link>

        <section className="mt-3 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/55 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start gap-3 sm:gap-4">
              {detail.flagUrl ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-sm sm:h-14 sm:w-14 sm:rounded-2xl">
                  <Image
                    src={detail.flagUrl}
                    alt=""
                    width={56}
                    height={42}
                    sizes="(max-width: 640px) 48px, 56px"
                    className="h-8 w-auto object-contain sm:h-9"
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
                    {detail.destination}
                  </h1>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${statusBadgeClass(detail.statusBadge)}`}
                  >
                    {customerEsimStatusLabel(detail.statusBadge)}
                  </span>
                  <AddDataPurchaseBadge
                    isAddDataPurchase={detail.isAddDataPurchase}
                  />
                </div>
                {!detail.isRefunded ? (
                  <div className="mt-2">
                    <EsimLifecycleBadges
                      lifecycle={
                        customerEsimLifecycleIsPrimaryBadge(detail.statusBadge)
                          ? null
                          : detail.lifecycle
                      }
                      remainingDataLabel={detail.remainingDataLabel}
                    />
                  </div>
                ) : null}
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Order {detail.shortReference}
                </p>
                <p className="mt-1.5 text-sm font-medium text-[var(--text)]">
                  {detail.planName}
                </p>
              </div>
              <p className="shrink-0 text-right text-base font-bold tabular-nums text-[var(--heading)] sm:text-lg">
                {detail.amountLabel}
              </p>
            </div>

            {(showDataChip || showValidityChip) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {showDataChip ? (
                  <span className="inline-flex items-center rounded-xl border border-[var(--accent-strong)]/30 bg-[var(--accent-strong)]/10 px-3 py-1.5 text-sm font-bold text-[var(--heading)]">
                    {detail.dataAllowance}
                  </span>
                ) : null}
                {showValidityChip ? (
                  <span className="inline-flex items-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--heading)]">
                    {detail.validity}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div className="px-4 py-3 sm:px-5">
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
              {customerEsimStatusHelp(detail.statusBadge)}
            </p>
          </div>
        </section>
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
            {detail.walletCreditedLabel ? (
              <div>
                <dt className="inline font-semibold">MAP Wallet credited: </dt>
                <dd className="inline">{detail.walletCreditedLabel}</dd>
              </div>
            ) : detail.refundAmountLabel ? (
              <div>
                <dt className="inline font-semibold">Refunded amount: </dt>
                <dd className="inline">{detail.refundAmountLabel}</dd>
              </div>
            ) : null}
            {detail.gatewayRefundLabel ? (
              <div>
                <dt className="inline font-semibold">Gateway refund: </dt>
                <dd className="inline">{detail.gatewayRefundLabel}</dd>
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

      <EsimOrderDetailCard
        orderId={detail.id}
        dataPlan={detail.planName}
        validityPeriod={detail.validity}
        amountPaid={detail.amountLabel}
        purchasedAt={detail.createdAtLabel}
        dataAllowance={detail.dataAllowance}
        orderStatusLabel={customerEsimStatusLabel(detail.statusBadge)}
        isRefunded={detail.isRefunded}
        refundedAtLabel={detail.refundedAtLabel}
        lifecycle={detail.lifecycle}
        usagePath={`/api/account/orders/${encodeURIComponent(detail.id)}/usage`}
        usageEligible={
          customerEsimLineReady(detail.statusBadge) && !detail.isRefunded
        }
        autoRefresh={autoOpenUsage}
        viewQrHref={
          detail.installEligible && !detail.isRefunded
            ? `#install`
            : null
        }
        enableShare
        shareUrl={`/account/orders/${encodeURIComponent(detail.id)}`}
        shareTitle={detail.planName}
        addDataHref={
          detail.addDataEligible
            ? `/account/orders/${encodeURIComponent(detail.id)}/add-data`
            : null
        }
        raiseIssueHref="/support"
        refundAction={
          canRequestRefund ? (
            <Link
              href="#refund-request"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              Refund
            </Link>
          ) : null
        }
      />

      <section
        className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
        aria-labelledby="plan-details-heading"
      >
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3 sm:px-5">
          <h2
            id="plan-details-heading"
            className="text-base font-bold text-[var(--heading)]"
          >
            Plan details
          </h2>
        </div>
        <dl className="px-4 sm:px-5">
          <DetailRow label="Destination" value={detail.destination} />
          <DetailRow label="Package / offer" value={detail.planName} />
          <DetailRow label="Data allowance" value={detail.dataAllowance} />
          <DetailRow label="Validity" value={detail.validity} />
          <DetailRow
            label="Status"
            value={customerEsimStatusLabel(detail.statusBadge)}
          />
          <DetailRow label="Amount" value={detail.amountLabel} />
          {detail.promoCode ? (
            <DetailRow label="Promo code" value={detail.promoCode} />
          ) : null}
          {detail.originalAmountLabel ? (
            <DetailRow label="Original" value={detail.originalAmountLabel} />
          ) : null}
          {detail.discountAmountLabel ? (
            <DetailRow
              label="Discount"
              value={`−${detail.discountAmountLabel}`}
            />
          ) : null}
          {detail.finalAmountLabel ? (
            <DetailRow label="Package total" value={detail.finalAmountLabel} />
          ) : null}
          {detail.rewardsAppliedPoints != null &&
          detail.rewardsAppliedPoints > 0 ? (
            <DetailRow
              label="Rewards applied"
              value={`−${detail.rewardsAppliedPoints} points`}
            />
          ) : null}
          {detail.rewardsEarnedPoints != null &&
          detail.rewardsEarnedPoints > 0 ? (
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
        </dl>
      </section>

      <section
        className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_22px_rgba(0,0,0,0.12)]"
        aria-labelledby="iccid-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-2.5 sm:px-5">
          <h2
            id="iccid-heading"
            className="text-sm font-bold text-[var(--heading)]"
          >
            ICCID
          </h2>
          <p className="text-xs text-[var(--text-soft)]">
            Full ICCID for this order. Copy when you need it.
          </p>
        </div>
        <div className="px-4 py-1.5 sm:px-5">
          <IccidRevealPanel
            orderId={detail.id}
            iccid={detail.iccid}
            unavailableLabel={detail.iccidMasked}
          />
        </div>
      </section>

      <section
        className="space-y-2.5 border-t border-[var(--border)] pt-6"
        aria-labelledby="install-section-heading"
      >
        <div>
          <h2
            id="install-section-heading"
            className="text-base font-bold text-[var(--heading)]"
          >
            Installation
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Open QR and install options when this eSIM is ready.
          </p>
        </div>
        <CustomerEsimInstallPanel
          orderId={detail.id}
          installEligible={detail.installEligible}
          isRefunded={detail.isRefunded}
        />
        <CustomerEsimInstallHelpLinks />
      </section>

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

      <div id="refund-request">
        <CustomerRefundRequestForm
          orderId={detail.id}
          canRequest={canRequestRefund}
          openStatusLabel={
            openRefund ? refundStatusLabel(openRefund.status) : null
          }
        />
      </div>
    </div>
  );
}
