import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminPromoCodes } from "@/app/lib/promo/promoAdmin";
import { setPromoCodeActiveAction } from "@/app/lib/promo/promoAdminActions";

export const dynamic = "force-dynamic";

export default async function AdminPromoCodesPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listAdminPromoCodes>>;
  try {
    rows = await listAdminPromoCodes();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
        <p className="text-sm text-[var(--heading)]" role="status">
          Promo codes are temporarily unavailable. Please refresh shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Customer checkout discounts. Partner purchases cannot use promo
            codes.
          </p>
        </div>
        <Link
          href="/admin/promo-codes/new"
          className="inline-flex h-10 items-center rounded-[12px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
        >
          Create Promo
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No promo codes yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <th className="py-2 pr-3 font-semibold">Code</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Discount</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Start</th>
                <th className="py-2 pr-3 font-semibold">End</th>
                <th className="py-2 pr-3 font-semibold">Uses</th>
                <th className="py-2 pr-3 font-semibold">Usage limit</th>
                <th className="py-2 pr-3 font-semibold">Minimum order</th>
                <th className="py-2 pr-3 font-semibold">Applicability</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]">
                  <td className="py-3 pr-3 font-semibold text-[var(--heading)]">
                    {row.code}
                  </td>
                  <td className="py-3 pr-3">{row.typeLabel}</td>
                  <td className="py-3 pr-3">{row.discountLabel}</td>
                  <td className="py-3 pr-3">{row.statusLabel}</td>
                  <td className="py-3 pr-3 whitespace-nowrap">{row.startsAtLabel}</td>
                  <td className="py-3 pr-3 whitespace-nowrap">{row.endsAtLabel}</td>
                  <td className="py-3 pr-3">{row.usesLabel}</td>
                  <td className="py-3 pr-3">{row.usageLimitLabel}</td>
                  <td className="py-3 pr-3">{row.minimumOrderLabel}</td>
                  <td className="py-3 pr-3">{row.applicabilityLabel}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/promo-codes/${row.id}`}
                        className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                      >
                        Edit
                      </Link>
                      <form action={setPromoCodeActiveAction}>
                        <input type="hidden" name="promoId" value={row.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={row.isActive ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                        >
                          {row.isActive ? "Disable" : "Enable"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
