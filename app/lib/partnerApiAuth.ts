/**
 * Partner Public REST API auth + JSON helpers (`/api/v1/partner/*`).
 * Bearer token → SHA-256 → PartnerApiKey (revokedAt null) + active Partner.
 */
import "server-only";

import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";

export const PARTNER_API_CANCEL_REASON_CODES = [
  "OTHERS",
  "WRONG_PURCHASE",
  "TRIP_CANCELLATION",
  "INSTALLATION_FAILURE",
  "NO_COVERAGE",
  "SERVICE_DEGRADATION",
  "CHANGE_OF_PLAN",
  "INCOMPATIBLE_DEVICE",
  "APN_FAILURE",
  "INTERMITTENT_CONNECTION",
  "BLOCKED_NETWORK",
  "DELETED_ESIM",
  "EARLY_EXPIRY",
  "HOTSPOT_NOT_WORKING",
  "IMSI_CHANGE",
  "LOCKED_DEVICE",
  "NO_VOICE_TEXT_SERVICES",
  "OVERCHARGED",
  "SLOW_SPEED",
  "TOP_UP_PACKAGE_FAILURE",
  "UNKNOWN_CHARGES",
  "UNABLE_TO_ACCESS_APPS",
  "QR_ISSUE_PARTNERS",
] as const;

export type PartnerApiCancelReasonCode =
  (typeof PARTNER_API_CANCEL_REASON_CODES)[number];

/** Alias requested by Partner API contract. */
export const CANCEL_REASON_CODES = PARTNER_API_CANCEL_REASON_CODES;

export function isPartnerApiCancelReasonCode(
  value: unknown
): value is PartnerApiCancelReasonCode {
  return (
    typeof value === "string" &&
    (PARTNER_API_CANCEL_REASON_CODES as readonly string[]).includes(
      value.trim().toUpperCase()
    )
  );
}

export function normalizePartnerApiCancelReason(
  value: unknown
): PartnerApiCancelReasonCode | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return isPartnerApiCancelReasonCode(code) ? code : null;
}

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

/** In-memory per-key rate limiter (per server instance). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function touchRateLimit(keyId: string): {
  ok: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const existing = rateBuckets.get(keyId);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(keyId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    };
  }
  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export function hashPartnerApiToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token || token.length < 16 || token.length > 256) return null;
  return token;
}

export type PartnerApiActor = {
  partnerId: string;
  userId: string;
  apiKeyId: string;
  discountBps: number;
  name: string;
  email: string;
  brandCompanyName: string | null;
  brandSupportEmail: string | null;
  brandButtonBg: string | null;
  brandButtonText: string | null;
};

export type PartnerApiAuthFailure = {
  ok: false;
  status: 401 | 403 | 429 | 503;
  error: string;
  message?: string;
  retryAfterSec?: number;
};

export type PartnerApiAuthSuccess = {
  ok: true;
  actor: PartnerApiActor;
};

export type PartnerApiAuthResult = PartnerApiAuthSuccess | PartnerApiAuthFailure;

/**
 * Global Partner Public API kill-switch.
 * Env PARTNER_API_DISABLED=1|true wins; otherwise OperationalControl PARTNER_PUBLIC_API.
 */
export async function isPartnerPublicApiGloballyPaused(): Promise<boolean> {
  const env = String(process.env.PARTNER_API_DISABLED ?? "")
    .trim()
    .toLowerCase();
  if (env === "1" || env === "true" || env === "yes") return true;
  try {
    const row = await prisma.operationalControl.findUnique({
      where: { key: "PARTNER_PUBLIC_API" },
      select: { paused: true },
    });
    return Boolean(row?.paused);
  } catch {
    // Fail closed for API surface when control store is unavailable.
    return true;
  }
}

/**
 * Validate Authorization: Bearer <token> against PartnerApiKey.
 * Updates lastUsedAt asynchronously (fire-and-forget).
 */
export async function authenticatePartnerApiRequest(
  req: NextRequest
): Promise<PartnerApiAuthResult> {
  if (await isPartnerPublicApiGloballyPaused()) {
    return {
      ok: false,
      status: 503,
      error: "Service Unavailable",
      message:
        "Partner Public API is temporarily paused. Please try again later.",
    };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      message: "Missing or invalid Authorization Bearer token.",
    };
  }

  const keyHash = hashPartnerApiToken(token);
  let row;
  try {
    row = await prisma.partnerApiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        revokedAt: true,
        partner: {
          select: {
            id: true,
            disabledAt: true,
            apiEnabled: true,
            discountBps: true,
            brandCompanyName: true,
            brandSupportEmail: true,
            brandButtonBg: true,
            brandButtonText: true,
            shareCompanyName: true,
            shareSupportEmail: true,
            shareButtonBackground: true,
            shareButtonTextColor: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
  } catch {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      message: "Invalid API key.",
    };
  }

  if (!row || row.revokedAt) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      message: "Invalid API key.",
    };
  }

  const partner = row.partner;
  const user = partner.user;
  if (
    !user ||
    user.deletedAt ||
    user.role !== Role.PARTNER ||
    partner.disabledAt
  ) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      message: "Partner account is disabled or not allowed.",
    };
  }

  if (!partner.apiEnabled) {
    return {
      ok: false,
      status: 403,
      error: "API_ACCESS_DISABLED",
      message: "API access is not enabled for this partner account.",
    };
  }

  const rate = touchRateLimit(row.id);
  if (!rate.ok) {
    return {
      ok: false,
      status: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Try again shortly.",
      retryAfterSec: rate.retryAfterSec,
    };
  }

  // Fire-and-forget lastUsedAt — never block the request.
  void prisma.partnerApiKey
    .updateMany({
      where: { id: row.id, revokedAt: null },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    ok: true,
    actor: {
      partnerId: partner.id,
      userId: user.id,
      apiKeyId: row.id,
      discountBps: partner.discountBps,
      name: user.name,
      email: user.email,
      brandCompanyName:
        partner.brandCompanyName ?? partner.shareCompanyName ?? null,
      brandSupportEmail:
        partner.brandSupportEmail ?? partner.shareSupportEmail ?? null,
      brandButtonBg:
        partner.brandButtonBg ?? partner.shareButtonBackground ?? null,
      brandButtonText:
        partner.brandButtonText ?? partner.shareButtonTextColor ?? null,
    },
  };
}

export function partnerApiJson(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...extraHeaders },
  });
}

export function partnerApiError(
  status: number,
  error: string,
  message?: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  const body: Record<string, unknown> = { success: false, error };
  if (message) body.message = message;
  return partnerApiJson(body, status, extraHeaders);
}

export function partnerApiAuthError(result: PartnerApiAuthFailure): NextResponse {
  const headers: Record<string, string> = {};
  if (result.status === 429 && result.retryAfterSec) {
    headers["Retry-After"] = String(result.retryAfterSec);
  }
  return partnerApiError(
    result.status,
    result.error,
    result.message,
    headers
  );
}

/** Timing-safe hex compare helper for tests / mint flows. */
export function partnerApiHashesEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
