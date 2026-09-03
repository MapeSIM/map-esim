import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl(): string | undefined {
  const url = (process.env.DATABASE_URL ?? "").trim();
  return url || undefined;
}

function createPrismaClient() {
  const url = resolveDatabaseUrl();
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * App-wide Prisma singleton.
 * Reuse globalThis in all environments so Vercel serverless invocations do not
 * open a fresh pool (default connection_limit=5) on every cold start.
 * Request handlers must never call $disconnect() on this instance.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

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

/** Database unavailable at client init or first query (missing/invalid DATABASE_URL). */
export function isPrismaClientInitializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: unknown }).name || "");
  if (name === "PrismaClientInitializationError") return true;
  const message = String((error as { message?: unknown }).message || "");
  return (
    /Environment variable not found: DATABASE_URL/i.test(message) ||
    /Can't reach database server/i.test(message) ||
    /invalid database string/i.test(message) ||
    /The provided database string is invalid/i.test(message)
  );
}

export function isPrismaUnavailable(error: unknown): boolean {
  return isPrismaPoolTimeout(error) || isPrismaClientInitializationError(error);
}

export const PRISMA_TEMPORARY_UNAVAILABLE =
  "Service is temporarily unavailable. Please try again.";
