import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import PartnerEsimShareControls from "@/app/components/partner/PartnerEsimShareControls";
import { requireRole } from "@/app/lib/auth/session";
import { hasActivePartnerEsimShareToken } from "@/app/lib/partner/partnerEsimShareToken";
import { getPartnerOwnedOrderDetail } from "@/app/lib/partner/partnerOrders";
import type { PartnerOrderStatusBadge } from "@/app/lib/partner/partnerOrdersDisplay";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-[var(--heading)]">
        {value}
      </dd>
    </div>
  );
}

function statusBadgeClass(status: PartnerOrderStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Under review":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Failed — balance returned":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

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

  const [hasActiveToken, brandingResult] = await Promise.all([
    hasActivePartnerEsimShareToken({
      partnerUserId: user.id,
      orderId: detail.orderId,
    }),
    getPartnerShareBranding(user.id),
  ]);
  const companyName = brandingResult.ok
    ? brandingResult.branding.companyName
    : null;

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <Link
          href="/partner/orders"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to My eSIMs
        </Link>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
          {detail.flagUrl ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
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
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {detail.destination}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Order {detail.shortReference}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(detail.statusBadge)}`}
          >
            {detail.statusBadge}
          </span>
        </div>
      </div>

      <section
        className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 sm:px-5"
        aria-labelledby="partner-order-details"
      >
        <h2 id="partner-order-details" className="sr-only">
          Order details
        </h2>
        <dl>
          <DetailRow label="Plan" value={detail.planName} />
          <DetailRow label="Data" value={detail.dataAllowance} />
          <DetailRow label="Validity" value={detail.validity} />
          <DetailRow label="Purchased" value={detail.purchasedAtLabel} />
          <DetailRow label="Status" value={detail.statusBadge} />
          <DetailRow label="MAP retail price" value={detail.retailPriceLabel} />
          <DetailRow label="Partner debit" value={detail.partnerDebitLabel} />
          <IccidRevealPanel
            orderId={detail.orderId}
            maskedLabel={detail.iccidMasked}
            revealable={detail.iccidRevealable}
            revealPath={`/api/partner/orders/${encodeURIComponent(detail.orderId)}/iccid`}
          />
        </dl>
      </section>

      {detail.statusBadge === "Completed" ? (
        <PartnerEsimShareControls
          orderId={detail.orderId}
          hasActiveToken={hasActiveToken}
          companyName={companyName}
        />
      ) : null}

      <section className="min-w-0 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-muted)]">
        <p className="font-medium text-[var(--heading)]">Installation</p>
        <p className="mt-2">
          Use the full ICCID above with your device&apos;s eSIM install flow when
          ready. Secure QR and one-tap install for Partners will follow in a later
          phase.
        </p>
      </section>
    </div>
  );
}
