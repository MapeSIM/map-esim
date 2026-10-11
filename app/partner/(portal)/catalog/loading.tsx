import CountriesListingSkeleton from "@/app/components/countries/CountriesListingSkeleton";

/** Catalog redirects to /countries — show destinations skeleton during navigation. */
export default function PartnerCatalogLoading() {
  return <CountriesListingSkeleton />;
}
