import Link from "next/link";
import { notFound } from "next/navigation";
import SandboxDestinationBuyClient from "@/app/components/sandbox/SandboxDestinationBuyClient";
import { countries as staticCountries } from "@/app/data/countries";
import {
  findDestinationBySlug,
  retailMinFromProviderStartingPrice,
  slugifyDestination,
  toPublicPlanDestination,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { toPublicVesimOffers, type VesimOffer } from "@/app/lib/vesim/offers";
import {
  fetchPublicDestinationCatalog,
  fetchCachedPublicOffersForCountry as fetchPublicOffersForCountry,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function staticFallback(): VesimDestination[] {
  return staticCountries.map((item) => {
    const retail = retailMinFromProviderStartingPrice(item.startingPrice);
    return {
      code: item.code,
      name: item.name,
      flag: item.flag,
      regions: item.region ? [item.region] : [],
      offerCount: item.plans,
      minPrice: retail.minPrice,
      minPriceFormatted: retail.minPriceFormatted,
      isPopular: item.region === "Popular",
      isRegional: false,
      isGlobal: false,
      searchAliases: [item.id, item.code, item.name],
      slug: item.id || slugifyDestination(item.name),
      kind: "country" as const,
    };
  });
}

export default async function SandboxCatalogDestinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let destinations: VesimDestination[] = [];
  try {
    destinations = await fetchPublicDestinationCatalog();
  } catch {
    destinations = staticFallback();
  }
  if (destinations.length === 0) destinations = staticFallback();

  const matched = findDestinationBySlug(destinations, slug);
  if (!matched) notFound();

  let offers: VesimOffer[] = [];
  try {
    const raw = await fetchPublicOffersForCountry(matched.code);
    offers = toPublicVesimOffers(raw);
  } catch {
    offers = [];
  }

  const dest = toPublicPlanDestination(matched);

  return (
    <div className="space-y-6">
      <Link
        href="/sandbox/catalog"
        className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
      >
        ← Back to destinations
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-slate-50">
          {dest.flag ? `${dest.flag} ` : ""}
          {dest.name}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Select a plan and purchase with your Partner wallet.
        </p>
      </header>
      <SandboxDestinationBuyClient
        destinationName={dest.name}
        region={(dest.regions && dest.regions[0]) || dest.name}
        offers={offers.slice(0, 24).map((o) => ({
          offerId: o.offerId || o.id,
          name: o.name || o.dataFormatted || "Plan",
          priceLabel: o.priceFormatted || "—",
          priceCents: Math.round((o.priceUSD ?? o.price ?? 0) * 100),
        }))}
      />
    </div>
  );
}
