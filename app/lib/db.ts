import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  authPrisma: PrismaClient | undefined;
};

/**
 * URL for migrations + NextAuth Prisma client.
 * Prefer explicit DIRECT_URL. Fall back to DATABASE_URL (Prisma Postgres /
 * some hosts only accept the pooled endpoint — do not strip pgbouncer blindly).
 */
export function resolveDirectDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
  directUrl = process.env.DIRECT_URL
): string | undefined {
  const explicit = (directUrl ?? "").trim();
  if (explicit) return explicit;
  const pooled = (databaseUrl ?? "").trim();
  return pooled || undefined;
}

function withClientConnectionLimit(
  connectionUrl: string | undefined,
  limit: number
): string | undefined {
  if (!connectionUrl) return undefined;
  try {
    const url = new URL(connectionUrl);
    url.searchParams.set("connection_limit", String(limit));
    return url.toString();
  } catch {
    return connectionUrl;
  }
}

function createPrismaClient(connectionUrl: string | undefined) {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: connectionUrl ? { db: { url: connectionUrl } } : undefined,
  });
}

/**
 * App-wide Prisma singleton (pooled DATABASE_URL — PgBouncer-friendly).
 * Always reuse globalThis so warm serverless isolates and Turbopack/HMR do not
 * open a new pool on every module re-evaluate.
 * Request handlers must never call $disconnect() on this instance.
 */
export const prisma =
  globalForPrisma.prisma ?? createPrismaClient(process.env.DATABASE_URL);

globalForPrisma.prisma = prisma;

/**
 * NextAuth / credentials authorize / JWT user loads.
 * Separate PrismaClient (DIRECT_URL, connection_limit=1) so login is not
 * blocked when the app pool is exhausted (P2024 under partner checkout).
 */
export const authPrisma =
  globalForPrisma.authPrisma ??
  createPrismaClient(
    withClientConnectionLimit(resolveDirectDatabaseUrl(), 1)
  );

globalForPrisma.authPrisma = authPrisma;

/** Prisma P2024 — connection pool exhausted / timed out waiting for a connection. */
export function isPrismaPoolTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "P2024") return true;
  const message = String((error as { message?: unknown }).message || "");
  return /Timed out fetching a new connection from the connection pool/i.test(
    message
  );
}

export const PRISMA_TEMPORARY_UNAVAILABLE =
  "Service is temporarily unavailable. Please try again.";
