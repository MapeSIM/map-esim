import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminCustomerDetail } from "@/app/lib/admin/customers";

export const dynamic = "force-dynamic";

const CUSTOMERS_UNAVAILABLE =
  "Customer data is temporarily unavailable. Please refresh shortly.";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminCustomerDetail>>;
  try {
    detail = await getAdminCustomerDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customers
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {CUSTOMERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to customers
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Customer detail
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only CUSTOMER profile. Password hashes, OAuth tokens, and
          installation secrets are never shown.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Local customer ID" value={detail.id} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Name" value={detail.name} />
        <DetailRow label="Email" value={detail.email} />
        <DetailRow label="Role" value={detail.roleLabel} />
        <DetailRow
          label="Email verification"
          value={detail.emailVerifiedLabel}
        />
        <DetailRow
          label="Verified at"
          value={detail.emailVerifiedAtLabel}
        />
        <DetailRow label="Account status" value={detail.accountStatusLabel} />
        <DetailRow label="Deleted at" value={detail.deletedAtLabel} />
        <DetailRow
          label="Authentication method"
          value={detail.authMethodLabel}
        />
        <DetailRow
          label="Google account linked"
          value={detail.googleLinkedLabel}
        />
        <DetailRow
          label="Credentials available"
          value={detail.credentialsAvailableLabel}
        />
        <DetailRow
          label="Legal consent"
          value={detail.legalConsentStatusLabel}
        />
        <DetailRow
          label="Terms accepted at"
          value={detail.termsAcceptedAtLabel}
        />
        <DetailRow label="Terms version" value={detail.termsVersionLabel} />
        <DetailRow
          label="Privacy acknowledged at"
          value={detail.privacyAcknowledgedAtLabel}
        />
        <DetailRow
          label="Privacy version"
          value={detail.privacyVersionLabel}
        />
        <DetailRow
          label="Consent source"
          value={detail.legalConsentSourceLabel}
        />
        <DetailRow
          label="Local order count"
          value={String(detail.localOrderCount)}
        />
        <DetailRow
          label="Completed local orders"
          value={String(detail.completedOrderCount)}
        />
        <DetailRow
          label="Claimed orders"
          value={String(detail.claimedOrderCount)}
        />
      </dl>

      {detail.localOrderCount > 0 ? (
        <p>
          <Link
            href={`/admin/orders?userId=${encodeURIComponent(detail.id)}`}
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            View linked local orders
          </Link>
        </p>
      ) : null}
    </div>
  );
}
