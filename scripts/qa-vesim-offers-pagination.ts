/**
 * Offline QA: VeSIM offers pagination completeness.
 * Does not call VeSIM, mutate data, or place orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VESIM_OFFERS_MAX_PAGES,
  VESIM_OFFERS_PAGE_LIMIT,
  buildVesimOffersQuery,
  collectAllOfferPagePayloads,
  isUsableOffersPage,
  mergeOfferPageItems,
  readOffersTotalPages,
  resolveOffersFetchPlan,
} from "../app/lib/vesim/offersPagination";
import {
  normalizeOffer,
  normalizeOffers,
} from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function pagePayload(opts: {
  page: number;
  totalPages: number;
  offers: Array<Record<string, unknown>>;
  success?: boolean;
}) {
  return {
    success: opts.success ?? true,
    count: opts.offers.length,
    total: opts.offers.length,
    page: opts.page,
    totalPages: opts.totalPages,
    offers: opts.offers,
  };
}

async function main() {
  // ── Pure query / plan helpers ───────────────────────────────────────────
  assert.equal(VESIM_OFFERS_PAGE_LIMIT, 1024);

  const qCountry = buildVesimOffersQuery("SA", 1);
  assert.equal(qCountry.get("country"), "SA");
  assert.equal(qCountry.get("page"), "1");
  assert.equal(qCountry.get("limit"), "1024");
  assert.equal(qCountry.get("fullCatalog"), null);
  assert.doesNotMatch(qCountry.toString(), /fullCatalog/);

  const qPk = buildVesimOffersQuery("PK", 1);
  assert.equal(qPk.get("country"), "PK");
  assert.equal(qPk.get("limit"), "1024");
  assert.equal(qPk.get("fullCatalog"), null);

  const qRegion = buildVesimOffersQuery("region-asia", 2);
  assert.equal(qRegion.get("country"), "region-asia");
  assert.equal(qRegion.get("page"), "2");
  assert.equal(qRegion.get("limit"), "1024");
  assert.equal(qRegion.get("fullCatalog"), null);

  const qGlobal = buildVesimOffersQuery("global", 1);
  assert.equal(qGlobal.get("country"), "global");
  assert.equal(qGlobal.get("limit"), "1024");
  assert.equal(qGlobal.get("fullCatalog"), null);

  assert.equal(readOffersTotalPages({ totalPages: 3 }), 3);
  assert.equal(readOffersTotalPages({ totalPages: "2" }), 2);
  assert.equal(readOffersTotalPages({ offers: [] }), null);

  assert.deepEqual(resolveOffersFetchPlan({ totalPages: 1 }), {
    pagesToFetch: 1,
    exceedsSafetyCap: false,
  });
  assert.deepEqual(resolveOffersFetchPlan({ offers: [] }), {
    pagesToFetch: 1,
    exceedsSafetyCap: false,
  });
  assert.deepEqual(
    resolveOffersFetchPlan({ totalPages: VESIM_OFFERS_MAX_PAGES + 1 }),
    {
      pagesToFetch: VESIM_OFFERS_MAX_PAGES,
      exceedsSafetyCap: true,
    }
  );

  assert.equal(isUsableOffersPage(true, { success: true, offers: [] }), true);
  assert.equal(isUsableOffersPage(true, { offers: [] }), true);
  assert.equal(isUsableOffersPage(false, { success: true, offers: [] }), false);
  assert.equal(
    isUsableOffersPage(true, { success: false, offers: [{ id: "x" }] }),
    false
  );

  // ── 1. One-page response ────────────────────────────────────────────────
  const onePageCalls: number[] = [];
  const onePage = await collectAllOfferPagePayloads(async (page) => {
    onePageCalls.push(page);
    return {
      httpOk: true,
      payload: pagePayload({
        page: 1,
        totalPages: 1,
        offers: [
          { id: "A1", name: "A1", dataMB: 500, priceUSD: 1 },
          { id: "A2", name: "A2", dataMB: 1024, priceUSD: 2 },
        ],
      }),
    };
  });
  assert.equal(onePage.ok, true);
  if (!onePage.ok) throw new Error("unreachable");
  assert.deepEqual(onePageCalls, [1]);
  const oneIds = mergeOfferPageItems(onePage.payloads)
    .map((raw) => normalizeOffer(raw)?.id)
    .filter(Boolean);
  assert.deepEqual(oneIds, ["A1", "A2"]);
  console.log("PASS one_page_response");

  // ── 2–4. Multi-page combines; page 2+ kept; totalPages respected ────────
  const multiCalls: number[] = [];
  const multi = await collectAllOfferPagePayloads(async (page) => {
    multiCalls.push(page);
    if (page === 1) {
      return {
        httpOk: true,
        payload: pagePayload({
          page: 1,
          totalPages: 3,
          offers: [
            { id: "P1", name: "P1", dataMB: 100, priceUSD: 1 },
            { id: "P2", name: "P2", dataMB: 200, priceUSD: 2 },
          ],
        }),
      };
    }
    if (page === 2) {
      return {
        httpOk: true,
        payload: pagePayload({
          page: 2,
          totalPages: 3,
          offers: [{ id: "P3", name: "P3", dataMB: 300, priceUSD: 3 }],
        }),
      };
    }
    return {
      httpOk: true,
      payload: pagePayload({
        page: 3,
        totalPages: 3,
        offers: [{ id: "P4", name: "P4", dataUnlimited: true, priceUSD: 4 }],
      }),
    };
  });
  assert.equal(multi.ok, true);
  if (!multi.ok) throw new Error("unreachable");
  assert.deepEqual(multiCalls, [1, 2, 3]);
  const flattened = mergeOfferPageItems(multi.payloads);
  const viaNormalizeOffers = normalizeOffers({ offers: flattened });
  const viaPerItem = flattened
    .map((raw) => normalizeOffer(raw))
    .filter((offer): offer is NonNullable<typeof offer> => offer !== null);
  assert.deepEqual(
    viaNormalizeOffers,
    viaPerItem,
    "paginate+normalizeOffers must match pre-existing per-item normalizeOffer"
  );
  const multiIds = viaNormalizeOffers.map((o) => o.id);
  assert.deepEqual(multiIds, ["P1", "P2", "P3", "P4"]);
  assert.ok(multiIds.includes("P3"), "page 2 offers must not be lost");
  assert.ok(multiIds.includes("P4"), "page 3 offers must not be lost");
  // Provider page order preserved (no sort/dedupe).
  assert.equal(multiIds.join(","), "P1,P2,P3,P4");
  console.log("PASS multi_page_combines_totalPages");

  // ── 5. No duplicate page fetch / infinite loop; missing totalPages ──────
  const missingTpCalls: number[] = [];
  const missingTp = await collectAllOfferPagePayloads(async (page) => {
    missingTpCalls.push(page);
    // Deliberately omit totalPages — must not invent page 2+.
    return {
      httpOk: true,
      payload: {
        success: true,
        count: 1,
        page: 1,
        offers: [{ id: "SOLO", name: "Solo", dataMB: 512, priceUSD: 1 }],
      },
    };
  });
  assert.equal(missingTp.ok, true);
  assert.deepEqual(missingTpCalls, [1]);

  const failedLater = await collectAllOfferPagePayloads(async (page) => {
    if (page === 1) {
      return {
        httpOk: true,
        payload: pagePayload({
          page: 1,
          totalPages: 2,
          offers: [{ id: "ONLY1", name: "Only1", dataMB: 1, priceUSD: 1 }],
        }),
      };
    }
    return { httpOk: false, payload: {} };
  });
  assert.equal(failedLater.ok, false, "failed later page must not yield partial ok");

  const overCap = await collectAllOfferPagePayloads(async () => ({
    httpOk: true,
    payload: pagePayload({
      page: 1,
      totalPages: VESIM_OFFERS_MAX_PAGES + 5,
      offers: [{ id: "X", name: "X", dataMB: 1, priceUSD: 1 }],
    }),
  }));
  assert.equal(overCap.ok, false, "safety cap must fail closed");
  console.log("PASS no_infinite_loop_fail_closed");

  // ── 6–8. Wiring: public cache wraps complete fetch; checkout stays live ─
  const server = read("app/lib/vesim/server.ts");
  const pagination = read("app/lib/vesim/offersPagination.ts");
  const countryPage = read("app/countries/[id]/page.tsx");
  const offersApi = read("app/api/vesim/offers/route.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignmentRead.ts");

  assert.match(pagination, /VESIM_OFFERS_PAGE_LIMIT\s*=\s*1024/);
  assert.match(pagination, /buildVesimOffersQuery/);
  assert.match(pagination, /collectAllOfferPagePayloads/);
  // Never request the raw provider catalog dump for filtered browsing.
  assert.doesNotMatch(pagination, /params\.set\(\s*["']fullCatalog["']/);
  assert.doesNotMatch(pagination, /[?&]fullCatalog=/);
  assert.doesNotMatch(server, /params\.set\(\s*["']fullCatalog["']/);
  assert.doesNotMatch(server, /[?&]fullCatalog=/);

  assert.match(server, /collectAllOfferPagePayloads/);
  assert.match(server, /buildVesimOffersQuery/);
  assert.match(server, /mergeOfferPageItems/);
  assert.match(
    server,
    /normalizeOffers\(\s*\{\s*offers:\s*allRawOffers\s*\}\s*\)/
  );
  assert.match(server, /cache:\s*["']no-store["']/);
  assert.match(server, /public-country-offers-v2/);
  assert.match(server, /public-destination-catalog-offer-mins-v2/);
  assert.match(
    server,
    /PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS\s*=\s*300/
  );
  assert.match(
    server,
    /const PUBLIC_OFFERS_REVALIDATE_SECONDS\s*=\s*PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS/
  );
  assert.match(
    server,
    /const loadCachedPublicOffersForCountry = unstable_cache\(\s*async \(country: string\) => fetchOffersForCountry\(country\)/
  );
  assert.match(
    server,
    /export async function verifyOfferAuthoritative[\s\S]*fetchOffersForCountry\(/
  );
  assert.doesNotMatch(
    server,
    /verifyOfferAuthoritative[\s\S]*fetchPublicOffersForCountry/
  );

  assert.match(countryPage, /fetchPublicOffersForCountry/);
  assert.match(offersApi, /fetchPublicOffersForCountry/);
  assert.match(adminAssign, /fetchOffersForCountry/);

  // Destination semantics preserved for country / regional / global.
  assert.match(server, /sanitizeCountryHint/);
  assert.match(
    read("app/lib/vesim/server.ts"),
    /region-\[a-z0-9-\]\+\|global/
  );
  console.log("PASS public_cache_and_live_checkout_wiring");

  console.log("ALL_QA_PASSED=vesim-offers-pagination");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
