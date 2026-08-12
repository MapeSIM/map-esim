/**
 * Offline QA: shared plan-card presentation hides verbose Fair Use / provider
 * prose; details stay in Plan details. Does not call VeSIM or mutate orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCheckoutHref } from "../app/lib/plans/plan-utils";
import {
  isConciseOperatorLabel,
  planCardOperatorLabel,
  planDetailDescription,
  planDetailFairUseOrTerms,
  planDetailNetworkNames,
  planDetailNetworkTechnology,
  planDetailNotes,
  planDetailOperatorLabel,
} from "../app/lib/plans/planOfferPresentation";
import type { VesimOffer } from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sampleOffer(partial: Partial<VesimOffer>): VesimOffer {
  return {
    id: partial.id || "offer-1",
    name: partial.name || "Sample",
    dataFormatted: partial.dataFormatted || "1 GB",
    durationDays: partial.durationDays ?? 7,
    priceUSD: partial.priceUSD ?? 4.83,
    ...partial,
  };
}

function main() {
  const listing = read("app/components/plans/PlansListing.tsx");
  const modal = read("app/components/plans/PlanDetailsModal.tsx");
  const helpers = read("app/lib/plans/planOfferPresentation.ts");

  console.log("1) Verbose Fair Use / packageInfo absent from shared cards");
  assert.match(listing, /planCardOperatorLabel/);
  assert.doesNotMatch(
    listing,
    /destination\.kind === "country"\s*&&\s*\n\s*\(offer\.packageInfo \|\| offer\.network\)/
  );
  assert.doesNotMatch(listing, /\{offer\.packageInfo \|\| offer\.network\}/);
  assert.doesNotMatch(listing, /offer\.description/);
  assert.doesNotMatch(listing, /offer\.notes/);
  assert.match(listing, /min-h-\[220px\]/);
  assert.match(listing, /mt-auto/);

  const afghanFup = sampleOffer({
    id: "PDIRBQAQE",
    name: "Afghanistan 1GB/Day",
    dataFormatted: "1 GB",
    durationDays: 1,
    priceUSD: 4.83,
    network:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    packageInfo:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    description:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    notes: "Afghanistan 1GB/Day",
    networks: ["Roshan"],
    dataSpeeds: ["3G"],
  });
  assert.equal(planCardOperatorLabel(afghanFup), "Roshan");
  assert.ok(
    !/fair\s*use/i.test(planCardOperatorLabel(afghanFup) || "")
  );

  // No concise network list → card must stay empty (no data/validity dump).
  const pkDupNoNetworks = sampleOffer({
    id: "P96CDAE48-empty-networks",
    dataFormatted: "102 MB",
    packageInfo: "102 MB • 7 Days",
    network: "102 MB • 7 Days",
    description: "102 MB • 7 Days",
    notes: "Pakistan 100MB 7Days",
  });
  assert.equal(planCardOperatorLabel(pkDupNoNetworks), null);

  // Live PK shape: polluted network/packageInfo, but networks[] has Jazz.
  const pkDupLive = sampleOffer({
    id: "P96CDAE48",
    dataFormatted: "102 MB",
    packageInfo: "102 MB • 7 Days",
    network: "102 MB • 7 Days",
    description: "102 MB • 7 Days",
    notes: "Pakistan 100MB 7Days",
    networks: ["Jazz"],
    dataSpeeds: ["4G", "3G"],
  });
  assert.equal(planCardOperatorLabel(pkDupLive), "Jazz");
  assert.equal(planDetailNetworkTechnology(pkDupLive), "4G · 3G");

  // Live PK FUP shape: Fair Use in packageInfo/network, operator from networks[].
  const pkFupLive = sampleOffer({
    id: "P8HM06KTX",
    dataFormatted: "1 GB",
    network:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    packageInfo:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    description:
      "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.",
    notes: "Pakistan 1GB/Day",
    networks: ["Jazz"],
    dataSpeeds: ["4G", "3G"],
  });
  assert.equal(planCardOperatorLabel(pkFupLive), "Jazz");
  assert.ok(
    !/fair\s*use/i.test(planCardOperatorLabel(pkFupLive) || "")
  );

  const pkOperator = sampleOffer({
    id: "c9b922d6a687dc41955220eb30283c6e",
    dataFormatted: "502 MB",
    network: "Jazz (Mobilink) Pakistan",
    packageInfo: "",
    description: "502 MB • 1 Days",
    notes: "APN: plus",
    networks: ["Jazz (Mobilink) Pakistan", "APN: plus"],
  });
  assert.equal(
    planCardOperatorLabel(pkOperator),
    "Jazz (Mobilink) Pakistan"
  );

  // Live AF Sohbat: keep concise operator; drop verbose network blurbs from chips.
  const afSohbat = sampleOffer({
    id: "sohbat-mobile-15days-2gb",
    dataFormatted: "2 GB",
    network: "Sohbat Mobile",
    networks: [
      "Sohbat Mobile",
      "LTE Data-only eSIM.",
      "Rechargeable online.",
      "Operates on the Roshan network in Afghanistan.",
    ],
    dataSpeeds: ["4G"],
    description: "2.0 GB • 15 Days",
    notes: "2 GB - 15 days",
  });
  assert.equal(planCardOperatorLabel(afSohbat), "Sohbat Mobile");
  assert.deepEqual(planDetailNetworkNames(afSohbat), ["Sohbat Mobile"]);
  assert.equal(planDetailNetworkTechnology(afSohbat), "4G");
  assert.equal(planDetailNotes(afSohbat), null);
  console.log("   ok");

  console.log("2) Plan details keeps Fair Use + omits missing/noise fields");
  assert.match(modal, /planDetailFairUseOrTerms/);
  assert.match(modal, /Fair use & speed terms/);
  assert.match(modal, /planDetailOperatorLabel/);
  assert.match(modal, /planDetailNetworkTechnology/);
  assert.equal(
    planDetailFairUseOrTerms(afghanFup)?.includes("Fair use"),
    true
  );
  assert.equal(planDetailOperatorLabel(afghanFup), "Roshan");
  assert.equal(planDetailNetworkTechnology(afghanFup), "3G");
  assert.equal(planDetailDescription(afghanFup), null);
  assert.equal(planDetailNotes(afghanFup), "Afghanistan 1GB/Day");
  assert.deepEqual(planDetailNetworkNames(pkOperator), [
    "Jazz (Mobilink) Pakistan",
  ]);
  assert.equal(planDetailNetworkTechnology(pkDupNoNetworks), null);
  assert.equal(
    planDetailFairUseOrTerms(pkFupLive)?.includes("Fair use"),
    true
  );
  assert.equal(planDetailDescription(pkFupLive), null);
  assert.equal(isConciseOperatorLabel("APN: plus"), false);
  assert.equal(planDetailNotes(pkOperator), null);
  console.log("   ok");

  console.log("3) Retail price / provider IDs / checkout targets unchanged");
  assert.equal(afghanFup.priceUSD, 4.83);
  assert.equal(afghanFup.id, "PDIRBQAQE");
  assert.equal(
    buildCheckoutHref(afghanFup, "AF"),
    "/account/esim/buy?offerId=PDIRBQAQE&country=AF"
  );
  assert.equal(
    buildCheckoutHref(pkOperator, "PK"),
    "/account/esim/buy?offerId=c9b922d6a687dc41955220eb30283c6e&country=PK"
  );
  assert.doesNotMatch(helpers, /providerPriceUSD/);
  assert.doesNotMatch(listing, /providerPriceUSD/);
  assert.doesNotMatch(modal, /providerPriceUSD/);
  console.log("   ok");

  console.log("4) Shared listing still covers country/regional/global");
  assert.match(listing, /isRegionalOrGlobal/);
  assert.match(listing, /Coverage details|Plan details/);
  assert.match(listing, /coveredCountriesCount/);
  assert.match(listing, /buildCheckoutHref\(offer, destination\.code\)/);
  assert.match(listing, /PlanDetailsModal/);
  console.log("   ok");

  console.log("PASS plan_card_presentation_qa");
}

main();
