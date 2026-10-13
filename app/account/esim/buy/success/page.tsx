import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { OrderFundingSource } from "@prisma/client";
import { requireRole } from "@/app/lib/auth/session";
import { getCompletedWalletPurchase } from "@/app/lib/esim/walletPurchaseRead";

export const dynamic = "force-dynamic";

const GOOGLE_REVIEW_HREF = "https://g.page/r/CTOQlYhu_e49EAI/review";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function successSubtitle(input: {
  fundingSource: OrderFundingSource;
  paymentProvider: "SIMPAISA" | "SAFEPAY" | null;
}): string {
  const mobile = input.paymentProvider === "SIMPAISA";
  if (input.fundingSource === OrderFundingSource.DIRECT_PAYMENT) {
    return mobile
      ? "Your mobile-paid eSIM package is ready."
      : "Your card-paid eSIM package is ready.";
  }
  if (input.fundingSource === OrderFundingSource.CUSTOMER_SPLIT) {
    return mobile
      ? "Your wallet + mobile payment eSIM package is ready."
      : "Your wallet + card eSIM package is ready.";
  }
  return "Your wallet-funded eSIM package is ready.";
}

export default async function AccountWalletBuySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    purchase?: string;
    price?: string;
    balance?: string;
    status?: string;
  }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) notFound();

  // Never trust client price/balance/status for success display.
  void query.price;
  void query.balance;
  void query.status;

  const purchase = await getCompletedWalletPurchase(user.id, purchaseId);
  if (!purchase) notFound();

  const subtitle = successSubtitle({
    fundingSource: purchase.fundingSource,
    paymentProvider: purchase.paymentProvider,
  });

  // Add Data: deep-link the parent eSIM with a one-shot live usage pull so the
  // data bar is not stuck on the pre-top-up depleted cache.
  const detailOrderId =
    purchase.addDataSourceOrderId ?? purchase.orderId;
  const detailHref = purchase.addDataSourceOrderId
    ? `/account/orders/${encodeURIComponent(detailOrderId)}?usage=1`
    : `/account/orders/${encodeURIComponent(detailOrderId)}`;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase completed</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Package
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.planName} · {purchase.dataAllowance}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Destination
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.destination}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Validity
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.validity}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total paid
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.amountChargedLabel}
          </dd>
        </div>
        {purchase.walletAppliedLabel ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet amount charged
            </dt>
            <dd className="text-sm font-semibold text-[var(--heading)]">
              {purchase.walletAppliedLabel}
            </dd>
          </div>
        ) : null}
        {purchase.gatewayPaidLabel ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {purchase.gatewayPaymentMethodLabel ?? "Card payment"}
            </dt>
            <dd className="text-sm font-semibold text-[var(--heading)]">
              {purchase.gatewayPaidLabel}
            </dd>
          </div>
        ) : null}
        {purchase.balanceLabel ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              New wallet balance
            </dt>
            <dd className="text-sm font-semibold text-[var(--heading)]">
              {purchase.balanceLabel}
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Local order reference
          </dt>
          <dd className="text-sm font-medium text-[var(--heading)] break-all">
            {purchase.orderId}
          </dd>
        </div>
      </dl>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 text-center sm:px-5"
        aria-labelledby="google-review-heading"
      >
        <div
          className="mb-3 flex items-center justify-center gap-1 text-[#FBBC04]"
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <Star
              key={index}
              className="h-5 w-5 fill-current"
              strokeWidth={0}
            />
          ))}
        </div>
        <p
          id="google-review-heading"
          className="text-sm font-medium text-[var(--heading)] sm:text-[15px]"
        >
          Happy with your MAP eSIM? Leave us a 5-star review on Google!
        </p>
        <a
          href={GOOGLE_REVIEW_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="
            mt-4 inline-flex h-11 w-full items-center justify-center gap-2
            rounded-[14px] bg-[#4285F4] px-5 text-sm font-semibold text-white
            shadow-[0_8px_20px_rgba(66,133,244,0.28)] transition
            hover:bg-[#3367D6] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-[#4285F4]/60
            focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]
            sm:w-auto
          "
        >
          <Star className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden="true" />
          Rate Us on Google
        </a>
      </section>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
        <Link
          href={detailHref}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          {purchase.addDataSourceOrderId
            ? "View eSIM details"
            : "View order details"}
        </Link>
        <Link
          href="/account/orders"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          My orders
        </Link>
        <Link
          href="/account/wallet"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          Back to wallet
        </Link>
      </div>
    </div>
  );
}
