/**
 * Shared DATABASE_URL / confirmation guards for public-offer snapshot seed
 * and control CLIs. Never logs the raw URL or credentials.
 */
import {
  PUBLIC_OFFER_SNAPSHOT_ALLOWED_DATABASE_ENV,
  PUBLIC_OFFER_SNAPSHOT_ALLOWED_HOST_ENV,
} from "@/app/lib/vesim/publicOfferSnapshot";

export type ParsedDatabaseTarget = {
  host: string;
  port: string;
  database: string;
};

export function parseDatabaseTarget(url: string): ParsedDatabaseTarget {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split(
    "/"
  )[0];
  if (!parsed.hostname || !database) {
    throw new Error("DATABASE_URL is missing host or database");
  }
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database,
  };
}

export function isForbiddenSnapshotPort(port: string): boolean {
  return port === "5432" || port === "55440";
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost";
}

export function readSnapshotAllowlist(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  database: string;
} | null {
  const host = (env[PUBLIC_OFFER_SNAPSHOT_ALLOWED_HOST_ENV] || "").trim();
  const database = (env[PUBLIC_OFFER_SNAPSHOT_ALLOWED_DATABASE_ENV] || "").trim();
  if (!host || !database) return null;
  return { host, database };
}

export function assertIsolatedLocalApplyTarget(target: ParsedDatabaseTarget): void {
  if (!isLoopbackHost(target.host)) {
    throw new Error("Local --apply requires a loopback DATABASE_URL host");
  }
  if (isForbiddenSnapshotPort(target.port)) {
    throw new Error("Refusing --apply against a forbidden database port");
  }
  if (target.port !== "55441") {
    throw new Error("Local --apply requires port 55441");
  }
}

export function assertApprovedSnapshotTarget(
  target: ParsedDatabaseTarget,
  allowlist: { host: string; database: string }
): void {
  if (target.port === "55440" || (isLoopbackHost(target.host) && target.port === "5432")) {
    throw new Error("Refusing operation against a forbidden database port");
  }
  if (isLoopbackHost(target.host)) {
    throw new Error("Approved target must not be a loopback host");
  }
  if (target.host !== allowlist.host || target.database !== allowlist.database) {
    throw new Error("DATABASE_URL host/database is not on the dedicated allowlist");
  }
}

export function assertControlWriteTarget(
  target: ParsedDatabaseTarget,
  allowlist: { host: string; database: string } | null
): void {
  if (isLoopbackHost(target.host) && target.port === "55441") {
    return;
  }
  if (!allowlist) {
    throw new Error("Enable/disable allowlist environment is not configured");
  }
  assertApprovedSnapshotTarget(target, allowlist);
}

export function confirmationMatches(provided: string | undefined, expected: string): boolean {
  return (provided || "").trim() === expected;
}

export function logPublicOfferSnapshotFailure(
  category: string,
  code?: string
): void {
  const safeCategory = String(category).replace(/[^a-z0-9_]/gi, "").slice(0, 48);
  const safeCode = String(code || "").replace(/[^a-z0-9_]/gi, "").slice(0, 48);
  console.error("public_offer_snapshot", safeCategory, safeCode);
}
