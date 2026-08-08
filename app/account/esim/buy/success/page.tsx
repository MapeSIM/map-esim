import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderFundingSource } from "@prisma/client";
import { requireRole } from "@/app/lib/auth/session";
import { getCompletedWalletPurchase } from "@/app/lib/esim/walletPurchaseRead";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
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

  const subtitle =
    purchase.fundingSource === OrderFundingSource.DIRECT_PAYMENT
      ? "Your card-paid eSIM package is ready."
      : purchase.fundingSource === OrderFundingSource.CUSTOMER_SPLIT
        ? "Your wallet + card eSIM package is ready."
        : "Your wallet-funded eSIM package is ready.";

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
              Card payment
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

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
        <Link
          href={`/account/orders/${encodeURIComponent(purchase.orderId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          View order details
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
