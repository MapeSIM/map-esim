import Link from "next/link";
import { notFound } from "next/navigation";
import AdminWalletBuyConfirmForm from "@/app/components/admin/AdminWalletBuyConfirmForm";
import { getAdminWalletPurchaseReview } from "@/app/lib/esim/adminWalletPurchaseRead";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function parsePurchaseId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerWalletBuyReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    purchase?: string;
    price?: string;
    package?: string;
  }>;
}) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;
  const purchaseId = parsePurchaseId(query.purchase);
  if (!purchaseId) {
    notFound();
  }

  void query.price;
  void query.package;

  const review = await getAdminWalletPurchaseReview(admin.id, id, purchaseId);
  if (!review) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href={`/admin/customers/${encodeURIComponent(review.customerId)}/esim/wallet-buy`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to package selection
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Review wallet purchase
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Confirm customer, package, balance impact, and reason before debiting
          the wallet.
        </p>
      </div>

      {!review.canConfirm ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            This purchase is no longer ready for confirmation. Open the attempt
            status pages if reconciliation is required.
          </p>
        </div>
      ) : (
        <AdminWalletBuyConfirmForm review={review} />
      )}
    </div>
  );
}
