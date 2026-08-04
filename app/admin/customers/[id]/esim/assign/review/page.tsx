import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPackageAssignConfirmForm from "@/app/components/admin/AdminPackageAssignConfirmForm";
import { getAdminAssignmentReview } from "@/app/lib/esim/adminPackageAssignmentRead";
import { AdminPackageAssignmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Assignment data is temporarily unavailable. Please refresh shortly.";

function parseAssignmentId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerEsimAssignReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assignment?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const assignmentId = parseAssignmentId(query.assignment);
  if (!assignmentId) {
    notFound();
  }

  let review: Awaited<ReturnType<typeof getAdminAssignmentReview>>;
  try {
    review = await getAdminAssignmentReview(id, assignmentId);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(id)}/esim/assign`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to package selection
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

  if (!review) {
    notFound();
  }

  if (review.status === AdminPackageAssignmentStatus.COMPLETED) {
    notFound();
  }

  if (
    review.status === AdminPackageAssignmentStatus.PROVIDER_PENDING ||
    review.status === AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED
  ) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(review.customerId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Reconciliation required
        </h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            The provider result is uncertain. Do not submit again. Contact
            support for reconciliation.
          </p>
        </div>
      </div>
    );
  }

  if (review.status === AdminPackageAssignmentStatus.FAILED) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(review.customerId)}/esim/assign`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Start a new assignment
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Assignment failed
        </h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            The provider declined or could not complete this package assignment.
            You may start a new assignment if needed.
          </p>
        </div>
      </div>
    );
  }

  if (review.status !== AdminPackageAssignmentStatus.READY) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href={`/admin/customers/${encodeURIComponent(review.customerId)}/esim/assign`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to package selection
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Review assignment
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Confirm before the provider eSIM order is created.
        </p>
      </div>

      <AdminPackageAssignConfirmForm review={review} />
    </div>
  );
}
