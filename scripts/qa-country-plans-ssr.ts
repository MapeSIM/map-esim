/**
 * Offline QA: country detail pages must SSR public plan data for SEO/crawlers.
 * Does not call VeSIM or mutate data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const page = read("app/countries/[id]/page.tsx");
  const listing = read("app/components/plans/PlansListing.tsx");
  const layout = read("app/countries/[id]/layout.tsx");
  const offersApi = read("app/api/vesim/offers/route.ts");

  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /export default async function CountryDetailPage/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /fetchOffersForCountry/);
  assert.match(page, /toPublicVesimOffers/);
  assert.match(page, /loading=\{false\}/);
  assert.doesNotMatch(page, /fetch\(\s*["'`]\/api\/vesim\//);
  assert.doesNotMatch(page, /useEffect\s*\(/);
  assert.doesNotMatch(page, /useParams/);

  // Browser must not call VeSIM; public API remains server-side.
  assert.match(offersApi, /fetchOffersForCountry/);
  assert.match(offersApi, /toPublicVesimOffers/);
  assert.match(listing, /^["']use client["']/m);
  assert.match(listing, /useCurrency/);

  // Metadata / canonical stay on layout.
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(layout, /absoluteCanonical\(path\)|canonical:\s*path/);
  assert.match(layout, /resolveDestinationForSeo/);

  console.log("ALL_QA_PASSED=country-plans-ssr");
}

main();
