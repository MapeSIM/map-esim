/**
 * Offline QA: shared plan-card presentation path must never surface Fair Use /
 * packageInfo / verbose provider prose. Details stay in Plan details.
 * Does not call VeSIM or mutate orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCheckoutHref,
  formatValidityPhrase,
} from "../app/lib/plans/plan-utils";
import {
  isConciseOperatorLabel,
  isForbiddenPlanCardText,
  planCardOperatorLabel,
  planCardSecondaryLines,
  planCardSecondaryText,
  planDetailDescription,
  planDetailFairUseOrTerms,
  planDetailNetworkNames,
  planDetailNetworkTechnology,
  planDetailNotes,
  planDetailOperatorLabel,
} from "../app/lib/plans/planOfferPresentation";
import type { VesimOffer } from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

const PROD_PK_FUP =
  "1.0 GB • 1 Days - Fair use: after your full-speed data is used, speeds may be reduced to 512 Kbps.";

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
    priceFormatted: partial.priceFormatted || "$4.83",
    ...partial,
  };
}

/** Extract the plan-card <article> map block from PlansListing. */
function extractCardArticleSource(listing: string): string {
  const start = listing.indexOf("{group.plans.map((offer)");
  assert.ok(start >= 0, "card map block missing");
  const articleStart = listing.indexOf("<article", start);
  assert.ok(articleStart >= 0, "card <article> missing");
  const articleEnd = listing.indexOf("</article>", articleStart);
  assert.ok(articleEnd >= 0, "card </article> missing");
  return listing.slice(articleStart, articleEnd + "</article>".length);
}

function cardText(offer: VesimOffer, isRegionalOrGlobal = false): string {
  return planCardSecondaryText(offer, {
    isRegionalOrGlobal,
    formatValidity: formatValidityPhrase,
  });
}

function assertCardSafe(offer: VesimOffer, label: string) {
  const text = cardText(offer);
  assert.ok(
    !isForbiddenPlanCardText(text),
    `${label}: card secondary text is forbidden:\n${text}`
  );
  assert.doesNotMatch(
    text,
    /fair\s*use|512\s*Kbps|speed\s*reduc|throttl/i,
    `${label}: Fair Use/throttle leaked onto card`
  );
  assert.doesNotMatch(
    text,
    /^\s*[\d.]+\s*(MB|GB|TB)\s*[•·\-–]/im,
    `${label}: duplicated data/validity leaked onto card`
  );
  for (const line of planCardSecondaryLines(offer, {
    isRegionalOrGlobal: false,
    formatValidity: formatValidityPhrase,
  })) {
    if (line.kind === "operator") {
      assert.equal(isConciseOperatorLabel(line.text), true, label);
    }
    assert.equal(
      isForbiddenPlanCardText(line.text) && line.kind !== "validity",
      false,
      `${label}: forbidden ${line.kind} line: ${line.text}`
    );
  }
}

function main() {
  const listing = read("app/components/plans/PlansListing.tsx");
  const modal = read("app/components/plans/PlanDetailsModal.tsx");
  const helpers = read("app/lib/plans/planOfferPresentation.ts");
  const cardSource = extractCardArticleSource(listing);

  console.log("1) Card JSX path has a single secondary-text contract");
  assert.match(listing, /planCardSecondaryLines/);
  assert.match(cardSource, /secondaryLines\.map/);
  assert.match(cardSource, /offer\.dataFormatted/);
  assert.match(cardSource, /formatPrice\(offer\.priceUSD\)/);
  assert.match(cardSource, /resolveCheckoutHref|buildCheckoutHref/);
  assert.match(cardSource, /Plan Details|Coverage details/);
  assert.match(cardSource, /Buy Now/);
  // Old production bug: raw packageInfo || network under validity.
  assert.doesNotMatch(cardSource, /offer\.packageInfo/);
  assert.doesNotMatch(cardSource, /offer\.description/);
  assert.doesNotMatch(cardSource, /offer\.notes/);
  assert.doesNotMatch(cardSource, /offer\.network\b/);
  assert.doesNotMatch(cardSource, /packageInfo\s*\|\|/);
  assert.doesNotMatch(
    cardSource,
    /break-words text-\[var\(--text-soft\)\]/
  );
  assert.doesNotMatch(
    listing,
    /destination\.kind === "country"\s*&&\s*\n\s*\(offer\.packageInfo \|\| offer\.network\)/
  );
  assert.match(listing, /min-h-\[220px\]/);
  assert.match(listing, /mt-auto/);
  console.log("   ok");

  console.log("2) Production PK/AF FUP payloads never appear on card text");
  const pkFup = sampleOffer({
    id: "P8HM06KTX",
    dataFormatted: "1 GB",
    durationDays: 1,
    priceUSD: 5.5,
    network: PROD_PK_FUP,
    packageInfo: PROD_PK_FUP,
    description: PROD_PK_FUP,
    notes: "Pakistan 1GB/Day",
    networks: ["Jazz"],
    dataSpeeds: ["4G", "3G"],
  });
  // Simulate the exact old buggy card line production still shows.
  const oldBuggyCardLine = pkFup.packageInfo || pkFup.network || "";
  assert.equal(oldBuggyCardLine, PROD_PK_FUP);
  assert.equal(isForbiddenPlanCardText(oldBuggyCardLine), true);

  assert.equal(planCardOperatorLabel(pkFup), "Jazz");
  assertCardSafe(pkFup, "PK P8HM06KTX");
  assert.equal(cardText(pkFup), "Valid for 1 day\nJazz");
  assert.ok(planDetailFairUseOrTerms(pkFup)?.includes("Fair use"));

  const pkFup2 = sampleOffer({
    id: "PDU88A0E8",
    dataFormatted: "2 GB",
    durationDays: 1,
    network: PROD_PK_FUP.replace("1.0 GB", "2.0 GB"),
    packageInfo: PROD_PK_FUP.replace("1.0 GB", "2.0 GB"),
    description: PROD_PK_FUP.replace("1.0 GB", "2.0 GB"),
    notes: "Pakistan 2GB/Day",
    networks: ["Jazz"],
    dataSpeeds: ["4G", "3G"],
  });
  assertCardSafe(pkFup2, "PK PDU88A0E8");
  assert.equal(planCardOperatorLabel(pkFup2), "Jazz");

  const pkDup = sampleOffer({
    id: "P96CDAE48",
    dataFormatted: "102 MB",
    durationDays: 7,
    packageInfo: "102 MB • 7 Days",
    network: "102 MB • 7 Days",
    description: "102 MB • 7 Days",
    notes: "Pakistan 100MB 7Days",
    networks: ["Jazz"],
    dataSpeeds: ["4G", "3G"],
  });
  assertCardSafe(pkDup, "PK P96CDAE48");
  assert.equal(cardText(pkDup), "Valid for 7 days\nJazz");
  assert.doesNotMatch(cardText(pkDup), /102 MB/);

  const afFup = sampleOffer({
    id: "PDIRBQAQE",
    name: "Afghanistan 1GB/Day",
    dataFormatted: "1 GB",
    durationDays: 1,
    priceUSD: 4.83,
    network: PROD_PK_FUP,
    packageInfo: PROD_PK_FUP,
    description: PROD_PK_FUP,
    notes: "Afghanistan 1GB/Day",
    networks: ["Roshan"],
    dataSpeeds: ["3G"],
  });
  assertCardSafe(afFup, "AF PDIRBQAQE");
  assert.equal(cardText(afFup), "Valid for 1 day\nRoshan");
  assert.equal(planDetailOperatorLabel(afFup), "Roshan");
  assert.equal(planDetailNetworkTechnology(afFup), "3G");
  assert.ok(planDetailFairUseOrTerms(afFup)?.includes("Fair use"));
  assert.equal(planDetailDescription(afFup), null);
  assert.equal(planDetailNotes(afFup), "Afghanistan 1GB/Day");

  // No networks[] and polluted network → card shows validity only.
  const orphanFup = sampleOffer({
    id: "orphan-fup",
    dataFormatted: "3 GB",
    durationDays: 1,
    network: PROD_PK_FUP.replace("1.0 GB", "3.0 GB"),
    packageInfo: PROD_PK_FUP.replace("1.0 GB", "3.0 GB"),
    description: PROD_PK_FUP.replace("1.0 GB", "3.0 GB"),
  });
  assert.equal(planCardOperatorLabel(orphanFup), null);
  assert.equal(cardText(orphanFup), "Valid for 1 day");
  assertCardSafe(orphanFup, "orphan FUP");
  console.log("   ok");

  console.log("3) Plan details keeps Fair Use + omits missing/noise fields");
  assert.match(modal, /planDetailFairUseOrTerms/);
  assert.match(modal, /Fair use & speed terms/);
  assert.match(modal, /planDetailNetworkNames/);
  assert.match(modal, /Available networks/);
  const pkOperator = sampleOffer({
    id: "c9b922d6a687dc41955220eb30283c6e",
    dataFormatted: "502 MB",
    network: "Jazz (Mobilink) Pakistan",
    packageInfo: "",
    description: "502 MB • 1 Days",
    notes: "APN: plus",
    networks: ["Jazz (Mobilink) Pakistan", "APN: plus"],
  });
  assert.deepEqual(planDetailNetworkNames(pkOperator), [
    "Jazz (Mobilink) Pakistan",
  ]);
  assert.equal(planDetailNotes(pkOperator), null);
  assert.equal(isConciseOperatorLabel("APN: plus"), false);

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
  assertCardSafe(afSohbat, "AF Sohbat");
  assert.deepEqual(planDetailNetworkNames(afSohbat), ["Sohbat Mobile"]);
  console.log("   ok");

  console.log("4) Retail price / provider IDs / checkout targets unchanged");
  assert.equal(afFup.priceUSD, 4.83);
  assert.equal(afFup.id, "PDIRBQAQE");
  assert.equal(
    buildCheckoutHref(afFup, "AF"),
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

  console.log("5) Shared listing still covers country/regional/global");
  assert.match(listing, /isRegionalOrGlobal/);
  assert.match(listing, /Coverage details|Plan Details/);
  assert.match(
    listing,
    /resolveCheckoutHref\(\s*(offer|stickyOffer),\s*destination\.code\s*\)|buildCheckoutHref\(\s*offer,\s*destination\.code\s*\)/
  );
  // Coverage line still available via helper for regional/global.
  const regional = sampleOffer({
    id: "regional-1",
    dataFormatted: "5 GB",
    durationDays: 30,
    coveredCountriesCount: 12,
    networks: ["Orange"],
  });
  assert.equal(
    cardText(regional, true),
    "Valid for 30 days\n12 countries covered\nOrange"
  );
  assert.match(listing, /PlanDetailsModal/);
  console.log("   ok");

  console.log("PASS plan_card_presentation_qa");
}

main();
