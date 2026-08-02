import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Access tokens authorize install/order views for ~30 days. */
export const ORDER_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;

const TOKEN_PREFIX = "v1";
const MAX_TOKEN_LEN = 512;
const MAX_ORDER_ID_LEN = 120;

function readSecret(): string | null {
  const explicit = (process.env.ORDER_ACCESS_SECRET ?? "").trim();
  if (explicit.length >= 32) return explicit;

  // Deterministic server-only fallback so staging works without a new env var.
  // Still never exposed to the client.
  const email = (process.env.VESIM_EMAIL ?? "").trim();
  const password = (process.env.VESIM_PASSWORD ?? "").trim();
  if (!email || !password) return null;

  return createHash("sha256")
    .update(`map-esim-order-access:v1:${email}:${password}`)
    .digest("hex");
}

function base64UrlEncode(value: string | Buffer): string {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToBuffer(value: string): Buffer | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + "=".repeat(padLen), "base64");
  } catch {
    return null;
  }
}

function signPayload(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

function safeEqualBuffers(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeEqualStrings(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

export type OrderAccessClaims = {
  orderId: string;
  expiresAt: number;
};

/**
 * Creates an opaque HMAC-signed order access token.
 * Contains only orderId + expiry — never install secrets.
 */
export function createOrderAccessToken(
  orderId: string,
  ttlSeconds: number = ORDER_ACCESS_TTL_SECONDS
): string | null {
  const id = orderId.trim();
  if (!id || id.length > MAX_ORDER_ID_LEN) return null;

  const secret = readSecret();
  if (!secret) return null;

  const ttl = Number.isFinite(ttlSeconds)
    ? Math.trunc(ttlSeconds)
    : ORDER_ACCESS_TTL_SECONDS;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${TOKEN_PREFIX}.${base64UrlEncode(id)}.${expiresAt}`;
  const signature = signPayload(secret, payload);
  return `${payload}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a server-issued order access token.
 * Never logs the token. Uses timing-safe signature comparison.
 */
export function verifyOrderAccessToken(
  token: string,
  expectedOrderId?: string
): OrderAccessClaims | null {
  const raw = token.trim();
  if (!raw || raw.length > MAX_TOKEN_LEN) return null;

  const secret = readSecret();
  if (!secret) return null;

  const parts = raw.split(".");
  if (parts.length !== 4) return null;

  const [prefix, orderIdPart, expPart, sigPart] = parts;
  if (prefix !== TOKEN_PREFIX) return null;
  if (!/^\d{9,12}$/.test(expPart)) return null;

  const orderIdBuf = base64UrlDecodeToBuffer(orderIdPart);
  const sigBuf = base64UrlDecodeToBuffer(sigPart);
  if (!orderIdBuf || !sigBuf) return null;

  const orderId = orderIdBuf.toString("utf8").trim();
  if (!orderId || orderId.length > MAX_ORDER_ID_LEN) return null;

  const payload = `${prefix}.${orderIdPart}.${expPart}`;
  const expectedSig = signPayload(secret, payload);
  if (!safeEqualBuffers(sigBuf, expectedSig)) return null;

  const expiresAt = Number.parseInt(expPart, 10);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  if (expectedOrderId != null && expectedOrderId.trim()) {
    if (!safeEqualStrings(orderId, expectedOrderId.trim())) return null;
  }

  return { orderId, expiresAt };
}

export function extractAccessTokenFromRequest(
  req: NextRequest
): string | null {
  const fromQuery = req.nextUrl.searchParams.get("access")?.trim() || "";
  if (fromQuery) return fromQuery;

  const header = req.headers.get("authorization")?.trim() || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]?.trim()) return match[1].trim();

  return null;
}

/**
 * Authorizes an order-scoped install/details request.
 * Returns claims on success, or a generic 404 response (no leakage).
 */
export function authorizeOrderAccess(
  req: NextRequest
):
  | { ok: true; orderId: string; accessToken: string }
  | { ok: false; response: NextResponse } {
  const accessToken = extractAccessTokenFromRequest(req);
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      ),
    };
  }

  const claimedOrderId = req.nextUrl.searchParams.get("orderId")?.trim() || "";
  const claims = verifyOrderAccessToken(
    accessToken,
    claimedOrderId || undefined
  );

  if (!claims) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      ),
    };
  }

  // If orderId was supplied and mismatched, verify already failed.
  // Prefer token orderId as the authoritative id.
  return {
    ok: true,
    orderId: claims.orderId,
    accessToken,
  };
}

export function buildAuthorizedOrderPath(
  path: string,
  orderId: string,
  accessToken: string,
  extraParams?: Record<string, string>
): string {
  const params = new URLSearchParams({
    orderId,
    access: accessToken,
    ...(extraParams || {}),
  });
  return `${path}?${params.toString()}`;
}

export function getOrderAccessSuccessUrl(
  orderId: string,
  accessToken: string
): string {
  const base = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mapesim.com"
  ).trim();

  let origin = "https://mapesim.com";
  try {
    const parsed = new URL(base);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      origin = parsed.origin;
    }
  } catch {
    // keep default
  }

  const params = new URLSearchParams({
    orderId,
    access: accessToken,
  });
  return `${origin}/success?${params.toString()}`;
}
