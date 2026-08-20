/**
 * Isolated PostgreSQL 17 tests for durable public offer snapshots.
 * Cluster: 127.0.0.1:55441 only. Never 5432, 55440, or Production.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { VesimOffer } from "../app/lib/vesim/offers";
import {
  PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS,
  PUBLIC_OFFER_PENDING_WINDOW_MS,
  PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE,
  PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
  PUBLIC_OFFER_SNAPSHOT_STALE_MS,
  PublicOfferSnapshotError,
  normalizePublicSnapshotOffers,
} from "../app/lib/vesim/publicOfferSnapshot";
import {
  disablePublicOfferSnapshotReads,
  enablePublicOfferSnapshotReads,
  recordSeedExpectedCounts,
} from "../app/lib/vesim/publicOfferSnapshotControl";
import {
  assertApprovedSnapshotTarget,
  assertIsolatedLocalApplyTarget,
} from "../app/lib/vesim/publicOfferSnapshotGuard";
import {
  createBoundedPublicOfferTtlCache,
  loadPublicOffersForCountry,
} from "../app/lib/vesim/publicOfferSnapshotRefresh";
import { seedPublicOfferDestination } from "../app/lib/vesim/publicOfferSnapshotSeed";
import {
  PUBLIC_OFFER_SNAPSHOT_LOCK_CLASS,
  applyPublicOfferSnapshotCandidate,
  claimPublicOfferSnapshotLease,
  insertPublicOfferSnapshotIfAbsent,
  readPublicDestinationOfferSnapshot,
  readPublicOfferSnapshotControl,
} from "../app/lib/vesim/publicOfferSnapshotStore";

const root = join(__dirname, "..");
const PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const PORT = 55441;
const ROLE = "map_esim_test";
const DB = "map_esim_public_offer_snapshots";
const CLUSTER_ROOT = join(
  process.env.TEMP || process.env.TMP || ".",
  "map-esim-pg-public-offer-snapshots"
);
const DATA = join(CLUSTER_ROOT, "data");
const LOG = join(CLUSTER_ROOT, "postgres.log");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function pg(exe: string, args: string[], opts?: { timeoutMs?: number }) {
  const r = spawnSync(join(PG_BIN, exe), args, {
    encoding: "utf8",
    env: process.env,
    timeout: opts?.timeoutMs,
  });
  if (r.error) throw new Error(`${exe} error: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(
      `${exe} failed (${r.status}): ${(r.stderr || r.stdout || "").slice(0, 500)}`
    );
  }
  return r;
}

function sleepMs(ms: number) {
  spawnSync(
    process.execPath,
    ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms})`],
    { encoding: "utf8" }
  );
}

function waitForReady(port: number, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const r = spawnSync(
      join(PG_BIN, "pg_isready.exe"),
      ["-h", "127.0.0.1", "-p", String(port), "-U", ROLE],
      { encoding: "utf8" }
    );
    if (r.status === 0) return;
    sleepMs(500);
  }
  throw new Error(`Postgres not ready on 127.0.0.1:${port}`);
}

function stopCluster() {
  if (!existsSync(DATA)) return;
  spawnSync(
    join(PG_BIN, "pg_ctl.exe"),
    ["-D", DATA, "-w", "-m", "fast", "stop"],
    {
      encoding: "utf8",
      timeout: 30_000,
    }
  );
}

function removeClusterDir() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      rmSync(CLUSTER_ROOT, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw error;
      sleepMs(500);
    }
  }
  rmSync(CLUSTER_ROOT, { recursive: true, force: true });
}

function startClusterDetached() {
  const child = spawn(
    join(PG_BIN, "pg_ctl.exe"),
    ["-D", DATA, "-l", LOG, "-w", "start"],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
}

function assertLocalUrl(url: string) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.port, String(PORT));
  assert.doesNotMatch(url, /prisma|neon|supabase|vercel|amazonaws|5432/i);
}

function offer(id: string, priceUSD = 1): VesimOffer {
  return {
    id,
    offerId: id,
    name: id,
    dataFormatted: "1 GB",
    priceUSD,
    durationDays: 7,
    priceFormatted: `$${priceUSD.toFixed(2)}`,
  };
}

function list(prefix: string, count: number): VesimOffer[] {
  return Array.from({ length: count }, (_, index) =>
    offer(`${prefix}-${index + 1}`)
  );
}

function migrateDeploy(url: string) {
  return spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
      shell: true,
      timeout: 180_000,
    }
  );
}

async function setPublicReadsOn(client: PrismaClient, on: boolean) {
  await client.publicOfferSnapshotControl.update({
    where: { id: "default" },
    data: { publicReadsOn: on, version: { increment: 1 } },
  });
}

async function asPublicApi(
  work: () => Promise<VesimOffer[]>
): Promise<{ status: 200 | 503 | 500; code?: string; offers?: VesimOffer[] }> {
  try {
    const offers = await work();
    if (offers.length === 0) return { status: 503 };
    return { status: 200, offers };
  } catch (error) {
    if (error instanceof PublicOfferSnapshotError) {
      return { status: 503, code: error.code };
    }
    return { status: 500 };
  }
}

function neverFlagOffCache(): () => Promise<VesimOffer[]> {
  return async () => {
    throw new Error("flag_off_cache_must_not_run");
  };
}

function sourceContracts() {
  const server = read("app/lib/vesim/server.ts");
  const api = read("app/api/vesim/offers/route.ts");
  const seed = read("scripts/seed-public-offer-snapshots.ts");
  const controlCli = read("scripts/control-public-offer-snapshots.ts");
  const checkout = read("app/api/vesim/checkout/route.ts");
  const partner = read("app/lib/partner/partnerCatalogRead.ts");
  const admin = read("app/lib/esim/adminPackageAssignmentRead.ts");
  const pkg = read("package.json");
  assert.equal(PUBLIC_OFFER_SNAPSHOT_LOCK_CLASS, 774202);
  assert.match(server, /fetchPublicOffersForCountry/);
  assert.match(server, /unstable_cache/);
  assert.match(server, /public-country-offers-v4-strict/);
  assert.match(server, /PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS/);
  assert.match(server, /revalidate:\s*PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS/);
  assert.equal(PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS, 300);
  assert.match(read("app/lib/vesim/publicOfferSnapshotStore.ts"), /P2021/);
  assert.match(api, /fetchPublicOffersForCountry/);
  assert.match(api, /PublicOfferSnapshotError/);
  assert.match(api, /status:\s*503/);
  assert.doesNotMatch(api, /fetchOffersForCountry\(/);
  assert.match(checkout, /verifyOfferAuthoritative/);
  assert.doesNotMatch(checkout, /fetchPublicOffersForCountry/);
  assert.match(partner, /fetchOffersForCountry/);
  assert.match(admin, /fetchOffersForCountry/);
  assert.doesNotMatch(seed, /fullCatalog/);
  assert.doesNotMatch(seed, /publicOfferSnapshotControl\.(update|updateMany)/);
  assert.match(seed, /SEED PUBLIC OFFER SNAPSHOTS/);
  assert.match(controlCli, /ENABLE PUBLIC OFFER SNAPSHOTS/);
  assert.match(controlCli, /DISABLE PUBLIC OFFER SNAPSHOTS/);
  assert.match(pkg, /control:public-offer-snapshots/);
  assert.throws(() =>
    assertIsolatedLocalApplyTarget({
      host: "127.0.0.1",
      port: "5432",
      database: "x",
    })
  );
  assert.throws(() =>
    assertIsolatedLocalApplyTarget({
      host: "127.0.0.1",
      port: "55440",
      database: "x",
    })
  );
  assert.doesNotThrow(() =>
    assertIsolatedLocalApplyTarget({
      host: "127.0.0.1",
      port: "55441",
      database: "x",
    })
  );
  assert.throws(() =>
    assertApprovedSnapshotTarget(
      { host: "127.0.0.1", port: "55441", database: "x" },
      { host: "db.example.com", database: "prod" }
    )
  );
  assert.doesNotThrow(() =>
    assertApprovedSnapshotTarget(
      { host: "db.example.com", port: "5432", database: "prod" },
      { host: "db.example.com", database: "prod" }
    )
  );
  console.log("PASS html_api_checkout_source_contract");
}

async function dbChecks(url: string) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  const clientB = new PrismaClient({ datasources: { db: { url } } });
  try {
    const control = await readPublicOfferSnapshotControl(client);
    assert.equal(control.ok, true);
    if (!control.ok) throw new Error("unreachable");
    assert.equal(control.publicReadsOn, false);
    console.log("PASS control_default_publicReadsOn_false");

    const asia33 = list("asia", 33);
    const asia24 = asia33.slice(0, 24);
    const t0 = new Date("2026-08-20T12:00:00.000Z");

    const inserted = await insertPublicOfferSnapshotIfAbsent(client, {
      destinationCode: "region-asia",
      offers: asia33,
      now: t0,
    });
    assert.equal(inserted.outcome, "inserted");
    assert.equal(inserted.payloadReplaced, true);
    const cold = await readPublicDestinationOfferSnapshot(client, "region-asia");
    assert.ok(cold);
    assert.equal(cold.offerCount, 33);
    console.log("PASS cold_insert");

    const leaseA = await claimPublicOfferSnapshotLease(
      client,
      "region-asia",
      t0
    );
    const leaseB = await claimPublicOfferSnapshotLease(
      clientB,
      "region-asia",
      t0
    );
    assert.equal(leaseA.ok, true);
    assert.equal(leaseB.ok, false);
    if (leaseA.ok) {
      await applyPublicOfferSnapshotCandidate(client, {
        destinationCode: "region-asia",
        candidate: asia33,
        now: t0,
        claimToken: leaseA.claimToken,
      });
    }
    console.log("PASS lease_concurrency");

    const smaller = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "region-asia",
      candidate: asia24,
      now: new Date(t0.getTime() + 1000),
    });
    assert.equal(smaller.outcome, "pending");
    assert.equal(smaller.payloadReplaced, false);
    const afterSmaller = await readPublicDestinationOfferSnapshot(
      client,
      "region-asia"
    );
    assert.equal(afterSmaller?.offerCount, 33);
    console.log("PASS cas_smaller_cannot_overwrite_larger");

    const priced = asia33.map((item, index) =>
      index === 0 ? { ...item, priceUSD: 42 } : item
    );
    const sameIds = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "region-asia",
      candidate: priced,
      now: new Date(t0.getTime() + 2000),
    });
    assert.equal(sameIds.outcome, "accepted");
    assert.equal(sameIds.reason, "same_ids");
    const afterPrice = await readPublicDestinationOfferSnapshot(
      client,
      "region-asia"
    );
    assert.equal(afterPrice?.offerCount, 33);
    const payload = afterPrice?.offersJson;
    assert.ok(Array.isArray(payload));
    const first = payload[0] as { priceUSD?: number };
    assert.equal(first.priceUSD, 42);
    console.log("PASS same_ids_update_price");

    await insertPublicOfferSnapshotIfAbsent(client, {
      destinationCode: "PK",
      offers: list("pk", 15),
      now: t0,
    });
    const superset = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "PK",
      candidate: list("pk", 18),
      now: new Date(t0.getTime() + 3000),
    });
    assert.equal(superset.outcome, "accepted");
    assert.equal(superset.reason, "superset");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "PK"))?.offerCount,
      18
    );
    console.log("PASS superset_acceptance");

    const incomparable = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "PK",
      candidate: list("zz", 18),
      now: new Date(t0.getTime() + 4000),
    });
    assert.equal(incomparable.outcome, "pending");
    assert.equal(incomparable.reason, "incomparable");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "PK"))?.offerCount,
      18
    );
    console.log("PASS equal_count_different_ids_pending");

    const tConfirm0 = new Date("2026-08-20T13:00:00.000Z");
    await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "region-asia",
      candidate: asia24,
      now: tConfirm0,
    });
    await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "region-asia",
      candidate: asia24,
      now: new Date(tConfirm0.getTime() + 10 * 60 * 1000),
    });
    const stillLarge = await readPublicDestinationOfferSnapshot(
      client,
      "region-asia"
    );
    assert.equal(stillLarge?.offerCount, 33);
    const confirmed = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "region-asia",
      candidate: asia24,
      now: new Date(tConfirm0.getTime() + PUBLIC_OFFER_PENDING_WINDOW_MS),
    });
    assert.equal(confirmed.outcome, "accepted");
    assert.equal(confirmed.reason, "confirmed_pending");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "region-asia"))
        ?.offerCount,
      24
    );
    console.log("PASS subset_confirmation_3x_30m");

    const beforeError = await readPublicDestinationOfferSnapshot(client, "PK");
    const emptied = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "PK",
      candidate: [],
      now: new Date(t0.getTime() + 5000),
    });
    assert.equal(emptied.outcome, "touched");
    const afterEmpty = await readPublicDestinationOfferSnapshot(client, "PK");
    assert.equal(afterEmpty?.offerCount, beforeError?.offerCount);
    const errored = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode: "PK",
      candidate: list("pk", 1),
      now: new Date(t0.getTime() + 6000),
      error: true,
    });
    assert.equal(errored.outcome, "touched");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "PK"))?.offerCount,
      beforeError?.offerCount
    );
    console.log("PASS empty_error_preserve_snapshot");

    await setPublicReadsOn(client, true);
    try {
      await loadPublicOffersForCountry({
        client,
        country: "FR",
        fetchLive: async () => list("fr", 16),
        loadFlagOffCached: neverFlagOffCache(),
        now: t0,
      });
      assert.fail("expected missing snapshot throw");
    } catch (error) {
      assert.equal(error instanceof PublicOfferSnapshotError, true);
      assert.equal(
        error instanceof PublicOfferSnapshotError && error.code,
        "missing"
      );
    }
    const frRow = await readPublicDestinationOfferSnapshot(client, "FR");
    assert.equal(frRow, null);
    console.log("PASS missing_row_flag_on_throws");

    await setPublicReadsOn(client, false);
    let liveCalls = 0;
    const flagOffCache = createBoundedPublicOfferTtlCache({
      fetchLive: async (country) => {
        liveCalls += 1;
        return country === "PK" ? list("pk-cache", 15) : list("asia-cache", 48);
      },
      ttlMs: 300_000,
    });
    for (let i = 0; i < 5; i++) {
      const pkCached = await loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => {
          throw new Error("flag_off_must_use_ttl_cache");
        },
        loadFlagOffCached: flagOffCache.load,
        now: t0,
      });
      assert.equal(pkCached.length, 15);
      const asiaCached = await loadPublicOffersForCountry({
        client,
        country: "region-asia",
        fetchLive: async () => {
          throw new Error("flag_off_must_use_ttl_cache");
        },
        loadFlagOffCached: flagOffCache.load,
        now: t0,
      });
      assert.equal(asiaCached.length, 48);
    }
    assert.equal(flagOffCache.generations.get("PK"), 1);
    assert.equal(flagOffCache.generations.get("region-asia"), 1);
    assert.equal(liveCalls, 2);
    console.log("PASS flag_off_bounded_ttl_cache");

    await setPublicReadsOn(client, true);
    const html = await loadPublicOffersForCountry({
      client,
      country: "PK",
      fetchLive: async () => {
        throw new Error("must_not_live_fill");
      },
      loadFlagOffCached: neverFlagOffCache(),
      now: t0,
    });
    const api = await loadPublicOffersForCountry({
      client,
      country: "PK",
      fetchLive: async () => {
        throw new Error("must_not_live_fill");
      },
      loadFlagOffCached: neverFlagOffCache(),
      now: t0,
    });
    assert.equal(html.length, api.length);
    assert.equal(html.length, 18);
    console.log("PASS html_api_same_store_source");

    const staleNow = new Date(t0.getTime() + PUBLIC_OFFER_SNAPSHOT_STALE_MS + 1);
    const raced = await Promise.all([
      applyPublicOfferSnapshotCandidate(client, {
        destinationCode: "PK",
        candidate: list("pk", 10),
        now: staleNow,
      }),
      applyPublicOfferSnapshotCandidate(clientB, {
        destinationCode: "PK",
        candidate: list("pk", 22),
        now: staleNow,
      }),
    ]);
    const finalPk = await readPublicDestinationOfferSnapshot(client, "PK");
    assert.ok(finalPk);
    assert.ok(finalPk.offerCount >= 18);
    assert.ok(raced.some((result) => result.outcome === "pending" || result.outcome === "accepted"));
    assert.notEqual(finalPk.offerCount, 10);
    console.log("PASS cas_race_serialized");

    await setPublicReadsOn(client, false);
    const dry = await seedPublicOfferDestination({
      client,
      destination: "JP",
      fetchLive: async () => list("jp", 12),
      apply: false,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(dry.status, "dry_run");
    assert.equal(await readPublicDestinationOfferSnapshot(client, "JP"), null);

    const seeded = await seedPublicOfferDestination({
      client,
      destination: "JP",
      fetchLive: async () => list("jp", 12),
      apply: true,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(seeded.status, "applied");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "JP"))?.offerCount,
      12
    );

    const asiaResume = await seedPublicOfferDestination({
      client,
      destination: "region-asia",
      fetchLive: async () => list("asia", 48),
      apply: true,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(asiaResume.status, "applied");
    assert.equal(asiaResume.reason, "superset");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "region-asia"))
        ?.offerCount,
      48
    );

    const asiaSame = await seedPublicOfferDestination({
      client,
      destination: "region-asia",
      fetchLive: async () => list("asia", 48),
      apply: true,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(asiaSame.status, "applied");
    assert.equal(asiaSame.reason, "same_ids");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "region-asia"))
        ?.offerCount,
      48
    );

    const asiaSmaller = await seedPublicOfferDestination({
      client,
      destination: "region-asia",
      fetchLive: async () => list("asia", 10),
      apply: true,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(asiaSmaller.status, "pending");
    assert.equal(
      (await readPublicDestinationOfferSnapshot(client, "region-asia"))
        ?.offerCount,
      48
    );

    let liveFlip = 0;
    const skipIncomparable = await seedPublicOfferDestination({
      client,
      destination: "AE",
      fetchLive: async () => {
        liveFlip += 1;
        return liveFlip % 2 === 1 ? list("ae", 10) : list("zz", 10);
      },
      apply: true,
      delayMs: 0,
      sleepFn: async () => undefined,
    });
    assert.equal(skipIncomparable.status, "skipped");
    const controlAfterSeed = await readPublicOfferSnapshotControl(client);
    assert.equal(controlAfterSeed.ok, true);
    if (controlAfterSeed.ok) {
      assert.equal(controlAfterSeed.publicReadsOn, false);
    }
    console.log("PASS seed_resume_24_to_48");

    await insertPublicOfferSnapshotIfAbsent(client, {
      destinationCode: "FR",
      offers: list("fr", 16),
      now: t0,
    });
    await insertPublicOfferSnapshotIfAbsent(client, {
      destinationCode: "AE",
      offers: list("ae", 11),
      now: t0,
    });

    async function requiredExpectation(code: string) {
      const row = await readPublicDestinationOfferSnapshot(client, code);
      assert.ok(row);
      return {
        offerCount: row.offerCount,
        idFingerprint: row.idFingerprint,
        payloadFingerprint: row.payloadFingerprint,
      };
    }

    const required = {
      PK: await requiredExpectation("PK"),
      "region-asia": await requiredExpectation("region-asia"),
      FR: await requiredExpectation("FR"),
      JP: await requiredExpectation("JP"),
      AE: await requiredExpectation("AE"),
    };

    const wrongPhrase = await enablePublicOfferSnapshotReads({
      client,
      confirmation: "nope",
    });
    assert.equal(wrongPhrase.ok, false);
    if (!wrongPhrase.ok) assert.equal(wrongPhrase.reason, "confirmation");

    const notVerified = await enablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
    });
    assert.equal(notVerified.ok, false);
    if (!notVerified.ok) assert.equal(notVerified.reason, "seed_not_verified");

    const lowCoverage = await recordSeedExpectedCounts(client, {
      target: 10,
      seeded: 8,
      skipped: 2,
      required,
    });
    assert.equal(lowCoverage.ok, true);
    const coverageDenied = await enablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
    });
    assert.equal(coverageDenied.ok, false);
    if (!coverageDenied.ok) assert.equal(coverageDenied.reason, "coverage");

    const recorded = await recordSeedExpectedCounts(client, {
      target: 5,
      seeded: 5,
      skipped: 0,
      required,
    });
    assert.equal(recorded.ok, true);

    const enabled = await enablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
    });
    assert.equal(enabled.ok, true);
    const on = await readPublicOfferSnapshotControl(client);
    assert.equal(on.ok && on.publicReadsOn, true);

    const alreadyOn = await enablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
    });
    assert.equal(alreadyOn.ok, false);

    const disableDenied = await disablePublicOfferSnapshotReads({
      client,
      confirmation: "nope",
    });
    assert.equal(disableDenied.ok, false);

    const disabled = await disablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE,
    });
    assert.equal(disabled.ok, true);
    const off = await readPublicOfferSnapshotControl(client);
    assert.equal(off.ok && off.publicReadsOn, false);

    await client.publicDestinationOfferSnapshot.delete({
      where: { destinationCode: "JP" },
    });
    const missingRequired = await enablePublicOfferSnapshotReads({
      client,
      confirmation: PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
    });
    assert.equal(missingRequired.ok, false);
    if (!missingRequired.ok) {
      assert.equal(missingRequired.reason, "missing_row_JP");
    }
    await insertPublicOfferSnapshotIfAbsent(client, {
      destinationCode: "JP",
      offers: list("jp", 12),
      now: t0,
    });
    console.log("PASS enable_disable_gates");

    await setPublicReadsOn(client, true);
    const lastGoodPk = await readPublicDestinationOfferSnapshot(client, "PK");
    assert.ok(lastGoodPk);
    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "PK" },
      data: { providerCheckedAt: new Date(0) },
    });
    const refreshNow = new Date();

    const hung = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => new Promise<VesimOffer[]>(() => undefined),
        loadFlagOffCached: neverFlagOffCache(),
        now: refreshNow,
        timeoutMs: 40,
      })
    );
    assert.equal(hung.status, 200);
    assert.equal(hung.offers?.length, lastGoodPk.offerCount);

    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "PK" },
      data: { providerCheckedAt: new Date(0) },
    });
    const timedOut = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async (_country, options) => {
          await new Promise<void>((_, reject) => {
            const abort = () => {
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" })
              );
            };
            if (options?.signal?.aborted) {
              abort();
              return;
            }
            options?.signal?.addEventListener("abort", abort, { once: true });
          });
          return list("pk", 99);
        },
        loadFlagOffCached: neverFlagOffCache(),
        now: refreshNow,
        timeoutMs: 40,
      })
    );
    assert.equal(timedOut.status, 200);
    assert.equal(timedOut.offers?.length, lastGoodPk.offerCount);

    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "PK" },
      data: { providerCheckedAt: new Date(0) },
    });
    const refreshThrow = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => {
          throw new Error("provider_down");
        },
        loadFlagOffCached: neverFlagOffCache(),
        now: refreshNow,
        timeoutMs: 40,
      })
    );
    assert.equal(refreshThrow.status, 200);
    assert.equal(refreshThrow.offers?.length, lastGoodPk.offerCount);

    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "PK" },
      data: { providerCheckedAt: new Date(0) },
    });
    const leaseThrow = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => list("pk", lastGoodPk.offerCount),
        loadFlagOffCached: neverFlagOffCache(),
        now: refreshNow,
        timeoutMs: 200,
        releaseLease: async () => {
          throw new Error("lease_release_failed");
        },
      })
    );
    assert.equal(leaseThrow.status, 200);
    assert.ok((leaseThrow.offers?.length ?? 0) >= lastGoodPk.offerCount);
    console.log("PASS timeout_last_good_no_500");

    await setPublicReadsOn(client, true);
    const beforeCorrupt = await readPublicDestinationOfferSnapshot(client, "FR");
    assert.ok(beforeCorrupt);
    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "FR" },
      data: { idFingerprint: "deadbeef" },
    });
    const corrupt = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "FR",
        fetchLive: async () => list("fr", 99),
        loadFlagOffCached: neverFlagOffCache(),
        now: t0,
      })
    );
    assert.equal(corrupt.status, 503);
    assert.equal(corrupt.code, "malformed");
    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "FR" },
      data: {
        idFingerprint: beforeCorrupt.idFingerprint,
        offerCount: beforeCorrupt.offerCount + 3,
      },
    });
    const countDrift = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "FR",
        fetchLive: async () => list("fr", 99),
        loadFlagOffCached: neverFlagOffCache(),
        now: t0,
      })
    );
    assert.equal(countDrift.status, 503);
    assert.equal(countDrift.code, "malformed");
    const restored = normalizePublicSnapshotOffers(list("fr", 16));
    assert.ok(restored);
    await client.publicDestinationOfferSnapshot.update({
      where: { destinationCode: "FR" },
      data: {
        offerCount: restored.offerCount,
        idFingerprint: restored.idFingerprint,
        payloadFingerprint: restored.payloadFingerprint,
        offerIds: restored.offerIds,
        offersJson: restored.offers as never,
      },
    });
    console.log("PASS fingerprint_corruption_503");

    await client.$executeRawUnsafe(
      `DROP TABLE IF EXISTS "PublicDestinationOfferSnapshot"`
    );
    await client.$executeRawUnsafe(
      `DROP TABLE IF EXISTS "PublicOfferSnapshotControl"`
    );
    let missingTableCalls = 0;
    const missingCache = createBoundedPublicOfferTtlCache({
      fetchLive: async () => {
        missingTableCalls += 1;
        return list("fallback", 7);
      },
      ttlMs: 300_000,
    });
    const missing = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => {
          throw new Error("missing_table_must_not_unbounded_live");
        },
        loadFlagOffCached: missingCache.load,
        now: t0,
      })
    );
    const missingAgain = await asPublicApi(() =>
      loadPublicOffersForCountry({
        client,
        country: "PK",
        fetchLive: async () => {
          throw new Error("missing_table_must_not_unbounded_live");
        },
        loadFlagOffCached: missingCache.load,
        now: t0,
      })
    );
    assert.equal(missing.status, 200);
    assert.equal(missingAgain.status, 200);
    assert.equal(missing.offers?.length, 7);
    assert.equal(missingTableCalls, 1);
    assert.equal(missingCache.generations.get("PK"), 1);
    console.log("PASS missing_table_flag_off_fallback");
  } finally {
    await client.$disconnect();
    await clientB.$disconnect();
  }
}

async function main() {
  sourceContracts();

  if (!existsSync(join(PG_BIN, "initdb.exe"))) {
    throw new Error("PostgreSQL 17 bin not found for isolated DB tests");
  }

  stopCluster();
  removeClusterDir();
  mkdirSync(DATA, { recursive: true });
  pg("initdb.exe", [
    "-D",
    DATA,
    "-U",
    ROLE,
    "-A",
    "trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  writeFileSync(
    join(DATA, "postgresql.conf"),
    `listen_addresses = '127.0.0.1'\nport = ${PORT}\nmax_connections = 40\n`
  );
  startClusterDetached();
  waitForReady(PORT);
  pg("createdb.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", ROLE, DB]);

  const url = `postgresql://${ROLE}@127.0.0.1:${PORT}/${DB}?schema=public`;
  assertLocalUrl(url);
  process.env.DATABASE_URL = url;

  const first = migrateDeploy(url);
  if (first.status !== 0) {
    throw new Error(
      `migrate deploy #1 failed: ${(first.stderr || first.stdout || "").slice(0, 800)}`
    );
  }
  const second = migrateDeploy(url);
  if (second.status !== 0) {
    throw new Error(
      `migrate deploy #2 failed: ${(second.stderr || second.stdout || "").slice(0, 800)}`
    );
  }
  console.log("PASS migrate_deploy_twice");

  try {
    await dbChecks(url);
    console.log("ALL_QA_PASSED=public-offer-snapshot-store");
  } finally {
    stopCluster();
    removeClusterDir();
  }
}

main().catch((error) => {
  try {
    stopCluster();
    removeClusterDir();
  } catch {
    // Best-effort cluster cleanup.
  }
  console.error(error);
  process.exit(1);
});
