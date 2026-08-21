import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  customerPurchaseStatusMessage,
  resolveCustomerPurchaseStatusMessaging,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import { getReconciliationWalletPurchase } from "@/app/lib/esim/walletPurchaseRead";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AccountWalletBuyReviewNeededPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) notFound();

  const purchase = await getReconciliationWalletPurchase(user.id, purchaseId);
  if (!purchase) notFound();

  const kind = resolveCustomerPurchaseStatusMessaging(purchase.status);
  if (!kind) notFound();

  const copy = customerPurchaseStatusMessage(kind);
  const showReservedAmount = kind === "review_needed";

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{copy.body}</p>
      </div>

      {showReservedAmount ? (
        <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
          <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet amount reserved
            </dt>
            <dd className="text-sm font-semibold text-[var(--heading)]">
              {purchase.amountReservedLabel}
            </dd>
          </div>
        </dl>
      ) : null}

      <Link
        href="/account/wallet"
        className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
      >
        Back to wallet
      </Link>
    </div>
  );
}
