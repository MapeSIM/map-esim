/**
 * Offline QA: country detail pages must SSR public plan data for SEO/crawlers.
 * Does not call VeSIM or mutate data.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readHead(rel: string): string {
  return execSync(`git show "HEAD:${rel}"`, { encoding: "utf8", cwd: root });
}

function main() {
  const page = readHead("app/countries/[id]/page.tsx");
  const listing = read("app/components/plans/PlansListing.tsx");
  const layout = read("app/countries/[id]/layout.tsx");
  const offersApi = read("app/api/vesim/offers/route.ts");

  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /export default async function CountryDetailPage/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /fetchPublicOffersForCountry/);
  assert.match(page, /toPublicVesimOffers/);
  assert.match(page, /loading=\{false\}/);
  assert.doesNotMatch(page, /fetch\(\s*["'`]\/api\/vesim\//);
  assert.doesNotMatch(page, /useEffect\s*\(/);
  assert.doesNotMatch(page, /useParams/);

  // Browser must not call VeSIM; public API remains server-side browsing snapshot.
  assert.match(offersApi, /fetchPublicOffersForCountry/);
  assert.match(offersApi, /toPublicVesimOffers/);
  assert.doesNotMatch(offersApi, /fetchOffersForCountry\(/);
  assert.match(listing, /^["']use client["']/m);
  assert.match(listing, /useCurrency/);

  // Purchase validation must stay on the live no-store offer fetch.
  const server = read("app/lib/vesim/server.ts");
  assert.match(server, /export async function fetchPublicOffersForCountry/);
  assert.match(server, /loadPublicOffersForCountry/);
  assert.match(server, /public-country-offers-v4-strict/);
  assert.doesNotMatch(server, /public-country-offers-v3/);
  assert.match(server, /collectAllOfferPagePayloads|buildVesimOffersQuery/);
  assert.doesNotMatch(server, /params\.set\(\s*["']fullCatalog["']/);
  assert.doesNotMatch(server, /[?&]fullCatalog=/);
  assert.match(
    server,
    /export async function verifyOfferAuthoritative[\s\S]*fetchOffersForCountry\(/
  );
  assert.match(
    server,
    /cache:\s*["']no-store["']/
  );

  // Metadata / canonical stay on layout.
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(layout, /absoluteCanonical\(path\)|canonical:\s*path/);
  assert.match(layout, /resolveDestinationForSeo/);

  console.log("ALL_QA_PASSED=country-plans-ssr");
}

main();
