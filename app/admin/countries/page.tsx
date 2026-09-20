import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminAssignmentDestinations } from "@/app/lib/esim/adminPackageAssignmentRead";
import AdminCountriesDirectory from "@/app/components/admin/AdminCountriesDirectory";

export const dynamic = "force-dynamic";

/**
 * Admin catalog browse for package Copy Link (customer buy deep links).
 * Does not create purchases or change checkout/payment logic.
 */
export default async function AdminCountriesPage() {
  await requireRole("ADMIN");

  let destinations: Awaited<
    ReturnType<typeof listAdminAssignmentDestinations>
  > = [];
  let loadError = false;
  try {
    destinations = await listAdminAssignmentDestinations();
  } catch {
    destinations = [];
    loadError = true;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Countries</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Browse destinations and copy customer package checkout links. Opening
          a link does not create a purchase — the customer still completes
          checkout after sign-in.
        </p>
      </header>

      {loadError ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Destinations are temporarily unavailable. Please try again shortly.
          </p>
        </div>
      ) : destinations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No destinations available right now.
        </div>
      ) : (
        <AdminCountriesDirectory destinations={destinations} />
      )}

      <p className="text-sm text-[var(--text-muted)]">
        Customer-specific assign / wallet-buy flows remain under{" "}
        <Link
          href="/admin/customers"
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Customers
        </Link>
        .
      </p>
    </div>
  );
}
