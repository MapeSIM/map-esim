import Link from "next/link";
import { notFound } from "next/navigation";
import AddDataCheckoutBanner from "@/app/components/orders/AddDataCheckoutBanner";
import CustomerAddDataForm from "@/app/components/orders/CustomerAddDataForm";
import { requireSession } from "@/app/lib/auth/session";
import {
  isCustomerSourceOrderExpiredForAddData,
  resolveCustomerAddDataIccidLast4,
} from "@/app/lib/esim/addDataCheckout";
import { customerEsimLineReady } from "@/app/lib/orders/customerOrderDisplay";
import { getCustomerOwnedOrderDetail } from "@/app/lib/orders/customerOrders";

export const dynamic = "force-dynamic";

/**
 * Add More Data entry — starts the existing wallet credit checkout with
 * rechargeOrderId bound to this eSIM's VeSIM providerOrderId when active.
 * Expired source orders continue as a fresh eSIM purchase (no recharge bind).
 */
export default async function AccountOrderAddDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const user = await requireSession(
    `/account/orders/${encodeURIComponent(orderId)}/add-data`
  );

  let detail: Awaited<ReturnType<typeof getCustomerOwnedOrderDetail>>;
  try {
    detail = await getCustomerOwnedOrderDetail(user.id, orderId);
  } catch {
    detail = null;
  }

  if (!detail) {
    notFound();
  }

  const backHref = `/account/orders/${encodeURIComponent(detail.id)}`;
  const showError = query.error === "1";

  const sourceExpired = await isCustomerSourceOrderExpiredForAddData({
    customerUserId: user.id,
    localOrderId: detail.id,
  });
  const iccidLast4 = await resolveCustomerAddDataIccidLast4({
    customerUserId: user.id,
    localOrderId: detail.id,
  });

  const canContinueTopUp =
    !sourceExpired &&
    detail.addDataEligible &&
    Boolean(detail.offerId) &&
    Boolean(detail.rechargeOrderId);
  // Expired: allow a fresh eSIM purchase even when catalog supportTopUp is false.
  const canContinueExpiredFresh =
    sourceExpired &&
    !detail.isRefunded &&
    Boolean(detail.offerId) &&
    customerEsimLineReady(detail.statusBadge);
  const canContinue = canContinueTopUp || canContinueExpiredFresh;

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

      {canContinue ? (
        <AddDataCheckoutBanner
          variant={sourceExpired ? "expired" : "topup"}
          iccidLast4={iccidLast4}
        />
      ) : null}

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 sm:px-5"
        role="status"
      >
        {canContinue ? (
          <>
            <p className="text-sm font-semibold text-[var(--heading)]">
              Continue to checkout
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {sourceExpired
                ? "You will review pricing and pay with your existing wallet checkout. A new eSIM will be created."
                : "You will review pricing and pay with your existing wallet checkout. Data is added to this eSIM — a new eSIM is not created."}
            </p>
            {showError ? (
              <p
                className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
                role="alert"
              >
                Checkout could not be started for this eSIM. Please try again or
                contact support.
              </p>
            ) : null}
            <CustomerAddDataForm
              orderId={detail.id}
              buttonLabel={
                sourceExpired
                  ? "Continue — buy new eSIM"
                  : "Continue to checkout"
              }
            />
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
