/**
 * Shared request-scoped admin DB probe (Operations + Monitoring Alerts).
 * Same SELECT 1 + mapDatabaseProbeToStatus semantics — one round-trip per request.
 */
import "server-only";

import { cache } from "react";
import { prisma } from "@/app/lib/db";
import {
  mapDatabaseProbeToStatus,
  type HealthStatus,
} from "@/app/lib/admin/operationsHealthShared";

export type AdminDatabaseProbeResult = {
  status: HealthStatus;
  latencyMs: number | null;
  ok: boolean;
};

/**
 * Latency is recorded for display only. Do not gate DEGRADED on a single
 * Date.now() sample — that flickered DATABASE_DEGRADED across refreshes.
 */
export const probeAdminDatabase = cache(
  async (): Promise<AdminDatabaseProbeResult> => {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Math.max(0, Date.now() - started);
      return {
        status: mapDatabaseProbeToStatus({ ok: true }),
        latencyMs,
        ok: true,
      };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : null;
      return {
        status: mapDatabaseProbeToStatus({
          ok: false,
          errorCode: code || "UNAVAILABLE",
        }),
        latencyMs: null,
        ok: false,
      };
    }
  }
);

export type LatestPrismaMigration = {
  name: string | null;
  finishedAt: Date | null;
  /** True when the migrate table is missing (`db push`) or unreadable. */
  unknown: boolean;
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "42P01" || code === "P2010") return true;
  const meta = (error as { meta?: { code?: unknown } }).meta;
  if (meta && String(meta.code ?? "") === "42P01") return true;
  const message = String((error as { message?: unknown }).message ?? "");
  return (
    /42P01/.test(message) ||
    (/_prisma_migrations/i.test(message) &&
      /does not exist|undefined table/i.test(message))
  );
}

/**
 * Latest applied Prisma migrate row. `prisma db push` never creates
 * `_prisma_migrations` — probe information_schema first so we never raise 42P01
 * (which Prisma logs as error and can abort the pooled connection).
 */
export async function readLatestPrismaMigration(): Promise<LatestPrismaMigration> {
  try {
    const presentRows = await prisma.$queryRaw<Array<{ present: number | bigint | null }>>`
      SELECT 1 AS present
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = '_prisma_migrations'
      LIMIT 1
    `;
    if (!presentRows || !presentRows[0]) {
      return { name: null, finishedAt: null, unknown: true };
    }

    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string | null; finished_at: Date | null }>
    >`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 1
    `;
    const row = rows?.[0];
    const name = String(row?.migration_name ?? "").trim().slice(0, 120);
    if (!name || !/^[A-Za-z0-9_]+$/.test(name)) {
      return { name: null, finished_at: null, unknown: true } as unknown as LatestPrismaMigration;
    }
    return { name, finishedAt: row?.finished_at ?? null, unknown: false };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { name: null, finishedAt: null, unknown: true };
    }
    return { name: null, finishedAt: null, unknown: true };
  }
}