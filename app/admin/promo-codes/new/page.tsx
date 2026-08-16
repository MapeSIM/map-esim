import Link from "next/link";
import PromoCodeForm from "@/app/components/admin/PromoCodeForm";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminCreatePromoCodePage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/promo-codes"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Promo Codes
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Create Promo</h1>
      </div>
      <PromoCodeForm mode="create" />
    </div>
  );
}
