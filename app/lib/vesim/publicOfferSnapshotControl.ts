/**
 * Guarded publicReadsOn enable/disable and seed expected-count recording.
 * Never flips the flag from the seed script.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE,
  PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE,
  PUBLIC_OFFER_SNAPSHOT_MIN_COVERAGE_RATIO,
  PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS,
} from "@/app/lib/vesim/publicOfferSnapshot";
import { confirmationMatches } from "@/app/lib/vesim/publicOfferSnapshotGuard";
import {
  parseStoredPublicOffers,
  readPublicDestinationOfferSnapshot,
} from "@/app/lib/vesim/publicOfferSnapshotStore";

export type RequiredSnapshotExpectation = {
  offerCount: number;
  idFingerprint: string;
  payloadFingerprint: string;
};

export type PublicOfferSnapshotExpectedCounts = {
  target: number;
  seeded: number;
  skipped: number;
  required: Record<string, RequiredSnapshotExpectation>;
};

export function parseExpectedCountsJson(
  value: Prisma.JsonValue | null | undefined
): PublicOfferSnapshotExpectedCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const target = Number(record.target);
  const seeded = Number(record.seeded);
  const skipped = Number(record.skipped);
  if (
    !Number.isFinite(target) ||
    !Number.isFinite(seeded) ||
    !Number.isFinite(skipped) ||
    target < 0 ||
    seeded < 0 ||
    skipped < 0
  ) {
    return null;
  }
  const requiredRaw = record.required;
  if (!requiredRaw || typeof requiredRaw !== "object" || Array.isArray(requiredRaw)) {
    return null;
  }
  const required: Record<string, RequiredSnapshotExpectation> = {};
  for (const [code, entry] of Object.entries(
    requiredRaw as Record<string, unknown>
  )) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const offerCount = Number(row.offerCount);
    const idFingerprint =
      typeof row.idFingerprint === "string" ? row.idFingerprint : "";
    const payloadFingerprint =
      typeof row.payloadFingerprint === "string" ? row.payloadFingerprint : "";
    if (
      !Number.isFinite(offerCount) ||
      offerCount < 1 ||
      !idFingerprint ||
      !payloadFingerprint
    ) {
      return null;
    }
    required[code] = { offerCount, idFingerprint, payloadFingerprint };
  }
  return { target, seeded, skipped, required };
}

export async function recordSeedExpectedCounts(
  client: PrismaClient,
  expected: PublicOfferSnapshotExpectedCounts,
  now = new Date()
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const requiredOk = PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS.every(
    (code) => expected.required[code]
  );
  const updated = await client.publicOfferSnapshotControl.updateMany({
    where: { id: "default", publicReadsOn: false },
    data: {
      expectedCountsJson: expected as unknown as Prisma.InputJsonValue,
      seedVerifiedAt: requiredOk ? now : null,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    return { ok: false, reason: "control_cas" };
  }
  return { ok: true };
}

export async function readPublicOfferSnapshotStatus(client: PrismaClient) {
  const control = await client.publicOfferSnapshotControl.findUnique({
    where: { id: "default" },
  });
  const expected = parseExpectedCountsJson(control?.expectedCountsJson ?? null);
  return {
    publicReadsOn: control?.publicReadsOn === true,
    seedVerifiedAt: control?.seedVerifiedAt?.toISOString() ?? null,
    version: control?.version ?? null,
    target: expected?.target ?? null,
    seeded: expected?.seeded ?? null,
    skipped: expected?.skipped ?? null,
    required: expected
      ? PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS.map((code) => ({
          destination: code,
          offerCount: expected.required[code]?.offerCount ?? null,
        }))
      : [],
  };
}

export async function disablePublicOfferSnapshotReads(options: {
  client: PrismaClient;
  confirmation: string;
}): Promise<{ ok: true; version: number } | { ok: false; reason: string }> {
  if (
    !confirmationMatches(
      options.confirmation,
      PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE
    )
  ) {
    return { ok: false, reason: "confirmation" };
  }
  const current = await options.client.publicOfferSnapshotControl.findUnique({
    where: { id: "default" },
    select: { version: true, publicReadsOn: true },
  });
  if (!current) return { ok: false, reason: "missing_control" };
  const updated = await options.client.publicOfferSnapshotControl.updateMany({
    where: { id: "default", version: current.version },
    data: {
      publicReadsOn: false,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) return { ok: false, reason: "cas_conflict" };
  return { ok: true, version: current.version + 1 };
}

export async function enablePublicOfferSnapshotReads(options: {
  client: PrismaClient;
  confirmation: string;
}): Promise<{ ok: true; version: number } | { ok: false; reason: string }> {
  if (
    !confirmationMatches(options.confirmation, PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE)
  ) {
    return { ok: false, reason: "confirmation" };
  }

  const control = await options.client.publicOfferSnapshotControl.findUnique({
    where: { id: "default" },
  });
  if (!control) return { ok: false, reason: "missing_control" };
  if (control.publicReadsOn) return { ok: false, reason: "already_on" };
  if (!control.seedVerifiedAt) return { ok: false, reason: "seed_not_verified" };

  const expected = parseExpectedCountsJson(control.expectedCountsJson);
  if (!expected || expected.target < 1) {
    return { ok: false, reason: "expected_counts" };
  }
  if (expected.seeded / expected.target < PUBLIC_OFFER_SNAPSHOT_MIN_COVERAGE_RATIO) {
    return { ok: false, reason: "coverage" };
  }

  for (const code of PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS) {
    const want = expected.required[code];
    if (!want) return { ok: false, reason: `missing_required_${code}` };
    const row = await readPublicDestinationOfferSnapshot(options.client, code);
    const stored = parseStoredPublicOffers(row);
    if (!row || !stored) return { ok: false, reason: `missing_row_${code}` };
    if (
      row.offerCount !== want.offerCount ||
      row.idFingerprint !== want.idFingerprint ||
      row.payloadFingerprint !== want.payloadFingerprint
    ) {
      return { ok: false, reason: `mismatch_${code}` };
    }
  }

  const updated = await options.client.publicOfferSnapshotControl.updateMany({
    where: {
      id: "default",
      version: control.version,
      publicReadsOn: false,
      seedVerifiedAt: { not: null },
    },
    data: {
      publicReadsOn: true,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) return { ok: false, reason: "cas_conflict" };
  return { ok: true, version: control.version + 1 };
}
