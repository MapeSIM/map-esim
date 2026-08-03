import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * App-wide Prisma singleton.
 * Development hot-reload reuses globalThis so Turbopack/HMR does not open
 * a new pool (default connection_limit=5) on every module re-evaluate.
 * Request handlers must never call $disconnect() on this instance.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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
