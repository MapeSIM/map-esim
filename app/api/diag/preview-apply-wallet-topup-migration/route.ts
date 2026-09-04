/**
 * TEMPORARY Preview-only additive migration runner.
 * Applies ONLY WalletTopup display columns on proven sandbox DB.
 * Fail-closed outside simpaisa-sandbox Preview; hash-gated.
 * Delete immediately after one successful call.
 */
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_PREVIEW_HASH_PREFIX = "ac3e2fb9ea3bfb5e";
const FORBIDDEN_PROD_HASH_PREFIX = "8e9b5fcaa648d171";
const MIGRATION_NAME = "20260904120000_add_wallet_topup_simpaisa_display_fields";
/** Prisma checksum of LF-normalized migration.sql contents. */
const MIGRATION_CHECKSUM =
  "0614cffb3b06bbd504be76067455939bbe75756e9161fc506a600e79b71c4ad1";

function sha256Prefix16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16).toLowerCase();
}

function isSimpaisaSandboxHost(req: NextRequest): boolean {
  const appBase = (process.env.APP_BASE_URL ?? "").trim().toLowerCase();
  const host = (req.headers.get("host") ?? "").trim().toLowerCase();
  const marker = "simpaisa-sandbox";
  return (
    appBase.includes(marker) ||
    host.includes(marker) ||
    host.includes("git-simpaisa-sandbox")
  );
}

function deny(reason: string): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status: 403 });
}

async function columnExists(column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'WalletTopup'
        AND column_name = ${column}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function counts() {
  const [User, WalletAccount, WalletTopup, Order] = await Promise.all([
    prisma.user.count(),
    prisma.walletAccount.count(),
    prisma.walletTopup.count(),
    prisma.order.count(),
  ]);
  return { User, WalletAccount, WalletTopup, Order };
}

export async function POST(req: NextRequest) {
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim();
  const simpaisaEnv = (process.env.SIMPAISA_ENVIRONMENT ?? "").trim().toLowerCase();

  if (vercelEnv !== "preview") return deny("not_preview");
  if (simpaisaEnv !== "sandbox") return deny("not_sandbox");
  if (!isSimpaisaSandboxHost(req)) return deny("host_mismatch");

  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl || databaseUrl === "[SENSITIVE]") {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL_unavailable" },
      { status: 500 }
    );
  }

  const previewHash = sha256Prefix16(databaseUrl);
  if (previewHash === FORBIDDEN_PROD_HASH_PREFIX) {
    return deny("production_hash_blocked");
  }
  if (previewHash !== EXPECTED_PREVIEW_HASH_PREFIX) {
    return deny("unexpected_preview_hash");
  }

  const before = await counts();
  const beforeCols = {
    walletOperatorId: await columnExists("walletOperatorId"),
    customerMsisdnMasked: await columnExists("customerMsisdnMasked"),
  };

  // Exact reviewed SQL only — additive, nullable TEXT, IF NOT EXISTS.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "walletOperatorId" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "customerMsisdnMasked" TEXT`
  );

  // Record migration so future prisma migrate deploy stays consistent.
  const existing = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name = ${MIGRATION_NAME}
    LIMIT 1
  `;
  if (existing.length === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      randomUUID(),
      MIGRATION_CHECKSUM,
      MIGRATION_NAME
    );
  }

  const after = await counts();
  const afterCols = {
    walletOperatorId: await columnExists("walletOperatorId"),
    customerMsisdnMasked: await columnExists("customerMsisdnMasked"),
  };

  const countsUnchanged =
    before.User === after.User &&
    before.WalletAccount === after.WalletAccount &&
    before.WalletTopup === after.WalletTopup &&
    before.Order === after.Order;

  const expectedCounts =
    after.User === 4 &&
    after.WalletAccount === 1 &&
    after.WalletTopup === 15 &&
    after.Order === 0;

  return NextResponse.json({
    ok: afterCols.walletOperatorId && afterCols.customerMsisdnMasked && countsUnchanged,
    PREVIEW_DB_HASH_PREFIX: previewHash,
    PROD_DB_HASH_PREFIX: FORBIDDEN_PROD_HASH_PREFIX,
    HASHES_DIFFER: "YES",
    migration: MIGRATION_NAME,
    columns_before: beforeCols,
    columns_after: afterCols,
    counts_before: before,
    counts_after: after,
    counts_unchanged: countsUnchanged,
    expected_counts_match: expectedCounts,
    production_untouched: true,
  });
}

export async function GET() {
  return deny("post_only");
}
