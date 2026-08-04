import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPackageAssignSelectForm from "@/app/components/admin/AdminPackageAssignSelectForm";
import {
  getAdminAssignableCustomer,
  listAdminAssignmentDestinations,
} from "@/app/lib/esim/adminPackageAssignmentRead";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Assignment data is temporarily unavailable. Please refresh shortly.";

export default async function AdminCustomerEsimAssignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let customer: Awaited<ReturnType<typeof getAdminAssignableCustomer>>;
  let destinations: Awaited<ReturnType<typeof listAdminAssignmentDestinations>> =
    [];
  try {
    customer = await getAdminAssignableCustomer(id);
    if (customer?.accountActive) {
      destinations = await listAdminAssignmentDestinations();
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

  if (!customer.accountActive) {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(customer.id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Assign eSIM package
        </h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Packages cannot be assigned to deleted customer accounts.
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
          Assign eSIM package
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Company-funded assignment only. The customer wallet is not charged.
          Provider checkout happens only after final confirmation.
        </p>
      </div>

      <AdminPackageAssignSelectForm
        customerUserId={customer.id}
        customerName={customer.name}
        customerEmailMasked={customer.emailMasked}
        destinations={destinations}
      />
    </div>
  );
}
