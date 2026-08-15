import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerDiscountPanel } from "@/app/components/admin/PartnerDiscountPanel";
import { PartnerStatusPanel } from "@/app/components/admin/PartnerStatusPanel";
import { PartnerWalletPanel } from "@/app/components/admin/PartnerWalletPanel";
import { getPartnerDetail } from "@/app/lib/partner/partners";

export const dynamic = "force-dynamic";

const PARTNERS_UNAVAILABLE =
  "Partner data is temporarily unavailable. Please refresh shortly.";

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

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getPartnerDetail>>;
  try {
    detail = await getPartnerDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/partners"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to partners
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {PARTNERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  const walletActive =
    detail.statusLabel !== "Disabled" && detail.statusLabel !== "Deleted";
  const discountDisabled =
    detail.statusLabel === "Disabled" || detail.statusLabel === "Deleted";

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <div>
        <Link
          href="/admin/partners"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to partners
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Partner detail
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          PARTNER profile, discount, and prepaid wallet. Purchase flows arrive
          in Phase 2.
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Partner ID" value={detail.id} />
        <DetailRow label="User ID" value={detail.userId} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Name" value={detail.name} />
        <DetailRow label="Email" value={detail.email} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow label="Discount" value={detail.discountPercentLabel} />
        <DetailRow
          label="Credentials set"
          value={detail.credentialsAvailableLabel}
        />
        <DetailRow label="Disabled at" value={detail.disabledAtLabel} />
        <DetailRow label="Deleted at" value={detail.deletedAtLabel} />
      </dl>

      <PartnerDiscountPanel
        partnerId={detail.id}
        discountBps={detail.discountBps}
        discountVersion={detail.discountVersion}
        disabled={discountDisabled}
      />

      {detail.statusLabel === "Active" || detail.statusLabel === "Invited" ? (
        <PartnerStatusPanel
          partnerId={detail.id}
          statusVersion={detail.statusVersion}
          mode="disable"
        />
      ) : null}
      {detail.statusLabel === "Disabled" ? (
        <PartnerStatusPanel
          partnerId={detail.id}
          statusVersion={detail.statusVersion}
          mode="reactivate"
        />
      ) : null}

      <PartnerWalletPanel
        partnerId={detail.id}
        partnerName={detail.name}
        balanceCents={detail.balanceCents}
        balanceLabel={detail.balanceLabel}
        totalAddedLabel={detail.totalAddedLabel}
        totalDeductedLabel={detail.totalDeductedLabel}
        walletActive={walletActive}
        transactions={detail.transactions}
      />
    </div>
  );
}
