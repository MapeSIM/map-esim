/**
 * Resumable public-offer snapshot backfill.
 * Dry-run by default. Never sets publicReadsOn.
 *
 * Local:
 *   npx tsx scripts/seed-public-offer-snapshots.ts --apply
 *   (loopback DATABASE_URL, port 55441 only; refuses 5432 and 55440)
 *
 * Production:
 *   npx tsx scripts/seed-public-offer-snapshots.ts --apply --production
 *     --confirm="SEED PUBLIC OFFER SNAPSHOTS"
 *   DATABASE_URL host/database must match
 *   PUBLIC_OFFER_SNAPSHOT_ALLOWED_HOST / PUBLIC_OFFER_SNAPSHOT_ALLOWED_DATABASE.
 *
 * Deployment order: backup → migrate while old app is live → deploy
 * publicReadsOn=false → seed dry-run then --apply → verify → guarded enable.
 *
 * tsx is not the Next.js server runtime. Register the CLI Next preload
 * before importing live VeSIM helpers (next/cache + server-only).
 */
import "./cli-next-runtime.cjs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS,
  PUBLIC_OFFER_SNAPSHOT_SEED_PHRASE,
} from "../app/lib/vesim/publicOfferSnapshot";
import {
  recordSeedExpectedCounts,
  type PublicOfferSnapshotExpectedCounts,
} from "../app/lib/vesim/publicOfferSnapshotControl";
import {
  assertApprovedSnapshotTarget,
  assertIsolatedLocalApplyTarget,
  confirmationMatches,
  parseDatabaseTarget,
  readSnapshotAllowlist,
} from "../app/lib/vesim/publicOfferSnapshotGuard";
import { withPublicOfferRefreshTimeout } from "../app/lib/vesim/publicOfferSnapshotRefresh";
import { seedPublicOfferDestination } from "../app/lib/vesim/publicOfferSnapshotSeed";
import { readPublicDestinationOfferSnapshot } from "../app/lib/vesim/publicOfferSnapshotStore";

loadEnvConfig(process.cwd());

function argValue(argv: string[], name: string): string | undefined {
  const prefixed = argv.find((value) => value.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const production = argv.includes("--production");
  const confirm = argValue(argv, "--confirm");
  const destArg = argValue(argv, "--destinations");
  const destinations = destArg
    ? destArg
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;
  return { apply, production, confirm, destinations };
}

async function main() {
  const { apply, production, confirm, destinations: only } = parseArgs(
    process.argv.slice(2)
  );
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const target = parseDatabaseTarget(databaseUrl);
  if (apply && production) {
    if (!confirmationMatches(confirm, PUBLIC_OFFER_SNAPSHOT_SEED_PHRASE)) {
      throw new Error("Production --apply requires the exact confirmation phrase");
    }
    const allowlist = readSnapshotAllowlist();
    if (!allowlist) {
      throw new Error("Production allowlist environment is not configured");
    }
    assertApprovedSnapshotTarget(target, allowlist);
  } else if (apply) {
    assertIsolatedLocalApplyTarget(target);
  }

  const { fetchDestinations, fetchStrictPublicOffersLive, getBrokerToken } =
    await import("../app/lib/vesim/server");

  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    const control = await client.publicOfferSnapshotControl.findUnique({
      where: { id: "default" },
      select: { publicReadsOn: true },
    });
    if (!control) {
      throw new Error("snapshot control table/row is missing");
    }
    if (apply && control.publicReadsOn) {
      throw new Error("Refusing --apply while publicReadsOn is true");
    }

    const token = await getBrokerToken();
    const catalog = await fetchDestinations(token);
    const advertised = catalog.filter(
      (destination) => (destination.offerCount ?? 1) > 0 && destination.code.trim()
    );
    const codes = advertised.map((destination) => destination.code.trim());
    const selected = only
      ? codes.filter((code) => only.includes(code))
      : codes;

    console.log(
      JSON.stringify({
        ok: true,
        apply,
        destinationCount: selected.length,
        publicReadsOn: false,
      })
    );

    const expected: PublicOfferSnapshotExpectedCounts = {
      target: selected.length,
      seeded: 0,
      skipped: 0,
      required: {},
    };

    for (const destination of selected) {
      const result = await seedPublicOfferDestination({
        client,
        destination,
        fetchLive: (code) =>
          withPublicOfferRefreshTimeout((signal) =>
            fetchStrictPublicOffersLive(code, { signal })
          ),
        apply,
      });
      if (result.status === "applied") expected.seeded += 1;
      if (result.status === "skipped" || result.status === "pending") {
        expected.skipped += 1;
      }
      console.log(
        JSON.stringify({
          destination: result.destination,
          status: result.status,
          reason: result.reason,
          offerCount: result.offerCount,
        })
      );
    }

    if (apply) {
      for (const code of PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS) {
        const row = await readPublicDestinationOfferSnapshot(client, code);
        if (!row) continue;
        expected.required[code] = {
          offerCount: row.offerCount,
          idFingerprint: row.idFingerprint,
          payloadFingerprint: row.payloadFingerprint,
        };
      }
      const recorded = await recordSeedExpectedCounts(client, expected);
      if (!recorded.ok) {
        throw new Error("Unable to record seed coverage");
      }
    }

    const after = await client.publicOfferSnapshotControl.findUnique({
      where: { id: "default" },
      select: { publicReadsOn: true },
    });
    if (after?.publicReadsOn) {
      throw new Error("seed must not change publicReadsOn");
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "seed_failed";
  console.error(message);
  process.exit(1);
});
