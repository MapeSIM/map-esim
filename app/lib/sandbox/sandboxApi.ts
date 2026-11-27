/**
 * Sandbox Partner API helpers — Neon-backed when a SandboxApiKey exists.
 * Still zero supplier calls / zero live PartnerProfile writes.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  type SandboxCatalogItem,
} from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_SESSION_COOKIE,
  createSandboxOrderForPartner,
  findSandboxPartnerByApiKey,
  getSandboxPartnerById,
  isSandboxApiKeyFormat,
  mintDemoActivationCode,
  newSandboxOrderId,
  topUpSandboxPartner,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";
import { getGlobalSandboxApiEnabled } from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_DEFAULT_DISCOUNT_PERCENT,
  clampSandboxDiscountPercent,
  sandboxPartnerPriceCents,
} from "@/app/lib/sandbox/sandboxPricing";
import { prisma } from "@/app/lib/db";

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

export type SandboxAuthOk = {
  ok: true;
  apiKey: string;
  partnerId: string | null;
  /** Authenticated via httpOnly portal cookie (UI checkout / wallet). */
  viaSession?: boolean;
};

function extractSandboxApiToken(req: NextRequest): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const match = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  if (match?.[1]) return match[1].trim();
  const headerKey =
    req.headers.get("x-api-key") ?? req.headers.get("X-Api-Key");
  const token = (headerKey ?? "").trim();
  return token || null;
}

function resolveSandboxPartnerIdFromRequest(
  req: NextRequest
): string | null {
  const token =
    req.cookies.get(SANDBOX_SESSION_COOKIE)?.value ??
    req.cookies.get("map_sandbox_sid")?.value ??
    null;
  return verifySandboxSession(token);
}

/**
 * Resolve Bearer / x-api-key sb_test_* against Neon SandboxApiKey.
 * If no API key header is present, fall back to the logged-in sandbox
 * portal session cookie so storefront UI checkout never depends on
 * localStorage keys or Public API toggle state.
 */
export async function authenticateSandboxRequest(
  req: NextRequest
): Promise<SandboxAuthOk | { ok: false; response: NextResponse }> {
  const token = extractSandboxApiToken(req);

  if (token) {
    // Public API path — honor global + per-partner API toggles.
    const globalOn = await getGlobalSandboxApiEnabled();
    if (!globalOn) {
      return {
        ok: false,
        response: sandboxError(
          503,
          "Service Unavailable",
          "Sandbox Partner API is temporarily disabled by an administrator."
        ),
      };
    }
    if (!isSandboxApiKeyFormat(token)) {
      return {
        ok: false,
        response: sandboxError(
          401,
          "Unauthorized",
          "Sandbox keys must match sb_test_<8+ chars>. No live Partner keys are accepted here."
        ),
      };
    }

    const found = await findSandboxPartnerByApiKey(token);
    if (found) {
      if (!found.apiEnabled) {
        return {
          ok: false,
          response: sandboxError(
            403,
            "Forbidden",
            "Sandbox API access is disabled for this partner account."
          ),
        };
      }
      return { ok: true, apiKey: token, partnerId: found.partnerId };
    }

    return {
      ok: false,
      response: sandboxError(
        401,
        "Unauthorized",
        "Unknown sandbox API key. Ask an administrator to provision a sandbox partner and API key."
      ),
    };
  }

  // Portal UI path — session cookie; independent of Public API toggles.
  const sessionPartnerId = resolveSandboxPartnerIdFromRequest(req);
  if (sessionPartnerId) {
    const partner = await getSandboxPartnerById(sessionPartnerId);
    if (partner && !partner.disabledAt) {
      return {
        ok: true,
        apiKey: `session:${sessionPartnerId}`,
        partnerId: sessionPartnerId,
        viaSession: true,
      };
    }
  }

  return {
    ok: false,
    response: sandboxError(
      401,
      "Unauthorized",
      "Missing or invalid API key. Send Authorization: Bearer sb_test_…, or sign in to the sandbox portal."
    ),
  };
}

export function buildSandboxOrderPayload(input: {
  offerId: string;
  quantity?: number;
  seed: string;
  /** Retail list price in USD cents (authoritative when provided). */
  retailPriceCents?: number | null;
  /** Partner discount percent (default 3). */
  discountPercent?: number;
  planName?: string | null;
  region?: string | null;
}):
  | {
      ok: true;
      order: Record<string, unknown>;
      item: SandboxCatalogItem | null;
      persist: {
        orderId: string;
        region: string;
        planName: string;
        totalCents: number;
        iccid: string;
        activationCode: string;
        matchingId: string;
        smdpAddress: string;
      };
    }
  | { ok: false; response: NextResponse } {
  const item = SANDBOX_CATALOG.find((c) => c.id === input.offerId) ?? null;
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

  const retailFromBody =
    typeof input.retailPriceCents === "number" &&
    Number.isInteger(input.retailPriceCents) &&
    input.retailPriceCents > 0
      ? input.retailPriceCents
      : null;
  const retailCents = retailFromBody ?? item?.priceCents ?? null;
  if (retailCents == null) {
    return {
      ok: false,
      response: sandboxError(
        400,
        "Validation error",
        item
          ? "Invalid retail price."
          : `Unknown offerId. Pass retailPriceCents, or use one of: ${SANDBOX_CATALOG.map((c) => c.id).join(", ")}`
      ),
    };
  }

  const discountPercent = clampSandboxDiscountPercent(
    input.discountPercent ?? SANDBOX_DEFAULT_DISCOUNT_PERCENT
  );
  const unitPartnerCents = sandboxPartnerPriceCents(
    retailCents,
    discountPercent
  );
  if (unitPartnerCents == null || unitPartnerCents <= 0) {
    return {
      ok: false,
      response: sandboxError(400, "Validation error", "Unable to price this offer."),
    };
  }

  const orderId = newSandboxOrderId();
  const demo = mintDemoActivationCode(`${orderId}:${input.seed}`);
  const totalCents = unitPartnerCents * qty;
  const region =
    (input.region ?? "").trim() || item?.region || "Sandbox";
  const planName =
    (input.planName ?? "").trim() || item?.name || "Sandbox eSIM";

  const persist = {
    orderId,
    region,
    planName,
    totalCents,
    iccid: demo.iccid,
    activationCode: demo.activationCode,
    matchingId: demo.matchingId,
    smdpAddress: demo.smdpAddress,
  };

  return {
    ok: true,
    item,
    persist,
    order: {
      ...persist,
      status: "COMPLETED",
      offerId: input.offerId,
      quantity: qty,
      retailPriceCents: retailCents,
      partnerPriceCents: unitPartnerCents,
      discountPercent,
      priceCents: unitPartnerCents,
      currency: "USD",
      qr: {
        format: "LPA",
        data: demo.activationCode,
      },
      createdAt: new Date().toISOString(),
      sandbox: true,
      note: "Sandbox order persisted in Neon SandboxOrder (not live Order).",
    },
  };
}

/** @deprecated use buildSandboxOrderPayload + persist */
export function buildSandboxOrder(input: {
  offerId: string;
  quantity?: number;
  apiKey: string;
}):
  | {
      ok: true;
      order: Record<string, unknown>;
      item: SandboxCatalogItem | null;
    }
  | { ok: false; response: NextResponse } {
  const built = buildSandboxOrderPayload({
    offerId: input.offerId,
    quantity: input.quantity,
    seed: input.apiKey,
  });
  if (!built.ok) return built;
  return { ok: true, order: built.order, item: built.item };
}

export async function persistSandboxOrderFromApi(input: {
  partnerId: string;
  offerId: string;
  quantity?: number;
  apiKey: string;
  retailPriceCents?: number | null;
  planName?: string | null;
  region?: string | null;
}): Promise<
  | { ok: true; order: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const partner = await getSandboxPartnerById(input.partnerId);
  const discountPercent =
    partner?.discountPercent ?? SANDBOX_DEFAULT_DISCOUNT_PERCENT;

  const built = buildSandboxOrderPayload({
    offerId: input.offerId,
    quantity: input.quantity,
    seed: input.apiKey,
    retailPriceCents: input.retailPriceCents,
    discountPercent,
    planName: input.planName,
    region: input.region,
  });
  if (!built.ok) return built;

  const saved = await createSandboxOrderForPartner({
    partnerId: input.partnerId,
    offerId: input.offerId,
    quantity: input.quantity,
    orderPayload: built.persist,
  });
  if (!saved.ok) {
    return {
      ok: false,
      response: sandboxError(402, "Insufficient funds", saved.error),
    };
  }
  return { ok: true, order: built.order };
}

export async function sandboxWalletResponse(partnerId: string, limit = 20) {
  const { buildSandboxWalletPayload } = await import(
    "@/app/lib/sandbox/sandboxPartnerApiParity"
  );
  const payload = await buildSandboxWalletPayload(partnerId, limit);
  if (!payload) {
    return sandboxError(404, "Not found", "Sandbox partner not found.");
  }
  return sandboxJson(payload);
}

export async function sandboxWalletTopUpResponse(
  partnerId: string,
  amountUsd: number
) {
  const usd = Math.round(amountUsd);
  if (![100, 250, 500, 750, 1000].includes(usd)) {
    return sandboxError(
      400,
      "Invalid amount",
      "Choose a top-up of $100, $250, $500, $750, or $1000."
    );
  }
  const result = await topUpSandboxPartner(partnerId, usd * 100, {
    label: `Sandbox top-up · $${usd}`,
  });
  if (!result.ok) {
    return sandboxError(400, "Top-up failed", result.error);
  }
  return sandboxWalletResponse(partnerId);
}

export async function sandboxOrdersListResponse(
  partnerId: string,
  options?: { page?: number; limit?: number }
) {
  const { buildSandboxOrdersListPayload } = await import(
    "@/app/lib/sandbox/sandboxPartnerApiParity"
  );
  const payload = await buildSandboxOrdersListPayload(partnerId, options);
  return sandboxJson(payload);
}

export async function sandboxEsimResponse(partnerId: string, iccid: string) {
  const { buildSandboxEsimUsageByIccidPayload } = await import(
    "@/app/lib/sandbox/sandboxPartnerApiParity"
  );
  const payload = await buildSandboxEsimUsageByIccidPayload(partnerId, iccid);
  if (payload) return sandboxJson(payload);

  const demo = mintDemoActivationCode(iccid);
  return sandboxJson({
    success: true,
    sandbox: true,
    environment: "sandbox",
    orderId: null,
    iccid: demo.iccid,
    usage: {
      status: "ACTIVE",
      statusLabel: "Active",
      initialDataGB: 1,
      remainingDataGB: 0.88,
      usedDataGB: 0.12,
      usagePercent: 12,
      isUnlimited: false,
      activatedAt: null,
      expiresAt: null,
      daysRemaining: 30,
      isActivated: true,
      isExpired: false,
      dataUsedMb: 128,
      dataTotalMb: 1024,
      percentUsed: 12.5,
    },
    esim: {
      iccid: demo.iccid,
      status: "ACTIVE",
      smdpAddress: demo.smdpAddress,
      matchingId: demo.matchingId,
      activationCode: demo.activationCode,
      lpa: demo.activationCode,
      usage: {
        dataUsedMb: 128,
        dataTotalMb: 1024,
        percentUsed: 12.5,
      },
      qr: { format: "LPA", data: demo.activationCode },
      note: "Synthetic demo eSIM (no matching SandboxOrder).",
    },
  });
}

export async function countSandboxPartners(): Promise<number> {
  return prisma.sandboxPartner.count();
}
