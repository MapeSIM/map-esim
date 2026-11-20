import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { listPartnerApiOffers } from "@/app/lib/partnerApi/partnerApiCatalog";
import PartnerCatalogClient from "@/app/components/partner/PartnerCatalogClient";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function PartnerCatalogPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return (
      <p className="text-sm text-slate-300">Partner access is unavailable.</p>
    );
  }

  let loadError: string | null = null;
  let offers: Awaited<ReturnType<typeof listPartnerApiOffers>>["offers"] = [];

  try {
    const profile = await prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { discountBps: true },
    });
    const discountBps = profile?.discountBps ?? 0;

    // Snapshot-only: no live VeSIM fan-out (that previously hung this page).
    const result = await listPartnerApiOffers({
      discountBps,
      page: 1,
      limit: 5000,
      fullCatalog: true,
      snapshotOnly: true,
    });
    offers = result.offers;
  } catch {
    loadError =
      "Catalog is temporarily unavailable. You can still download CSV when the service recovers, or refresh this page.";
    offers = [];
  }

  return <PartnerCatalogClient offers={offers} loadError={loadError} />;
}
