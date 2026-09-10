import Link from "next/link";
import { notFound } from "next/navigation";
import PartnerAddDataForm from "@/app/components/partner/PartnerAddDataForm";
import { requireRole } from "@/app/lib/auth/session";
import { getPartnerOwnedOrderDetail } from "@/app/lib/partner/partnerOrders";

export const dynamic = "force-dynamic";

/**
 * Partner Add More Data review — charges Partner wallet via the existing
 * discount buy pipeline. Browser sends local orderId only.
 */
export default async function PartnerOrderAddDataPage({
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
    detail = null;
  }

  if (!detail) {
    notFound();
  }

  const backHref = `/partner/orders/${encodeURIComponent(detail.orderId)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to eSIM details
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Add More Data</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {detail.destination} · Ref {detail.shortReference}
        </p>
      </div>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 sm:px-5"
        role="status"
      >
        {detail.addDataEligible ? (
          <>
            <p className="text-sm font-semibold text-[var(--heading)]">
              Top up this eSIM
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Same package will be charged from your Partner balance using your
              Partner discount. Data is added to this eSIM — a new eSIM is not
              created.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Plan:{" "}
              <span className="font-semibold text-[var(--heading)]">
                {detail.planName}
              </span>
              {" · "}
              Retail{" "}
              <span className="font-semibold tabular-nums text-[var(--heading)]">
                {detail.retailPriceLabel}
              </span>
            </p>
            <div className="mt-4">
              <PartnerAddDataForm orderId={detail.orderId} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--heading)]">
              Add More Data is not available for this eSIM
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              This package does not currently support adding more data, or the
              eSIM is not ready for top-up.
            </p>
          </>
        )}
        <Link
          href={backHref}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)]"
        >
          Return to details
        </Link>
      </section>
    </div>
  );
}
