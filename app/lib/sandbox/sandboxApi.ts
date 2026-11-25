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
  createSandboxOrderForPartner,
  findSandboxPartnerByApiKey,
  isSandboxApiKeyFormat,
  mintDemoActivationCode,
  newSandboxOrderId,
  topUpSandboxPartner,
} from "@/app/lib/sandbox/sandboxPartnerDb";
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

/** Resolve Bearer or x-api-key sb_test_* against Neon SandboxApiKey. */
export async function authenticateSandboxRequest(
  req: NextRequest
): Promise<SandboxAuthOk | { ok: false; response: NextResponse }> {
  const token = extractSandboxApiToken(req);
  if (!token) {
    return {
      ok: false,
      response: sandboxError(
        401,
        "Unauthorized",
        "Missing or invalid API key. Send Authorization: Bearer sb_test_… or x-api-key: sb_test_…"
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
    return { ok: true, apiKey: token, partnerId: found.partnerId };
  }

  // No Neon key: reject so UI/API stay consistent with provisioned partners.
  return {
    ok: false,
    response: sandboxError(
      401,
      "Unauthorized",
      "Unknown sandbox API key. Create a sandbox partner on mapesim.store/sandbox/admin and use the issued sb_test_ key."
    ),
  };
}

export function buildSandboxOrderPayload(input: {
  offerId: string;
  quantity?: number;
  seed: string;
}):
  | {
      ok: true;
      order: Record<string, unknown>;
      item: SandboxCatalogItem;
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

  const orderId = newSandboxOrderId();
  const demo = mintDemoActivationCode(`${orderId}:${input.seed}`);
  const totalCents = item.priceCents * qty;

  const persist = {
    orderId,
    region: item.region,
    planName: item.name,
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
      offerId: item.id,
      quantity: qty,
      priceCents: item.priceCents,
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
      item: SandboxCatalogItem;
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
}): Promise<
  | { ok: true; order: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const built = buildSandboxOrderPayload({
    offerId: input.offerId,
    quantity: input.quantity,
    seed: input.apiKey,
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
