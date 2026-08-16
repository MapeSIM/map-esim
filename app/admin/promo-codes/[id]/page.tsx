import Link from "next/link";
import { notFound } from "next/navigation";
import PromoCodeForm from "@/app/components/admin/PromoCodeForm";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminPromoCode } from "@/app/lib/promo/promoAdmin";
import { setPromoCodeActiveAction } from "@/app/lib/promo/promoAdminActions";

export const dynamic = "force-dynamic";

export default async function AdminEditPromoCodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const promo = await getAdminPromoCode(id);
  if (!promo) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/promo-codes"
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            ← Promo Codes
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Edit Promo</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Historic purchases keep their original discount snapshot.
          </p>
        </div>
        <form action={setPromoCodeActiveAction}>
          <input type="hidden" name="promoId" value={promo.id} />
          <input
            type="hidden"
            name="isActive"
            value={promo.isActive ? "false" : "true"}
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-[12px] border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
          >
            {promo.isActive ? "Disable" : "Enable"}
          </button>
        </form>
      </div>
      <PromoCodeForm mode="edit" initial={promo} />
    </div>
  );
}
