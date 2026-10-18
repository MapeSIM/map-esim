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

/**
 * Serverless-safe default: one TCP slot per warm isolate against PgBouncer/Neon.
 * Override with PRISMA_CONNECTION_LIMIT (1–10) when the pooled URL omits
 * connection_limit. Never raises a limit already set on DATABASE_URL.
 */
function resolveAppConnectionLimit(): number {
  const raw = Number((process.env.PRISMA_CONNECTION_LIMIT ?? "").trim());
  if (Number.isFinite(raw) && raw >= 1 && raw <= 10) return Math.floor(raw);
  return 1;
}

function withClientConnectionLimit(
  connectionUrl: string | undefined,
  limit: number,
  options?: { force?: boolean; poolTimeoutSec?: number }
): string | undefined {
  if (!connectionUrl) return undefined;
  try {
    const url = new URL(connectionUrl);
    if (options?.force || !url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(limit));
    }
    const poolTimeout = options?.poolTimeoutSec;
    if (
      poolTimeout != null &&
      poolTimeout > 0 &&
      !url.searchParams.has("pool_timeout")
    ) {
      url.searchParams.set("pool_timeout", String(poolTimeout));
    }
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
  globalForPrisma.prisma ??
  createPrismaClient(
    withClientConnectionLimit(process.env.DATABASE_URL, resolveAppConnectionLimit(), {
      poolTimeoutSec: 20,
    })
  );

globalForPrisma.prisma = prisma;

/**
 * NextAuth / credentials authorize / JWT user loads.
 * Separate PrismaClient (DIRECT_URL, connection_limit=1) so login is not
 * blocked when the app pool is exhausted (P2024 under partner checkout).
 */
export const authPrisma =
  globalForPrisma.authPrisma ??
  createPrismaClient(
    withClientConnectionLimit(resolveDirectDatabaseUrl(), 1, { force: true })
  );

globalForPrisma.authPrisma = authPrisma;

const PRISMA_TRANSIENT_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the pool
]);

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

/**
 * Transient Prisma / DB connectivity failures that are safe to retry briefly
 * (pool exhaustion, cold init, brief Neon/PgBouncer blips).
 */
export function isPrismaTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isPrismaPoolTimeout(error)) return true;

  const name = String((error as { name?: unknown }).name || "");
  if (
    /PrismaClientInitializationError|PrismaClientRustPanicError|PrismaClientUnknownRequestError/i.test(
      name
    )
  ) {
    return true;
  }

  const code = String((error as { code?: unknown }).code || "").trim();
  if (code && PRISMA_TRANSIENT_CODES.has(code)) return true;

  const message = String((error as { message?: unknown }).message || "");
  return (
    /Can't reach database server/i.test(message) ||
    /Server has closed the connection/i.test(message) ||
    /Engine is not yet connected/i.test(message) ||
    /Connection reset|ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(message) ||
    /Too many database connections|remaining connection slots are reserved/i.test(
      message
    ) ||
    /Timed out fetching a new connection from the connection pool/i.test(
      message
    )
  );
}

/**
 * Short retry for transient Prisma connectivity / pool errors.
 * Does not retry business/constraint failures (P2002, etc.).
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options?: { retries?: number }
): Promise<T> {
  const retries = Math.max(0, Math.min(options?.retries ?? 2, 4));
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isPrismaTransientError(error) || attempt === retries) {
        throw error;
      }
      const delayMs =
        40 * 2 ** attempt + Math.floor(Math.random() * 40);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export const PRISMA_TEMPORARY_UNAVAILABLE =
  "Service is temporarily unavailable. Please try again.";
