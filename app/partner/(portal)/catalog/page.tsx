import { requireRole } from "@/app/lib/auth/session";
import {
  getPartnerPortalSummary,
  requireActivePartnerActor,
} from "@/app/lib/partner/partnerAccess";
import { listPartnerCatalogDestinations } from "@/app/lib/partner/partnerCatalogRead";
import PartnerCatalogBuy from "@/app/components/partner/PartnerCatalogBuy";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Catalog is temporarily unavailable. Please refresh shortly.";

export default async function PartnerCatalogPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);

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

  let destinations: Awaited<
    ReturnType<typeof listPartnerCatalogDestinations>
  > = [];
  let balanceLabel = "$0.00";
  let loadError = false;

  try {
    const [dest, summary] = await Promise.all([
      listPartnerCatalogDestinations(),
      getPartnerPortalSummary(user.id),
    ]);
    destinations = dest;
    balanceLabel = summary?.balanceLabel ?? "$0.00";
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Browse MAP eSIM plans at retail catalog prices and purchase with your
          Partner balance.
        </p>
      </header>

      <PartnerCatalogBuy
        destinations={destinations}
        balanceLabel={balanceLabel}
      />
    </div>
  );
}
