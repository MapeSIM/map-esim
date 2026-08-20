/**
 * Guarded public offer snapshot control.
 * Default: read-only status.
 *
 *   npx tsx scripts/control-public-offer-snapshots.ts
 *   npx tsx scripts/control-public-offer-snapshots.ts enable --confirm="ENABLE PUBLIC OFFER SNAPSHOTS"
 *   npx tsx scripts/control-public-offer-snapshots.ts disable --confirm="DISABLE PUBLIC OFFER SNAPSHOTS"
 *
 * Enable requires allowlisted DATABASE_URL host/database, seedVerifiedAt,
 * required destination rows, fingerprint match, and coverage threshold.
 * Disable is version CAS to publicReadsOn=false only.
 *
 * Deployment order: backup → migrate while old app is live → deploy
 * publicReadsOn=false → seed → verify → enable → smoke. Rollback: disable.
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE,
  PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
} from "../app/lib/vesim/publicOfferSnapshot";
import {
  disablePublicOfferSnapshotReads,
  enablePublicOfferSnapshotReads,
  readPublicOfferSnapshotStatus,
} from "../app/lib/vesim/publicOfferSnapshotControl";
import {
  assertControlWriteTarget,
  parseDatabaseTarget,
  readSnapshotAllowlist,
} from "../app/lib/vesim/publicOfferSnapshotGuard";

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

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  const confirm = argValue(argv, "--confirm");
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (command === "enable" || command === "disable") {
    assertControlWriteTarget(
      parseDatabaseTarget(databaseUrl),
      readSnapshotAllowlist()
    );
  }

  if (command === "enable" && confirm !== PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE) {
    throw new Error("Enable requires the exact confirmation phrase");
  }

  if (command === "disable" && confirm !== PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE) {
    throw new Error("Disable requires the exact confirmation phrase");
  }

  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    if (command === "status") {
      const status = await readPublicOfferSnapshotStatus(client);
      console.log(JSON.stringify({ ok: true, ...status }));
      return;
    }
    if (command === "enable") {
      const result = await enablePublicOfferSnapshotReads({
        client,
        confirmation: confirm || "",
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      console.log(JSON.stringify({ ok: true, publicReadsOn: true, version: result.version }));
      return;
    }
    if (command === "disable") {
      const result = await disablePublicOfferSnapshotReads({
        client,
        confirmation: confirm || "",
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      console.log(JSON.stringify({ ok: true, publicReadsOn: false, version: result.version }));
      return;
    }
    throw new Error("Unknown command");
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "control_failed";
  console.error(message);
  process.exit(1);
});
