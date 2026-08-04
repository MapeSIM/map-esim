import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { getFailedRefundedWalletPurchase } from "@/app/lib/esim/walletPurchaseRead";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AccountWalletBuyFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) notFound();

  const purchase = await getFailedRefundedWalletPurchase(user.id, purchaseId);
  if (!purchase) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Purchase failed</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The provider could not complete this purchase. Your wallet amount was
          restored.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Amount restored
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.amountRestoredLabel}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Current wallet balance
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {purchase.balanceLabel}
          </dd>
        </div>
      </dl>

      <Link
        href="/account/esim/buy"
        className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
      >
        Choose another package
      </Link>
    </div>
  );
}
