/**
 * Sandbox Partner API helpers — mock only (server).
 * No Neon writes, no supplier calls.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  type SandboxCatalogItem,
} from "@/app/lib/sandbox/sandboxShared";

export {
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  SANDBOX_TEST_KEY_PREFIX,
  generateSandboxTestKey,
  type SandboxCatalogItem,
} from "@/app/lib/sandbox/sandboxShared";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Sandbox": "true",
} as const;

export function sandboxJson(
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function sandboxError(
  status: number,
  error: string,
  message: string
): NextResponse {
  return sandboxJson({ success: false, error, message, sandbox: true }, status);
}

/** Accept any Bearer sb_test_… key (8+ charset suffix). */
export function authenticateSandboxRequest(
  req: NextRequest
): { ok: true; apiKey: string } | { ok: false; response: NextResponse } {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const match = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  const token = (match?.[1] ?? "").trim();
  if (!token) {
    return {
      ok: false,
      response: sandboxError(
        401,
        "Unauthorized",
        "Missing or invalid Authorization Bearer token. Use a sandbox key like sb_test_…"
      ),
    };
  }
  if (!/^sb_test_[A-Za-z0-9_-]{8,}$/.test(token)) {
    return {
      ok: false,
      response: sandboxError(
        401,
        "Unauthorized",
        "Sandbox keys must match sb_test_<8+ chars>. No live Partner keys are accepted here."
      ),
    };
  }
  return { ok: true, apiKey: token };
}

function mockIccid(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const mid = String(h).padStart(10, "0").slice(0, 10);
  return `8944${mid}000000`.slice(0, 19);
}

function mockMatchingId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  return `SNDBOX${h.toString(16).toUpperCase().padStart(8, "0")}`;
}

export function buildSandboxOrder(input: {
  offerId: string;
  quantity?: number;
  apiKey: string;
}):
  | {
      ok: true;
      order: Record<string, unknown>;
      item: SandboxCatalogItem;
    }
  | { ok: false; response: NextResponse } {
  const item = SANDBOX_CATALOG.find((c) => c.id === input.offerId);
  if (!item) {
    return {
      ok: false,
      response: sandboxError(
        400,
        "Validation error",
        `Unknown offerId. Use one of: ${SANDBOX_CATALOG.map((c) => c.id).join(", ")}`
      ),
    };
  }
  const qty = input.quantity ?? 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 5) {
    return {
      ok: false,
      response: sandboxError(
        400,
        "Validation error",
        "quantity must be an integer between 1 and 5."
      ),
    };
  }

  const orderId = `sandbox_ord_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const seed = `${orderId}:${input.apiKey}`;
  const iccid = mockIccid(seed);
  const matchingId = mockMatchingId(seed);
  const smdpAddress = "smdp.sandbox.mapesim.store";
  const activationCode = `LPA:1$${smdpAddress}$${matchingId}`;
  const totalCents = item.priceCents * qty;

  return {
    ok: true,
    item,
    order: {
      orderId,
      status: "COMPLETED",
      offerId: item.id,
      region: item.region,
      planName: item.name,
      quantity: qty,
      priceCents: item.priceCents,
      totalCents,
      currency: "USD",
      iccid,
      smdpAddress,
      matchingId,
      activationCode,
      qr: {
        format: "LPA",
        data: activationCode,
        mockImageHint: `/sandbox/demo-store#qr-${orderId}`,
      },
      createdAt: new Date().toISOString(),
      sandbox: true,
      note: "Mock order — zero Neon writes, zero supplier calls.",
    },
  };
}

export function buildSandboxEsim(iccid: string): Record<string, unknown> | null {
  const cleaned = iccid.trim();
  if (
    !/^89\d{10,18}$/.test(cleaned) &&
    !cleaned.startsWith("8944") &&
    !cleaned.startsWith("sandbox_") &&
    cleaned.length < 10
  ) {
    return null;
  }
  const matchingId = mockMatchingId(cleaned);
  const smdpAddress = "smdp.sandbox.mapesim.store";
  const activationCode = `LPA:1$${smdpAddress}$${matchingId}`;
  return {
    iccid: cleaned.startsWith("89") ? cleaned : mockIccid(cleaned),
    status: "ACTIVE",
    smdpAddress,
    matchingId,
    activationCode,
    usage: {
      dataUsedMb: 128,
      dataTotalMb: 1024,
      percentUsed: 12.5,
    },
    qr: {
      format: "LPA",
      data: activationCode,
    },
    sandbox: true,
  };
}
