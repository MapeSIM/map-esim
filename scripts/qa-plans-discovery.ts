/**
 * Offline QA: /plans is a neutral destination discovery page.
 * Must not default to Pakistan offers or invent provider plans.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  selectPlansDiscoveryDestinations,
  selectPlansDiscoverySelectorOptions,
} from "../app/lib/plans/plansDiscovery";
import type { VesimDestination } from "../app/lib/vesim/destinations";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function dest(
  partial: Partial<VesimDestination> &
    Pick<VesimDestination, "code" | "name" | "slug" | "kind">
): VesimDestination {
  return {
    isPopular: false,
    ...partial,
  };
}

function main() {
  const page = read("app/plans/page.tsx");
  const discovery = read("app/components/plans/PlansDiscovery.tsx");
  const helper = read("app/lib/plans/plansDiscovery.ts");
  const countryDetail = read("app/countries/[id]/page.tsx");
  const layout = read("app/plans/layout.tsx");
  const pkg = read("package.json");

  console.log("1) /plans does not default to Pakistan offers");
  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.doesNotMatch(page, /country=PK|country:\s*["']PK["']|,"PK"\)/);
  assert.doesNotMatch(discovery, /country=PK|buildCheckoutHref\([^,]+,\s*["']PK["']\)/);
  assert.doesNotMatch(page, /\/api\/vesim\/offers/);
  assert.doesNotMatch(discovery, /\/api\/vesim\/offers/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /selectPlansDiscoveryDestinations/);
  assert.match(pkg, /"qa:plans-discovery"/);
  console.log("   ok");

  console.log("2) Neutral featured set = popular countries + global only");
  assert.match(helper, /isPopular === true/);
  assert.match(helper, /kind === "global"/);
  const sample: VesimDestination[] = [
    dest({
      code: "PK",
      name: "Pakistan",
      slug: "pakistan",
      kind: "country",
      isPopular: true,
      minPrice: 0.68,
    }),
    dest({
      code: "US",
      name: "United States",
      slug: "united-states",
      kind: "country",
      isPopular: true,
      minPrice: 0.68,
    }),
    dest({
      code: "FR",
      name: "France",
      slug: "france",
      kind: "country",
      isPopular: false,
      minPrice: 1.1,
    }),
    dest({
      code: "region-asia",
      name: "Asia",
      slug: "asia",
      kind: "regional",
      minPrice: 5,
    }),
    dest({
      code: "global",
      name: "Global",
      slug: "global",
      kind: "global",
      minPrice: 12,
    }),
  ];
  const featured = selectPlansDiscoveryDestinations(sample);
  assert.deepEqual(
    featured.map((item) => item.code),
    ["PK", "US", "global"]
  );
  assert.equal(
    selectPlansDiscoveryDestinations([]).length,
    0
  );
  const options = selectPlansDiscoverySelectorOptions(sample);
  assert.ok(options.some((item) => item.code === "FR"));
  assert.ok(options.some((item) => item.kind === "regional"));
  console.log("   ok");

  console.log("3) Destination selector + destinations link; country detail unchanged");
  assert.match(discovery, /Browse destinations|Browse all destinations/);
  assert.match(discovery, /href=["']\/countries["']/);
  assert.match(discovery, /plans-destination|Choose a destination/);
  assert.match(discovery, /destinationPath|\/countries\//);
  assert.match(discovery, /View plans/);
  assert.doesNotMatch(discovery, /Buy Now/);
  assert.match(countryDetail, /fetchOffersForCountry/);
  assert.match(countryDetail, /PlansListing/);
  assert.match(layout, /absoluteCanonical\("\/plans"\)/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=plans-discovery");
}

main();
