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
