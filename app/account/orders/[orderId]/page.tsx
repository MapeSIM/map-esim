import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerOrderDetailView from "@/app/components/orders/CustomerOrderDetailView";
import { requireSession } from "@/app/lib/auth/session";
import { getCustomerOwnedOrderDetail } from "@/app/lib/orders/customerOrders";
import { customerEsimStatusLabel } from "@/app/lib/orders/customerOrderDisplay";
import { listCustomerRefundRequestsForOrder } from "@/app/lib/refunds/refundRequest";
import {
  isOpenRefundStatus,
  refundReasonLabel,
  refundStatusLabel,
} from "@/app/lib/refunds/refundRequestConstants";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const dynamic = "force-dynamic";

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
      <div className="mx-auto w-full max-w-lg space-y-6">
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

  const refundRequestsSlot =
    refundRequests.length > 0 ? (
      <section className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
        <h2 className="text-sm font-bold text-white">Refund request status</h2>
        <ul className="mt-2 space-y-2 text-sm text-white/75">
          {refundRequests.map((row) => (
            <li key={row.id}>
              <p className="font-semibold text-white">
                {refundStatusLabel(row.status)}
              </p>
              <p className="mt-0.5">
                {refundReasonLabel(row.reason)} ·{" "}
                {formatUsdCents(row.refundAmountCents)} USD
              </p>
              {row.status === "REJECTED" && row.adminDecisionNote ? (
                <p className="mt-0.5 text-white/55">
                  Decision note: {row.adminDecisionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <CustomerOrderDetailView
      orderId={detail.id}
      shortReference={detail.shortReference}
      planName={detail.planName}
      dataAllowance={detail.dataAllowance}
      validity={detail.validity}
      amountLabel={detail.amountLabel}
      createdAtLabel={detail.createdAtLabel}
      statusBadge={detail.statusBadge}
      orderStatusLabel={customerEsimStatusLabel(detail.statusBadge)}
      isRefunded={detail.isRefunded}
      refundedAtLabel={detail.refundedAtLabel}
      lifecycle={detail.lifecycle}
      installEligible={detail.installEligible}
      addDataEligible={detail.addDataEligible}
      iccid={detail.iccid}
      iccidMasked={detail.iccidMasked}
      canRequestRefund={canRequestRefund}
      openRefundStatusLabel={
        openRefund ? refundStatusLabel(openRefund.status) : null
      }
      autoRefreshUsage={autoOpenUsage}
      refundJustRequested={refundJustRequested}
      refundRequestsSlot={refundRequestsSlot}
      rewardsEarnedLabel={
        detail.rewardsEarnedPoints != null && detail.rewardsEarnedPoints > 0
          ? `+${detail.rewardsEarnedPoints} points`
          : null
      }
      rewardsAppliedLabel={
        detail.rewardsAppliedPoints != null && detail.rewardsAppliedPoints > 0
          ? `−${detail.rewardsAppliedPoints} points`
          : null
      }
    />
  );
}
