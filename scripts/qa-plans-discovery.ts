/**
 * Offline QA: /plans destination discovery UX (priority chips + searchable combobox).
 * Must not default to Pakistan offers or invent missing destinations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLANS_PRIORITY_DESTINATION_CODES,
  filterPlansDiscoveryDestinations,
  selectPlansDiscoveryDestinations,
  selectPlansDiscoverySelectorOptions,
  selectPlansPriorityDestinations,
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
  assert.doesNotMatch(page, /country=PK|\/api\/vesim\/offers/);
  assert.doesNotMatch(discovery, /country=PK|buildCheckoutHref|\/api\/vesim\/offers/);
  assert.doesNotMatch(discovery, /<select[\s>]/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /selectPlansPriorityDestinations/);
  assert.match(pkg, /"qa:plans-discovery"/);
  console.log("   ok");

  console.log("2) Priority ordering + omit unavailable catalog entries");
  assert.deepEqual([...PLANS_PRIORITY_DESTINATION_CODES], [
    "PK",
    "SA",
    "AE",
    "IQ",
    "GB",
    "MY",
    "TR",
    "QA",
  ]);
  const sample: VesimDestination[] = [
    dest({
      code: "TR",
      name: "Turkey",
      slug: "turkey",
      kind: "country",
      isPopular: true,
    }),
    dest({
      code: "PK",
      name: "Pakistan",
      slug: "pakistan",
      kind: "country",
      isPopular: true,
      minPrice: 0.68,
    }),
    dest({
      code: "AE",
      name: "United Arab Emirates",
      slug: "united-arab-emirates",
      kind: "country",
      isPopular: true,
    }),
    dest({
      code: "US",
      name: "United States",
      slug: "united-states",
      kind: "country",
      isPopular: true,
    }),
    // Iraq intentionally missing from catalog.
    dest({
      code: "FR",
      name: "France",
      slug: "france",
      kind: "country",
      isPopular: false,
    }),
    dest({
      code: "global",
      name: "Global",
      slug: "global",
      kind: "global",
      minPrice: 12,
    }),
  ];
  const priority = selectPlansPriorityDestinations(sample);
  assert.deepEqual(
    priority.map((item) => item.code),
    ["PK", "AE", "TR"]
  );
  assert.equal(
    priority.some((item) => item.code === "IQ"),
    false
  );
  assert.equal(selectPlansPriorityDestinations([]).length, 0);

  const featured = selectPlansDiscoveryDestinations(sample, {
    excludeCodes: new Set(priority.map((item) => item.code)),
  });
  assert.deepEqual(
    featured.map((item) => item.code),
    ["US", "global"]
  );
  console.log("   ok");

  console.log("3) Search filtering + navigation affordances");
  assert.match(discovery, /Search destination/);
  assert.match(discovery, /No destination found/);
  assert.match(discovery, /role="combobox"/);
  assert.match(discovery, /role="listbox"/);
  assert.match(discovery, /max-h-60|max-h-\[/);
  assert.match(discovery, /overflow-x-auto/);
  assert.match(discovery, /Popular destinations/);
  assert.match(discovery, /Browse destinations|Browse all destinations/);
  assert.match(discovery, /plansDestinationHref|destinationPath|\/countries\//);
  assert.doesNotMatch(discovery, /Buy Now/);

  const options = selectPlansDiscoverySelectorOptions(sample);
  const filteredPk = filterPlansDiscoveryDestinations(options, "pak");
  assert.equal(filteredPk.length, 1);
  assert.equal(filteredPk[0]?.code, "PK");
  const filteredNone = filterPlansDiscoveryDestinations(options, "zzzz-nope");
  assert.equal(filteredNone.length, 0);
  const filteredCase = filterPlansDiscoveryDestinations(options, "uNiTeD aRaB");
  assert.equal(filteredCase[0]?.code, "AE");
  console.log("   ok");

  console.log("4) Country detail + SEO canonical preserved");
  assert.match(countryDetail, /fetchOffersForCountry/);
  assert.match(countryDetail, /PlansListing/);
  assert.match(layout, /absoluteCanonical\("\/plans"\)/);
  assert.match(helper, /Missing catalog entries are omitted/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=plans-discovery");
}

main();
