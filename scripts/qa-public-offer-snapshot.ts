/**
 * Offline QA: public catalog snapshot policy, flag paths, and source contracts.
 * Does not call VeSIM, mutate Production data, or place orders.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isUnlimitedOffer } from "../app/lib/plans/plan-utils";
import { detectDataUnlimited, type VesimOffer } from "../app/lib/vesim/offers";
import {
  collectAllOfferPagePayloads,
  isUsableOffersPage,
  isUsablePublicOffersPage,
} from "../app/lib/vesim/offersPagination";
import {
  PUBLIC_OFFER_PENDING_CONFIRMATIONS,
  PUBLIC_OFFER_PENDING_WINDOW_MS,
  PublicOfferSnapshotError,
  decidePublicOfferSnapshotWrite,
  isValidPublicOfferSnapshot,
  normalizePublicSnapshotOffers,
  pickSubsetConsistentHighWater,
  publicOfferIds,
} from "../app/lib/vesim/publicOfferSnapshot";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readHead(rel: string): string {
  return execSync(`git show "HEAD:${rel}"`, {
    encoding: "utf8",
    cwd: root,
  });
}

function offer(id: string, unlimited = false, priceUSD = 1): VesimOffer {
  return {
    id,
    offerId: id,
    name: id,
    dataFormatted: unlimited ? "Unlimited" : "1 GB",
    dataUnlimited: unlimited,
    priceFormatted: `$${priceUSD.toFixed(2)}`,
    priceUSD,
    durationDays: 7,
  };
}

function list(prefix: string, count: number, unlimited = 0): VesimOffer[] {
  return Array.from({ length: count }, (_, index) =>
    offer(
      `${prefix}-${index + 1}`,
      index >= count - unlimited
    )
  );
}

function currentView(offers: VesimOffer[]) {
  const normalized = normalizePublicSnapshotOffers(offers);
  assert.ok(normalized);
  return {
    offerIds: normalized.offerIds,
    idFingerprint: normalized.idFingerprint,
    pendingIdFingerprint: null as string | null,
    pendingConfirmCount: 0,
    pendingFirstSeenAt: null as Date | null,
  };
}

async function main() {
  const asia33 = list("asia", 33, 3);
  const asia24 = asia33.slice(0, 24);
  const pk15 = list("pk", 15, 3);
  const other24 = list("other", 24);

  assert.equal(asia33.filter(isUnlimitedOffer).length, 3);
  assert.equal(pk15.filter(isUnlimitedOffer).length, 3);
  assert.equal(detectDataUnlimited({ dataUnlimited: true }), true);
  assert.equal(detectDataUnlimited({ dataGB: 5, dataUnlimited: true }), false);

  console.log("1) HTTP / success:false / malformed / incomplete are not usable");
  assert.equal(isUsablePublicOffersPage(false, { success: true, offers: [{}] }), false);
  assert.equal(isUsablePublicOffersPage(true, { success: false, offers: [{}] }), false);
  assert.equal(isUsablePublicOffersPage(true, { offers: [{}] }), false);
  assert.equal(isUsablePublicOffersPage(true, "nope"), false);
  assert.equal(
    isUsablePublicOffersPage(true, { success: true, offers: [{}] }),
    true
  );
  assert.equal(isUsableOffersPage(true, { offers: [{}] }), true);

  const incomplete = await collectAllOfferPagePayloads(
    async (page) => {
      if (page === 1) {
        return {
          httpOk: true,
          payload: {
            success: true,
            totalPages: 2,
            offers: [{ id: "ONLY1" }],
          },
        };
      }
      return { httpOk: false, payload: {} };
    },
    { isPageUsable: isUsablePublicOffersPage }
  );
  assert.equal(incomplete.ok, false);

  const missingSuccess = await collectAllOfferPagePayloads(
    async () => ({
      httpOk: true,
      payload: { offers: [{ id: "X" }] },
    }),
    { isPageUsable: isUsablePublicOffersPage }
  );
  assert.equal(missingSuccess.ok, false);

  const emptyDecision = decidePublicOfferSnapshotWrite({
    current: null,
    candidate: [],
  });
  assert.equal(emptyDecision.action, "touch");
  assert.equal(emptyDecision.reason, "empty");
  console.log("   ok");

  console.log("2) Dedupe before fingerprint; empty/invalid never accept");
  const duped = normalizePublicSnapshotOffers([
    offer("pk-1", false, 9),
    offer("pk-1", false, 1),
    offer("pk-2"),
  ]);
  assert.ok(duped);
  assert.equal(duped.offerCount, 2);
  assert.equal(duped.offers[0].priceUSD, 9);
  assert.equal(isValidPublicOfferSnapshot([]), false);
  assert.equal(
    decidePublicOfferSnapshotWrite({ current: currentView(pk15), candidate: [] })
      .action,
    "touch"
  );
  console.log("   ok");

  console.log("3) Same IDs update details; superset accepts; subset/incomparable pending");
  const priced = pk15.map((item, index) =>
    index === 0 ? { ...item, priceUSD: 99 } : item
  );
  const sameIds = decidePublicOfferSnapshotWrite({
    current: currentView(pk15),
    candidate: priced,
  });
  assert.equal(sameIds.action, "accept");
  if (sameIds.action !== "accept") throw new Error("unreachable");
  assert.equal(sameIds.reason, "same_ids");

  const superset = decidePublicOfferSnapshotWrite({
    current: currentView(asia24),
    candidate: asia33,
  });
  assert.equal(superset.action, "accept");
  if (superset.action !== "accept") throw new Error("unreachable");
  assert.equal(superset.reason, "superset");

  const subset = decidePublicOfferSnapshotWrite({
    current: currentView(asia33),
    candidate: asia24,
  });
  assert.equal(subset.action, "pending");
  if (subset.action !== "pending") throw new Error("unreachable");
  assert.equal(subset.reason, "subset");
  assert.equal(subset.reset, true);

  const incomparable = decidePublicOfferSnapshotWrite({
    current: currentView(asia24),
    candidate: other24,
  });
  assert.equal(incomparable.action, "pending");
  if (incomparable.action !== "pending") throw new Error("unreachable");
  assert.equal(incomparable.reason, "incomparable");
  console.log("   ok");

  console.log("4) Pending confirms only after 3 matches over 30 minutes");
  assert.equal(PUBLIC_OFFER_PENDING_CONFIRMATIONS, 3);
  assert.equal(PUBLIC_OFFER_PENDING_WINDOW_MS, 30 * 60 * 1000);
  const t0 = new Date("2026-08-20T00:00:00.000Z");
  const pendingView = {
    ...currentView(asia33),
    pendingIdFingerprint: normalizePublicSnapshotOffers(asia24)?.idFingerprint ?? null,
    pendingConfirmCount: 2,
    pendingFirstSeenAt: t0,
  };
  const tooSoon = decidePublicOfferSnapshotWrite({
    current: pendingView,
    candidate: asia24,
    now: new Date(t0.getTime() + 10 * 60 * 1000),
  });
  assert.equal(tooSoon.action, "pending");
  const confirmed = decidePublicOfferSnapshotWrite({
    current: pendingView,
    candidate: asia24,
    now: new Date(t0.getTime() + PUBLIC_OFFER_PENDING_WINDOW_MS),
  });
  assert.equal(confirmed.action, "accept");
  if (confirmed.action !== "accept") throw new Error("unreachable");
  assert.equal(confirmed.reason, "confirmed_pending");
  console.log("   ok");

  console.log("5) High-water seed picker skips incomparable families");
  const highWater = pickSubsetConsistentHighWater([asia24, asia33, asia24]);
  assert.equal(highWater.ok, true);
  if (!highWater.ok) throw new Error("unreachable");
  assert.equal(publicOfferIds(highWater.offers).length, 33);
  const skipped = pickSubsetConsistentHighWater([asia24, other24]);
  assert.equal(skipped.ok, false);
  console.log("   ok");

  console.log("6) Nested destination catalog cannot overwrite country snapshots");
  const server = read("app/lib/vesim/server.ts");
  const store = read("app/lib/vesim/publicOfferSnapshotStore.ts");
  const refresh = read("app/lib/vesim/publicOfferSnapshotRefresh.ts");
  const policy = read("app/lib/vesim/publicOfferSnapshot.ts");
  const enrichFn =
    server.match(
      /export async function enrichDestinationsWithOfferRetailMins\([\s\S]*?\nexport /
    )?.[0] ?? "";
  assert.match(enrichFn, /return destinations/);
  assert.doesNotMatch(enrichFn, /fetchPublicOffersForCountry/);
  const catalogFn =
    server.match(
      /async function loadPublicDestinationCatalog\([\s\S]*?\nexport /
    )?.[0] ?? "";
  assert.match(catalogFn, /fetchDestinations\(token\)/);
  assert.doesNotMatch(catalogFn, /fetchPublicOffersForCountry/);
  assert.doesNotMatch(catalogFn, /enrichDestinationsWithOfferRetailMins/);
  assert.match(server, /public-destination-catalog-v3/);
  assert.match(server, /public-country-offers-v4-strict/);
  assert.match(server, /unstable_cache/);
  assert.match(server, /PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS/);
  assert.doesNotMatch(server, /public-country-offers-v3/);
  assert.doesNotMatch(server, /lastGoodByCountry/);
  assert.doesNotMatch(server, /PublicOfferKeepStaleError/);
  assert.doesNotMatch(policy, /lastGoodByCountry/);
  assert.doesNotMatch(policy, /PublicOfferKeepStaleError/);
  assert.doesNotMatch(policy, /createPublicOfferSnapshotStore/);
  assert.match(server, /loadPublicOffersForCountry/);
  assert.match(refresh, /publicReadsOn/);
  assert.match(store, /pg_advisory_xact_lock\(774202/);
  console.log("   ok");

  console.log("7) HTML and public API use the same offer loader");
  const offersApi = read("app/api/vesim/offers/route.ts");
  const countryPage = readHead("app/countries/[id]/page.tsx");
  assert.match(countryPage, /fetchPublicOffersForCountry/);
  assert.match(offersApi, /fetchPublicOffersForCountry/);
  assert.doesNotMatch(offersApi, /fetchOffersForCountry\(/);
  assert.match(
    server,
    /country pages \+ `\/api\/vesim\/offers`/i
  );
  assert.match(refresh, /Never cold-inserts from the request path/);
  console.log("   ok");

  console.log("8) Standard/Unlimited classification unchanged");
  assert.match(read("app/lib/plans/plan-utils.ts"), /offer\.dataUnlimited === true/);
  assert.match(
    read("app/lib/vesim/offers.ts"),
    /Genuine unlimited detection only/
  );
  const mixed = [...pk15];
  assert.equal(mixed.filter(isUnlimitedOffer).length, 3);
  assert.equal(mixed.length - mixed.filter(isUnlimitedOffer).length, 12);
  console.log("   ok");

  console.log("9) Checkout/admin live fetching remains unchanged");
  assert.match(
    server,
    /export async function verifyOfferAuthoritative[\s\S]*fetchOffersForCountry\(/
  );
  assert.doesNotMatch(
    server,
    /verifyOfferAuthoritative[\s\S]*fetchPublicOffersForCountry/
  );
  assert.match(
    server,
    /Purchase\/checkout\/admin validation must keep using this path/
  );
  assert.match(read("app/lib/esim/adminPackageAssignmentRead.ts"), /fetchOffersForCountry/);
  assert.match(read("app/lib/partner/partnerCatalogRead.ts"), /fetchOffersForCountry/);
  console.log("   ok");

  console.log("10) No silent successful empty catalog; seed never flips reads");
  assert.match(offersApi, /offers\.length === 0/);
  assert.match(offersApi, /success:\s*false/);
  assert.match(offersApi, /PublicOfferSnapshotError/);
  assert.match(server, /throw new PublicOfferSnapshotError\("empty"\)/);
  const seed = read("scripts/seed-public-offer-snapshots.ts");
  const control = read("scripts/control-public-offer-snapshots.ts");
  assert.match(seed, /never sets publicReadsOn/i);
  assert.match(seed, /SEED PUBLIC OFFER SNAPSHOTS/);
  assert.match(seed, /55441/);
  assert.doesNotMatch(seed, /publicOfferSnapshotControl\.(update|updateMany)/);
  assert.match(control, /ENABLE PUBLIC OFFER SNAPSHOTS/);
  assert.match(control, /DISABLE PUBLIC OFFER SNAPSHOTS/);
  assert.match(refresh, /AbortSignal|controller\.abort/);
  assert.match(refresh, /last-good|return stored/);
  assert.match(policy, /storedSnapshotIntegrityMatches/);
  assert.equal(
    new PublicOfferSnapshotError("missing").code,
    "missing"
  );
  console.log("   ok");

  console.log("ALL_QA_PASSED=public-offer-snapshot");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
