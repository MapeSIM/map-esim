import Link from "next/link";
import { notFound } from "next/navigation";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import { requireRole } from "@/app/lib/auth/session";
import { hasActivePartnerEsimShareToken } from "@/app/lib/partner/partnerEsimShareToken";
import { getPartnerOwnedOrderDetail } from "@/app/lib/partner/partnerOrders";
import {
  latestOpenPartnerRefundSummary,
  listPartnerRefundRequestSummaries,
} from "@/app/lib/partner/partnerRefundRequest";

export const dynamic = "force-dynamic";

export default async function PartnerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireRole("PARTNER");

  let detail: Awaited<ReturnType<typeof getPartnerOwnedOrderDetail>>;
  try {
    detail = await getPartnerOwnedOrderDetail(user.id, orderId);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/partner/orders"
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

  const hasActiveToken = await hasActivePartnerEsimShareToken({
    partnerUserId: user.id,
    orderId: detail.orderId,
  });

  let refundRequest: {
    statusLabel: string;
    reasonLabel: string;
    createdAtLabel: string;
  } | null = null;
  try {
    const summaries = await listPartnerRefundRequestSummaries({
      partnerUserId: user.id,
      purchaseIds: [detail.purchaseId],
    });
    const open = latestOpenPartnerRefundSummary(summaries);
    if (open) {
      refundRequest = {
        statusLabel: open.statusLabel,
        reasonLabel: open.reasonLabel,
        createdAtLabel: open.createdAtLabel,
      };
    }
  } catch {
    refundRequest = null;
  }

  return (
    <div className="min-w-0 space-y-6">
      <Link
        href="/partner/orders"
        className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        ← Back to My eSIMs
      </Link>
      <PartnerEsimOrderCard
        row={{
          purchaseId: detail.purchaseId,
          orderId: detail.orderId,
          shortReference: detail.shortReference,
          destination: detail.destination,
          flagUrl: detail.flagUrl,
          planName: detail.planName,
          dataAllowance: detail.dataAllowance,
          validity: detail.validity,
          retailPriceLabel: detail.retailPriceLabel,
          partnerDebitLabel: detail.partnerDebitLabel,
          statusBadge: detail.statusBadge,
          purchasedAtLabel: detail.purchasedAtLabel,
          iccidMasked: detail.iccidMasked,
          iccidRevealable: detail.iccidRevealable,
          hasActiveShareToken: hasActiveToken,
        }}
        refundRequest={refundRequest}
      />
    </div>
  );
}
