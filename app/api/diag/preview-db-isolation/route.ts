/**
 * TEMPORARY Preview-only DB identity diagnostic.
 * Fail-closed outside simpaisa-sandbox Preview + Simpaisa sandbox.
 * Never returns DATABASE_URL or credential material.
 * Delete immediately after one verification call.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trusted Production-style URL SHA-256 prefix (first 16 hex chars, lowercase). */
const PROD_DB_HASH_PREFIX = "8e9b5fcaa648d171";

function sha256Prefix16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16).toLowerCase();
}

function isSimpaisaSandboxHost(req: NextRequest): boolean {
  const appBase = (process.env.APP_BASE_URL ?? "").trim().toLowerCase();
  const host = (req.headers.get("host") ?? "").trim().toLowerCase();
  const marker = "simpaisa-sandbox";
  if (appBase.includes(marker)) return true;
  if (host.includes(marker)) return true;
  // Deployment alias pattern: map-esim-git-simpaisa-sandbox-...
  if (host.includes("git-simpaisa-sandbox")) return true;
  return false;
}

function deny(): NextResponse {
  return new NextResponse("Forbidden", { status: 403 });
}

export async function GET(req: NextRequest) {
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim();
  const simpaisaEnv = (process.env.SIMPAISA_ENVIRONMENT ?? "").trim().toLowerCase();

  if (vercelEnv !== "preview") return deny();
  if (simpaisaEnv !== "sandbox") return deny();
  if (!isSimpaisaSandboxHost(req)) return deny();

  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl || databaseUrl === "[SENSITIVE]") {
    return NextResponse.json(
      {
        PREVIEW_DB_HASH_PREFIX: null,
        PROD_DB_HASH_PREFIX: PROD_DB_HASH_PREFIX,
        HASHES_DIFFER: null,
        User: null,
        WalletAccount: null,
        WalletTopup: null,
        Order: null,
        PREVIEW_DB_SAME_AS_PRODUCTION: "UNKNOWN",
        PREVIEW_DB_ISOLATED: "UNKNOWN",
        error: "DATABASE_URL_unavailable",
      },
      { status: 500 }
    );
  }

  const previewHash = sha256Prefix16(databaseUrl);
  const hashesDiffer = previewHash !== PROD_DB_HASH_PREFIX;

  const [userCount, walletAccountCount, walletTopupCount, orderCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.walletAccount.count(),
      prisma.walletTopup.count(),
      prisma.order.count(),
    ]);

  // Production-style profile historically had dozens of users / many orders.
  // Sandbox profile is small (single-digit users).
  const looksProductionSized =
    userCount >= 20 || orderCount >= 20 || walletAccountCount >= 20;
  const looksSandboxSized =
    userCount > 0 && userCount <= 10 && orderCount <= 10;

  let sameAsProduction: "YES" | "NO" | "UNKNOWN" = "UNKNOWN";
  let isolated: "YES" | "NO" | "UNKNOWN" = "UNKNOWN";

  if (!hashesDiffer) {
    sameAsProduction = "YES";
    isolated = "NO";
  } else if (hashesDiffer && looksSandboxSized && !looksProductionSized) {
    sameAsProduction = "NO";
    isolated = "YES";
  } else if (hashesDiffer && looksProductionSized) {
    // Different URL hash but production-sized data — unexpected; treat cautiously.
    sameAsProduction = "UNKNOWN";
    isolated = "UNKNOWN";
  } else if (hashesDiffer) {
    sameAsProduction = "NO";
    isolated = "YES";
  }

  return NextResponse.json({
    PREVIEW_DB_HASH_PREFIX: previewHash,
    PROD_DB_HASH_PREFIX: PROD_DB_HASH_PREFIX,
    HASHES_DIFFER: hashesDiffer ? "YES" : "NO",
    User: userCount,
    WalletAccount: walletAccountCount,
    WalletTopup: walletTopupCount,
    Order: orderCount,
    PREVIEW_DB_SAME_AS_PRODUCTION: sameAsProduction,
    PREVIEW_DB_ISOLATED: isolated,
  });
}
