import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import {
  getPartnerPortalSummary,
  requireActivePartnerActor,
} from "@/app/lib/partner/partnerAccess";
import { listPartnerCatalogOffers } from "@/app/lib/partner/partnerCatalogRead";
import PartnerStorefrontBuy from "@/app/components/partner/PartnerStorefrontBuy";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

export default async function PartnerStorefrontBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string; country?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const query = await searchParams;
  const offerId = normalizeOfferId(query.offerId);
  const country = sanitizeCountryHint(query.country);

  if (!actor) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  if (!offerId || !country) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Buy eSIM</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Choose a plan from the destination catalog.
        </p>
        <Link
          href="/countries"
          className="inline-flex h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)]"
        >
          Browse destinations
        </Link>
      </div>
    );
  }

  const [offers, summary] = await Promise.all([
    listPartnerCatalogOffers(country),
    getPartnerPortalSummary(user.id),
  ]);
  const offer = offers.find((row) => row.offerId === offerId) ?? null;

  if (!offer) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Buy eSIM</h1>
        <p className="text-sm text-[var(--text-muted)]">
          That plan is not available right now. Browse destinations and try
          again.
        </p>
        <Link
          href="/countries"
          className="inline-flex h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)]"
        >
          Browse destinations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Confirm purchase</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Retail price is shown. Your Partner discount is applied server-side.
        </p>
      </header>
      <PartnerStorefrontBuy
        offer={offer}
        destinationCode={country}
        balanceLabel={summary?.balanceLabel ?? "$0.00"}
      />
    </div>
  );
}
