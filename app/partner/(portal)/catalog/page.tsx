import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import {
  getPartnerBalanceLabel,
  getPartnerDiscountPercentLabel,
  requireActivePartnerActor,
} from "@/app/lib/partner/partnerAccess";
import { listPartnerCatalogDestinations } from "@/app/lib/partner/partnerCatalogRead";
import PartnerCatalogBuy from "@/app/components/partner/PartnerCatalogBuy";
import { isPartnerEsimSplitPaymentEnabled } from "@/app/lib/partner/partnerEsimSplitPaymentPolicy";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PORTAL_UNAVAILABLE =
  "Catalog is temporarily unavailable. Please refresh shortly.";

/**
 * Partner catalog: destination → customer-style plan cards → wallet/checkout buy.
 * Initial render loads destinations only (fast). Plans load per destination.
 */
export default async function PartnerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; offerId?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const query = await searchParams;
  const initialCountry = sanitizeCountryHint(query.country) || null;
  const initialOfferId = normalizeOfferId(query.offerId) || null;

  if (!actor) {
    return (
      <div
        className="rounded-2xl border border-white/[0.08] bg-[#0D1526] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-slate-100">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  let destinations: Awaited<
    ReturnType<typeof listPartnerCatalogDestinations>
  > = [];
  let balanceLabel = "$0.00";
  let balanceCents = 0;
  let discountPercentLabel = "0";
  let loadError = false;
  let enabledSimpaisaOperatorIds: string[] = [];

  try {
    const [dest, balance, discountLabel, wallet, simpaisaOperators] =
      await Promise.all([
        listPartnerCatalogDestinations(),
        getPartnerBalanceLabel(user.id),
        getPartnerDiscountPercentLabel(user.id),
        prisma.partnerWalletAccount.findUnique({
          where: { partnerId: actor.partnerId },
          select: { balanceCents: true },
        }),
        getSimpaisaWalletOperatorConfig(),
      ]);
    destinations = dest;
    balanceLabel = balance ?? "$0.00";
    balanceCents = wallet?.balanceCents ?? 0;
    discountPercentLabel = discountLabel ?? "0";
    enabledSimpaisaOperatorIds = [...simpaisaOperators.enabledOperatorIds];
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div
        className="rounded-2xl border border-white/[0.08] bg-[#0D1526] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-slate-100">{PORTAL_UNAVAILABLE}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Catalog
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Browse destinations, review retail rates, and buy with your Partner
            discount applied at checkout.
          </p>
        </div>
        <a
          href="/api/partner/catalog/csv"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download All Plans CSV
        </a>
      </header>

      <PartnerCatalogBuy
        destinations={destinations}
        balanceLabel={balanceLabel}
        balanceCents={balanceCents}
        discountPercentLabel={discountPercentLabel}
        initialCountry={initialCountry}
        initialOfferId={initialOfferId}
        splitPaymentEnabled={isPartnerEsimSplitPaymentEnabled()}
        paymentGatewayConfigured={isPaymentGatewayConfigured()}
        enabledSimpaisaOperatorIds={enabledSimpaisaOperatorIds}
      />
    </div>
  );
}
