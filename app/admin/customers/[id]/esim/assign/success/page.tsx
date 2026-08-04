import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminCompletedAssignment } from "@/app/lib/esim/adminPackageAssignmentRead";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function parseAssignmentId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export default async function AdminCustomerEsimAssignSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    assignment?: string;
    price?: string;
    status?: string;
    package?: string;
  }>;
}) {
  await requireRole("ADMIN");

  const { id } = await params;
  const query = await searchParams;
  const assignmentId = parseAssignmentId(query.assignment);
  if (!assignmentId) {
    notFound();
  }

  // Ignore any client-supplied package/price/status query values entirely.
  void query.price;
  void query.status;
  void query.package;

  const assignment = await getAdminCompletedAssignment(id, assignmentId);
  if (!assignment) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Assignment completed
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The company-funded eSIM package was assigned successfully.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)] break-words">
            {assignment.customerName} · {assignment.customerEmailMasked}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Package
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {assignment.planName} · {assignment.dataAllowance}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Destination
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {assignment.destination}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Validity
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {assignment.validity}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Local order reference
          </dt>
          <dd className="text-sm font-medium text-[var(--heading)] break-all">
            {assignment.orderId}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Funding
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            {assignment.fundingLabel}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer wallet
          </dt>
          <dd className="text-sm font-semibold text-[var(--heading)]">
            Unchanged · {assignment.walletUnchangedLabel}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/orders/${encodeURIComponent(assignment.orderId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
        >
          View local order
        </Link>
        <Link
          href={`/admin/customers/${encodeURIComponent(assignment.customerId)}`}
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          Back to customer detail
        </Link>
      </div>
    </div>
  );
}
