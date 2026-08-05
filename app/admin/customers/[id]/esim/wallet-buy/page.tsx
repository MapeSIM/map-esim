import Link from "next/link";
import { notFound } from "next/navigation";
import AdminWalletBuySelectForm from "@/app/components/admin/AdminWalletBuySelectForm";
import {
  getAdminWalletBuyCustomer,
  listAdminWalletBuyDestinations,
} from "@/app/lib/esim/adminWalletPurchaseRead";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Assisted wallet purchase data is temporarily unavailable. Please refresh shortly.";

export default async function AdminCustomerWalletBuyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  let customer: Awaited<ReturnType<typeof getAdminWalletBuyCustomer>>;
  let destinations: Awaited<ReturnType<typeof listAdminWalletBuyDestinations>> =
    [];
  try {
    customer = await getAdminWalletBuyCustomer(id);
    if (customer?.canPurchase) {
      destinations = await listAdminWalletBuyDestinations();
    }
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!customer) {
    notFound();
  }

  if (!customer.canPurchase) {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(customer.id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Buy eSIM with wallet
        </h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {customer.blockedReason ||
              "This customer cannot receive an assisted wallet purchase."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href={`/admin/customers/${encodeURIComponent(customer.id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to customer
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Buy eSIM with wallet
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Debits the selected customer wallet. Separate from company-funded
          assignment. Provider checkout happens only after final confirmation.
        </p>
      </div>

      <AdminWalletBuySelectForm
        customerUserId={customer.id}
        customerName={customer.name}
        customerEmailMasked={customer.emailMasked}
        accountStatusLabel="Active"
        balanceLabel={customer.balanceLabel}
        destinations={destinations}
      />
    </div>
  );
}
