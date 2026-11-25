import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  persistSandboxOrderFromApi,
  sandboxError,
  sandboxJson,
  sandboxOrdersListResponse,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxOrderDetailPayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";
import { SANDBOX_SITE_ORIGIN } from "@/app/lib/domain/appDomain";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/orders — paginated Neon SandboxOrder list. */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  const pageRaw = req.nextUrl.searchParams.get("page");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const page = pageRaw ? Number(pageRaw) : 1;
  const limit = limitRaw ? Number(limitRaw) : 50;
  if (pageRaw && (!Number.isInteger(page) || page < 1)) {
    return sandboxError(400, "Validation error", "page must be a positive integer.");
  }
  if (limitRaw && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return sandboxError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 100."
    );
  }
  return sandboxOrdersListResponse(auth.partnerId, { page, limit });
}

/** POST /api/sandbox/v1/orders — simulated eSIM order (no VeSIM). */
export async function POST(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return sandboxError(400, "Validation error", "Invalid JSON body.");
  }

  const offerId = String(body.offerId ?? "").trim();
  if (!offerId) {
    return sandboxError(400, "Validation error", "offerId is required.");
  }

  const quantityRaw = body.quantity;
  const quantity =
    quantityRaw === undefined || quantityRaw === null
      ? 1
      : Number(quantityRaw);

  const result = await persistSandboxOrderFromApi({
    partnerId: auth.partnerId,
    offerId,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    apiKey: auth.apiKey,
  });
  if (!result.ok) return result.response;

  const orderId = String(
    (result.order as { orderId?: string }).orderId ?? ""
  ).trim();
  const detail = orderId
    ? await buildSandboxOrderDetailPayload(auth.partnerId, orderId)
    : null;

  const order = detail?.order ?? {
    ...result.order,
    lpa: (result.order as { activationCode?: string }).activationCode ?? null,
    qrUrl: orderId
      ? `${SANDBOX_SITE_ORIGIN}/sandbox/orders/${encodeURIComponent(orderId)}`
      : null,
    qrCodeUrl: orderId
      ? `${SANDBOX_SITE_ORIGIN}/sandbox/orders/${encodeURIComponent(orderId)}`
      : null,
    shareUrl: orderId
      ? `${SANDBOX_SITE_ORIGIN}/sandbox/share/preview?orderId=${encodeURIComponent(orderId)}`
      : null,
  };

  return sandboxJson(
    {
      success: true,
      sandbox: true,
      environment: "sandbox",
      order,
    },
    201
  );
}
